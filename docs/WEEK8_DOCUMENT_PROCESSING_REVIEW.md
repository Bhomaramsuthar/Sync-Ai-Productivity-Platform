# Week 8 — Document Processing and Text Extraction Review

## 1. Overview

Week 8 builds upon the Week 7 document storage and upload infrastructure, converting raw stored files into usable, structured plain text to prepare for Phase 5 (RAG, Chunking, and AI Assistant integration).

The implementation establishes a robust extraction pipeline supporting PDF, TXT, Markdown, DOCX, and CSV formats, safe error handling, asynchronous processing via FastAPI BackgroundTasks, database persistence with Alembic migrations, authorization boundaries, and an enhanced frontend document library with live status updates, readable failure diagnosis, retry actions, and a text preview modal.

---

## 2. Supported File Formats & Extraction Libraries

| Format | Extension | Extraction Engine / Library | Features & Extraction Strategy |
| :--- | :--- | :--- | :--- |
| **PDF** | `.pdf` | `pypdf (>= 5.0.0)` | Iterates pages via `PdfReader`. Handles encrypted/password-protected files gracefully. Detects scanned or image-only PDFs lacking a text layer and reports explicit failure without falsely claiming OCR. |
| **DOCX** | `.docx` | `python-docx (>= 1.1.0)` | Extracts paragraph text with newline separation and parses tabular data with cell boundary formatting (`col1 \| col2`). |
| **Plain Text** | `.txt` | Python standard library | Safely decodes text with fallback encodings (`utf-8`, `utf-8-sig`, `latin-1`, `cp1252`). Preserves original line breaks. |
| **Markdown** | `.md` | Python standard library | Decodes formatted content preserving headers, lists, code snippets, and paragraph structure. |
| **CSV** | `.csv` | Python `csv` module | Parses tabular rows, cleans column whitespace, and outputs delimited readable rows (`col1 \| col2`). |

All libraries are free, open-source, maintained, and run locally in Python without paid external infrastructure or third-party AI APIs.

---

## 3. Processing Pipeline & Status Transitions

### Status Values:
- `UPLOADED`: Initial state when file bytes are uploaded to Supabase Storage and database metadata is created.
- `PROCESSING`: Extraction pipeline is actively retrieving bytes and parsing document contents.
- `READY`: Text extraction succeeded. Extracted text and character counts are persisted.
- `FAILED`: Extraction could not complete (e.g. empty file, scanned PDF without text, corrupt file, storage fetch error). A sanitized error message is recorded in `processing_error`.

### State Diagram:
```text
           [Client Upload]
                 ↓
             UPLOADED
                 ↓ (FastAPI BackgroundTask)
            PROCESSING
           /          \
     (Success)      (Failure)
         ↓              ↓
       READY          FAILED
                        ↓ (Client Retry)
                    PROCESSING
```

### Key Reliability Rules:
- **Asynchronous Processing**: Upload and Retry endpoints immediately return HTTP responses and dispatch processing to FastAPI's built-in `BackgroundTasks` runner with an isolated database session.
- **Duplicate Prevention**: If a document is already `PROCESSING`, duplicate processing requests return HTTP 409 `ALREADY_PROCESSING`.
- **Fault Isolation**: One document's failure (e.g. invalid PDF) is isolated, recorded as `FAILED`, and does not crash the server or affect other document operations.
- **Retry Mechanism**: Authorized users can trigger `POST /api/v1/documents/{doc_id}/retry` which clears previous errors, resets status, and re-executes extraction.

---

## 4. Database Schema Changes

A new Alembic migration (`alembic/versions/e9d252609d2f_add_document_text_extraction_fields.py`) was applied to the live Mumbai Supabase PostgreSQL database:

```sql
ALTER TABLE documents ADD COLUMN extracted_text TEXT NULL;
ALTER TABLE documents ADD COLUMN extracted_chars INTEGER NULL DEFAULT 0;
ALTER TABLE documents ADD COLUMN processing_error TEXT NULL;
ALTER TABLE documents ADD COLUMN processed_at TIMESTAMP WITH TIME ZONE NULL;
```

### Design Rationale:
Keeping extraction fields directly on `documents` rather than a secondary table provides:
1. Strict 1-to-1 correspondence with zero join overhead.
2. Seamless lifecycle management (deleting a document automatically cleans up extraction data without foreign key cascade complexity).
3. Preservation of existing records in the Mumbai Supabase database without downtime or data destruction.
4. Foundation for Week 11 (RAG Phase), where chunking will introduce a separate `document_chunks` table referencing `documents.id`.

---

## 5. API Endpoints & Security

