import time
import random
import string
import logging
from typing import Optional
from app.core.config import settings

logger = logging.getLogger("ai_productivity_platform.meetings.livekit")


def generate_meeting_code() -> str:
    """Generate a shareable 10-char alphanumeric meeting code: xxx-yyyy-zzz."""
    chars = string.ascii_lowercase
    part1 = "".join(random.choices(chars, k=3))
    part2 = "".join(random.choices(chars, k=4))
    part3 = "".join(random.choices(chars, k=3))
    return f"{part1}-{part2}-{part3}"


def create_livekit_token(
    room_name: str,
    user_id: str,
    user_name: str,
    is_host: bool = False,
    ttl_seconds: int = 86400,
) -> tuple[str, str]:
    """
    Generate a LiveKit JWT access token for connecting to the video room.
    Returns (token, livekit_url).
    """
    api_key = settings.LIVEKIT_API_KEY or "devkey"
    api_secret = settings.LIVEKIT_API_SECRET or "secret"
    livekit_url = settings.LIVEKIT_URL or "ws://localhost:7880"

    try:
        from livekit import api as lk_api
        token = (
            lk_api.AccessToken(api_key, api_secret)
            .with_identity(user_id)
            .with_name(user_name)
            .with_grants(
                lk_api.VideoGrants(
                    room_join=True,
                    room=room_name,
                    can_publish=True,
                    can_subscribe=True,
                    can_publish_data=True,
                    room_admin=is_host,
                )
            )
            .with_ttl(ttl_seconds)
            .to_jwt()
        )
        return token, livekit_url
    except Exception as exc:
        logger.warning(
            "LiveKit SDK generation fallback (error: %s). Using jose JWT standard LiveKit token.",
            str(exc),
        )
        # Fallback to standard LiveKit JWT token structure
        from jose import jwt

        now = int(time.time())
        claims = {
            "iss": api_key,
            "sub": user_id,
            "name": user_name,
            "nbf": now - 5,
            "exp": now + ttl_seconds,
            "video": {
                "room": room_name,
                "roomJoin": True,
                "canPublish": True,
                "canSubscribe": True,
                "canPublishData": True,
                "roomAdmin": is_host,
            },
        }
        token = jwt.encode(claims, api_secret, algorithm="HS256")
        return token, livekit_url
