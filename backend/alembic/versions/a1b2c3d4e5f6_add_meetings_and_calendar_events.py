"""Add meetings and calendar events

Revision ID: a1b2c3d4e5f6
Revises: d81cbe4bdd6a
Create Date: 2026-10-20 19:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'd81cbe4bdd6a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Calendar Events
    op.create_table(
        'calendar_events',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('event_type', sa.String(length=50), server_default='GENERAL', nullable=False),
        sa.Column('meeting_id', sa.String(length=36), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_calendar_events_workspace_id'), 'calendar_events', ['workspace_id'], unique=False)
    op.create_index(op.f('ix_calendar_events_project_id'), 'calendar_events', ['project_id'], unique=False)
    op.create_index(op.f('ix_calendar_events_start_time'), 'calendar_events', ['start_time'], unique=False)

    # 2. Meetings
    op.create_table(
        'meetings',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('project_id', sa.String(length=36), nullable=True),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('host_user_id', sa.String(length=36), nullable=True),
        sa.Column(
            'status',
            sa.Enum('SCHEDULED', 'LOBBY', 'ACTIVE', 'ENDED', 'CANCELLED', name='meetingstatusenum'),
            server_default='SCHEDULED',
            nullable=False
        ),
        sa.Column('scheduled_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('scheduled_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_start', sa.DateTime(timezone=True), nullable=True),
        sa.Column('actual_end', sa.DateTime(timezone=True), nullable=True),
        sa.Column('meeting_code', sa.String(length=12), nullable=False),
        sa.Column('livekit_room_name', sa.String(length=255), nullable=False),
        sa.Column('recording_consent', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column(
            'transcript_status',
            sa.Enum('NONE', 'RECORDING', 'PROCESSING', 'READY', 'FAILED', name='transcriptstatusenum'),
            server_default='NONE',
            nullable=False
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['host_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('livekit_room_name'),
        sa.UniqueConstraint('meeting_code')
    )
    op.create_index(op.f('ix_meetings_meeting_code'), 'meetings', ['meeting_code'], unique=True)
    op.create_index(op.f('ix_meetings_workspace_id'), 'meetings', ['workspace_id'], unique=False)
    op.create_index(op.f('ix_meetings_project_id'), 'meetings', ['project_id'], unique=False)

    # 3. Meeting Participants
    op.create_table(
        'meeting_participants',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('meeting_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column(
            'role',
            sa.Enum('HOST', 'PARTICIPANT', name='meetingroleenum'),
            server_default='PARTICIPANT',
            nullable=False
        ),
        sa.Column('joined_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('left_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('consent_given', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id', 'user_id', name='uq_meeting_user')
    )
    op.create_index(op.f('ix_meeting_participants_meeting_id'), 'meeting_participants', ['meeting_id'], unique=False)

    # 4. Transcript Segments
    op.create_table(
        'transcript_segments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('meeting_id', sa.String(length=36), nullable=False),
        sa.Column('speaker_user_id', sa.String(length=36), nullable=True),
        sa.Column('speaker_name', sa.String(length=255), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('start_time_ms', sa.Integer(), server_default='0', nullable=False),
        sa.Column('end_time_ms', sa.Integer(), server_default='0', nullable=False),
        sa.Column('segment_index', sa.Integer(), server_default='0', nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['speaker_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_transcript_segments_meeting_id'), 'transcript_segments', ['meeting_id'], unique=False)

    # 5. Meeting AI Summaries
    op.create_table(
        'meeting_ai_summaries',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('meeting_id', sa.String(length=36), nullable=False),
        sa.Column('summary_text', sa.Text(), nullable=False),
        sa.Column('decisions_json', sa.Text(), nullable=True),
        sa.Column(
            'processing_status',
            sa.Enum('PENDING', 'PROCESSING', 'READY', 'FAILED', name='processingstatusenum'),
            server_default='READY',
            nullable=False
        ),
        sa.Column('processing_error', sa.Text(), nullable=True),
        sa.Column('idempotency_key', sa.String(length=64), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('meeting_id')
    )
    op.create_index(op.f('ix_meeting_ai_summaries_idempotency_key'), 'meeting_ai_summaries', ['idempotency_key'], unique=False)

    # 6. Meeting Suggested Items
    op.create_table(
        'meeting_suggested_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('meeting_id', sa.String(length=36), nullable=False),
        sa.Column('summary_id', sa.String(length=36), nullable=True),
        sa.Column('item_type', sa.Enum('TASK', 'CALENDAR_EVENT', name='suggestionitemtypeenum'), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('suggested_assignee_id', sa.String(length=36), nullable=True),
        sa.Column('suggested_due_date', sa.DateTime(timezone=True), nullable=True),
        sa.Column('suggested_priority', sa.String(length=20), nullable=True),
        sa.Column('suggested_start_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('suggested_end_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('evidence_text', sa.Text(), nullable=True),
        sa.Column('evidence_start_ms', sa.Integer(), nullable=True),
        sa.Column('evidence_end_ms', sa.Integer(), nullable=True),
        sa.Column('is_explicit_commitment', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column(
            'status',
            sa.Enum('PENDING', 'APPROVED', 'REJECTED', 'EDITED', name='suggestionstatusenum'),
            server_default='PENDING',
            nullable=False
        ),
        sa.Column('approved_task_id', sa.String(length=36), nullable=True),
        sa.Column('approved_event_id', sa.String(length=36), nullable=True),
        sa.Column('approved_by', sa.String(length=36), nullable=True),
        sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['approved_by'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['approved_event_id'], ['calendar_events.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['approved_task_id'], ['tasks.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['suggested_assignee_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['summary_id'], ['meeting_ai_summaries.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_meeting_suggested_items_meeting_id'), 'meeting_suggested_items', ['meeting_id'], unique=False)


def downgrade() -> None:
    op.drop_table('meeting_suggested_items')
    op.drop_table('meeting_ai_summaries')
    op.drop_table('transcript_segments')
    op.drop_table('meeting_participants')
    op.drop_table('meetings')
    op.drop_table('calendar_events')

    # Drop enums
    sa.Enum(name='suggestionstatusenum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='suggestionitemtypeenum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='processingstatusenum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='transcriptstatusenum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='meetingroleenum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='meetingstatusenum').drop(op.get_bind(), checkfirst=True)
