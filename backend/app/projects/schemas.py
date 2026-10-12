from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from .models import ProjectStatusEnum

class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    status: Optional[ProjectStatusEnum] = ProjectStatusEnum.ACTIVE

class ProjectCreate(ProjectBase):
    pass

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[ProjectStatusEnum] = None

class ProjectResponse(ProjectBase):
    id: str
    workspace_id: str
    owner_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class ProjectActivityResponse(BaseModel):
    id: str
    project_id: str
    actor_id: Optional[str] = None
    event_type: str
    target_entity_type: str
    target_entity_id: str
    event_metadata: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ProjectInsights(BaseModel):
    total_tasks: int
    completed_tasks: int
    in_progress_tasks: int
    todo_tasks: int
    overdue_tasks: int
    completion_percentage: float
    # upcoming_deadlines: list of tasks can be added if needed, or fetched from /tasks endpoint directly
