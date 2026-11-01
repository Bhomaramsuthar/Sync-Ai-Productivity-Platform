import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Union, Optional
import bcrypt
from jose import jwt
from passlib.context import CryptContext
from .config import settings

logger = logging.getLogger("ai_productivity_platform.security")

# Defensive polyfill for passlib compatibility across all bcrypt versions (e.g. bcrypt >= 4.1.0)
if not hasattr(bcrypt, "__about__"):
    bcrypt.__about__ = bcrypt

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Safely verify a plain text password against a hashed password.

    Attempts standard bcrypt verification directly first, falling back to passlib CryptContext.
    Never raises unhandled exceptions on invalid or malformed hashes.
    """
    if not plain_password or not hashed_password:
        return False

    # Attempt direct bcrypt verification for standard bcrypt hashes
    try:
        if isinstance(hashed_password, str) and (
            hashed_password.startswith("$2a$")
            or hashed_password.startswith("$2b$")
            or hashed_password.startswith("$2y$")
        ):
            return bcrypt.checkpw(
                plain_password.encode("utf-8"),
                hashed_password.encode("utf-8"),
            )
    except Exception as exc:
        logger.warning("Direct bcrypt verification exception: %s", type(exc).__name__)

    # Fallback to passlib CryptContext
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as exc:
        logger.warning("Passlib verification exception: %s", type(exc).__name__)
        return False

def get_password_hash(password: str) -> str:
    """Hash a plain text password using bcrypt."""
    try:
        return pwd_context.hash(password)
    except Exception as exc:
        logger.warning("Passlib hashing exception, using direct bcrypt fallback: %s", type(exc).__name__)
        salt = bcrypt.gensalt(rounds=12)
        return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

def create_access_token(subject: Union[str, Any], expires_delta: timedelta = None) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    
    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt


def decode_token(token: str) -> Optional[dict]:
    """Safely decodes and verifies a JWT access token, returning payload dict or None."""
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except Exception as exc:
        logger.debug("Token decode error: %s", exc)
        return None
