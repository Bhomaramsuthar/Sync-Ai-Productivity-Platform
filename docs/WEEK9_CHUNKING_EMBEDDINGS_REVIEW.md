# Week 9 — Document Chunking & Embeddings Review

## 1. Overview

Week 9 advances the AI-Driven Collaboration & Productivity Platform into vector representations and semantic indexing. Building on Week 8's document text extraction pipeline, Week 9 implements:

1. **Intelligent Text Chunking**: Configurable, paragraph- and line-aware text chunker with windowing, boundary snapping, and overlap preservation.
2. **Provider-Neutral Embeddings**: An extensible embedding provider architecture featuring zero-cost, local CPU ONNX embedding inference with `FastEmbed` (`BAAI/bge-small-en-v1.5`, 384 dimensions), an optional OpenAI-compatible provider, and a deterministic hash-based mock provider for fast, isolated test runs.
3. **PostgreSQL pgvector Persistence**: Live storage of chunk text and dense vector embeddings in Supabase Mumbai PostgreSQL utilizing the `vector(384)` type, foreign key CASCADE deletions, and document-level indexing metadata.
4. **Decoupled Pipeline Workflow**: Extraction status (`UPLOADED`, `PROCESSING`, `READY`, `FAILED`) remains strictly distinct from indexing status (`PENDING`, `PROCESSING`, `READY`, `FAILED`).
5. **Idempotent & Transaction-Safe Execution**: Embeddings are computed outside of long-lived database transactions; re-indexing atomically replaces previous chunks without duplicates or orphaned records.
6. **Authorization & Privacy**: Secure project- and workspace-scoped endpoints for indexing status, retry indexing, and chunk metadata inspection without exposing raw vector floats or internal secrets.
7. **Frontend Inspection & Recovery**: Updated Documents library featuring dual extraction/indexing badges, indexing retry actions, and a tabbed modal to view extracted text or inspect chunk metadata and boundaries.

---

## 2. Text Chunking Strategy & Configuration

The chunking module is implemented in `backend/app/rag/chunking.py`.

### Chunking Strategy
- **Target Chunk Size**: Configurable via `CHUNK_SIZE` in `app/core/config.py` (default: **1,000 characters**, range ~800–1,000 chars).
- **Target Overlap**: Configurable via `CHUNK_OVERLAP` (default: **150 characters**, range ~100–150 chars).
- **Boundary Preservation**: Rather than splitting at arbitrary character offsets, the chunker scans the trailing 30% of each window for natural break boundaries in order of priority:
  1. Paragraph boundary (`\n\n`)
  2. Line boundary (`\n`)
  3. Sentence end (`. `, `! `, `? `)
  4. Word boundary (space)
- **Overlap Word Snapping**: When calculating the next chunk's start offset with overlap (`end - overlap`), it adjusts forward to a word boundary to prevent cutting words in half.
- **Defensive Edge Cases**:
  - Empty strings or whitespace-only inputs return an empty chunk list `[]` without throwing errors.
  - Short documents that fit into a single window return a single chunk with `chunk_index = 0`.
  - Sequential, zero-indexed chunk numbering (`chunk_index: 0, 1, 2...`).
  - Guaranteed forward progress prevents infinite loops regardless of unusual document formatting.

---

## 3. Embedding Provider Architecture

Implemented under `backend/app/rag/embeddings/` using an abstract base class pattern.

```text
               BaseEmbeddingProvider
              /          |          \
    FastEmbedProvider  OpenAIProvider  MockEmbeddingProvider
    (Default, Local)   (Optional API)  (Automated Tests)
```

### 1. Default Provider: FastEmbed (`FastEmbedProvider`)
- **Library**: `fastembed (>= 0.9.0)` (ONNX Runtime-backed, optimized for CPU inference).
- **Model**: `BAAI/bge-small-en-v1.5`
- **Vector Dimension**: **384**
- **Cost**: **$0.00 (100% Free & Local)**
- **API Key**: None required.
- **Performance**: Approximately 4–8 ms per batch on modern CPUs; memory footprint ~130MB.
- **Offline / Local**: Operates completely in-process without network latency, rate limits, or outbound API costs.

### 2. Optional External Provider: OpenAI (`OpenAIEmbeddingProvider`)
- **API**: OpenAI-compatible Embeddings API (supports OpenAI, Azure OpenAI, self-hosted vLLM/Ollama).
- **Configuration**: `EMBEDDING_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`.
- **Model**: `text-embedding-3-small` (1536 dim) or custom.
- **Resilience**: Handles HTTP timeouts, client rate limits (HTTP 429), and wraps network errors into `EmbeddingError`.

