from supabase import create_client, Client
from app.core.config import settings
import uuid

# Initialize supabase client if configured
supabase: Client | None = None
if settings.SUPABASE_URL and settings.SUPABASE_KEY:
    supabase = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)

BUCKET_NAME = "project_documents"

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

    res = supabase.storage.from_(BUCKET_NAME).upload(
        path=path,
        file=file_bytes,
        file_options={"content-type": content_type}
    )
    # The result should be something like Response(data={'Key': ...}, ...) or just dict in newer versions
    # We just need the path we provided.
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
