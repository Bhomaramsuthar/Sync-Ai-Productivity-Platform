from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .models import (
    Workspace, WorkspaceMember, WorkspaceRoleEnum,
    WorkspaceInvitation, InvitationStatusEnum, InvitationTypeEnum,
    WorkspaceJoinRequest, JoinRequestStatusEnum,
    Notification
)
from app.users.models import User


def create_workspace(
    db: Session,
    name: str,
    description: str | None,
    owner_id: str,
    max_capacity: int = 50,
    requires_approval: bool = True,
) -> Workspace:
    workspace = Workspace(
        name=name,
        description=description,
        owner_id=owner_id,
        max_capacity=max_capacity,
        requires_approval=requires_approval,
    )
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


def get_workspace_with_lock(db: Session, workspace_id: str) -> Workspace | None:
    """Fetch workspace with row-level lock in PostgreSQL to safely serialize concurrent capacity checks."""
    query = db.query(Workspace).filter(Workspace.id == workspace_id)
    if db.bind and getattr(db.bind.dialect, "name", "") == "postgresql":
        query = query.with_for_update()
    return query.first()


def update_workspace(
    db: Session,
    workspace: Workspace,
    name: str | None = None,
    description: str | None = None,
    max_capacity: int | None = None,
    requires_approval: bool | None = None,
) -> Workspace:
    if name is not None:
        workspace.name = name
    if description is not None:
        workspace.description = description
    if max_capacity is not None:
        workspace.max_capacity = max_capacity
    if requires_approval is not None:
        workspace.requires_approval = requires_approval
    db.commit()
    db.refresh(workspace)
    return workspace


def delete_workspace(db: Session, workspace: Workspace) -> None:
    db.delete(workspace)
    db.commit()


# ---- Membership ----

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


