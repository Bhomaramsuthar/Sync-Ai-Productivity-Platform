from typing import List, Optional
from fastapi import APIRouter, Depends, status, Query, UploadFile, File, Form, BackgroundTasks
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.users.models import User
from . import service
from .models import MeetingStatusEnum, SuggestionItemTypeEnum, SuggestionStatusEnum
from .schemas import (
    MeetingCreate,
    MeetingRead,
    MeetingJoinResponse,
    MeetingParticipantRead,
    TranscriptSegmentRead,
    MeetingAISummaryRead,
    MeetingSuggestedItemRead,
    SuggestionUpdate,
    SuggestionApproveRequest,
    BulkApproveRequest,
    ConsentRequest,
    ManualTranscriptIngestRequest,
)

router = APIRouter()


# Workspace-level meetings
@router.post(
    "/workspaces/{workspace_id}/meetings",
    response_model=MeetingRead,
    status_code=status.HTTP_201_CREATED,
)
def create_meeting(
    workspace_id: str,
    data: MeetingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.create_meeting(db, workspace_id, current_user.id, data)


@router.get(
    "/workspaces/{workspace_id}/meetings",
    response_model=List[MeetingRead],
)
def list_meetings(
    workspace_id: str,
    status: Optional[MeetingStatusEnum] = Query(None, description="Filter by meeting status"),
    project_id: Optional[str] = Query(None, description="Filter by project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.list_workspace_meetings(db, workspace_id, current_user.id, status, project_id)


# Meeting operations
@router.get(
    "/meetings/{meeting_id}",
    response_model=MeetingRead,
)
def get_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.get_meeting_detail(db, meeting_id, current_user.id)


@router.post(
    "/meetings/{meeting_id}/join",
    response_model=MeetingJoinResponse,
)
def join_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.join_meeting(db, meeting_id, current_user)


@router.post(
    "/meetings/join-by-code/{meeting_code}",
    response_model=MeetingJoinResponse,
)
def join_by_code(
    meeting_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.join_by_code(db, meeting_code, current_user)


@router.post(
    "/meetings/{meeting_id}/leave",
    status_code=status.HTTP_200_OK,
)
def leave_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.leave_meeting(db, meeting_id, current_user.id)
    return {"status": "ok"}


@router.get(
    "/meetings/{meeting_id}/participants",
    response_model=List[MeetingParticipantRead],
)
def get_participants(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.get_meeting_participants(db, meeting_id, current_user.id)


@router.post(
    "/meetings/{meeting_id}/end",
    response_model=MeetingRead,
)
async def end_meeting(
    meeting_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await service.end_meeting(db, meeting_id, current_user.id, background_tasks=background_tasks)


@router.post(
    "/meetings/{meeting_id}/consent",
    status_code=status.HTTP_200_OK,
)
def record_consent(
    meeting_id: str,
    data: ConsentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.record_consent(db, meeting_id, current_user.id, data.consent_given)
    return {"status": "ok", "consent_given": data.consent_given}


# Transcripts
@router.post(
    "/meetings/{meeting_id}/transcript",
    response_model=List[TranscriptSegmentRead],
    status_code=status.HTTP_201_CREATED,
)
def ingest_transcript(
    meeting_id: str,
    data: ManualTranscriptIngestRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.ingest_transcript_segments(db, meeting_id, current_user.id, data.segments)


@router.get(
    "/meetings/{meeting_id}/transcript",
    response_model=List[TranscriptSegmentRead],
)
def get_transcript(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.get_meeting_transcript(db, meeting_id, current_user.id)


@router.post(
    "/meetings/{meeting_id}/audio",
    response_model=List[TranscriptSegmentRead],
    status_code=status.HTTP_201_CREATED,
)
async def upload_meeting_audio(
    meeting_id: str,
    file: UploadFile = File(...),
    start_time_offset_ms: int = Form(0),
    speaker_name: Optional[str] = Form(None),
    participant_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    audio_bytes = await file.read()
    content_type = file.content_type or "audio/webm"
    return await service.ingest_meeting_audio(
        db=db,
        meeting_id=meeting_id,
        user_id=current_user.id,
        audio_bytes=audio_bytes,
        content_type=content_type,
        start_time_offset_ms=start_time_offset_ms,
        speaker_name=speaker_name,
        participant_id=participant_id,
    )


@router.get(
    "/meetings/{meeting_id}/transcription-queue",
)
def get_transcription_queue_status(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.get_meeting_transcription_queue_status(db, meeting_id, current_user.id)


@router.post(
    "/meetings/{meeting_id}/audio/retry-failed",
)
async def retry_failed_audio_batches(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return await service.retry_failed_meeting_batches(db, meeting_id, current_user.id)


# AI Summary and Intelligence
@router.post(
    "/meetings/{meeting_id}/analyze",
    response_model=MeetingAISummaryRead,
)
def analyze_meeting(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.analyze_meeting(db, meeting_id, current_user.id)


@router.get(
    "/meetings/{meeting_id}/summary",
    response_model=Optional[MeetingAISummaryRead],
)
def get_summary(
    meeting_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.get_ai_summary(db, meeting_id, current_user.id)


# Suggestions & Approvals
@router.get(
    "/meetings/{meeting_id}/suggestions",
    response_model=List[MeetingSuggestedItemRead],
)
def list_suggestions(
    meeting_id: str,
    item_type: Optional[SuggestionItemTypeEnum] = Query(None, description="Filter by item type"),
    status: Optional[SuggestionStatusEnum] = Query(None, description="Filter by status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.list_meeting_suggestions(db, meeting_id, current_user.id, item_type, status)


@router.patch(
    "/meetings/suggestions/{suggestion_id}",
    response_model=MeetingSuggestedItemRead,
)
def edit_suggestion(
    suggestion_id: str,
    data: SuggestionUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.edit_suggestion(db, suggestion_id, current_user.id, data)


@router.post(
    "/meetings/suggestions/{suggestion_id}/reject",
    response_model=MeetingSuggestedItemRead,
)
def reject_suggestion(
    suggestion_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.reject_suggestion(db, suggestion_id, current_user.id)


@router.post(
    "/meetings/suggestions/{suggestion_id}/approve",
    response_model=MeetingSuggestedItemRead,
)
def approve_suggestion(
    suggestion_id: str,
    data: SuggestionApproveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.approve_suggestion(db, suggestion_id, current_user.id, data)


@router.post(
    "/meetings/suggestions/bulk-approve",
    response_model=List[MeetingSuggestedItemRead],
)
def bulk_approve_suggestions(
    data: BulkApproveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.bulk_approve_suggestions(db, current_user.id, data)
