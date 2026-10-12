from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.users.models import User
from . import service
from .schemas import ProjectCreate, ProjectUpdate, ProjectResponse

router = APIRouter()

@router.post("/workspaces/{workspace_id}/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    workspace_id: str,
    data: ProjectCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.create_project(db, workspace_id, current_user.id, data)

@router.get("/workspaces/{workspace_id}/projects", response_model=List[ProjectResponse])
def list_projects(
    workspace_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.list_projects(db, workspace_id, current_user.id)

@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.get_project(db, project_id, current_user.id)

@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    data: ProjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.update_project(db, project_id, current_user.id, data)

@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    service.delete_project(db, project_id, current_user.id)

from typing import Optional
from .schemas import ProjectActivityResponse, ProjectInsights

@router.get("/projects/{project_id}/activity", response_model=List[ProjectActivityResponse])
def get_project_activities(
    project_id: str,
    limit: Optional[int] = 50,
    offset: Optional[int] = 0,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.get_project_activities(db, project_id, current_user.id, limit, offset)

@router.get("/projects/{project_id}/insights", response_model=ProjectInsights)
def get_project_insights(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.get_project_insights(db, project_id, current_user.id)
