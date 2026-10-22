from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class CalendarEventBase(BaseModel):
    title: str = Field(..., max_length=255)
    description: Optional[str] = None
    start_time: datetime
    end_time: datetime
    event_type: Optional[str] = Field(default="GENERAL", max_length=50)
    project_id: Optional[str] = None
    meeting_id: Optional[str] = None


class CalendarEventCreate(CalendarEventBase):
    pass


class CalendarEventUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    event_type: Optional[str] = Field(None, max_length=50)
    project_id: Optional[str] = None
    meeting_id: Optional[str] = None


class CalendarEventRead(CalendarEventBase):
    id: str
    workspace_id: str
    created_by: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True
