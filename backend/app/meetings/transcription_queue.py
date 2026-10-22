import asyncio
import logging
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from fastapi import HTTPException, status
from groq import RateLimitError, APIConnectionError, APITimeoutError

from app.core.config import settings
from .transcription_service import transcribe_audio_payload
from . import repository as repo

logger = logging.getLogger("ai_productivity_platform.meetings.queue")


@dataclass
class AudioBatchJob:
    id: str
    meeting_id: str
    user_id: Optional[str]
    speaker_name: str
    audio_bytes: bytes
    content_type: str
    start_time_offset_ms: int
    duration_ms: int = 0
    status: str = "PENDING"  # PENDING, PROCESSING, COMPLETED, FAILED
    retry_count: int = 0
    max_retries: int = 3
    error_message: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    future: Optional[asyncio.Future] = None
    result_segments: List[Dict[str, Any]] = field(default_factory=list)


def extract_retry_after(exc: Any) -> Optional[float]:
    """Extract numeric Retry-After header in seconds from Groq or HTTP exceptions if available."""
    response = getattr(exc, "response", None)
    if response and hasattr(response, "headers"):
        header_val = response.headers.get("retry-after") or response.headers.get("Retry-After")
        if header_val:
            try:
                return float(header_val)
            except (ValueError, TypeError):
                pass
    return None


def calculate_backoff_seconds(retry_count: int, exc: Any = None) -> float:
    """Calculate exponential backoff with jitter, respecting Retry-After if present."""
    retry_after = extract_retry_after(exc)
    if retry_after is not None and retry_after > 0:
        return retry_after

    base = settings.TRANSCRIPTION_INITIAL_BACKOFF_SECONDS
    max_backoff = settings.TRANSCRIPTION_MAX_BACKOFF_SECONDS
    calculated = min(max_backoff, base * (2 ** (retry_count - 1)))
    jitter = random.uniform(0.1, 0.5)
    return calculated + jitter


def persist_and_deduplicate_segments(
    db: Any,
    meeting_id: str,
    user_id: Optional[str],
    speaker_name: Optional[str],
    raw_segments: List[Dict[str, Any]],
    start_time_offset_ms: int,
) -> List[Dict[str, Any]]:
    """
    Persist raw transcribed segments into DB while strictly preventing duplicates
    across retries and batch boundary overlaps.
    """
    from .models import TranscriptSegment, TranscriptStatusEnum

    existing_segments = repo.get_transcript_segments(db, meeting_id)
    existing_fingerprints = {
        (s.speaker_user_id, s.start_time_ms, s.content.strip().lower())
        for s in existing_segments
    }

    new_segments_data = []
    current_index = len(existing_segments)
    resolved_speaker = speaker_name or "Unknown Speaker"

    for s in raw_segments:
        start_ms = max(0, start_time_offset_ms + s.get("start_time_ms", 0))
        end_ms = max(0, start_time_offset_ms + s.get("end_time_ms", s.get("start_time_ms", 0) + 2000))
        content = s.get("content", "").strip()
        if not content:
            continue

        fingerprint = (user_id, start_ms, content.lower())
        if fingerprint in existing_fingerprints:
            continue

        # Prevent close-timestamp duplicate text (within 1500ms) for the same speaker
        is_near_duplicate = any(
            s_exist.speaker_user_id == user_id
            and abs(s_exist.start_time_ms - start_ms) <= 1500
            and s_exist.content.strip().lower() == content.lower()
            for s_exist in existing_segments
        )
        if is_near_duplicate:
            continue

        new_segments_data.append({
            "speaker_user_id": user_id,
            "speaker_name": resolved_speaker,
            "content": content,
            "start_time_ms": start_ms,
            "end_time_ms": end_ms,
            "segment_index": current_index,
        })
        existing_fingerprints.add(fingerprint)
        current_index += 1

    meeting = repo.get_meeting(db, meeting_id)

    if not new_segments_data:
        # All segments were already persisted (retry/duplicate)
        matching = [
            {
                "id": s.id,
                "meeting_id": s.meeting_id,
                "speaker_user_id": s.speaker_user_id,
                "participant_id": s.speaker_user_id,
                "speaker_name": s.speaker_name or "Unknown Speaker",
                "content": s.content,
                "start_time_ms": s.start_time_ms,
                "end_time_ms": s.end_time_ms,
                "segment_index": s.segment_index,
                "processing_status": "COMPLETED",
                "created_at": s.created_at,
            }
            for s in existing_segments
            if s.speaker_user_id == user_id
            and abs(s.start_time_ms - start_time_offset_ms) < 60000
        ]
        return matching or []

    saved = repo.save_transcript_segments(db, meeting_id, new_segments_data)
    if meeting:
        meeting.transcript_status = TranscriptStatusEnum.READY
        db.commit()

    return [
        {
            "id": seg.id,
            "meeting_id": seg.meeting_id,
            "speaker_user_id": seg.speaker_user_id,
            "participant_id": seg.speaker_user_id,
            "speaker_name": seg.speaker_name or "Unknown Speaker",
            "content": seg.content,
            "start_time_ms": seg.start_time_ms,
            "end_time_ms": seg.end_time_ms,
            "segment_index": seg.segment_index,
            "processing_status": "COMPLETED",
            "created_at": seg.created_at,
        }
        for seg in saved
    ]