| Method | Endpoint | Description | Authorization |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/projects/{projectId}/documents` | Upload file, save metadata, enqueue background extraction | Project Member |
| `GET` | `/api/v1/projects/{projectId}/documents` | List documents (includes status, chars, error) | Project Member |
| `GET` | `/api/v1/documents/{documentId}` | Get single document metadata with signed download URL | Project Member |
| `GET` | `/api/v1/documents/{documentId}/status` | Get lightweight processing status & error details | Project Member |
| `GET` | `/api/v1/documents/{documentId}/text` | Get extracted text, character count, and processed date | Project Member |
| `POST` | `/api/v1/documents/{documentId}/retry` | Retry extraction for a failed or stalled document | Project Member |
| `DELETE` | `/api/v1/documents/{documentId}` | Delete document record and storage file | Uploader OR Workspace Owner/Admin |

### Security Controls:
- **Authorization**: All endpoints verify JWT tokens and validate workspace and project membership via `get_project_for_member`.
- **IDOR Prevention**: Accessing a document ID from another workspace or project is blocked with HTTP 403 / 404.
- **Sanitized Errors**: Internal system paths, database credentials, and stack traces are never exposed in API responses.
- **Untrusted Input**: Extracted text is treated purely as untrusted text strings and is not executed or evaluated as code.
- **Memory & Storage Limits**: File upload size is capped at 10MB (`MAX_UPLOAD_SIZE`). Extracted text is capped at 500,000 characters (`MAX_EXTRACTED_CHARS`), with clean truncation notices for oversized contents.

---

## 6. Frontend Integration

The existing `DocumentLibrary` (`frontend/src/pages/DocumentLibrary.tsx`) was enhanced:
- **Real-time Status Badges**:
  - `READY`: Success badge with checkmark and character count.
  - `PROCESSING`: Warning badge with spinning indicator.
  - `UPLOADED`: Neutral badge indicating queued status.
  - `FAILED`: Danger badge indicating extraction failure.
- **Readable Error Diagnosis**: Failed cards render a dedicated error callout detailing the safe failure reason (e.g. Scanned PDF notice, empty file, corrupt structure).
- **Retry Action**: Cards with failed extractions include a `Retry` button with spinning feedback.
- **Text Preview Modal**:
  - Clicking "View Text" or clicking a READY document card opens a responsive preview modal.
  - Displays document metadata (filename, size, character count, processed date, uploader).
  - Pre-formatted monospace viewer with comfortable line height and scrolling.
  - One-click "Copy Text" button with copied visual confirmation.
  - Direct download button inside preview.
- **Live Polling**: When documents are in `PROCESSING` or `UPLOADED` state, the interface automatically polls the list every 2.5 seconds until all documents resolve.
- **Design System Adherence**: Built using custom design tokens in `index.css` (modal overlay, code preview blocks, badges, buttons) without Tailwind CSS.

---

## 7. Testing & Verification

### Automated Backend Tests
Comprehensive tests in `backend/app/tests/test_documents.py` verify all core scenarios:
1. `test_document_upload_and_txt_extraction` — TXT extraction & character count.
2. `test_document_markdown_extraction` — Markdown header and list structure preservation.
3. `test_document_csv_extraction` — Tabular row formatting.
4. `test_document_docx_extraction` — Word DOCX paragraph extraction.
5. `test_document_pdf_extraction` — PDF text extraction.
6. `test_document_empty_file_fails_safely` — 0-byte file safe failure.
7. `test_document_scanned_pdf_without_text_fails_safely` — Scanned/blank PDF detection without claiming OCR.
8. `test_document_corrupted_pdf_fails_safely` — Corrupt PDF payload failure isolation.
9. `test_document_unsupported_file_type` — Rejecting unsupported extensions (`.exe`).
10. `test_document_retry_processing` — Retrying a failed document to successful READY state.
11. `test_document_authorization_and_cross_workspace_isolation` — IDOR prevention & cross-workspace isolation.
12. `test_document_list_download_and_delete_regressions` — Regression check for upload, download link, list, and delete.

**Result**: All 12 document tests passed. All 61 backend suite tests passed with 0 failures (`61 passed in 145.69s`).

### Frontend Production Build
`npm run build` in `frontend/` passed successfully:
```text
✓ 1989 modules transformed.
dist/index.html                   0.45 kB │ gzip:   0.29 kB
dist/assets/index-BiZ4OvyM.css   17.85 kB │ gzip:   3.94 kB
dist/assets/index-DwoA3w3Z.js   374.51 kB │ gzip: 114.88 kB
✓ built in 982ms
```

---

## 8. Manual Verification Steps

1. **Start Backend**:
   ```bash
   cd backend
   .\venv\Scripts\uvicorn app.main:app --reload
   ```
2. **Start Frontend**:
   ```bash
   cd frontend
   npm run dev
   ```
3. Open browser at `http://localhost:5173/`.
4. Navigate to any project -> **Documents** tab.
5. **Test TXT / Markdown**: Upload a `.txt` or `.md` file. Observe the status transition from `Queued` / `Processing...` to `Ready`.
6. Click "View Text" or click the card to open the preview modal. Verify text is displayed cleanly with character count.
7. Click "Copy Text" and verify the feedback state changes to "Copied!".
8. **Test DOCX / PDF**: Upload `.docx` and `.pdf` files. Verify text extraction completes.
9. **Test Error Handling**: Upload an empty file (0 bytes). Verify status badge shows `Extraction Failed` and the card displays "File is empty (0 bytes).".
10. **Test Retry**: Click the "Retry" button on a failed document and verify retry triggers.
11. **Test Download and Delete**: Click "Download" to verify presigned download URL generation, and delete to verify removal.

---

## 9. Limits & Known Limitations

- **No OCR**: Scanned PDFs or images of text containing no embedded text layer cannot be parsed without OCR. The system explicitly detects this and returns a safe explanation ("No extractable text found in PDF. Scanned documents or images without text layer (OCR) are not currently supported.").
- **File Size Limit**: Files exceeding 10MB (`MAX_UPLOAD_SIZE`) are rejected at upload.
- **Extracted Text Cap**: Extracted text exceeding 500,000 characters (`MAX_EXTRACTED_CHARS`) is safely truncated with a disclosure notice to prevent memory exhaustion.
- **Local Background Runner**: Asynchronous processing utilizes FastAPI `BackgroundTasks`. In multi-instance scale-out deployments, a persistent task queue (e.g. Celery / Redis) would be used, but FastAPI `BackgroundTasks` satisfies the zero-cost monolith deployment constraints.
