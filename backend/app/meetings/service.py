import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
import asyncio
from fastapi import HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.workspaces.service import get_workspace_for_member
from app.workspaces.models import WorkspaceRoleEnum
from app.workspaces.repository import get_members as get_workspace_members
from app.projects.repository import get_project
from app.users.models import User
from app.tasks.schemas import TaskCreate
from app.tasks import service as task_service
from app.calendar.schemas import CalendarEventCreate
from app.calendar import service as calendar_service

from . import repository as repo
from .models import (
    Meeting,
    MeetingParticipant,
    TranscriptSegment,
    MeetingAISummary,
    MeetingSuggestedItem,
    MeetingStatusEnum,
    MeetingRoleEnum,
    TranscriptStatusEnum,
    ProcessingStatusEnum,
    SuggestionItemTypeEnum,
    SuggestionStatusEnum,
)
from .schemas import (
    MeetingCreate,
    MeetingUpdate,
    MeetingRead,
    MeetingJoinResponse,
    MeetingParticipantRead,
    TranscriptSegmentCreate,
    TranscriptSegmentRead,
    MeetingAISummaryRead,
    MeetingSuggestedItemRead,
    SuggestionUpdate,
    SuggestionApproveRequest,
    BulkApproveRequest,
)
from .livekit_service import generate_meeting_code, create_livekit_token
from .ai_extraction import analyze_meeting_transcript, compute_transcript_hash
from app.core.config import settings
from .transcription_service import transcribe_audio_payload
from .transcription_queue import transcription_queue

logger = logging.getLogger("ai_productivity_platform.meetings.service")


def _enrich_meeting_read(db: Session, meeting: Meeting) -> MeetingRead:
    host_name = meeting.host.name if meeting.host else None
    project_name = meeting.project.name if meeting.project else None
    count = len(meeting.participants) if meeting.participants else 0

    return MeetingRead(
        id=meeting.id,
        workspace_id=meeting.workspace_id,
        project_id=meeting.project_id,
        title=meeting.title,
        description=meeting.description,
        host_user_id=meeting.host_user_id,
        status=meeting.status,
        scheduled_start=meeting.scheduled_start,
        scheduled_end=meeting.scheduled_end,
        actual_start=meeting.actual_start,
        actual_end=meeting.actual_end,
        meeting_code=meeting.meeting_code,
        livekit_room_name=meeting.livekit_room_name,
        recording_consent=meeting.recording_consent,
        transcript_status=meeting.transcript_status,
        created_at=meeting.created_at,
        updated_at=meeting.updated_at,
        host_name=host_name,
        project_name=project_name,
        participant_count=count,
    )


def create_meeting(
    db: Session,
    workspace_id: str,
    user_id: str,
    data: MeetingCreate,
) -> MeetingRead:
    get_workspace_for_member(db, workspace_id, user_id)

    if data.project_id:
        project = get_project(db, data.project_id)
        if not project or project.workspace_id != workspace_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "PROJECT_NOT_FOUND", "message": "Project not found in this workspace"}},
            )

    # Generate unique meeting code
    for _ in range(5):
        code = generate_meeting_code()
        if not repo.get_meeting_by_code(db, code):
            break
    else:
        code = f"mtg-{uuid.uuid4().hex[:8]}"

    livekit_room = f"room-{code}"
    meeting = repo.create_meeting(
        db=db,
        workspace_id=workspace_id,
        host_user_id=user_id,
        data=data,
        meeting_code=code,
        livekit_room_name=livekit_room,
    )
    return _enrich_meeting_read(db, meeting)


def list_workspace_meetings(
    db: Session,
    workspace_id: str,
    user_id: str,
    status_filter: Optional[MeetingStatusEnum] = None,
    project_id: Optional[str] = None,
) -> List[MeetingRead]:
    get_workspace_for_member(db, workspace_id, user_id)
    meetings = repo.get_meetings_by_workspace(db, workspace_id, status=status_filter, project_id=project_id)
    return [_enrich_meeting_read(db, m) for m in meetings]


