"""Add conversation scope and nullable workspace and project IDs

Revision ID: e4f5a6b7c8d9
Revises: c3d4e5f6a7b8
Create Date: 2026-10-24 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add scope column to conversations table with default 'PROJECT'
    op.add_column('conversations', sa.Column('scope', sa.String(length=20), server_default='PROJECT', nullable=False))
    
    # Make workspace_id and project_id nullable so account-level and workspace-level conversations can be stored
    with op.batch_alter_table('conversations') as batch_op:
        batch_op.alter_column('workspace_id', existing_type=sa.String(length=36), nullable=True)
        batch_op.alter_column('project_id', existing_type=sa.String(length=36), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('conversations') as batch_op:
        batch_op.alter_column('project_id', existing_type=sa.String(length=36), nullable=False)
        batch_op.alter_column('workspace_id', existing_type=sa.String(length=36), nullable=False)
    
    op.drop_column('conversations', 'scope')
