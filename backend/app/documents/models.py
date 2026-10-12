import uuid
import datetime
from sqlalchemy import Column, String, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    uploader_id = Column(String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    filename = Column(String(255), nullable=False)
    storage_key = Column(String(1000), nullable=False)
    content_type = Column(String(100), nullable=False)
    file_size = Column(Integer, nullable=False)
    status = Column(String(50), default="UPLOADED")  # UPLOADED, PROCESSING, READY, FAILED
    extracted_text = Column(Text, nullable=True)
    extracted_chars = Column(Integer, nullable=True, default=0)
    processing_error = Column(Text, nullable=True)
    processed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.datetime.now(datetime.timezone.utc))
    
    # RAG Indexing fields
    indexing_status = Column(String(50), default="PENDING")  # PENDING, PROCESSING, READY, FAILED
    indexing_error = Column(Text, nullable=True)
    indexed_at = Column(DateTime(timezone=True), nullable=True)
    chunk_count = Column(Integer, default=0)

    project = relationship("Project", back_populates="documents")
    uploader = relationship("User")
    chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan", order_by="DocumentChunk.chunk_index")
