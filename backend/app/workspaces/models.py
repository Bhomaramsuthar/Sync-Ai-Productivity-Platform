from sqlalchemy import Column, String, Integer, Boolean, DateTime, Enum, ForeignKey, UniqueConstraint, Text
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid
import enum
import json
from app.core.database import Base


class WorkspaceRoleEnum(str, enum.Enum):
    OWNER = "OWNER"
    ADMIN = "ADMIN"
    MEMBER = "MEMBER"


class InvitationTypeEnum(str, enum.Enum):
    LINK = "LINK"
    CODE = "CODE"
    EMAIL = "EMAIL"


class InvitationStatusEnum(str, enum.Enum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"
    EXPIRED = "EXPIRED"
    EXHAUSTED = "EXHAUSTED"


class JoinRequestStatusEnum(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


class Workspace(Base):
    __tablename__ = "workspaces"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    description = Column(String(1000), nullable=True)
    owner_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    max_capacity = Column(Integer, default=50, nullable=False, server_default="50")
    requires_approval = Column(Boolean, default=True, nullable=False, server_default="1")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", foreign_keys=[owner_id])
    members = relationship("WorkspaceMember", back_populates="workspace", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="workspace", cascade="all, delete-orphan")
    invitations = relationship("WorkspaceInvitation", back_populates="workspace", cascade="all, delete-orphan")
    join_requests = relationship("WorkspaceJoinRequest", back_populates="workspace", cascade="all, delete-orphan")


class WorkspaceMember(Base):
    __tablename__ = "workspace_members"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    role = Column(Enum(WorkspaceRoleEnum), default=WorkspaceRoleEnum.MEMBER, nullable=False)
    joined_at = Column(DateTime(timezone=True), server_default=func.now())

    workspace = relationship("Workspace", back_populates="members")
    user = relationship("User", foreign_keys=[user_id])

    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_user"),
    )


class WorkspaceInvitation(Base):
    __tablename__ = "workspace_invitations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    creator_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    token_hash = Column(String(64), nullable=False, index=True)
    invite_code = Column(String(32), nullable=True, unique=True, index=True)
    invitation_type = Column(Enum(InvitationTypeEnum), default=InvitationTypeEnum.LINK, nullable=False)
    status = Column(Enum(InvitationStatusEnum), default=InvitationStatusEnum.ACTIVE, nullable=False)
    role = Column(Enum(WorkspaceRoleEnum), default=WorkspaceRoleEnum.MEMBER, nullable=False)
    requires_approval = Column(Boolean, default=True, nullable=False)
    recipient_email = Column(String(255), nullable=True, index=True)
    max_uses = Column(Integer, nullable=True)  # None = unlimited
    use_count = Column(Integer, default=0, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_by_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    workspace = relationship("Workspace", back_populates="invitations")
    creator = relationship("User", foreign_keys=[creator_id])
    revoked_by = relationship("User", foreign_keys=[revoked_by_id])


class WorkspaceJoinRequest(Base):
    __tablename__ = "workspace_join_requests"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    invitation_id = Column(String(36), ForeignKey("workspace_invitations.id", ondelete="SET NULL"), nullable=True)
    status = Column(Enum(JoinRequestStatusEnum), default=JoinRequestStatusEnum.PENDING, nullable=False)
    role = Column(Enum(WorkspaceRoleEnum), default=WorkspaceRoleEnum.MEMBER, nullable=False)
    message = Column(String(500), nullable=True)
    reviewed_by_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    rejection_reason = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    workspace = relationship("Workspace", back_populates="join_requests")
    user = relationship("User", foreign_keys=[user_id])
    invitation = relationship("WorkspaceInvitation")
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    workspace_id = Column(String(36), ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True)
    type = Column(String(50), nullable=False)
    title = Column(String(255), nullable=False)
    message = Column(String(1000), nullable=False)
    data_json = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", foreign_keys=[user_id])
    workspace = relationship("Workspace", foreign_keys=[workspace_id])

    @property
    def data(self) -> dict:
        if not self.data_json:
            return {}
        try:
            return json.loads(self.data_json)
        except Exception:
            return {}

    @data.setter
    def data(self, value: dict | None):
        if value is None:
            self.data_json = None
        else:
            self.data_json = json.dumps(value)