class TranscriptionQueueManager:
    """
    Bounded, resilient background transcription queue with exponential backoff,
    transient retry handling (HTTP 429 & network timeouts), and preserved failed-batch recovery.
    """

    def __init__(self):
        self._queue: Optional[asyncio.Queue] = None
        self._batches_by_id: Dict[str, AudioBatchJob] = {}
        self._batches_by_meeting: Dict[str, List[AudioBatchJob]] = {}
        self._workers: List[asyncio.Task] = []
        self._lock = asyncio.Lock()
        self._is_running = False

    def _ensure_initialized(self):
        if self._queue is None:
            max_size = getattr(settings, "TRANSCRIPTION_QUEUE_MAX_SIZE", 100)
            self._queue = asyncio.Queue(maxsize=max_size)

    def ensure_workers_started(self):
        """Start worker loop tasks if not already running."""
        self._ensure_initialized()
        if self._is_running:
            return

        concurrency = getattr(settings, "TRANSCRIPTION_CONCURRENCY", 2)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return

        self._is_running = True
        for i in range(concurrency):
            t = loop.create_task(self._worker_loop(worker_id=i))
            self._workers.append(t)
        logger.info("Started %d transcription background queue workers.", concurrency)

    async def _worker_loop(self, worker_id: int):
        logger.debug("Transcription worker %d started.", worker_id)
        while self._is_running:
            try:
                job: AudioBatchJob = await self._queue.get()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Queue worker exception: %s", e)
                continue

            try:
                await self._process_job(job)
            except Exception as e:
                logger.error("Unhandled error processing audio batch job %s: %s", job.id, e, exc_info=True)
            finally:
                self._queue.task_done()

    async def _process_job(self, job: AudioBatchJob):
        from app.core.database import SessionLocal

        job.status = "PROCESSING"
        job.updated_at = time.time()
        max_retries = job.max_retries

        while True:
            try:
                raw_segments = await transcribe_audio_payload(
                    audio_bytes=job.audio_bytes,
                    content_type=job.content_type,
                    uploader_name=job.speaker_name,
                )

                with SessionLocal() as db:
                    saved = persist_and_deduplicate_segments(
                        db=db,
                        meeting_id=job.meeting_id,
                        user_id=job.user_id,
                        speaker_name=job.speaker_name,
                        raw_segments=raw_segments,
                        start_time_offset_ms=job.start_time_offset_ms,
                    )

                job.status = "COMPLETED"
                job.error_message = None
                job.updated_at = time.time()
                job.result_segments = saved
                # Audio can be released once completed successfully
                job.audio_bytes = b""

                if job.future and not job.future.done():
                    job.future.set_result(saved)
                break

            except HTTPException as exc:
                if exc.status_code == 429:
                    job.retry_count += 1
                    if job.retry_count > max_retries:
                        job.status = "FAILED"
                        job.error_message = (
                            f"Groq Whisper rate limit retry limit reached ({job.retry_count - 1}/{max_retries}): {exc.detail}"
                        )
                        job.updated_at = time.time()
                        if job.future and not job.future.done():
                            job.future.set_exception(exc)
                        break

                    backoff = calculate_backoff_seconds(job.retry_count, exc)
                    logger.warning(
                        "Rate limit on audio job %s (attempt %d/%d). Backoff %.2fs...",
                        job.id, job.retry_count, max_retries, backoff
                    )
                    await asyncio.sleep(backoff)
                    continue

                elif exc.status_code in (502, 503, 504):
                    job.retry_count += 1
                    if job.retry_count > max_retries:
                        job.status = "FAILED"
                        job.error_message = (
                            f"Transcription provider retry limit reached ({job.retry_count - 1}/{max_retries}): {exc.detail}"
                        )
                        job.updated_at = time.time()
                        if job.future and not job.future.done():
                            job.future.set_exception(exc)
                        break

                    backoff = calculate_backoff_seconds(job.retry_count, exc)
                    logger.warning(
                        "Transient error on audio job %s (%s). Retrying in %.2fs...",
                        job.id, exc.detail, backoff
                    )
                    await asyncio.sleep(backoff)
                    continue

                else:
                    # Non-retryable error (e.g. 400 Bad Request, 401 Auth)
                    job.status = "FAILED"
                    job.error_message = str(exc.detail)
                    job.updated_at = time.time()
                    if job.future and not job.future.done():
                        job.future.set_exception(exc)
                    break

            except RateLimitError as exc:
                job.retry_count += 1
                if job.retry_count > max_retries:
                    job.status = "FAILED"
                    job.error_message = f"Groq Whisper rate limit retry exhaustion: {exc}"
                    job.updated_at = time.time()
                    if job.future and not job.future.done():
                        job.future.set_exception(exc)
                    break

                backoff = calculate_backoff_seconds(job.retry_count, exc)
                logger.warning(
                    "Groq RateLimitError on job %s (attempt %d/%d). Backoff %.2fs...",
                    job.id, job.retry_count, max_retries, backoff
                )
                await asyncio.sleep(backoff)
                continue

            except (APIConnectionError, APITimeoutError) as exc:
                job.retry_count += 1
                if job.retry_count > max_retries:
                    job.status = "FAILED"
                    job.error_message = f"Groq connection retry exhaustion: {exc}"
                    job.updated_at = time.time()
                    if job.future and not job.future.done():
                        job.future.set_exception(exc)
                    break

                backoff = calculate_backoff_seconds(job.retry_count, exc)
                await asyncio.sleep(backoff)
                continue

            except Exception as exc:
                job.status = "FAILED"
                job.error_message = str(exc)
                job.updated_at = time.time()
                if job.future and not job.future.done():
                    job.future.set_exception(exc)
                break

    async def enqueue(
        self,
        meeting_id: str,
        user_id: Optional[str],
        speaker_name: str,
        audio_bytes: bytes,
        content_type: str,
        start_time_offset_ms: int,
        duration_ms: int = 0,
        wait_for_completion: bool = True,
        timeout: float = 60.0,
    ) -> AudioBatchJob:
        """Enqueue an audio batch job into the bounded queue."""
        self._ensure_initialized()
        self.ensure_workers_started()

        if self._queue.full():
            logger.warning("Transcription queue is full (maxsize=%d)", self._queue.maxsize)
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "error": {
                        "code": "TRANSCRIPTION_QUEUE_FULL",
                        "message": "Transcription queue is currently at capacity. Please retry shortly.",
                    }
                },
            )

        loop = asyncio.get_running_loop()
        job_id = uuid.uuid4().hex
        max_retries = getattr(settings, "TRANSCRIPTION_MAX_RETRIES", 3)
        job = AudioBatchJob(
            id=job_id,
            meeting_id=meeting_id,
            user_id=user_id,
            speaker_name=speaker_name,
            audio_bytes=audio_bytes,
            content_type=content_type,
            start_time_offset_ms=start_time_offset_ms,
            duration_ms=duration_ms,
            max_retries=max_retries,
            future=loop.create_future(),
        )

        self._batches_by_id[job_id] = job
        if meeting_id not in self._batches_by_meeting:
            self._batches_by_meeting[meeting_id] = []
        self._batches_by_meeting[meeting_id].append(job)

        await self._queue.put(job)

        if wait_for_completion and job.future:
            try:
                await asyncio.wait_for(asyncio.shield(job.future), timeout=timeout)
            except asyncio.TimeoutError:
                logger.warning("Timed out waiting for audio batch job %s to finish", job_id)
                # Job remains in queue to complete in background

        return job

    async def flush_meeting(self, meeting_id: str, timeout: float = 45.0) -> Dict[str, int]:
        """
        Wait for all pending and processing audio jobs for a meeting to finish,
        ensuring the final batch is transcribed before meeting conclusion or AI summary.
        """
        self._ensure_initialized()
        self.ensure_workers_started()

        jobs = self._batches_by_meeting.get(meeting_id, [])
        pending_jobs = [j for j in jobs if j.status in ("PENDING", "PROCESSING") and j.future]

        if not pending_jobs:
            return {"flushed": 0, "completed": sum(1 for j in jobs if j.status == "COMPLETED"), "failed": sum(1 for j in jobs if j.status == "FAILED")}

        logger.info("Flushing %d pending audio batch jobs for meeting %s...", len(pending_jobs), meeting_id)
        futures = [j.future for j in pending_jobs if j.future and not j.future.done()]
        if futures:
            try:
                await asyncio.wait_for(
                    asyncio.gather(*futures, return_exceptions=True),
                    timeout=timeout,
                )
            except asyncio.TimeoutError:
                logger.warning("Flush timeout reached for meeting %s after %.1fs", meeting_id, timeout)

        completed_count = sum(1 for j in jobs if j.status == "COMPLETED")
        failed_count = sum(1 for j in jobs if j.status == "FAILED")
        return {
            "flushed": len(pending_jobs),
            "completed": completed_count,
            "failed": failed_count,
        }

    async def retry_failed_batches(self, meeting_id: str) -> List[str]:
        """
        Re-enqueue any failed audio jobs for this meeting using preserved raw audio.
        Returns list of re-enqueued batch IDs.
        """
        self._ensure_initialized()
        self.ensure_workers_started()

        jobs = self._batches_by_meeting.get(meeting_id, [])
        failed_jobs = [j for j in jobs if j.status == "FAILED" and len(j.audio_bytes) > 0]
        re_enqueued_ids = []

        loop = asyncio.get_running_loop()
        for j in failed_jobs:
            j.status = "PENDING"
            j.retry_count = 0
            j.error_message = None
            j.updated_at = time.time()
            j.future = loop.create_future()
            await self._queue.put(j)
            re_enqueued_ids.append(j.id)

        logger.info("Re-enqueued %d failed audio batches for meeting %s", len(re_enqueued_ids), meeting_id)
        return re_enqueued_ids

    def get_meeting_status(self, meeting_id: str) -> Dict[str, Any]:
        """Return the current queue breakdown for a meeting."""
        jobs = self._batches_by_meeting.get(meeting_id, [])
        pending_count = sum(1 for j in jobs if j.status == "PENDING")
        processing_count = sum(1 for j in jobs if j.status == "PROCESSING")
        completed_count = sum(1 for j in jobs if j.status == "COMPLETED")
        failed_jobs = [j for j in jobs if j.status == "FAILED"]

        return {
            "pending_count": pending_count,
            "processing_count": processing_count,
            "completed_count": completed_count,
            "failed_count": len(failed_jobs),
            "total_batches": len(jobs),
            "failed_batches": [
                {
                    "id": j.id,
                    "start_time_offset_ms": j.start_time_offset_ms,
                    "error_message": j.error_message,
                    "retry_count": j.retry_count,
                    "can_retry": bool(j.audio_bytes),
                }
                for j in failed_jobs
            ],
        }

    def clear(self):
        """Reset in-memory queue state (primarily for test fixture cleanup)."""
        for t in self._workers:
            t.cancel()
        self._workers = []
        self._queue = None
        self._batches_by_id.clear()
        self._batches_by_meeting.clear()
        self._is_running = False


# Global singleton instance
transcription_queue = TranscriptionQueueManager()
