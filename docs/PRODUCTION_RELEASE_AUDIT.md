# Production Release Audit — Sync AI Productivity Platform

**Audit Date:** October 31, 2026  
**Auditor:** Antigravity AI Engineering Suite  
**Repository:** `Bhomaramsuthar/Sync-Ai-Productivity-Platform`  
**Current Branch:** `main` (synchronized with `origin/main` at `063c42a`)  
**Deployment Infrastructure:**  
- **Frontend:** Vercel (React 19 + Vite 8 + TypeScript)  
- **Backend:** Render (FastAPI + Python 3.10 + Psycopg 3 + Uvicorn)  
- **Database:** Supabase PostgreSQL + `pgvector` (Mumbai `aws-0-ap-south-1`)  
- **Object Storage:** Supabase Storage (`project_documents` & `avatars` buckets)  
- **Video & Real-Time:** LiveKit Cloud WebRTC & WebSocket Stream  
- **AI & Speech Providers:** Groq Cloud (`openai/gpt-oss-120b`, `whisper-large-v3-turbo`) & FastEmbed ONNX (`BAAI/bge-small-en-v1.5`)

---

## 1. Executive Summary & Release Readiness Classification

| Category | Status | Evaluation |
| :--- | :---: | :--- |
| **Code Quality & Testing** | `READY` | 195/195 backend tests passing (100%), 29/29 frontend tests passing (100%), TypeScript build passing with 0 errors. |
| **Secrets & Repository Sanitization** | `READY` | No secrets, credentials, or private configuration tracked in git. `.gitignore` properly isolates all `.env` files, builds, and SQLite databases. |
| **Database & Migration DAG** | `BLOCKER` | 2 critical new migrations (`e4f5a6b7c8d9` and `f1a2b3c4d5e6`) are uncommitted/unapplied to production Supabase. |
| **LiveKit Video Credentials** | `BLOCKER` | Production Render environment must be configured with `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`, otherwise video rooms will fail. |
| **Cloud Environment Variables** | `BLOCKER` | Vercel and Render require mandatory environment variables (`VITE_API_URL`, `DATABASE_URL`, `JWT_SECRET`, `SUPABASE_KEY`) before traffic can be routed. |

> [!CAUTION]
> **VERDICT: RELEASE BLOCKED UNTIL PRE-DEPLOYMENT ACTIONS ARE COMPLETED.**  
> While the application code and test suites are 100% functional locally, releasing requires executing the pending database migrations on Supabase and setting the production environment variables in Vercel and Render dashboards. **Do not deploy or push until the sequential actions outlined in this audit are performed.**

---

## 2. Features Audited

The audit verified the complete end-to-end functionality of all new and legacy platform capabilities:

1. **Authentication & User Management**
   - Direct Bcrypt hashing (rounds=12) with defensive passlib polyfill (`bcrypt >= 4.1.0` resilience).
   - HMAC-SHA256 JWT access token generation and authorization middleware.
   - User profile management: name updates, password changes, theme toggling (`light`, `dark`, `system`), and notification preference toggles.
   - User avatar upload with Supabase Storage integration and base64 data-URI fallback.

2. **Workspaces, Membership, & Capacity Governance**
   - Multi-tenant workspace isolation with role hierarchy (`OWNER`, `ADMIN`, `MEMBER`).
   - Workspace member capacity policies: seat limits (default 50), capacity saturation checks, and soft/hard limits.
   - Multi-channel invitations:
     - Cryptographically secure 64-character token invite links (SHA-256 hashed in database).
     - Unique 6-character alphanumeric join codes (`xxx-yyy`) with collision prevention.
     - Direct email invitations with recipient validation.
     - Dynamic visual QR code generation for mobile and desktop quick-join.
   - Join request workflow with admin approval gates, self-approval prevention, rejection reasons, and auto-cancellation.
   - Member removal with instant session termination and WebSocket disconnection.