def get_meeting_for_member(
    db: Session,
    meeting_id: str,
    user_id: str,
) -> tuple[Meeting, Any]:
    meeting = repo.get_meeting(db, meeting_id)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "MEETING_NOT_FOUND", "message": "Meeting not found"}},
        )
    workspace, membership = get_workspace_for_member(db, meeting.workspace_id, user_id)
    return meeting, membership


def get_meeting_detail(
    db: Session,
    meeting_id: str,
    user_id: str,
) -> MeetingRead:
    meeting, _ = get_meeting_for_member(db, meeting_id, user_id)
    return _enrich_meeting_read(db, meeting)


def join_meeting(
    db: Session,
    meeting_id: str,
    current_user: User,
) -> MeetingJoinResponse:
    meeting, membership = get_meeting_for_member(db, meeting_id, current_user.id)

    if meeting.status in (MeetingStatusEnum.ENDED, MeetingStatusEnum.CANCELLED):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "MEETING_INACTIVE", "message": f"This meeting has already {meeting.status.value.lower()}"}},
        )

    is_host = meeting.host_user_id == current_user.id
    role = MeetingRoleEnum.HOST if is_host else MeetingRoleEnum.PARTICIPANT

    now = datetime.now(timezone.utc)
    if meeting.status == MeetingStatusEnum.SCHEDULED:
        meeting.status = MeetingStatusEnum.ACTIVE
        meeting.actual_start = now
        db.commit()

    repo.add_or_update_participant(db, meeting.id, current_user.id, role=role, joined=True)

    token, livekit_url = create_livekit_token(
        room_name=meeting.livekit_room_name,
        user_id=current_user.id,
        user_name=current_user.name or current_user.email,
        is_host=is_host,
    )

    return MeetingJoinResponse(
        meeting=_enrich_meeting_read(db, meeting),
        livekit_token=token,
        livekit_url=livekit_url,
        is_host=is_host,
    )


def join_by_code(
    db: Session,
    meeting_code: str,
    current_user: User,
) -> MeetingJoinResponse:
    meeting = repo.get_meeting_by_code(db, meeting_code)
    if not meeting:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "MEETING_NOT_FOUND", "message": "Invalid meeting code"}},
        )
    return join_meeting(db, meeting.id, current_user)


def leave_meeting(
    db: Session,
    meeting_id: str,
    user_id: str,
) -> None:
    meeting, _ = get_meeting_for_member(db, meeting_id, user_id)
    repo.record_participant_leave(db, meeting.id, user_id)


def get_meeting_participants(
    db: Session,
    meeting_id: str,
    user_id: str,
) -> List[MeetingParticipantRead]:
    meeting, _ = get_meeting_for_member(db, meeting_id, user_id)
    participants = repo.get_meeting_participants(db, meeting.id)
    result = []
    for p in participants:
        user_name = p.user.name if p.user else None
        user_email = p.user.email if p.user else None
        result.append(
            MeetingParticipantRead(
                id=p.id,
                meeting_id=p.meeting_id,
                user_id=p.user_id,
                role=p.role,
                joined_at=p.joined_at,
                left_at=p.left_at,
                consent_given=p.consent_given,
                user_name=user_name,
                user_email=user_email,
            )
        )
    return result


