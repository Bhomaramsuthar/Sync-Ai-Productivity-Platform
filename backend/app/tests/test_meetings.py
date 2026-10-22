import uuid
from datetime import datetime, timezone, timedelta
import pytest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient
from app.main import app as fastapi_app
from app.meetings.ai_extraction import ExtractedIntelligence, ExtractedTask, ExtractedCalendarEvent


@pytest.fixture(scope="module")
def client():
    with TestClient(fastapi_app) as c:
        yield c


@pytest.fixture
def test_user(client: TestClient):
    email = f"meeting_user_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Meeting Host", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}


@pytest.fixture
def other_user(client: TestClient):
    email = f"other_meeting_user_{uuid.uuid4().hex[:8]}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Other User", "email": email, "password": "password123"})
    res = client.post("/api/v1/auth/login", json={"email": email, "password": "password123"})
    token = res.json()["access_token"]
    return {"token": token, "headers": {"Authorization": f"Bearer {token}"}, "email": email}


@pytest.fixture
def workspace(client: TestClient, test_user):
    res = client.post(
        "/api/v1/workspaces",
        json={"name": "Meeting Workspace", "description": "Workspace for meetings"},
        headers=test_user["headers"],
    )
    return res.json()


@pytest.fixture
def project(client: TestClient, test_user, workspace):
    res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/projects",
        json={"name": "Product Development"},
        headers=test_user["headers"],
    )
    return res.json()


def test_create_and_list_meetings(client: TestClient, test_user, workspace, project):
    start = datetime.now(timezone.utc) + timedelta(hours=2)
    end = start + timedelta(hours=1)

    payload = {
        "title": "Weekly Engineering Sync",
        "description": "Discuss architecture and roadmap",
        "project_id": project["id"],
        "scheduled_start": start.isoformat(),
        "scheduled_end": end.isoformat(),
        "recording_consent": True,
    }

    res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json=payload,
        headers=test_user["headers"],
    )
    assert res.status_code == 201
    meeting = res.json()
    assert meeting["title"] == "Weekly Engineering Sync"
    assert meeting["status"] == "SCHEDULED"
    assert "meeting_code" in meeting
    assert "livekit_room_name" in meeting

    # List workspace meetings
    list_res = client.get(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        headers=test_user["headers"],
    )
    assert list_res.status_code == 200
    meetings = list_res.json()
    assert len(meetings) >= 1
    assert any(m["id"] == meeting["id"] for m in meetings)


def test_join_meeting_and_join_by_code(client: TestClient, test_user, workspace):
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Design Standup"},
        headers=test_user["headers"],
    )
    meeting = create_res.json()

    # Join meeting
    join_res = client.post(
        f"/api/v1/meetings/{meeting['id']}/join",
        headers=test_user["headers"],
    )
    assert join_res.status_code == 200
    join_data = join_res.json()
    assert "livekit_token" in join_data
    assert "livekit_url" in join_data
    assert join_data["is_host"] is True
    assert join_data["meeting"]["status"] == "ACTIVE"

    # Join by code
    code_res = client.post(
        f"/api/v1/meetings/join-by-code/{meeting['meeting_code']}",
        headers=test_user["headers"],
    )
    assert code_res.status_code == 200
    assert "livekit_token" in code_res.json()


def test_end_meeting_and_consent(client: TestClient, test_user, workspace):
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Quick Checkin"},
        headers=test_user["headers"],
    )
    meeting = create_res.json()

    # Record consent
    consent_res = client.post(
        f"/api/v1/meetings/{meeting['id']}/consent",
        json={"consent_given": True},
        headers=test_user["headers"],
    )
    assert consent_res.status_code == 200

    # End meeting
    end_res = client.post(
        f"/api/v1/meetings/{meeting['id']}/end",
        headers=test_user["headers"],
    )
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "ENDED"


