from datetime import datetime, timezone
from sqlalchemy.orm import Session
from .models import Document

def create_document(
    db: Session,
    project_id: str,
    uploader_id: str,
    filename: str,
    storage_key: str,
    content_type: str,
    file_size: int,
    status: str = "UPLOADED"
) -> Document:
    doc = Document(
        project_id=project_id,
        uploader_id=uploader_id,
        filename=filename,
        storage_key=storage_key,
        content_type=content_type,
        file_size=file_size,
        status=status,
        extracted_text=None,
        extracted_chars=0,
        processing_error=None,
        processed_at=None
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc

def list_documents(db: Session, project_id: str, search: str | None = None) -> list[Document]:
    query = db.query(Document).filter(Document.project_id == project_id)
    if search:
        query = query.filter(Document.filename.ilike(f"%{search}%"))
    return query.order_by(Document.created_at.desc()).all()

def get_document(db: Session, doc_id: str) -> Document | None:
    return db.query(Document).filter(Document.id == doc_id).first()

def update_document_processing(
    db: Session,
    doc: Document,
    status: str,
    extracted_text: str | None = None,
    extracted_chars: int = 0,
    processing_error: str | None = None
) -> Document:
    doc.status = status
    doc.extracted_text = extracted_text
    doc.extracted_chars = extracted_chars
    doc.processing_error = processing_error
    doc.processed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(doc)
    return doc

def delete_document(db: Session, doc: Document) -> None:
    db.delete(doc)
    db.commit()
