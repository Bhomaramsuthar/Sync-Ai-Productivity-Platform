from datetime import datetime
from typing import Optional, List
from sqlalchemy.orm import Session
from .models import CalendarEvent
from .schemas import CalendarEventCreate, CalendarEventUpdate


def create_event(
    db: Session,
    workspace_id: str,
    created_by: str,
    data: CalendarEventCreate,
) -> CalendarEvent:
    event = CalendarEvent(
        workspace_id=workspace_id,
        created_by=created_by,
        project_id=data.project_id,
        title=data.title,
        description=data.description,
        start_time=data.start_time,
        end_time=data.end_time,
        event_type=data.event_type or "GENERAL",
        meeting_id=data.meeting_id,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def get_events_by_workspace(
    db: Session,
    workspace_id: str,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    project_id: Optional[str] = None,
) -> List[CalendarEvent]:
    query = db.query(CalendarEvent).filter(CalendarEvent.workspace_id == workspace_id)

    if project_id:
        query = query.filter(CalendarEvent.project_id == project_id)
    if start_date:
        query = query.filter(CalendarEvent.end_time >= start_date)
    if end_date:
        query = query.filter(CalendarEvent.start_time <= end_date)

    return query.order_by(CalendarEvent.start_time.asc()).all()


def get_event(db: Session, event_id: str) -> Optional[CalendarEvent]:
    return db.query(CalendarEvent).filter(CalendarEvent.id == event_id).first()


def update_event(
    db: Session,
    event: CalendarEvent,
    data: CalendarEventUpdate,
) -> CalendarEvent:
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    return event


def delete_event(db: Session, event: CalendarEvent) -> None:
    db.delete(event)
    db.commit()