3. **Projects, Tasks, & Kanban Boards**
   - Hierarchical workspace project spaces with distinct roadmaps and activity feeds.
   - Interactive Kanban boards supporting status column transitions (`TODO`, `IN_PROGRESS`, `DONE`).
   - Priority assignments (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), deadline operations, and assignee assignment integrity.
   - Audit trail activity logging for all project mutations.

4. **Calendar & Activity Feed**
   - Workspace and project calendar agendas with scheduled deadlines, events, and meetings.
   - Cross-project date filters and event synchronization.

5. **Document Management & Semantic Search**
   - Multi-format text extraction engine (`PDF`, `DOCX`, `TXT`, `MD`, `CSV`) with defensive error isolation for corrupted or empty documents.
   - Chunking pipeline with sliding-window chunk overlap (1,000 characters, 150 overlap).
   - Vector embeddings using local FastEmbed ONNX CPU runtime (`BAAI/bge-small-en-v1.5`, 384 dimensions).
   - Semantic retrieval with cosine distance thresholding (`RAG_MAX_DISTANCE = 0.45`) to exclude irrelevant context.

6. **Conversational RAG & Document Chat**
   - Multi-turn conversational memory with project-scoped chat sessions.
   - Strict evidence grounding with inline citation attribution (chunk indices and document references).
   - Defensive prompt injection resistance: database records and extracted passages are explicitly wrapped in untrusted data delimiters.
   - Grounded refusal: AI transparently explains when document context is insufficient to answer the query rather than hallucinating.

7. **Global AI Assistant (Omnipresent Productivity Partner)**
   - Multi-scope conversational intelligence:
     - Global account scope (cross-workspace task rollups, meetings, and activity).
     - Workspace scope (team capacity, members, roadmaps, and projects).
     - Project scope (tasks, Kanban status, and document citations).
   - Safe tool execution safeguards: read-only database inspections with strict authorization verification.

8. **Real-Time Video Meetings (LiveKit WebRTC)**
   - Meeting code generation (`xxx-yyyy-zzz`) and room scheduling.
   - Participant token issuance with scoped video grants (`room_join`, `can_publish`, `can_subscribe`, `room_admin`).
   - Meeting room participant state tracking, microphone/camera permission handling, and clean disconnection cleanup.

9. **Meeting Transcription & Post-Meeting AI Intelligence**
   - Browser `MediaRecorder` audio chunking (30-second discrete batches) with participant identity attribution.
   - Asynchronous transcription worker queue with exponential backoff and retry mechanisms for Groq Whisper (`whisper-large-v3-turbo`).
   - Post-meeting structured intelligence extraction: summary, key decisions, actionable tasks, and follow-up calendar events.
   - Human-in-the-loop review gate: extracted tasks and events must be reviewed and approved by workspace members before committing to the Kanban board or Calendar.

10. **Real-Time Sync & WebSocket Notifications**
    - High-performance `WorkspaceConnectionManager` WebSocket stream (`/api/v1/workspaces/{id}/ws`).
    - Multi-tenant workspace isolation: events in Workspace A are never broadcast to Workspace B clients.
    - Automatic 25-second keepalive pings and client-side exponential backoff reconnection.
    - Immediate WebSocket termination on membership revocation (WebSocket close code 1008 / 4403).
    - Persistent in-app notifications with read status tracking.

11. **Modern UI & Kinetic Animations**
    - Kinetic text reveal headers with screen-reader accessibility (`sr-only` preservation).
    - Hold-to-delete safety confirmation buttons with visual progress bars.
    - Thinking loaders and ambient animations.
    - Dark/light/system theme persistence with smooth CSS variable transitions.

---

## 3. Build & Test Verification Results

### A. Frontend Verification
- **Test Framework:** Vitest v5.0.5 + Testing Library
- **Test Suites:** 4 passed (4)
- **Total Tests:** 29 passed (29)
- **TypeScript & Vite Production Build:**
  - `tsc -b`: 0 errors
  - `vite build`: Transformed 2,958 modules in 691ms
  - Asset Outputs:
    - `dist/index.html`: 0.51 kB (gzip: 0.33 kB)
    - `dist/assets/index-CNLJFNxZ.css`: 133.50 kB (gzip: 23.51 kB)
    - `dist/assets/index-C2oRx24R.js`: 1,745.01 kB (gzip: 493.45 kB)
