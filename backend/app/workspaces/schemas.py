from pydantic import BaseModel, Field
from datetime import datetime
from uuid import UUID
from typing import Optional, List
from .models import WorkspaceRoleEnum


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=1000)


class WorkspaceResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    owner_id: UUID
    created_at: datetime | None
    updated_at: datetime | None

    model_config = {"from_attributes": True}


class WorkspaceWithRole(WorkspaceResponse):
    current_user_role: WorkspaceRoleEnum


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
