import logging
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from groq import (
    AsyncGroq,
    RateLimitError,
    AuthenticationError,
    BadRequestError,
    APIConnectionError,
    APITimeoutError,
    APIError,
)
from app.core.config import settings

logger = logging.getLogger("ai_productivity_platform.meetings.transcription")

MIME_TO_EXT = {
    "audio/webm": "webm",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/wave": "wav",
    "audio/ogg": "ogg",
    "application/ogg": "ogg",
    "audio/mp3": "mp3",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/m4a": "m4a",
    "audio/x-m4a": "m4a",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/aac": "aac",
}

SUPPORTED_PREFIXES = ("audio/", "video/webm", "application/ogg")


async def transcribe_audio_payload(
    audio_bytes: bytes,
    content_type: str = "audio/webm",
    uploader_name: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Transcribe raw audio bytes using Groq's official Whisper speech-to-text API.
    
    Note on Speaker Attribution:
      Groq Whisper produces highly accurate speech transcripts with timestamps,
      but does not perform AI multi-speaker diarization. Speaker attribution
      reflects the authenticated meeting participant who uploaded the audio
      chunk (uploader attribution).

    Returns a list of segment dicts:
    [
        {
            "speaker_name": "Alice Developer",
            "content": "...",
            "start_time_ms": 1200,
            "end_time_ms": 3500,
            "segment_index": 0
        }
    ]
    """
    if not audio_bytes or len(audio_bytes) < 100:
        logger.debug(
            "Received empty or negligible audio payload (%d bytes); skipping transcription.",
            len(audio_bytes) if audio_bytes else 0,
        )
        return []

    # Verify content_type format
    cleaned_content_type = content_type.split(";")[0].strip().lower() if content_type else "audio/webm"
    if not any(cleaned_content_type.startswith(prefix) for prefix in SUPPORTED_PREFIXES) and cleaned_content_type not in MIME_TO_EXT:
        logger.warning("Unsupported audio content-type received: %s", cleaned_content_type)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "UNSUPPORTED_AUDIO_FORMAT",
                    "message": f"Unsupported audio format '{cleaned_content_type}'. Supported formats: WebM, WAV, MP3, OGG, M4A, FLAC.",
                }
            },
        )

    api_key = settings.GROQ_API_KEY
    if not api_key:
        logger.warning("GROQ_API_KEY is not configured. Meeting audio cannot be transcribed via Groq Whisper.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": {
                    "code": "TRANSCRIPTION_NOT_CONFIGURED",
                    "message": "Groq Whisper transcription service is not configured (missing GROQ_API_KEY).",
                }
            },
        )

    model_name = settings.GROQ_WHISPER_MODEL or "whisper-large-v3-turbo"
    ext = MIME_TO_EXT.get(cleaned_content_type, "webm")
    filename = f"audio_chunk.{ext}"
    resolved_speaker = uploader_name or "Participant"

    try:
        client = AsyncGroq(api_key=api_key, timeout=60.0)
        # Call Groq's official speech-to-text endpoint requesting verbose_json for segment timestamps
        transcription = await client.audio.transcriptions.create(
            file=(filename, audio_bytes),
            model=model_name,
            response_format="verbose_json",
        )

        # Normalize response into dict format
        if hasattr(transcription, "model_dump"):
            data = transcription.model_dump()
        elif isinstance(transcription, dict):
            data = transcription
        else:
            data = {
                "text": getattr(transcription, "text", ""),
                "segments": getattr(transcription, "segments", []),
                "duration": getattr(transcription, "duration", None),
            }

        segments = []
        raw_segments = data.get("segments") or []

        for idx, s in enumerate(raw_segments):
            if isinstance(s, dict):
                text = s.get("text", "").strip()
                start_sec = float(s.get("start", 0.0) or 0.0)
                end_sec = float(s.get("end", start_sec + 1.0) or (start_sec + 1.0))
            else:
                text = getattr(s, "text", "").strip()
                start_sec = float(getattr(s, "start", 0.0) or 0.0)
                end_sec = float(getattr(s, "end", start_sec + 1.0) or (start_sec + 1.0))

            if text:
                start_ms = int(round(start_sec * 1000))
                end_ms = int(round(end_sec * 1000))
                segments.append({
                    "speaker_name": resolved_speaker,  # Uploader attribution (Groq Whisper speech-to-text)
                    "content": text,
                    "start_time_ms": max(0, start_ms),
                    "end_time_ms": max(start_ms + 200, end_ms),
                    "segment_index": idx,
                })

        # Fallback if segments array was empty but top-level text is present
        if not segments:
            full_text = data.get("text", "").strip()
            if full_text:
                duration = data.get("duration") or 3.0
                end_ms = int(round(float(duration) * 1000)) if duration else 3000
                segments.append({
                    "speaker_name": resolved_speaker,
                    "content": full_text,
                    "start_time_ms": 0,
                    "end_time_ms": max(1000, end_ms),
                    "segment_index": 0,
                })

        return segments

    except RateLimitError as exc:
        logger.warning("Groq Whisper rate limit encountered: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "error": {
                    "code": "TRANSCRIPTION_RATE_LIMITED",
                    "message": "Groq transcription rate limit reached. Please wait before retrying.",
                }
            },
        )
    except AuthenticationError as exc:
        logger.error("Groq authentication failed: Invalid or expired GROQ_API_KEY")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={
                "error": {
                    "code": "TRANSCRIPTION_AUTH_ERROR",
                    "message": "Invalid or expired GROQ_API_KEY.",
                }
            },
        )
    except BadRequestError as exc:
        logger.error("Groq transcription bad request error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "TRANSCRIPTION_BAD_REQUEST",
                    "message": f"Groq rejected audio payload: {str(exc)}",
                }
            },
        )
    except (APIConnectionError, APITimeoutError) as exc:
        logger.error("Groq transcription connection timed out: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={
                "error": {
                    "code": "TRANSCRIPTION_TIMEOUT",
                    "message": f"Groq transcription connection timed out: {str(exc)}",
                }
            },
        )
    except APIError as exc:
        logger.error("Groq API error (%s): %s", getattr(exc, "status_code", None), exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "TRANSCRIPTION_PROVIDER_ERROR",
                    "message": f"Groq API error: {str(exc)}",
                }
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Groq Whisper transcription failed: %s", str(exc), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={
                "error": {
                    "code": "TRANSCRIPTION_PROVIDER_ERROR",
                    "message": f"Failed to transcribe meeting audio via Groq Whisper: {str(exc)}",
                }
            },
        )
