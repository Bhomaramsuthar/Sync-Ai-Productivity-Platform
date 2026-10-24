from supabase import create_client, Client
from app.core.config import settings
import uuid

# Initialize supabase client if configured
supabase: Client | None = None
if settings.SUPABASE_URL and settings.SUPABASE_KEY:
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

BUCKET_NAME = "project_documents"
AVATARS_BUCKET = "avatars"

def upload_file(file_bytes: bytes, file_name: str, content_type: str) -> str:
    """Uploads file to supabase storage and returns the storage path/key"""
    if not supabase:
        raise Exception("Supabase is not configured")
        
    # generate unique path
    ext = file_name.split(".")[-1] if "." in file_name else ""
    path = f"{uuid.uuid4()}.{ext}" if ext else f"{uuid.uuid4()}"
    
    # Try creating bucket if it doesn't exist (can fail if no permissions, we ignore)
    try:
        supabase.storage.get_bucket(BUCKET_NAME)
    except Exception:
        try:
            supabase.storage.create_bucket(BUCKET_NAME, public=False)
        except Exception:
            pass

    supabase.storage.from_(BUCKET_NAME).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": content_type}
    )
    return path

def delete_file(path: str):
    if not supabase:
        return
    supabase.storage.from_(BUCKET_NAME).remove([path])

def get_signed_url(path: str, expires_in: int = 3600) -> str:
    if not supabase:
        raise Exception("Supabase is not configured")
    # Returns a signed URL that expires in `expires_in` seconds
    res = supabase.storage.from_(BUCKET_NAME).create_signed_url(path, expires_in)
    return res["signedURL"] if isinstance(res, dict) and "signedURL" in res else res

def download_file(path: str) -> bytes:
    if not supabase:
        raise Exception("Supabase is not configured")
    return supabase.storage.from_(BUCKET_NAME).download(path)

def upload_avatar(file_bytes: bytes, file_name: str, content_type: str) -> str:
    """Uploads avatar file to supabase storage avatars bucket and returns its public URL."""
    if not supabase:
        import base64
        b64 = base64.b64encode(file_bytes).decode('ascii')
        return f"data:{content_type};base64,{b64}"

    ext = file_name.split(".")[-1].lower() if "." in file_name else "jpg"
    unique_filename = f"{uuid.uuid4()}.{ext}"

    try:
        supabase.storage.get_bucket(AVATARS_BUCKET)
    except Exception:
        try:
            supabase.storage.create_bucket(AVATARS_BUCKET, options={"public": True})
        except Exception:
            pass

    supabase.storage.from_(AVATARS_BUCKET).upload(
        path=unique_filename,
        file=file_bytes,
        file_options={"content-type": content_type}
    )

    public_url_res = supabase.storage.from_(AVATARS_BUCKET).get_public_url(unique_filename)
    if isinstance(public_url_res, str):
        return public_url_res
    if isinstance(public_url_res, dict) and "publicUrl" in public_url_res:
        return public_url_res["publicUrl"]
    return f"{settings.SUPABASE_URL}/storage/v1/object/public/{AVATARS_BUCKET}/{unique_filename}"

def delete_avatar(avatar_url: str):
    """Deletes an avatar file from Supabase avatars bucket if stored there."""
    if not supabase or not avatar_url:
        return
    try:
        if f"/{AVATARS_BUCKET}/" in avatar_url:
            filename = avatar_url.split(f"/{AVATARS_BUCKET}/")[-1].split("?")[0]
            if filename:
                supabase.storage.from_(AVATARS_BUCKET).remove([filename])
    except Exception:
        pass
