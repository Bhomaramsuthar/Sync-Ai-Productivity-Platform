from fastapi.testclient import TestClient
from app.main import app as fastapi_app
import pytest

import uuid
import uuid

@pytest.fixture(scope="module")
def client():
    with TestClient(fastapi_app) as c:
        yield c

@pytest.fixture
def test_user(client: TestClient):
    email = f"t_user_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Task User", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}

@pytest.fixture
def test_user_2(client: TestClient):
    email = f"t_user2_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Task User 2", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}

@pytest.fixture
def workspace(client: TestClient, test_user):
    res = client.post("/api/v1/workspaces", json={"name": "Test Workspace", "description": "Test"}, headers=test_user["headers"])
    return res.json()

@pytest.fixture
def project(client: TestClient, test_user, workspace):
    res = client.post(f"/api/v1/workspaces/{workspace['id']}/projects", json={"name": "Test Project"}, headers=test_user["headers"])
    return res.json()

def test_create_task(client: TestClient, test_user, project):
    res = client.post(f"/api/v1/projects/{project['id']}/tasks", json={
        "title": "My Task",
        "priority": "HIGH"
    }, headers=test_user["headers"])
    assert res.status_code == 201
    assert res.json()["title"] == "My Task"
    assert res.json()["priority"] == "HIGH"

def test_list_tasks(client: TestClient, test_user, project):
    client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Task 1", "status": "TODO"}, headers=test_user["headers"])
    client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Task 2", "status": "DONE"}, headers=test_user["headers"])
    
    res = client.get(f"/api/v1/projects/{project['id']}/tasks", headers=test_user["headers"])
    assert res.status_code == 200
    assert len(res.json()) >= 2

def test_task_filtering(client: TestClient, test_user, project):
    res = client.get(f"/api/v1/projects/{project['id']}/tasks?status=DONE", headers=test_user["headers"])
    assert res.status_code == 200
    for task in res.json():
        assert task["status"] == "DONE"

def test_update_task_kanban(client: TestClient, test_user, project):
    t_res = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Kanban Task"}, headers=test_user["headers"])
    task_id = t_res.json()["id"]
    
    res = client.patch(f"/api/v1/tasks/{task_id}", json={"status": "IN_PROGRESS"}, headers=test_user["headers"])
    assert res.status_code == 200
    assert res.json()["status"] == "IN_PROGRESS"

def test_invalid_assignee_rejected(client: TestClient, test_user, project, test_user_2):
    # test_user_2 is not in the workspace
    # Need to get user_2 id.
    me_res = client.get("/api/v1/auth/me", headers=test_user_2["headers"])
    user_2_id = me_res.json()["id"]

    res = client.post(f"/api/v1/projects/{project['id']}/tasks", json={
        "title": "Task",
        "assignee_id": user_2_id
    }, headers=test_user["headers"])
    assert res.status_code == 400

def test_idor_cannot_access_task(client: TestClient, test_user, test_user_2, project):
    t_res = client.post(f"/api/v1/projects/{project['id']}/tasks", json={"title": "Private Task"}, headers=test_user["headers"])
    task_id = t_res.json()["id"]

    res = client.get(f"/api/v1/tasks/{task_id}", headers=test_user_2["headers"])
    assert res.status_code in [403, 404]

    res2 = client.patch(f"/api/v1/tasks/{task_id}", json={"title": "Hacked"}, headers=test_user_2["headers"])
    assert res2.status_code in [403, 404]

    res3 = client.delete(f"/api/v1/tasks/{task_id}", headers=test_user_2["headers"])
    assert res3.status_code in [403, 404]

def test_task_deadline_operations(client: TestClient, test_user, project):
    # 1. Create a task with a due date
    res = client.post(f"/api/v1/projects/{project['id']}/tasks", json={
        "title": "Task with deadline",
        "due_date": "2026-10-15T00:00:00Z"
    }, headers=test_user["headers"])
    assert res.status_code == 201
    task_id = res.json()["id"]
    assert res.json()["due_date"] == "2026-10-15T00:00:00Z"

    # 2. Retrieve the task and verify its due date
    res2 = client.get(f"/api/v1/tasks/{task_id}", headers=test_user["headers"])
    assert res2.status_code == 200
    assert res2.json()["due_date"] == "2026-10-15T00:00:00Z"

    # 3. Update the due date
    res3 = client.patch(f"/api/v1/tasks/{task_id}", json={
        "due_date": "2026-10-20T00:00:00Z"
    }, headers=test_user["headers"])
    assert res3.status_code == 200
    assert res3.json()["due_date"] == "2026-10-20T00:00:00Z"

    # 5. Update another task field without erasing its deadline
    res4 = client.patch(f"/api/v1/tasks/{task_id}", json={
        "title": "Updated Task Title"
    }, headers=test_user["headers"])
    assert res4.status_code == 200
    assert res4.json()["title"] == "Updated Task Title"
    assert res4.json()["due_date"] == "2026-10-20T00:00:00Z"

    # 4. Clear the due date
    res5 = client.patch(f"/api/v1/tasks/{task_id}", json={
        "due_date": None
    }, headers=test_user["headers"])
    assert res5.status_code == 200
    assert res5.json()["due_date"] is None

    # 6. Create a task without a due date
    res6 = client.post(f"/api/v1/projects/{project['id']}/tasks", json={
        "title": "Task without deadline"
    }, headers=test_user["headers"])
    assert res6.status_code == 201
    assert res6.json()["due_date"] is None
