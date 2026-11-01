from sqlalchemy.orm import Session
from .models import Project, ProjectStatusEnum

def create_project(db: Session, workspace_id: str, owner_id: str, name: str, description: str | None, status: ProjectStatusEnum) -> Project:
    project = Project(
        workspace_id=workspace_id,
        owner_id=owner_id,
        name=name,
        description=description,
        status=status
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project

def get_projects_by_workspace(db: Session, workspace_id: str) -> list[Project]:
    return db.query(Project).filter(Project.workspace_id == workspace_id).all()

def get_project(db: Session, project_id: str) -> Project | None:
    return db.query(Project).filter(Project.id == project_id).first()

def update_project(db: Session, project: Project, name: str | None = None, description: str | None = None, status: ProjectStatusEnum | None = None) -> Project:
    if name is not None:
        project.name = name
    if description is not None:
        project.description = description
    if status is not None:
        project.status = status
    db.commit()
    db.refresh(project)
    return project

def delete_project(db: Session, project: Project) -> None:
    db.delete(project)
    db.commit()

from .models import ProjectActivity
import json

def record_activity(db: Session, project_id: str, actor_id: str | None, event_type: str, target_entity_type: str, target_entity_id: str, event_metadata: dict | None = None) -> ProjectActivity:
    activity = ProjectActivity(
        project_id=project_id,
        actor_id=actor_id,
        event_type=event_type,
        target_entity_type=target_entity_type,
        target_entity_id=target_entity_id,
        event_metadata=json.dumps(event_metadata) if event_metadata else None
    )
    db.add(activity)

    try:
        from app.core.realtime import workspace_realtime_manager
        from .models import Project
        project = db.query(Project).filter(Project.id == project_id).first()
        if project:
            workspace_realtime_manager.broadcast_sync(
                project.workspace_id,
                "activity:created",
                {
                    "id": activity.id,
                    "project_id": project_id,
                    "workspace_id": project.workspace_id,
                    "actor_id": actor_id,
                    "event_type": event_type,
                    "target_entity_type": target_entity_type,
                    "target_entity_id": target_entity_id,
                    "event_metadata": event_metadata or {},
                }
            )
    except Exception:
        pass

    return activity

def get_project_activities(db: Session, project_id: str, limit: int = 50, offset: int = 0) -> list[ProjectActivity]:
    return db.query(ProjectActivity)\
        .filter(ProjectActivity.project_id == project_id)\
        .order_by(ProjectActivity.created_at.desc())\
        .offset(offset)\
        .limit(limit)\
        .all()
