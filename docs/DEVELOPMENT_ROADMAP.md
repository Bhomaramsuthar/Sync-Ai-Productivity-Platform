# Development Roadmap

## Phase 1 — Planning & Design

### Week 1
- Finalize requirements
- Finalize project scope
- Define MVP (FastAPI, React)
- Finalize technology stack

### Week 2
- UI wireframes
- Database schema
- API design
- System architecture
- Git repository setup

---

# Phase 2 — Foundation

### Week 3
Authentication:
- Registration
- Login
- Logout
- JWT
- Password hashing
- Role-based authorization

### Week 4
Workspaces:
- Create workspace
- Workspace members
- Roles
- Member management
- Workspace dashboard

---

# Phase 3 — Project Management

### Week 5
Projects:
- Create project
- Edit project
- Delete project
- Project dashboard

### Week 6
Tasks + Kanban:
- Create task
- Assign task
- Priority
- Deadline
- Status
- Kanban Board
- Drag and drop
- Comments

---

# Phase 4 — Scheduling & Documents

### Week 7
Calendar:
- Calendar view
- Task deadlines
- Scheduled events

### Week 8
Documents:
- Create/edit documents
- Markdown Editor
- Upload files
- Notifications for assignments

---

# Phase 5 — AI & RAG

### Week 8 (Completed)
Document Processing:
- Document upload and storage integration (Supabase Storage)
- Dedicated text extraction (PDF, TXT, MD, DOCX, CSV)
- Extraction status pipeline (UPLOADED, PROCESSING, READY, FAILED)
- Safe error handling, retries, and extracted text preview

### Week 9 (Completed)
Document Chunking & Embeddings:
- Paragraph- and line-aware text chunking (800-1000 chars, 150 chars overlap)
- Provider-neutral embedding interface (FastEmbed BAAI/bge-small-en-v1.5, OpenAI, Mock)
- Supabase PostgreSQL pgvector persistence (`vector(384)`, `document_chunks` table)
- Idempotent re-indexing, cascade cleanup, and background pipeline integration
- Indexing status API, chunk inspection, and frontend dual-status / retry UI

### Week 10 (Completed)
Semantic Search & Document Retrieval:
- Vector similarity search (Cosine distance operator `<=>` in pgvector)
- Distance threshold calibration (`RAG_MAX_DISTANCE = 0.45`)
- Passage retrieval, relevance scoring, and source document metadata

### Week 11 (Completed)
Conversational RAG with Source Grounding & Chat History:
- Persistent conversations and messages schema (`conversations`, `messages` with Alembic migration)
- Provider-neutral LLM interface (OpenAI, Groq, OpenRouter, Google AI Studio, Mock)
- Grounded prompt pipeline with untrusted document data defense & injection protection
- Bounded context construction and multi-turn conversation memory
- Zero-hallucination relevance thresholding with explicit insufficient-evidence responses
- Interactive Document Chat frontend UI with source citation inspector drawer

### Week 12 (Completed)
AI-Powered Project Productivity & Task Assistance:
- Project-scoped AI task assistant: title expansion to detailed descriptions & testable acceptance criteria, subtask decomposition proposals, priority suggestions with contextual reasoning, and blocker resolution / next actions
- Factual project progress summary: live database-grounded metrics (status, completion, overdue, velocity, milestones) distinguished from AI interpretations; zero LLM calls for empty projects
- Context-aware productivity insights: deterministic rules for overdue tasks, unassigned high-priority work, stagnant tasks, and approaching deadlines with direct task navigation links
- Safe UI workflows: non-intrusive modal review with inline editing, selection checkboxes, and batch creation before saving; zero automatic persistence or updates without explicit user confirmation
- Strict security & reliability: workspace authorization on all endpoints, cross-project data isolation, typed Pydantic validation, bounded prompt context, sanitized provider errors (503/504/429), and MockLLMProvider for deterministic automated testing

---

# Phase 6 — Deployment & Testing

### Week 13
Deployment:
- Vercel frontend deployment
- Render backend deployment
- Supabase configuration
- Environment variables

### Week 14
Testing:
- Functional testing
- API testing
- AI testing (Response quality, RAG, Hallucination)
- Security & Performance testing
- Final Project Ready+