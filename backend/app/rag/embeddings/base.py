from abc import ABC, abstractmethod
from typing import List

class EmbeddingError(Exception):
    """Safe exception raised when embedding generation fails."""
    pass

class BaseEmbeddingProvider(ABC):
    @property
    @abstractmethod
    def dimension(self) -> int:
        """Vector dimension produced by this model."""
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Model identifier."""
        pass

    @abstractmethod
    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        """Generate embedding vectors for a batch of texts."""
        pass

    @abstractmethod
    def embed_query(self, query: str) -> List[float]:
        """Generate embedding vector for a single query."""
        pass

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Convenience alias for embed_texts."""
        return self.embed_texts(texts)

    def get_dimension(self) -> int:
        """Convenience alias for dimension property."""
        return self.dimension
