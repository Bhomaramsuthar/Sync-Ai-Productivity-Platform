from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.users.service import get_user_by_email
from . import repository as repo
from .models import WorkspaceRoleEnum, WorkspaceMember, Workspace
from .schemas import WorkspaceCreate, WorkspaceUpdate, AddMemberRequest, UpdateMemberRoleRequest


def create_workspace(db: Session, data: WorkspaceCreate, owner_id: str) -> Workspace:
    return repo.create_workspace(db, name=data.name, description=data.description, owner_id=owner_id)


def list_my_workspaces(db: Session, user_id: str) -> list:
    return repo.get_workspaces_for_user(db, user_id)


def get_workspace_for_member(db: Session, workspace_id: str, user_id: str):
    workspace = repo.get_workspace(db, workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Workspace not found"}})
    membership = repo.get_membership(db, workspace_id, user_id)
    if not membership:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "You are not a member of this workspace"}})
    return workspace, membership


def update_workspace(db: Session, workspace_id: str, user_id: str, data: WorkspaceUpdate) -> Workspace:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can update workspace"}})
    return repo.update_workspace(db, workspace, name=data.name, description=data.description)


def delete_workspace(db: Session, workspace_id: str, user_id: str) -> None:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role != WorkspaceRoleEnum.OWNER:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER can delete workspace"}})
    repo.delete_workspace(db, workspace)


def list_members(db: Session, workspace_id: str, user_id: str) -> list:
    get_workspace_for_member(db, workspace_id, user_id)  # authorization check
    return repo.get_members(db, workspace_id)


def add_member(db: Session, workspace_id: str, user_id: str, data: AddMemberRequest) -> WorkspaceMember:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can add members"}})
    if data.role == WorkspaceRoleEnum.OWNER:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ROLE", "message": "Cannot directly add a member as OWNER"}})

    target_user = get_user_by_email(db, data.email)
    if not target_user:
        raise HTTPException(status_code=404, detail={"error": {"code": "USER_NOT_FOUND", "message": "No user found with that email"}})

    existing = repo.get_membership(db, workspace_id, target_user.id)
    if existing:
        raise HTTPException(status_code=409, detail={"error": {"code": "ALREADY_MEMBER", "message": "User is already a member of this workspace"}})

    return repo.add_member(db, workspace_id, target_user.id, data.role)


def update_member_role(db: Session, workspace_id: str, user_id: str, target_user_id: str, data: UpdateMemberRoleRequest) -> WorkspaceMember:
    workspace, actor_membership = get_workspace_for_member(db, workspace_id, user_id)
    if actor_membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can change member roles"}})

    target_membership = repo.get_membership(db, workspace_id, target_user_id)
    if not target_membership:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Member not found in workspace"}})

    # ADMIN cannot promote to OWNER
    if actor_membership.role == WorkspaceRoleEnum.ADMIN and data.role == WorkspaceRoleEnum.OWNER:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "ADMIN cannot promote to OWNER"}})

    # Cannot demote the only OWNER
    if target_membership.role == WorkspaceRoleEnum.OWNER and data.role != WorkspaceRoleEnum.OWNER:
        if repo.count_owners(db, workspace_id) <= 1:
            raise HTTPException(status_code=400, detail={"error": {"code": "LAST_OWNER", "message": "Cannot demote the only workspace owner"}})

    return repo.update_member_role(db, target_membership, data.role)


def remove_member(db: Session, workspace_id: str, user_id: str, target_user_id: str) -> None:
    workspace, actor_membership = get_workspace_for_member(db, workspace_id, user_id)

    # Self-removal
    if user_id == target_user_id:
        if actor_membership.role == WorkspaceRoleEnum.OWNER and repo.count_owners(db, workspace_id) <= 1:
            raise HTTPException(status_code=400, detail={"error": {"code": "LAST_OWNER", "message": "Cannot remove the only workspace owner"}})
        repo.remove_member(db, actor_membership)
        return

    # Removing others
    if actor_membership.role == WorkspaceRoleEnum.MEMBER:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Members cannot remove other members"}})

    target_membership = repo.get_membership(db, workspace_id, target_user_id)
    if not target_membership:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Member not found in workspace"}})

    # ADMIN cannot remove OWNER
    if actor_membership.role == WorkspaceRoleEnum.ADMIN and target_membership.role == WorkspaceRoleEnum.OWNER:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "ADMIN cannot remove OWNER"}})

    # Protect the final OWNER
    if target_membership.role == WorkspaceRoleEnum.OWNER and repo.count_owners(db, workspace_id) <= 1:
        raise HTTPException(status_code=400, detail={"error": {"code": "LAST_OWNER", "message": "Cannot remove the only workspace owner"}})

    repo.remove_member(db, target_membership)
