import pytest
from datetime import datetime, timezone, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import Base, get_db
from app.workspaces.models import (
    Workspace, WorkspaceMember, WorkspaceInvitation,
    WorkspaceJoinRequest, Notification, InvitationStatusEnum, JoinRequestStatusEnum
)

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_invitations.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


client = TestClient(app)


def register_and_login(name: str, email: str, password: str = "password123") -> str:
    client.post("/api/v1/auth/register", json={"name": name, "email": email, "password": password})
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    return resp.json()["access_token"]


def auth_header(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


token_owner = ""
token_member = ""
token_outsider1 = ""
token_outsider2 = ""


def setup_module(module):
    global token_owner, token_member, token_outsider1, token_outsider2
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db

    token_owner = register_and_login("Alice Owner", "alice@example.com")
    token_member = register_and_login("Bob Member", "bob@example.com")
    token_outsider1 = register_and_login("Charlie Applicant", "charlie@example.com")
    token_outsider2 = register_and_login("David Guest", "david@example.com")


def teardown_module(module):
    app.dependency_overrides.clear()


# ------------------------------------------------------------------------------
# Test 1 & 2: Workspace Creation with Capacity & Owner Counts as 1 Seat
# ------------------------------------------------------------------------------

def test_workspace_creation_with_capacity():
    resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Capacity Test WS", "description": "Testing limits", "max_capacity": 3, "requires_approval": True},
        headers=auth_header(token_owner),
    )
    assert resp.status_code == 201
    ws = resp.json()
    assert ws["max_capacity"] == 3
    assert ws["requires_approval"] is True

    # Query capacity
    cap_resp = client.get(f"/api/v1/workspaces/{ws['id']}/capacity", headers=auth_header(token_owner))
    assert cap_resp.status_code == 200
    cap = cap_resp.json()
    assert cap["max_capacity"] == 3
    assert cap["active_members"] == 1  # Owner occupies 1 seat
    assert cap["available_seats"] == 2
    assert cap["is_full"] is False


# ------------------------------------------------------------------------------
# Test 3 & 4: Link, Code, QR URL Validation & Status Transitions
# ------------------------------------------------------------------------------

def test_invitation_lifecycle_link_and_code():
    # 1. Create workspace
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Invite Flow WS", "max_capacity": 5, "requires_approval": True},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    # 2. Owner creates a LINK invitation
    inv_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations",
        json={"invitation_type": "LINK", "role": "MEMBER", "max_uses": 1, "expires_in_days": 1},
        headers=auth_header(token_owner),
    )
    assert inv_resp.status_code == 201
    inv_data = inv_resp.json()
    raw_token = inv_data["raw_token"]
    invite_code = inv_data["invite_code"]
    assert raw_token is not None
    assert invite_code is not None
    assert inv_data["invite_url"].startswith("/join/")

    # 3. Validate via token
    val_resp = client.get(f"/api/v1/workspaces/invitations/validate?token={raw_token}")
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    assert val_data["is_valid"] is True
    assert val_data["status"] == "ACTIVE"
    assert val_data["workspace_name"] == "Invite Flow WS"

    # 4. Validate via code
    val_code_resp = client.get(f"/api/v1/workspaces/invitations/validate?code={invite_code}")
    assert val_code_resp.status_code == 200
    assert val_code_resp.json()["is_valid"] is True

    # 5. Revoke invitation
    rev_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations/{inv_data['id']}/revoke",
        headers=auth_header(token_owner),
    )
    assert rev_resp.status_code == 204

    # 6. Validate revoked token
    val_rev_resp = client.get(f"/api/v1/workspaces/invitations/validate?token={raw_token}")
    assert val_rev_resp.status_code == 200
    assert val_rev_resp.json()["is_valid"] is False
    assert val_rev_resp.json()["status"] == "REVOKED"


# ------------------------------------------------------------------------------
# Test 5 & 6: Join Request Workflow & Duplicate Request Prevention
# ------------------------------------------------------------------------------