def test_transcript_ingest_and_ai_analysis_workflow(client: TestClient, test_user, workspace, project):
    # 1. Create meeting
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Sprint Retrospective & Action Items", "project_id": project["id"]},
        headers=test_user["headers"],
    )
    meeting = create_res.json()
    meeting_id = meeting["id"]

    # 2. Ingest transcript segments
    transcript_payload = {
        "segments": [
            {
                "speaker_name": "Meeting Host",
                "content": "Welcome everyone. Let's discuss our action items for next release.",
                "start_time_ms": 0,
                "end_time_ms": 3000,
                "segment_index": 0,
            },
            {
                "speaker_name": "Meeting Host",
                "content": "I will finalize the deployment guide by Friday afternoon.",
                "start_time_ms": 4000,
                "end_time_ms": 7500,
                "segment_index": 1,
            },
            {
                "speaker_name": "Meeting Host",
                "content": "Let's schedule a follow-up review on Monday at 10 AM.",
                "start_time_ms": 8000,
                "end_time_ms": 11000,
                "segment_index": 2,
            },
        ]
    }
    trans_res = client.post(
        f"/api/v1/meetings/{meeting_id}/transcript",
        json=transcript_payload,
        headers=test_user["headers"],
    )
    assert trans_res.status_code == 201
    assert len(trans_res.json()) == 3

    # Fetch transcript
    get_trans = client.get(f"/api/v1/meetings/{meeting_id}/transcript", headers=test_user["headers"])
    assert get_trans.status_code == 200
    assert len(get_trans.json()) == 3

    # 3. Analyze meeting with mocked LLM output
    mock_intelligence = ExtractedIntelligence(
        summary="Team aligned on deployment preparation and agreed on a follow-up architecture review.",
        decisions=["Proceed with Friday deployment release."],
        tasks=[
            ExtractedTask(
                title="Finalize deployment guide",
                description="Prepare and publish deployment guide for v1 release",
                suggested_assignee_name="Meeting Host",
                suggested_due_date=(datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
                suggested_priority="HIGH",
                evidence_text="I will finalize the deployment guide by Friday afternoon.",
                is_explicit_commitment=True,
            )
        ],
        calendar_events=[
            ExtractedCalendarEvent(
                title="Follow-up Review",
                description="Architecture and deployment status review",
                suggested_start_time=(datetime.now(timezone.utc) + timedelta(days=5)).isoformat(),
                suggested_end_time=(datetime.now(timezone.utc) + timedelta(days=5, hours=1)).isoformat(),
                evidence_text="Let's schedule a follow-up review on Monday at 10 AM.",
            )
        ],
    )

    with patch("app.meetings.service.analyze_meeting_transcript", return_value=mock_intelligence):
        analyze_res = client.post(
            f"/api/v1/meetings/{meeting_id}/analyze",
            headers=test_user["headers"],
        )
        assert analyze_res.status_code == 200
        summary_data = analyze_res.json()
        assert "Team aligned" in summary_data["summary_text"]
        assert len(summary_data["decisions"]) == 1

    # 4. List suggested items
    sug_res = client.get(
        f"/api/v1/meetings/{meeting_id}/suggestions",
        headers=test_user["headers"],
    )
    assert sug_res.status_code == 200
    suggestions = sug_res.json()
    assert len(suggestions) == 2

    task_suggestion = next(s for s in suggestions if s["item_type"] == "TASK")
    event_suggestion = next(s for s in suggestions if s["item_type"] == "CALENDAR_EVENT")

    # 5. Approve task suggestion -> creates real project task!
    approve_task_res = client.post(
        f"/api/v1/meetings/suggestions/{task_suggestion['id']}/approve",
        json={"target_project_id": project["id"]},
        headers=test_user["headers"],
    )
    assert approve_task_res.status_code == 200
    approved_task = approve_task_res.json()
    assert approved_task["status"] == "APPROVED"
    assert approved_task["approved_task_id"] is not None

    # Verify task exists in project tasks API
    task_in_proj = client.get(f"/api/v1/tasks/{approved_task['approved_task_id']}", headers=test_user["headers"])
    assert task_in_proj.status_code == 200
    assert task_in_proj.json()["title"] == "Finalize deployment guide"

    # 6. Approve calendar event suggestion -> creates real calendar event!
    approve_ev_res = client.post(
        f"/api/v1/meetings/suggestions/{event_suggestion['id']}/approve",
        json={},
        headers=test_user["headers"],
    )
    assert approve_ev_res.status_code == 200
    approved_ev = approve_ev_res.json()
    assert approved_ev["status"] == "APPROVED"
    assert approved_ev["approved_event_id"] is not None

    # Verify calendar event exists
    cal_ev = client.get(f"/api/v1/calendar/events/{approved_ev['approved_event_id']}", headers=test_user["headers"])
    assert cal_ev.status_code == 200
    assert cal_ev.json()["title"] == "Follow-up Review"


def test_audio_ingestion_success_with_groq_mock(client: TestClient, test_user, workspace):
    """
    Verifies that multipart audio uploads to /meetings/{id}/audio:
    1. Forwards raw audio bytes to Groq Whisper transcription service.
    2. Persists timestamped transcript segments with uploader attribution and sequential index.
    3. Exposes new segments through the transcript retrieval API.
    """
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Sprint Planning With Audio", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting = create_res.json()
    meeting_id = meeting["id"]

    # Simulated WebM/Opus audio payload (500 bytes of dummy audio data)
    dummy_audio_bytes = b"\x1a\x45\xdf\xa3" + b"\x00" * 496
    mock_groq_segments = [
        {
            "speaker_name": "Alice Developer",
            "content": "Good morning team, let's review the sprint backlog.",
            "start_time_ms": 500,
            "end_time_ms": 3200,
            "segment_index": 0,
        },
        {
            "speaker_name": "Alice Developer",
            "content": "I will handle the payment gateway integration by Thursday.",
            "start_time_ms": 3500,
            "end_time_ms": 6800,
            "segment_index": 1,
        },
    ]

    with patch("app.meetings.transcription_queue.transcribe_audio_payload", return_value=mock_groq_segments):
        upload_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("audio_chunk.webm", dummy_audio_bytes, "audio/webm")},
            data={"start_time_offset_ms": "15000", "speaker_name": "Alice Developer"},
            headers=test_user["headers"],
        )
        assert upload_res.status_code == 201
        segments = upload_res.json()
        assert len(segments) == 2

        # Verify timestamp offset is properly applied (15000 + 500 = 15500)
        assert segments[0]["start_time_ms"] == 15500
        assert segments[0]["end_time_ms"] == 18200
        assert segments[0]["speaker_name"] == "Alice Developer"
        assert segments[0]["content"] == "Good morning team, let's review the sprint backlog."
        assert segments[0]["segment_index"] == 0

        assert segments[1]["start_time_ms"] == 18500
        assert segments[1]["end_time_ms"] == 21800
        assert segments[1]["segment_index"] == 1

    # Verify segments are persisted and retrievable
    trans_res = client.get(f"/api/v1/meetings/{meeting_id}/transcript", headers=test_user["headers"])
    assert trans_res.status_code == 200
    stored_segments = trans_res.json()
    assert len(stored_segments) == 2
    assert stored_segments[0]["content"] == "Good morning team, let's review the sprint backlog."


def test_audio_ingestion_empty_payload(client: TestClient, test_user, workspace):
    """Verifies empty or negligible audio payloads are handled gracefully without errors."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Silent Standup", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    upload_res = client.post(
        f"/api/v1/meetings/{meeting_id}/audio",
        files={"file": ("empty.webm", b"", "audio/webm")},
        data={"start_time_offset_ms": "0"},
        headers=test_user["headers"],
    )
    assert upload_res.status_code == 201
    assert upload_res.json() == []


def test_audio_ingestion_recording_not_consented(client: TestClient, test_user, workspace):
    """Verifies audio upload is rejected with 400 when meeting recording_consent is disabled."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Private Unrecorded Sync", "recording_consent": False},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 200
    upload_res = client.post(
        f"/api/v1/meetings/{meeting_id}/audio",
        files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
        data={"start_time_offset_ms": "0"},
        headers=test_user["headers"],
    )
    assert upload_res.status_code == 400
    detail = upload_res.json()["detail"]
    assert detail["error"]["code"] == "RECORDING_NOT_CONSENTED"