def count_members(db: Session, workspace_id: str) -> int:
    return (
        db.query(WorkspaceMember)
        .filter(WorkspaceMember.workspace_id == workspace_id)
        .count()
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


def get_admin_and_owner_ids(db: Session, workspace_id: str) -> list[str]:
    rows = (
        db.query(WorkspaceMember.user_id)
        .filter(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.role.in_([WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN])
        )
        .all()
    )
    return [str(r[0]) for r in rows]


# ---- Invitations ----

def create_invitation(
    db: Session,
    workspace_id: str,
    creator_id: str,
    token_hash: str,
    invite_code: str | None,
    invitation_type: InvitationTypeEnum,
    role: WorkspaceRoleEnum,
    requires_approval: bool,
    recipient_email: str | None = None,
    max_uses: int | None = None,
    expires_at: datetime | None = None,
) -> WorkspaceInvitation:
    invitation = WorkspaceInvitation(
        workspace_id=workspace_id,
        creator_id=creator_id,
        token_hash=token_hash,
        invite_code=invite_code,
        invitation_type=invitation_type,
        role=role,
        requires_approval=requires_approval,
        recipient_email=recipient_email.lower().strip() if recipient_email else None,
        max_uses=max_uses,
        expires_at=expires_at,
        status=InvitationStatusEnum.ACTIVE,
    )
    db.add(invitation)
    db.commit()
    db.refresh(invitation)
    return invitation


def get_invitations_for_workspace(db: Session, workspace_id: str) -> list[WorkspaceInvitation]:
    return (
        db.query(WorkspaceInvitation)
        .filter(WorkspaceInvitation.workspace_id == workspace_id)
        .order_by(WorkspaceInvitation.created_at.desc())
        .all()
    )


def get_invitation_by_id(db: Session, invitation_id: str) -> WorkspaceInvitation | None:
    return db.query(WorkspaceInvitation).filter(WorkspaceInvitation.id == invitation_id).first()


def get_invitation_by_token_hash(db: Session, token_hash: str) -> WorkspaceInvitation | None:
    return db.query(WorkspaceInvitation).filter(WorkspaceInvitation.token_hash == token_hash).first()


def get_invitation_by_code(db: Session, invite_code: str) -> WorkspaceInvitation | None:
    cleaned = invite_code.strip().upper()
    return db.query(WorkspaceInvitation).filter(WorkspaceInvitation.invite_code == cleaned).first()


def count_pending_invitations(db: Session, workspace_id: str) -> int:
    return (
        db.query(WorkspaceInvitation)
        .filter(
            WorkspaceInvitation.workspace_id == workspace_id,
            WorkspaceInvitation.status == InvitationStatusEnum.ACTIVE,
        )
        .count()
    )


def save_invitation(db: Session, invitation: WorkspaceInvitation) -> WorkspaceInvitation:
    db.commit()
    db.refresh(invitation)
    return invitation


# ---- Join Requests ----

def create_join_request(
    db: Session,
    workspace_id: str,
    user_id: str,
    invitation_id: str | None,
    role: WorkspaceRoleEnum,
    message: str | None,
) -> WorkspaceJoinRequest:
    req = WorkspaceJoinRequest(
        workspace_id=workspace_id,
        user_id=user_id,
        invitation_id=invitation_id,
        role=role,
        message=message,
        status=JoinRequestStatusEnum.PENDING,
    )
    db.add(req)
    db.commit()
    db.refresh(req)
    return req


def get_pending_join_request(db: Session, workspace_id: str, user_id: str) -> WorkspaceJoinRequest | None:
    return (
        db.query(WorkspaceJoinRequest)
        .filter(
            WorkspaceJoinRequest.workspace_id == workspace_id,
            WorkspaceJoinRequest.user_id == user_id,
            WorkspaceJoinRequest.status == JoinRequestStatusEnum.PENDING,
        )
        .first()
    )


def get_join_request(db: Session, request_id: str) -> WorkspaceJoinRequest | None:
    return db.query(WorkspaceJoinRequest).filter(WorkspaceJoinRequest.id == request_id).first()


def get_join_requests_for_workspace(
    db: Session,
    workspace_id: str,
    status: JoinRequestStatusEnum | None = None,
) -> list[WorkspaceJoinRequest]:
    q = db.query(WorkspaceJoinRequest).filter(WorkspaceJoinRequest.workspace_id == workspace_id)
    if status is not None:
        q = q.filter(WorkspaceJoinRequest.status == status)
    return q.order_by(WorkspaceJoinRequest.created_at.desc()).all()


def get_join_requests_for_user(db: Session, user_id: str) -> list[WorkspaceJoinRequest]:
    return (
        db.query(WorkspaceJoinRequest)
        .filter(WorkspaceJoinRequest.user_id == user_id)
        .order_by(WorkspaceJoinRequest.created_at.desc())
        .all()
    )


def count_pending_requests(db: Session, workspace_id: str) -> int:
    return (
        db.query(WorkspaceJoinRequest)
        .filter(
            WorkspaceJoinRequest.workspace_id == workspace_id,
            WorkspaceJoinRequest.status == JoinRequestStatusEnum.PENDING,
        )
        .count()
    )


def save_join_request(db: Session, request: WorkspaceJoinRequest) -> WorkspaceJoinRequest:
    db.commit()
    db.refresh(request)
    return request


# ---- Notifications ----

def create_notification(
    db: Session,
    user_id: str,
    workspace_id: str | None,
    type: str,
    title: str,
    message: str,
    data: dict | None = None,
) -> Notification:
    notif = Notification(
        user_id=user_id,
        workspace_id=workspace_id,
        type=type,
        title=title,
        message=message,
    )
    if data:
        notif.data = data
    db.add(notif)
    db.commit()
    db.refresh(notif)
    return notif


def get_user_notifications(db: Session, user_id: str, limit: int = 50) -> list[Notification]:
    return (
        db.query(Notification)
        .filter(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
        .all()
    )


def mark_notification_read(db: Session, notification_id: str, user_id: str) -> Notification | None:
    notif = (
        db.query(Notification)
        .filter(Notification.id == notification_id, Notification.user_id == user_id)
        .first()
    )
    if notif:
        notif.is_read = True
        db.commit()
        db.refresh(notif)
    return notif


def mark_all_notifications_read(db: Session, user_id: str) -> int:
    updated = (
        db.query(Notification)
        .filter(Notification.user_id == user_id, Notification.is_read == False)
        .update({"is_read": True})
    )
    db.commit()
    return updated