async def execute_post_meeting_pipeline(meeting_id: str, user_id: str):
    """
    Durable post-meeting background processing job executing in four stages:
    Stage 1: Processing audio - Flushes remaining audio chunks in the transcription queue.
    Stage 2: Generating summary - Analyzes transcript discussion, key decisions, and context via LLM.
    Stage 3: Preparing tasks - Extracts reviewable task and calendar suggestions matching workspace members.
    Stage 4: Ready for review - Marks summary and suggestions ready.
    """
    from app.core.database import SessionLocal

    # Stage 1: Processing audio
    with SessionLocal() as db:
        meeting = repo.get_meeting(db, meeting_id)
        if not meeting:
            return
        repo.save_or_update_summary(
            db=db,
            meeting_id=meeting_id,
            summary_text="Post-meeting AI pipeline initiated. Transcribing remaining audio...",
            decisions=[],
            status=ProcessingStatusEnum.PROCESSING,
            error="STAGE:Processing audio",
        )

    try:
        flush_info = await transcription_queue.flush_meeting(meeting_id, timeout=45.0)
        logger.info("Meeting %s audio flush completed: %s", meeting_id, flush_info)
    except Exception as flush_err:
        logger.warning("Audio flush error for meeting %s: %s", meeting_id, flush_err)

    # Stage 2: Generating summary
    with SessionLocal() as db:
        meeting = repo.get_meeting(db, meeting_id)
        if not meeting:
            return
        segments = repo.get_transcript_segments(db, meeting_id)
        if not segments:
            repo.save_or_update_summary(
                db=db,
                meeting_id=meeting_id,
                summary_text="No substantive discussion or transcript recorded.",
                decisions=[],
                status=ProcessingStatusEnum.READY,
                error=None,
            )
            return

        repo.save_or_update_summary(
            db=db,
            meeting_id=meeting_id,
            summary_text="Generating executive summary and analyzing discussion points...",
            decisions=[],
            status=ProcessingStatusEnum.PROCESSING,
            error="STAGE:Generating summary",
        )

        memberships = get_workspace_members(db, meeting.workspace_id)
        member_directory = []
        member_name_map = {}
        for m in memberships:
            u = db.query(User).filter(User.id == m.user_id).first()
            if u:
                member_directory.append({"id": u.id, "name": u.name or u.email, "email": u.email})
                if u.name:
                    member_name_map[u.name.lower()] = u.id
                member_name_map[u.email.lower()] = u.id

        transcript_hash = compute_transcript_hash(segments)
        existing_summary = repo.get_ai_summary(db, meeting.id)
        if (
            existing_summary
            and existing_summary.idempotency_key == transcript_hash
            and existing_summary.processing_status == ProcessingStatusEnum.READY
        ):
            logger.info("Meeting %s already has completed analysis matching transcript hash. Skipping redundant LLM call.", meeting_id)
            return

    # Call LLM analysis
    try:
        intel = analyze_meeting_transcript(meeting, segments, member_directory)
    except Exception as llm_err:
        logger.error("LLM meeting analysis failed for %s: %s", meeting_id, llm_err, exc_info=True)
        with SessionLocal() as db:
            repo.save_or_update_summary(
                db=db,
                meeting_id=meeting_id,
                summary_text=f"Meeting discussion regarding '{meeting.title}'. AI processing error: {str(llm_err)}",
                decisions=[],
                status=ProcessingStatusEnum.FAILED,
                error=f"Needs retry: {str(llm_err)}",
            )
        return

    # Stage 3: Preparing tasks
    with SessionLocal() as db:
        repo.save_or_update_summary(
            db=db,
            meeting_id=meeting_id,
            summary_text=intel.summary,
            decisions=intel.decisions,
            status=ProcessingStatusEnum.PROCESSING,
            error="STAGE:Preparing tasks",
        )

        summary_record = repo.get_ai_summary(db, meeting_id)
        suggested_items_to_save = []
        for t in intel.tasks:
            assignee_id = None
            if t.suggested_assignee_name:
                norm = t.suggested_assignee_name.strip().lower()
                assignee_id = member_name_map.get(norm)
                if not assignee_id:
                    for name_key, uid in member_name_map.items():
                        if name_key in norm or norm in name_key:
                            assignee_id = uid
                            break

            due_date = None
            if t.suggested_due_date:
                try:
                    due_date = datetime.fromisoformat(t.suggested_due_date.replace("Z", "+00:00"))
                except Exception:
                    due_date = None

            suggested_items_to_save.append({
                "item_type": SuggestionItemTypeEnum.TASK,
                "title": t.title,
                "description": t.description,
                "suggested_assignee_id": assignee_id,
                "suggested_due_date": due_date,
                "suggested_priority": t.suggested_priority or "MEDIUM",
                "evidence_text": t.evidence_text,
                "is_explicit_commitment": t.is_explicit_commitment,
            })

        for ev in intel.calendar_events:
            start_time = None
            end_time = None
            if ev.suggested_start_time:
                try:
                    start_time = datetime.fromisoformat(ev.suggested_start_time.replace("Z", "+00:00"))
                except Exception:
                    start_time = None
            if ev.suggested_end_time:
                try:
                    end_time = datetime.fromisoformat(ev.suggested_end_time.replace("Z", "+00:00"))
                except Exception:
                    end_time = None

            suggested_items_to_save.append({
                "item_type": SuggestionItemTypeEnum.CALENDAR_EVENT,
                "title": ev.title,
                "description": ev.description,
                "suggested_start_time": start_time,
                "suggested_end_time": end_time,
                "evidence_text": ev.evidence_text,
                "is_explicit_commitment": True,
            })

        repo.save_suggested_items(db, meeting_id, summary_record.id if summary_record else None, suggested_items_to_save)

        # Stage 4: Ready for review
        repo.save_or_update_summary(
            db=db,
            meeting_id=meeting_id,
            summary_text=intel.summary,
            decisions=intel.decisions,
            idempotency_key=transcript_hash,
            status=ProcessingStatusEnum.READY,
            error=None,
        )
        logger.info("Meeting %s post-processing successfully finished.", meeting_id)


