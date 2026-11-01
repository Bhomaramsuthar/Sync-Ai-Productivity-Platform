import asyncio
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, status, WebSocket, WebSocketDisconnect, Query, Request
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db, SessionLocal
from app.auth.dependencies import get_current_user
from app.users.models import User
from app.core.security import decode_token
from app.core.realtime import workspace_realtime_manager
from . import service
from .schemas import (
    WorkspaceCreate, WorkspaceUpdate, WorkspaceResponse, WorkspaceWithRole,
    WorkspaceCapacityResponse, UpdateCapacityRequest,
    MemberResponse, AddMemberRequest, UpdateMemberRoleRequest,
    InvitationCreateRequest, InvitationResponse, ValidateInvitationResponse,
    JoinWorkspaceRequest, JoinWorkspaceResponse,
    AcceptEmailInviteRequest, DeclineEmailInviteRequest,
    JoinRequestResponse, RejectJoinRequest,
    NotificationResponse,
)

logger = logging.getLogger("ai_productivity_platform.workspaces")
router = APIRouter()


def _member_to_response(m) -> dict:
    return {
        "id": m.id,
        "user_id": m.user_id,
        "workspace_id": m.workspace_id,
        "role": m.role,
        "joined_at": m.joined_at,
        "user_name": m.user.name if m.user else "",
        "user_email": m.user.email if m.user else "",
    }


# ==============================================================================
# Non-parameterized routes (MUST be defined before /{workspace_id})
# ==============================================================================

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
        active_count = repo.count_members(db, ws.id)
        owner_name = ws.owner.name if ws.owner else None
        result.append({
            **WorkspaceResponse.model_validate(ws).model_dump(),
            "current_user_role": membership.role,
            "member_count": active_count,
            "owner_name": owner_name,
        })
    return result


