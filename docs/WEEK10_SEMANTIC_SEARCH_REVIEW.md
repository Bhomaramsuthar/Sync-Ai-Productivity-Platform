# Week 10 — Semantic Search & Document Retrieval Review

## 1. Overview

Week 10 implements **Semantic Search & Passage Retrieval** for the AI-Driven Collaboration & Productivity Platform, leveraging the text extraction, paragraph-aware chunking, and 384-dimensional vector embeddings established in Weeks 8 and 9.

Users can now query project documents using natural language questions or concept keywords. The system translates the query into a high-dimensional vector using the local `FastEmbed` engine, executes PostgreSQL vector similarity search via `pgvector` (`<=>` cosine distance operator), strictly enforces project boundaries, and returns the most relevant document passages with their source document metadata and relevance scores.

---

## 2. Architecture & Flow

```text
[User / Frontend]
       │
       ▼  POST /api/v1/projects/{project_id}/documents/search
[FastAPI Router & Service]
       │
       ├─► 1. Authenticate JWT & verify project/workspace membership
       ├─► 2. Validate query (non-empty, 1–1000 characters, limit 1–10)
       ├─► 3. Generate query vector using FastEmbed (BAAI/bge-small-en-v1.5, 384 dim)
       │
       ▼  SQL Query with pgvector <=> cosine distance
[Mumbai Supabase PostgreSQL]
       │
       ├─► Filters: document_chunks.project_id == project_id
       │            documents.status == 'READY'
       │            documents.indexing_status == 'READY'
       ├─► Order: document_chunks.embedding <=> query_vector ASC
       └─► Limit: applied directly in SQL (1–10)
       │
       ▼
[Ranked Passages & Source Metadata]
       │
       ▼  SemanticSearchResponse
[Frontend UI]
       └─► Displays relevance score, source document, chunk index, passage text
```

---

## 3. Vector Similarity Calculation & Score Interpretation

### Distance Operator
Retrieval uses PostgreSQL `pgvector`'s native cosine distance operator (`<=>`):
```sql
SELECT 
    c.id, 
    c.content, 
    d.filename, 
    (c.embedding <=> :query_vector) AS distance
FROM document_chunks c
JOIN documents d ON c.document_id = d.id
WHERE c.project_id = :project_id
  AND d.status = 'READY'
  AND d.indexing_status = 'READY'
ORDER BY distance ASC
LIMIT :limit;
```

### Mathematical Meaning
The cosine distance between two unit-normalized vectors $u$ and $v$ is:
$$\text{Cosine Distance} = 1 - \frac{u \cdot v}{\|u\| \|v\|}$$

- **Range**: `[0.0, 2.0]`
- **0.0**: Exactly identical semantic orientation.
- **1.0**: Orthogonal (unrelated / neutral).
- **2.0**: Diametrically opposite semantic meaning.

### Similarity Score
In the response payload:
- `distance`: The raw float distance value from PostgreSQL (`0.0` to `2.0`). Lower indicates higher similarity.
- `similarity_score`: A normalized relevance metric calculated as $\max(0.0, \min(1.0, 1.0 - \text{distance}))$.
- **Notice**: In accordance with specification, raw distance is **not** misrepresented as a probability or confidence percentage.

---

## 4. API Contract

### Endpoint
`POST /api/v1/projects/{project_id}/documents/search`

### Request Payload
```json
{
  "query": "What are the authentication and session management requirements?",
  "limit": 5,
  "max_distance": 0.45,
  "similarity_threshold": 0.55
}
```

### Validation & Threshold Rules
- `query`: String, required, 1 to 1000 characters. Empty or whitespace-only queries receive `HTTP 400 Bad Request` with code `EMPTY_QUERY`. Queries over 1000 characters receive `HTTP 400` with code `QUERY_TOO_LONG`.
- `limit`: Integer, optional, default `5`, constrained between `1` and `10`.
- `max_distance`: Float, optional, `0.0` to `2.0`. Passages with cosine distance > `max_distance` are excluded. Defaults to `settings.RAG_MAX_DISTANCE` (`0.45`).
- `similarity_threshold`: Float, optional, `0.0` to `1.0`. Overrides `max_distance` (`effective_max_distance = 1.0 - similarity_threshold`).

