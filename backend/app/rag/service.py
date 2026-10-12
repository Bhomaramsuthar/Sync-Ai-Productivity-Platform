import logging
import uuid
import datetime
from typing import List, Tuple, Optional
from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.core.config import settings
from app.projects.repository import record_activity
from app.documents.models import Document
from .models import DocumentChunk
from .chunking import chunk_text
from .embeddings.factory import get_embedding_provider
from .embeddings.base import EmbeddingError

logger = logging.getLogger(__name__)

def index_document(db: Session, doc_id: str) -> Document | None:
    """
    Executes the document chunking and vector embedding generation pipeline.
    
    Pipeline stages:
    1. Verify document exists and text extraction is READY.
    2. Transition indexing_status -> PROCESSING.
    3. Generate text chunks (paragraph & line-aware).
    4. Generate vector embeddings (FastEmbed / OpenAI / Mock).
    5. Atomically replace previous chunks and update status -> READY.
    
    If embedding or storage fails, sets indexing_status -> FAILED with a safe error message.
    Idempotent: Re-indexing cleanly clears previous chunks.
    """
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        logger.warning(f"Cannot index non-existent document {doc_id}")
        return None

    if doc.status != "READY" or not doc.extracted_text:
        logger.info(f"Skipping indexing for document {doc_id}: extraction status is {doc.status}")
        doc.indexing_status = "FAILED"
        doc.indexing_error = "Cannot index document before text extraction is complete."
        db.commit()
        return doc

    # Mark as PROCESSING
    doc.indexing_status = "PROCESSING"
    doc.indexing_error = None
    db.commit()

    # Chunk the extracted text
    text = doc.extracted_text
    chunks = chunk_text(text, chunk_size=settings.CHUNK_SIZE, chunk_overlap=settings.CHUNK_OVERLAP)

    if not chunks:
        # Edge case: text was empty or whitespace only
        doc.indexing_status = "READY"
        doc.indexing_error = None
        doc.chunk_count = 0
        doc.indexed_at = datetime.datetime.now(datetime.timezone.utc)
        db.commit()
        return doc

    chunk_texts = [c.content for c in chunks]

    # Generate embeddings
    try:
        provider = get_embedding_provider()
        vectors = provider.generate_embeddings(chunk_texts)
    except EmbeddingError as e:
        safe_msg = f"Embedding generation failed: {str(e)}"
        logger.warning(f"Embedding generation error for document {doc_id}: {safe_msg}")
        doc.indexing_status = "FAILED"
        doc.indexing_error = safe_msg
        record_activity(db, doc.project_id, doc.uploader_id, "DOCUMENT_INDEXING_FAILED", "document", doc.id, {
            "filename": doc.filename,
            "error": safe_msg
        })
        db.commit()
        return doc
    except Exception as e:
        logger.error(f"Unexpected embedding failure for document {doc_id}: {e}", exc_info=True)
        doc.indexing_status = "FAILED"
        doc.indexing_error = "An unexpected error occurred during vector embedding generation."
        record_activity(db, doc.project_id, doc.uploader_id, "DOCUMENT_INDEXING_FAILED", "document", doc.id, {
            "filename": doc.filename,
            "error": "Unexpected embedding provider failure"
        })
        db.commit()
        return doc

    if len(vectors) != len(chunks):
        err_msg = f"Vector count mismatch: generated {len(vectors)} vectors for {len(chunks)} chunks."
        logger.error(err_msg)
        doc.indexing_status = "FAILED"
        doc.indexing_error = "Embedding provider returned incorrect number of vectors."
        db.commit()
        return doc

    # Atomically replace chunks in the database
    try:
        # 1. Delete prior chunks for idempotency
        db.query(DocumentChunk).filter(DocumentChunk.document_id == doc.id).delete(synchronize_session=False)

        # 2. Insert new chunks with vector embeddings
        for chunk_data, vec in zip(chunks, vectors):
            chunk_row = DocumentChunk(
                id=str(uuid.uuid4()),
                document_id=doc.id,
                project_id=doc.project_id,
                chunk_index=chunk_data.chunk_index,
                content=chunk_data.content,
                embedding=vec,
                char_count=chunk_data.char_count,
                metadata_json=None,
                created_at=datetime.datetime.now(datetime.timezone.utc)
            )
            db.add(chunk_row)

        # 3. Update document indexing status to READY
        doc.indexing_status = "READY"
        doc.indexing_error = None
        doc.chunk_count = len(chunks)
        doc.indexed_at = datetime.datetime.now(datetime.timezone.utc)

        record_activity(db, doc.project_id, doc.uploader_id, "DOCUMENT_INDEXED", "document", doc.id, {
            "filename": doc.filename,
            "chunk_count": len(chunks)
        })
        db.commit()
        db.refresh(doc)
    except Exception as e:
        db.rollback()
        logger.error(f"Failed to persist document chunks for {doc_id}: {e}", exc_info=True)
        doc.indexing_status = "FAILED"
        doc.indexing_error = "Database error while storing document vector chunks."
        db.commit()
        return doc

    return doc

