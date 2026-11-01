import hashlib
import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional, Tuple
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.users.service import get_user_by_email
from app.core.realtime import workspace_realtime_manager
from . import repository as repo
from .models import (
    WorkspaceRoleEnum, WorkspaceMember, Workspace,
    WorkspaceInvitation, InvitationTypeEnum, InvitationStatusEnum,
    WorkspaceJoinRequest, JoinRequestStatusEnum,
    Notification
)
from .schemas import (
    WorkspaceCreate, WorkspaceUpdate, AddMemberRequest, UpdateMemberRoleRequest,
    UpdateCapacityRequest, InvitationCreateRequest, RejectJoinRequest
)

# Rate limiter tracking for code brute-force protection (identifier -> list of failure timestamps)
_code_failed_attempts = defaultdict(list)


def _check_code_rate_limit(identifier: str, max_attempts: int = 10, window_seconds: int = 300):
    now = time.time()
    history = [t for t in _code_failed_attempts[identifier] if now - t < window_seconds]
    _code_failed_attempts[identifier] = history
    if len(history) >= max_attempts:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": {"code": "RATE_LIMITED", "message": "Too many invalid invite code attempts. Please wait a few minutes."}}
        )


def _record_failed_code_attempt(identifier: str):
    _code_failed_attempts[identifier].append(time.time())


def _clear_code_attempts(identifier: str):
    if identifier in _code_failed_attempts:
        del _code_failed_attempts[identifier]


def generate_invitation_token() -> Tuple[str, str]:
    """Generates a secure 32-byte urlsafe token and returns (raw_token, token_hash)."""
    raw_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    return raw_token, token_hash


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def generate_invite_code(prefix: str = "SYNC-") -> str:
    """Generates an unambiguous 8-character uppercase invite code."""
    chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    random_part = "".join(secrets.choice(chars) for _ in range(8))
    return f"{prefix}{random_part}"


# ---- Workspace Core ----

def create_workspace(db: Session, data: WorkspaceCreate, owner_id: str) -> Workspace:
    return repo.create_workspace(
        db,
        name=data.name,
        description=data.description,
        owner_id=owner_id,
        max_capacity=data.max_capacity,
        requires_approval=data.requires_approval,
    )


def list_my_workspaces(db: Session, user_id: str) -> list:
    return repo.get_workspaces_for_user(db, user_id)


def get_workspace_for_member(db: Session, workspace_id: str, user_id: str) -> Tuple[Workspace, WorkspaceMember]:
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

    if data.max_capacity is not None:
        if membership.role != WorkspaceRoleEnum.OWNER:
            raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER can change workspace capacity"}})
        active_count = repo.count_members(db, workspace_id)
        if data.max_capacity < active_count:
            raise HTTPException(
                status_code=400,
                detail={"error": {"code": "CAPACITY_TOO_LOW", "message": f"Capacity cannot be less than current member count ({active_count})"}}
            )

    return repo.update_workspace(
        db,
        workspace,
        name=data.name,
        description=data.description,
        max_capacity=data.max_capacity,
        requires_approval=data.requires_approval,
    )


def delete_workspace(db: Session, workspace_id: str, user_id: str) -> None:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role != WorkspaceRoleEnum.OWNER:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER can delete workspace"}})
    repo.delete_workspace(db, workspace)


# ---- Capacity Management ----

def get_workspace_capacity(db: Session, workspace_id: str, user_id: str) -> dict:
    workspace, _ = get_workspace_for_member(db, workspace_id, user_id)
    active_count = repo.count_members(db, workspace_id)
    pending_reqs = repo.count_pending_requests(db, workspace_id)
    pending_invites = repo.count_pending_invitations(db, workspace_id)
    available_seats = max(0, workspace.max_capacity - active_count)
    is_full = active_count >= workspace.max_capacity

    return {
        "workspace_id": workspace.id,
        "max_capacity": workspace.max_capacity,
        "active_members": active_count,
        "available_seats": available_seats,
        "pending_requests": pending_reqs,
        "pending_invitations": pending_invites,
        "requires_approval": workspace.requires_approval,
        "is_full": is_full,
    }