def test_audio_ingestion_unauthorized_user(client: TestClient, other_user, workspace):
    """Verifies user not belonging to workspace receives 403 when attempting to upload audio."""
    dummy_meeting_id = str(uuid.uuid4())
    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 200

    upload_res = client.post(
        f"/api/v1/meetings/{dummy_meeting_id}/audio",
        files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
        headers=other_user["headers"],
    )
    assert upload_res.status_code in (403, 404)


def test_audio_ingestion_missing_api_key(client: TestClient, test_user, workspace):
    """Verifies that missing GROQ_API_KEY returns clean 503 with standardized error."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Missing Key Meeting", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]
    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 300

    from app.core.config import settings
    with patch.object(settings, "GROQ_API_KEY", ""):
        upload_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            headers=test_user["headers"],
        )
        assert upload_res.status_code == 503
        detail = upload_res.json()["detail"]
        assert detail["error"]["code"] == "TRANSCRIPTION_NOT_CONFIGURED"
        assert "missing GROQ_API_KEY" in detail["error"]["message"]


def test_audio_ingestion_rate_limit(client: TestClient, test_user, workspace):
    """Verifies that Groq rate limits return clean 429 with standardized error after retry exhaustion."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Rate Limit Meeting", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]
    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 300

    from fastapi import HTTPException
    rate_limit_exc = HTTPException(
        status_code=429,
        detail={"error": {"code": "TRANSCRIPTION_RATE_LIMITED", "message": "Groq transcription rate limit reached. Please wait before retrying."}},
    )

    with patch("app.meetings.transcription_queue.transcribe_audio_payload", side_effect=rate_limit_exc), \
         patch("app.meetings.transcription_queue.asyncio.sleep", new_callable=AsyncMock):
        upload_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            headers=test_user["headers"],
        )
        assert upload_res.status_code == 429
        detail = upload_res.json()["detail"]
        assert detail["error"]["code"] == "TRANSCRIPTION_RATE_LIMITED"


def test_audio_ingestion_provider_failure(client: TestClient, test_user, workspace):
    """Verifies that Groq provider exceptions return clean 502 with standardized error."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Provider Failure Meeting", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]
    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 300

    with patch("app.meetings.transcription_queue.transcribe_audio_payload", side_effect=RuntimeError("Groq service connection timeout")), \
         patch("app.meetings.transcription_queue.asyncio.sleep", new_callable=AsyncMock):
        upload_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            headers=test_user["headers"],
        )
        assert upload_res.status_code == 502
        detail = upload_res.json()["detail"]
        assert detail["error"]["code"] == "TRANSCRIPTION_PROVIDER_ERROR"
        assert "Failed to transcribe meeting audio via Groq Whisper" in detail["error"]["message"]


def test_audio_ingestion_repeated_upload_deduplication(client: TestClient, test_user, workspace):
    """Verifies duplicate segments are prevented if an audio upload is retried."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Retry Deduplication Meeting", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]
    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 300

    mock_segments = [
        {
            "speaker_name": "Bob Architect",
            "content": "Let's review the API architecture specification.",
            "start_time_ms": 1000,
            "end_time_ms": 4000,
            "segment_index": 0,
        }
    ]

    with patch("app.meetings.transcription_queue.transcribe_audio_payload", return_value=mock_segments):
        # First upload
        res1 = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            data={"start_time_offset_ms": "5000", "speaker_name": "Bob Architect"},
            headers=test_user["headers"],
        )
        assert res1.status_code == 201
        assert len(res1.json()) == 1

        # Repeated / retried upload with identical offset and content
        res2 = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            data={"start_time_offset_ms": "5000", "speaker_name": "Bob Architect"},
            headers=test_user["headers"],
        )
        assert res2.status_code == 201
        assert len(res2.json()) == 1

    # Verify no duplicate segments in database
    trans_res = client.get(f"/api/v1/meetings/{meeting_id}/transcript", headers=test_user["headers"])
    assert trans_res.status_code == 200
    stored = trans_res.json()
    assert len(stored) == 1
    assert stored[0]["content"] == "Let's review the API architecture specification."


def test_transcription_queue_rate_limit_backoff_and_retry_success(client: TestClient, test_user, workspace):
    """
    Verifies that when Groq returns HTTP 429 RateLimit, the queue worker:
    1. Retries with exponential backoff.
    2. Succeeds on subsequent retry.
    3. Persists transcript and returns 201 with final segments.
    """
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Rate Limit Retry Success", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]
    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 300

    from fastapi import HTTPException
    rate_limit_exc = HTTPException(
        status_code=429,
        detail={"error": {"code": "TRANSCRIPTION_RATE_LIMITED", "message": "Groq rate limit reached"}},
    )
    successful_segments = [
        {
            "speaker_name": "Carol Manager",
            "content": "Recovered after rate limit backoff.",
            "start_time_ms": 200,
            "end_time_ms": 2500,
            "segment_index": 0,
        }
    ]

    mock_transcribe = AsyncMock(side_effect=[rate_limit_exc, successful_segments])

    with patch("app.meetings.transcription_queue.transcribe_audio_payload", mock_transcribe), \
         patch("app.meetings.transcription_queue.asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
        upload_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            data={"start_time_offset_ms": "1000", "speaker_name": "Carol Manager"},
            headers=test_user["headers"],
        )
        assert upload_res.status_code == 201
        segments = upload_res.json()
        assert len(segments) == 1
        assert segments[0]["content"] == "Recovered after rate limit backoff."
        assert mock_transcribe.call_count == 2
        assert mock_sleep.call_count >= 1

        # Check queue status
        queue_res = client.get(
            f"/api/v1/meetings/{meeting_id}/transcription-queue",
            headers=test_user["headers"],
        )
        assert queue_res.status_code == 200
        qdata = queue_res.json()
        assert qdata["completed_count"] >= 1
        assert qdata["failed_count"] == 0


