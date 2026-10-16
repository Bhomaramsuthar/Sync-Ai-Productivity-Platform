import logging
from typing import Optional
from app.core.config import settings
from .base import BaseLLMProvider, LLMConfigError
from .openai_provider import OpenAILLMProvider
from .mock_provider import MockLLMProvider

logger = logging.getLogger(__name__)

_override_provider: Optional[BaseLLMProvider] = None


def set_llm_provider(provider: Optional[BaseLLMProvider]) -> None:
    """Sets a global provider override (primarily for test mocking)."""
    global _override_provider
    _override_provider = provider


def get_llm_provider() -> BaseLLMProvider:
    """
    Factory function returning the configured LLM provider instance.
    Checks environment configuration and validates credentials.
    """
    if _override_provider is not None:
        return _override_provider

    provider_type = (settings.LLM_PROVIDER or "openai").lower().strip()

    if provider_type == "mock":
        return MockLLMProvider(model_name="mock-default")

    if provider_type in ["openai", "openai-compatible", "openrouter", "groq", "groq-cloud"]:
        api_key = settings.effective_llm_api_key
        if not api_key:
            raise LLMConfigError(
                "LLM API key is not configured. Please set LLM_API_KEY, GROQ_API_KEY, or OPENAI_API_KEY in your backend/.env "
                "environment file to enable conversational document question answering."
            )
        base_url = settings.effective_llm_base_url
        model_name = getattr(settings, "effective_llm_model", settings.LLM_MODEL)
        provider_name = "groq" if (provider_type in ["groq", "groq-cloud"] or "groq.com" in base_url) else "openai"
        return OpenAILLMProvider(
            api_key=api_key,
            base_url=base_url,
            model_name=model_name,
            timeout_seconds=settings.LLM_TIMEOUT_SECONDS,
            provider_name=provider_name,
        )

    raise LLMConfigError(
        f"Unsupported LLM provider '{settings.LLM_PROVIDER}'. Supported options: 'openai', 'groq', 'mock'."
    )
