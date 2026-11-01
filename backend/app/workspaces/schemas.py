from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, List, Any
from .models import WorkspaceRoleEnum, InvitationTypeEnum, InvitationStatusEnum, JoinRequestStatusEnum


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    max_capacity: int = Field(default=50, ge=1, le=10000)
    requires_approval: bool = Field(default=True)


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)
    max_capacity: Optional[int] = Field(default=None, ge=1, le=10000)
    requires_approval: Optional[bool] = None


class WorkspaceResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    owner_id: UUID
    max_capacity: int = 50
    requires_approval: bool = True
    created_at: datetime | None
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class WorkspaceWithRole(WorkspaceResponse):
    current_user_role: WorkspaceRoleEnum
    member_count: Optional[int] = None
    owner_name: Optional[str] = None


class WorkspaceCapacityResponse(BaseModel):
    workspace_id: UUID
    max_capacity: int
    active_members: int
    available_seats: int
    pending_requests: int
    pending_invitations: int
    requires_approval: bool
    is_full: bool


class UpdateCapacityRequest(BaseModel):
    max_capacity: int = Field(ge=1, le=10000)
    requires_approval: Optional[bool] = None


class MemberResponse(BaseModel):
    id: UUID
    user_id: UUID
    workspace_id: UUID
    role: WorkspaceRoleEnum
    joined_at: datetime | None
    user_name: str
    user_email: str

    model_config = {"from_attributes": True}


class AddMemberRequest(BaseModel):
    email: str
    role: WorkspaceRoleEnum = WorkspaceRoleEnum.MEMBER


class UpdateMemberRoleRequest(BaseModel):
    role: WorkspaceRoleEnum


# ---- Invitations ----

class InvitationCreateRequest(BaseModel):
    invitation_type: InvitationTypeEnum = InvitationTypeEnum.LINK
    role: WorkspaceRoleEnum = WorkspaceRoleEnum.MEMBER
    requires_approval: Optional[bool] = None
    recipient_email: Optional[str] = None
    max_uses: Optional[int] = Field(default=None, ge=1)
    expires_in_days: Optional[int] = Field(default=7, ge=1, le=365)


class InvitationResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    creator_id: UUID
    invitation_type: InvitationTypeEnum
    status: InvitationStatusEnum
    role: WorkspaceRoleEnum
    requires_approval: bool
    recipient_email: Optional[str] = None
    max_uses: Optional[int] = None
    use_count: int
    expires_at: Optional[datetime] = None
    invite_code: Optional[str] = None
    invite_url: Optional[str] = None
    raw_token: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class ValidateInvitationResponse(BaseModel):
    is_valid: bool
    status: str
    reason: Optional[str] = None
    invitation_type: Optional[InvitationTypeEnum] = None
    workspace_id: Optional[UUID] = None
    workspace_name: Optional[str] = None
    workspace_description: Optional[str] = None
    owner_name: Optional[str] = None
    requires_approval: bool = True
    role: Optional[WorkspaceRoleEnum] = None
    recipient_email: Optional[str] = None
    is_full: bool = False
    active_members: int = 0
    max_capacity: int = 0


class JoinWorkspaceRequest(BaseModel):
    token: Optional[str] = None
    code: Optional[str] = None
    message: Optional[str] = Field(default=None, max_length=500)


class JoinWorkspaceResponse(BaseModel):
    success: bool
    status: str  # "JOINED" or "REQUESTED"
    message: str
    workspace_id: UUID
    workspace_name: str
    role: WorkspaceRoleEnum
    request_id: Optional[UUID] = None


class AcceptEmailInviteRequest(BaseModel):
    token: Optional[str] = None
    invitation_id: Optional[str] = None


class DeclineEmailInviteRequest(BaseModel):
    token: Optional[str] = None
    invitation_id: Optional[str] = None


# ---- Join Requests ----

class JoinRequestResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    workspace_name: Optional[str] = None
    user_id: UUID
    user_name: str
    user_email: str
    user_avatar_url: Optional[str] = None
    invitation_id: Optional[UUID] = None
    status: JoinRequestStatusEnum
    role: WorkspaceRoleEnum
    message: Optional[str] = None
    created_at: Optional[datetime] = None
    reviewed_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    model_config = {"from_attributes": True}


class RejectJoinRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


# ---- Notifications ----

class NotificationResponse(BaseModel):
    id: UUID
    user_id: UUID
    workspace_id: Optional[UUID] = None
    type: str
    title: str
    message: str
    data: Optional[dict] = None
    is_read: bool
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
