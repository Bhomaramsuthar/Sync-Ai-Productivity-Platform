from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class DocumentResponse(BaseModel):
    id: str
    project_id: str
    uploader_id: Optional[str] = None
    filename: str
    content_type: str
    file_size: int
    status: str
    extracted_chars: Optional[int] = 0
    processing_error: Optional[str] = None
    processed_at: Optional[datetime] = None
    indexing_status: Optional[str] = "PENDING"
    indexing_error: Optional[str] = None
    indexed_at: Optional[datetime] = None
    chunk_count: Optional[int] = 0
    created_at: datetime
    download_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class DocumentStatusResponse(BaseModel):
    id: str
    status: str
    extracted_chars: Optional[int] = 0
    processing_error: Optional[str] = None
    processed_at: Optional[datetime] = None
    indexing_status: Optional[str] = "PENDING"
    indexing_error: Optional[str] = None
    indexed_at: Optional[datetime] = None
    chunk_count: Optional[int] = 0

    model_config = ConfigDict(from_attributes=True)

class DocumentTextResponse(BaseModel):
    id: str
    filename: str
    status: str
    extracted_text: Optional[str] = None
    extracted_chars: Optional[int] = 0
    processed_at: Optional[datetime] = None
    processing_error: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
