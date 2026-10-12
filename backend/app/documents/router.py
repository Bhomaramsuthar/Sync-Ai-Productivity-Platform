from fastapi import APIRouter, Depends, status, UploadFile, File, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.users.models import User
from . import service
from .schemas import DocumentResponse, DocumentStatusResponse, DocumentTextResponse

router = APIRouter()

@router.post("/projects/{project_id}/documents", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
def upload_document(
    project_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = service.upload_document(db, project_id, current_user.id, file)
    # Trigger asynchronous document processing pipeline
    background_tasks.add_task(service.process_document_background, doc.id)
    return doc

@router.get("/projects/{project_id}/documents", response_model=List[DocumentResponse])
def list_documents(
    project_id: str,
    search: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.list_documents(db, project_id, current_user.id, search)

@router.get("/documents/{doc_id}", response_model=DocumentResponse)
def get_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc, _ = service.get_document_for_member(db, doc_id, current_user.id)
    doc.download_url = service.get_document_download_url(db, doc_id, current_user.id)
    return doc

@router.get("/documents/{doc_id}/status", response_model=DocumentStatusResponse)
def get_document_status(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc, _ = service.get_document_for_member(db, doc_id, current_user.id)
    return doc

@router.get("/documents/{doc_id}/text", response_model=DocumentTextResponse)
def get_document_text(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc, _ = service.get_document_for_member(db, doc_id, current_user.id)
    return doc

@router.post("/documents/{doc_id}/retry", response_model=DocumentResponse)
def retry_document_processing(
    doc_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    doc = service.retry_document_processing(db, doc_id, current_user.id)
    background_tasks.add_task(service.process_document_background, doc.id)
    return doc

@router.delete("/documents/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    doc_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    service.delete_document(db, doc_id, current_user.id)