def update_workspace_capacity(db: Session, workspace_id: str, user_id: str, data: UpdateCapacityRequest) -> dict:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role != WorkspaceRoleEnum.OWNER:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER can modify workspace capacity"}})

    active_count = repo.count_members(db, workspace_id)
    if data.max_capacity < active_count:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "CAPACITY_TOO_LOW", "message": f"New capacity cannot be less than active member count ({active_count})"}}
        )

    workspace = repo.update_workspace(
        db,
        workspace,
        max_capacity=data.max_capacity,
        requires_approval=data.requires_approval,
    )

    cap = get_workspace_capacity(db, workspace_id, user_id)
    workspace_realtime_manager.broadcast_sync(workspace_id, "workspace:capacity:updated", cap)
    return cap


# ---- Members Management ----

def list_members(db: Session, workspace_id: str, user_id: str) -> list:
    get_workspace_for_member(db, workspace_id, user_id)
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

    # Concurrency safe capacity check
    locked_ws = repo.get_workspace_with_lock(db, workspace_id)
    active_count = repo.count_members(db, workspace_id)
    if active_count >= locked_ws.max_capacity:
        raise HTTPException(
            status_code=409,
            detail={"error": {"code": "WORKSPACE_FULL", "message": "Workspace has reached its maximum member capacity"}}
        )

    new_member = repo.add_member(db, workspace_id, target_user.id, data.role)
    workspace_realtime_manager.broadcast_sync(workspace_id, "workspace:capacity:updated", {
        "workspace_id": workspace_id,
        "active_members": active_count + 1,
        "max_capacity": locked_ws.max_capacity,
        "available_seats": max(0, locked_ws.max_capacity - (active_count + 1)),
    })
    return new_member


def update_member_role(db: Session, workspace_id: str, user_id: str, target_user_id: str, data: UpdateMemberRoleRequest) -> WorkspaceMember:
    workspace, actor_membership = get_workspace_for_member(db, workspace_id, user_id)
    if actor_membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can change member roles"}})

    target_membership = repo.get_membership(db, workspace_id, target_user_id)
    if not target_membership:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Member not found in workspace"}})

    if actor_membership.role == WorkspaceRoleEnum.ADMIN and data.role == WorkspaceRoleEnum.OWNER:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "ADMIN cannot promote to OWNER"}})

    if target_membership.role == WorkspaceRoleEnum.OWNER and data.role != WorkspaceRoleEnum.OWNER:
        if repo.count_owners(db, workspace_id) <= 1:
            raise HTTPException(status_code=400, detail={"error": {"code": "LAST_OWNER", "message": "Cannot demote the only workspace owner"}})

    return repo.update_member_role(db, target_membership, data.role)


def remove_member(db: Session, workspace_id: str, user_id: str, target_user_id: str) -> None:
    workspace, actor_membership = get_workspace_for_member(db, workspace_id, user_id)

    if user_id == target_user_id:
        if actor_membership.role == WorkspaceRoleEnum.OWNER and repo.count_owners(db, workspace_id) <= 1:
            raise HTTPException(status_code=400, detail={"error": {"code": "LAST_OWNER", "message": "Cannot remove the only workspace owner"}})
        repo.remove_member(db, actor_membership)
        return

    if actor_membership.role == WorkspaceRoleEnum.MEMBER:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Members cannot remove other members"}})

    target_membership = repo.get_membership(db, workspace_id, target_user_id)
    if not target_membership:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Member not found in workspace"}})

    if actor_membership.role == WorkspaceRoleEnum.ADMIN and target_membership.role == WorkspaceRoleEnum.OWNER:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "ADMIN cannot remove OWNER"}})

    if target_membership.role == WorkspaceRoleEnum.OWNER and repo.count_owners(db, workspace_id) <= 1:
        raise HTTPException(status_code=400, detail={"error": {"code": "LAST_OWNER", "message": "Cannot remove the only workspace owner"}})

    repo.remove_member(db, target_membership)


