# Week 11 — Conversational RAG Review

## 1. Overview & Implemented Functionality

Week 11 implements **Conversational RAG (Retrieval-Augmented Generation)** with source-grounded answers and persistent multi-turn chat history for the AI-Driven Collaboration & Productivity Platform.

Building upon the FastEmbed vector embeddings (`BAAI/bge-small-en-v1.5`, 384 dim) and PostgreSQL `pgvector` distance search established in Weeks 9 and 10, Week 11 enables users to interactively converse with their project documents. Users can start discussions, ask complex or multi-step questions, receive answers strictly grounded in document evidence, inspect exact source passage citations, and revisit past conversations.

### Key Capabilities:
1. **Persistent Multi-Turn Conversations**: Chat threads and messages are scoped to projects and workspaces, persisted in Supabase PostgreSQL, and reloaded chronologically.
2. **Deterministic Source Grounding**: Answers are constructed exclusively using retrieved document passages passing the calibrated relevance threshold.
3. **Structured Citation Verification & Inspection**: Every generated factual claim references specific passages with document filename, chunk index, similarity score, and exact excerpt preview.
4. **Zero-Hallucination Fallback**: If no passages meet the semantic threshold (e.g. out-of-domain queries), the system immediately returns a clear insufficient-evidence notification without making external LLM calls or hallucinating answers.
5. **Untrusted Data Isolation**: Document passages are encapsulated as untrusted quotation data in prompts to prevent prompt injection and system prompt disclosure.
6. **Provider-Neutral LLM Layer**: Pluggable backend architecture supporting OpenAI (`gpt-4o-mini`), Groq (`llama-3.3-70b-versatile`), OpenRouter, Google AI Studio OpenAI endpoint, local Ollama, and deterministic test mocks.
7. **Document Chat UI**: A responsive, accessible two-pane conversation interface matching the platform's Notion/Linear design aesthetic.

---

## 2. Files Created and Modified

