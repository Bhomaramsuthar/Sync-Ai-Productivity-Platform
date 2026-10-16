from typing import List, Optional, Callable, Dict, Any
from .base import BaseLLMProvider, ChatMessage


class MockLLMProvider(BaseLLMProvider):
    """
    Deterministic Mock LLM Provider for unit and integration testing.
    Never makes external network calls.
    """

    def __init__(
        self,
        default_response: Optional[str] = None,
        response_generator: Optional[Callable[[List[ChatMessage], Optional[str]], str]] = None,
        model_name: str = "mock-deterministic-v1",
        raise_error: Optional[Exception] = None,
    ):
        self._model_name = model_name
        self._default_response = default_response or "Based on the provided documents, the system uses JWT tokens for session authentication."
        self._response_generator = response_generator
        self._raise_error = raise_error
        self.call_history: List[Dict[str, Any]] = []

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return self._model_name

    def set_error(self, error: Optional[Exception]):
        self._raise_error = error

    def set_default_response(self, response: str):
        self._default_response = response

    def generate_chat(
        self,
        messages: List[ChatMessage],
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        self.call_history.append({
            "messages": messages,
            "system_prompt": system_prompt,
            "temperature": temperature,
            "max_tokens": max_tokens,
        })

        if self._raise_error is not None:
            raise self._raise_error

        if self._response_generator is not None:
            return self._response_generator(messages, system_prompt)

        # Default intelligent mock behaviour based on query
        last_message = messages[-1].content if messages else ""
        
        # Check prompt injection simulation:
        if "ignore previous instructions" in last_message.lower() or "system prompt" in last_message.lower():
            return "I am instructed to rely only on verified document evidence and cannot override safety guidelines or disclose internal prompts."

        sys_str = (system_prompt or "").lower()
        # Intelligent defaults for structured productivity tasks if default response not explicitly overridden
        if self._default_response.startswith("Based on the provided documents"):
            if "acceptance_criteria" in sys_str or "transform a short task title" in sys_str:
                return (
                    '{\n'
                    '  "description": "Implement verified functionality with complete test coverage and proper error handling.",\n'
                    '  "acceptance_criteria": [\n'
                    '    "Unit tests pass with 100% assertion coverage",\n'
                    '    "API endpoint returns expected status codes",\n'
                    '    "User documentation and Swagger specs updated"\n'
                    '  ],\n'
                    '  "suggested_priority": "HIGH"\n'
                    '}'
                )
            elif "subtasks" in sys_str or "break down the provided task" in sys_str:
                return (
                    '{\n'
                    '  "subtasks": [\n'
                    '    {"title": "Design schema and validation models", "description": "Define data contracts and schemas.", "priority": "HIGH"},\n'
                    '    {"title": "Implement backend service logic", "description": "Create business logic and persistence.", "priority": "HIGH"},\n'
                    '    {"title": "Write automated unit tests", "description": "Ensure full coverage of positive and negative cases.", "priority": "MEDIUM"}\n'
                    '  ]\n'
                    '}'
                )
            elif "unblocking_steps" in sys_str or "next_action" in sys_str:
                return (
                    '{\n'
                    '  "next_action": "Coordinate with upstream dependency owner to align interfaces.",\n'
                    '  "unblocking_steps": [\n'
                    '    "Inspect error logs and reproduce locally",\n'
                    '    "Implement a fallback stub while upstream is resolved",\n'
                    '    "Schedule verification sync with stakeholders"\n'
                    '  ],\n'
                    '  "rationale": "Allows isolated development without stalling the entire sprint."\n'
                    '}'
                )
            elif "objective project management advisor" in sys_str or "suggested_priority" in sys_str:
                return (
                    '{\n'
                    '  "suggested_priority": "HIGH",\n'
                    '  "reasoning": "High priority recommended due to near-term milestone dependencies."\n'
                    '}'
                )
            elif "executive project management analyst" in sys_str or "key_highlights" in sys_str:
                return (
                    '{\n'
                    '  "executive_summary": "The project is making steady progress toward core deliverables with active task execution.",\n'
                    '  "key_highlights": [\n'
                    '    "Completed essential milestone tasks",\n'
                    '    "Consistent activity logged across team deliverables"\n'
                    '  ],\n'
                    '  "potential_blockers": [\n'
                    '    "Overdue tasks require immediate triage to prevent milestone delay"\n'
                    '  ],\n'
                    '  "recommended_actions": [\n'
                    '    {\n'
                    '      "task_id": null,\n'
                    '      "task_title": null,\n'
                    '      "action": "Triage overdue tasks and assign missing owners.",\n'
                    '      "priority": "HIGH"\n'
                    '    }\n'
                    '  ]\n'
                    '}'
                )
            elif "senior engineering manager" in sys_str:
                return "The team is executing steadily, with attention needed on overdue deliverables to protect sprint velocity."

        return self._default_response

