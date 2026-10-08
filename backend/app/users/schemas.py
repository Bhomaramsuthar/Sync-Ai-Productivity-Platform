from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from uuid import UUID
from .models import RoleEnum

class UserBase(BaseModel):
    name: str
    email: EmailStr

class UserCreate(UserBase):
    password: str = Field(min_length=6)

class UserResponse(UserBase):
    id: UUID
    role: RoleEnum
    created_at: datetime | None
    updated_at: datetime | None

    model_config = {"from_attributes": True}