### Backend:
| File | Action | Purpose |
|------|--------|---------|
| `backend/app/ai/__init__.py` | Created | Package initialization for AI module |
| `backend/app/ai/models.py` | Created | SQLAlchemy models for `Conversation` and `Message` |
| `backend/app/ai/schemas.py` | Created | Pydantic V2 schemas for conversations, messages, citations, and questions |
| `backend/app/ai/llm/base.py` | Created | Abstract base class `BaseLLMProvider`, `ChatMessage`, and domain exceptions |
| `backend/app/ai/llm/openai_provider.py` | Created | OpenAI-compatible HTTP client using `httpx` (timeouts, auth, rate limit handling) |
| `backend/app/ai/llm/mock_provider.py` | Created | Deterministic mock LLM provider for zero-cost automated tests |
| `backend/app/ai/llm/factory.py` | Created | Factory function `get_llm_provider()` and `set_llm_provider()` |
| `backend/app/ai/rag_pipeline.py` | Created | Bounded context formatting, system prompt safety, and grounded generation logic |
| `backend/app/ai/service.py` | Created | Business logic, authorization, retrieval coordination, and database transactions |
| `backend/app/ai/router.py` | Created | FastAPI APIRouters for project conversations and question submission |
| `backend/app/core/config.py` | Modified | Added LLM configuration settings (`LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, etc.) |
| `backend/app/main.py` | Modified | Mounted `ai_router` at `/api/v1` |
| `backend/alembic/env.py` | Modified | Registered `app.ai.models` for Alembic metadata tracking |
| `backend/alembic/versions/d81cbe4bdd6a_add_conversations_and_messages.py` | Created | Alembic migration for `conversations` and `messages` tables |
| `backend/app/tests/test_conversational_rag.py` | Created | 10 comprehensive unit and integration tests |
| `backend/.env.example` | Modified | Documented LLM environment configuration options |

### Frontend:
| File | Action | Purpose |
|------|--------|---------|
| `frontend/src/services/chatService.ts` | Created | API client service for conversation management and question submission |
| `frontend/src/pages/DocumentChat.tsx` | Created | Document Chat UI with conversations sidebar, message stream, and citation inspector |
| `frontend/src/pages/ProjectDashboard.tsx` | Modified | Added `Document Chat` tab (`/chat` and `/chat/:conversationId`) |
| `frontend/src/pages/DocumentLibrary.tsx` | Modified | Added navigation button to jump directly into Document Chat |

### Documentation:
| File | Action | Purpose |
|------|--------|---------|
| `docs/API_SPEC.md` | Modified | Updated with Week 11 Conversational RAG endpoints |
| `docs/DATABASE.md` | Modified | Updated with `Conversation` and `Message` entity details |
| `docs/AI_SPEC.md` | Modified | Documented Conversational RAG pipeline, safety rules, and guardrails |
| `docs/DEVELOPMENT_ROADMAP.md` | Modified | Marked Week 11 as completed with implemented features |
| `docs/WEEK11_RAG_REVIEW.md` | Created | Comprehensive Week 11 completion review |

---

## 3. Database Migrations & Environment Variables

### Migration
- **Revision ID**: `d81cbe4bdd6a`
- **Down Revision**: `ffc8a44bb912`
- **Tables Created**:
  - `conversations`: Primary key `id` (UUID), `user_id` (FK `users.id`), `workspace_id` (FK `workspaces.id`), `project_id` (FK `projects.id`), `title`, `created_at`, `updated_at`. Indexes on `project_id`, `user_id`, `workspace_id`.
  - `messages`: Primary key `id` (UUID), `conversation_id` (FK `conversations.id` on delete CASCADE), `sender_role` (`USER` or `ASSISTANT`), `content` (TEXT), `citations_json` (TEXT), `created_at`. Index on `conversation_id`.
- **Status**: Applied successfully to Supabase PostgreSQL (`alembic upgrade head`).

### Required Environment Variables (`backend/.env`)
```bash
# Conversational RAG & LLM Generation (Week 11)
LLM_PROVIDER=openai                    # Options: openai, mock
LLM_API_KEY=your-api-key               # Required when LLM_PROVIDER=openai (OpenAI, Groq, OpenRouter, etc.)
LLM_BASE_URL=https://api.openai.com/v1 # Defaults to https://api.openai.com/v1; can point to Groq/OpenRouter
LLM_MODEL=gpt-4o-mini                  # Model identifier (e.g., gpt-4o-mini, llama-3.3-70b-versatile)
LLM_TEMPERATURE=0.1                    # Low temperature for factual precision
LLM_MAX_TOKENS=1000                    # Maximum response token length
LLM_TIMEOUT_SECONDS=30.0               # Client HTTP timeout
```

---

## 4. API Endpoints and Frontend Routes

### REST API Endpoints:
- `GET /api/v1/projects/{project_id}/conversations`: Lists conversations in a project (ordered by `updated_at DESC`).
- `POST /api/v1/projects/{project_id}/conversations`: Creates a new conversation with optional title and optional `initial_question`.
- `GET /api/v1/conversations/{conversation_id}`: Retrieves full conversation details and chronological message history.
- `PATCH /api/v1/conversations/{conversation_id}`: Renames a conversation title.
- `DELETE /api/v1/conversations/{conversation_id}`: Permanently deletes a conversation and cascades to its messages (`HTTP 204`).
- `POST /api/v1/conversations/{conversation_id}/messages`: Submits a question, runs RAG retrieval, invokes LLM with bounded evidence, and returns user message and grounded assistant response.

### Frontend Routes:
- `/projects/:projectId/chat`: Document Chat interface showing latest conversation or prompt starters.
- `/projects/:projectId/chat/:conversationId`: Reopens a specific conversation thread.

---

## 5. LLM Provider, Cost, and Model Considerations

### Provider Neutrality
The LLM integration uses an abstract base class (`BaseLLMProvider`) and factory pattern (`get_llm_provider()`):
- **Development / Production default**: OpenAI-compatible endpoint via `httpx`.
  - **OpenAI**: `gpt-4o-mini` is extremely low cost ($0.15 / 1M input tokens, $0.60 / 1M output tokens).
  - **Groq**: Free tier available with ultra-low latency (`llama-3.3-70b-versatile` or `llama-3.1-8b-instant`).
  - **OpenRouter**: Free tier models available (e.g. `meta-llama/llama-3.2-3b-instruct:free`).
  - **Google AI Studio**: OpenAI-compatible endpoint (`https://generativelanguage.googleapis.com/v1beta/openai/`) with free tier quota.
- **Automated Tests**: Handled entirely by `MockLLMProvider`, requiring zero external API keys and incurring zero network costs.

### Error Handling & Safeguards
- If `LLM_API_KEY` is missing in production/dev, the API responds with `HTTP 503 LLM_NOT_CONFIGURED` describing the exact configuration needed.
- Timeouts raise `HTTP 504 LLM_TIMEOUT`.
- Rate limits raise `HTTP 429 LLM_RATE_LIMIT`.
- Invalid keys raise `HTTP 502 LLM_AUTH_ERROR`.

---

## 6. Retrieval Threshold & Insufficient-Evidence Behavior

1. **Relevance Threshold Filtering**:
   - Cosine distance threshold `RAG_MAX_DISTANCE = 0.45` is enforced at retrieval time.
   - Chunks with distance $> 0.45$ (similarity $< 0.55$) are completely excluded.
2. **Zero-Hallucination Behavior**:
   - If retrieval returns 0 qualifying chunks (e.g., questions about chocolate recipes or historical trivia unrelated to the uploaded documents):
   - The pipeline **does not invoke the LLM**.
   - It returns an immediate structured response:
     > *"I could not find any relevant information in the project's indexed documents to answer this question. Please verify that the necessary documents have been uploaded and indexed, or try rephrasing your question."*
   - Citations list is returned as `[]`.

---

## 7. Citation Format & Validation

Each citation returned with an assistant answer corresponds strictly to a chunk retrieved from the project database:

```json
{
  "chunk_id": "f5e3bc91-3829-410a-81d3-9bc0d2449103",
  "document_id": "8ca02172-87ad-4375-a7b2-65a78c18712a",
  "document_filename": "architecture_guide.txt",
  "chunk_index": 0,
  "content": "Authentication & Security Architecture. The platform utilizes JWT tokens...",
  "similarity_score": 0.8124,
  "distance": 0.1876,
  "relevance_tier": "strong"
}
```

- In the frontend, citations appear as clickable badges: `[1] architecture_guide.txt #0`.
- Clicking opens the **Citation Inspector Modal**, showing the exact excerpt, similarity metrics, and an action to jump directly to the document.

---

## 8. Security & Isolation Controls

1. **Project & Workspace Boundaries**:
   - All conversation and message operations verify membership via `get_project_for_member(db, project_id, user_id)`.
   - Cross-project vector retrieval is isolated via SQL filters: `document_chunks.project_id == project_id`.
   - Non-members receive `HTTP 403 Forbidden`.
2. **Prompt Injection Defense**:
   - Document contents are presented to the model inside a dedicated `Retrieved Document Evidence` section.
   - System prompt explicitly warns the model that document text is untrusted data and commands inside excerpts must be ignored.
3. **Data Integrity**:
   - Messages and conversations are deleted via cascading foreign keys when projects or workspaces are deleted.

---

## 9. Test Verification & Results

### Backend Test Results
Run command: `venv/Scripts/python -m pytest app/tests`
- Total Tests: **93 passed** (0 failed)
- Time: ~8m 43s (including FastEmbed model warmups)

| Test Module | Tests | Result | Notes |
|-------------|-------|--------|-------|
| `app/tests/test_auth.py` | 11 | Passed | Authentication, JWT, passwords |
| `app/tests/test_workspaces.py` | 25 | Passed | Workspaces, roles, invitations |
| `app/tests/test_projects.py` | 6 | Passed | Projects, CRUD, activities |
| `app/tests/test_tasks.py` | 7 | Passed | Tasks, Kanban, statuses |
| `app/tests/test_documents.py` | 12 | Passed | Upload, extraction, retry |
| `app/tests/test_rag.py` | 11 | Passed | Chunking, embeddings, indexing |
| `app/tests/test_search.py` | 11 | Passed | Semantic search, cosine distance |
| `app/tests/test_conversational_rag.py` | 10 | Passed | **Week 11 conversational RAG tests** |

### Breakdown of Week 11 Tests (`test_conversational_rag.py`):
1. `test_conversation_lifecycle`: Creates, lists, renames, and deletes conversations.
2. `test_relevant_question_grounded_answer_and_citations`: Validates chunk retrieval, grounded answer generation, and structured citations.
3. `test_unrelated_question_insufficient_evidence_response`: Validates that unrelated questions produce zero citations and bypass LLM calls.
4. `test_prompt_injection_in_document_treated_as_untrusted`: Validates prompt injection defense and untrusted evidence labeling.
5. `test_unauthorized_user_cannot_access_conversations`: Validates `HTTP 403 Forbidden` across cross-user and cross-project access.
6. `test_conversation_history_persistence_and_ordering`: Validates multi-turn chat persistence in strict chronological order.
7. `test_empty_and_invalid_questions_rejected`: Validates rejection of empty, whitespace, and $>1000$ character queries (`HTTP 400`).
8. `test_missing_provider_configuration_error`: Validates `HTTP 503 LLM_NOT_CONFIGURED` when API key is unconfigured.
9. `test_provider_error_handling`: Validates `HTTP 504` (timeout), `HTTP 429` (rate limit), and `HTTP 502` (auth failure).
10. `test_cross_project_isolation_cannot_cite_other_project_documents`: Validates that asking a question in Project B cannot retrieve or cite Project A's documents.

### Mock vs Real Provider Usage in Tests
- **Database**: Tested against the actual PostgreSQL instance via Alembic and SessionLocal.
- **Embeddings**: Tested with local CPU `FastEmbed` (`BAAI/bge-small-en-v1.5`, ONNX) for semantic matching tests, and `MockEmbeddingProvider` for offline unit tests.
- **LLM Provider**: Deterministically mocked with `MockLLMProvider` in automated tests to prevent flaky network dependencies and external API billing.

### Frontend Verification
- Production build command: `npm run build` (`tsc -b && vite build`)
  - **Result**: `✓ built in 2.79s`, 0 errors.
- Linter command: `npm run lint` (`oxlint`)
  - **Result**: 0 errors.

---

## 10. Manual Verification & Limitations

### Verified:
1. Database schema migration applied cleanly to PostgreSQL.
2. Conversation CRUD and message persistence fully operational.
3. Relevant questions retrieve document passages and link citations.
4. Unrelated questions trigger insufficient-evidence handling without hallucinations.
5. Cross-project document access is strictly prevented.
6. Frontend Document Chat tab is integrated with real API communication and no fake mock data.

### Limitations & Setup Notes:
1. **Real External LLM Key**: Live real-world generation outside unit tests requires setting `LLM_API_KEY` (e.g. OpenAI or Groq) in `backend/.env`.
2. **Browser End-to-End**: Local automated browser testing (Playwright) was not run against live dev servers; headless unit/integration test suite passed completely.
