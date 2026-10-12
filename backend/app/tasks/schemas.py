from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from .models import TaskStatusEnum, TaskPriorityEnum

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[TaskStatusEnum] = TaskStatusEnum.TODO
    priority: Optional[TaskPriorityEnum] = TaskPriorityEnum.MEDIUM
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[TaskStatusEnum] = None
    priority: Optional[TaskPriorityEnum] = None
    assignee_id: Optional[str] = None
    due_date: Optional[datetime] = None

class TaskResponse(TaskBase):
    id: str
    project_id: str
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