### Response Payload
```json
{
  "project_id": "68c20fe7-ebb4-43f8-9cac-c745d13e0384",
  "query": "What are the authentication and session management requirements?",
  "threshold": 0.45,
  "results_count": 2,
  "results": [
    {
      "chunk_id": "b34c562e-9d21-482a-a5f1-39e248b9f1d0",
      "document_id": "f476914c-d4b5-4260-bf5e-3235ea578b95",
      "document_filename": "platform_spec.txt",
      "chunk_index": 0,
      "content": "Authentication & Security. The platform utilizes JWT tokens signed with HMAC-SHA256 and bcrypt password hashing for session control.",
      "similarity_score": 0.8241,
      "distance": 0.1759,
      "relevance_tier": "strong",
      "char_count": 135,
      "created_at": "2026-10-11T20:45:10Z"
    }
  ]
}
```

---

## 5. Security & Authorization

- **Authentication Required**: Requires valid JWT Bearer header. Unauthenticated requests return `HTTP 401 Unauthorized`.
- **Project Boundary Enforcement**: Checked via `get_project_for_member(db, project_id, current_user.id)`. Non-members receive `HTTP 403 Forbidden`.
- **Cross-Project Isolation**: Vector queries explicitly filter by `document_chunks.project_id == project_id` and `documents.project_id == project_id`. Chunks from other workspaces or other projects are never accessible.
- **Exclusion of Incomplete Documents**: Chunks from documents whose status or indexing status is `PENDING`, `PROCESSING`, or `FAILED` are strictly omitted from search results.
- **Error Masking**: Internal database exceptions and model errors are masked into safe HTTP 500 error objects without exposing connection strings or tracebacks.

---

## 6. Relevance Calibration & False-Positive Elimination

### Empirical Boundary Analysis (BAAI/bge-small-en-v1.5)
Through empirical testing on representative documents and queries, dense embeddings produce distinct distance distributions:
1. **Relevant Queries** (Direct semantic match or paraphrasing): `distance` consistently $\le 0.35$ (similarity $\ge 0.65$).
2. **Relevant Keyword Queries**: `distance` between $0.35$ and $0.42$.
3. **Unrelated Queries** (e.g. *"Who invented the printing press?"* against website design, or out-of-domain queries like chocolate recipes): `distance` consistently $\ge 0.50$ to $0.70+$ (typically $\sim 0.60$).

### Configurable Filtering Strategy
- Setting `RAG_MAX_DISTANCE = 0.45` in server configuration cleanly excludes false positives on unrelated questions while retaining all relevant passages.
- In SQL: `.filter(DocumentChunk.embedding.cosine_distance(query_vector) <= effective_max_distance)` filters out non-relevant passages directly at the PostgreSQL layer.
- If no chunks pass the threshold, the API honestly returns an empty list (`results: []`, `results_count: 0`).
- **Qualitative Relevance Tiers**:
  - `strong`: $\text{distance} \le 0.25$ ($\sim 75\%-100\%$ proximity).
  - `moderate`: $\text{distance} \le 0.40$ ($\sim 60\%-74\%$ proximity).
  - `marginal`: $\text{distance} \le 0.45$ ($\sim 55\%-59\%$ proximity).

---

## 7. Frontend Integration