async def end_meeting(
    db: Session,
    meeting_id: str,
    user_id: str,
    background_tasks: Optional[BackgroundTasks] = None,
) -> MeetingRead:
    meeting, membership = get_meeting_for_member(db, meeting_id, user_id)

    is_host = meeting.host_user_id == user_id
    is_admin = membership.role in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN)
    if not (is_host or is_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Only the host or workspace admin can end this meeting"}},
        )

    meeting.status = MeetingStatusEnum.ENDED
    meeting.actual_end = datetime.now(timezone.utc)

    # Mark left_at for all participants who joined and haven't recorded departure
    participants = repo.get_meeting_participants(db, meeting.id)
    for p in participants:
        if p.joined_at and not p.left_at:
            p.left_at = meeting.actual_end

    # Initialize persisted summary status to PROCESSING
    repo.save_or_update_summary(
        db=db,
        meeting_id=meeting.id,
        summary_text="Post-meeting AI pipeline initiated. Transcribing remaining audio...",
        decisions=[],
        status=ProcessingStatusEnum.PROCESSING,
        error="STAGE:Processing audio",
    )
    db.commit()

    if background_tasks:
        background_tasks.add_task(execute_post_meeting_pipeline, meeting.id, user_id)
    else:
        await execute_post_meeting_pipeline(meeting.id, user_id)

    db.refresh(meeting)
    return _enrich_meeting_read(db, meeting)


def record_consent(
    db: Session,
    meeting_id: str,
    user_id: str,
    consent_given: bool,
) -> None:
    meeting, _ = get_meeting_for_member(db, meeting_id, user_id)
    participant = repo.get_participant(db, meeting.id, user_id)
    if participant:
        participant.consent_given = consent_given
    if consent_given:
        meeting.recording_consent = True
    db.commit()


