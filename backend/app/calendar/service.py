from datetime import datetime
from typing import Optional, List
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from app.workspaces.service import get_workspace_for_member
from app.projects.repository import get_project
from . import repository as repo
from .models import CalendarEvent
from .schemas import CalendarEventCreate, CalendarEventUpdate


def create_event(
    db: Session,
    workspace_id: str,
    user_id: str,
    data: CalendarEventCreate,
) -> CalendarEvent:
    # Verify user is a member of the workspace
    get_workspace_for_member(db, workspace_id, user_id)

    if data.start_time >= data.end_time:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_TIME_RANGE", "message": "End time must be after start time"}},
        )

    if data.project_id:
        project = get_project(db, data.project_id)
        if not project or project.workspace_id != workspace_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "PROJECT_NOT_FOUND", "message": "Project not found in this workspace"}},
            )

    return repo.create_event(db, workspace_id, user_id, data)


def list_events(
    db: Session,
    workspace_id: str,
    user_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    project_id: Optional[str] = None,
) -> List[CalendarEvent]:
    get_workspace_for_member(db, workspace_id, user_id)
    return repo.get_events_by_workspace(db, workspace_id, start_date, end_date, project_id)


def get_event_for_member(
    db: Session,
    event_id: str,
    user_id: str,
) -> CalendarEvent:
    event = repo.get_event(db, event_id)
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "EVENT_NOT_FOUND", "message": "Calendar event not found"}},
        )
    get_workspace_for_member(db, event.workspace_id, user_id)
    return event


def update_event(
    db: Session,
    event_id: str,
    user_id: str,
    data: CalendarEventUpdate,
) -> CalendarEvent:
    event = get_event_for_member(db, event_id, user_id)

    new_start = data.start_time or event.start_time
    new_end = data.end_time or event.end_time
    if new_start >= new_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_TIME_RANGE", "message": "End time must be after start time"}},
        )

    if data.project_id:
        project = get_project(db, data.project_id)
        if not project or project.workspace_id != event.workspace_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail={"error": {"code": "PROJECT_NOT_FOUND", "message": "Project not found in this workspace"}},
            )

    return repo.update_event(db, event, data)


def delete_event(
    db: Session,
    event_id: str,
    user_id: str,
) -> None:
    event = get_event_for_member(db, event_id, user_id)
    repo.delete_event(db, event)
