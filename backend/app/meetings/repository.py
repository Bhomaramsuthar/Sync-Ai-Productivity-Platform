import json
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import or_

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
from .schemas import MeetingCreate, MeetingUpdate, SuggestionUpdate


def create_meeting(
    db: Session,
    workspace_id: str,
    host_user_id: str,
    data: MeetingCreate,
    meeting_code: str,
    livekit_room_name: str,
) -> Meeting:
    meeting = Meeting(
        workspace_id=workspace_id,
        project_id=data.project_id,
        host_user_id=host_user_id,
        title=data.title,
        description=data.description,
        status=MeetingStatusEnum.SCHEDULED,
        scheduled_start=data.scheduled_start,
        scheduled_end=data.scheduled_end,
        meeting_code=meeting_code,
        livekit_room_name=livekit_room_name,
        recording_consent=data.recording_consent or False,
        transcript_status=TranscriptStatusEnum.NONE,
    )
    db.add(meeting)
    db.flush()

    # Automatically add host as HOST participant
    host_participant = MeetingParticipant(
        meeting_id=meeting.id,
        user_id=host_user_id,
        role=MeetingRoleEnum.HOST,
        consent_given=data.recording_consent or False,
    )
    db.add(host_participant)
    db.commit()
    db.refresh(meeting)
    return meeting


def get_meeting(db: Session, meeting_id: str) -> Optional[Meeting]:
    return db.query(Meeting).filter(Meeting.id == meeting_id).first()


def get_meeting_by_code(db: Session, meeting_code: str) -> Optional[Meeting]:
    return db.query(Meeting).filter(Meeting.meeting_code == meeting_code).first()


def get_meetings_by_workspace(
    db: Session,
    workspace_id: str,
    status: Optional[MeetingStatusEnum] = None,
    project_id: Optional[str] = None,
) -> List[Meeting]:
    query = db.query(Meeting).filter(Meeting.workspace_id == workspace_id)
    if status:
        query = query.filter(Meeting.status == status)
    if project_id:
        query = query.filter(Meeting.project_id == project_id)
    return query.order_by(Meeting.created_at.desc()).all()


def update_meeting(db: Session, meeting: Meeting, data: MeetingUpdate) -> Meeting:
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(meeting, key, value)
    db.commit()
    db.refresh(meeting)
    return meeting


def delete_meeting(db: Session, meeting: Meeting) -> None:
    db.delete(meeting)
    db.commit()


# Participant operations
def get_participant(db: Session, meeting_id: str, user_id: str) -> Optional[MeetingParticipant]:
    return (
        db.query(MeetingParticipant)
        .filter(MeetingParticipant.meeting_id == meeting_id, MeetingParticipant.user_id == user_id)
        .first()
    )


def add_or_update_participant(
    db: Session,
    meeting_id: str,
    user_id: str,
    role: MeetingRoleEnum = MeetingRoleEnum.PARTICIPANT,
    joined: bool = True,
) -> MeetingParticipant:
    participant = get_participant(db, meeting_id, user_id)
    now = datetime.now(timezone.utc)
    if not participant:
        participant = MeetingParticipant(
            meeting_id=meeting_id,
            user_id=user_id,
            role=role,
            joined_at=now if joined else None,
            left_at=None,
        )
        db.add(participant)
    else:
        participant.role = role
        if joined:
            if not participant.joined_at:
                participant.joined_at = now
            participant.left_at = None
    db.commit()
    db.refresh(participant)
    return participant


def record_participant_leave(db: Session, meeting_id: str, user_id: str) -> Optional[MeetingParticipant]:
    participant = get_participant(db, meeting_id, user_id)
    if participant:
        participant.left_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(participant)
    return participant


def get_meeting_participants(db: Session, meeting_id: str) -> List[MeetingParticipant]:
    return db.query(MeetingParticipant).filter(MeetingParticipant.meeting_id == meeting_id).all()


# Transcript segments
def save_transcript_segments(
    db: Session,
    meeting_id: str,
    segments_data: List[Dict[str, Any]],
) -> List[TranscriptSegment]:
    created = []
    for s in segments_data:
        seg = TranscriptSegment(
            meeting_id=meeting_id,
            speaker_user_id=s.get("speaker_user_id"),
            speaker_name=s.get("speaker_name"),
            content=s.get("content", ""),
            start_time_ms=s.get("start_time_ms", 0),
            end_time_ms=s.get("end_time_ms", 0),
            segment_index=s.get("segment_index", 0),
        )
        db.add(seg)
        created.append(seg)
    db.commit()
    return created


