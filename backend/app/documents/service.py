import logging
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session
from app.core.database import SessionLocal
from app.projects.service import get_project_for_member
from app.core.storage import upload_file, delete_file, get_signed_url, download_file
from app.core.config import settings
from . import repository as repo
from .models import Document
from .extractor import extract_text, ExtractionError
from app.projects.repository import record_activity

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {"pdf", "txt", "md", "docx", "csv"}

def _validate_file(file: UploadFile):
    if file.size and file.size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail={"error": {"code": "PAYLOAD_TOO_LARGE", "message": "File exceeds maximum size limit"}})
        
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_FILE_TYPE", "message": f"File type {ext} is not allowed"}})

def upload_document(db: Session, project_id: str, user_id: str, file: UploadFile) -> Document:
    # check access
    project, membership = get_project_for_member(db, project_id, user_id)
    
    _validate_file(file)
    
    # read file
    file_bytes = file.file.read()
    file_size = len(file_bytes)
    
    if file_size > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail={"error": {"code": "PAYLOAD_TOO_LARGE", "message": "File exceeds maximum size limit"}})
        
    try:
        storage_key = upload_file(file_bytes, file.filename, file.content_type)
    except Exception as e:
        raise HTTPException(status_code=500, detail={"error": {"code": "UPLOAD_FAILED", "message": str(e)}})
        
    try:
        doc = repo.create_document(
            db=db,
            project_id=project_id,
            uploader_id=user_id,
            filename=file.filename,
            storage_key=storage_key,
            content_type=file.content_type,
            file_size=file_size,
            status="UPLOADED"
        )
    except Exception as e:
        # Cleanup orphaned file
        try:
            delete_file(storage_key)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail={"error": {"code": "DATABASE_ERROR", "message": "Failed to save document metadata"}})
    
    record_activity(db, project_id, user_id, "DOCUMENT_UPLOADED", "document", doc.id, {"filename": doc.filename})
    db.commit()
    return doc

def process_document(db: Session, doc_id: str) -> Document | None:
    """
    Executes the document text extraction pipeline:
    Transitions: UPLOADED -> PROCESSING -> READY
    Or: PROCESSING -> FAILED
    Prevents duplicate processing and records safe error details.
    """
    doc = repo.get_document(db, doc_id)
    if not doc:
        return None

    # Set status to PROCESSING
    repo.update_document_processing(db, doc, status="PROCESSING", processing_error=None)

    # 1. Download file bytes from storage
    try:
        file_bytes = download_file(doc.storage_key)
    except Exception as e:
        logger.warning(f"Failed to download document {doc_id} from storage: {e}")
        repo.update_document_processing(
            db, doc, status="FAILED",
            processing_error="Document file could not be retrieved from storage."
        )
        record_activity(db, doc.project_id, doc.uploader_id, "DOCUMENT_PROCESSING_FAILED", "document", doc.id, {
            "filename": doc.filename,
            "error": "Document file could not be retrieved from storage."
        })
        db.commit()
        return doc

    # 2. Extract text using dedicated extractor
    try:
        text, char_count = extract_text(file_bytes, doc.filename)
        repo.update_document_processing(
            db, doc,
            status="READY",
            extracted_text=text,
            extracted_chars=char_count,
            processing_error=None
        )
        record_activity(db, doc.project_id, doc.uploader_id, "DOCUMENT_PROCESSED", "document", doc.id, {
            "filename": doc.filename,
            "char_count": char_count
        })
        db.commit()

        # Trigger chunking and vector indexing pipeline
        try:
            from app.rag.service import index_document
            index_document(db, doc.id)
        except Exception as idx_err:
            logger.error(f"Failed to auto-index document {doc_id}: {idx_err}", exc_info=True)
    except ExtractionError as e:
        safe_msg = str(e)
        logger.info(f"Extraction failed safely for document {doc_id}: {safe_msg}")
        repo.update_document_processing(
            db, doc,
            status="FAILED",
            extracted_text=None,
            extracted_chars=0,
            processing_error=safe_msg
        )
        doc.indexing_status = "FAILED"
        doc.indexing_error = "Text extraction did not complete successfully."
        record_activity(db, doc.project_id, doc.uploader_id, "DOCUMENT_PROCESSING_FAILED", "document", doc.id, {
            "filename": doc.filename,
            "error": safe_msg
        })
        db.commit()
    except Exception as e:
        logger.error(f"Unexpected extraction error for document {doc_id}: {e}", exc_info=True)
        repo.update_document_processing(
            db, doc,
            status="FAILED",
            extracted_text=None,
            extracted_chars=0,
            processing_error="An unexpected error occurred during document text extraction."
        )
        doc.indexing_status = "FAILED"
        doc.indexing_error = "Text extraction did not complete successfully."
        record_activity(db, doc.project_id, doc.uploader_id, "DOCUMENT_PROCESSING_FAILED", "document", doc.id, {
            "filename": doc.filename,
            "error": "Unexpected extraction failure"
        })
        db.commit()

    return doc

def process_document_background(doc_id: str) -> None:
    """Entry point for FastAPI BackgroundTasks with an isolated database session."""
    db = SessionLocal()
    try:
        process_document(db, doc_id)
    except Exception as e:
        logger.error(f"Background document processing error for {doc_id}: {e}", exc_info=True)
    finally:
        db.close()

def retry_document_processing(db: Session, doc_id: str, user_id: str) -> Document:
    """Allows retrying document processing for an authorized project member."""
    doc, _ = get_document_for_member(db, doc_id, user_id)
    if doc.status == "PROCESSING":
        raise HTTPException(
            status_code=409,
            detail={"error": {"code": "ALREADY_PROCESSING", "message": "Document is already being processed."}}
        )
    # Reset status to PROCESSING to signal re-attempt
    repo.update_document_processing(db, doc, status="PROCESSING", processing_error=None)
    doc.indexing_status = "PENDING"
    doc.indexing_error = None
    db.commit()
    return doc

def list_documents(db: Session, project_id: str, user_id: str, search: str | None = None) -> list[Document]:
    get_project_for_member(db, project_id, user_id)
    return repo.list_documents(db, project_id, search)

def get_document_for_member(db: Session, doc_id: str, user_id: str) -> tuple[Document, any]:
    doc = repo.get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Document not found"}})
    project, membership = get_project_for_member(db, doc.project_id, user_id)
    return doc, membership

def get_document_download_url(db: Session, doc_id: str, user_id: str) -> str:
    doc, _ = get_document_for_member(db, doc_id, user_id)
    try:
        url = get_signed_url(doc.storage_key)
        return url
    except Exception:
        raise HTTPException(status_code=500, detail={"error": {"code": "STORAGE_ERROR", "message": "Failed to generate download URL"}})

def delete_document(db: Session, doc_id: str, user_id: str) -> None:
    doc, membership = get_document_for_member(db, doc_id, user_id)
    
    # Only owner/admin or uploader can delete
    if membership.role not in ("OWNER", "ADMIN") and doc.uploader_id != user_id:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Not permitted to delete this document"}})
        
    project_id = doc.project_id
    filename = doc.filename
    
    # delete from storage
    try:
        delete_file(doc.storage_key)
    except Exception:
        pass # allow deleting from DB even if storage cleanup fails
        
    repo.delete_document(db, doc)
    record_activity(db, project_id, user_id, "DOCUMENT_DELETED", "document", doc_id, {"filename": filename})
    db.commit()