def test_join_request_workflow_and_duplicate_prevention():
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Approval WS", "max_capacity": 5, "requires_approval": True},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    inv_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations",
        json={"invitation_type": "LINK", "requires_approval": True},
        headers=auth_header(token_owner),
    )
    raw_token = inv_resp.json()["raw_token"]

    # Charlie submits join request
    join_resp = client.post(
        "/api/v1/workspaces/invitations/join",
        json={"token": raw_token, "message": "Hi, please add me!"},
        headers=auth_header(token_outsider1),
    )
    assert join_resp.status_code == 200
    assert join_resp.json()["status"] == "REQUESTED"
    req_id = join_resp.json()["request_id"]
    assert req_id is not None

    # Duplicate submission should return 409
    dup_resp = client.post(
        "/api/v1/workspaces/invitations/join",
        json={"token": raw_token, "message": "Trying again"},
        headers=auth_header(token_outsider1),
    )
    assert dup_resp.status_code == 409
    assert dup_resp.json()["detail"]["error"]["code"] == "DUPLICATE_REQUEST"

    # Charlie can see it in his my-requests
    my_reqs = client.get("/api/v1/workspaces/join-requests/my", headers=auth_header(token_outsider1))
    assert my_reqs.status_code == 200
    assert any(r["id"] == req_id for r in my_reqs.json())

    # Owner can see pending request in workspace queue
    admin_reqs = client.get(f"/api/v1/workspaces/{ws_id}/join-requests", headers=auth_header(token_owner))
    assert admin_reqs.status_code == 200
    assert any(r["id"] == req_id for r in admin_reqs.json())

    # Unauthorized user cannot see admin join requests
    unauth_reqs = client.get(f"/api/v1/workspaces/{ws_id}/join-requests", headers=auth_header(token_outsider2))
    assert unauth_reqs.status_code == 403


# ------------------------------------------------------------------------------
# Test 7 & 8: Approval, Self-Approval Prohibition, and Notifications
# ------------------------------------------------------------------------------

def test_approval_and_self_approval_prevention():
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Approval Rules WS", "max_capacity": 5, "requires_approval": True},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    inv_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations",
        json={"invitation_type": "LINK", "requires_approval": True},
        headers=auth_header(token_owner),
    )
    raw_token = inv_resp.json()["raw_token"]

    # Charlie requests to join
    join_resp = client.post(
        "/api/v1/workspaces/invitations/join",
        json={"token": raw_token},
        headers=auth_header(token_outsider1),
    )
    req_id = join_resp.json()["request_id"]

    # Charlie attempts to approve his own request -> 403 Forbidden
    self_appr = client.post(
        f"/api/v1/workspaces/join-requests/{req_id}/approve",
        headers=auth_header(token_outsider1),
    )
    assert self_appr.status_code == 403

    # Owner approves Charlie
    appr_resp = client.post(
        f"/api/v1/workspaces/join-requests/{req_id}/approve",
        headers=auth_header(token_owner),
    )
    assert appr_resp.status_code == 200
    assert appr_resp.json()["role"] == "MEMBER"

    # Charlie is now a member
    mem_check = client.get(f"/api/v1/workspaces/{ws_id}", headers=auth_header(token_outsider1))
    assert mem_check.status_code == 200

    # Charlie receives in-app notification
    notifs = client.get("/api/v1/users/notifications", headers=auth_header(token_outsider1))
    assert notifs.status_code == 200
    assert any(n["type"] == "join_request_approved" for n in notifs.json())


# ------------------------------------------------------------------------------
# Test 9 & 10: Capacity Strict Enforcement & Rejection When Full
# ------------------------------------------------------------------------------

def test_capacity_rejection_when_full():
    # Workspace with capacity 2 (Owner occupies 1 seat, only 1 seat left)
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Full WS", "max_capacity": 2, "requires_approval": True},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    inv_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations",
        json={"invitation_type": "LINK", "requires_approval": True},
        headers=auth_header(token_owner),
    )
    raw_token = inv_resp.json()["raw_token"]

    # 1. David requests and gets approved -> fills seat 2 of 2
    david_req = client.post("/api/v1/workspaces/invitations/join", json={"token": raw_token}, headers=auth_header(token_outsider2))
    req_id_david = david_req.json()["request_id"]
    client.post(f"/api/v1/workspaces/join-requests/{req_id_david}/approve", headers=auth_header(token_owner))

    # Verify workspace is now full
    cap_resp = client.get(f"/api/v1/workspaces/{ws_id}/capacity", headers=auth_header(token_owner))
    assert cap_resp.json()["is_full"] is True
    assert cap_resp.json()["available_seats"] == 0

    # 2. Try adding a member directly when full -> 409
    direct_add = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "charlie@example.com", "role": "MEMBER"},
        headers=auth_header(token_owner),
    )
    assert direct_add.status_code == 409
    assert direct_add.json()["detail"]["error"]["code"] == "WORKSPACE_FULL"

    # 3. Validation returns is_full: True
    val_full = client.get(f"/api/v1/workspaces/invitations/validate?token={raw_token}")
    assert val_full.status_code == 200
    assert val_full.json()["is_full"] is True
    assert val_full.json()["is_valid"] is False


# ------------------------------------------------------------------------------
# Test 11 & 12: Email Recipient Identity Checks & Decline
# ------------------------------------------------------------------------------

