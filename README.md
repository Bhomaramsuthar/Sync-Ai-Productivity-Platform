# Sync AI — AI-Driven Collaboration & Productivity Platform

**A full-stack, AI-powered workspace unifying project management, interactive Kanban workflows, real-time video meetings with speech transcription, document knowledge indexing via FastEmbed ONNX, and conversational RAG with verified inline citations.**

[![Frontend Deployed](https://img.shields.io/badge/Frontend-Vercel-black?logo=vercel)](https://sync-ai-productivity-platform.vercel.app)
[![Backend Status](https://img.shields.io/badge/Backend-Render-46E3B7?logo=render&logoColor=black)](https://render.com)
[![Database](https://img.shields.io/badge/Database-Supabase%20PostgreSQL%20%2B%20pgvector-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Python](https://img.shields.io/badge/Python-3.10.14-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.109+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.3-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Live Demo](https://sync-ai-productivity-platform.vercel.app) · [GitHub Repository](https://github.com/Bhomaramsuthar/Sync-Ai-Productivity-Platform) · [API Documentation (Live /docs)](https://sync-ai-productivity-platform.vercel.app)

---

## Visual Showcase

### Team Workspaces & Platform Dashboard
Centralized dashboard for multi-tenant workspace management, project roadmaps, team activity, and quick navigation.
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
- [Production Deployment](#production-deployment)
- [Security & Data Isolation](#security--data-isolation)
- [What I Learned](#what-i-learned)
- [Future Roadmap](#future-roadmap)
- [License](#license)

---

## Introduction

Modern development teams frequently juggle project management, document storage, video calls, and notes across fragmented, disconnected platforms. Important decisions get buried in meeting recordings, action items slip through the cracks, and team members waste hours searching for project context.

**Sync AI** unifies these critical workflows into a single, cohesive operating system:
- **Centralized Workspaces & Projects:** Manage multiple teams, members, and project roadmaps with fine-grained access control.
- **Visual Task Progression:** Organize work with intuitive Kanban boards and synchronized calendar views.
- **Intelligent Knowledge Retrieval:** Upload PDFs, DOCX, or text files to automatically generate 384-dimensional FastEmbed vector embeddings stored in Supabase `pgvector`.
- **Conversational Document RAG:** Chat directly with your project documentation using Groq Cloud / OpenAI LLMs with transparent inline source citations.
- **Real-Time Video Conferencing:** Host in-browser WebRTC meetings powered by LiveKit Cloud without leaving your workspace.
- **Automated Speech Transcription:** Continuously ingest audio into Groq Whisper (`whisper-large-v3-turbo`) through an asynchronous, rate-limit resilient retry queue.
- **Human-in-the-Loop AI Action Items:** Automatically extract executive summaries, key decisions, actionable tasks, and calendar events from meeting transcripts—letting users review, edit, and approve them before they touch the database.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client["Frontend Client (React 19 + TypeScript + Vite)"]
        UI[Workspace & Project Dashboard]
        KB[Kanban Board & Calendar]
        DC[Document Chat with Citations]
        MR[LiveKit WebRTC Video Room]
        AU[Microphone Audio Recorder (30s Batches)]
    end

    subgraph Backend["Backend API (FastAPI + SQLAlchemy 2.0 + Psycopg 3)"]
        AUTH[JWT Authentication & RBAC]
        WAPI[Workspaces & Projects Router]
        TAPI[Tasks & Calendar Router]
        DAPI[Document Ingestion & Parser]
        RAG[Conversational RAG Engine]
        MAI[Meeting Intelligence Extractor]
        TQ[Resilient Transcription Queue]
    end

    subgraph StorageServices["Database & Object Storage (Supabase)"]
        PG[(PostgreSQL Database)]
        VEC[(pgvector 384-d Cosine Index)]
        S3[(Supabase Private Storage Bucket)]
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
    MR <--> LK
    AU --> TQ

    AUTH --> WAPI
    WAPI --> PG
    TAPI --> PG
    DAPI --> S3
    DAPI --> FE
    FE --> VEC
    RAG --> VEC
    RAG --> GROQ
    TQ --> STT
    STT --> MAI
    MAI --> GROQ
    MAI --> TAPI
```

### Architectural Highlights
- **Decoupled Architecture:** React 19 Single Page Application (SPA) deployed on Vercel Global Edge CDN communicates over authenticated REST APIs with a FastAPI backend hosted on Render.
- **High-Performance Persistence:** PostgreSQL with `pgvector` extension (v0.8.2) hosted in Mumbai (`ap-south-1`) accessed via Supavisor IPv4 connection pooling using psycopg 3.
- **Low-Latency Vector Search:** Local ONNX runtime FastEmbed (`BAAI/bge-small-en-v1.5`) generates deterministic 384-dimensional embeddings directly inside the backend process, eliminating external embedding API latency and costs.
- **Fault-Tolerant Audio Ingestion:** Browser-side MediaRecorder splits meeting audio into 30-second batches streamed to a backend queue with exponential backoff and rate-limit retry logic before transcribing via Groq Whisper.

---

## Technology Stack

| Layer | Technology | Details / Model |
|---|---|---|
| **Frontend Framework** | React 19, TypeScript, Vite 8 | Single Page Application with client-side routing (`react-router-dom` v7) |
| **Icons & Styling** | Lucide React, Vanilla CSS, Glassmorphism | Curated modern dark mode design system with responsive layouts |
| **Real-Time Video** | LiveKit Client SDK | WebRTC video conferencing rooms, media track subscription, and participant grid |
| **Backend Framework** | Python 3.10.14, FastAPI | High-performance asynchronous REST API with structured Pydantic v2 schemas |
| **ORM & Migrations** | SQLAlchemy 2.0, Alembic | Async/sync PostgreSQL database operations with psycopg 3 driver |
| **Database & Vector Store** | Supabase PostgreSQL + `pgvector` | Relational storage with native 384-dimensional cosine vector indexing |
| **Document Storage** | Supabase Storage | Private S3-compatible object storage with time-limited signed download URLs |
| **Vector Embeddings** | FastEmbed (FastEmbed-Python) | `BAAI/bge-small-en-v1.5` local ONNX embedding engine (384 dimensions) |
| **Conversational LLM** | Groq Cloud API / OpenAI API | `openai/gpt-oss-120b` (primary) / `gpt-4o-mini` with strict factual temperature (0.1) |
| **Speech-to-Text** | Groq Whisper | `whisper-large-v3-turbo` with asynchronous batching and resilient queue |
| **Document Parsers** | PyPDF, python-docx | Text extraction for PDF, Microsoft Word DOCX, and plain text files |
| **Hosting & Cloud** | Vercel (Frontend), Render (Backend) | Vercel Hobby CDN, Render Free Web Service (Singapore), Supabase (Mumbai) |
| **Testing & Quality** | Pytest, Oxlint, TypeScript compiler | 150+ automated backend tests covering auth, RAG, meetings, and data isolation |

---

## Key Features

### 1. Multi-Tenant Workspace & Project Hierarchy
- **Isolated Workspaces:** Multi-tenant organization boundaries with dedicated member management and project lists.
- **Role-Based Access Control (RBAC):** Strict permission checks for `OWNER`, `ADMIN`, and `MEMBER` roles across all resources.
- **Project Portfolios:** Organize work into distinct projects with metadata, deadlines, and activity logs.

### 2. Interactive Kanban Boards & Task Workflows
- **Dynamic Kanban Board:** Visual progression columns (`To Do`, `In Progress`, `In Review`, `Done`).
- **Rich Task Metadata:** Priority levels (`Low`, `Medium`, `High`, `Urgent`), assignees, deadlines, and descriptions.
- **Project Calendar:** Month-by-month visualization synchronizing task deadlines and scheduled team meetings.

### 3. Document Knowledge Base & FastEmbed Semantic Search
- **Multi-Format Ingestion:** Direct uploads of `.pdf`, `.docx`, and `.txt` files up to 10 MB.
- **Intelligent Chunking:** 1000-character chunks with 150-character semantic overlaps to preserve cross-sentence context.
- **Vector Search:** Cosine similarity querying over pgvector with a calibrated relevance threshold (`RAG_MAX_DISTANCE <= 0.45`) to filter out irrelevant passages.

### 4. Conversational RAG with Verified Inline Citations
- **Document Chat:** Multi-turn conversational interface with chat session history persistence.
- **Evidence-Grounded Answers:** Responses strictly synthesized from retrieved document chunks with zero hallucination.
- **Inline Citations:** Transparent citation badges linking answers directly to specific document chunks, filenames, and page snippets.

### 5. Real-Time Video Conferencing (LiveKit)
- **WebRTC Rooms:** Directly join video meetings from the project dashboard with low-latency WebRTC streaming.
- **Media Controls:** In-room camera and microphone toggling, participant state monitoring, and connection health indicators.

### 6. Resilient Speech-to-Text Pipeline (Groq Whisper)
- **Audio Batching:** Browser captures audio in 30-second segments to handle extended meetings without memory exhaustion.
- **Free-Tier Resilient Queue:** Background worker queue featuring exponential backoff, concurrency controls, and retry logic to avoid rate limits on Groq Cloud.
- **Chronological Transcripts:** Automatic assembly of meeting transcripts with millisecond-accurate timestamps and speaker metadata.

### 7. AI Meeting Intelligence & Human-in-the-Loop Review
- **Automatic Synthesis:** Generates executive meeting summaries, key discussion points, and agreed-upon decisions.
- **Action Item Extraction:** Detects commitments made during the call and constructs suggested project tasks and calendar events.
- **Suggestion Review Cards:** Users review AI-generated proposals and can approve, customize, or reject each item before it is committed to the project.

### 8. AI Task Assistant & Project Health
- **Task Breakdown Assistant:** Break down high-level project goals into actionable, bite-sized tasks using AI.
- **Project Summary:** Instant AI-driven assessment of project health, upcoming deadlines, and progress bottlenecks.

---

## How It Works

```
1. Create Workspace & Project
   └── Set up team members and define project roadmaps.

2. Upload Project Knowledge
   └── Upload PDFs/DOCXs -> Extracted text -> Chunked & Embedded via FastEmbed -> Saved in pgvector.

3. Ask Questions via Conversational RAG
   └── Query entered -> Embedded -> Vector similarity search -> Context injected into LLM -> Answer with citations.

4. Host Video Meeting
   └── Connect via LiveKit WebRTC -> Audio recorded in 30-second chunks -> Sent to resilient transcription queue.

5. AI Processing & Review
   └── Groq Whisper generates transcript -> LLM extracts summary, action items & calendar events.

6. Approve & Synchronize
   └── User clicks "Approve" on suggestion cards -> Converted into real Kanban tasks and Calendar events.
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
*This starts a local PostgreSQL instance with `pgvector` on port `5432` (database: `aiproductivity`, user: `postgres`, password: `password`).*

#### Option B: Hosted Supabase PostgreSQL
1. Create a free project at [supabase.com](https://supabase.com).
2. Enable the `vector` extension in **Database > Extensions**.
3. Obtain your connection string from **Project Settings > Database > Connection string > URI** (use the session connection pooler mode on port `5432` for IPv4 compatibility).

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
# Database (Supabase or Local Docker)
DATABASE_URL=postgresql+psycopg://postgres:password@localhost:5432/aiproductivity

# Security
JWT_SECRET=your-secure-random-32-character-secret
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

# LiveKit WebRTC Meetings (Optional for local video)
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
pytest app/tests
```
*(Runs 150+ tests covering authentication, workspace RBAC, task workflows, document chunking, semantic vector search, conversational RAG, and meeting pipelines).*

**Run Frontend Production Build:**
From the `frontend` directory:
```bash
npm run build
```

**Run Frontend Linter:**
```bash
npm run lint
```

---

## Production Deployment

| Component | Platform | Configuration Details |
|---|---|---|
| **Frontend** | **Vercel** | SPA rewrites configured via `frontend/vercel.json`. Set `VITE_API_URL` to the live Render backend URL. |
| **Backend API** | **Render** | Python 3.10.14 web service configured via `render.yaml`. Build command: `pip install -r requirements.txt && alembic upgrade head`. Start command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Health check path: `/health`. |
| **Database & Vector Index** | **Supabase** | PostgreSQL with `pgvector` hosted in Mumbai (`ap-south-1`). Connect via Supavisor pooler (`aws-0-ap-south-1.pooler.supabase.com:5432`) for IPv4 cloud compatibility. |
| **Document Storage** | **Supabase Storage** | Private bucket `project_documents` with signed download URLs. |

---

## Security & Data Isolation

1. **Workspace Multi-Tenancy:** Every request to workspaces, projects, tasks, documents, and meetings enforces strict tenant boundary checks (`get_project_for_member`). Unauthorized access returns `HTTP 403 Forbidden` or `HTTP 404 Not Found`.
2. **Stateless JWT Authentication:** Access tokens are cryptographically signed using `HS256` with password hashing handled by `bcrypt`.
3. **Private File Storage:** Uploaded files are stored in a private Supabase Storage bucket with zero anonymous access. Downloads are authorized via time-limited signed URLs.
4. **Server-Side Exception Sanitization:** `SafeServerErrorMiddleware` intercepts unhandled exceptions to prevent stack traces, database schemas, or credentials from leaking to clients while preserving proper CORS headers.
5. **Human-in-the-Loop Governance:** AI models suggest actions; they never automatically write tasks or schedule events without explicit user confirmation.

---

## What I Learned

- Designing and deploying a decoupled, production-ready full-stack application with React 19 and FastAPI.
- Implementing vector search using `pgvector` combined with local ONNX-based embedding generation (`FastEmbed`) to eliminate external API costs.
- Engineering conversational RAG with semantic threshold boundaries and accurate multi-source citation linking.
- Integrating real-time WebRTC conferencing via LiveKit Cloud alongside resilient audio transcription queues handling Groq Whisper free-tier rate limits.
- Managing database migrations and schema evolution using Alembic across local and cloud environments.
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
