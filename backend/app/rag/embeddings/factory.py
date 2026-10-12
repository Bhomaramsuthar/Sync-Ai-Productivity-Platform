from typing import Optional
from app.core.config import settings
from .base import BaseEmbeddingProvider, EmbeddingError
from .fastembed_provider import FastEmbedProvider
from .openai_provider import OpenAIEmbeddingProvider
from .mock_provider import MockEmbeddingProvider

_current_provider: Optional[BaseEmbeddingProvider] = None

def get_embedding_provider(provider_override: Optional[str] = None) -> BaseEmbeddingProvider:
    """
    Factory function returning the configured BaseEmbeddingProvider singleton.
    Can be overridden in tests using set_embedding_provider().
    """
    global _current_provider
    if _current_provider is not None and provider_override is None:
        return _current_provider

    provider_name = (provider_override or settings.EMBEDDING_PROVIDER).lower()

    if provider_name == "fastembed":
        provider = FastEmbedProvider(
            model_name=settings.EMBEDDING_MODEL,
            dimension=settings.EMBEDDING_DIMENSION
        )
    elif provider_name == "openai":
        provider = OpenAIEmbeddingProvider(
            api_key=settings.OPENAI_API_KEY,
            base_url=settings.OPENAI_BASE_URL or None,
            model_name=settings.EMBEDDING_MODEL,
            dimension=settings.EMBEDDING_DIMENSION
        )
    elif provider_name in ("mock", "test"):
        provider = MockEmbeddingProvider(
            dimension=settings.EMBEDDING_DIMENSION,
            model_name="mock-deterministic"
        )
    else:
        raise EmbeddingError(f"Unsupported embedding provider: '{provider_name}'. Supported: 'fastembed', 'openai', 'mock'")

    if provider_override is None:
        _current_provider = provider
    return provider

def set_embedding_provider(provider: Optional[BaseEmbeddingProvider]) -> None:
    """Explicitly inject an embedding provider (used for testing and dependency injection)."""
    global _current_provider
    _current_provider = provider
