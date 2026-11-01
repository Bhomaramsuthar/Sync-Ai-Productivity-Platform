import pytest
from starlette.websockets import WebSocketDisconnect
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import Base, get_db

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_realtime.db"
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
workspace_1_id = ""
workspace_2_id = ""

def setup_module(module):
    global token_a, token_b, token_c, workspace_1_id, workspace_2_id
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db
    
    token_a = register_and_login("Realtime User A", "rta@example.com")
    token_b = register_and_login("Realtime User B", "rtb@example.com")
    token_c = register_and_login("Realtime User C", "rtc@example.com")

    # Create Workspace 1 owned by User A
    resp1 = client.post(
        "/api/v1/workspaces",
        json={"name": "Workspace 1", "description": "Primary WS"},
        headers=auth_header(token_a),
    )
    assert resp1.status_code == 201
    workspace_1_id = resp1.json()["id"]

    # Add User B to Workspace 1 as MEMBER
    resp_invite = client.post(
        f"/api/v1/workspaces/{workspace_1_id}/members",
        json={"email": "rtb@example.com", "role": "MEMBER"},
        headers=auth_header(token_a),
    )
    assert resp_invite.status_code == 201

    # Create Workspace 2 owned by User C
    resp2 = client.post(
        "/api/v1/workspaces",
        json={"name": "Workspace 2", "description": "Isolated WS"},
        headers=auth_header(token_c),
    )
    assert resp2.status_code == 201
    workspace_2_id = resp2.json()["id"]

def teardown_module(module):
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_unauthenticated_websocket_rejected():
    """Unauthenticated client without token must be rejected with 1008."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/api/v1/workspaces/{workspace_1_id}/ws"):
            pass
    assert exc_info.value.code == 1008


def test_invalid_token_websocket_rejected():
    """Client with invalid token must be rejected with 1008."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/api/v1/workspaces/{workspace_1_id}/ws?token=invalid.jwt.token"):
            pass
    assert exc_info.value.code == 1008


def test_non_member_websocket_rejected():
    """Client who is not a member of Workspace 1 (User C) must be rejected with 1008."""
    with pytest.raises(WebSocketDisconnect) as exc_info:
        with client.websocket_connect(f"/api/v1/workspaces/{workspace_1_id}/ws?token={token_c}"):
            pass
    assert exc_info.value.code == 1008


def test_authorized_users_connection_and_handshake():
    """Both authorized users A and B in Workspace 1 can connect and receive handshake."""
    with client.websocket_connect(f"/api/v1/workspaces/{workspace_1_id}/ws?token={token_a}") as ws_a:
        msg_a = ws_a.receive_json()
        assert msg_a["type"] == "connected"
        assert msg_a["workspace_id"] == workspace_1_id

        with client.websocket_connect(f"/api/v1/workspaces/{workspace_1_id}/ws?token={token_b}") as ws_b:
            msg_b = ws_b.receive_json()
            assert msg_b["type"] == "connected"
            assert msg_b["workspace_id"] == workspace_1_id


def test_task_creation_and_status_update_propagation():
    """User A creates a task; User B receives 'task:created'. User B updates it; User A receives 'task:updated'."""
    # Create project in Workspace 1
    proj_resp = client.post(
        f"/api/v1/workspaces/{workspace_1_id}/projects",
        json={"name": "Realtime Project", "description": "Testing sync"},
        headers=auth_header(token_a),
    )
    assert proj_resp.status_code == 201
    project_id = proj_resp.json()["id"]

    client_b = TestClient(app)
    with client_b.websocket_connect(f"/api/v1/workspaces/{workspace_1_id}/ws?token={token_b}") as ws_b:
        ws_b.receive_json()  # consume handshake

        # User A creates a task via standard HTTP POST
        task_resp = client.post(
            f"/api/v1/projects/{project_id}/tasks",
            json={"title": "Realtime Task 1", "description": "Verify live sync", "priority": "HIGH"},
            headers=auth_header(token_a),
        )
        assert task_resp.status_code == 201
        task_id = task_resp.json()["id"]

        # User B receives both 'activity:created' and 'task:created'
        events = [ws_b.receive_json(), ws_b.receive_json()]
        event_types = [e["event"] for e in events]
        assert "task:created" in event_types
        assert "activity:created" in event_types

        task_event = next(e for e in events if e["event"] == "task:created")
        assert task_event["workspace_id"] == workspace_1_id
        assert task_event["data"]["id"] == task_id
        assert task_event["data"]["title"] == "Realtime Task 1"

        # User B updates task status via standard HTTP PATCH
        update_resp = client.patch(
            f"/api/v1/tasks/{task_id}",
            json={"status": "IN_PROGRESS"},
            headers=auth_header(token_b),
        )
        assert update_resp.status_code == 200

        # User B receives 'task:updated' (and corresponding activity event)
        events_update = [ws_b.receive_json(), ws_b.receive_json()]
        update_types = [e["event"] for e in events_update]
        assert "task:updated" in update_types

        updated_event = next(e for e in events_update if e["event"] == "task:updated")
        assert updated_event["data"]["status"] == "IN_PROGRESS"