- **Linter Check:** `oxlint` reported 0 errors across 70 source files.

### B. Backend Verification
- **Test Framework:** Pytest v9.1.1 + HTTPX TestClient
- **Test Modules:** 17 test modules
- **Total Tests:** 195 passed (195), 0 failures, 0 errors
- **Execution Time:** 12m 38s (including local ONNX embedding computation, PDF parsing, and crypto hashing)
- **Alembic Migration Revisions:** 12 total revisions, linear DAG with exactly 1 head (`f1a2b3c4d5e6`).

---

## 4. Critical Blockers & High-Priority Issues

### Critical Blockers (`BLOCKER`)

#### 1. 🚨 Uncommitted Local Code & Untracked Database Migrations
- **Finding:** Critical platform features (Workspace capacity governance, invitation tokens, join requests, notifications, and conversation scopes) are currently uncommitted in your working directory. Most importantly, two Alembic migration files are untracked:
  - `backend/alembic/versions/e4f5a6b7c8d9_add_conversation_scope_and_nullable_ids.py`
  - `backend/alembic/versions/f1a2b3c4d5e6_add_workspace_capacity_invitations_and_join_requests.py`
- **Impact:** If code is pushed without these files, Render will deploy without the required database schemas, causing immediate 500 errors across workspace invitations, the global AI assistant, and member operations.
- **Action Required:** Stage and commit all backend and frontend changes, including untracked migration files, before deploying.

#### 2. 🚨 Missing `pgvector` Extension in Supabase Database
- **Finding:** The platform uses vector embeddings (`VECTOR(dim=384)`) stored in the `document_chunks` table. In fresh Supabase instances, PostgreSQL extensions are not active by default.
- **Impact:** If `alembic upgrade head` is executed without the extension enabled, PostgreSQL will fail with `type "vector" does not exist`.
- **Action Required:** Execute `CREATE EXTENSION IF NOT EXISTS vector;` in the Supabase SQL Editor prior to running migrations.

#### 3. 🚨 Insecure Default `JWT_SECRET`
- **Finding:** The backend configuration defaults `JWT_SECRET` to `"secret"`.
- **Impact:** If `JWT_SECRET` is left unset on Render, an attacker can trivially forge JWT tokens and impersonate any user or workspace administrator.
- **Action Required:** Generate a cryptographically secure 64-character random string (e.g. via `openssl rand -hex 32`) and save it to the `JWT_SECRET` variable in the Render Dashboard.