# ---- Invitations ----

def create_invitation(db: Session, workspace_id: str, user_id: str, data: InvitationCreateRequest) -> dict:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can create invitations"}})

    if data.invitation_type == InvitationTypeEnum.EMAIL:
        if not data.recipient_email:
            raise HTTPException(status_code=400, detail={"error": {"code": "EMAIL_REQUIRED", "message": "Recipient email is required for email invitations"}})
        existing_user = get_user_by_email(db, data.recipient_email)
        if existing_user:
            existing_mem = repo.get_membership(db, workspace_id, existing_user.id)
            if existing_mem:
                raise HTTPException(status_code=409, detail={"error": {"code": "ALREADY_MEMBER", "message": f"{data.recipient_email} is already a member"}})

    raw_token, token_hash = generate_invitation_token()
    invite_code = generate_invite_code()

    # Check code uniqueness
    while repo.get_invitation_by_code(db, invite_code):
        invite_code = generate_invite_code()

    expires_at = None
    if data.expires_in_days:
        expires_at = datetime.now(timezone.utc) + timedelta(days=data.expires_in_days)

    req_approval = data.requires_approval if data.requires_approval is not None else workspace.requires_approval

    invitation = repo.create_invitation(
        db=db,
        workspace_id=workspace_id,
        creator_id=user_id,
        token_hash=token_hash,
        invite_code=invite_code,
        invitation_type=data.invitation_type,
        role=data.role,
        requires_approval=req_approval,
        recipient_email=data.recipient_email,
        max_uses=data.max_uses,
        expires_at=expires_at,
    )

    # Return raw token ONCE in the response
    admin_ids = repo.get_admin_and_owner_ids(db, workspace_id)
    workspace_realtime_manager.send_to_users_sync(workspace_id, admin_ids, "workspace:invitation:created", {
        "invitation_id": invitation.id,
        "invitation_type": invitation.invitation_type,
        "role": invitation.role,
        "expires_at": invitation.expires_at.isoformat() if invitation.expires_at else None,
    })

    return {
        "id": invitation.id,
        "workspace_id": invitation.workspace_id,
        "creator_id": invitation.creator_id,
        "invitation_type": invitation.invitation_type,
        "status": invitation.status,
        "role": invitation.role,
        "requires_approval": invitation.requires_approval,
        "recipient_email": invitation.recipient_email,
        "max_uses": invitation.max_uses,
        "use_count": invitation.use_count,
        "expires_at": invitation.expires_at,
        "invite_code": invitation.invite_code,
        "invite_url": f"/join/{raw_token}",
        "raw_token": raw_token,
        "created_at": invitation.created_at,
    }


def list_invitations(db: Session, workspace_id: str, user_id: str) -> list:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can view invitations"}})

    invitations = repo.get_invitations_for_workspace(db, workspace_id)
    now = datetime.now(timezone.utc)
    for inv in invitations:
        # Lazy expiration update
        if inv.status == InvitationStatusEnum.ACTIVE and inv.expires_at and inv.expires_at.replace(tzinfo=timezone.utc) < now:
            inv.status = InvitationStatusEnum.EXPIRED
            repo.save_invitation(db, inv)
    return invitations


def revoke_invitation(db: Session, workspace_id: str, invitation_id: str, user_id: str) -> None:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can revoke invitations"}})

    invitation = repo.get_invitation_by_id(db, invitation_id)
    if not invitation or invitation.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Invitation not found"}})

    invitation.status = InvitationStatusEnum.REVOKED
    invitation.revoked_at = datetime.now(timezone.utc)
    invitation.revoked_by_id = user_id
    repo.save_invitation(db, invitation)

    admin_ids = repo.get_admin_and_owner_ids(db, workspace_id)
    workspace_realtime_manager.send_to_users_sync(workspace_id, admin_ids, "workspace:invitation:revoked", {
        "invitation_id": invitation_id,
        "workspace_id": workspace_id,
    })


