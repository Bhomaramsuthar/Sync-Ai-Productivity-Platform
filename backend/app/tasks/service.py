from fastapi import HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.projects.service import get_project_for_member
from app.workspaces.repository import get_membership
from app.workspaces.models import WorkspaceRoleEnum
from . import repository as repo
from .schemas import TaskCreate, TaskUpdate
from .models import Task, TaskStatusEnum, TaskPriorityEnum

def _verify_assignee(db: Session, workspace_id: str, assignee_id: str | None):
    if not assignee_id:
        return
    membership = get_membership(db, workspace_id, assignee_id)
    if not membership:
        raise HTTPException(status_code=400, detail={"error": {"code": "INVALID_ASSIGNEE", "message": "Assignee must be a member of the workspace"}})

from app.projects.repository import record_activity

def create_task(db: Session, project_id: str, user_id: str, data: TaskCreate) -> Task:
    project, membership = get_project_for_member(db, project_id, user_id)
    
    _verify_assignee(db, project.workspace_id, data.assignee_id)
    
    task = repo.create_task(
        db=db,
        project_id=project_id,
        created_by=user_id,
        title=data.title,
        description=data.description,
        status=data.status,
        priority=data.priority,
        assignee_id=data.assignee_id,
        due_date=data.due_date
    )
    record_activity(db, project_id, user_id, "TASK_CREATED", "task", task.id, {"title": task.title})
    db.commit()
    return task

def list_tasks(db: Session, project_id: str, user_id: str, status: Optional[TaskStatusEnum] = None, priority: Optional[TaskPriorityEnum] = None, assignee_id: Optional[str] = None, search: Optional[str] = None, sort: Optional[str] = None) -> list[Task]:
    get_project_for_member(db, project_id, user_id)
    return repo.get_tasks_by_project(db, project_id, status, priority, assignee_id, search, sort)

def get_task_for_member(db: Session, task_id: str, user_id: str) -> tuple[Task, any]:
    task = repo.get_task(db, task_id)
    if not task:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Task not found"}})
    
    project, membership = get_project_for_member(db, task.project_id, user_id)
    return task, membership

def get_task(db: Session, task_id: str, user_id: str) -> Task:
    task, _ = get_task_for_member(db, task_id, user_id)
    return task

def update_task(db: Session, task_id: str, user_id: str, data: TaskUpdate) -> Task:
    task, membership = get_task_for_member(db, task_id, user_id)
    
    update_data = data.model_dump(exclude_unset=True)
    
    # if updating assignee, verify
    if "assignee_id" in update_data and update_data["assignee_id"] is not None:
        _verify_assignee(db, task.project.workspace_id, update_data["assignee_id"])
        
    old_status = task.status
    old_assignee = task.assignee_id
    
    task = repo.update_task(db=db, task=task, update_data=update_data)
    
    if "status" in update_data and update_data["status"] != old_status:
        if update_data["status"] == TaskStatusEnum.DONE:
            record_activity(db, task.project_id, user_id, "TASK_COMPLETED", "task", task.id, {"title": task.title})
        else:
            record_activity(db, task.project_id, user_id, "TASK_STATUS_CHANGED", "task", task.id, {"title": task.title, "old_status": old_status, "new_status": update_data["status"]})
            
    if "assignee_id" in update_data and update_data["assignee_id"] != old_assignee:
        record_activity(db, task.project_id, user_id, "TASK_ASSIGNED", "task", task.id, {"title": task.title, "assignee_id": update_data["assignee_id"]})
        
    db.commit()
    return task

def delete_task(db: Session, task_id: str, user_id: str) -> None:
    task, membership = get_task_for_member(db, task_id, user_id)
    # optionally, restrict deletion to project owners/admins or the creator
    # assuming for now members can delete, or we restrict to OWNER/ADMIN
    # The prompt says: "member can delete task if permitted" - let's say OWNER/ADMIN or creator
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN) and task.created_by != user_id:
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "You don't have permission to delete this task"}})
        
    project_id = task.project_id
    title = task.title
    repo.delete_task(db, task)
    record_activity(db, project_id, user_id, "TASK_DELETED", "task", task_id, {"title": title})
    db.commit()
