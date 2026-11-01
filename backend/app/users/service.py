import logging
from fastapi import HTTPException, status
from sqlalchemy.orm import Session
from .models import User
from .schemas import UserCreate, UserUpdate
from app.core.security import get_password_hash, verify_password
from app.core.storage import delete_avatar
from app.workspaces.models import Workspace, WorkspaceMember

logger = logging.getLogger("ai_productivity_platform.users")


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_user(db: Session, user_id: str) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


get_user_by_id = get_user



def create_user(db: Session, user_in: UserCreate) -> User:
    db_user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=get_password_hash(user_in.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


def update_user_profile(db: Session, user: User, user_in: UserUpdate) -> User:
    if user_in.name is not None:
        trimmed_name = user_in.name.strip()
        if not trimmed_name:
            raise HTTPException(
                status_code=422,
                detail={"error": {"code": "INVALID_NAME", "message": "Name cannot be empty or only whitespace"}},
            )
        user.name = trimmed_name

    if user_in.preferences is not None:
        user.preferences = user_in.preferences.model_dump()

    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Updated profile for user: id=%s email=%s", user.id, user.email)
    return user


def update_user_avatar(db: Session, user: User, new_avatar_url: str | None) -> User:
    old_avatar = user.avatar_url
    if old_avatar and old_avatar != new_avatar_url:
        delete_avatar(old_avatar)

    user.avatar_url = new_avatar_url
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("Updated avatar for user: id=%s", user.id)
    return user


def change_user_password(db: Session, user: User, current_password: str, new_password: str) -> None:
    if not verify_password(current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_PASSWORD", "message": "Current password is incorrect"}},
        )

    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": {"code": "WEAK_PASSWORD", "message": "New password must be at least 6 characters long"}},
        )

    user.password_hash = get_password_hash(new_password)
    db.add(user)
    db.commit()
    logger.info("Changed password for user: id=%s", user.id)


def delete_user_account(db: Session, user: User, password: str, confirmation_email: str) -> None:
    if confirmation_email.strip().lower() != user.email.strip().lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "EMAIL_MISMATCH", "message": "Confirmation email does not match your account email"}},
        )

    if not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "INVALID_PASSWORD", "message": "Password is incorrect"}},
        )

    owned_workspaces_count = db.query(Workspace).filter(Workspace.owner_id == user.id).count()
    if owned_workspaces_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "USER_OWNS_WORKSPACES",
                    "message": f"Cannot delete account: you are the owner of {owned_workspaces_count} workspace(s). Please delete or transfer ownership of your workspaces first.",
                }
            },
        )

    # Clean up non-owned workspace memberships
    db.query(WorkspaceMember).filter(WorkspaceMember.user_id == user.id).delete(synchronize_session=False)

    # Clean up avatar from storage
    if user.avatar_url:
        delete_avatar(user.avatar_url)

    db.delete(user)
    db.commit()
    logger.info("Deleted account for user: id=%s email=%s", user.id, user.email)