def regenerate_invitation(db: Session, workspace_id: str, invitation_id: str, user_id: str) -> dict:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can regenerate invitations"}})

    old_inv = repo.get_invitation_by_id(db, invitation_id)
    if not old_inv or old_inv.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Invitation not found"}})

    # Revoke old invitation
    old_inv.status = InvitationStatusEnum.REVOKED
    old_inv.revoked_at = datetime.now(timezone.utc)
    old_inv.revoked_by_id = user_id
    repo.save_invitation(db, old_inv)

    # Create replacement
    req = InvitationCreateRequest(
        invitation_type=old_inv.invitation_type,
        role=old_inv.role,
        requires_approval=old_inv.requires_approval,
        recipient_email=old_inv.recipient_email,
        max_uses=old_inv.max_uses,
        expires_in_days=7,
    )
    return create_invitation(db, workspace_id, user_id, req)


# ---- Validation & Public Preview ----

def validate_invitation(
    db: Session,
    token: Optional[str] = None,
    code: Optional[str] = None,
    client_identifier: str = "anonymous",
) -> dict:
    if not token and not code:
        raise HTTPException(status_code=400, detail={"error": {"code": "MISSING_INVITATION", "message": "Either token or code must be provided"}})

    invitation = None
    if token:
        thash = hash_token(token)
        invitation = repo.get_invitation_by_token_hash(db, thash)
    elif code:
        _check_code_rate_limit(client_identifier)
        invitation = repo.get_invitation_by_code(db, code)
        if not invitation:
            _record_failed_code_attempt(client_identifier)
            return {
                "is_valid": False,
                "status": "INVALID",
                "reason": "Invalid invitation code",
            }
        _clear_code_attempts(client_identifier)

    if not invitation:
        return {
            "is_valid": False,
            "status": "INVALID",
            "reason": "Invitation not found or invalid",
        }

    workspace = repo.get_workspace(db, invitation.workspace_id)
    if not workspace:
        return {
            "is_valid": False,
            "status": "INVALID",
            "reason": "Associated workspace does not exist",
        }

    now = datetime.now(timezone.utc)
    # Check expiry
    if invitation.expires_at and (invitation.expires_at.replace(tzinfo=timezone.utc) if invitation.expires_at.tzinfo is None else invitation.expires_at) < now:
        if invitation.status == InvitationStatusEnum.ACTIVE:
            invitation.status = InvitationStatusEnum.EXPIRED
            repo.save_invitation(db, invitation)
        return {
            "is_valid": False,
            "status": "EXPIRED",
            "reason": "This invitation has expired",
            "workspace_name": workspace.name,
        }

    # Check revoked
    if invitation.status == InvitationStatusEnum.REVOKED:
        return {
            "is_valid": False,
            "status": "REVOKED",
            "reason": "This invitation has been revoked by a workspace administrator",
            "workspace_name": workspace.name,
        }

    # Check max uses
    if invitation.max_uses and invitation.use_count >= invitation.max_uses:
        if invitation.status == InvitationStatusEnum.ACTIVE:
            invitation.status = InvitationStatusEnum.EXHAUSTED
            repo.save_invitation(db, invitation)
        return {
            "is_valid": False,
            "status": "EXHAUSTED",
            "reason": "This invitation has reached its maximum allowed uses",
            "workspace_name": workspace.name,
        }

    active_members = repo.count_members(db, workspace.id)
    is_full = active_members >= workspace.max_capacity

    return {
        "is_valid": not is_full,
        "status": "FULL" if is_full else "ACTIVE",
        "reason": "Workspace is currently full" if is_full else None,
        "invitation_type": invitation.invitation_type,
        "workspace_id": workspace.id,
        "workspace_name": workspace.name,
        "workspace_description": workspace.description,
        "owner_name": workspace.owner.name if workspace.owner else "Workspace Owner",
        "requires_approval": invitation.requires_approval,
        "role": invitation.role,
        "recipient_email": invitation.recipient_email,
        "is_full": is_full,
        "active_members": active_members,
        "max_capacity": workspace.max_capacity,
    }


