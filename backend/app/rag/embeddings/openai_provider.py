import logging
import httpx
from typing import List, Optional
from .base import BaseEmbeddingProvider, EmbeddingError

logger = logging.getLogger(__name__)

class OpenAIEmbeddingProvider(BaseEmbeddingProvider):
    """
    OpenAI-compatible embedding provider.
    Supports OpenAI API as well as any OpenAI-compatible provider (Ollama, vLLM, OpenRouter).
    """

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        model_name: str = "text-embedding-3-small",
        dimension: int = 1536,
        timeout_seconds: float = 30.0
    ):
        if not api_key:
            raise EmbeddingError("OpenAI API key is missing. Set OPENAI_API_KEY environment variable.")
        self._api_key = api_key
        self._base_url = (base_url or "https://api.openai.com/v1").rstrip("/")
        self._model_name = model_name
        self._dimension = dimension
        self._timeout = timeout_seconds

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def model_name(self) -> str:
        return self._model_name

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []

        url = f"{self._base_url}/embeddings"
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": self._model_name,
            "input": texts
        }
        # text-embedding-3 supports dimensions parameter
        if "text-embedding-3" in self._model_name and self._dimension:
            payload["dimensions"] = self._dimension

        try:
            with httpx.Client(timeout=self._timeout) as client:
                response = client.post(url, json=payload, headers=headers)
                
            if response.status_code == 401:
                raise EmbeddingError("Authentication failed: invalid OpenAI API key.")
            elif response.status_code == 429:
                raise EmbeddingError("Rate limit exceeded from embedding provider. Please retry later.")
            elif response.status_code != 200:
                raise EmbeddingError(f"Embedding API returned error status HTTP {response.status_code}.")

            data = response.json()
            items = data.get("data", [])
            # Sort by index to guarantee ordering matches input
            items.sort(key=lambda x: x.get("index", 0))
            return [item["embedding"] for item in items]
        except httpx.TimeoutException:
            raise EmbeddingError("Embedding API request timed out. Please retry.")
        except httpx.RequestError as e:
            logger.error(f"OpenAI embedding network error: {e}")
            raise EmbeddingError("Network error while connecting to embedding service.")
        except EmbeddingError:
            raise
        except Exception as e:
            logger.error(f"Unexpected error in OpenAI embedding provider: {e}", exc_info=True)
            raise EmbeddingError("Unexpected error occurred while generating embeddings.")

    def embed_query(self, query: str) -> List[float]:
        results = self.embed_texts([query])
        if not results:
            raise EmbeddingError("Failed to embed query: empty response")
        return results[0]