def index_document_background(doc_id: str) -> None:
    """FastAPI BackgroundTasks entry point with an isolated database session."""
    db = SessionLocal()
    try:
        index_document(db, doc_id)
    except Exception as e:
        logger.error(f"Background indexing error for {doc_id}: {e}", exc_info=True)
    finally:
        db.close()

def retry_indexing_for_member(db: Session, doc_id: str, user_id: str) -> Document:
    """
    Validates permissions and initiates re-indexing for an authorized project member.
    """
    from app.documents.service import get_document_for_member
    doc, _ = get_document_for_member(db, doc_id, user_id)

    if doc.status != "READY":
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "EXTRACTION_NOT_READY", "message": "Cannot index document before text extraction has completed successfully."}}
        )

    if doc.indexing_status == "PROCESSING":
        raise HTTPException(
            status_code=409,
            detail={"error": {"code": "ALREADY_INDEXING", "message": "Document is already being indexed."}}
        )

    doc.indexing_status = "PROCESSING"
    doc.indexing_error = None
    db.commit()
    return doc

def get_document_chunks_for_member(db: Session, doc_id: str, user_id: str) -> Tuple[Document, List[DocumentChunk]]:
    """
    Retrieves document and its chunk metadata for authorized project members.
    """
    from app.documents.service import get_document_for_member
    doc, _ = get_document_for_member(db, doc_id, user_id)

    chunks = (
        db.query(DocumentChunk)
        .filter(DocumentChunk.document_id == doc_id)
        .order_by(DocumentChunk.chunk_index.asc())
        .all()
    )
    return doc, chunks