# ---- Join Workspace Flow ----

def join_or_request_workspace(
    db: Session,
    user_id: str,
    token: Optional[str] = None,
    code: Optional[str] = None,
    message: Optional[str] = None,
) -> dict:
    # 1. Validate invitation
    validation = validate_invitation(db, token=token, code=code, client_identifier=user_id)
    if validation.get("status") == "INVALID":
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_INVITATION", "message": validation.get("reason", "Invalid invitation")}})
    if validation.get("status") == "EXPIRED":
        raise HTTPException(status_code=410, detail={"error": {"code": "INVITATION_EXPIRED", "message": "This invitation has expired"}})
    if validation.get("status") == "REVOKED":
        raise HTTPException(status_code=403, detail={"error": {"code": "INVITATION_REVOKED", "message": "This invitation was revoked"}})
    if validation.get("status") == "EXHAUSTED":
        raise HTTPException(status_code=410, detail={"error": {"code": "INVITATION_EXHAUSTED", "message": "This invitation has reached its usage limit"}})

    invitation = None
    if token:
        invitation = repo.get_invitation_by_token_hash(db, hash_token(token))
    elif code:
        invitation = repo.get_invitation_by_code(db, code)

    if not invitation:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Invitation not found"}})

    workspace_id = invitation.workspace_id

    # 2. Check if user is already a member
    existing_member = repo.get_membership(db, workspace_id, user_id)
    if existing_member:
        raise HTTPException(status_code=409, detail={"error": {"code": "ALREADY_MEMBER", "message": "You are already a member of this workspace"}})

    # 3. If email invite, check recipient email matches current user email
    from app.users.service import get_user_by_id
    current_user = get_user_by_id(db, user_id)
    if not current_user:
        raise HTTPException(status_code=401, detail={"error": {"code": "UNAUTHORIZED", "message": "User not found"}})

    if invitation.invitation_type == InvitationTypeEnum.EMAIL and invitation.recipient_email:
        if current_user.email.lower() != invitation.recipient_email.lower():
            raise HTTPException(
                status_code=403,
                detail={"error": {"code": "EMAIL_MISMATCH", "message": f"This invitation was sent specifically to {invitation.recipient_email}"}}
            )

    # 4. Check workspace capacity with row lock
    locked_ws = repo.get_workspace_with_lock(db, workspace_id)
    active_members = repo.count_members(db, workspace_id)
    if active_members >= locked_ws.max_capacity:
        raise HTTPException(
            status_code=409,
            detail={"error": {"code": "WORKSPACE_FULL", "message": "Workspace has reached its maximum member capacity"}}
        )

    # 5. Handle approval requirement
    if invitation.requires_approval:
        # Check duplicate pending request
        existing_req = repo.get_pending_join_request(db, workspace_id, user_id)
        if existing_req:
            raise HTTPException(
                status_code=409,
                detail={"error": {"code": "DUPLICATE_REQUEST", "message": "You already have a pending join request for this workspace"}}
            )

        req = repo.create_join_request(
            db=db,
            workspace_id=workspace_id,
            user_id=user_id,
            invitation_id=invitation.id,
            role=invitation.role,
            message=message,
        )

        # Notify workspace owners & admins
        admin_ids = repo.get_admin_and_owner_ids(db, workspace_id)
        for admin_id in admin_ids:
            repo.create_notification(
                db=db,
                user_id=admin_id,
                workspace_id=workspace_id,
                type="join_request_created",
                title="New Join Request",
                message=f"{current_user.name} ({current_user.email}) requested to join {locked_ws.name}.",
                data={"request_id": req.id, "workspace_id": workspace_id, "user_id": user_id},
            )

        workspace_realtime_manager.send_to_users_sync(workspace_id, admin_ids, "workspace:join_request:created", {
            "request_id": req.id,
            "workspace_id": workspace_id,
            "user_id": user_id,
            "user_name": current_user.name,
            "user_email": current_user.email,
            "requested_at": req.created_at.isoformat() if req.created_at else None,
        })

        return {
            "success": True,
            "status": "REQUESTED",
            "message": "Join request submitted successfully. Waiting for admin approval.",
            "workspace_id": locked_ws.id,
            "workspace_name": locked_ws.name,
            "role": req.role,
            "request_id": req.id,
        }

    # 6. Direct Join (no approval needed)
    membership = repo.add_member(db, workspace_id, user_id, invitation.role)
    invitation.use_count += 1
    if invitation.max_uses and invitation.use_count >= invitation.max_uses:
        invitation.status = InvitationStatusEnum.EXHAUSTED
    repo.save_invitation(db, invitation)

    # Real-time event notifications
    workspace_realtime_manager.broadcast_sync(workspace_id, "member:added", {
        "id": membership.id,
        "user_id": membership.user_id,
        "workspace_id": membership.workspace_id,
        "role": membership.role,
        "user_name": current_user.name,
        "user_email": current_user.email,
    })
    workspace_realtime_manager.broadcast_sync(workspace_id, "workspace:capacity:updated", {
        "workspace_id": workspace_id,
        "active_members": active_members + 1,
        "max_capacity": locked_ws.max_capacity,
        "available_seats": max(0, locked_ws.max_capacity - (active_members + 1)),
    })

    return {
        "success": True,
        "status": "JOINED",
        "message": f"Successfully joined {locked_ws.name}.",
        "workspace_id": locked_ws.id,
        "workspace_name": locked_ws.name,
        "role": membership.role,
        "request_id": None,
    }


