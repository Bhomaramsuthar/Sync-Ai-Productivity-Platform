from fastapi import APIRouter, Depends, status, BackgroundTasks
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.users.models import User
from app.documents.service import get_document_for_member
from . import service
from .schemas import (
    IndexingStatusResponse,
    DocumentChunksListResponse,
    ChunkMetadataResponse,
    SemanticSearchRequest,
    SemanticSearchResponse
)

router = APIRouter()

@router.get("/documents/{doc_id}/indexing-status", response_model=IndexingStatusResponse)
def get_indexing_status(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieves document indexing status and chunk count for authorized project members."""
    doc, _ = get_document_for_member(db, doc_id, current_user.id)
    return IndexingStatusResponse(
        document_id=doc.id,
        indexing_status=doc.indexing_status or "PENDING",
        chunk_count=doc.chunk_count or 0,
        indexing_error=doc.indexing_error,
        indexed_at=doc.indexed_at
    )

@router.post("/documents/{doc_id}/retry-indexing", response_model=IndexingStatusResponse)
@router.post("/documents/{doc_id}/index", response_model=IndexingStatusResponse)
def retry_document_indexing(
    doc_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Initiates asynchronous re-indexing for a document whose text extraction is READY.
    Available to authorized project members.
    """
    doc = service.retry_indexing_for_member(db, doc_id, current_user.id)
    background_tasks.add_task(service.index_document_background, doc.id)
    return IndexingStatusResponse(
        document_id=doc.id,
        indexing_status=doc.indexing_status,
        chunk_count=doc.chunk_count or 0,
        indexing_error=doc.indexing_error,
        indexed_at=doc.indexed_at
    )

@router.get("/documents/{doc_id}/chunks", response_model=DocumentChunksListResponse)
def get_document_chunks(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Retrieves chunk metadata and text for an authorized document.
    Does not expose raw vector embeddings over the public API.
    """
    doc, chunks = service.get_document_chunks_for_member(db, doc_id, current_user.id)
    return DocumentChunksListResponse(
        document_id=doc.id,
        indexing_status=doc.indexing_status or "PENDING",
        chunk_count=doc.chunk_count or 0,
        chunks=[
            ChunkMetadataResponse(
                id=c.id,
                document_id=c.document_id,
                project_id=c.project_id,
                chunk_index=c.chunk_index,
                content=c.content,
                char_count=c.char_count,
                created_at=c.created_at
            )
            for c in chunks
        ]
    )

@router.post("/projects/{project_id}/documents/search", response_model=SemanticSearchResponse)
def semantic_search_documents(
    project_id: str,
    payload: SemanticSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Performs authenticated vector semantic search across document chunks in a project.
    Restricted to authorized project members.
    """
    return service.search_document_chunks(
        db=db,
        project_id=project_id,
        user_id=current_user.id,
        query=payload.query,
        limit=payload.limit or 5,
        max_distance=payload.max_distance,
        similarity_threshold=payload.similarity_threshold
    )

