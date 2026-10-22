import logging
import os
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
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


class SafeServerErrorMiddleware(BaseHTTPMiddleware):
    """Intercept unhandled exceptions to log safely server-side without leaking

    credentials or secrets, and return structured JSON responses that pass
    through CORSMiddleware to preserve CORS headers on error responses.
    """

    async def dispatch(self, request: Request, call_next):
        try:
            return await call_next(request)
        except Exception as exc:
            logger.error(
                "Unhandled server error processing %s %s: %s",
                request.method,
                request.url.path,
                str(exc),
                exc_info=True,
            )
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "detail": {
                        "error": {
                            "code": "INTERNAL_SERVER_ERROR",
                            "message": "An internal server error occurred. Please try again later.",
                        }
                    }
                },
            )


# Register SafeServerErrorMiddleware first so CORSMiddleware wraps outermost
app.add_middleware(SafeServerErrorMiddleware)

# Production CORS configuration (registered outermost to ensure headers on all responses)
is_wildcard = "*" in settings.allowed_cors_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if is_wildcard else settings.allowed_cors_origins,
    allow_origin_regex=None if is_wildcard else r"^https://.*\.vercel\.app$",
    allow_credentials=not is_wildcard,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(
        "Unhandled error processing %s %s: %s",
        request.method,
        request.url.path,
        str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": {
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": "An internal server error occurred. Please try again later.",
                }
            }
        },
    )

from app.auth.router import router as auth_router
from app.workspaces.router import router as workspace_router
from app.projects.router import router as project_router
from app.tasks.router import router as task_router
from app.documents.router import router as document_router
from app.rag.router import router as rag_router
from app.ai.router import router as ai_router
from app.calendar.router import router as calendar_router
from app.meetings.router import router as meeting_router

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(workspace_router, prefix="/api/v1/workspaces", tags=["workspaces"])
app.include_router(project_router, prefix="/api/v1", tags=["projects"])
app.include_router(task_router, prefix="/api/v1", tags=["tasks"])
app.include_router(document_router, prefix="/api/v1", tags=["documents"])
app.include_router(rag_router, prefix="/api/v1", tags=["rag"])
app.include_router(ai_router, prefix="/api/v1", tags=["ai"])
app.include_router(calendar_router, prefix="/api/v1", tags=["calendar"])
app.include_router(meeting_router, prefix="/api/v1", tags=["meetings"])

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ai-productivity-backend",
        "version": "1.0.0",
    }