# ---- Join Requests Management ----

def list_workspace_join_requests(db: Session, workspace_id: str, user_id: str) -> list:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can view join requests"}})

    requests = repo.get_join_requests_for_workspace(db, workspace_id, status=JoinRequestStatusEnum.PENDING)
    res = []
    for r in requests:
        res.append({
            "id": r.id,
            "workspace_id": r.workspace_id,
            "workspace_name": workspace.name,
            "user_id": r.user_id,
            "user_name": r.user.name if r.user else "User",
            "user_email": r.user.email if r.user else "",
            "user_avatar_url": getattr(r.user, "avatar_url", None),
            "invitation_id": r.invitation_id,
            "status": r.status,
            "role": r.role,
            "message": r.message,
            "created_at": r.created_at,
            "reviewed_at": r.reviewed_at,
            "rejection_reason": r.rejection_reason,
        })
    return res


def list_my_join_requests(db: Session, user_id: str) -> list:
    requests = repo.get_join_requests_for_user(db, user_id)
    res = []
    for r in requests:
        ws = repo.get_workspace(db, r.workspace_id)
        res.append({
            "id": r.id,
            "workspace_id": r.workspace_id,
            "workspace_name": ws.name if ws else "Workspace",
            "user_id": r.user_id,
            "user_name": r.user.name if r.user else "User",
            "user_email": r.user.email if r.user else "",
            "user_avatar_url": getattr(r.user, "avatar_url", None),
            "invitation_id": r.invitation_id,
            "status": r.status,
            "role": r.role,
            "message": r.message,
            "created_at": r.created_at,
            "reviewed_at": r.reviewed_at,
            "rejection_reason": r.rejection_reason,
        })
    return res


def cancel_join_request(db: Session, request_id: str, user_id: str) -> None:
    req = repo.get_join_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Join request not found"}})
    if str(req.user_id) != str(user_id):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "You can only cancel your own join request"}})
    if req.status != JoinRequestStatusEnum.PENDING:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_STATE", "message": f"Cannot cancel request in {req.status} state"}})

    req.status = JoinRequestStatusEnum.CANCELLED
    repo.save_join_request(db, req)


