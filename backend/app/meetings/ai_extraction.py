import json
import re
import hashlib
import logging
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

from app.ai.llm.factory import get_llm_provider
from app.ai.llm.base import ChatMessage
from .models import (
    Meeting,
    TranscriptSegment,
    MeetingAISummary,
    MeetingSuggestedItem,
    ProcessingStatusEnum,
    SuggestionItemTypeEnum,
    SuggestionStatusEnum,
)

logger = logging.getLogger("ai_productivity_platform.meetings.ai")


class ExtractedTask(BaseModel):
    title: str
    description: Optional[str] = None
    suggested_assignee_name: Optional[str] = None
    suggested_due_date: Optional[str] = None
    suggested_priority: Optional[str] = "MEDIUM"
    evidence_text: Optional[str] = None
    is_explicit_commitment: bool = False


class ExtractedCalendarEvent(BaseModel):
    title: str
    description: Optional[str] = None
    suggested_start_time: Optional[str] = None
    suggested_end_time: Optional[str] = None
    evidence_text: Optional[str] = None


class ExtractedIntelligence(BaseModel):
    summary: str
    decisions: List[str] = []
    tasks: List[ExtractedTask] = []
    calendar_events: List[ExtractedCalendarEvent] = []


def compute_transcript_hash(segments: List[TranscriptSegment]) -> str:
    combined = "".join(f"{s.speaker_name or ''}:{s.content};" for s in segments)
    return hashlib.sha256(combined.encode("utf-8")).hexdigest()


def format_transcript_for_prompt(segments: List[TranscriptSegment]) -> str:
    lines = []
    for s in segments:
        secs = s.start_time_ms // 1000
        mins = secs // 60
        rem_secs = secs % 60
        timestamp = f"[{mins:02d}:{rem_secs:02d}]"
        speaker = s.speaker_name or "Unknown Speaker"
        lines.append(f"{timestamp} {speaker}: {s.content}")
    return "\n".join(lines)


def parse_llm_json_response(raw_text: str) -> Dict[str, Any]:
    text = raw_text.strip()
    # Remove markdown code fences if present
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        text = match.group(1).strip()
    return json.loads(text)


def analyze_meeting_transcript(
    meeting: Meeting,
    segments: List[TranscriptSegment],
    member_directory: List[Dict[str, str]],  # [{"id": ..., "name": ..., "email": ...}]
) -> ExtractedIntelligence:
    """
    Calls provider-neutral LLM with structured prompt to produce summary,
    decisions, actionable tasks, and calendar events.
    """
    if not segments:
        return ExtractedIntelligence(
            summary="No transcript available for this meeting.",
            decisions=[],
            tasks=[],
            calendar_events=[],
        )

    formatted_transcript = format_transcript_for_prompt(segments)
    now_iso = datetime.now(timezone.utc).isoformat()
    members_desc = ", ".join(f"{m.get('name')} ({m.get('email')})" for m in member_directory)

    system_prompt = (
        "You are an expert AI executive assistant and meeting intelligence analyst.\n"
        "Analyze the provided meeting transcript with high precision and extract actionable insights.\n"
        "Safety and Accuracy Rules:\n"
        "1. Strictly base your extraction ONLY on the verified statements in the transcript.\n"
        "2. Do NOT invent commitments, attendees, or dates that were not discussed.\n"
        "3. Only flag 'is_explicit_commitment': true when a speaker unambiguously committed or explicitly accepted a task (e.g., 'I will send the report'). Casual suggestions or open questions must have 'is_explicit_commitment': false.\n"
        "4. Assignee names should match one of the workspace members when identifiable from context.\n"
        "5. Output must be valid JSON conforming strictly to the required schema with no trailing commentary.\n\n"
        "Required JSON schema:\n"
        "{\n"
        '  "summary": "Concise yet thorough meeting summary detailing discussion points, context, and outcomes",\n'
        '  "decisions": ["Key decision 1", "Key decision 2"],\n'
        '  "tasks": [\n'
        '    {\n'
        '      "title": "Actionable task title",\n'
        '      "description": "Details and requirements",\n'
        '      "suggested_assignee_name": "Full Name or null",\n'
        '      "suggested_due_date": "YYYY-MM-DDTHH:MM:SSZ or null",\n'
        '      "suggested_priority": "LOW|MEDIUM|HIGH|URGENT",\n'
        '      "evidence_text": "Exact quote from transcript",\n'
        '      "is_explicit_commitment": true|false\n'
        '    }\n'
        '  ],\n'
        '  "calendar_events": [\n'
        '    {\n'
        '      "title": "Event or follow-up title",\n'
        '      "description": "Details",\n'
        '      "suggested_start_time": "YYYY-MM-DDTHH:MM:SSZ or null",\n'
        '      "suggested_end_time": "YYYY-MM-DDTHH:MM:SSZ or null",\n'
        '      "evidence_text": "Exact quote from transcript"\n'
        '    }\n'
        '  ]\n'
        "}"
    )

    user_prompt = (
        f"Meeting Title: {meeting.title}\n"
        f"Meeting Scheduled Time: {meeting.scheduled_start or meeting.created_at}\n"
        f"Current Reference Time: {now_iso}\n"
        f"Workspace Members: {members_desc}\n\n"
        f"Transcript:\n"
        f"-----------------\n"
        f"{formatted_transcript}\n"
        f"-----------------\n\n"
        "Extract the summary, decisions, actionable tasks, and follow-up calendar events into the requested JSON schema."
    )

    provider = get_llm_provider()
    try:
        response_text = provider.generate_chat(
            messages=[
                ChatMessage(role="user", content=user_prompt),
            ],
            system_prompt=system_prompt,
            temperature=0.1,
            max_tokens=2000,
        )
        data = parse_llm_json_response(response_text)
        return ExtractedIntelligence(**data)
    except Exception as exc:
        logger.error("AI meeting intelligence extraction failed: %s", str(exc), exc_info=True)
        # Graceful fallback: return basic heuristic summary without crashing
        return ExtractedIntelligence(
            summary=f"Meeting discussion regarding '{meeting.title}'. AI processing error: {str(exc)}",
            decisions=[],
            tasks=[],
            calendar_events=[],
        )
