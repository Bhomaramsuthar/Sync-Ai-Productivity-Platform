from fastapi import HTTPException
from sqlalchemy.orm import Session
from app.workspaces.service import get_workspace_for_member
from app.workspaces.models import WorkspaceRoleEnum
from . import repository as repo
from .schemas import ProjectCreate, ProjectUpdate
from .models import Project

def create_project(db: Session, workspace_id: str, user_id: str, data: ProjectCreate) -> Project:
    workspace, membership = get_workspace_for_member(db, workspace_id, user_id)
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can create projects"}})
    
    project = repo.create_project(
        db=db,
        workspace_id=workspace_id,
        owner_id=user_id,
        name=data.name,
        description=data.description,
        status=data.status
    )
    repo.record_activity(
        db=db,
        project_id=project.id,
        actor_id=user_id,
        event_type="PROJECT_CREATED",
        target_entity_type="project",
        target_entity_id=project.id,
        event_metadata={"name": data.name}
    )
    db.commit()
    return project

def list_projects(db: Session, workspace_id: str, user_id: str) -> list[Project]:
    get_workspace_for_member(db, workspace_id, user_id)
    return repo.get_projects_by_workspace(db, workspace_id)

def get_project_for_member(db: Session, project_id: str, user_id: str) -> tuple[Project, any]:
    project = repo.get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Project not found"}})
    
    workspace, membership = get_workspace_for_member(db, project.workspace_id, user_id)
    return project, membership

def get_project(db: Session, project_id: str, user_id: str) -> Project:
    project, _ = get_project_for_member(db, project_id, user_id)
    return project

def update_project(db: Session, project_id: str, user_id: str, data: ProjectUpdate) -> Project:
    project, membership = get_project_for_member(db, project_id, user_id)
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can update projects"}})
    
    return repo.update_project(
        db=db,
        project=project,
        name=data.name,
        description=data.description,
        status=data.status
    )

def delete_project(db: Session, project_id: str, user_id: str) -> None:
    project, membership = get_project_for_member(db, project_id, user_id)
    if membership.role not in (WorkspaceRoleEnum.OWNER, WorkspaceRoleEnum.ADMIN):
        raise HTTPException(status_code=403, detail={"error": {"code": "FORBIDDEN", "message": "Only OWNER or ADMIN can delete projects"}})
    
    repo.delete_project(db, project)

def get_project_activities(db: Session, project_id: str, user_id: str, limit: int = 50, offset: int = 0):
    get_project_for_member(db, project_id, user_id)
    return repo.get_project_activities(db, project_id, limit, offset)

def get_project_insights(db: Session, project_id: str, user_id: str):
    project, _ = get_project_for_member(db, project_id, user_id)
    
    total = len(project.tasks)
    completed = 0
    in_progress = 0
    todo = 0
    overdue = 0
    
    import datetime
    now = datetime.datetime.now(datetime.timezone.utc)
    
    for t in project.tasks:
        if t.status == "DONE":
            completed += 1
        elif t.status == "IN_PROGRESS" or t.status == "IN_REVIEW":
            in_progress += 1
        else:
            todo += 1
            
        if t.due_date and t.status != "DONE":
            # parse due_date if it's a string, or if it's datetime, compare
            # since model uses DateTime, it should be a datetime object
            if isinstance(t.due_date, datetime.datetime) and t.due_date < now:
                overdue += 1
            elif isinstance(t.due_date, str):
                try:
                    dt = datetime.datetime.fromisoformat(t.due_date.replace('Z', '+00:00'))
                    if dt < now:
                        overdue += 1
                except ValueError:
                    pass

    return {
        "total_tasks": total,
        "completed_tasks": completed,
        "in_progress_tasks": in_progress,
        "todo_tasks": todo,
        "overdue_tasks": overdue,
        "completion_percentage": round((completed / total * 100), 2) if total > 0 else 0.0
    }