#### 4. 🚨 Missing LiveKit Production Credentials
- **Finding:** `backend/app/meetings/livekit_service.py` defaults to `ws://localhost:7880` when `LIVEKIT_URL` is omitted.
- **Impact:** Any user clicking "Join Room" in production will receive a token pointing to localhost. The browser will fail to establish a WebRTC connection to remote participants.
- **Action Required:** Register a free project on [livekit.io](https://livekit.io) (or provision a LiveKit server) and populate `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` in Render.

#### 5. 🚨 Missing `VITE_API_URL` on Vercel
- **Finding:** `frontend/src/services/api.ts` falls back to `http://127.0.0.1:8000/api/v1` when `VITE_API_URL` is not set.
- **Impact:** Users accessing `https://sync-ai-productivity-platform.vercel.app` will attempt to make HTTP and WebSocket requests to their own machine rather than your cloud backend.
- **Action Required:** Add `VITE_API_URL=https://sync-ai-productivity-backend.onrender.com/api/v1` to the Vercel Project Settings under Environment Variables, then trigger a redeploy.

---

### High-Priority Warnings (`WARNING`)

#### 1. ⚠️ Render Free-Tier Cold Start Delay (50–60 Seconds)
- **Finding:** Render free-tier web services spin down to zero after 15 minutes of inactivity. The first HTTP request after idle takes 45–60 seconds to boot the Python runtime.
- **Mitigation:** The frontend error handler (`extractErrorMessage` in `api.ts`) has been updated to inform users that the service is waking up rather than reporting a confusing local host error. For production uptime, consider upgrading to Render Starter ($7/mo) or setting up an external ping monitor (e.g. UptimeRobot or Cron-job.org).

#### 2. ⚠️ Supabase Connection Pooling (IPv4 vs Direct IPv6)
- **Finding:** Modern Supabase direct connection strings (`db.<ref>.supabase.co:5432`) resolve only via IPv6. Free-tier cloud hosts like Render often do not support outbound IPv6.
- **Mitigation:** In Render's `DATABASE_URL`, **always use the Supabase Connection Pooler string** (Transaction or Session mode on port 5432 / 6543, e.g. `postgresql+psycopg://postgres.<ref>:<pass>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require`).

#### 3. ⚠️ Memory Consumption of FastEmbed ONNX on Render (512MB RAM Cap)
- **Finding:** FastEmbed uses the ONNX runtime to embed text locally on CPU. Loading `BAAI/bge-small-en-v1.5` requires ~200MB of RAM.
- **Mitigation:** On Render's free tier (512MB ceiling), concurrent document indexing while running background audio queues may trigger an Out-Of-Memory (OOM) kill. Keep `MAX_UPLOAD_SIZE` at 10MB and monitor memory in the Render Metrics dashboard.

#### 4. ⚠️ Groq API Free-Tier Rate Limits
- **Finding:** Both conversational LLM requests and audio speech-to-text share the Groq Cloud free-tier request quotas.
- **Mitigation:** The backend transcription queue includes automatic exponential backoff (2s up to 30s) and retry tracking. However, multiple parallel meetings running simultaneously will saturate free-tier quotas.

#### 5. ⚠️ Single Large Frontend Bundle Chunk (1.7 MB)
- **Finding:** Vite outputs a single bundled JavaScript chunk (`index-*.js`) of 1.7 MB (493 kB gzipped).
- **Mitigation:** While functional, initial page load speeds can be improved post-release by implementing route-level code splitting using `React.lazy()` for heavy modules like `MeetingRoom.tsx` and `DocumentChat.tsx`.

---

## 5. Production Environment Variable Report

> [!NOTE]
> Values displayed below are format representations only. **No actual secret values or live credentials are exposed in this document.**

### A. Vercel Frontend Environment Variables

| Variable Name | Purpose | Required | Production Requirement |
| :--- | :--- | :---: | :--- |
| `VITE_API_URL` | Base endpoint for REST API and WebSockets | **YES** | Set to your live Render backend URL with `/api/v1` suffix (e.g. `https://sync-ai-productivity-backend.onrender.com/api/v1`). |

---

### B. Render Backend Environment Variables

| Variable Name | Purpose | Required | Production Requirement |
| :--- | :--- | :---: | :--- |
| `ENVIRONMENT` | Platform environment mode | **YES** | Must be set to `production`. |
| `PYTHON_VERSION` | Python runtime version on Render | **YES** | Set to `3.10.14`. |
| `DATABASE_URL` | Supabase PostgreSQL database connection | **YES** | Must use the **Supabase Pooler** URL (IPv4) with `postgresql+psycopg://` scheme. |
| `JWT_SECRET` | Secret key for signing session tokens | **YES** | Cryptographically random 32+ character string (e.g. `openssl rand -hex 32`). |
| `JWT_ALGORITHM` | Algorithm used for JWT encoding | Optional | Set to `HS256` (default). |
| `JWT_EXPIRE_MINUTES` | Session token lifetime | Optional | Set to `1440` (24 hours). |
| `LOG_LEVEL` | Application logging verbosity | Optional | Set to `INFO`. |
| `CORS_ORIGINS` | Permitted frontend origins | Optional | The backend automatically permits `https://*.vercel.app`. Add your custom domain if applicable. |

---

### C. Supabase Configuration

| Variable / Asset | Purpose | Required | Production Requirement |
| :--- | :--- | :---: | :--- |
| `SUPABASE_URL` | REST endpoint for your Supabase project | **YES** | Format: `https://<project-ref>.supabase.co`. |
| `SUPABASE_KEY` | Supabase `service_role` secret key | **YES** | Service role key (required to bypass RLS for server-side storage operations). |
| `MAX_UPLOAD_SIZE` | Maximum file upload size in bytes | Optional | Default: `10485760` (10MB). |
| **Storage Bucket: `project_documents`** | Stores project documentation and RAG files | **YES** | Must be created in Supabase Dashboard (Private bucket). |
| **Storage Bucket: `avatars`** | Stores user profile avatar images | **YES** | Must be created in Supabase Dashboard (Public bucket). |
| **PostgreSQL Extension: `vector`** | Vector indexing for RAG semantic search | **YES** | Execute `CREATE EXTENSION IF NOT EXISTS vector;` in Supabase SQL editor. |

---

### D. LiveKit Video Configuration

| Variable Name | Purpose | Required | Production Requirement |
| :--- | :--- | :---: | :--- |
| `LIVEKIT_URL` | LiveKit WebRTC server endpoint | **YES** | Format: `wss://<project>.livekit.cloud`. Required for WebRTC calls. |
| `LIVEKIT_API_KEY` | API Key for LiveKit authentication | **YES** | Format: `APIxxxxxxxxxxxxxxxx`. |
| `LIVEKIT_API_SECRET` | Secret key for issuing participant tokens | **YES** | Secret key provided by LiveKit. Never expose in frontend code. |

---

### E. AI & Speech Provider Configuration

| Variable Name | Purpose | Required | Production Requirement |
| :--- | :--- | :---: | :--- |
| `LLM_PROVIDER` | Selected LLM provider | **YES** | Set to `groq` for free cloud hosting (or `openai`). |
| `GROQ_API_KEY` | API key for Groq Cloud services | **YES** | API key (`gsk_...`). Powers both LLM and Whisper transcription. |
| `LLM_MODEL` | Language model identifier | Optional | Default for Groq: `openai/gpt-oss-120b`. |
| `LLM_TEMPERATURE` | Generation randomness | Optional | Set to `0.1` for factual, grounded answers. |
| `LLM_MAX_TOKENS` | Maximum token limit per response | Optional | Default: `1000`. |
| `LLM_TIMEOUT_SECONDS` | Upstream LLM HTTP timeout | Optional | Default: `30.0`. |
| `EMBEDDING_PROVIDER` | Embedding engine | Optional | Set to `fastembed` (default, runs CPU ONNX in backend). |
| `EMBEDDING_MODEL` | Embedding model identifier | Optional | Default: `BAAI/bge-small-en-v1.5` (dimension 384). |
| `RAG_MAX_DISTANCE` | Cosine distance retrieval threshold | Optional | Default: `0.45`. |
| `GROQ_WHISPER_MODEL` | Whisper model for meeting audio | Optional | Default: `whisper-large-v3-turbo`. |

---

## 6. Supabase & Database Migrations Audit

### Complete Alembic Migration Graph

The migration chain is strictly linear with no branching or head collisions:

```mermaid
flowchart TD
    M1["6c76583a143e<br/>(Initial: users)"] --> M2["7c929c989c81<br/>(workspaces, workspace_members)"]
    M2 --> M3["45d335a17685<br/>(projects, tasks)"]
    M3 --> M4["80a61b4400fe<br/>(project_activity)"]
    M4 --> M5["27b6a0898dfc<br/>(documents)"]
    M5 --> M6["e9d252609d2f<br/>(text_extraction_fields)"]
    M6 --> M7["ffc8a44bb912<br/>(document_chunks & pgvector)"]
    M7 --> M8["d81cbe4bdd6a<br/>(conversations, messages)"]
    M8 --> M9["a1b2c3d4e5f6<br/>(meetings, calendar_events)"]
    M9 --> M10["c3d4e5f6a7b8<br/>(user_preferences, avatar_url)"]
    M10 --> M11["e4f5a6b7c8d9<br/>(conversation_scope, nullable_ids)"]
    M11 --> M12["f1a2b3c4d5e6 (HEAD)<br/>(workspace_capacity, invitations, join_requests, notifications)"]
```

### Pending Migrations for Production Release

Depending on whether your production database was deployed at Week 13 (`a1b2c3d4e5f6`) or has the profile fields (`c3d4e5f6a7b8`), the following migrations must be applied:

1. **`c3d4e5f6a7b8` (if not yet applied):** Adds `avatar_url` and `preferences_json` columns to `users`.
2. **`e4f5a6b7c8d9` (Pending):** Adds `scope` (`GLOBAL`, `WORKSPACE`, `PROJECT`) to `conversations` and relaxes foreign key non-null constraints to permit workspace-level and account-level conversations.
3. **`f1a2b3c4d5e6` (Pending):** 
   - Adds `max_capacity` and `requires_approval` to `workspaces`.
   - Creates Postgres ENUM types (`invitationtypeenum`, `invitationstatusenum`, `joinrequeststatusenum`).
   - Creates `workspace_invitations`, `workspace_join_requests`, and `notifications` tables with foreign keys and cascade rules.

### Safe Migration Protocol

> [!IMPORTANT]
> **PRE-MIGRATION BACKUP REQUIREMENT:**  
> Before executing database migrations on production Supabase, navigate to **Supabase Dashboard** -> **Project Settings** -> **Database** -> **Backups** and trigger a manual backup snapshot (or run `pg_dump -Fc` from a secure terminal).

#### Exact Migration Execution Commands

To execute migrations safely from your local machine against the production database:

```bash
# 1. Set the production database connection string temporarily in your shell
$env:DATABASE_URL="postgresql+psycopg://postgres.<PROJECT_REF>:<PASSWORD>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"

# 2. Check current migration status in production
cd backend
.\venv\Scripts\alembic.exe current

# 3. Apply all pending migrations safely to HEAD
.\venv\Scripts\alembic.exe upgrade head

# 4. Verify head has been reached (f1a2b3c4d5e6)
.\venv\Scripts\alembic.exe current
```

Alternatively, if Render is configured with `buildCommand: pip install -r requirements.txt && alembic upgrade head`, Render will apply migrations automatically upon deployment, provided `DATABASE_URL` is set in the Render environment variables.

---

## 7. Recommended Release Sequence

Follow this exact order of operations to ensure zero downtime and prevent configuration mismatches:

```mermaid
flowchart TD
    S1["1. Supabase Preparation<br/>(Enable vector extension, create storage buckets, take backup)"] --> S2["2. Configure Cloud Environment Variables<br/>(Render backend env vars & Vercel VITE_API_URL)"]
    S2 --> S3["3. Commit & Push Code to GitHub<br/>(Stage uncommitted features and new Alembic migrations)"]
    S3 --> S4["4. Execute Database Migrations<br/>(Run alembic upgrade head to reach revision f1a2b3c4d5e6)"]
    S4 --> S5["5. Trigger Cloud Builds<br/>(Render deploys backend; Vercel deploys frontend)"]
    S5 --> S6["6. Perform Post-Deployment Smoke Tests<br/>(Follow manual verification checklist)"]
```

### Detailed Steps:

1. **Supabase Preparation:**
   - Log into [Supabase Dashboard](https://supabase.com/dashboard).
   - In SQL Editor, run:
     ```sql
     CREATE EXTENSION IF NOT EXISTS vector;
     ```
   - In Storage, ensure buckets `project_documents` and `avatars` exist.
   - In Database -> Backups, take a fresh backup snapshot.

2. **Configure Cloud Environment Variables:**
   - In [Render Dashboard](https://dashboard.render.com), configure all required variables listed in Section 5.B, 5.C, 5.D, and 5.E (`DATABASE_URL`, `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_KEY`, `LLM_PROVIDER`, `GROQ_API_KEY`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
   - In [Vercel Dashboard](https://vercel.com), configure `VITE_API_URL=https://<your-render-backend-url>/api/v1`.

3. **Commit & Push Code:**
   - Review staged files:
     ```bash
     git add backend/alembic/versions/ backend/app/ frontend/ docs/ render.yaml
     git commit -m "feat: complete workspace capacity, invitations, realtime sync, and global AI assistant"
     git push origin main
     ```

4. **Execute Database Migrations:**
   - Run `alembic upgrade head` either via the Render deploy pipeline or locally pointing to production `DATABASE_URL`.

5. **Trigger Cloud Deployments:**
   - Render will build the Python service and expose the `/health` endpoint.
   - Vercel will compile the Vite frontend and deploy to your production domain.

6. **Post-Deployment Verification:**
   - Run the manual testing checklist below.

---

## 8. Manual Post-Deployment Testing Checklist

- [ ] **Health Check:** Visit `https://<render-backend>/health` — must return `{"status":"healthy"}`.
- [ ] **SPA Direct Routing & Refresh:** Visit `https://<vercel-frontend>/workspaces`, refresh the browser (F5) — page must reload cleanly without 404s.
- [ ] **Authentication Flow:**
  - Register a new test user account.
  - Log out and log back in.
  - Verify JWT session persists across browser tabs.
- [ ] **Workspace Governance & Capacity:**
  - Create a new workspace with a custom capacity (e.g. 5 seats).
  - Open workspace settings: generate an invite link, 6-digit code, and QR code.
  - In an incognito window, open the invite link, log in as a second user, and submit a join request.
  - In the owner window, approve the join request. Verify real-time seat counter updates.
- [ ] **Kanban Board & Tasks:**
  - Create a project and add 3 tasks.
  - Drag tasks across `TODO` -> `IN_PROGRESS` -> `DONE`.
  - Verify status persists upon page reload.
- [ ] **Document Upload & RAG:**
  - Upload a test `.txt` or `.pdf` file in a project's Document Library.
  - Wait for indexing status to change from `PROCESSING` to `INDEXED`.
  - Open Document Chat and ask a question regarding the uploaded document.
  - Verify that the response includes grounded inline source citations with chunk tags.
- [ ] **Global AI Assistant:**
  - Open the Global AI Assistant modal from the sidebar/navbar.
  - Ask for a summary of your assigned tasks across workspaces.
  - Verify accurate context retrieval and absence of hallucinated data.
- [ ] **LiveKit Video Meeting:**
  - Create and launch a video meeting.
  - Verify camera and microphone attach without errors.
  - Join with a second device/browser using the meeting code.
  - Speak for 30 seconds, end the meeting, and verify speech transcription segments are generated.
  - Verify AI extracts summary items with an approval gate for Kanban creation.
- [ ] **Real-Time WebSocket Sync:**
  - Open the same workspace in two side-by-side browser windows.
  - Create a task in Window A — verify Window B updates instantly without manual page refresh.

---

## 9. Rollback Instructions

If unexpected errors occur in production, execute these rollback procedures:

### A. Database Rollback
To revert the newly applied migrations:
```bash
# Revert to pre-release head (a1b2c3d4e5f6)
$env:DATABASE_URL="<PRODUCTION_SUPABASE_POOLER_URL>"
cd backend
.\venv\Scripts\alembic.exe downgrade a1b2c3d4e5f6
```
To restore a snapshot:
- Go to **Supabase Dashboard** -> **Project Settings** -> **Database** -> **Backups** -> Select snapshot -> Click **Restore**.

### B. Backend Rollback (Render)
1. Open [dashboard.render.com](https://dashboard.render.com).
2. Select `sync-ai-productivity-backend`.
3. Go to the **Events** or **Deploys** tab.
4. Locate the last known healthy deployment commit (`063c42a`).
5. Click **Rollback to this deploy**.

### C. Frontend Rollback (Vercel)
1. Open [vercel.com](https://vercel.com).
2. Select `Sync-Ai-Productivity-Platform`.
3. Go to the **Deployments** tab.
4. Locate the previous production deployment.
5. Click the three dots `...` and select **Promote to Production** (instant zero-downtime rollback).

