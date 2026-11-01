from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.users.models import User
from . import service
from .schemas import TaskCreate, TaskUpdate, TaskResponse
from .models import TaskStatusEnum, TaskPriorityEnum

from app.core.realtime import workspace_realtime_manager

router = APIRouter()

@router.post("/projects/{project_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: str,
    data: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    task = service.create_task(db, project_id, current_user.id, data)
    workspace_realtime_manager.broadcast_sync(
        task.project.workspace_id,
        "task:created",
        TaskResponse.model_validate(task).model_dump(),
    )
    return task

@router.get("/projects/{project_id}/tasks", response_model=List[TaskResponse])
def list_tasks(
    project_id: str,
    status: Optional[TaskStatusEnum] = None,
    priority: Optional[TaskPriorityEnum] = None,
    assignee_id: Optional[str] = None,
    search: Optional[str] = None,
    sort: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.list_tasks(db, project_id, current_user.id, status, priority, assignee_id, search, sort)

@router.get("/tasks/{task_id}", response_model=TaskResponse)
def get_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return service.get_task(db, task_id, current_user.id)

@router.patch("/tasks/{task_id}", response_model=TaskResponse)
def update_task(
    task_id: str,
    data: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    task = service.update_task(db, task_id, current_user.id, data)
    workspace_realtime_manager.broadcast_sync(
        task.project.workspace_id,
        "task:updated",
        TaskResponse.model_validate(task).model_dump(),
    )
    return task

@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    task, _ = service.get_task_for_member(db, task_id, current_user.id)
    workspace_id = task.project.workspace_id
    project_id = task.project_id
    service.delete_task(db, task_id, current_user.id)
    workspace_realtime_manager.broadcast_sync(
        workspace_id,
        "task:deleted",
        {"id": task_id, "project_id": project_id, "workspace_id": workspace_id},
    )
