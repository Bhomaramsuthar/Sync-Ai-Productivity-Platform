import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.dependencies import get_current_user
from app.users.models import User, RoleEnum
from app.users import service as user_service
from app.users.schemas import (
    UserResponse,
    UserUpdate,
    ChangePasswordRequest,
    DeleteAccountRequest,
)
from app.core.storage import upload_avatar

logger = logging.getLogger("ai_productivity_platform.users")
router = APIRouter()

MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB
ALLOWED_AVATAR_EXTENSIONS = {"jpg", "jpeg", "png", "webp", "gif"}
ALLOWED_AVATAR_MIMETYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}


def _validate_avatar_file(file: UploadFile, file_bytes: bytes):
    if len(file_bytes) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "EMPTY_FILE", "message": "The uploaded avatar file is empty"}},
        )

    if len(file_bytes) > MAX_AVATAR_SIZE:
        raise HTTPException(
            status_code=413,
            detail={"error": {"code": "PAYLOAD_TOO_LARGE", "message": "Avatar file exceeds the 2MB size limit"}},
        )

    ext = file.filename.split(".")[-1].lower() if file.filename and "." in file.filename else ""
    if ext not in ALLOWED_AVATAR_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_FILE_TYPE",
                    "message": f"File extension '.{ext}' is not supported. Please upload JPG, PNG, WebP, or GIF.",
                }
            },
        )

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_AVATAR_MIMETYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_MIME_TYPE",
                    "message": f"MIME type '{content_type}' is not allowed for avatars.",
                }
            },
        )

    # Magic byte verification for genuine image contents
    is_valid_image = False
    if file_bytes.startswith(b"\xff\xd8\xff"):  # JPEG
        is_valid_image = True
    elif file_bytes.startswith(b"\x89PNG\r\n\x1a\n"):  # PNG
        is_valid_image = True
    elif file_bytes.startswith(b"GIF87a") or file_bytes.startswith(b"GIF89a"):  # GIF
        is_valid_image = True
    elif file_bytes.startswith(b"RIFF") and len(file_bytes) >= 12 and file_bytes[8:12] == b"WEBP":  # WebP
        is_valid_image = True

    if not is_valid_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": {
                    "code": "INVALID_IMAGE_CONTENT",
                    "message": "File content does not match a valid image format signature.",
                }
            },
        )


@router.get("/me", response_model=UserResponse)
def get_current_user_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.patch("/me", response_model=UserResponse)
def update_current_user_profile(
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated = user_service.update_user_profile(db=db, user=current_user, user_in=user_in)
    return updated


@router.post("/me/avatar", response_model=UserResponse)
def upload_current_user_avatar(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    file_bytes = file.file.read()
    _validate_avatar_file(file, file_bytes)

    try:
        avatar_url = upload_avatar(
            file_bytes=file_bytes,
            file_name=file.filename or "avatar.jpg",
            content_type=file.content_type or "image/jpeg",
        )
    except Exception as exc:
        logger.error("Failed to upload avatar to storage for user %s: %s", current_user.id, str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": {"code": "STORAGE_UPLOAD_FAILED", "message": "Failed to store avatar image"}},
        )

    updated = user_service.update_user_avatar(db=db, user=current_user, new_avatar_url=avatar_url)
    return updated


@router.delete("/me/avatar", response_model=UserResponse)
def remove_current_user_avatar(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    updated = user_service.update_user_avatar(db=db, user=current_user, new_avatar_url=None)
    return updated


@router.post("/me/change-password")
def change_password(
    data: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_service.change_user_password(
        db=db,
        user=current_user,
        current_password=data.current_password,
        new_password=data.new_password,
    )
    return {"message": "Password changed successfully"}


@router.delete("/me")
def delete_account(
    data: DeleteAccountRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_service.delete_user_account(
        db=db,
        user=current_user,
        password=data.password,
        confirmation_email=data.confirmation_email,
    )
    return {"message": "Account deleted successfully"}


@router.patch("/{user_id}", response_model=UserResponse)
def update_user_by_id(
    user_id: str,
    user_in: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Enforce strict ownership: normal users cannot modify another user's profile
    if current_user.id != user_id and current_user.role != RoleEnum.ADMIN:
        logger.warning(
            "Unauthorized profile modification attempt: user %s attempted to update user %s",
            current_user.id,
            user_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "FORBIDDEN", "message": "Cannot modify another user's profile"}},
        )

    target_user = user_service.get_user(db, user_id=user_id)
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "USER_NOT_FOUND", "message": "User not found"}},
        )

    updated = user_service.update_user_profile(db=db, user=target_user, user_in=user_in)
    return updated


# ---- Notifications ----

@router.get("/notifications", response_model=list)
def get_user_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.workspaces import repository as ws_repo
    notifs = ws_repo.get_user_notifications(db, current_user.id)
    return [
        {
            "id": n.id,
            "user_id": n.user_id,
            "workspace_id": n.workspace_id,
            "type": n.type,
            "title": n.title,
            "message": n.message,
            "data": n.data,
            "is_read": n.is_read,
            "created_at": n.created_at,
        }
        for n in notifs
    ]


@router.patch("/notifications/{notification_id}/read")
def mark_user_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.workspaces import repository as ws_repo
    notif = ws_repo.mark_notification_read(db, notification_id, current_user.id)
    if not notif:
        raise HTTPException(status_code=404, detail={"error": {"code": "NOT_FOUND", "message": "Notification not found"}})
    return {
        "id": notif.id,
        "user_id": notif.user_id,
        "workspace_id": notif.workspace_id,
        "type": notif.type,
        "title": notif.title,
        "message": notif.message,
        "data": notif.data,
        "is_read": notif.is_read,
        "created_at": notif.created_at,
    }


@router.patch("/notifications/read-all")
def mark_all_user_notifications_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.workspaces import repository as ws_repo
    count = ws_repo.mark_all_notifications_read(db, current_user.id)
    return {"updated_count": count}

