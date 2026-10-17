import os
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def normalize_database_url(url: str | None) -> str:
    """Normalize database connection URLs to use the psycopg 3 driver for PostgreSQL.

    Converts:
      - postgres:// -> postgresql+psycopg://
      - postgresql:// -> postgresql+psycopg://
      - postgresql+psycopg2:// -> postgresql+psycopg://
    Preserves sqlite, mock, or other drivers and all credentials/query parameters intact.
    """
    if not url:
        return ""
    trimmed = url.strip()
    if trimmed.startswith("postgresql+psycopg2://"):
        return "postgresql+psycopg://" + trimmed[len("postgresql+psycopg2://"):]
    if trimmed.startswith("postgres://"):
        return "postgresql+psycopg://" + trimmed[len("postgres://"):]
    if trimmed.startswith("postgresql://"):
        return "postgresql+psycopg://" + trimmed[len("postgresql://"):]
    return trimmed


class Settings(BaseSettings):
    DATABASE_URL: str = ""

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def validate_database_url(cls, v: str | None) -> str:
        return normalize_database_url(v)

    JWT_SECRET: str = "secret"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 1440
    
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    MAX_UPLOAD_SIZE: int = 10 * 1024 * 1024 # 10MB default
    
    # Production, Security & CORS
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: str = ""

    @property
    def allowed_cors_origins(self) -> list[str]:
        default_origins = [
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
        if self.CORS_ORIGINS:
            custom = [origin.strip() for origin in self.CORS_ORIGINS.split(",") if origin.strip()]
            for c in custom:
                if c not in default_origins:
                    default_origins.append(c)
        return default_origins

    
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

    # Conversational RAG & LLM Generation
    LLM_PROVIDER: str = "openai"  # openai, groq, mock
    LLM_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    LLM_BASE_URL: str = ""
    LLM_MODEL: str = "gpt-4o-mini"
    LLM_TEMPERATURE: float = 0.1
    LLM_MAX_TOKENS: int = 1000
    LLM_TIMEOUT_SECONDS: float = 30.0

    @property
    def effective_llm_api_key(self) -> str:
        if self.LLM_PROVIDER.lower() in ("groq", "groq-cloud"):
            return self.LLM_API_KEY or self.GROQ_API_KEY or self.OPENAI_API_KEY
        return self.LLM_API_KEY or self.OPENAI_API_KEY

    @property
    def effective_llm_base_url(self) -> str:
        if self.LLM_BASE_URL:
            return self.LLM_BASE_URL.rstrip("/")
        if self.LLM_PROVIDER.lower() in ("groq", "groq-cloud"):
            return "https://api.groq.com/openai/v1"
        return (self.OPENAI_BASE_URL or "https://api.openai.com/v1").rstrip("/")

    @property
    def effective_llm_model(self) -> str:
        is_groq = self.LLM_PROVIDER.lower() in ("groq", "groq-cloud") or "groq.com" in self.effective_llm_base_url
        if is_groq:
            if not self.LLM_MODEL or self.LLM_MODEL in ("gpt-4o-mini", "llama-3.3-70b-versatile"):
                return "openai/gpt-oss-120b"
        return self.LLM_MODEL or "gpt-4o-mini"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()
