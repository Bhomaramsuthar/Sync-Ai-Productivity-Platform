import enum
import uuid
from sqlalchemy import (
    Column,
    String,
    Text,
    DateTime,
    Boolean,
    Integer,
    Enum,
    ForeignKey,
    UniqueConstraint,
)
from typing import Optional
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class MeetingStatusEnum(str, enum.Enum):
    SCHEDULED = "SCHEDULED"
    LOBBY = "LOBBY"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    CANCELLED = "CANCELLED"


class MeetingRoleEnum(str, enum.Enum):
    HOST = "HOST"
    PARTICIPANT = "PARTICIPANT"


class TranscriptStatusEnum(str, enum.Enum):
    NONE = "NONE"
    RECORDING = "RECORDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class ProcessingStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    READY = "READY"
    FAILED = "FAILED"


class SuggestionItemTypeEnum(str, enum.Enum):
    TASK = "TASK"
    CALENDAR_EVENT = "CALENDAR_EVENT"


class SuggestionStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    EDITED = "EDITED"


class Meeting(Base):
    __tablename__ = "meetings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    host_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status = Column(Enum(MeetingStatusEnum), default=MeetingStatusEnum.SCHEDULED, nullable=False)
    scheduled_start = Column(DateTime(timezone=True), nullable=True)
    scheduled_end = Column(DateTime(timezone=True), nullable=True)
    actual_start = Column(DateTime(timezone=True), nullable=True)
    actual_end = Column(DateTime(timezone=True), nullable=True)
    meeting_code = Column(String(12), unique=True, index=True, nullable=False)
    livekit_room_name = Column(String(255), unique=True, nullable=False)
    recording_consent = Column(Boolean, default=False, nullable=False)
    transcript_status = Column(Enum(TranscriptStatusEnum), default=TranscriptStatusEnum.NONE, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    workspace = relationship("Workspace", foreign_keys=[workspace_id])
    project = relationship("Project", foreign_keys=[project_id])
    host = relationship("User", foreign_keys=[host_user_id])
    participants = relationship("MeetingParticipant", back_populates="meeting", cascade="all, delete-orphan")
    transcript_segments = relationship(
        "TranscriptSegment",
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="TranscriptSegment.segment_index",
    )
    summary = relationship("MeetingAISummary", back_populates="meeting", uselist=False, cascade="all, delete-orphan")
    suggestions = relationship("MeetingSuggestedItem", back_populates="meeting", cascade="all, delete-orphan")


class MeetingParticipant(Base):
    __tablename__ = "meeting_participants"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    meeting_id = Column(String(36), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(Enum(MeetingRoleEnum), default=MeetingRoleEnum.PARTICIPANT, nullable=False)
    joined_at = Column(DateTime(timezone=True), nullable=True)
    left_at = Column(DateTime(timezone=True), nullable=True)
    consent_given = Column(Boolean, default=False, nullable=False)

    meeting = relationship("Meeting", back_populates="participants")
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("meeting_id", "user_id", name="uq_meeting_user"),
    )


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    meeting_id = Column(String(36), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    speaker_user_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    speaker_name = Column(String(255), nullable=True)
    content = Column(Text, nullable=False)
    start_time_ms = Column(Integer, default=0, nullable=False)
    end_time_ms = Column(Integer, default=0, nullable=False)
    segment_index = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    meeting = relationship("Meeting", back_populates="transcript_segments")
    speaker = relationship("User", foreign_keys=[speaker_user_id])

    @property
    def participant_id(self) -> Optional[str]:
        return self.speaker_user_id

    @property
    def processing_status(self) -> str:
        return "COMPLETED"


class MeetingAISummary(Base):
    __tablename__ = "meeting_ai_summaries"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    meeting_id = Column(String(36), ForeignKey("meetings.id", ondelete="CASCADE"), unique=True, nullable=False)
    summary_text = Column(Text, nullable=False)
    decisions_json = Column(Text, nullable=True)  # JSON-encoded array of decision strings
    processing_status = Column(Enum(ProcessingStatusEnum), default=ProcessingStatusEnum.READY, nullable=False)
    processing_error = Column(Text, nullable=True)
    idempotency_key = Column(String(64), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    meeting = relationship("Meeting", back_populates="summary")
    suggestions = relationship("MeetingSuggestedItem", back_populates="summary", cascade="all, delete-orphan")


class MeetingSuggestedItem(Base):
    __tablename__ = "meeting_suggested_items"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    meeting_id = Column(String(36), ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False)
    summary_id = Column(String(36), ForeignKey("meeting_ai_summaries.id", ondelete="CASCADE"), nullable=True)
    item_type = Column(Enum(SuggestionItemTypeEnum), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    suggested_assignee_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    suggested_due_date = Column(DateTime(timezone=True), nullable=True)
    suggested_priority = Column(String(20), nullable=True)  # LOW, MEDIUM, HIGH, URGENT
    suggested_start_time = Column(DateTime(timezone=True), nullable=True)
    suggested_end_time = Column(DateTime(timezone=True), nullable=True)
    evidence_text = Column(Text, nullable=True)
    evidence_start_ms = Column(Integer, nullable=True)
    evidence_end_ms = Column(Integer, nullable=True)
    is_explicit_commitment = Column(Boolean, default=False, nullable=False)
    status = Column(Enum(SuggestionStatusEnum), default=SuggestionStatusEnum.PENDING, nullable=False)
    approved_task_id = Column(String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    approved_event_id = Column(String(36), ForeignKey("calendar_events.id", ondelete="SET NULL"), nullable=True)
    approved_by = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    meeting = relationship("Meeting", back_populates="suggestions")
    summary = relationship("MeetingAISummary", back_populates="suggestions")
    suggested_assignee = relationship("User", foreign_keys=[suggested_assignee_id])
    approver = relationship("User", foreign_keys=[approved_by])
    approved_task = relationship("Task", foreign_keys=[approved_task_id])
    approved_event = relationship("CalendarEvent", foreign_keys=[approved_event_id])
