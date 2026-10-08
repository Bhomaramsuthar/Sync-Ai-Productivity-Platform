from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.users.models import User
from . import service
from .schemas import (
    WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse, WorkspaceWithRole,
    MemberResponse, AddMemberRequest, UpdateMemberRoleRequest
)

router = APIRouter()


def _member_to_response(m) -> dict:
    return {
        "id": m.id,
        "user_id": m.user_id,
        "workspace_id": m.workspace_id,
        "role": m.role,
        "joined_at": m.joined_at,
        "user_name": m.user.name,
        "user_email": m.user.email,
    }


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
def create_workspace(
    data: WorkspaceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = service.create_workspace(db, data, owner_id=current_user.id)
    return workspace


@router.get("", response_model=List[WorkspaceWithRole])
def list_workspaces(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from . import repository as repo
    workspaces = service.list_my_workspaces(db, current_user.id)
    result = []
    for ws in workspaces:
        membership = repo.get_membership(db, ws.id, current_user.id)
        result.append({
            **WorkspaceResponse.model_validate(ws).model_dump(),
            "current_user_role": membership.role,
        })
    return result


@router.get("/{workspace_id}", response_model=WorkspaceWithRole)
def get_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace, membership = service.get_workspace_for_member(db, workspace_id, current_user.id)
    return {
        **WorkspaceResponse.model_validate(workspace).model_dump(),
        "current_user_role": membership.role,
    }


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace(
    workspace_id: str,
    data: WorkspaceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.update_workspace(db, workspace_id, current_user.id, data)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.delete_workspace(db, workspace_id, current_user.id)


# ---- Members ----

@router.get("/{workspace_id}/members", response_model=List[MemberResponse])
def list_members(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    members = service.list_members(db, workspace_id, current_user.id)
    return [_member_to_response(m) for m in members]


@router.post("/{workspace_id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def add_member(
    workspace_id: str,
    data: AddMemberRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = service.add_member(db, workspace_id, current_user.id, data)
    # Reload to get user relationship
    from . import repository as repo
    membership = repo.get_membership(db, workspace_id, membership.user_id)
    return _member_to_response(membership)


@router.patch("/{workspace_id}/members/{user_id}", response_model=MemberResponse)
def update_member_role(
    workspace_id: str,
    user_id: str,
    data: UpdateMemberRoleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = service.update_member_role(db, workspace_id, current_user.id, user_id, data)
    return _member_to_response(membership)


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    workspace_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.remove_member(db, workspace_id, current_user.id, user_id)