async def ingest_meeting_audio(
    db: Session,
    meeting_id: str,
    user_id: str,
    audio_bytes: bytes,
    content_type: str = "audio/webm",
    start_time_offset_ms: int = 0,
    speaker_name: Optional[str] = None,
    participant_id: Optional[str] = None,
    wait_for_completion: bool = True,
) -> List[TranscriptSegmentRead]:
    """
    Ingest, enqueue, and transcribe raw audio payload using Groq Whisper, associating segments
    with the meeting and authenticated participant via the resilient background queue.
    """
    # 1. Authorization
    meeting, membership = get_meeting_for_member(db, meeting_id, user_id)

    # 2. Recording consent verification
    if not meeting.recording_consent:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "RECORDING_NOT_CONSENTED", "message": "Recording and transcription are disabled for this meeting."}},
        )

    # Auto-record consent if meeting has consent enabled and participant uploads audio
    participant = repo.get_participant(db, meeting.id, user_id)
    if participant and not participant.consent_given:
        participant.consent_given = True
        db.commit()

    # 3. Handle empty/negligible audio payload
    if not audio_bytes or len(audio_bytes) < 100:
        return []

    # 4. Check payload size against maximum allowed upload size
    if len(audio_bytes) > settings.MAX_UPLOAD_SIZE:
        status_code = getattr(status, "HTTP_413_CONTENT_TOO_LARGE", 413)
        raise HTTPException(
            status_code=status_code,
            detail={
                "error": {
                    "code": "AUDIO_TOO_LARGE",
                    "message": f"Audio chunk exceeds maximum permitted size of {settings.MAX_UPLOAD_SIZE // (1024 * 1024)}MB.",
                }
            },
        )

    # 5. Resolve participant attribution per Feature 1
    # Never assign a statement to a participant based only on assumptions.
    # If source track cannot be identified, mark the speaker as unknown.
    resolved_speaker_user_id = user_id
    if participant_id:
        p = repo.get_participant(db, meeting.id, participant_id)
        if not p:
            p = db.query(MeetingParticipant).filter(
                MeetingParticipant.meeting_id == meeting.id,
                MeetingParticipant.user_id == participant_id,
            ).first()

        if p:
            resolved_speaker_user_id = p.user_id
            target_user = db.query(User).filter(User.id == p.user_id).first()
            resolved_speaker = speaker_name or (target_user.name if target_user and target_user.name else (target_user.email if target_user else "Participant"))
        else:
            resolved_speaker_user_id = None
            resolved_speaker = "Unknown Speaker"
    else:
        target_user = db.query(User).filter(User.id == user_id).first()
        resolved_speaker = speaker_name or (target_user.name if target_user and target_user.name else (target_user.email if target_user else "Participant"))

    # 6. Enqueue into resilient background transcription queue
    try:
        job = await transcription_queue.enqueue(
            meeting_id=meeting.id,
            user_id=resolved_speaker_user_id,
            speaker_name=resolved_speaker,
            audio_bytes=audio_bytes,
            content_type=content_type,
            start_time_offset_ms=start_time_offset_ms,
            wait_for_completion=wait_for_completion,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Failed to enqueue audio job for meeting {meeting_id}: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"error": {"code": "TRANSCRIPTION_PROVIDER_ERROR", "message": f"Failed to transcribe meeting audio via Groq Whisper: {str(exc)}"}},
        )

    if job.status == "FAILED":
        err_msg = job.error_message or "Failed to transcribe meeting audio via Groq Whisper"
        # Determine status code based on error message
        if "rate limit" in err_msg.lower():
            err_code = status.HTTP_429_TOO_MANY_REQUESTS
            err_type = "TRANSCRIPTION_RATE_LIMITED"
        elif "missing groq_api_key" in err_msg.lower() or "not configured" in err_msg.lower():
            err_code = status.HTTP_503_SERVICE_UNAVAILABLE
            err_type = "TRANSCRIPTION_NOT_CONFIGURED"
        elif "unsupported audio format" in err_msg.lower():
            err_code = status.HTTP_400_BAD_REQUEST
            err_type = "UNSUPPORTED_AUDIO_FORMAT"
        else:
            err_code = status.HTTP_502_BAD_GATEWAY
            err_type = "TRANSCRIPTION_PROVIDER_ERROR"

        raise HTTPException(
            status_code=err_code,
            detail={"error": {"code": err_type, "message": err_msg}},
        )

    return [
        TranscriptSegmentRead(
            id=seg["id"],
            meeting_id=seg["meeting_id"],
            speaker_user_id=seg.get("speaker_user_id"),
            participant_id=seg.get("participant_id") or seg.get("speaker_user_id"),
            speaker_name=seg.get("speaker_name") or "Unknown Speaker",
            content=seg["content"],
            start_time_ms=seg["start_time_ms"],
            end_time_ms=seg["end_time_ms"],
            segment_index=seg["segment_index"],
            processing_status=seg.get("processing_status", "COMPLETED"),
            created_at=seg["created_at"],
        )
        for seg in job.result_segments
    ]


def get_meeting_transcription_queue_status(
    db: Session,
    meeting_id: str,
    user_id: str,
) -> Dict[str, Any]:
    get_meeting_for_member(db, meeting_id, user_id)
    return transcription_queue.get_meeting_status(meeting_id)


async def retry_failed_meeting_batches(
    db: Session,
    meeting_id: str,
    user_id: str,
) -> Dict[str, Any]:
    get_meeting_for_member(db, meeting_id, user_id)
    re_enqueued = await transcription_queue.retry_failed_batches(meeting_id)
    return {"retried_count": len(re_enqueued), "batch_ids": re_enqueued}


