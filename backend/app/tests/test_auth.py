import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.database import Base, get_db
from app.users.models import User

SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

client = TestClient(app)

def setup_module(module):
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    app.dependency_overrides[get_db] = override_get_db

def teardown_module(module):
    app.dependency_overrides.clear()

def test_register():
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User", "email": "test@example.com", "password": "password123"}
    )
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == "test@example.com"
    assert "password_hash" not in data

def test_register_duplicate():
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test User 2", "email": "test@example.com", "password": "password123"}
    )
    assert response.status_code == 409

def test_login_success():
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "password123"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_login_wrong_password():
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "wrongpassword"}
    )
    assert response.status_code == 401

def test_get_me():
    login_response = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "password123"}
    )
    token = login_response.json()["access_token"]
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    assert response.json()["email"] == "test@example.com"

def test_get_me_invalid_token():
    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid"}
    )
    assert response.status_code == 401

def test_get_me_missing_token():
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 403 or response.status_code == 401 # Depends on FastAPI implementation of HTTPBearer

def test_register_invalid_email():
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test", "email": "notanemail", "password": "password123"}
    )
    assert response.status_code == 422

def test_register_invalid_password():
    response = client.post(
        "/api/v1/auth/register",
        json={"name": "Test", "email": "test4@example.com", "password": "123"}
    )
    assert response.status_code == 422

def test_login_unknown_user():
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "unknown@example.com", "password": "password123"}
    )
    assert response.status_code == 401

def test_password_hashed_in_db():
    db = TestingSessionLocal()
    user = db.query(User).filter(User.email == "test@example.com").first()
    assert user is not None
    assert user.password_hash != "password123"
    assert len(user.password_hash) > 20
    db.close()