def test_email_invitation_identity_checks():
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Email WS", "max_capacity": 10},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    # Send invitation intended for david@example.com
    inv_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations",
        json={"invitation_type": "EMAIL", "recipient_email": "david@example.com", "requires_approval": False},
        headers=auth_header(token_owner),
    )
    assert inv_resp.status_code == 201
    raw_token = inv_resp.json()["raw_token"]
    inv_id = inv_resp.json()["id"]

    # Charlie (charlie@example.com) attempts to accept -> 403 EMAIL_MISMATCH
    wrong_accept = client.post(
        "/api/v1/workspaces/invitations/email/accept",
        json={"token": raw_token},
        headers=auth_header(token_outsider1),
    )
    assert wrong_accept.status_code == 403
    assert wrong_accept.json()["detail"]["error"]["code"] == "EMAIL_MISMATCH"

    # David accepts -> succeeds
    david_accept = client.post(
        "/api/v1/workspaces/invitations/email/accept",
        json={"token": raw_token},
        headers=auth_header(token_outsider2),
    )
    assert david_accept.status_code == 200
    assert david_accept.json()["user_email"] == "david@example.com"


# ------------------------------------------------------------------------------
# Test 13 & 14: Rate Limiting Protection on Invite Code Enumeration
# ------------------------------------------------------------------------------

def test_invite_code_rate_limiting():
    # Make multiple invalid code requests from a single client
    client_test = TestClient(app)
    for _ in range(10):
        client_test.get("/api/v1/workspaces/invitations/validate?code=BADCODE99")

    # The 11th attempt should trigger 429 Too Many Requests
    rate_limited = client_test.get("/api/v1/workspaces/invitations/validate?code=BADCODE99")
    assert rate_limited.status_code == 429
    assert rate_limited.json()["detail"]["error"]["code"] == "RATE_LIMITED"


# ------------------------------------------------------------------------------
# Test 15: Removed Member Loses Access & Capacity Restores
# ------------------------------------------------------------------------------

def test_removed_member_loses_access():
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Removal WS", "max_capacity": 2},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    # Add Bob
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "bob@example.com", "role": "MEMBER"},
        headers=auth_header(token_owner),
    )

    # Bob can access
    assert client.get(f"/api/v1/workspaces/{ws_id}", headers=auth_header(token_member)).status_code == 200

    # Get Bob's user id
    members = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=auth_header(token_owner)).json()
    bob_record = next(m for m in members if m["user_email"] == "bob@example.com")

    # Remove Bob
    del_resp = client.delete(
        f"/api/v1/workspaces/{ws_id}/members/{bob_record['user_id']}",
        headers=auth_header(token_owner),
    )
    assert del_resp.status_code == 204

    # Bob can no longer access
    assert client.get(f"/api/v1/workspaces/{ws_id}", headers=auth_header(token_member)).status_code == 403

    # Capacity restores available seats
    cap = client.get(f"/api/v1/workspaces/{ws_id}/capacity", headers=auth_header(token_owner)).json()
    assert cap["active_members"] == 1
    assert cap["available_seats"] == 1


# ------------------------------------------------------------------------------
# Test 16: Cancel Join Request
# ------------------------------------------------------------------------------

def test_cancel_join_request():
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Cancel WS", "max_capacity": 5, "requires_approval": True},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    inv_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations",
        json={"invitation_type": "LINK", "requires_approval": True},
        headers=auth_header(token_owner),
    )
    raw_token = inv_resp.json()["raw_token"]

    join_resp = client.post(
        "/api/v1/workspaces/invitations/join",
        json={"token": raw_token},
        headers=auth_header(token_outsider1),
    )
    req_id = join_resp.json()["request_id"]

    # Charlie cancels his request
    cancel_resp = client.post(
        f"/api/v1/workspaces/join-requests/{req_id}/cancel",
        headers=auth_header(token_outsider1),
    )
    assert cancel_resp.status_code == 204

    # Approving cancelled request fails
    appr_fail = client.post(
        f"/api/v1/workspaces/join-requests/{req_id}/approve",
        headers=auth_header(token_owner),
    )
    assert appr_fail.status_code == 400


# ------------------------------------------------------------------------------
# Test 17: Reject Join Request with Reason
# ------------------------------------------------------------------------------

def test_reject_join_request():
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Reject WS", "max_capacity": 5, "requires_approval": True},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    inv_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations",
        json={"invitation_type": "LINK", "requires_approval": True},
        headers=auth_header(token_owner),
    )
    raw_token = inv_resp.json()["raw_token"]

    join_resp = client.post(
        "/api/v1/workspaces/invitations/join",
        json={"token": raw_token},
        headers=auth_header(token_outsider1),
    )
    req_id = join_resp.json()["request_id"]

    # Owner rejects with reason
    rej_resp = client.post(
        f"/api/v1/workspaces/join-requests/{req_id}/reject",
        json={"reason": "Profile does not match requirements"},
        headers=auth_header(token_owner),
    )
    assert rej_resp.status_code == 204

    # Rejection notification sent to Charlie
    notifs = client.get("/api/v1/users/notifications", headers=auth_header(token_outsider1)).json()
    rej_notif = next(n for n in notifs if n["type"] == "join_request_rejected")
    assert "Profile does not match requirements" in rej_notif["message"]


