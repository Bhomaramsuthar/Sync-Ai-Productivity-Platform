from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from uuid import UUID
from .models import RoleEnum


class UserPreferences(BaseModel):
    theme: str = "dark"
    email_notifications: bool = True
    task_updates: bool = True
    meeting_reminders: bool = True
    ai_suggestions: bool = True
    weekly_digest: bool = False


class UserBase(BaseModel):
    name: str
    email: EmailStr


class UserCreate(UserBase):
    password: str = Field(min_length=6)


class UserUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    preferences: UserPreferences | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6, max_length=128)


class DeleteAccountRequest(BaseModel):
    password: str = Field(min_length=1)
    confirmation_email: EmailStr


class UserResponse(UserBase):
    id: UUID
    role: RoleEnum
    avatar_url: str | None = None
    preferences: UserPreferences = Field(default_factory=UserPreferences)
    created_at: datetime | None
    updated_at: datetime | None

    model_config = {"from_attributes": True}