def get_transcript_segments(db: Session, meeting_id: str) -> List[TranscriptSegment]:
    return (
        db.query(TranscriptSegment)
        .filter(TranscriptSegment.meeting_id == meeting_id)
        .order_by(TranscriptSegment.segment_index.asc())
        .all()
    )


# AI Summary operations
def save_or_update_summary(
    db: Session,
    meeting_id: str,
    summary_text: str,
    decisions: List[str],
    idempotency_key: Optional[str] = None,
    status: ProcessingStatusEnum = ProcessingStatusEnum.READY,
    error: Optional[str] = None,
) -> MeetingAISummary:
    summary = db.query(MeetingAISummary).filter(MeetingAISummary.meeting_id == meeting_id).first()
    decisions_str = json.dumps(decisions)
    if not summary:
        summary = MeetingAISummary(
            meeting_id=meeting_id,
            summary_text=summary_text,
            decisions_json=decisions_str,
            processing_status=status,
            processing_error=error,
            idempotency_key=idempotency_key,
        )
        db.add(summary)
    else:
        summary.summary_text = summary_text
        summary.decisions_json = decisions_str
        summary.processing_status = status
        summary.processing_error = error
        summary.idempotency_key = idempotency_key
    db.commit()
    db.refresh(summary)
    return summary


def get_ai_summary(db: Session, meeting_id: str) -> Optional[MeetingAISummary]:
    return db.query(MeetingAISummary).filter(MeetingAISummary.meeting_id == meeting_id).first()


# Suggested items operations
def save_suggested_items(
    db: Session,
    meeting_id: str,
    summary_id: Optional[str],
    items: List[Dict[str, Any]],
) -> List[MeetingSuggestedItem]:
    existing_items = db.query(MeetingSuggestedItem).filter(MeetingSuggestedItem.meeting_id == meeting_id).all()
    existing_signatures = {(item.item_type, item.title.strip().lower()) for item in existing_items}

    created = []
    for item in items:
        norm_title = item["title"].strip().lower()
        if (item["item_type"], norm_title) in existing_signatures:
            continue

        sug = MeetingSuggestedItem(
            meeting_id=meeting_id,
            summary_id=summary_id,
            item_type=item["item_type"],
            title=item["title"],
            description=item.get("description"),
            suggested_assignee_id=item.get("suggested_assignee_id"),
            suggested_due_date=item.get("suggested_due_date"),
            suggested_priority=item.get("suggested_priority"),
            suggested_start_time=item.get("suggested_start_time"),
            suggested_end_time=item.get("suggested_end_time"),
            evidence_text=item.get("evidence_text"),
            evidence_start_ms=item.get("evidence_start_ms"),
            evidence_end_ms=item.get("evidence_end_ms"),
            is_explicit_commitment=item.get("is_explicit_commitment", False),
            status=SuggestionStatusEnum.PENDING,
        )
        db.add(sug)
        created.append(sug)
        existing_signatures.add((item["item_type"], norm_title))

    if created:
        db.commit()
    return created


def get_suggested_items(
    db: Session,
    meeting_id: str,
    item_type: Optional[SuggestionItemTypeEnum] = None,
    status: Optional[SuggestionStatusEnum] = None,
) -> List[MeetingSuggestedItem]:
    query = db.query(MeetingSuggestedItem).filter(MeetingSuggestedItem.meeting_id == meeting_id)
    if item_type:
        query = query.filter(MeetingSuggestedItem.item_type == item_type)
    if status:
        query = query.filter(MeetingSuggestedItem.status == status)
    return query.order_by(MeetingSuggestedItem.created_at.asc()).all()


def get_suggested_item(db: Session, item_id: str) -> Optional[MeetingSuggestedItem]:
    return db.query(MeetingSuggestedItem).filter(MeetingSuggestedItem.id == item_id).first()


def update_suggested_item(
    db: Session,
    item: MeetingSuggestedItem,
    data: SuggestionUpdate,
) -> MeetingSuggestedItem:
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(item, key, value)
    item.status = SuggestionStatusEnum.EDITED
    db.commit()
    db.refresh(item)
    return item