def test_transcription_queue_retry_exhaustion_preserves_audio(client: TestClient, test_user, workspace):
    """
    Verifies that when Groq rate limits persist past max retries:
    1. Returns HTTP 429.
    2. Preserves raw audio bytes in memory.
    3. Exposes failed status with can_retry=True via queue status API.
    """
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Retry Exhaustion Preserved", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]
    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 350

    from fastapi import HTTPException
    rate_limit_exc = HTTPException(
        status_code=429,
        detail={"error": {"code": "TRANSCRIPTION_RATE_LIMITED", "message": "Rate limit exhausted"}},
    )

    with patch("app.meetings.transcription_queue.transcribe_audio_payload", side_effect=rate_limit_exc), \
         patch("app.meetings.transcription_queue.asyncio.sleep", new_callable=AsyncMock):
        upload_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            headers=test_user["headers"],
        )
        assert upload_res.status_code == 429

    # Verify queue status reports the failed batch and preserved audio
    queue_res = client.get(
        f"/api/v1/meetings/{meeting_id}/transcription-queue",
        headers=test_user["headers"],
    )
    assert queue_res.status_code == 200
    qdata = queue_res.json()
    assert qdata["failed_count"] == 1
    assert len(qdata["failed_batches"]) == 1
    assert qdata["failed_batches"][0]["can_retry"] is True


def test_transcription_queue_failed_batch_recovery(client: TestClient, test_user, workspace):
    """
    Verifies that failed audio batches can be re-enqueued and recovered via:
    POST /meetings/{meeting_id}/audio/retry-failed
    """
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Batch Recovery Meeting", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]
    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 350

    from fastapi import HTTPException
    # 1. Fail first
    rate_limit_exc = HTTPException(
        status_code=429,
        detail={"error": {"code": "TRANSCRIPTION_RATE_LIMITED", "message": "Quota limit"}},
    )
    with patch("app.meetings.transcription_queue.transcribe_audio_payload", side_effect=rate_limit_exc), \
         patch("app.meetings.transcription_queue.asyncio.sleep", new_callable=AsyncMock):
        client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            data={"speaker_name": "Dave Engineer", "start_time_offset_ms": "0"},
            headers=test_user["headers"],
        )

    # Confirm 1 failed batch
    q_check = client.get(f"/api/v1/meetings/{meeting_id}/transcription-queue", headers=test_user["headers"])
    assert q_check.json()["failed_count"] == 1

    # 2. Trigger retry-failed with mocked success
    recovered_segments = [
        {
            "speaker_name": "Dave Engineer",
            "content": "Audio batch successfully recovered from preserved buffer.",
            "start_time_ms": 100,
            "end_time_ms": 3000,
            "segment_index": 0,
        }
    ]

    with patch("app.meetings.transcription_queue.transcribe_audio_payload", return_value=recovered_segments):
        retry_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio/retry-failed",
            headers=test_user["headers"],
        )
        assert retry_res.status_code == 200
        data = retry_res.json()
        assert data["retried_count"] == 1
        assert len(data["batch_ids"]) == 1

    # Check transcript was persisted
    trans_res = client.get(f"/api/v1/meetings/{meeting_id}/transcript", headers=test_user["headers"])
    assert trans_res.status_code == 200
    stored = trans_res.json()
    assert any("Audio batch successfully recovered" in s["content"] for s in stored)


def test_end_meeting_flushes_pending_transcription_batches(client: TestClient, test_user, workspace, project):
    """
    Verifies that calling POST /meetings/{id}/end automatically flushes
    in-flight transcription batches before computing the final AI summary.
    """
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Flush Test Meeting", "project_id": project["id"], "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]
    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 300

    flushed_segments = [
        {
            "speaker_name": "Host",
            "content": "Final remarks right before the meeting ended.",
            "start_time_ms": 0,
            "end_time_ms": 3000,
            "segment_index": 0,
        }
    ]

    mock_intel = ExtractedIntelligence(
        summary="Summary includes final remarks before meeting end.",
        decisions=["All tasks committed"],
        tasks=[],
        calendar_events=[],
    )

    with patch("app.meetings.transcription_queue.transcribe_audio_payload", return_value=flushed_segments):
        upload_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            data={"speaker_name": "Host"},
            headers=test_user["headers"],
        )
        assert upload_res.status_code == 201

    with patch("app.meetings.service.analyze_meeting_transcript", return_value=mock_intel):
        end_res = client.post(f"/api/v1/meetings/{meeting_id}/end", headers=test_user["headers"])
        assert end_res.status_code == 200
        assert end_res.json()["status"] == "ENDED"

    # Verify AI summary was generated and includes context
    sum_res = client.get(f"/api/v1/meetings/{meeting_id}/summary", headers=test_user["headers"])
    assert sum_res.status_code == 200
    assert sum_res.json()["summary_text"] == "Summary includes final remarks before meeting end."


def test_audio_ingestion_unsupported_format(client: TestClient, test_user, workspace):
    """Verifies that non-audio MIME types return clean 400 Bad Request."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Bad Format Meeting", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]
    dummy_data = b"%PDF-1.5 fake pdf content" + b"\x00" * 200

    upload_res = client.post(
        f"/api/v1/meetings/{meeting_id}/audio",
        files={"file": ("document.pdf", dummy_data, "application/pdf")},
        headers=test_user["headers"],
    )
    assert upload_res.status_code == 400
    detail = upload_res.json()["detail"]
    assert detail["error"]["code"] == "UNSUPPORTED_AUDIO_FORMAT"


def test_audio_ingestion_oversized_payload(client: TestClient, test_user, workspace):
    """Verifies oversized audio chunks exceeding MAX_UPLOAD_SIZE are rejected with 413."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Oversized Audio Meeting", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    from app.core.config import settings
    # Temporarily set max upload size to 500 bytes for test
    with patch.object(settings, "MAX_UPLOAD_SIZE", 500):
        large_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 1000
        upload_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("large.webm", large_audio, "audio/webm")},
            headers=test_user["headers"],
        )
        assert upload_res.status_code == 413
        detail = upload_res.json()["detail"]
        assert detail["error"]["code"] == "AUDIO_TOO_LARGE"


