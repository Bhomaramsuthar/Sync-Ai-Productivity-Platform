import logging
from typing import List, Optional
from .base import BaseEmbeddingProvider, EmbeddingError

logger = logging.getLogger(__name__)

class FastEmbedProvider(BaseEmbeddingProvider):
    """
    Local, zero-cost embedding provider powered by FastEmbed (ONNX Runtime).
    Default model: BAAI/bge-small-en-v1.5 (384 dimensions).
    Fast, runs locally on CPU without external API calls or billing.
    """

    def __init__(self, model_name: str = "BAAI/bge-small-en-v1.5", dimension: int = 384):
        self._model_name = model_name
        self._dimension = dimension
        self._model = None

    def _ensure_model(self):
        if self._model is None:
            try:
                from fastembed import TextEmbedding
                self._model = TextEmbedding(model_name=self._model_name)
            except Exception as e:
                logger.error(f"Failed to initialize FastEmbed model '{self._model_name}': {e}", exc_info=True)
                raise EmbeddingError(f"Failed to load local embedding model '{self._model_name}': {e}")

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def model_name(self) -> str:
        return self._model_name

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not texts:
            return []
        self._ensure_model()
        try:
            generator = self._model.embed(texts)
            embeddings = [list(map(float, vec)) for vec in generator]
            return embeddings
        except Exception as e:
            logger.error(f"FastEmbed embedding generation failed: {e}", exc_info=True)
            raise EmbeddingError(f"Embedding generation failed: {e}")

    def embed_query(self, query: str) -> List[float]:
        results = self.embed_texts([query])
        if not results:
            raise EmbeddingError("Failed to embed query: empty vector produced")
        return results[0]