# Transcript operations
def ingest_transcript_segments(
    db: Session,
    meeting_id: str,
    user_id: str,
    segments_data: List[TranscriptSegmentCreate],
) -> List[TranscriptSegmentRead]:
    meeting, _ = get_meeting_for_member(db, meeting_id, user_id)

    formatted = [
        {
            "speaker_user_id": s.speaker_user_id,
            "speaker_name": s.speaker_name,
            "content": s.content,
            "start_time_ms": s.start_time_ms,
            "end_time_ms": s.end_time_ms,
            "segment_index": s.segment_index if s.segment_index is not None else idx,
        }
        for idx, s in enumerate(segments_data)
    ]

    saved = repo.save_transcript_segments(db, meeting.id, formatted)
    meeting.transcript_status = TranscriptStatusEnum.READY
    db.commit()

    return [
        TranscriptSegmentRead(
            id=s.id,
            meeting_id=s.meeting_id,
            speaker_user_id=s.speaker_user_id,
            participant_id=s.speaker_user_id,
            speaker_name=s.speaker_name or "Unknown Speaker",
            content=s.content,
            start_time_ms=s.start_time_ms,
            end_time_ms=s.end_time_ms,
            segment_index=s.segment_index,
            processing_status="COMPLETED",
            created_at=s.created_at,
        )
        for s in saved
    ]


def get_meeting_transcript(
    db: Session,
    meeting_id: str,
    user_id: str,
) -> List[TranscriptSegmentRead]:
    meeting, _ = get_meeting_for_member(db, meeting_id, user_id)
    segments = repo.get_transcript_segments(db, meeting.id)
    return [
        TranscriptSegmentRead(
            id=s.id,
            meeting_id=s.meeting_id,
            speaker_user_id=s.speaker_user_id,
            participant_id=s.speaker_user_id,
            speaker_name=s.speaker_name or "Unknown Speaker",
            content=s.content,
            start_time_ms=s.start_time_ms,
            end_time_ms=s.end_time_ms,
            segment_index=s.segment_index,
            processing_status="COMPLETED",
            created_at=s.created_at,
        )
        for s in segments
    ]


def _enrich_summary_read(summary: MeetingAISummary) -> MeetingAISummaryRead:
    decisions = json.loads(summary.decisions_json or "[]")
    raw_error = summary.processing_error
    stage = None
    cleaned_error = raw_error

    if summary.processing_status == ProcessingStatusEnum.READY:
        stage = "Ready for review"
        cleaned_error = None
    elif summary.processing_status == ProcessingStatusEnum.FAILED:
        stage = "Needs retry"
    elif summary.processing_status == ProcessingStatusEnum.PROCESSING:
        if raw_error and raw_error.startswith("STAGE:"):
            stage = raw_error.replace("STAGE:", "").strip()
            cleaned_error = None
        else:
            stage = "Processing audio"
            cleaned_error = None

    return MeetingAISummaryRead(
        id=summary.id,
        meeting_id=summary.meeting_id,
        summary_text=summary.summary_text,
        decisions=decisions,
        processing_status=summary.processing_status,
        processing_error=cleaned_error,
        processing_stage=stage,
        created_at=summary.created_at,
        updated_at=summary.updated_at,
    )


