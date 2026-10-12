import hashlib
import math
from typing import List
from .base import BaseEmbeddingProvider, EmbeddingError

class MockEmbeddingProvider(BaseEmbeddingProvider):
    """
    Deterministic mock embedding provider for tests and development.
    Produces deterministic, normalized unit vectors based on SHA-256 hash of text.
    Can be configured to raise errors to test failure and retry resilience.
    """

    def __init__(self, dimension: int = 384, model_name: str = "mock-deterministic-384"):
        self._dimension = dimension
        self._model_name = model_name
        self.should_fail = False
        self.failure_message = "Simulated embedding provider outage"

    @property
    def dimension(self) -> int:
        return self._dimension

    @property
    def model_name(self) -> str:
        return self._model_name

    def _generate_vector(self, text: str) -> List[float]:
        # Hash text to seed vector elements
        hasher = hashlib.sha256(text.encode("utf-8"))
        seed_bytes = hasher.digest()
        
        raw = []
        for i in range(self._dimension):
            byte_val = seed_bytes[i % len(seed_bytes)]
            val = ((byte_val ^ (i * 31 % 255)) - 128.0) / 128.0
            raw.append(val)
            
        # Normalize to unit length
        norm = math.sqrt(sum(x * x for x in raw)) or 1.0
        return [round(x / norm, 6) for x in raw]

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if self.should_fail:
            raise EmbeddingError(self.failure_message)
        return [self._generate_vector(t) for t in texts]

    def embed_query(self, query: str) -> List[float]:
        if self.should_fail:
            raise EmbeddingError(self.failure_message)
        return self._generate_vector(query)