### 3. Testing Provider: Deterministic Mock (`MockEmbeddingProvider`)
- **Usage**: Used during unit and integration test suites.
- **Behavior**: Generates deterministic unit-normalized 384-dimensional vectors seeded by SHA-256 hashes of the chunk text.
- **Simulations**: Supports `.should_fail = True` to verify retry resilience, partial failure isolation, and error message sanitization.

### Provider Factory & Dependency Injection
- `get_embedding_provider()` returns the configured provider singleton.
- `set_embedding_provider()` allows tests to inject mock or failing providers cleanly without global monkeypatching.

---

## 4. Database Schema & Migration

### Vector Extension (`pgvector`)
The Mumbai Supabase PostgreSQL instance has the `vector` extension (`0.8.2`) pre-installed and active.

### Alembic Migration
Migration `alembic/versions/ffc8a44bb912_add_document_chunks_and_indexing_fields.py` was generated and applied to the target Mumbai database:

```sql
-- 1. Indexing fields added to 'documents' table
ALTER TABLE documents 
  ADD COLUMN indexing_status VARCHAR(50) DEFAULT 'PENDING',
  ADD COLUMN indexing_error TEXT,
  ADD COLUMN indexed_at TIMESTAMPTZ,
  ADD COLUMN chunk_count INTEGER DEFAULT 0;

-- 2. Create 'document_chunks' table
CREATE TABLE document_chunks (
    id VARCHAR(36) PRIMARY KEY,
    document_id VARCHAR(36) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    project_id VARCHAR(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(384),
    char_count INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX ix_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX ix_document_chunks_project_id ON document_chunks(project_id);
```

### Cascade Deletion
- Foreign keys on `document_id` and `project_id` use `ON DELETE CASCADE`.
- SQLAlchemy model `Document` has `chunks = relationship("DocumentChunk", back_populates="document", cascade="all, delete-orphan")`.
- When a document is deleted, all corresponding chunk rows and vector embeddings are purged automatically.

---

## 5. Processing Pipeline & Status Transitions

```text
Document Uploaded
       ↓
Text Extracted (Week 8)
       ↓
Document Status: READY
       ↓
[Trigger Vector Indexing]
       ↓
Indexing Status: PROCESSING
       ↓
Text Chunking (800-1000 chars, 150 overlap)
       ↓
Embedding Generation (FastEmbed / 384 dim) [No DB transaction held]
       ↓
Atomic DB Replace:
  - DELETE prior chunks for document_id
  - INSERT new chunks with vector(384)
  - UPDATE indexing_status = READY, chunk_count = N
       ↓
Indexing Complete!
```

### Failure Handling & Idempotency:
- If embedding generation fails (e.g. timeout or unreadable text), the document text extraction remains `READY`, but `indexing_status` becomes `FAILED` with a user-facing explanation in `indexing_error`.
- Retrying indexing (`POST /api/v1/documents/{doc_id}/retry-indexing`) resets `indexing_status` to `PROCESSING` and dispatches re-indexing via `BackgroundTasks`.
- Because old chunks are deleted in the same transaction as new chunk insertion, retrying indexing is 100% idempotent and cannot produce duplicated chunks.

---

## 6. API Endpoints & Authorization

All endpoints require JWT Bearer authentication and verify project/workspace membership:

| Method | Endpoint | Description | Response Schema |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/documents/{doc_id}/indexing-status` | Get indexing state, chunk count, error, and timestamp. | `IndexingStatusResponse` |
| `POST` | `/api/v1/documents/{doc_id}/retry-indexing` | Trigger re-indexing for a `READY` document whose indexing failed. | `IndexingStatusResponse` |
| `POST` | `/api/v1/documents/{doc_id}/index` | Alias for controlled indexing trigger. | `IndexingStatusResponse` |
| `GET` | `/api/v1/documents/{doc_id}/chunks` | List chunk metadata and content for project members. | `DocumentChunksListResponse` |

### Security & Privacy Protections:
- **IDOR / Cross-Workspace Isolation**: Attempting to access another user's document chunks or indexing status returns `HTTP 403 Forbidden` or `404 Not Found`.
- **Vector Obfuscation**: The public API returns chunk indices, text contents, and character counts, but does **not** send raw 384-dimensional floating point vectors over the wire.
- **Error Sanitization**: Upstream exception traces and internal connection strings are masked.

---

## 7. Frontend Integration

Enhanced `frontend/src/pages/DocumentLibrary.tsx`:
1. **Dual Status Badges**:
   - Extraction Badge: `Text Ready` (with character count), `Extracting...`, `Extraction Failed`.
   - Indexing Badge: `Indexed (N chunks)`, `Indexing...`, `Indexing Failed`, `Index Pending`.
2. **Contextual Recovery Actions**:
   - If extraction fails: `Retry Extraction` button.
   - If extraction succeeds but vector indexing fails: `Retry Indexing` button.
3. **Tabbed Content Modal**:
   - **Extracted Text Tab**: View plain text content, character counts, copy-to-clipboard.
   - **Vector Chunks Tab**: View each indexed chunk card showing chunk index (`Chunk #1`, `Chunk #2`), character count, and formatted text snippet.