def search_document_chunks(
    db: Session,
    project_id: str,
    user_id: str,
    query: str,
    limit: int = 5,
    max_distance: Optional[float] = None,
    similarity_threshold: Optional[float] = None
):
    """
    Performs authenticated vector semantic search across document chunks in a project.
    
    1. Validates user membership in the project's workspace.
    2. Validates query non-empty and bounded length (1-1000 chars).
    3. Generates the query embedding using the configured provider.
    4. Executes vector similarity search in PostgreSQL via pgvector (<=> cosine distance).
    5. Filters candidate passages by configurable maximum cosine distance threshold
       to prevent returning irrelevant passages as false positives.
    6. Restricts results strictly to READY indexed documents within project_id.
    7. Returns passages ordered by similarity.
    """
    from app.projects.service import get_project_for_member
    from .schemas import SemanticSearchResponse, SemanticSearchResultItem
    
    # 1. Project Authorization check (enforces project & workspace boundary)
    get_project_for_member(db, project_id, user_id)

    # 2. Query validation
    normalized_query = (query or "").strip()
    if not normalized_query:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "EMPTY_QUERY", "message": "Search query cannot be empty or whitespace-only."}}
        )

    if len(normalized_query) > 1000:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "QUERY_TOO_LONG", "message": "Search query exceeds maximum length of 1000 characters."}}
        )

    # Clamp limit (1 - 10)
    effective_limit = min(max(int(limit or 5), 1), 10)

    # Determine effective maximum cosine distance threshold
    if similarity_threshold is not None:
        effective_max_distance = max(0.0, min(2.0, 1.0 - float(similarity_threshold)))
    elif max_distance is not None:
        effective_max_distance = max(0.0, min(2.0, float(max_distance)))
    else:
        effective_max_distance = float(settings.RAG_MAX_DISTANCE)

    # 3. Generate query embedding
    provider = get_embedding_provider()
    try:
        query_vector = provider.embed_query(normalized_query)
    except EmbeddingError as e:
        logger.error(f"Failed to embed query for project {project_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "EMBEDDING_FAILURE", "message": "Failed to generate embedding for the search query."}}
        )
    except Exception as e:
        logger.error(f"Unexpected error embedding search query: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "EMBEDDING_FAILURE", "message": "An unexpected error occurred while processing the search query."}}
        )

    if not query_vector or len(query_vector) != settings.EMBEDDING_DIMENSION:
        logger.error(f"Dimension mismatch: got {len(query_vector) if query_vector else 0}, expected {settings.EMBEDDING_DIMENSION}")
        raise HTTPException(
            status_code=500,
            detail={"error": {"code": "DIMENSION_MISMATCH", "message": "Search vector dimension mismatch."}}
        )

    # 4. PostgreSQL Vector Retrieval with Distance Threshold Filtering
    is_sqlite = db.bind is not None and db.bind.dialect.name == "sqlite"

    if is_sqlite:
        # Fallback for offline SQLite unit testing
        import math
        chunks_with_doc = (
            db.query(DocumentChunk, Document.filename.label("document_filename"))
            .join(Document, DocumentChunk.document_id == Document.id)
            .filter(DocumentChunk.project_id == project_id)
            .filter(Document.project_id == project_id)
            .filter(Document.status == "READY")
            .filter(Document.indexing_status == "READY")
            .all()
        )
        scored = []
        for chunk, doc_filename in chunks_with_doc:
            if not chunk.embedding:
                continue
            dot = sum(a * b for a, b in zip(chunk.embedding, query_vector))
            norm_a = math.sqrt(sum(a * a for a in chunk.embedding)) or 1.0
            norm_b = math.sqrt(sum(b * b for b in query_vector)) or 1.0
            sim = dot / (norm_a * norm_b)
            dist = max(0.0, 1.0 - sim)
            # Filter by relevance threshold
            if dist <= effective_max_distance:
                scored.append((chunk, doc_filename, dist))
        scored.sort(key=lambda x: x[2])
        rows = scored[:effective_limit]
    else:
        # Native PostgreSQL pgvector cosine distance retrieval with threshold filtering
        try:
            distance_expr = DocumentChunk.embedding.cosine_distance(query_vector)
            rows = (
                db.query(
                    DocumentChunk,
                    Document.filename.label("document_filename"),
                    distance_expr.label("distance")
                )
                .join(Document, DocumentChunk.document_id == Document.id)
                .filter(DocumentChunk.project_id == project_id)
                .filter(Document.project_id == project_id)
                .filter(Document.status == "READY")
                .filter(Document.indexing_status == "READY")
                .filter(DocumentChunk.embedding.isnot(None))
                .filter(distance_expr <= effective_max_distance)
                .order_by(distance_expr.asc())
                .limit(effective_limit)
                .all()
            )
        except Exception as e:
            logger.error(f"Database vector retrieval failed: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail={"error": {"code": "DATABASE_ERROR", "message": "Failed to query vector database."}}
            )

    results = []
    for chunk, doc_filename, dist in rows:
        d_val = float(dist)
        sim_score = max(0.0, min(1.0, 1.0 - d_val))
        
        # Categorize qualitative relevance tier based on vector proximity
        if d_val <= 0.25:
            tier = "strong"
        elif d_val <= 0.40:
            tier = "moderate"
        else:
            tier = "marginal"

        results.append(
            SemanticSearchResultItem(
                chunk_id=chunk.id,
                document_id=chunk.document_id,
                document_filename=doc_filename,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                similarity_score=round(sim_score, 4),
                distance=round(d_val, 4),
                relevance_tier=tier,
                char_count=chunk.char_count,
                created_at=chunk.created_at
            )
        )

    return SemanticSearchResponse(
        project_id=project_id,
        query=normalized_query,
        threshold=round(effective_max_distance, 4),
        results_count=len(results),
        results=results
    )

