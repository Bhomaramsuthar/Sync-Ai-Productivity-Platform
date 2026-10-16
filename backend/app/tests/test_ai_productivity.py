import uuid
import datetime
import pytest
from fastapi.testclient import TestClient

from app.main import app as fastapi_app
from app.ai.llm.mock_provider import MockLLMProvider
from app.ai.llm.factory import set_llm_provider
from app.ai.llm.base import (
    LLMTimeoutError,
    LLMRateLimitError,
    LLMAuthError,
    LLMError,
    LLMConfigError,
)


@pytest.fixture(scope="module")
def client():
    with TestClient(fastapi_app) as c:
        yield c


@pytest.fixture
def test_user(client: TestClient):
    email = f"prod_user_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Productivity User", "email": email, "password": "password123"},
    )
    res = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "password123"}
    )
    token = res.json()["access_token"]
    return {
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
        "email": email,
    }


@pytest.fixture
def other_user(client: TestClient):
    email = f"prod_other_{uuid.uuid4()}@example.com"
    client.post(
        "/api/v1/auth/register",
        json={"name": "Other User", "email": email, "password": "password123"},
    )
    res = client.post(
        "/api/v1/auth/login", json={"email": email, "password": "password123"}
    )
    token = res.json()["access_token"]
    return {
        "token": token,
        "headers": {"Authorization": f"Bearer {token}"},
        "email": email,
    }


@pytest.fixture
def workspace(client: TestClient, test_user):
    res = client.post(
        "/api/v1/workspaces",
        json={"name": "Productivity Workspace", "description": "Test"},
        headers=test_user["headers"],
    )
    ws = res.json()
    yield ws
    try:
        client.delete(f"/api/v1/workspaces/{ws['id']}", headers=test_user["headers"])
    except Exception:
        pass


@pytest.fixture
def project(client: TestClient, test_user, workspace):
    res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/projects",
        json={"name": "Core Platform Project", "description": "Engineering productivity test"},
        headers=test_user["headers"],
    )
    return res.json()


@pytest.fixture(autouse=True)
def setup_mock_llm():
    mock_llm = MockLLMProvider()
    set_llm_provider(mock_llm)
    yield mock_llm
    set_llm_provider(None)


# ==============================================================================
# 1. AI Task Assistant Tests
# ==============================================================================

