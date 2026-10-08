from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from app.core.database import get_db
from app.core.config import settings
from app.core.security import verify_password, create_access_token
from app.users import service as user_service
from app.users.schemas import UserCreate, UserResponse
from .schemas import Token, LoginRequest
from .dependencies import get_current_user
from app.users.models import User

router = APIRouter()

@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    user = user_service.get_user_by_email(db, email=user_in.email)
    if user:
        raise HTTPException(
            status_code=409,
            detail={"error": {"code": "EMAIL_EXISTS", "message": "Email already registered"}}
        )
    return user_service.create_user(db, user_in=user_in)

@router.post("/login", response_model=Token)
def login(login_data: LoginRequest, db: Session = Depends(get_db)):
    user = user_service.get_user_by_email(db, email=login_data.email)
    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=401,
            detail={"error": {"code": "INVALID_CREDENTIALS", "message": "Incorrect email or password"}}
        )
    
    access_token_expires = timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    access_token = create_access_token(
        subject=user.id, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer", "user": user}

@router.get("/me", response_model=UserResponse)
def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/logout")
def logout():
    # Stateless JWTs cannot be easily revoked without a blacklist/session store.
    # We follow the strategy to clear auth state on the client side.
    return {"message": "Successfully logged out. Please clear local token."}
