from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, status, Query, Response
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.users.models import User
from . import service
from .schemas import CalendarEventCreate, CalendarEventUpdate, CalendarEventRead

router = APIRouter()


@router.post(
    "/workspaces/{workspace_id}/calendar/events",
    response_model=CalendarEventRead,
    status_code=status.HTTP_201_CREATED,
)
def create_event(
    workspace_id: str,
    data: CalendarEventCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.create_event(db, workspace_id, current_user.id, data)


@router.get(
    "/workspaces/{workspace_id}/calendar/events",
    response_model=List[CalendarEventRead],
)
def list_events(
    workspace_id: str,
    start_date: Optional[datetime] = Query(None, description="Filter events after or at this start time"),
    end_date: Optional[datetime] = Query(None, description="Filter events before or at this end time"),
    project_id: Optional[str] = Query(None, description="Filter events by project ID"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.list_events(db, workspace_id, current_user.id, start_date, end_date, project_id)


@router.get(
    "/calendar/events/{event_id}",
    response_model=CalendarEventRead,
)
def get_event(
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.get_event_for_member(db, event_id, current_user.id)


@router.put(
    "/calendar/events/{event_id}",
    response_model=CalendarEventRead,
)
@router.patch(
    "/calendar/events/{event_id}",
    response_model=CalendarEventRead,
)
def update_event(
    event_id: str,
    data: CalendarEventUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return service.update_event(db, event_id, current_user.id, data)


@router.delete(
    "/calendar/events/{event_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_event(
    event_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service.delete_event(db, event_id, current_user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