def approve_join_request(db: Session, request_id: str, reviewer_id: str) -> WorkspaceMember:
    req = repo.get_join_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Join request not found"}})
    if req.status != JoinRequestStatusEnum.PENDING:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_STATE", "message": f"Request is already {req.status}"}})

    # Self-approval check
    if str(req.user_id) == str(reviewer_id):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Cannot approve your own join request"}})

    workspace, reviewer_mem = get_workspace_for_member(db, req.workspace_id, reviewer_id)
    if reviewer_mem.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can approve requests"}})

    # Atomic lock on workspace to verify capacity
    locked_ws = repo.get_workspace_with_lock(db, req.workspace_id)
    active_count = repo.count_members(db, req.workspace_id)
    if active_count >= locked_ws.max_capacity:
        raise HTTPException(
            status_code=409,
            detail={"error": {"code": "WORKSPACE_FULL", "message": "Workspace has reached its maximum member capacity"}}
        )

    # Check if user already became member
    existing_mem = repo.get_membership(db, req.workspace_id, req.user_id)
    if not existing_mem:
        membership = repo.add_member(db, req.workspace_id, req.user_id, req.role)
    else:
        membership = existing_mem

    req.status = JoinRequestStatusEnum.APPROVED
    req.reviewed_by_id = reviewer_id
    req.reviewed_at = datetime.now(timezone.utc)
    repo.save_join_request(db, req)

    # If associated with an invitation, increment its use count
    if req.invitation_id:
        inv = repo.get_invitation_by_id(db, req.invitation_id)
        if inv and inv.status == InvitationStatusEnum.ACTIVE:
            inv.use_count += 1
            if inv.max_uses and inv.use_count >= inv.max_uses:
                inv.status = InvitationStatusEnum.EXHAUSTED
            repo.save_invitation(db, inv)

    # Send persistent in-app notification to approved user
    repo.create_notification(
        db=db,
        user_id=req.user_id,
        workspace_id=req.workspace_id,
        type="join_request_approved",
        title="Join Request Approved",
        message=f"Your request to join {locked_ws.name} has been approved. You are now a {req.role}.",
        data={"workspace_id": locked_ws.id, "workspace_name": locked_ws.name, "role": req.role},
    )

    # Send targeted WebSocket event to applicant
    workspace_realtime_manager.send_to_user_sync(req.workspace_id, req.user_id, "workspace:join_request:approved", {
        "request_id": req.id,
        "workspace_id": locked_ws.id,
        "workspace_name": locked_ws.name,
        "role": req.role,
        "approved_at": req.reviewed_at.isoformat(),
    })

    # Broadcast to workspace members
    workspace_realtime_manager.broadcast_sync(req.workspace_id, "member:added", {
        "id": membership.id,
        "user_id": membership.user_id,
        "workspace_id": membership.workspace_id,
        "role": membership.role,
        "user_name": req.user.name,
        "user_email": req.user.email,
    })
    workspace_realtime_manager.broadcast_sync(req.workspace_id, "workspace:capacity:updated", {
        "workspace_id": req.workspace_id,
        "active_members": active_count + 1,
        "max_capacity": locked_ws.max_capacity,
        "available_seats": max(0, locked_ws.max_capacity - (active_count + 1)),
    })

    return membership


def reject_join_request(db: Session, request_id: str, reviewer_id: str, data: RejectJoinRequest) -> None:
    req = repo.get_join_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Join request not found"}})
    if req.status != JoinRequestStatusEnum.PENDING:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_STATE", "message": f"Request is already {req.status}"}})

    workspace, reviewer_mem = get_workspace_for_member(db, req.workspace_id, reviewer_id)
    if reviewer_mem.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can reject requests"}})

    req.status = JoinRequestStatusEnum.REJECTED
    req.reviewed_by_id = reviewer_id
    req.reviewed_at = datetime.now(timezone.utc)
    req.rejection_reason = data.reason
    repo.save_join_request(db, req)

    # In-app notification to applicant
    repo.create_notification(
        db=db,
        user_id=req.user_id,
        workspace_id=req.workspace_id,
        type="join_request_rejected",
        title="Join Request Declined",
        message=f"Your request to join {workspace.name} was declined." + (f" Reason: {data.reason}" if data.reason else ""),
        data={"workspace_id": workspace.id, "workspace_name": workspace.name, "reason": data.reason},
    )

    # Targeted WebSocket event to applicant
    workspace_realtime_manager.send_to_user_sync(req.workspace_id, req.user_id, "workspace:join_request:rejected", {
        "request_id": req.id,
        "workspace_id": workspace.id,
        "workspace_name": workspace.name,
        "reason": data.reason,
    })