4. **Automatic Polling**: Polling is active while any document is in `PROCESSING` or `indexing_status === 'PROCESSING'`.

---

## 8. Verification & Test Results

### 1. Automated Backend Tests (`app/tests/test_rag.py`)
- `test_chunking_empty_and_whitespace`: PASSED
- `test_chunking_short_text`: PASSED
- `test_chunking_paragraphs_and_overlap`: PASSED
- `test_chunking_very_long_document`: PASSED
- `test_mock_embedding_provider_deterministic`: PASSED
- `test_fastembed_provider_local`: PASSED (local ONNX model generated 384-dim vector in 5ms)
- `test_upload_and_auto_indexing_flow`: PASSED
- `test_idempotent_reindexing`: PASSED
- `test_embedding_provider_error_handling`: PASSED
- `test_cascade_delete_chunks_on_document_delete`: PASSED
- `test_cross_project_authorization`: PASSED

### 2. Full Platform Regression Suite
Ran `pytest app/tests/`:
- **72 tests passed** across Auth (Week 3), Workspaces (Week 4), Projects (Week 5), Tasks & Kanban (Week 6), Document Storage (Week 7), Document Extraction (Week 8), and Document Chunking & Embeddings (Week 9).
- **0 failures, 0 regressions**.

### 3. Frontend Production Build
Ran `npm run build` in `frontend/`:
- TypeScript compiler and Vite production build succeeded with exit code 0 in 382ms.

---

## 9. Environment Variables Configuration

In `backend/.env` (and documented in `backend/.env.example`):

```bash
# Chunking Configuration
CHUNK_SIZE=1000
CHUNK_OVERLAP=150

# Embedding Provider Configuration
# Options: "fastembed" (default, free local CPU ONNX), "openai", "mock"
EMBEDDING_PROVIDER=fastembed
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
EMBEDDING_DIMENSION=384

# Optional: If EMBEDDING_PROVIDER=openai
OPENAI_API_KEY=
OPENAI_BASE_URL=
```

---

## 10. Files Created & Modified

### Created:
- `backend/app/rag/__init__.py`
- `backend/app/rag/chunking.py`
- `backend/app/rag/models.py`
- `backend/app/rag/schemas.py`
- `backend/app/rag/service.py`
- `backend/app/rag/router.py`
- `backend/app/rag/embeddings/__init__.py`
- `backend/app/rag/embeddings/base.py`
- `backend/app/rag/embeddings/fastembed_provider.py`
- `backend/app/rag/embeddings/openai_provider.py`
- `backend/app/rag/embeddings/mock_provider.py`
- `backend/app/rag/embeddings/factory.py`
- `backend/app/tests/test_rag.py`
- `backend/alembic/versions/ffc8a44bb912_add_document_chunks_and_indexing_fields.py`
- `docs/WEEK9_CHUNKING_EMBEDDINGS_REVIEW.md`

### Modified:
- `backend/app/core/config.py`: Added chunking and embedding settings.
- `backend/app/documents/models.py`: Added indexing columns and relationship to `DocumentChunk`.
- `backend/app/documents/schemas.py`: Added indexing fields to `DocumentResponse` and `DocumentStatusResponse`.
- `backend/app/documents/service.py`: Chained auto-indexing upon successful extraction and reset on retry.
- `backend/app/main.py`: Mounted `rag_router` under `/api/v1`.
- `backend/requirements.txt`: Added `pgvector==0.5.1` and `fastembed==0.9.0`.
- `backend/.env.example`: Added chunking and embedding documentation.
- `frontend/src/services/documentService.ts`: Added indexing status, retry indexing, and chunk types/methods.
- `frontend/src/pages/DocumentLibrary.tsx`: Added dual extraction/indexing badges, failure recovery, and chunk viewer modal.
- `frontend/src/index.css`: Added styles for chunk items and modal tabs.