def test_expand_task_description_success(client: TestClient, test_user, project):
    res = client.post(
        f"/api/v1/projects/{project['id']}/ai/task-assistant/expand",
        json={"title": "Implement Multi-Factor Authentication", "context": "Need TOTP and SMS fallback"},
        headers=test_user["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert "description" in data
    assert len(data["description"]) > 10
    assert "acceptance_criteria" in data
    assert isinstance(data["acceptance_criteria"], list)
    assert len(data["acceptance_criteria"]) >= 1
    assert data["suggested_priority"] in ["LOW", "MEDIUM", "HIGH", "URGENT"]


def test_breakdown_task_success(client: TestClient, test_user, project):
    res = client.post(
        f"/api/v1/projects/{project['id']}/ai/task-assistant/breakdown",
        json={
            "title": "Build Notification Center",
            "description": "In-app and email delivery pipeline for notifications",
        },
        headers=test_user["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert "subtasks" in data
    assert isinstance(data["subtasks"], list)
    assert len(data["subtasks"]) >= 2
    for st in data["subtasks"]:
        assert "title" in st
        assert "description" in st
        assert st["priority"] in ["LOW", "MEDIUM", "HIGH", "URGENT"]


def test_ai_task_assistant_does_not_persist_tasks_without_user_confirmation(
    client: TestClient, test_user, project
):
    # Step 1: Verify project starts with 0 tasks
    tasks_res = client.get(
        f"/api/v1/projects/{project['id']}/tasks", headers=test_user["headers"]
    )
    assert tasks_res.status_code == 200
    initial_count = len(tasks_res.json())

    # Step 2: Call expand and breakdown assistants
    exp_res = client.post(
        f"/api/v1/projects/{project['id']}/ai/task-assistant/expand",
        json={"title": "Proposed Temporary Task"},
        headers=test_user["headers"],
    )
    assert exp_res.status_code == 200

    bd_res = client.post(
        f"/api/v1/projects/{project['id']}/ai/task-assistant/breakdown",
        json={"title": "Proposed Large Epic"},
        headers=test_user["headers"],
    )
    assert bd_res.status_code == 200

    # Step 3: Assert tasks count has NOT changed (AI does not persist without user confirmation)
    tasks_res_after = client.get(
        f"/api/v1/projects/{project['id']}/tasks", headers=test_user["headers"]
    )
    assert len(tasks_res_after.json()) == initial_count

    # Step 4: Explicit user confirmation - user manually creates one of the proposed subtasks
    first_subtask = bd_res.json()["subtasks"][0]
    confirm_create = client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={
            "title": first_subtask["title"],
            "description": first_subtask["description"],
            "priority": first_subtask["priority"],
            "status": "TODO",
        },
        headers=test_user["headers"],
    )
    assert confirm_create.status_code == 201

    # Step 5: Verify task is now persisted after explicit confirmation
    final_tasks = client.get(
        f"/api/v1/projects/{project['id']}/tasks", headers=test_user["headers"]
    )
    assert len(final_tasks.json()) == initial_count + 1


def test_suggest_task_priority(client: TestClient, test_user, project):
    due = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).isoformat()
    res = client.post(
        f"/api/v1/projects/{project['id']}/ai/task-assistant/suggest-priority",
        json={
            "title": "Critical Security Patch for CVE-2026",
            "description": "Fix vulnerability in session token validation",
            "due_date": due,
        },
        headers=test_user["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["suggested_priority"] in ["LOW", "MEDIUM", "HIGH", "URGENT"]
    assert "reasoning" in data
    assert len(data["reasoning"]) > 5


def test_suggest_task_unblock(client: TestClient, test_user, project):
    res = client.post(
        f"/api/v1/projects/{project['id']}/ai/task-assistant/unblock",
        json={
            "title": "Configure Production Database Read Replica",
            "description": "Need read replica for reporting query load",
            "blocker": "AWS IAM permission denied on RDS DescribeDBInstances action",
        },
        headers=test_user["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert "next_action" in data
    assert "unblocking_steps" in data
    assert isinstance(data["unblocking_steps"], list)
    assert len(data["unblocking_steps"]) >= 1
    assert "rationale" in data


def test_malformed_llm_response_handling(
    client: TestClient, test_user, project, setup_mock_llm: MockLLMProvider
):
    # Set provider to return corrupt, non-JSON text
    setup_mock_llm.set_default_response("Sorry, I cannot format this as JSON: [unclosed tag")

    res = client.post(
        f"/api/v1/projects/{project['id']}/ai/task-assistant/expand",
        json={"title": "Some Task"},
        headers=test_user["headers"],
    )
    assert res.status_code == 502
    err = res.json()["detail"]["error"]
    assert err["code"] == "AI_SERVICE_ERROR"
    assert "Malformed" in err["message"] or "Unable to parse valid JSON" in err["message"]


# ==============================================================================
# 2. AI Project Progress Summary Tests
# ==============================================================================

def test_project_summary_empty_project(client: TestClient, test_user, workspace):
    # Create empty project
    empty_p = client.post(
        f"/api/v1/workspaces/{workspace['id']}/projects",
        json={"name": "Empty Project"},
        headers=test_user["headers"],
    ).json()

    res = client.post(
        f"/api/v1/projects/{empty_p['id']}/ai/summary",
        headers=test_user["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["is_empty_project"] is True
    assert data["factual_metrics"]["total_tasks"] == 0
    assert data["factual_metrics"]["completed_tasks"] == 0
    assert data["factual_metrics"]["overdue_tasks"] == 0
    assert data["factual_metrics"]["completion_percentage"] == 0.0
    assert "no tasks recorded" in data["executive_summary"].lower()


def test_project_summary_with_real_tasks_and_overdue(
    client: TestClient, test_user, project
):
    now = datetime.datetime.now(datetime.timezone.utc)
    past_due = (now - datetime.timedelta(days=3)).isoformat()
    future_due = (now + datetime.timedelta(days=4)).isoformat()

    # 1. Create completed task
    client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"title": "Done Task 1", "status": "DONE", "priority": "MEDIUM"},
        headers=test_user["headers"],
    )

    # 2. Create in-progress task with future due date
    client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"title": "Active Task 2", "status": "IN_PROGRESS", "priority": "HIGH", "due_date": future_due},
        headers=test_user["headers"],
    )

    # 3. Create overdue task (past due date and NOT done)
    overdue_res = client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={"title": "Overdue Task 3", "status": "TODO", "priority": "URGENT", "due_date": past_due},
        headers=test_user["headers"],
    )
    overdue_task_id = overdue_res.json()["id"]

    # Request AI project progress summary
    res = client.post(
        f"/api/v1/projects/{project['id']}/ai/summary",
        headers=test_user["headers"],
    )
    assert res.status_code == 200
    data = res.json()

    # Check factual metrics
    metrics = data["factual_metrics"]
    assert metrics["total_tasks"] >= 3
    assert metrics["completed_tasks"] >= 1
    assert metrics["overdue_tasks"] >= 1
    assert metrics["completion_percentage"] > 0

    # Overdue task items must link to the real overdue task
    overdue_ids = [item["id"] for item in metrics["overdue_task_items"]]
    assert overdue_task_id in overdue_ids

    # Check AI narrative sections
    assert len(data["executive_summary"]) > 10
    assert isinstance(data["key_highlights"], list)
    assert isinstance(data["potential_blockers"], list)
    assert isinstance(data["recommended_actions"], list)


# ==============================================================================
# 3. Context-Aware Productivity Insights Tests
# ==============================================================================

def test_productivity_insights_deterministic_rules_and_links(
    client: TestClient, test_user, project
):
    now = datetime.datetime.now(datetime.timezone.utc)
    past_due = (now - datetime.timedelta(days=2)).isoformat()

    # Create an unassigned urgent task with past due date
    t_res = client.post(
        f"/api/v1/projects/{project['id']}/tasks",
        json={
            "title": "High Urgency Unassigned Task",
            "status": "TODO",
            "priority": "URGENT",
            "assignee_id": None,
            "due_date": past_due,
        },
        headers=test_user["headers"],
    )
    target_id = t_res.json()["id"]

    res = client.get(
        f"/api/v1/projects/{project['id']}/ai/insights",
        headers=test_user["headers"],
    )
    assert res.status_code == 200
    data = res.json()
    assert data["project_id"] == project["id"]
    assert "factual_metrics" in data
    assert "recommendations" in data
    assert len(data["recommendations"]) > 0

    # Verify recommendations link to real task records and explain why
    linked_recs = [r for r in data["recommendations"] if r.get("related_task_id") == target_id]
    assert len(linked_recs) >= 1

    rec = linked_recs[0]
    assert rec["related_task_title"] == "High Urgency Unassigned Task"
    assert len(rec["explanation"]) > 10  # Clear explanation of reason
    assert len(rec["suggested_action"]) > 5


# ==============================================================================
# 4. Security & Authorization Tests (Cross-Project Isolation)
# ==============================================================================

def test_cross_project_isolation(client: TestClient, other_user, project):
    # other_user is NOT a member of test_user's workspace/project
    endpoints = [
        ("POST", f"/api/v1/projects/{project['id']}/ai/task-assistant/expand", {"title": "Hack"}),
        ("POST", f"/api/v1/projects/{project['id']}/ai/task-assistant/breakdown", {"title": "Hack"}),
        ("POST", f"/api/v1/projects/{project['id']}/ai/task-assistant/suggest-priority", {"title": "Hack"}),
        ("POST", f"/api/v1/projects/{project['id']}/ai/task-assistant/unblock", {"title": "Hack", "blocker": "None"}),
        ("POST", f"/api/v1/projects/{project['id']}/ai/summary", None),
        ("GET", f"/api/v1/projects/{project['id']}/ai/insights", None),
    ]

    for method, path, payload in endpoints:
        if method == "POST":
            res = client.post(path, json=payload, headers=other_user["headers"])
        else:
            res = client.get(path, headers=other_user["headers"])

        # Must be rejected with 403 Forbidden or 404 Not Found
        assert res.status_code in [403, 404], f"Endpoint {path} failed isolation check with status {res.status_code}"


# ==============================================================================
# 5. Missing Configuration and Provider Failures
# ==============================================================================

def test_missing_provider_configuration(
    client: TestClient, test_user, project, setup_mock_llm: MockLLMProvider
):
    setup_mock_llm.set_error(LLMConfigError("LLM API key is not configured."))

    res = client.post(
        f"/api/v1/projects/{project['id']}/ai/task-assistant/expand",
        json={"title": "Some Task"},
        headers=test_user["headers"],
    )
    assert res.status_code == 503
    assert res.json()["detail"]["error"]["code"] == "LLM_NOT_CONFIGURED"


def test_provider_timeout_handling(
    client: TestClient, test_user, project, setup_mock_llm: MockLLMProvider
):
    setup_mock_llm.set_error(LLMTimeoutError("Request timed out after 30s"))

    res = client.post(
        f"/api/v1/projects/{project['id']}/ai/task-assistant/expand",
        json={"title": "Some Task"},
        headers=test_user["headers"],
    )
    assert res.status_code == 504
    assert res.json()["detail"]["error"]["code"] == "LLM_TIMEOUT"


def test_provider_rate_limit_handling(
    client: TestClient, test_user, project, setup_mock_llm: MockLLMProvider
):
    setup_mock_llm.set_error(LLMRateLimitError("Rate limit exceeded"))

    res = client.post(
        f"/api/v1/projects/{project['id']}/ai/task-assistant/suggest-priority",
        json={"title": "Some Task"},
        headers=test_user["headers"],
    )
    assert res.status_code == 429
    assert res.json()["detail"]["error"]["code"] == "LLM_RATE_LIMIT"
