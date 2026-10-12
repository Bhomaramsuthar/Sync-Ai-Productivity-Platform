# Week 7 - Documents Review

## Overview
This document summarizes the implementation of the Project Documents feature in Week 7. It provides the foundation for secure document management and serves as a prerequisite for future AI knowledge base capabilities.

## Database Changes
- Added a new `documents` table via Alembic (`alembic/versions/27b6a0898dfc_add_documents_table.py`).
- Fields: `id`, `project_id`, `uploader_id`, `filename`, `storage_key`, `content_type`, `file_size`, `status` (READY/ERROR), `created_at`.
- Established relationships in the `Project` model (`cascade="all, delete-orphan"`).

## Storage Configuration
- Utilized **Supabase Storage** for document bytes.
- The default bucket is `project_documents` (private by default).
- Configuration keys added to `app/core/config.py` and `.env.example`: `SUPABASE_URL`, `SUPABASE_KEY`.
- Generates pre-signed URLs for authenticated users when downloading/previewing files.

## Supported Formats & Limits
- Configurable maximum upload size limit via `MAX_UPLOAD_SIZE` (default 10MB).
- Validated extensions: `.pdf`, `.txt`, `.md`, `.docx`, `.csv`.
- Basic MIME type mapping is used but file extension validation offers extra strictness on upload.

## API Endpoints
- `POST /api/v1/projects/{project_id}/documents` - Upload a document
- `GET /api/v1/projects/{project_id}/documents` - List documents in a project
- `GET /api/v1/documents/{doc_id}` - Get a specific document with its `download_url`
- `DELETE /api/v1/documents/{doc_id}` - Delete a document

## Security Controls
- Standard authentication and workspace authorization checks are run on every endpoint.
- Only project members can list, view, and upload documents.
- Storage keys are never generated from raw client input. UUIDs are used to prevent path traversal.
- Deletion is restricted to the document uploader OR a workspace Admin/Owner.
- Cross-workspace isolation ensures no user can access another workspace's documents.
- Supabase storage bucket is private; downloading is mediated entirely by short-lived signed URLs from the backend.

## Testing
- Tests implemented in `backend/app/tests/test_documents.py`.
- Mocks were used to simulate the Supabase SDK storage behavior without relying on an active connection.
- Checked valid uploads, invalid extensions, secure download retrieval, and deletion access.
- Frontend production build passed.

## Known Limitations
- Real file scanning (like anti-virus) is not currently implemented.
- The `status` field currently defaults to `READY`. For future RAG/embedding processing, it will be used to signal asynchronous processing jobs.