Enhanced [`frontend/src/pages/DocumentLibrary.tsx`](file:///s:/final-year-project/ai-productivity-platform/frontend/src/pages/DocumentLibrary.tsx):

1. **View Switcher Navigation**:
   - `Document Library (N)` tab: Manage, upload, preview, and delete project documents.
   - `Semantic Search` tab: Natural language query portal.
2. **Interactive Search Interface**:
   - Clean search bar with clear submit action, passage count selector (3, 5, or 10), and relevance sensitivity selector (Balanced $\le 0.45$, Strict $\le 0.35$, Permissive $\le 0.55$).
   - Real-time loading indicator ("Generating vector embedding and querying pgvector similarity...").
   - Clear button to dismiss search results.
3. **Passage Result Cards**:
   - Source document filename and icon.
   - Sequential chunk index (`Chunk #1`, `Chunk #2`).
   - Calibrated relevance badge (`Strong Match`, `Moderate Match`, `Marginal Match`) with tooltip documenting geometric proximity vs factual correctness.
   - Blockquote passage excerpt in readable monospace styling.
   - `View Context` action button that opens the document modal focused on vector chunks.
   - Card footer displaying exact raw cosine distance, applied threshold, and disclaimer.
4. **Honest Empty State**:
   - "No sufficiently relevant passages found. Try rephrasing your question or uploading relevant documents."
   - Transparently indicates that candidates in the project exceeded the distance threshold.

---

## 8. Verification & Test Results

### 1. Dedicated Search Tests (`app/tests/test_search.py`)
- `test_semantic_search_valid`: PASSED (Response contract validation)
- `test_semantic_search_empty_and_oversized_queries`: PASSED (Input validation)
- `test_semantic_search_limit_boundaries`: PASSED (Limit bounds)
- `test_semantic_search_no_matching_chunks`: PASSED (Empty project handling)
- `test_semantic_search_excludes_failed_and_unindexed_documents`: PASSED (Exclusion logic)
- `test_semantic_search_cross_project_and_unauthenticated_isolation`: PASSED (Security)
- `test_semantic_search_provider_failure_handling`: PASSED (Error resilience)
- `test_semantic_search_relevant_query_retrieves_matching_passage`: PASSED (Real FastEmbed retrieves relevant passages)
- `test_semantic_search_unrelated_query_returns_no_results`: PASSED (Real FastEmbed eliminates printing-press false positive)
- `test_semantic_search_mixed_relevance_excludes_irrelevant_chunks`: PASSED (Real FastEmbed isolates matching document and omits website document)
- `test_semantic_search_custom_threshold_override`: PASSED (Dynamic client threshold parameter verification)

### 2. Full Platform Test Suite
`pytest app/tests/ -v`:
- **83 passed out of 83 tests** (100% pass rate).

### 3. Frontend Production Build
`npm run build`:
- Exit Code: **0** (built in 372ms)
- Zero TypeScript diagnostics errors or bundle warnings.

---

## 9. Files Created & Modified

### Created:
- `backend/app/tests/test_search.py`
- `docs/WEEK10_SEMANTIC_SEARCH_REVIEW.md`

### Modified:
- `backend/app/core/config.py`: Added `RAG_MAX_DISTANCE = 0.45` setting.
- `backend/.env.example`: Added `RAG_MAX_DISTANCE=0.45`.
- `backend/app/core/database.py`: Added `pool_pre_ping=True` and `pool_recycle=300` for connection stability.
- `backend/app/rag/schemas.py`: Added `max_distance`, `similarity_threshold`, `relevance_tier`, and `threshold` fields.
- `backend/app/rag/service.py`: Implemented distance threshold filtering in PostgreSQL pgvector and SQLite fallback; added qualitative relevance tier mapping.
- `backend/app/rag/router.py`: Mounted `POST /projects/{project_id}/documents/search` and forwarded threshold parameters.
- `frontend/src/services/documentService.ts`: Added semantic search interfaces with threshold and tier parameters.
- `frontend/src/pages/DocumentLibrary.tsx`: Added threshold sensitivity controls, honest empty states, and calibrated match badges.
- `frontend/src/index.css`: Added styles for search result cards and passage blockquotes.
- `docs/API_SPEC.md`: Updated search endpoint request/response documentation.
- `docs/AI_SPEC.md`: Updated semantic search query specifications.
- `docs/DATABASE.md`: Documented cosine distance operator and indexing strategy.
- `docs/DEVELOPMENT_ROADMAP.md`: Marked Week 10 as Completed.

