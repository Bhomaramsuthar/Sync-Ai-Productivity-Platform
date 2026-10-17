import logging
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

# Configure structured production logging without exposing credentials
log_level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
logging.basicConfig(
    level=log_level,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ai_productivity_platform")

app = FastAPI(
    title="AI Productivity Platform",
    version="1.0.0",
    docs_url="/docs" if settings.ENVIRONMENT != "production" or os.getenv("ENABLE_DOCS", "true").lower() == "true" else None,
    redoc_url=None,
)

# Production CORS configuration
is_wildcard = "*" in settings.allowed_cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if is_wildcard else settings.allowed_cors_origins,
    allow_origin_regex=None if is_wildcard else r"^https://.*\.vercel\.app$",
    allow_credentials=not is_wildcard,
    allow_methods=["*"],
    allow_headers=["*"],
)

from app.auth.router import router as auth_router
from app.workspaces.router import router as workspace_router
from app.projects.router import router as project_router
from app.tasks.router import router as task_router
from app.documents.router import router as document_router
from app.rag.router import router as rag_router
from app.ai.router import router as ai_router

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(workspace_router, prefix="/api/v1/workspaces", tags=["workspaces"])
app.include_router(project_router, prefix="/api/v1", tags=["projects"])
app.include_router(task_router, prefix="/api/v1", tags=["tasks"])
app.include_router(document_router, prefix="/api/v1", tags=["documents"])
app.include_router(rag_router, prefix="/api/v1", tags=["rag"])
app.include_router(ai_router, prefix="/api/v1", tags=["ai"])

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ai-productivity-backend",
        "version": "1.0.0",
    }