# AI Analysis
def analyze_meeting(
    db: Session,
    meeting_id: str,
    user_id: str,
) -> MeetingAISummaryRead:
    meeting, _ = get_meeting_for_member(db, meeting_id, user_id)
    segments = repo.get_transcript_segments(db, meeting.id)

    if not segments:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "NO_TRANSCRIPT", "message": "No transcript available to analyze"}},
        )

    # Get workspace members for accurate assignee matching
    memberships = get_workspace_members(db, meeting.workspace_id)
    member_directory = []
    member_name_map = {}
    for m in memberships:
        u = db.query(User).filter(User.id == m.user_id).first()
        if u:
            member_directory.append({"id": u.id, "name": u.name or u.email, "email": u.email})
            if u.name:
                member_name_map[u.name.lower()] = u.id
            member_name_map[u.email.lower()] = u.id

    transcript_hash = compute_transcript_hash(segments)
    existing_summary = repo.get_ai_summary(db, meeting.id)

    # Check idempotency: if already analyzed with identical transcript, return existing
    if existing_summary and existing_summary.idempotency_key == transcript_hash and existing_summary.processing_status == ProcessingStatusEnum.READY:
        return _enrich_summary_read(existing_summary)

    # Execute LLM analysis
    intel = analyze_meeting_transcript(meeting, segments, member_directory)

    # Save summary
    summary_record = repo.save_or_update_summary(
        db=db,
        meeting_id=meeting.id,
        summary_text=intel.summary,
        decisions=intel.decisions,
        idempotency_key=transcript_hash,
        status=ProcessingStatusEnum.READY,
    )

    # Transform extracted tasks and calendar events into suggested items
    suggested_items_to_save = []
    for t in intel.tasks:
        assignee_id = None
        if t.suggested_assignee_name:
            norm = t.suggested_assignee_name.strip().lower()
            assignee_id = member_name_map.get(norm)
            if not assignee_id:
                # partial matching
                for name_key, uid in member_name_map.items():
                    if name_key in norm or norm in name_key:
                        assignee_id = uid
                        break

        due_date = None
        if t.suggested_due_date:
            try:
                due_date = datetime.fromisoformat(t.suggested_due_date.replace("Z", "+00:00"))
            except Exception:
                due_date = None

        suggested_items_to_save.append({
            "item_type": SuggestionItemTypeEnum.TASK,
            "title": t.title,
            "description": t.description,
            "suggested_assignee_id": assignee_id,
            "suggested_due_date": due_date,
            "suggested_priority": t.suggested_priority or "MEDIUM",
            "evidence_text": t.evidence_text,
            "is_explicit_commitment": t.is_explicit_commitment,
        })

    for ev in intel.calendar_events:
        start_time = None
        end_time = None
        if ev.suggested_start_time:
            try:
                start_time = datetime.fromisoformat(ev.suggested_start_time.replace("Z", "+00:00"))
            except Exception:
                start_time = None
        if ev.suggested_end_time:
            try:
                end_time = datetime.fromisoformat(ev.suggested_end_time.replace("Z", "+00:00"))
            except Exception:
                end_time = None

        suggested_items_to_save.append({
            "item_type": SuggestionItemTypeEnum.CALENDAR_EVENT,
            "title": ev.title,
            "description": ev.description,
            "suggested_start_time": start_time,
            "suggested_end_time": end_time,
            "evidence_text": ev.evidence_text,
            "is_explicit_commitment": True,
        })

    repo.save_suggested_items(db, meeting.id, summary_record.id, suggested_items_to_save)

    return _enrich_summary_read(summary_record)


def get_ai_summary(
    db: Session,
    meeting_id: str,
    user_id: str,
) -> Optional[MeetingAISummaryRead]:
    meeting, _ = get_meeting_for_member(db, meeting_id, user_id)
    summary = repo.get_ai_summary(db, meeting.id)
    if not summary:
        return None
    return _enrich_summary_read(summary)


def _enrich_suggestion_read(item: MeetingSuggestedItem) -> MeetingSuggestedItemRead:
    assignee_name = None
    if item.suggested_assignee:
        assignee_name = item.suggested_assignee.name or item.suggested_assignee.email

    return MeetingSuggestedItemRead(
        id=item.id,
        meeting_id=item.meeting_id,
        summary_id=item.summary_id,
        item_type=item.item_type,
        title=item.title,
        description=item.description,
        suggested_assignee_id=item.suggested_assignee_id,
        suggested_assignee_name=assignee_name,
        suggested_due_date=item.suggested_due_date,
        suggested_priority=item.suggested_priority,
        suggested_start_time=item.suggested_start_time,
        suggested_end_time=item.suggested_end_time,
        evidence_text=item.evidence_text,
        evidence_start_ms=item.evidence_start_ms,
        evidence_end_ms=item.evidence_end_ms,
        is_explicit_commitment=item.is_explicit_commitment,
        status=item.status,
        approved_task_id=item.approved_task_id,
        approved_event_id=item.approved_event_id,
        approved_by=item.approved_by,
        approved_at=item.approved_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def list_meeting_suggestions(
    db: Session,
    meeting_id: str,
    user_id: str,
    item_type: Optional[SuggestionItemTypeEnum] = None,
    status_filter: Optional[SuggestionStatusEnum] = None,
) -> List[MeetingSuggestedItemRead]:
    meeting, _ = get_meeting_for_member(db, meeting_id, user_id)
    items = repo.get_suggested_items(db, meeting.id, item_type=item_type, status=status_filter)
    return [_enrich_suggestion_read(it) for it in items]


def edit_suggestion(
    db: Session,
    suggestion_id: str,
    user_id: str,
    data: SuggestionUpdate,
) -> MeetingSuggestedItemRead:
    item = repo.get_suggested_item(db, suggestion_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "SUGGESTION_NOT_FOUND", "message": "Suggested item not found"}},
        )
    get_meeting_for_member(db, item.meeting_id, user_id)
    updated = repo.update_suggested_item(db, item, data)
    return _enrich_suggestion_read(updated)


