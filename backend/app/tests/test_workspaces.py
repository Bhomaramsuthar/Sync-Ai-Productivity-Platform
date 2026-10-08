import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import Base, get_db
from app.users.models import User
from app.workspaces.models import Workspace, WorkspaceMember

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_workspace.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
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

token_a = ""
token_b = ""
token_c = ""

def setup_module(module):
    global token_a, token_b, token_c
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    
    token_a = register_and_login("User A", "usera@example.com")
    token_b = register_and_login("User B", "userb@example.com")
    token_c = register_and_login("User C", "userc@example.com")

def teardown_module(module):
    app.dependency_overrides.clear()


# ---- Workspace CRUD ----

def test_create_workspace():
    resp = client.post(
        "/api/v1/workspaces",
        json={"name": "Test Workspace", "description": "A test workspace"},
        headers=auth_header(token_a),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Workspace"
    assert "id" in data


def test_create_workspace_unauthenticated():
    resp = client.post("/api/v1/workspaces", json={"name": "Fail"})
    assert resp.status_code in (401, 403)


def test_creator_is_owner():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    assert resp.status_code == 200
    workspaces = resp.json()
    assert len(workspaces) >= 1
    ws = workspaces[0]
    assert ws["current_user_role"] == "OWNER"


def test_workspace_appears_in_list():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    assert resp.status_code == 200
    assert any(w["name"] == "Test Workspace" for w in resp.json())


def test_other_user_workspace_not_exposed():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_b))
    assert resp.status_code == 200
    assert not any(w["name"] == "Test Workspace" for w in resp.json())


def test_member_can_access_workspace():
    # Get workspace id
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    # Add user B
    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "userb@example.com", "role": "MEMBER"},
        headers=auth_header(token_a),
    )

    # User B can now access
    resp = client.get(f"/api/v1/workspaces/{ws_id}", headers=auth_header(token_b))
    assert resp.status_code == 200


def test_non_member_cannot_access_workspace():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    resp = client.get(f"/api/v1/workspaces/{ws_id}", headers=auth_header(token_c))
    assert resp.status_code == 403


def test_owner_can_update_workspace():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    resp = client.patch(
        f"/api/v1/workspaces/{ws_id}",
        json={"name": "Updated Workspace"},
        headers=auth_header(token_a),
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Workspace"


def test_member_cannot_update_workspace():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    resp = client.patch(
        f"/api/v1/workspaces/{ws_id}",
        json={"name": "Hacked"},
        headers=auth_header(token_b),
    )
    assert resp.status_code == 403


# ---- Members ----

def test_member_list_visible():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    resp = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=auth_header(token_a))
    assert resp.status_code == 200
    members = resp.json()
    assert len(members) >= 2
    for m in members:
        assert "password_hash" not in str(m)


def test_duplicate_membership_rejected():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    resp = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "userb@example.com", "role": "MEMBER"},
        headers=auth_header(token_a),
    )
    assert resp.status_code == 409


def test_nonexistent_user_rejected():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    resp = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "nobody@example.com", "role": "MEMBER"},
        headers=auth_header(token_a),
    )
    assert resp.status_code == 404


def test_member_cannot_add_members():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    resp = client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "userc@example.com", "role": "MEMBER"},
        headers=auth_header(token_b),
    )
    assert resp.status_code == 403


def test_owner_can_change_role():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    # Get user B's id
    members = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=auth_header(token_a)).json()
    user_b_id = [m for m in members if m["user_email"] == "userb@example.com"][0]["user_id"]

    resp = client.patch(
        f"/api/v1/workspaces/{ws_id}/members/{user_b_id}",
        json={"role": "ADMIN"},
        headers=auth_header(token_a),
    )
    assert resp.status_code == 200
    assert resp.json()["role"] == "ADMIN"