def test_end_meeting_auto_triggers_ai_analysis(client: TestClient, test_user, workspace, project):
    """Verifies ending a meeting automatically triggers AI analysis when transcripts exist."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Auto Analysis Meeting", "project_id": project["id"], "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    # Ingest transcript
    client.post(
        f"/api/v1/meetings/{meeting_id}/transcript",
        json={"segments": [{"content": "We decided to ship the v2 release on Friday.", "speaker_name": "Host"}]},
        headers=test_user["headers"],
    )

    mock_intelligence = ExtractedIntelligence(
        summary="Automated meeting summary generated upon meeting conclusion.",
        decisions=["Ship v2 release on Friday"],
        tasks=[],
        calendar_events=[],
    )

    with patch("app.meetings.service.analyze_meeting_transcript", return_value=mock_intelligence):
        end_res = client.post(f"/api/v1/meetings/{meeting_id}/end", headers=test_user["headers"])
        assert end_res.status_code == 200
        assert end_res.json()["status"] == "ENDED"

    # Verify AI summary was created automatically
    sum_res = client.get(f"/api/v1/meetings/{meeting_id}/summary", headers=test_user["headers"])
    assert sum_res.status_code == 200
    assert sum_res.json()["summary_text"] == "Automated meeting summary generated upon meeting conclusion."
    assert "Ship v2 release on Friday" in sum_res.json()["decisions"]


def test_duplicate_suggestions_prevented(client: TestClient, test_user, workspace, project):
    """
    Verifies that re-running analysis (retry) on a meeting:
    1. Prevents duplicate suggested items.
    2. Preserves already approved/rejected suggestions.
    """
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Idempotent Suggestions Meeting", "project_id": project["id"], "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    client.post(
        f"/api/v1/meetings/{meeting_id}/transcript",
        json={"segments": [{"content": "Alice will complete the security audit tomorrow.", "speaker_name": "Host"}]},
        headers=test_user["headers"],
    )

    mock_intel_1 = ExtractedIntelligence(
        summary="First analysis pass.",
        decisions=["Conduct security audit"],
        tasks=[
            ExtractedTask(
                title="Complete security audit",
                description="Security review before production launch",
                suggested_assignee_name="Alice",
                suggested_due_date=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                is_explicit_commitment=True,
            )
        ],
        calendar_events=[],
    )

    with patch("app.meetings.service.analyze_meeting_transcript", return_value=mock_intel_1):
        res1 = client.post(f"/api/v1/meetings/{meeting_id}/analyze", headers=test_user["headers"])
        assert res1.status_code == 200

    sug_res1 = client.get(f"/api/v1/meetings/{meeting_id}/suggestions", headers=test_user["headers"])
    items1 = sug_res1.json()
    assert len(items1) == 1
    first_task_id = items1[0]["id"]

    # Re-run analysis with same task and an additional new task
    mock_intel_2 = ExtractedIntelligence(
        summary="Second analysis pass with retry.",
        decisions=["Conduct security audit", "Deploy monitoring"],
        tasks=[
            ExtractedTask(
                title="Complete security audit",  # identical title -> should NOT be duplicated
                description="Updated description",
                suggested_assignee_name="Alice",
                is_explicit_commitment=True,
            ),
            ExtractedTask(
                title="Deploy Prometheus monitoring",  # genuinely new item -> should be added
                description="Setup metrics collection",
                is_explicit_commitment=True,
            ),
        ],
        calendar_events=[],
    )

    # Force re-analysis with new transcript segment
    client.post(
        f"/api/v1/meetings/{meeting_id}/transcript",
        json={"segments": [{"content": "Also deploy Prometheus monitoring.", "speaker_name": "Host"}]},
        headers=test_user["headers"],
    )

    with patch("app.meetings.service.analyze_meeting_transcript", return_value=mock_intel_2):
        res2 = client.post(f"/api/v1/meetings/{meeting_id}/analyze", headers=test_user["headers"])
        assert res2.status_code == 200

    sug_res2 = client.get(f"/api/v1/meetings/{meeting_id}/suggestions", headers=test_user["headers"])
    items2 = sug_res2.json()

    # Total should be 2 (the original one and the new one, NO duplicate "Complete security audit")
    assert len(items2) == 2
    titles = [it["title"] for it in items2]
    assert titles.count("Complete security audit") == 1
    assert titles.count("Deploy Prometheus monitoring") == 1


@pytest.mark.anyio
async def test_transcribe_audio_payload_groq_parser_unit():
    """Directly tests transcribe_audio_payload Groq response parser and timestamp conversion."""
    from unittest.mock import AsyncMock, MagicMock
    from app.meetings.transcription_service import transcribe_audio_payload
    from app.core.config import settings

    mock_verbose_response = MagicMock()
    mock_verbose_response.model_dump.return_value = {
        "text": "Hello world from Groq Whisper.",
        "duration": 4.5,
        "segments": [
            {
                "id": 0,
                "start": 0.5,
                "end": 2.2,
                "text": "Hello world",
            },
            {
                "id": 1,
                "start": 2.5,
                "end": 4.5,
                "text": "from Groq Whisper.",
            },
        ],
    }

    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 200

    with patch.object(settings, "GROQ_API_KEY", "gsk_test_key_for_unit_tests"), \
         patch("app.meetings.transcription_service.AsyncGroq") as mock_groq_class:
        mock_client = MagicMock()
        mock_create = AsyncMock(return_value=mock_verbose_response)
        mock_client.audio.transcriptions.create = mock_create
        mock_groq_class.return_value = mock_client

        segments = await transcribe_audio_payload(
            audio_bytes=dummy_audio,
            content_type="audio/webm",
            uploader_name="Diana Prince",
        )

        assert len(segments) == 2
        # Verify 0.5s -> 500ms, 2.2s -> 2200ms
        assert segments[0]["start_time_ms"] == 500
        assert segments[0]["end_time_ms"] == 2200
        assert segments[0]["content"] == "Hello world"
        assert segments[0]["speaker_name"] == "Diana Prince"

        assert segments[1]["start_time_ms"] == 2500
        assert segments[1]["end_time_ms"] == 4500
        assert segments[1]["content"] == "from Groq Whisper."
        assert segments[1]["speaker_name"] == "Diana Prince"

        # Verify SDK was called with correct parameters
        mock_create.assert_called_once_with(
            file=("audio_chunk.webm", dummy_audio),
            model="whisper-large-v3-turbo",
            response_format="verbose_json",
        )


def test_participant_aware_transcription_attribution(client: TestClient, test_user, other_user, workspace):
    """Feature 1: Verifies authenticated LiveKit participant identity is used to associate speech with a participant."""
    # Add other_user to workspace
    client.post(
        f"/api/v1/workspaces/{workspace['id']}/members",
        json={"email": other_user["email"], "role": "MEMBER"},
        headers=test_user["headers"],
    )

    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Participant Aware Sync", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    # Other user joins
    join_res = client.post(f"/api/v1/meetings/{meeting_id}/join", headers=other_user["headers"])
    assert join_res.status_code == 200

    # Get other_user's user_id from their auth
    me_res = client.get("/api/v1/auth/me", headers=other_user["headers"])
    other_user_id = me_res.json()["id"]

    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 400
    mock_segments = [
        {
            "speaker_name": "Other User",
            "content": "I am working on the database indexing optimization.",
            "start_time_ms": 100,
            "end_time_ms": 2500,
            "segment_index": 0,
        }
    ]

    with patch("app.meetings.transcription_queue.transcribe_audio_payload", return_value=mock_segments):
        upload_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            data={
                "start_time_offset_ms": "0",
                "speaker_name": "Other User",
                "participant_id": other_user_id,
            },
            headers=other_user["headers"],
        )
        assert upload_res.status_code == 201
        segments = upload_res.json()
        assert len(segments) == 1
        assert segments[0]["participant_id"] == other_user_id
        assert segments[0]["speaker_user_id"] == other_user_id
        assert segments[0]["speaker_name"] == "Other User"
        assert segments[0]["processing_status"] == "COMPLETED"

    # Verify persisted segment in meeting transcript
    trans_res = client.get(f"/api/v1/meetings/{meeting_id}/transcript", headers=test_user["headers"])
    assert trans_res.status_code == 200
    persisted = trans_res.json()
    assert len(persisted) == 1
    assert persisted[0]["participant_id"] == other_user_id
    assert persisted[0]["speaker_name"] == "Other User"
    assert persisted[0]["processing_status"] == "COMPLETED"


def test_unidentified_participant_marked_unknown(client: TestClient, test_user, workspace):
    """Feature 1: Never guess. If source participant cannot be verified, mark speaker as 'Unknown Speaker'."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Unidentified Speaker Meeting", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 400
    mock_segments = [
        {
            "speaker_name": "Ghost Caller",
            "content": "This statement comes from an unverifiable source track.",
            "start_time_ms": 0,
            "end_time_ms": 3000,
            "segment_index": 0,
        }
    ]

    fake_unidentifiable_id = str(uuid.uuid4())
    with patch("app.meetings.transcription_queue.transcribe_audio_payload", return_value=mock_segments):
        upload_res = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("chunk.webm", dummy_audio, "audio/webm")},
            data={
                "start_time_offset_ms": "0",
                "speaker_name": "Ghost Caller",
                "participant_id": fake_unidentifiable_id,
            },
            headers=test_user["headers"],
        )
        assert upload_res.status_code == 201
        segments = upload_res.json()
        assert len(segments) == 1
        # MUST be marked as Unknown Speaker and speaker_user_id None
        assert segments[0]["speaker_name"] == "Unknown Speaker"
        assert segments[0]["speaker_user_id"] is None