# ------------------------------------------------------------------------------
# Test 18: Regenerate Invitation
# ------------------------------------------------------------------------------

def test_regenerate_invitation():
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Regen WS", "max_capacity": 5},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    inv1 = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations",
        json={"invitation_type": "LINK"},
        headers=auth_header(token_owner),
    ).json()

    regen_resp = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations/{inv1['id']}/regenerate",
        headers=auth_header(token_owner),
    )
    assert regen_resp.status_code == 200
    inv2 = regen_resp.json()
    assert inv2["raw_token"] != inv1["raw_token"]
    assert inv2["invite_code"] != inv1["invite_code"]

    # Old token is now revoked
    val_old = client.get(f"/api/v1/workspaces/invitations/validate?token={inv1['raw_token']}")
    assert val_old.json()["status"] == "REVOKED"

    # New token is active
    val_new = client.get(f"/api/v1/workspaces/invitations/validate?token={inv2['raw_token']}")
    assert val_new.json()["status"] == "ACTIVE"


# ------------------------------------------------------------------------------
# Test 19: Direct Join Without Approval & Exhaustion
# ------------------------------------------------------------------------------

def test_direct_join_without_approval_and_exhaustion():
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Direct Join WS", "max_capacity": 5, "requires_approval": False},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    # Single-use invitation (max_uses=1)
    inv = client.post(
        f"/api/v1/workspaces/{ws_id}/invitations",
        json={"invitation_type": "LINK", "requires_approval": False, "max_uses": 1},
        headers=auth_header(token_owner),
    ).json()

    # Charlie directly joins
    join_resp = client.post(
        "/api/v1/workspaces/invitations/join",
        json={"token": inv["raw_token"]},
        headers=auth_header(token_outsider1),
    )
    assert join_resp.status_code == 200
    assert join_resp.json()["status"] == "JOINED"

    # Invitation should now be exhausted
    val_exh = client.get(f"/api/v1/workspaces/invitations/validate?token={inv['raw_token']}")
    assert val_exh.json()["status"] == "EXHAUSTED"

    # Second user trying to join with exhausted token fails
    join_fail = client.post(
        "/api/v1/workspaces/invitations/join",
        json={"token": inv["raw_token"]},
        headers=auth_header(token_outsider2),
    )
    assert join_fail.status_code == 410
    assert join_fail.json()["detail"]["error"]["code"] == "INVITATION_EXHAUSTED"


# ------------------------------------------------------------------------------
# Test 20: Notification Read Status Operations
# ------------------------------------------------------------------------------

def test_notifications_read_endpoints():
    notifs = client.get("/api/v1/users/notifications", headers=auth_header(token_outsider1)).json()
    assert len(notifs) > 0
    notif_id = notifs[0]["id"]

    # Mark single read
    read_resp = client.patch(f"/api/v1/users/notifications/{notif_id}/read", headers=auth_header(token_outsider1))
    assert read_resp.status_code == 200
    assert read_resp.json()["is_read"] is True

    # Mark all read
    all_read = client.patch("/api/v1/users/notifications/read-all", headers=auth_header(token_outsider1))
    assert all_read.status_code == 200
    assert "updated_count" in all_read.json()


def test_non_owner_cannot_update_capacity():
    """Verify that regular members cannot update capacity and member_count is accurate."""
    ws_resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Lockdown WS", "max_capacity": 10},
        headers=auth_header(token_owner),
    )
    ws_id = ws_resp.json()["id"]

    # Add Bob as member
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "bob@example.com", "role": "MEMBER"},
        headers=auth_header(token_owner),
    )

    # Bob attempts to PATCH capacity -> must return 403 Forbidden
    patch_resp = client.patch(
        f"/api/v1/workspaces/{ws_id}/capacity",
        json={"max_capacity": 50},
        headers=auth_header(token_member),
    )
    assert patch_resp.status_code == 403

    # Verify GET /api/v1/workspaces includes accurate member_count and owner_name
    list_resp = client.get("/api/v1/workspaces", headers=auth_header(token_member))
    assert list_resp.status_code == 200
    item = next(w for w in list_resp.json() if w["id"] == ws_id)
    assert item["member_count"] == 2
    assert item["owner_name"] == "Alice Owner"


