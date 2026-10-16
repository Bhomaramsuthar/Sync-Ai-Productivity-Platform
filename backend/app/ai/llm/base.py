from abc import ABC, abstractmethod
from typing import List, Optional
from dataclasses import dataclass


class LLMError(Exception):
    """Base exception for LLM operations."""
    pass


class LLMConfigError(LLMError):
    """Raised when LLM provider or credentials are not configured."""
    pass


class LLMAuthError(LLMError):
    """Raised when authentication with LLM provider fails."""
    pass


class LLMRateLimitError(LLMError):
    """Raised when rate limit is exceeded."""
    pass


class LLMTimeoutError(LLMError):
    """Raised when LLM request times out."""
    pass


@dataclass
class ChatMessage:
    role: str  # "system", "user", "assistant"
    content: str


class BaseLLMProvider(ABC):
    """Abstract base class for all LLM providers."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the provider (e.g., 'openai', 'groq', 'mock')."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Model identifier (e.g., 'gpt-4o-mini', 'mock-model')."""
        pass

    @abstractmethod
    def generate_chat(
        self,
        messages: List[ChatMessage],
        system_prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """
        Generate a text response given a conversation history and optional system prompt.
        
        Args:
            messages: List of chat messages in chronological order.
            system_prompt: Optional system prompt to instruct the model.
            temperature: Sampling temperature (e.g. 0.0 to 1.0).
            max_tokens: Maximum number of tokens to generate.

        Returns:
            The model's text response.
        """
        pass
