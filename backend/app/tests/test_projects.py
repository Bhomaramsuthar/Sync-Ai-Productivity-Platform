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
    email = f"p_user_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={
        "name": "Project User",
        "email": email,
        "password": "password123"
    })
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}

@pytest.fixture
def test_user_2(client: TestClient):
    email = f"p_user2_{uuid.uuid4()}@example.com"
    client.post("/api/v1/auth/register", json={
        "name": "Project User 2",
        "email": email,
        "password": "password123"
    })
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}

@pytest.fixture
def workspace(client: TestClient, test_user):
    res = client.post("/api/v1/workspaces", json={"name": "Test Workspace", "description": "Test"}, headers=test_user["headers"])
    return res.json()

@pytest.fixture
def workspace_2(client: TestClient, test_user_2):
    res = client.post("/api/v1/workspaces", json={"name": "Test Workspace 2", "description": "Test"}, headers=test_user_2["headers"])
    return res.json()

def test_create_project(client: TestClient, test_user, workspace):
    res = client.post(f"/api/v1/workspaces/{workspace['id']}/projects", json={
        "name": "My Project",
        "description": "Desc"
    }, headers=test_user["headers"])
    assert res.status_code == 201
    assert res.json()["name"] == "My Project"

def test_list_projects(client: TestClient, test_user, workspace):
    client.post(f"/api/v1/workspaces/{workspace['id']}/projects", json={"name": "P1"}, headers=test_user["headers"])
    res = client.get(f"/api/v1/workspaces/{workspace['id']}/projects", headers=test_user["headers"])
    assert res.status_code == 200
    assert len(res.json()) >= 1

def test_unauthorized_user_cannot_create_project(client: TestClient, test_user_2, workspace):
    # User 2 is not in workspace 1
    res = client.post(f"/api/v1/workspaces/{workspace['id']}/projects", json={
        "name": "Hacked Project"
    }, headers=test_user_2["headers"])
    assert res.status_code in [403, 404]

def test_idor_user_cannot_access_project(client: TestClient, test_user, test_user_2, workspace):
    p_res = client.post(f"/api/v1/workspaces/{workspace['id']}/projects", json={"name": "Private Project"}, headers=test_user["headers"])
    project_id = p_res.json()["id"]

    res = client.get(f"/api/v1/projects/{project_id}", headers=test_user_2["headers"])
    assert res.status_code in [403, 404]

def test_update_project(client: TestClient, test_user, workspace):
    p_res = client.post(f"/api/v1/workspaces/{workspace['id']}/projects", json={"name": "P1"}, headers=test_user["headers"])
    project_id = p_res.json()["id"]

    res = client.patch(f"/api/v1/projects/{project_id}", json={"name": "P1 Updated"}, headers=test_user["headers"])
    assert res.status_code == 200
    assert res.json()["name"] == "P1 Updated"

def test_delete_project(client: TestClient, test_user, workspace):
    p_res = client.post(f"/api/v1/workspaces/{workspace['id']}/projects", json={"name": "P1"}, headers=test_user["headers"])
    project_id = p_res.json()["id"]

    res = client.delete(f"/api/v1/projects/{project_id}", headers=test_user["headers"])
    assert res.status_code == 204

    res2 = client.get(f"/api/v1/projects/{project_id}", headers=test_user["headers"])
    assert res2.status_code == 404