def test_simultaneous_speakers_separate_attribution(client: TestClient, test_user, other_user, workspace):
    """Feature 1: Handle simultaneous speaking without mixing audio into a single track before attribution."""
    client.post(
        f"/api/v1/workspaces/{workspace['id']}/members",
        json={"email": other_user["email"], "role": "MEMBER"},
        headers=test_user["headers"],
    )
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Simultaneous Discussion", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    client.post(f"/api/v1/meetings/{meeting_id}/join", headers=other_user["headers"])
    me_host = client.get("/api/v1/auth/me", headers=test_user["headers"]).json()
    me_other = client.get("/api/v1/auth/me", headers=other_user["headers"]).json()

    dummy_audio = b"\x1a\x45\xdf\xa3" + b"\x00" * 400

    # Both speakers speak at time offset 8000ms simultaneously
    with patch("app.meetings.transcription_queue.transcribe_audio_payload", return_value=[{
        "speaker_name": "Host", "content": "I propose we use Redis for caching.", "start_time_ms": 0, "end_time_ms": 2000, "segment_index": 0
    }]):
        res1 = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("host.webm", dummy_audio, "audio/webm")},
            data={"start_time_offset_ms": "8000", "speaker_name": "Host", "participant_id": me_host["id"]},
            headers=test_user["headers"],
        )
        assert res1.status_code == 201

    with patch("app.meetings.transcription_queue.transcribe_audio_payload", return_value=[{
        "speaker_name": "Other User", "content": "I agree with Redis for session store.", "start_time_ms": 0, "end_time_ms": 2000, "segment_index": 0
    }]):
        res2 = client.post(
            f"/api/v1/meetings/{meeting_id}/audio",
            files={"file": ("other.webm", dummy_audio, "audio/webm")},
            data={"start_time_offset_ms": "8000", "speaker_name": "Other User", "participant_id": me_other["id"]},
            headers=other_user["headers"],
        )
        assert res2.status_code == 201

    # Fetch transcript: both segments present, separate attribution, preserved timecodes
    trans_res = client.get(f"/api/v1/meetings/{meeting_id}/transcript", headers=test_user["headers"])
    all_segments = trans_res.json()
    assert len(all_segments) == 2
    speakers = {s["speaker_name"] for s in all_segments}
    assert "Host" in speakers
    assert "Other User" in speakers
    for s in all_segments:
        assert s["start_time_ms"] == 8000
        assert s["processing_status"] == "COMPLETED"