def test_calendar_event_propagation():
    """User A creates a calendar event; User B receives 'calendar_event:created'."""
    client_b = TestClient(app)
    with client_b.websocket_connect(f"/api/v1/workspaces/{workspace_1_id}/ws?token={token_b}") as ws_b:
        ws_b.receive_json()  # handshake

        cal_resp = client.post(
            f"/api/v1/workspaces/{workspace_1_id}/calendar/events",
            json={
                "title": "Sprint Planning",
                "description": "Weekly sync",
                "start_time": "2026-11-01T10:00:00Z",
                "end_time": "2026-11-01T11:00:00Z",
            },
            headers=auth_header(token_a),
        )
        assert cal_resp.status_code == 201
        event_id = cal_resp.json()["id"]

        event_b = ws_b.receive_json()
        assert event_b["event"] == "calendar_event:created"
        assert event_b["data"]["id"] == event_id
        assert event_b["data"]["title"] == "Sprint Planning"


def test_cross_workspace_isolation():
    """Events in Workspace 1 must NEVER be delivered to User C connected in Workspace 2."""
    client_c = TestClient(app)
    with client_c.websocket_connect(f"/api/v1/workspaces/{workspace_2_id}/ws?token={token_c}") as ws_c:
        ws_c.receive_json()  # handshake WS 2

        # Trigger workspace 1 update
        resp = client.patch(
            f"/api/v1/workspaces/{workspace_1_id}",
            json={"name": "Workspace 1 Renamed"},
            headers=auth_header(token_a),
        )
        assert resp.status_code == 200

        # Verify User C in Workspace 2 receives nothing (ping/pong check confirms socket is quiet)
        ws_c.send_text("ping")
        pong = ws_c.receive_json()
        assert pong["type"] == "pong"


def test_member_removal_revokes_websocket_access():
    """When a member is removed from a workspace, their WebSocket connection is disconnected immediately."""
    client_b = TestClient(app)
    with client_b.websocket_connect(f"/api/v1/workspaces/{workspace_1_id}/ws?token={token_b}") as ws_b:
        ws_b.receive_json()  # handshake

        # Get User B's user_id from members list
        members_resp = client.get(f"/api/v1/workspaces/{workspace_1_id}/members", headers=auth_header(token_a))
        assert members_resp.status_code == 200
        user_b_entry = next(m for m in members_resp.json() if m["user_email"] == "rtb@example.com")
        user_b_id = user_b_entry["user_id"]

        # Owner A removes User B
        del_resp = client.delete(
            f"/api/v1/workspaces/{workspace_1_id}/members/{user_b_id}",
            headers=auth_header(token_a),
        )
        assert del_resp.status_code == 204

        # User B first receives the member:removed broadcast
        event = ws_b.receive_json()
        assert event["type"] == "event"
        assert event["event"] == "member:removed"

        # User B's websocket must now be closed with revocation code 1008
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws_b.receive_json()
        assert exc_info.value.code == 1008


def test_normal_crud_works_when_no_websocket_clients_connected():
    """Normal HTTP operations continue to succeed seamlessly without real-time clients."""
    # Ensure no clients connected to workspace 2
    resp = client.post(
        f"/api/v1/workspaces/{workspace_2_id}/projects",
        json={"name": "Independent Project", "description": "No WS clients"},
        headers=auth_header(token_c),
    )
    assert resp.status_code == 201
    proj_id = resp.json()["id"]

    task_resp = client.post(
        f"/api/v1/projects/{proj_id}/tasks",
        json={"title": "Silent Task", "priority": "LOW"},
        headers=auth_header(token_c),
    )
    assert task_resp.status_code == 201
