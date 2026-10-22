import uuid
from datetime import datetime, timezone, timedelta
import pytest
from fastapi.testclient import TestClient
from app.main import app as fastapi_app


@pytest.fixture(scope="module")
def client():
    with TestClient(fastapi_app) as c:
        yield c


@pytest.fixture
def test_user(client: TestClient):
    email = f"cal_user_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Calendar User", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}


@pytest.fixture
def workspace(client: TestClient, test_user):
    res = client.post(
        "/api/v1/workspaces",
        json={"name": "Calendar Workspace", "description": "Calendar test workspace"},
        headers=test_user["headers"],
    )
    return res.json()


@pytest.fixture
def project(client: TestClient, test_user, workspace):
    res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/projects",
        json={"name": "Calendar Project"},
        headers=test_user["headers"],
    )
    return res.json()


def test_create_and_get_calendar_event(client: TestClient, test_user, workspace, project):
    start = datetime.now(timezone.utc) + timedelta(days=1)
    end = start + timedelta(hours=1)

    payload = {
        "title": "Sprint Planning Meeting",
        "description": "Discuss sprint backlog and milestones",
        "start_time": start.isoformat(),
        "end_time": end.isoformat(),
        "event_type": "MEETING",
        "project_id": project["id"],
    }

    res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/calendar/events",
        json=payload,
        headers=test_user["headers"],
    )
    assert res.status_code == 201
    event = res.json()
    assert event["title"] == "Sprint Planning Meeting"
    assert event["workspace_id"] == workspace["id"]
    assert event["project_id"] == project["id"]

    # Fetch event by ID
    get_res = client.get(f"/api/v1/calendar/events/{event['id']}", headers=test_user["headers"])
    assert get_res.status_code == 200
    assert get_res.json()["id"] == event["id"]


def test_list_calendar_events_and_filters(client: TestClient, test_user, workspace):
    now = datetime.now(timezone.utc)
    # Event 1: tomorrow
    client.post(
        f"/api/v1/workspaces/{workspace['id']}/calendar/events",
        json={
            "title": "Design Sync",
            "start_time": (now + timedelta(days=1)).isoformat(),
            "end_time": (now + timedelta(days=1, hours=1)).isoformat(),
        },
        headers=test_user["headers"],
    )
    # Event 2: next week
    client.post(
        f"/api/v1/workspaces/{workspace['id']}/calendar/events",
        json={
            "title": "Quarterly Review",
            "start_time": (now + timedelta(days=7)).isoformat(),
            "end_time": (now + timedelta(days=7, hours=2)).isoformat(),
        },
        headers=test_user["headers"],
    )

    # List all
    res = client.get(f"/api/v1/workspaces/{workspace['id']}/calendar/events", headers=test_user["headers"])
    assert res.status_code == 200
    events = res.json()
    assert len(events) >= 2


def test_update_and_delete_calendar_event(client: TestClient, test_user, workspace):
    now = datetime.now(timezone.utc)
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/calendar/events",
        json={
            "title": "Initial Title",
            "start_time": (now + timedelta(days=2)).isoformat(),
            "end_time": (now + timedelta(days=2, hours=1)).isoformat(),
        },
        headers=test_user["headers"],
    )
    event_id = create_res.json()["id"]

    # Update event
    update_res = client.patch(
        f"/api/v1/calendar/events/{event_id}",
        json={"title": "Updated Title"},
        headers=test_user["headers"],
    )
    assert update_res.status_code == 200
    assert update_res.json()["title"] == "Updated Title"

    # Delete event
    del_res = client.delete(f"/api/v1/calendar/events/{event_id}", headers=test_user["headers"])
    assert del_res.status_code == 204

    # Verify not found
    get_res = client.get(f"/api/v1/calendar/events/{event_id}", headers=test_user["headers"])
    assert get_res.status_code == 404