def test_member_cannot_change_role():
    # Add user C as MEMBER first
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "userc@example.com", "role": "MEMBER"},
        headers=auth_header(token_a),
    )

    members = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=auth_header(token_a)).json()
    user_b_id = [m for m in members if m["user_email"] == "userb@example.com"][0]["user_id"]

    resp = client.patch(
        f"/api/v1/workspaces/{ws_id}/members/{user_b_id}",
        json={"role": "MEMBER"},
        headers=auth_header(token_c),
    )
    assert resp.status_code == 403


def test_admin_cannot_promote_to_owner():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    members = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=auth_header(token_a)).json()
    user_c_id = [m for m in members if m["user_email"] == "userc@example.com"][0]["user_id"]

    # User B is ADMIN now
    resp = client.patch(
        f"/api/v1/workspaces/{ws_id}/members/{user_c_id}",
        json={"role": "OWNER"},
        headers=auth_header(token_b),
    )
    assert resp.status_code == 403


def test_member_cannot_remove_members():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    members = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=auth_header(token_a)).json()
    user_b_id = [m for m in members if m["user_email"] == "userb@example.com"][0]["user_id"]

    resp = client.delete(
        f"/api/v1/workspaces/{ws_id}/members/{user_b_id}",
        headers=auth_header(token_c),
    )
    assert resp.status_code == 403


def test_final_owner_cannot_be_removed():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    # Get owner user id
    members = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=auth_header(token_a)).json()
    owner_id = [m for m in members if m["role"] == "OWNER"][0]["user_id"]

    resp = client.delete(
        f"/api/v1/workspaces/{ws_id}/members/{owner_id}",
        headers=auth_header(token_a),
    )
    assert resp.status_code == 400


def test_authorized_user_can_remove_member():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    members = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=auth_header(token_a)).json()
    user_c_id = [m for m in members if m["user_email"] == "userc@example.com"][0]["user_id"]

    resp = client.delete(
        f"/api/v1/workspaces/{ws_id}/members/{user_c_id}",
        headers=auth_header(token_a),
    )
    assert resp.status_code == 204


def test_password_hash_never_in_member_response():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    resp = client.get(f"/api/v1/workspaces/{ws_id}/members", headers=auth_header(token_a))
    raw = resp.text
    assert "password_hash" not in raw
    assert "password" not in raw


# ---- Authorization edge cases ----

def test_missing_jwt_returns_401_or_403():
    resp = client.get("/api/v1/workspaces")
    assert resp.status_code in (401, 403)


def test_invalid_jwt_returns_401():
    resp = client.get("/api/v1/workspaces", headers={"Authorization": "Bearer invalid"})
    assert resp.status_code == 401


def test_non_member_returns_403():
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    resp = client.get(f"/api/v1/workspaces/{ws_id}", headers=auth_header(token_c))
    assert resp.status_code == 403


def test_valid_member_attempting_owner_action_returns_403():
    # Re-add user C as MEMBER
    resp = client.get("/api/v1/workspaces", headers=auth_header(token_a))
    ws_id = resp.json()[0]["id"]

    client.post(
        f"/api/v1/workspaces/{ws_id}/members",
        json={"email": "userc@example.com", "role": "MEMBER"},
        headers=auth_header(token_a),
    )

    resp = client.delete(f"/api/v1/workspaces/{ws_id}", headers=auth_header(token_c))
    assert resp.status_code == 403


def test_owner_can_delete_workspace():
    # Create a new workspace specifically for deletion test
    resp = client.post(
        "/api/v1/workspaces",
        json={"name": "To Delete", "description": "will be deleted"},
        headers=auth_header(token_a),
    )
    ws_id = resp.json()["id"]

    resp = client.delete(f"/api/v1/workspaces/{ws_id}", headers=auth_header(token_a))
    assert resp.status_code == 204

    # Verify it's gone
    resp = client.get(f"/api/v1/workspaces/{ws_id}", headers=auth_header(token_a))
    assert resp.status_code == 404
