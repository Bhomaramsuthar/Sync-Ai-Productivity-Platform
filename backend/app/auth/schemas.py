from pydantic import BaseModel
from app.users.schemas import UserResponse

class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse

class LoginRequest(BaseModel):
    email: str
    password: str
