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

### Week 10
Semantic Search & Document RAG:
- Vector similarity search (Cosine / L2 distance in pgvector)
- RAG question answering grounded in document chunks
- Context retrieval and citation linking

### Week 11
AI Task Generation & Summarization:
- Task generation and prioritization
- Meeting and document summarization
- Action-item extraction

### Week 12
AI Chat & Tool Calling:
- Natural language chat assistant
- Authorized tool calling (get_tasks, create_task, update_task)
- Conversation history and user confirmation flows

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