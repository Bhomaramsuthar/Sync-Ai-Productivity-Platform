from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field
from .models import (
    MeetingStatusEnum,
    MeetingRoleEnum,
    TranscriptStatusEnum,
    ProcessingStatusEnum,
    SuggestionItemTypeEnum,
    SuggestionStatusEnum,
)


class MeetingBase(BaseModel):
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    project_id: Optional[str] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    recording_consent: Optional[bool] = False


class MeetingCreate(MeetingBase):
    pass


class MeetingUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    status: Optional[MeetingStatusEnum] = None
    scheduled_start: Optional[datetime] = None
    scheduled_end: Optional[datetime] = None
    recording_consent: Optional[bool] = None
    project_id: Optional[str] = None


class MeetingParticipantRead(BaseModel):
    id: str
    meeting_id: str
    user_id: str
    role: MeetingRoleEnum
    joined_at: Optional[datetime] = None
    left_at: Optional[datetime] = None
    consent_given: bool = False
    user_name: Optional[str] = None
    user_email: Optional[str] = None

    class Config:
        from_attributes = True


class MeetingRead(MeetingBase):
    id: str
    workspace_id: str
    host_user_id: Optional[str] = None
    status: MeetingStatusEnum
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    meeting_code: str
    livekit_room_name: str
    recording_consent: bool
    transcript_status: TranscriptStatusEnum
    created_at: datetime
    updated_at: Optional[datetime] = None
    host_name: Optional[str] = None
    project_name: Optional[str] = None
    participant_count: Optional[int] = 0

    class Config:
        from_attributes = True


class MeetingJoinResponse(BaseModel):
    meeting: MeetingRead
    livekit_token: str
    livekit_url: str
    is_host: bool


class TranscriptSegmentCreate(BaseModel):
    content: str
    speaker_name: Optional[str] = None
    speaker_user_id: Optional[str] = None
    participant_id: Optional[str] = None
    start_time_ms: int = 0
    end_time_ms: int = 0
    segment_index: Optional[int] = 0


class TranscriptSegmentRead(BaseModel):
    id: str
    meeting_id: str
    speaker_user_id: Optional[str] = None
    participant_id: Optional[str] = None
    speaker_name: Optional[str] = None
    content: str
    start_time_ms: int
    end_time_ms: int
    segment_index: int
    processing_status: Optional[str] = "COMPLETED"
    created_at: datetime

    class Config:
        from_attributes = True


class MeetingAISummaryRead(BaseModel):
    id: str
    meeting_id: str
    summary_text: str
    decisions: List[str] = []
    processing_status: ProcessingStatusEnum
    processing_error: Optional[str] = None
    processing_stage: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MeetingSuggestedItemRead(BaseModel):
    id: str
    meeting_id: str
    summary_id: Optional[str] = None
    item_type: SuggestionItemTypeEnum
    title: str
    description: Optional[str] = None
    suggested_assignee_id: Optional[str] = None
    suggested_assignee_name: Optional[str] = None
    suggested_due_date: Optional[datetime] = None
    suggested_priority: Optional[str] = None
    suggested_start_time: Optional[datetime] = None
    suggested_end_time: Optional[datetime] = None
    evidence_text: Optional[str] = None
    evidence_start_ms: Optional[int] = None
    evidence_end_ms: Optional[int] = None
    is_explicit_commitment: bool = False
    status: SuggestionStatusEnum
    approved_task_id: Optional[str] = None
    approved_event_id: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SuggestionUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    suggested_assignee_id: Optional[str] = None
    suggested_due_date: Optional[datetime] = None
    suggested_priority: Optional[str] = None
    suggested_start_time: Optional[datetime] = None
    suggested_end_time: Optional[datetime] = None


class SuggestionApproveRequest(BaseModel):
    target_project_id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None


class BulkApproveRequest(BaseModel):
    suggestion_ids: List[str]
    target_project_id: Optional[str] = None


class ConsentRequest(BaseModel):
    consent_given: bool


class ManualTranscriptIngestRequest(BaseModel):
    segments: List[TranscriptSegmentCreate]
