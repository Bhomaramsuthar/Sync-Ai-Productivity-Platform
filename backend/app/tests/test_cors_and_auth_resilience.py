import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from app.main import app
from app.core.config import Settings, sanitize_cors_origin
from app.core.security import verify_password, get_password_hash

client = TestClient(app, raise_server_exceptions=False)
PROD_ORIGIN = "https://sync-ai-productivity-platform.vercel.app"


def test_sanitize_cors_origin():
    # Trim whitespace
    assert sanitize_cors_origin("   https://example.com   ") == "https://example.com"
    # Strip double quotes
    assert sanitize_cors_origin('"https://example.com"') == "https://example.com"
    # Strip single quotes
    assert sanitize_cors_origin("'https://example.com'") == "https://example.com"
    # Strip trailing slash
    assert sanitize_cors_origin("https://example.com/") == "https://example.com"
    # Strip quotes and trailing slash together
    assert sanitize_cors_origin(' "https://example.com/" ') == "https://example.com"
    # Empty or None input
    assert sanitize_cors_origin("") == ""
    assert sanitize_cors_origin(None) == ""


def test_allowed_cors_origins_includes_production_vercel_by_default():
    s = Settings(CORS_ORIGINS="")
    assert PROD_ORIGIN in s.allowed_cors_origins
    assert "http://localhost:5173" in s.allowed_cors_origins


def test_allowed_cors_origins_parses_comma_separated_and_sanitizes():
    s = Settings(CORS_ORIGINS=' "https://custom-preview.vercel.app/" , \'https://api.mycompany.com/\' , https://another.org ')
    origins = s.allowed_cors_origins
    assert "https://custom-preview.vercel.app" in origins
    assert "https://api.mycompany.com" in origins
    assert "https://another.org" in origins
    # Ensure no origin has trailing slash or quotes
    for o in origins:
        assert not o.endswith("/")
        assert '"' not in o
        assert "'" not in o


def test_cors_preflight_options_login():
    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": PROD_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type, authorization",
        },
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == PROD_ORIGIN
    assert response.headers.get("access-control-allow-credentials") == "true"
    allowed_methods = response.headers.get("access-control-allow-methods", "")
    assert "POST" in allowed_methods
    assert "OPTIONS" in allowed_methods


def test_cors_headers_on_401_unauthorized():
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent_user_999@example.com", "password": "wrongpassword"},
        headers={"Origin": PROD_ORIGIN},
    )
    assert response.status_code == 401
    assert response.headers.get("access-control-allow-origin") == PROD_ORIGIN
    assert response.headers.get("access-control-allow-credentials") == "true"
    data = response.json()
    assert data["detail"]["error"]["code"] == "INVALID_CREDENTIALS"


def test_cors_headers_and_safe_payload_on_500_server_error():
    with patch("app.users.service.get_user_by_email", side_effect=Exception("Database pool connection timeout")):
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "test@example.com", "password": "secretpassword123"},
            headers={"Origin": PROD_ORIGIN},
        )
        assert response.status_code == 500
        # CORS headers MUST be present even on 500 error
        assert response.headers.get("access-control-allow-origin") == PROD_ORIGIN
        assert response.headers.get("access-control-allow-credentials") == "true"
        data = response.json()
        assert data["detail"]["error"]["code"] == "INTERNAL_SERVER_ERROR"
        # Secrets and stack traces must not be exposed in production HTTP response
        assert "Database pool connection timeout" not in response.text
        assert "secretpassword123" not in response.text
        assert "Traceback" not in response.text


def test_password_resilience():
    # Valid password hash generation and verification
    pw = "SuperSecurePassword123!"
    pw_hash = get_password_hash(pw)
    assert pw_hash.startswith("$2")
    assert verify_password(pw, pw_hash) is True
    assert verify_password("WrongPassword!", pw_hash) is False

    # Empty inputs safely return False
    assert verify_password("", pw_hash) is False
    assert verify_password(pw, "") is False
    assert verify_password("", "") is False
    assert verify_password(None, pw_hash) is False
    assert verify_password(pw, None) is False

    # Malformed hashes safely return False without raising exceptions
    assert verify_password(pw, "not_a_valid_hash") is False
    assert verify_password(pw, "$2b$invalid_format") is False
    assert verify_password(pw, "short") is False