# ---- Email Invitation Accept / Decline ----

def accept_email_invitation(db: Session, user_id: str, token: Optional[str] = None, invitation_id: Optional[str] = None) -> WorkspaceMember:
    invitation = None
    if token:
        invitation = repo.get_invitation_by_token_hash(db, hash_token(token))
    elif invitation_id:
        invitation = repo.get_invitation_by_id(db, invitation_id)

    if not invitation:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Email invitation not found"}})

    if invitation.status != InvitationStatusEnum.ACTIVE:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_STATUS", "message": f"Invitation is {invitation.status}"}})

    from app.users.service import get_user_by_id
    current_user = get_user_by_id(db, user_id)
    if not current_user:
        raise HTTPException(status_code=401, detail={"error": {"code": "UNAUTHORIZED", "message": "User not found"}})

    # Check recipient identity
    if invitation.recipient_email and current_user.email.lower() != invitation.recipient_email.lower():
        raise HTTPException(
            status_code=403,
            detail={"error": {"code": "EMAIL_MISMATCH", "message": f"This invitation was addressed to {invitation.recipient_email}"}}
        )

    # Check already member
    existing = repo.get_membership(db, invitation.workspace_id, user_id)
    if existing:
        raise HTTPException(status_code=409, detail={"error": {"code": "ALREADY_MEMBER", "message": "You are already a member of this workspace"}})

    # Capacity check
    locked_ws = repo.get_workspace_with_lock(db, invitation.workspace_id)
    active_count = repo.count_members(db, invitation.workspace_id)
    if active_count >= locked_ws.max_capacity:
        raise HTTPException(status_code=409, detail={"error": {"code": "WORKSPACE_FULL", "message": "Workspace has reached its maximum member capacity"}})

    membership = repo.add_member(db, invitation.workspace_id, user_id, invitation.role)
    invitation.use_count += 1
    if invitation.max_uses and invitation.use_count >= invitation.max_uses:
        invitation.status = InvitationStatusEnum.EXHAUSTED
    repo.save_invitation(db, invitation)

    workspace_realtime_manager.broadcast_sync(invitation.workspace_id, "member:added", {
        "id": membership.id,
        "user_id": membership.user_id,
        "workspace_id": membership.workspace_id,
        "role": membership.role,
        "user_name": current_user.name,
        "user_email": current_user.email,
    })
    workspace_realtime_manager.broadcast_sync(invitation.workspace_id, "workspace:capacity:updated", {
        "workspace_id": invitation.workspace_id,
        "active_members": active_count + 1,
        "max_capacity": locked_ws.max_capacity,
        "available_seats": max(0, locked_ws.max_capacity - (active_count + 1)),
    })
    return membership


def decline_email_invitation(db: Session, user_id: str, token: Optional[str] = None, invitation_id: Optional[str] = None) -> None:
    invitation = None
    if token:
        invitation = repo.get_invitation_by_token_hash(db, hash_token(token))
    elif invitation_id:
        invitation = repo.get_invitation_by_id(db, invitation_id)

    if not invitation:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Email invitation not found"}})

    from app.users.service import get_user_by_id
    current_user = get_user_by_id(db, user_id)
    if not current_user:
        raise HTTPException(status_code=401, detail={"error": {"code": "UNAUTHORIZED", "message": "User not found"}})

    if invitation.recipient_email and current_user.email.lower() != invitation.recipient_email.lower():
        raise HTTPException(status_code=403, detail={"error": {"code": "EMAIL_MISMATCH", "message": "This invitation does not belong to you"}})

    invitation.status = InvitationStatusEnum.REVOKED
    invitation.revoked_at = datetime.now(timezone.utc)
    invitation.revoked_by_id = user_id
    repo.save_invitation(db, invitation)
