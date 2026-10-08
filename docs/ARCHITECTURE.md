# System Architecture

## 1. Architecture Overview

The application will use a simplified, monolithic full-stack architecture optimized for development speed and free deployment, consisting of:

- React + TypeScript + Vite frontend
- FastAPI backend (Single service)
- PostgreSQL database (Supabase)
- pgvector for RAG (Supabase)
- Supabase Storage for documents
- Docker for local development only
- Vercel & Render for cloud deployment

---

## 2. High-Level Architecture

```text
React Frontend (Vercel)
        ↓
REST API
        ↓
FastAPI Backend (Render)
        ↓
SQLAlchemy
        ↓
PostgreSQL / Supabase (pgvector, Storage)
```
---
## 3. Frontend

The frontend will contain:

- Authentication pages
- Workspace dashboard
- Project dashboard
- Task management
- Kanban board
- Calendar
- Documents
- Notifications
- AI assistant
- Settings

Frontend responsibilities:

- User interface
- Client-side state management
- API communication
- Authentication state
- Form validation
- Responsive design

The frontend must not contain business-critical authorization logic.

---

## 4. FastAPI Backend

The backend is a single modular monolithic service responsible for:

- Authentication (JWT)
- Authorization
- Users, Workspaces, Projects, Tasks
- Comments, Documents metadata
- Calendar events, Notifications
- AI tool APIs, RAG, and LLM integrations

Module structure:

```text
backend/
├── app/
│   ├── auth/
│   ├── users/
│   ├── workspaces/
│   ├── projects/
│   ├── tasks/
│   ├── documents/
│   ├── calendar/
│   ├── comments/
│   ├── notifications/
│   ├── ai/
│   ├── rag/
│   ├── common/
│   └── config/
├── main.py
├── requirements.txt
└── alembic/
```

Each module should contain:

```text
router.py
service.py
models.py
schemas.py
```

## 5. AI Service (Integrated)

The AI service is integrated directly into the FastAPI backend within the `ai/` and `rag/` modules. No separate microservices are used.

Responsibilities:

- LLM communication
- Prompt management
- AI response generation
- Summarization
- Task extraction
- RAG pipeline (chunking, embeddings, semantic search)
- AI tool orchestration

The AI logic accesses application data via the internal backend services (e.g., calling `tasks.service.create_task`), strictly enforcing business logic and authorization.

---

## 6. Authentication Flow

```text
User
 |
 v
React Login
 |
 v
FastAPI Backend
 |
 v
Validate credentials
 |
 v
Generate JWT
 |
 v
React stores authentication state
 |
 v
JWT sent with protected API requests
 |
 v
FastAPI validates token
```

---

## 7. AI Tool Calling Flow

```text
User
 ↓
FastAPI
 ↓
AI
 ↓
Tool selection
 ↓
Tool authorization
 ↓
Application service
 ↓
Database
```

The AI must never bypass backend authorization.

---

## 8. RAG Architecture

```text
Document
 ↓
Text extraction
 ↓
Chunking
 ↓
Embedding
 ↓
pgvector
 ↓
Semantic retrieval
 ↓
LLM
 ↓
Answer
```

---

## 9. Deployment Architecture

```text
      Frontend (Vercel)
             |
       Backend (Render Free Tier)
             |
      Database & Storage (Supabase)
```

Docker containers will be used strictly for local development environments (`docker-compose.yml`).

---

## 10. Architecture Principles

- Separation of concerns
- Modular feature-based design
- Secure API boundaries
- Database persistence
- Stateless authentication
- Centralized exception handling
- Controlled AI actions
- No direct AI database access bypassing services
- Optimize for lowest complexity and free deployment