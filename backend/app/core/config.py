import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    DATABASE_URL: str = ""
    JWT_SECRET: str = "secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440
    
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024 # 10MB default
    
    # RAG: Chunking & Embeddings
    CHUNK_SIZE: int = 1000
    CHUNK_OVERLAP: int = 150
    EMBEDDING_PROVIDER: str = "fastembed"  # fastembed, openai, mock
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    EMBEDDING_DIMENSION: int = 384
    # RAG: Semantic Search & Retrieval
    RAG_MAX_DISTANCE: float = 0.45  # Max cosine distance threshold to exclude irrelevant passages (empirical boundary for bge-small)
    OPENAI_API_KEY: str = ""
    OPENAI_BASE_URL: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