def reject_suggestion(
    db: Session,
    suggestion_id: str,
    user_id: str,
) -> MeetingSuggestedItemRead:
    item = repo.get_suggested_item(db, suggestion_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "SUGGESTION_NOT_FOUND", "message": "Suggested item not found"}},
        )
    get_meeting_for_member(db, item.meeting_id, user_id)
    item.status = SuggestionStatusEnum.REJECTED
    db.commit()
    db.refresh(item)
    return _enrich_suggestion_read(item)


def approve_suggestion(
    db: Session,
    suggestion_id: str,
    user_id: str,
    data: SuggestionApproveRequest,
) -> MeetingSuggestedItemRead:
    item = repo.get_suggested_item(db, suggestion_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "SUGGESTION_NOT_FOUND", "message": "Suggested item not found"}},
        )
    meeting, _ = get_meeting_for_member(db, item.meeting_id, user_id)

    # Prevent duplicate approval
    if item.status == SuggestionStatusEnum.APPROVED:
        return _enrich_suggestion_read(item)

    now = datetime.now(timezone.utc)

    if item.item_type == SuggestionItemTypeEnum.TASK:
        target_project_id = data.target_project_id or meeting.project_id
        if not target_project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "PROJECT_REQUIRED", "message": "Target project_id is required to create a project task"}},
            )

        title = data.title or item.title
        description = data.description or item.description
        assignee_id = data.assignee_id or item.suggested_assignee_id
        due_date = data.due_date or item.suggested_due_date
        priority_val = data.priority or item.suggested_priority or "MEDIUM"

        created_task = task_service.create_task(
            db=db,
            project_id=target_project_id,
            user_id=user_id,
            data=TaskCreate(
                title=title,
                description=description,
                assignee_id=assignee_id,
                due_date=due_date,
                priority=priority_val,
            ),
        )

        item.approved_task_id = created_task.id
        item.status = SuggestionStatusEnum.APPROVED
        item.approved_by = user_id
        item.approved_at = now
        db.commit()
        db.refresh(item)

    elif item.item_type == SuggestionItemTypeEnum.CALENDAR_EVENT:
        title = data.title or item.title
        description = data.description or item.description
        start_time = data.start_time or item.suggested_start_time or now
        end_time = data.end_time or item.suggested_end_time or (start_time + datetime.timedelta(hours=1) if hasattr(start_time, "__add__") else now)

        created_event = calendar_service.create_event(
            db=db,
            workspace_id=meeting.workspace_id,
            user_id=user_id,
            data=CalendarEventCreate(
                title=title,
                description=description,
                start_time=start_time,
                end_time=end_time,
                event_type="MEETING_FOLLOWUP",
                project_id=meeting.project_id,
                meeting_id=meeting.id,
            ),
        )

        item.approved_event_id = created_event.id
        item.status = SuggestionStatusEnum.APPROVED
        item.approved_by = user_id
        item.approved_at = now
        db.commit()
        db.refresh(item)

    return _enrich_suggestion_read(item)


def bulk_approve_suggestions(
    db: Session,
    user_id: str,
    data: BulkApproveRequest,
) -> List[MeetingSuggestedItemRead]:
    approved_list = []
    for sid in data.suggestion_ids:
        try:
            req = SuggestionApproveRequest(target_project_id=data.target_project_id)
            approved = approve_suggestion(db, sid, user_id, req)
            approved_list.append(approved)
        except Exception:
            continue
    return approved_list
