import io
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import Base, get_db
from app.users.models import User, RoleEnum
from app.workspaces.models import Workspace, WorkspaceMember, WorkspaceRoleEnum
from app.core.security import get_password_hash

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_users.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_and_teardown_db(monkeypatch):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db

    # Mock storage functions to avoid live network calls during testing
    avatar_storage = {}

    def mock_upload_avatar(file_bytes: bytes, file_name: str, content_type: str) -> str:
        key = f"https://mock-supabase.test/storage/v1/object/public/avatars/{file_name}"
        avatar_storage[key] = file_bytes
        return key

    def mock_delete_avatar(avatar_url: str):
        avatar_storage.pop(avatar_url, None)

    monkeypatch.setattr("app.users.router.upload_avatar", mock_upload_avatar)
    monkeypatch.setattr("app.users.service.delete_avatar", mock_delete_avatar)

    yield

    app.dependency_overrides.clear()


def register_and_login(name="Test User", email="test@example.com", password="password123"):
    client.post(
        "/api/v1/auth/register",
        json={"name": name, "email": email, "password": password},
    )
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    data = login_res.json()
    return data["access_token"], data["user"]


def test_get_profile_me():
    token, user = register_and_login()
    response = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
    assert data["name"] == "Test User"
    assert "preferences" in data
    assert data["preferences"]["theme"] == "dark"


def test_get_profile_unauthenticated():
    response = client.get("/api/v1/users/me")
    assert response.status_code in (401, 403)


def test_update_profile_display_name_and_preferences():
    token, _ = register_and_login()
    payload = {
        "name": "Updated Name",
        "preferences": {
            "theme": "light",
            "email_notifications": False,
            "task_updates": True,
            "meeting_reminders": False,
            "ai_suggestions": True,
            "weekly_digest": True,
        },
    }
    response = client.patch(
        "/api/v1/users/me",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["name"] == "Updated Name"
    assert data["preferences"]["theme"] == "light"
    assert data["preferences"]["email_notifications"] is False
    assert data["preferences"]["weekly_digest"] is True

    # Confirm persistence by fetching profile again
    get_res = client.get(
        "/api/v1/users/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert get_res.status_code == 200
    assert get_res.json()["name"] == "Updated Name"


def test_update_profile_invalid_empty_name():
    token, _ = register_and_login()
    response = client.patch(
        "/api/v1/users/me",
        json={"name": "   "},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code in (422, 400)


def test_attempt_to_edit_another_user_data_forbidden():
    token1, user1 = register_and_login("User 1", "user1@example.com")
    token2, user2 = register_and_login("User 2", "user2@example.com")

    # User 1 attempts to patch User 2's profile
    response = client.patch(
        f"/api/v1/users/{user2['id']}",
        json={"name": "Hacked Name"},
        headers={"Authorization": f"Bearer {token1}"},
    )
    assert response.status_code == 403
    err = response.json()
    assert "FORBIDDEN" in str(err)


def test_avatar_upload_and_removal_flow():
    token, _ = register_and_login()

    # Valid PNG image bytes (8-byte PNG header + minimal chunk)
    png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    files = {"file": ("avatar.png", io.BytesIO(png_bytes), "image/png")}

    upload_res = client.post(
        "/api/v1/users/me/avatar",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert upload_res.status_code == 200
    data = upload_res.json()
    assert data["avatar_url"] is not None
    assert "avatar.png" in data["avatar_url"]

    # Delete avatar
    delete_res = client.delete(
        "/api/v1/users/me/avatar",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert delete_res.status_code == 200
    assert delete_res.json()["avatar_url"] is None


def test_avatar_upload_rejects_disguised_script():
    token, _ = register_and_login()

    # Text content disguised with .jpg extension and image/jpeg MIME
    fake_bytes = b"<?php echo 'malicious'; ?>"
    files = {"file": ("avatar.jpg", io.BytesIO(fake_bytes), "image/jpeg")}

    response = client.post(
        "/api/v1/users/me/avatar",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400
    assert "INVALID_IMAGE_CONTENT" in str(response.json())


def test_avatar_upload_rejects_disallowed_extension():
    token, _ = register_and_login()

    files = {"file": ("avatar.pdf", io.BytesIO(b"%PDF-1.4 test"), "application/pdf")}
    response = client.post(
        "/api/v1/users/me/avatar",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400
    assert "INVALID_FILE_TYPE" in str(response.json())


def test_avatar_upload_rejects_oversized_file():
    token, _ = register_and_login()

    # Oversized payload (> 2MB)
    huge_bytes = b"\xff\xd8\xff" + (b"\x00" * (2 * 1024 * 1024 + 10))
    files = {"file": ("large.jpg", io.BytesIO(huge_bytes), "image/jpeg")}

    response = client.post(
        "/api/v1/users/me/avatar",
        files=files,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 413


def test_change_password_flow():
    token, _ = register_and_login("Password User", "pwd@example.com", "oldpassword123")

    # Invalid current password
    fail_res = client.post(
        "/api/v1/users/me/change-password",
        json={"current_password": "wrongpassword", "new_password": "newpassword123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert fail_res.status_code == 400

    # Short new password
    short_res = client.post(
        "/api/v1/users/me/change-password",
        json={"current_password": "oldpassword123", "new_password": "123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert short_res.status_code in (422, 400)

    # Valid password change
    ok_res = client.post(
        "/api/v1/users/me/change-password",
        json={"current_password": "oldpassword123", "new_password": "newpassword123"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert ok_res.status_code == 200

    # Test login with new password
    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "pwd@example.com", "password": "newpassword123"},
    )
    assert new_login.status_code == 200
    assert "access_token" in new_login.json()


def test_account_deletion_flow():
    token, user = register_and_login("Delete Me", "deleteme@example.com", "password123")

    # Mismatch confirmation email
    mismatch_res = client.request(
        "DELETE",
        "/api/v1/users/me",
        json={"password": "password123", "confirmation_email": "wrong@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert mismatch_res.status_code == 400

    # Wrong password
    wrong_pwd_res = client.request(
        "DELETE",
        "/api/v1/users/me",
        json={"password": "wrongpassword", "confirmation_email": "deleteme@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert wrong_pwd_res.status_code == 400

    # Successful delete
    del_res = client.request(
        "DELETE",
        "/api/v1/users/me",
        json={"password": "password123", "confirmation_email": "deleteme@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert del_res.status_code == 200

    # User should no longer be able to log in
    login_res = client.post(
        "/api/v1/auth/login",
        json={"email": "deleteme@example.com", "password": "password123"},
    )
    assert login_res.status_code == 401


def test_account_deletion_blocked_if_owner_of_workspace():
    token, user = register_and_login("Workspace Owner", "ws_owner@example.com", "password123")

    # Create workspace directly in db
    db = TestingSessionLocal()
    ws = Workspace(name="Owner WS", owner_id=user["id"])
    db.add(ws)
    db.commit()
    db.close()

    del_res = client.request(
        "DELETE",
        "/api/v1/users/me",
        json={"password": "password123", "confirmation_email": "ws_owner@example.com"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert del_res.status_code == 400
    assert "USER_OWNS_WORKSPACES" in str(del_res.json())
