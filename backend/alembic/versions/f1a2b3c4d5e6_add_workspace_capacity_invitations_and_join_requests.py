"""Add workspace capacity, invitations, join requests, and notifications

Revision ID: f1a2b3c4d5e6
Revises: e4f5a6b7c8d9
Create Date: 2026-10-27 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'e4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    is_postgres = getattr(bind, "dialect", None) and bind.dialect.name == "postgresql"

    # 1. Add max_capacity and requires_approval to workspaces table
    with op.batch_alter_table('workspaces') as batch_op:
        batch_op.add_column(sa.Column('max_capacity', sa.Integer(), server_default='50', nullable=False))
        batch_op.add_column(sa.Column('requires_approval', sa.Boolean(), server_default=sa.true(), nullable=False))

    if is_postgres:
        op.execute("DO $$ BEGIN CREATE TYPE invitationtypeenum AS ENUM ('LINK', 'CODE', 'EMAIL'); EXCEPTION WHEN duplicate_object THEN null; END $$;")
        op.execute("DO $$ BEGIN CREATE TYPE invitationstatusenum AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED', 'EXHAUSTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;")
        op.execute("DO $$ BEGIN CREATE TYPE joinrequeststatusenum AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'); EXCEPTION WHEN duplicate_object THEN null; END $$;")

        role_type = postgresql.ENUM('OWNER', 'ADMIN', 'MEMBER', name='workspaceroleenum', create_type=False)
        inv_type = postgresql.ENUM('LINK', 'CODE', 'EMAIL', name='invitationtypeenum', create_type=False)
        inv_status = postgresql.ENUM('ACTIVE', 'REVOKED', 'EXPIRED', 'EXHAUSTED', name='invitationstatusenum', create_type=False)
        join_status = postgresql.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', name='joinrequeststatusenum', create_type=False)
        ts_default = sa.text('now()')
    else:
        role_type = sa.Enum('OWNER', 'ADMIN', 'MEMBER', name='workspaceroleenum')
        inv_type = sa.Enum('LINK', 'CODE', 'EMAIL', name='invitationtypeenum')
        inv_status = sa.Enum('ACTIVE', 'REVOKED', 'EXPIRED', 'EXHAUSTED', name='invitationstatusenum')
        join_status = sa.Enum('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED', name='joinrequeststatusenum')
        ts_default = sa.text('(CURRENT_TIMESTAMP)')

    # 2. Create workspace_invitations table
    op.create_table(
        'workspace_invitations',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('creator_id', sa.String(length=36), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('invite_code', sa.String(length=32), nullable=True),
        sa.Column('invitation_type', inv_type, nullable=False),
        sa.Column('status', inv_status, nullable=False),
        sa.Column('role', role_type, nullable=False),
        sa.Column('requires_approval', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('recipient_email', sa.String(length=255), nullable=True),
        sa.Column('max_uses', sa.Integer(), nullable=True),
        sa.Column('use_count', sa.Integer(), server_default='0', nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('revoked_by_id', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=ts_default, nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['creator_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['revoked_by_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('workspace_invitations') as batch_op:
        batch_op.create_index('ix_workspace_invitations_token_hash', ['token_hash'], unique=False)
        batch_op.create_index('ix_workspace_invitations_invite_code', ['invite_code'], unique=True)
        batch_op.create_index('ix_workspace_invitations_recipient_email', ['recipient_email'], unique=False)

    # 3. Create workspace_join_requests table
    op.create_table(
        'workspace_join_requests',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('workspace_id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('invitation_id', sa.String(length=36), nullable=True),
        sa.Column('status', join_status, nullable=False),
        sa.Column('role', role_type, nullable=False),
        sa.Column('message', sa.String(length=500), nullable=True),
        sa.Column('reviewed_by_id', sa.String(length=36), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('rejection_reason', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=ts_default, nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['invitation_id'], ['workspace_invitations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reviewed_by_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('workspace_join_requests') as batch_op:
        batch_op.create_index('ix_workspace_join_requests_workspace_user', ['workspace_id', 'user_id'], unique=False)

    # 4. Create notifications table
    op.create_table(
        'notifications',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('workspace_id', sa.String(length=36), nullable=True),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('message', sa.String(length=1000), nullable=False),
        sa.Column('data_json', sa.Text(), nullable=True),
        sa.Column('is_read', sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=ts_default, nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('notifications') as batch_op:
        batch_op.create_index('ix_notifications_user_id', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_table('notifications')
    op.drop_table('workspace_join_requests')
    op.drop_table('workspace_invitations')
    with op.batch_alter_table('workspaces') as batch_op:
        batch_op.drop_column('requires_approval')
        batch_op.drop_column('max_capacity')
