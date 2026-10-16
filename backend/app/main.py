from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.auth.router import router as auth_router
from app.workspaces.router import router as workspace_router

app = FastAPI(title="AI Productivity Platform")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(workspace_router, prefix="/api/v1/workspaces", tags=["workspaces"])
from app.projects.router import router as project_router
from app.tasks.router import router as task_router
from app.documents.router import router as document_router
from app.rag.router import router as rag_router
from app.ai.router import router as ai_router
app.include_router(project_router, prefix="/api/v1", tags=["projects"])
app.include_router(task_router, prefix="/api/v1", tags=["tasks"])
app.include_router(document_router, prefix="/api/v1", tags=["documents"])
app.include_router(rag_router, prefix="/api/v1", tags=["rag"])
app.include_router(ai_router, prefix="/api/v1", tags=["ai"])

@app.get("/health")
def health_check():
    return {"status": "ok"}