def test_post_meeting_processing_pipeline_stages(client: TestClient, test_user, workspace, project):
    """Feature 2: Durable background processing stages from meeting end to ready for review."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Sprint Wrapup", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    # Ingest dialogue
    client.post(
        f"/api/v1/meetings/{meeting_id}/transcript",
        json={
            "segments": [
                {"content": "Let's review the sprint deliverables.", "speaker_name": "Meeting Host", "start_time_ms": 0, "end_time_ms": 3000},
                {"content": "Meeting Host will prepare the production launch checklist by next Tuesday.", "speaker_name": "Meeting Host", "start_time_ms": 3200, "end_time_ms": 8000},
            ]
        },
        headers=test_user["headers"],
    )

    mock_intel = ExtractedIntelligence(
        summary="Sprint wrap-up concluded with alignment on production launch checklist.",
        decisions=["Launch scheduled for next Tuesday."],
        tasks=[
            ExtractedTask(
                title="Prepare production launch checklist",
                description="Draft and verify all pre-launch checklist items",
                suggested_assignee_name="Meeting Host",
                suggested_priority="HIGH",
                is_explicit_commitment=True,
            )
        ],
        calendar_events=[
            ExtractedCalendarEvent(
                title="Production Launch Sync",
                description="Final pre-launch checkpoint",
                suggested_start_time=(datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
                suggested_end_time=(datetime.now(timezone.utc) + timedelta(days=2, hours=1)).isoformat(),
            )
        ],
    )

    with patch("app.meetings.service.analyze_meeting_transcript", return_value=mock_intel):
        # End meeting -> executes post-meeting background pipeline
        end_res = client.post(f"/api/v1/meetings/{meeting_id}/end", headers=test_user["headers"])
        assert end_res.status_code == 200
        assert end_res.json()["status"] == "ENDED"

    # Verify summary status and enriched processing stage
    sum_res = client.get(f"/api/v1/meetings/{meeting_id}/summary", headers=test_user["headers"])
    assert sum_res.status_code == 200
    summary = sum_res.json()
    assert summary["processing_status"] == "READY"
    assert summary["processing_stage"] == "Ready for review"
    assert "Sprint wrap-up concluded" in summary["summary_text"]
    assert len(summary["decisions"]) == 1

    # Verify reviewable suggestions are generated as PENDING
    sug_res = client.get(f"/api/v1/meetings/{meeting_id}/suggestions", headers=test_user["headers"])
    assert sug_res.status_code == 200
    suggestions = sug_res.json()
    assert len(suggestions) == 2
    for s in suggestions:
        assert s["status"] == "PENDING"
        assert s["approved_task_id"] is None
        assert s["approved_event_id"] is None


def test_user_approval_gate_and_kanban_calendar_creation(client: TestClient, test_user, workspace, project):
    """Approval UI & Gate: Kanban tasks and calendar events are ONLY created upon user approval."""
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Approval Gate Meeting", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    client.post(
        f"/api/v1/meetings/{meeting_id}/transcript",
        json={"segments": [{"content": "Alice will configure the SSL certificates.", "speaker_name": "Alice"}]},
        headers=test_user["headers"],
    )

    mock_intel = ExtractedIntelligence(
        summary="Discussion on SSL certificate configuration.",
        decisions=[],
        tasks=[
            ExtractedTask(
                title="Configure SSL certificates",
                description="Setup Let's Encrypt certificates on production domain",
                suggested_priority="URGENT",
                is_explicit_commitment=True,
            )
        ],
        calendar_events=[
            ExtractedCalendarEvent(
                title="SSL Verification Call",
                description="Verify cert renewal",
                suggested_start_time=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
                suggested_end_time=(datetime.now(timezone.utc) + timedelta(days=1, hours=1)).isoformat(),
            )
        ],
    )

    with patch("app.meetings.service.analyze_meeting_transcript", return_value=mock_intel):
        client.post(f"/api/v1/meetings/{meeting_id}/end", headers=test_user["headers"])

    # 1. Verify before approval: No tasks in project yet!
    tasks_res = client.get(f"/api/v1/projects/{project['id']}/tasks", headers=test_user["headers"])
    assert tasks_res.status_code == 200
    existing_titles = [t["title"] for t in tasks_res.json()]
    assert "Configure SSL certificates" not in existing_titles

    # 2. Get suggestions
    sug_res = client.get(f"/api/v1/meetings/{meeting_id}/suggestions", headers=test_user["headers"])
    suggestions = sug_res.json()
    task_sug = next(s for s in suggestions if s["item_type"] == "TASK")
    event_sug = next(s for s in suggestions if s["item_type"] == "CALENDAR_EVENT")

    # 3. User edits suggestion before approval
    edit_res = client.patch(
        f"/api/v1/meetings/suggestions/{task_sug['id']}",
        json={"title": "Configure Wildcard SSL Certificates"},
        headers=test_user["headers"],
    )
    assert edit_res.status_code == 200
    assert edit_res.json()["title"] == "Configure Wildcard SSL Certificates"

    # 4. Explicit user approval of task suggestion
    approve_res = client.post(
        f"/api/v1/meetings/suggestions/{task_sug['id']}/approve",
        json={"target_project_id": project["id"]},
        headers=test_user["headers"],
    )
    assert approve_res.status_code == 200
    approved = approve_res.json()
    assert approved["status"] == "APPROVED"
    assert approved["approved_task_id"] is not None

    # 5. Verify real task now exists in Kanban project
    tasks_res_after = client.get(f"/api/v1/projects/{project['id']}/tasks", headers=test_user["headers"])
    titles_after = [t["title"] for t in tasks_res_after.json()]
    assert "Configure Wildcard SSL Certificates" in titles_after

    # 6. Explicit user approval of calendar event suggestion
    approve_ev_res = client.post(
        f"/api/v1/meetings/suggestions/{event_sug['id']}/approve",
        json={},
        headers=test_user["headers"],
    )
    assert approve_ev_res.status_code == 200
    approved_ev = approve_ev_res.json()
    assert approved_ev["status"] == "APPROVED"
    assert approved_ev["approved_event_id"] is not None


def test_meeting_participants_and_leave_flow(client: TestClient, test_user, workspace):
    """
    Verifies that:
    1. Participants who join are recorded with role and joined_at.
    2. Calling leave endpoint sets left_at.
    3. Ending the meeting sets left_at for any active attendees.
    """
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Participant Tracking Sync", "recording_consent": True},
        headers=test_user["headers"],
    )
    assert create_res.status_code == 201
    meeting_id = create_res.json()["id"]

    # Host joins
    join_res = client.post(f"/api/v1/meetings/{meeting_id}/join", headers=test_user["headers"])
    assert join_res.status_code == 200

    # Get participants
    p_res = client.get(f"/api/v1/meetings/{meeting_id}/participants", headers=test_user["headers"])
    assert p_res.status_code == 200
    participants = p_res.json()
    assert len(participants) == 1
    assert participants[0]["role"] == "HOST"
    assert participants[0]["joined_at"] is not None
    assert participants[0]["left_at"] is None

    # Leave meeting
    leave_res = client.post(f"/api/v1/meetings/{meeting_id}/leave", headers=test_user["headers"])
    assert leave_res.status_code == 200
    assert leave_res.json()["status"] == "ok"

    # Verify left_at is now set
    p_res2 = client.get(f"/api/v1/meetings/{meeting_id}/participants", headers=test_user["headers"])
    assert p_res2.status_code == 200
    assert p_res2.json()[0]["left_at"] is not None


def test_completed_meeting_retrieval_without_joining(client: TestClient, test_user, workspace):
    """
    Verifies that a completed meeting can be fully retrieved via detail & transcript
    endpoints without reconnecting to LiveKit.
    """
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Post-Mortem Review", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    # Ingest transcript
    client.post(
        f"/api/v1/meetings/{meeting_id}/transcript",
        json={
            "segments": [
                {
                    "content": "Reviewing system uptime and database indexes.",
                    "speaker_name": "Alice Host",
                    "start_time_ms": 100,
                    "end_time_ms": 2000,
                }
            ]
        },
        headers=test_user["headers"],
    )

    # End meeting
    end_res = client.post(f"/api/v1/meetings/{meeting_id}/end", headers=test_user["headers"])
    assert end_res.status_code == 200
    assert end_res.json()["status"] == "ENDED"
    assert end_res.json()["actual_end"] is not None

    # Retrieve completed meeting without joining
    detail_res = client.get(f"/api/v1/meetings/{meeting_id}", headers=test_user["headers"])
    assert detail_res.status_code == 200
    assert detail_res.json()["status"] == "ENDED"

    # Retrieve transcript of completed meeting
    trans_res = client.get(f"/api/v1/meetings/{meeting_id}/transcript", headers=test_user["headers"])
    assert trans_res.status_code == 200
    assert len(trans_res.json()) == 1
    assert trans_res.json()[0]["content"] == "Reviewing system uptime and database indexes."

    # Attempting to join live room should be rejected with MEETING_INACTIVE
    join_res = client.post(f"/api/v1/meetings/{meeting_id}/join", headers=test_user["headers"])
    assert join_res.status_code == 400
    assert join_res.json()["detail"]["error"]["code"] == "MEETING_INACTIVE"


def test_meeting_workspace_access_control(client: TestClient, test_user, workspace):
    """
    Verifies that users who are NOT members of a workspace cannot view or join its meetings.
    """
    # Create meeting in workspace A
    create_res = client.post(
        f"/api/v1/workspaces/{workspace['id']}/meetings",
        json={"title": "Private Team Sync", "recording_consent": True},
        headers=test_user["headers"],
    )
    meeting_id = create_res.json()["id"]

    # Register unauthorized user
    import time
    unauth_email = f"unauth_{int(time.time() * 1000)}@example.com"
    client.post("/api/v1/auth/register", json={"name": "Intruder", "email": unauth_email, "password": "Password123!"})
    login_res = client.post("/api/v1/auth/login", json={"email": unauth_email, "password": "Password123!"})
    unauth_headers = {"Authorization": f"Bearer {login_res.json()['access_token']}"}

    # Unauthorized access to get meeting
    res1 = client.get(f"/api/v1/meetings/{meeting_id}", headers=unauth_headers)
    assert res1.status_code == 403

    # Unauthorized access to join meeting
    res2 = client.post(f"/api/v1/meetings/{meeting_id}/join", headers=unauth_headers)
    assert res2.status_code == 403

    # Unauthorized access to get transcript
    res3 = client.get(f"/api/v1/meetings/{meeting_id}/transcript", headers=unauth_headers)
    assert res3.status_code == 403

    # Unauthorized access to list meetings in workspace
    res4 = client.get(f"/api/v1/workspaces/{workspace['id']}/meetings", headers=unauth_headers)
    assert res4.status_code == 403


