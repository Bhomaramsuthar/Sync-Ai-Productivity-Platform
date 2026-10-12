from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, List
from datetime import datetime

class ChunkMetadataResponse(BaseModel):
    id: str
    document_id: str
    project_id: str
    chunk_index: int
    content: str
    char_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class IndexingStatusResponse(BaseModel):
    document_id: str
    indexing_status: str
    chunk_count: int
    indexing_error: Optional[str] = None
    indexed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)

class DocumentChunksListResponse(BaseModel):
    document_id: str
    indexing_status: str
    chunk_count: int
    chunks: List[ChunkMetadataResponse]

class SemanticSearchRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=1000, description="Natural language search query")
    limit: Optional[int] = Field(5, ge=1, le=10, description="Maximum number of relevant passages to retrieve (1-10)")
    max_distance: Optional[float] = Field(
        None,
        ge=0.0,
        le=2.0,
        description="Optional maximum cosine distance threshold. Chunks with distance > max_distance are excluded. Defaults to system setting (0.45)."
    )
    similarity_threshold: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="Optional minimum similarity score threshold (0.0 - 1.0). Overrides max_distance (effective max_distance = 1.0 - similarity_threshold)."
    )

class SemanticSearchResultItem(BaseModel):
    chunk_id: str
    document_id: str
    document_filename: str
    chunk_index: int
    content: str
    similarity_score: float = Field(
        ...,
        description="Normalized approximate similarity score (1.0 - distance). Measures geometric vector alignment, not factual probability."
    )
    distance: float = Field(
        ...,
        description="Raw pgvector cosine distance [0.0, 2.0]. Lower values indicate closer semantic proximity."
    )
    relevance_tier: str = Field(
        ...,
        description="Qualitative relevance tier ('strong', 'moderate', or 'marginal') based on vector distance."
    )
    char_count: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class SemanticSearchResponse(BaseModel):
    project_id: str
    query: str
    threshold: float = Field(
        ...,
        description="Cosine distance threshold applied to exclude non-relevant passages."
    )
    results_count: int
    results: List[SemanticSearchResultItem]

    model_config = ConfigDict(from_attributes=True)
