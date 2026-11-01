# Sync AI — AI-Driven Collaboration & Productivity Platform

**A full-stack, AI-powered workspace unifying multi-tenant project management, interactive Kanban workflows, real-time video meetings with speech transcription, document knowledge indexing via FastEmbed ONNX, conversational RAG with verified inline citations, an omnipresent Global AI Assistant, and bidirectional WebSocket synchronization.**

[![Frontend Deployed](https://img.shields.io/badge/Frontend-Vercel-black?logo=vercel)](https://sync-ai-productivity-platform.vercel.app)
[![Backend Status](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render&logoColor=black)](https://render.com)
[![Database](https://img.shields.io/badge/Database-Supabase%20PostgreSQL%20%2B%20pgvector-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Python](https://img.shields.io/badge/Python-3.10.14-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tests](https://img.shields.io/badge/Tests-224%20Passing-brightgreen?logo=pytest)](docs/PRODUCTION_RELEASE_AUDIT.md)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Live Demo](https://sync-ai-productivity-platform.vercel.app) · [GitHub Repository](https://github.com/Bhomaramsuthar/Sync-Ai-Productivity-Platform) · [Production Release Audit](docs/PRODUCTION_RELEASE_AUDIT.md)

---

## Visual Showcase

### Team Workspaces & Platform Dashboard
Centralized dashboard for multi-tenant workspace management, capacity tracking, team invitations, and quick navigation.
![Workspace Dashboard](docs/screenshots/dashboard.png)

### Project Kanban Board & Workflow Tracking
Interactive Kanban board with real-time status transitions, priority badges, deadline tracking, and AI-assisted task breakdowns.
![Project Kanban Board](docs/screenshots/kanban.png)

### Real-Time Video Meetings Hub
Integrated video conferencing hub for scheduling, launching, and managing WebRTC team meetings with automatic speech transcription.
![Meetings Dashboard](docs/screenshots/meetings.png)

### Conversational RAG with Grounded Citations
Multi-turn document chat strictly grounded in indexed project documents, complete with transparent source attribution and chunk citations.
![Document Chat](docs/screenshots/document-chat.png)

> **Additional screenshots available:** [Project Calendar View](docs/screenshots/calendar.png), [Document Knowledge Library](docs/screenshots/documents.png), [LiveKit Video Room](docs/screenshots/meeting-room.png), and [AI Meeting Intelligence Results](docs/screenshots/meeting-results.png).

---

## Table of Contents

- [Introduction](#introduction)
- [System Architecture](#system-architecture)
- [Technology Stack](#technology-stack)
- [Key Features](#key-features)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [1. Clone the Repository](#1-clone-the-repository)
  - [2. Database Setup](#2-database-setup)
  - [3. Backend Setup](#3-backend-setup)
  - [4. Frontend Setup](#4-frontend-setup)
  - [5. Run Tests & Validation](#5-run-tests--validation)
- [Database Migrations (Alembic)](#database-migrations-alembic)
- [Production Deployment](#production-deployment)
- [Security & Data Isolation](#security--data-isolation)
- [Production Release Audit](#production-release-audit)
- [What I Learned](#what-i-learned)
- [Future Roadmap](#future-roadmap)
- [License](#license)

---

## Introduction

Modern product teams frequently grapple with fragmented platforms: project tracking in one tool, documentation in another, video calls on a third, and team notes scattered across individual drives. Crucial context is lost, meeting decisions fade, and developers lose momentum searching for accurate project documentation.

**Sync AI** unifies these critical workflows into a single, cohesive operating system:
- **Multi-Tenant Workspaces & Governance:** Manage teams with role hierarchy (`OWNER`, `ADMIN`, `MEMBER`), seat capacity governance (default 50), and multi-channel invitation flows (token links, 6-digit codes, email invitations, dynamic QR codes, and approval gates).
- **Interactive Kanban Boards & Roadmaps:** Organize work with intuitive drag-and-drop progression columns, task priorities, and synchronized calendar agendas.
- **Intelligent Knowledge Retrieval:** Upload PDFs, DOCX, Markdown, and text files to automatically generate 384-dimensional FastEmbed vector embeddings stored in Supabase `pgvector`.
- **Conversational Document RAG:** Chat directly with project knowledge bases using Groq Cloud / OpenAI LLMs with transparent, verified inline source citations.
- **Global AI Assistant:** An omnipresent productivity copilot inspired by Notion AI, assisting across global account, workspace, and project scopes with evidence grounding.
- **Real-Time Video Conferencing:** In-browser WebRTC video meetings powered by LiveKit Cloud.
- **Automated Speech Transcription:** Asynchronous audio ingestion into Groq Whisper (`whisper-large-v3-turbo`) with an exponential backoff retry queue resilient to free-tier rate limits.
- **Human-in-the-Loop Action Item Approval:** Automatically extract meeting summaries, key decisions, actionable tasks, and calendar events—allowing users to review and approve them before they touch project boards.
- **Bidirectional WebSocket Sync:** High-performance, workspace-isolated real-time synchronization delivering immediate UI updates across collaborating team members.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React 19 + TypeScript + Vite 8)"]
        UI[Workspace & Project Dashboard]
        KB[Kanban Board & Calendar]
        DC[Document Chat with Citations]
        GA[Global AI Assistant Modal]
        MR[LiveKit WebRTC Video Room]
        AU[Microphone Audio Recorder (30s Batches)]
        WS[WebSocket Real-Time Listener]
    end

    subgraph Backend["Backend API (FastAPI + SQLAlchemy 2.0 + Psycopg 3)"]
        AUTH[JWT Auth, RBAC & Passlib]
        WAPI[Workspaces, Capacity & Invitations]
        TAPI[Tasks & Calendar Router]
        DAPI[Document Ingestion & Text Parser]
        RAG[Conversational RAG Engine]
        GAS[Global AI Assistant Engine]
        MAI[Meeting Intelligence Extractor]
        TQ[Resilient Transcription Queue]
        WCM[Workspace Connection Manager]
    end

    subgraph StorageServices["Database & Object Storage (Supabase)"]
        PG[(PostgreSQL Database)]
        VEC[(pgvector 384-d Cosine Index)]
        S3[(Supabase Storage: Documents & Avatars)]
    end

    subgraph AICloud["External AI & Real-Time Services"]
        FE[FastEmbed ONNX Runtime (bge-small-en-v1.5)]
        GROQ[Groq Cloud LLM (openai/gpt-oss-120b)]
        STT[Groq Whisper (whisper-large-v3-turbo)]
        LK[LiveKit Cloud WebRTC SFU]
    end

    UI --> AUTH
    KB --> TAPI
    DC --> RAG
    GA --> GAS
    MR <--> LK
    AU --> TQ
    WS <--> WCM

    AUTH --> WAPI
    WAPI --> PG
    WAPI --> WCM
    TAPI --> PG
    TAPI --> WCM
    DAPI --> S3
    DAPI --> FE
    FE --> VEC
    RAG --> VEC
    RAG --> GROQ
    GAS --> PG
    GAS --> VEC
    GAS --> GROQ
    TQ --> STT
    STT --> MAI
    MAI --> GROQ
    MAI --> TAPI
```

### Architectural Highlights
- **Decoupled Architecture:** React 19 Single Page Application (SPA) deployed on Vercel Global Edge CDN communicates over authenticated REST APIs and WebSockets with a FastAPI backend hosted on Render.
- **High-Performance Persistence:** PostgreSQL with `pgvector` extension hosted in Mumbai (`ap-south-1`) accessed via Supavisor IPv4 connection pooling using psycopg 3.
- **Zero-Cost Vector Search:** Local ONNX runtime FastEmbed (`BAAI/bge-small-en-v1.5`) generates deterministic 384-dimensional embeddings directly inside the backend process, eliminating external embedding API latency and costs.
- **Bidirectional WebSocket Sync:** Per-workspace isolated connection streams with automatic 25s keepalive pings and client-side exponential backoff reconnection.
- **Fault-Tolerant Audio Ingestion:** Browser-side MediaRecorder splits meeting audio into 30-second batches streamed to a backend queue with exponential backoff and rate-limit retry logic before transcribing via Groq Whisper.

---

## Technology Stack

| Layer | Technology | Details / Model |
|---|---|---|
| **Frontend Framework** | React 19, TypeScript, Vite 8 | Single Page Application with client-side routing (`react-router-dom` v7) |
| **Icons & UI System** | Lucide React, Radix UI, Tailwind Merge, CSS Variables | Curated dark/light theme design system, kinetic text reveals, hold-to-delete buttons |
| **Real-Time Video** | LiveKit Client SDK | WebRTC video conferencing rooms, media track subscription, and participant grid |
| **Real-Time WebSockets** | Native WebSockets + Sileo Toasts | Workspace-scoped event stream with automatic state reconciliation on reconnect |
| **Backend Framework** | Python 3.10.14, FastAPI | High-performance asynchronous REST API with structured Pydantic v2 schemas |
| **ORM & Migrations** | SQLAlchemy 2.0, Alembic | Async/sync PostgreSQL database operations with psycopg 3 driver (12 linear revisions) |
| **Database & Vector Store** | Supabase PostgreSQL + `pgvector` | Relational storage with native 384-dimensional cosine vector indexing |
| **Document Storage** | Supabase Storage | S3-compatible storage with private document buckets and public avatars |
| **Vector Embeddings** | FastEmbed (FastEmbed-Python) | `BAAI/bge-small-en-v1.5` local ONNX embedding engine (384 dimensions) |
| **Conversational LLM** | Groq Cloud API / OpenAI API | `openai/gpt-oss-120b` (primary) / `gpt-4o-mini` with strict factual temperature (0.1) |
| **Speech-to-Text** | Groq Whisper | `whisper-large-v3-turbo` with asynchronous batching and resilient retry queue |
| **Document Parsers** | PyPDF, python-docx | Multi-format text extraction for PDF, Microsoft Word DOCX, and plain text files |
| **Hosting & Cloud** | Vercel (Frontend), Render (Backend) | Vercel Hobby CDN, Render Free Web Service (Singapore), Supabase (Mumbai) |
| **Testing & Quality** | Pytest (195 tests), Vitest (29 tests), Oxlint | 224 total automated tests covering auth, RAG, meetings, invitations, and data isolation |

---

## Key Features

### 1. Multi-Tenant Workspace Governance & Capacity Limits
- **Isolated Workspaces:** Strict tenant boundary checks across workspaces, projects, tasks, documents, and meetings.
- **Capacity Management:** Seat allocation policies (default 50 seats) with live capacity meters and saturation alerts.
- **Multi-Channel Invitations:**
  - Cryptographically secure 64-character token invite links (SHA-256 hashed in database).
  - Unique 6-character alphanumeric join codes (`xxx-yyy`) with collision prevention.
  - Direct email invitations with recipient validation.
  - Dynamic QR codes for quick mobile and desktop joining.
- **Join Request Approval Gates:** Admins review pending join requests with optional custom messages and rejection reasons.

### 2. Global AI Assistant (Omnipresent Productivity Copilot)
- **Multi-Scope Context Awareness:** Operates across Global Account scope, Workspace scope, or Project scope.
- **Safe Database Inspections:** Real-time visibility into assigned tasks, active roadmaps, and document citations without modifying data.
- **Strict Evidence Grounding:** AI refusal behavior when context is insufficient; prompt-injection delimiters isolate untrusted user data.

### 3. Bidirectional Real-Time WebSocket Synchronization
- **Workspace-Scoped Streams:** `/api/v1/workspaces/{id}/ws` stream broadcasts task status transitions, board moves, and member updates in real time.
- **Cross-Tenant Isolation:** Events in Workspace A are never leaked to Workspace B clients.
- **Automatic Heartbeat & Reconnection:** 25-second keepalive pings with client-side exponential backoff jitter (1s to 10s).
- **Revocation Auto-Close:** When a member is removed from a workspace, all active WebSockets are terminated immediately (close code 1008).

### 4. Interactive Kanban Boards & Calendar Agendas
- **Visual Kanban Board:** Drag-and-drop progression columns (`TODO`, `IN_PROGRESS`, `DONE`).
- **Rich Task Metadata:** Priority badges (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), assignees, deadlines, and descriptions.
- **Synchronized Calendar:** Month-by-month visualization coordinating task deadlines and scheduled team meetings.

### 5. Document Knowledge Base & FastEmbed Semantic Search
- **Multi-Format Ingestion:** Direct uploads of `.pdf`, `.docx`, `.txt`, `.md`, and `.csv` files up to 10 MB.
- **Intelligent Chunking:** 1000-character chunks with 150-character overlaps to preserve cross-sentence context.
- **Vector Search:** Cosine similarity querying over pgvector with a calibrated relevance threshold (`RAG_MAX_DISTANCE <= 0.45`).

### 6. Conversational RAG with Verified Inline Citations
- **Document Chat:** Multi-turn conversational interface with chat session history persistence.
- **Evidence-Grounded Answers:** Responses strictly synthesized from retrieved document chunks with zero hallucination.
- **Inline Citations:** Transparent citation tags linking answers directly to specific document chunks, filenames, and snippets.

### 7. Real-Time Video Conferencing (LiveKit)
- **WebRTC Rooms:** Directly join video meetings from the project dashboard with low-latency WebRTC streaming.
- **Media Controls:** In-room camera and microphone toggling, participant state monitoring, and connection health indicators.

### 8. Resilient Speech-to-Text Pipeline (Groq Whisper)
- **Audio Batching:** Browser captures audio in 30-second segments to handle extended meetings without memory exhaustion.
- **Free-Tier Resilient Queue:** Background worker queue featuring exponential backoff, concurrency controls, and retry logic to avoid rate limits on Groq Cloud.
- **Chronological Transcripts:** Automatic assembly of meeting transcripts with millisecond-accurate timestamps and speaker metadata.

### 9. AI Meeting Intelligence & Human-in-the-Loop Review
- **Automatic Synthesis:** Generates executive meeting summaries, key discussion points, and agreed-upon decisions.
- **Action Item Extraction:** Detects commitments made during the call and constructs suggested project tasks and calendar events.
- **Suggestion Review Cards:** Users review AI proposals and approve, edit, or reject each item before committing to Kanban or Calendar.

### 10. User Profile & Preferences
- **Avatar Upload:** Direct photo upload to Supabase Storage `avatars` bucket with base64 data-URI fallback.
- **Theme Selection:** Seamless switching between `Dark`, `Light`, and `System` appearance themes with CSS variable transitions.
- **Notification Controls:** Granular preference toggles for email digests, task updates, meeting reminders, and AI suggestions.

---

## How It Works

```
1. Create Workspace & Set Capacity
   └── Define seat limits (e.g. 50) and invite members via link, 6-digit code, email, or QR code.

2. Manage Projects, Tasks & Real-Time Sync
   └── Move tasks across Kanban board -> Instant WebSocket broadcast updates all active team windows.

3. Upload Project Knowledge Base
   └── Upload PDFs/DOCXs -> Extracted text -> Chunked & Embedded via FastEmbed -> Saved in Supabase pgvector.

4. Ask Questions via Conversational RAG or Global AI Assistant
   └── Enter query -> Cosine similarity search -> Context injected into LLM -> Verified response with citations.

5. Host Video Meeting & Stream Audio
   └── Connect via LiveKit WebRTC -> Audio recorded in 30-second batches -> Resilient transcription queue.

6. Extract Meeting Intelligence & Review Action Items
   └── Groq Whisper outputs transcript -> LLM extracts summary, action items & follow-ups -> Human-in-the-loop review.
```

---

## Getting Started

### Prerequisites

Ensure the following tools are installed on your machine:
- **Node.js** (v18.x or v20.x) and **npm**
- **Python** 3.10.x (recommended: 3.10.14)
- **Git**
- *(Optional)* **Docker & Docker Compose** (for running PostgreSQL + pgvector locally)

---

### 1. Clone the Repository

```bash
git clone https://github.com/Bhomaramsuthar/Sync-Ai-Productivity-Platform.git
cd Sync-Ai-Productivity-Platform
```

---

### 2. Database Setup

You can run PostgreSQL locally using Docker or use a hosted Supabase project:

#### Option A: Local PostgreSQL with pgvector (via Docker)
```bash
docker compose up -d
```
*Starts local PostgreSQL with `pgvector` on port `5432` (`aiproductivity`, user: `postgres`, password: `password`).*

#### Option B: Hosted Supabase PostgreSQL
1. Create a free project at [supabase.com](https://supabase.com).
2. Enable the `vector` extension in **SQL Editor**:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Create two storage buckets in **Storage**:
   - `project_documents` (Private)
   - `avatars` (Public)
4. Obtain your connection string from **Project Settings > Database > Connection string > URI** (use the session connection pooler mode on port `5432` for IPv4 compatibility).

---

### 3. Backend Setup

```bash
cd backend
python -m venv venv
```

**Activate the virtual environment:**
- **Windows (PowerShell):**
  ```powershell
  .\venv\Scripts\Activate.ps1
  ```
- **macOS / Linux:**
  ```bash
  source venv/bin/activate
  ```

**Install dependencies:**
```bash
pip install -r requirements.txt
```

**Configure Environment Variables:**
Copy the example environment file and configure your credentials:
```bash
cp .env.example .env
```

Key environment variables in `backend/.env`:
```env
# Database (Supabase Pooler or Local Docker)
DATABASE_URL=postgresql+psycopg://postgres:password@localhost:5432/aiproductivity

# Security
JWT_SECRET=generate_a_secure_random_32_character_secret_here
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
ENVIRONMENT=development

# Supabase Storage & Client
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-role-key

# Embeddings & Vector Search (FastEmbed runs locally via ONNX)
EMBEDDING_PROVIDER=fastembed
EMBEDDING_MODEL=BAAI/bge-small-en-v1.5
EMBEDDING_DIMENSION=384
RAG_MAX_DISTANCE=0.45

# LLM Provider (Groq or OpenAI)
LLM_PROVIDER=groq
GROQ_API_KEY=gsk_your_groq_api_key_here
LLM_MODEL=openai/gpt-oss-120b

# LiveKit WebRTC Meetings
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret

# Groq Whisper Speech-to-Text
GROQ_WHISPER_MODEL=whisper-large-v3-turbo
```

**Apply Database Migrations:**
```bash
alembic upgrade head
```

**Start the Backend Development Server:**
```bash
uvicorn app.main:app --reload
```
- API Base URL: `http://127.0.0.1:8000`
- Interactive OpenAPI Docs: `http://127.0.0.1:8000/docs`
- Health Check: `http://127.0.0.1:8000/health`

---

### 4. Frontend Setup

Open a new terminal window:
```bash
cd frontend
npm install
```

**Configure Environment Variables:**
Create `frontend/.env` based on `frontend/.env.example`:
```env
VITE_API_URL=http://127.0.0.1:8000/api/v1
```

**Start the Frontend Development Server:**
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

---

### 5. Run Tests & Validation

**Run Backend Test Suite:**
From the `backend` directory (with virtualenv activated):
```bash
pytest
```
*Executes all **195 backend tests** covering authentication, workspace governance, invitations, task workflows, document chunking, semantic vector search, conversational RAG, global assistant, real-time sync, and meeting pipelines.*

**Run Frontend Test Suite:**
From the `frontend` directory:
```bash
npm test
```
*Executes all **29 frontend tests** in Vitest covering capacity governance, kinetic text reveal, hold-to-delete safety buttons, and animated assistant indicators.*

**Run Frontend Production Build:**
```bash
npm run build
```

**Run Frontend Linter:**
```bash
npm run lint
```

---

## Database Migrations (Alembic)

The platform utilizes a strictly linear Alembic migration graph (12 revisions up to single head `f1a2b3c4d5e6`):

```
6c76583a143e  Initial migration (users table)
  └── 7c929c989c81  Add workspaces and workspace_members
        └── 45d335a17685  Add projects and tasks
              └── 80a61b4400fe  Add project activity logs
                    └── 27b6a0898dfc  Add documents table
                          └── e9d252609d2f  Add document text extraction fields
                                └── ffc8a44bb912  Add document chunks and pgvector
                                      └── d81cbe4bdd6a  Add conversations and messages
                                            └── a1b2c3d4e5f6  Add meetings and calendar events
                                                  └── c3d4e5f6a7b8  Add user preferences and avatar URL
                                                        └── e4f5a6b7c8d9  Add conversation scope & nullable IDs
                                                              └── f1a2b3c4d5e6 (HEAD)  Add workspace capacity, invitations & notifications
```

To apply migrations safely to your database:
```bash
cd backend
alembic upgrade head
```

---

## Production Deployment

| Component | Platform | Configuration Details |
|---|---|---|
| **Frontend** | **Vercel** | SPA rewrites configured via `frontend/vercel.json`. Set `VITE_API_URL` to the live Render backend URL (`https://<service>.onrender.com/api/v1`). |
| **Backend API** | **Render** | Python 3.10.14 web service configured via `render.yaml`. Build command: `pip install -r requirements.txt && alembic upgrade head`. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Health check path: `/health`. |
| **Database & Vector Index** | **Supabase** | PostgreSQL with `pgvector` hosted in Mumbai (`ap-south-1`). Connect via Supavisor pooler (`aws-0-ap-south-1.pooler.supabase.com:5432`) for IPv4 cloud compatibility. |
| **Document & Avatar Storage** | **Supabase Storage** | Private bucket `project_documents` (with signed download URLs) and public bucket `avatars`. |
| **Video Conferencing** | **LiveKit Cloud** | WebRTC SFU providing low-latency video rooms and participant token issuance. |
| **AI Language & Speech** | **Groq Cloud** | High-throughput `openai/gpt-oss-120b` for RAG and `whisper-large-v3-turbo` for meeting transcription. |

---

## Security & Data Isolation

1. **Workspace Multi-Tenancy:** Every request to workspaces, projects, tasks, documents, and meetings enforces strict tenant boundary checks (`get_project_for_member`). Unauthorized access returns `HTTP 403 Forbidden` or `HTTP 404 Not Found`.
2. **Stateless JWT Authentication:** Access tokens are cryptographically signed using `HS256` with password hashing handled by `bcrypt` (rounds=12).
3. **Private File Storage:** Uploaded files are stored in a private Supabase Storage bucket with zero anonymous access. Downloads are authorized via time-limited signed URLs.
4. **Server-Side Exception Sanitization:** `SafeServerErrorMiddleware` intercepts unhandled exceptions to prevent stack traces, database schemas, or credentials from leaking to clients while preserving proper CORS headers.
5. **Untrusted Data Delimiters:** Database contents, documents, and transcripts injected into LLM prompts are isolated inside untrusted data tags to defend against prompt injection attacks.
6. **Human-in-the-Loop Governance:** AI models suggest actions; they never automatically write tasks or schedule events without explicit user confirmation.

---

## Production Release Audit

A comprehensive pre-release production audit is maintained in the repository:
- **Full Audit Report:** [`docs/PRODUCTION_RELEASE_AUDIT.md`](docs/PRODUCTION_RELEASE_AUDIT.md)
- Contains detailed classification of blockers, warnings, required cloud environment variables, pending database migration instructions, manual verification smoke tests, and rollback procedures.

---

## What I Learned

- Designing and deploying a decoupled, production-ready full-stack application with React 19 and FastAPI.
- Implementing vector search using `pgvector` combined with local ONNX-based embedding generation (`FastEmbed`) to eliminate external API costs.
- Engineering conversational RAG with semantic threshold boundaries and accurate multi-source citation linking.
- Building bidirectional WebSocket synchronization with multi-tenant isolation, keepalive heartbeats, and instant revocation enforcement.
- Integrating real-time WebRTC conferencing via LiveKit Cloud alongside resilient audio transcription queues handling Groq Whisper free-tier rate limits.
- Architecting cost-effective deployments combining Vercel, Render Free Web Services, and Supabase.

---

## Future Roadmap

- [ ] Add browser notification alerts for meeting starts and upcoming task deadlines.
- [ ] Support collaborative real-time document editing alongside document chat.
- [ ] Add advanced meeting transcription speaker diarization.
- [ ] Introduce export features for meeting minutes (Markdown, PDF).
- [ ] Expand analytics with project velocity charts and team burndown metrics.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