@router.get("/invitations/validate", response_model=ValidateInvitationResponse)
def validate_invitation_route(
    request: Request,
    token: Optional[str] = Query(None),
    code: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    client_ip = request.client.host if request.client else "unknown"
    return service.validate_invitation(db, token=token, code=code, client_identifier=client_ip)


@router.post("/invitations/join", response_model=JoinWorkspaceResponse)
def join_workspace_route(
    data: JoinWorkspaceRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.join_or_request_workspace(
        db=db,
        user_id=current_user.id,
        token=data.token,
        code=data.code,
        message=data.message,
    )


@router.post("/invitations/email/accept", response_model=MemberResponse)
def accept_email_invite_route(
    data: AcceptEmailInviteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = service.accept_email_invitation(
        db=db,
        user_id=current_user.id,
        token=data.token,
        invitation_id=data.invitation_id,
    )
    from . import repository as repo
    membership = repo.get_membership(db, membership.workspace_id, membership.user_id)
    return _member_to_response(membership)


@router.post("/invitations/email/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_email_invite_route(
    data: DeclineEmailInviteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.decline_email_invitation(
        db=db,
        user_id=current_user.id,
        token=data.token,
        invitation_id=data.invitation_id,
    )


@router.get("/join-requests/my", response_model=List[JoinRequestResponse])
def list_my_join_requests_route(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.list_my_join_requests(db, current_user.id)


@router.post("/join-requests/{request_id}/cancel", status_code=status.HTTP_204_NO_CONTENT)
def cancel_join_request_route(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.cancel_join_request(db, request_id, current_user.id)


@router.post("/join-requests/{request_id}/approve", response_model=MemberResponse)
def approve_join_request_route(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = service.approve_join_request(db, request_id, current_user.id)
    from . import repository as repo
    membership = repo.get_membership(db, membership.workspace_id, membership.user_id)
    return _member_to_response(membership)


@router.post("/join-requests/{request_id}/reject", status_code=status.HTTP_204_NO_CONTENT)
def reject_join_request_route(
    request_id: str,
    data: RejectJoinRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.reject_join_request(db, request_id, current_user.id, data)


# ---- Notifications Routes ----

@router.get("/notifications/my", response_model=List[NotificationResponse])
def get_my_notifications_route(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from . import repository as repo
    notifs = repo.get_user_notifications(db, current_user.id)
    return [
        {
            "id": n.id,
            "user_id": n.user_id,
            "workspace_id": n.workspace_id,
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "data": n.data,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in notifs
    ]


@router.patch("/notifications/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read_route(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from . import repository as repo
    notif = repo.mark_notification_read(db, notification_id, current_user.id)
    if not notif:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Notification not found"}})
    return {
        "id": notif.id,
        "user_id": notif.user_id,
        "workspace_id": notif.workspace_id,
        "type": notif.type,
        "title": notif.title,
        "message": notif.message,
        "data": notif.data,
        "is_read": notif.is_read,
        "created_at": notif.created_at,
    }


@router.patch("/notifications/read-all")
def mark_all_notifications_read_route(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from . import repository as repo
    count = repo.mark_all_notifications_read(db, current_user.id)
    return {"updated_count": count}


# ==============================================================================
# Workspace-parameterized routes (/{workspace_id}/...)
# ==============================================================================

@router.get("/{workspace_id}", response_model=WorkspaceWithRole)
def get_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from . import repository as repo
    workspace, membership = service.get_workspace_for_member(db, workspace_id, current_user.id)
    active_count = repo.count_members(db, workspace.id)
    owner_name = workspace.owner.name if workspace.owner else None
    return {
        **WorkspaceResponse.model_validate(workspace).model_dump(),
        "current_user_role": membership.role,
        "member_count": active_count,
        "owner_name": owner_name,
    }


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace(
    workspace_id: str,
    data: WorkspaceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workspace = service.update_workspace(db, workspace_id, current_user.id, data)
    workspace_realtime_manager.broadcast_sync(workspace_id, "workspace:updated", {
        "id": workspace.id,
        "name": workspace.name,
        "description": workspace.description,
        "max_capacity": workspace.max_capacity,
        "requires_approval": workspace.requires_approval,
    })
    return workspace


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_workspace(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.delete_workspace(db, workspace_id, current_user.id)
    workspace_realtime_manager.broadcast_sync(workspace_id, "workspace:deleted", {"id": workspace_id})
    workspace_realtime_manager.disconnect_all_sync(workspace_id)


# ---- Capacity ----

@router.get("/{workspace_id}/capacity", response_model=WorkspaceCapacityResponse)
def get_workspace_capacity_route(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.get_workspace_capacity(db, workspace_id, current_user.id)


@router.patch("/{workspace_id}/capacity", response_model=WorkspaceCapacityResponse)
def update_workspace_capacity_route(
    workspace_id: str,
    data: UpdateCapacityRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.update_workspace_capacity(db, workspace_id, current_user.id, data)


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
    from . import repository as repo
    membership = repo.get_membership(db, workspace_id, membership.user_id)
    resp = _member_to_response(membership)
    workspace_realtime_manager.broadcast_sync(workspace_id, "member:added", resp)
    return resp


@router.patch("/{workspace_id}/members/{user_id}", response_model=MemberResponse)
def update_member_role(
    workspace_id: str,
    user_id: str,
    data: UpdateMemberRoleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    membership = service.update_member_role(db, workspace_id, current_user.id, user_id, data)
    resp = _member_to_response(membership)
    workspace_realtime_manager.broadcast_sync(workspace_id, "member:updated", resp)
    return resp


@router.delete("/{workspace_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    workspace_id: str,
    user_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.remove_member(db, workspace_id, current_user.id, user_id)
    workspace_realtime_manager.broadcast_sync(workspace_id, "member:removed", {
        "user_id": user_id,
        "workspace_id": workspace_id,
    })
    workspace_realtime_manager.disconnect_user_sync(workspace_id, user_id)
    from . import repository as repo
    active_count = repo.count_members(db, workspace_id)
    ws = repo.get_workspace(db, workspace_id)
    if ws:
        workspace_realtime_manager.broadcast_sync(workspace_id, "workspace:capacity:updated", {
            "workspace_id": workspace_id,
            "active_members": active_count,
            "max_capacity": ws.max_capacity,
            "available_seats": max(0, ws.max_capacity - active_count),
        })


# ---- Workspace Invitations ----

@router.post("/{workspace_id}/invitations", response_model=InvitationResponse, status_code=status.HTTP_201_CREATED)
def create_invitation_route(
    workspace_id: str,
    data: InvitationCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.create_invitation(db, workspace_id, current_user.id, data)


@router.get("/{workspace_id}/invitations", response_model=List[InvitationResponse])
def list_invitations_route(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.list_invitations(db, workspace_id, current_user.id)


@router.post("/{workspace_id}/invitations/{invitation_id}/revoke", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invitation_route(
    workspace_id: str,
    invitation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.revoke_invitation(db, workspace_id, invitation_id, current_user.id)


@router.post("/{workspace_id}/invitations/{invitation_id}/regenerate", response_model=InvitationResponse)
def regenerate_invitation_route(
    workspace_id: str,
    invitation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.regenerate_invitation(db, workspace_id, invitation_id, current_user.id)


# ---- Workspace Join Requests (Admin View) ----

@router.get("/{workspace_id}/join-requests", response_model=List[JoinRequestResponse])
def list_workspace_join_requests_route(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.list_workspace_join_requests(db, workspace_id, current_user.id)


# ---- Real-Time WebSocket Endpoint ----

@router.websocket("/{workspace_id}/ws")
async def workspace_realtime_ws(
    websocket: WebSocket,
    workspace_id: str,
    token: Optional[str] = Query(None),
):
    """Authenticated real-time event synchronization stream for members of a workspace."""
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing authentication token")
        return

    payload = decode_token(token)
    if not payload or not payload.get("sub"):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired token")
        return

    user_id = str(payload["sub"])

    from app.main import app as main_app
    override = main_app.dependency_overrides.get(get_db)
    if override:
        gen = override()
        db = next(gen)
    else:
        gen = None
        db = SessionLocal()

    is_authorized = False
    try:
        from . import repository as repo
        membership = repo.get_membership(db, workspace_id, user_id)
        if membership:
            is_authorized = True
        else:
            ws = repo.get_workspace(db, workspace_id)
            if ws and str(ws.owner_id) == user_id:
                is_authorized = True
    finally:
        if gen:
            try:
                next(gen)
            except StopIteration:
                pass
        else:
            db.close()

    if not is_authorized:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Not a member of this workspace")
        return

    await workspace_realtime_manager.connect(websocket, workspace_id, user_id)
    try:
        await websocket.send_json({
            "type": "connected",
            "workspace_id": workspace_id,
            "user_id": user_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        while True:
            text = await websocket.receive_text()
            if text == "ping" or '"ping"' in text:
                await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    except Exception as exc:
        logger.debug("WebSocket error in workspace %s for user %s: %s", workspace_id, user_id, exc)
    finally:
        await workspace_realtime_manager.disconnect(websocket, workspace_id, user_id)
