from sqlalchemy.orm import Session
from .models import Workspace, WorkspaceMember, WorkspaceRoleEnum
from app.users.models import User


def create_workspace(db: Session, name: str, description: str | None, owner_id: str) -> Workspace:
    workspace = Workspace(name=name, description=description, owner_id=owner_id)
    db.add(workspace)
    db.flush()
    membership = WorkspaceMember(
        workspace_id=workspace.id,
        user_id=owner_id,
        role=WorkspaceRoleEnum.OWNER
    )
    db.add(membership)
    db.commit()
    db.refresh(workspace)
    return workspace


def get_workspaces_for_user(db: Session, user_id: str) -> list:
    return (
        db.query(Workspace)
        .join(WorkspaceMember, Workspace.id == WorkspaceMember.workspace_id)
        .filter(WorkspaceMember.user_id == user_id)
        .all()
    )


def get_workspace(db: Session, workspace_id: str) -> Workspace | None:
    return db.query(Workspace).filter(Workspace.id == workspace_id).first()


def update_workspace(db: Session, workspace: Workspace, name: str | None, description: str | None) -> Workspace:
    if name is not None:
        workspace.name = name
    if description is not None:
        workspace.description = description
    db.commit()
    db.refresh(workspace)
    return workspace


def delete_workspace(db: Session, workspace: Workspace) -> None:
    db.delete(workspace)
    db.commit()


def get_membership(db: Session, workspace_id: str, user_id: str) -> WorkspaceMember | None:
    return (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id, WorkspaceMember.user_id == user_id)
        .first()
    )


def get_members(db: Session, workspace_id: str) -> list:
    return (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id)
        .all()
    )


def add_member(db: Session, workspace_id: str, user_id: str, role: WorkspaceRoleEnum) -> WorkspaceMember:
    membership = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=user_id,
        role=role
    )
    db.add(membership)
    db.commit()
    db.refresh(membership)
    return membership


def update_member_role(db: Session, membership: WorkspaceMember, role: WorkspaceRoleEnum) -> WorkspaceMember:
    membership.role = role
    db.commit()
    db.refresh(membership)
    return membership


def remove_member(db: Session, membership: WorkspaceMember) -> None:
    db.delete(membership)
    db.commit()


def count_owners(db: Session, workspace_id: str) -> int:
    return (
        db.query(WorkspaceMember)
        .filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.role == WorkspaceRoleEnum.OWNER
        )
        .count()
    )
