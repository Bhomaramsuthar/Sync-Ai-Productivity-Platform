# Week 13 — Deployment and Production Readiness Review

## 1. Hosting Architecture & Strategy

The AI-Driven Collaboration & Productivity Platform is configured for a robust, decoupled, and cost-effective deployment leveraging:

| Component | Platform | Plan / Tier | Region | Technical Rationale |
|-----------|----------|-------------|--------|---------------------|
| **Frontend** | [Vercel](https://vercel.com) | Hobby (Free) | Global Edge CDN | Instant global edge CDN distribution, zero-config Vite SPA build, automatic HTTPS, and seamless Git-driven deployments. Client-side routing rewrites are handled natively via `frontend/vercel.json`. |
| **Backend API & AI Engine** | [Render](https://render.com) | Free Web Service | Singapore (`singapore`) | Native Python runtime, integrated ASGI support (`uvicorn`), environment-based secrets management, and automatic deployment from Git. Singapore region was selected for minimum network latency to Mumbai Supabase. |
| **Database & Vector Store** | [Supabase](https://supabase.com) | Free Tier | Mumbai, India (`ap-south-1`) | Managed PostgreSQL with native `pgvector` extension (v0.8.2), automated schema migrations via Alembic, relational integrity, and Supavisor IPv4 connection pooling. |
| **Document Storage** | [Supabase Storage](https://supabase.com) | Free Tier (1 GB) | Mumbai, India (`ap-south-1`) | Private S3-compatible object storage with time-limited signed download URLs and project-scoped access policies. |

### Resource & Cost Considerations:
- **Render Free Tier Web Service**:
  - Hardware: 512 MB RAM, 0.1 vCPU.
  - Usage pool: 750 free instance hours/month (sufficient to run a single service 24/7).
  - Cold Start behavior: Render free instances spin down after 15 minutes of inbound inactivity; subsequent cold-start requests experience a ~50-second wake-up latency.
  - Single Worker ASGI: Running `uvicorn app.main:app --host 0.0.0.0 --port $PORT` with a single worker ensures memory remains within ~120–180 MB (including FastEmbed model loaded in RAM), avoiding OOM kills on 512 MB RAM.
  - Render Free Postgres limitation: Render free PostgreSQL instances expire strictly after 30 days. To eliminate data loss, the platform exclusively uses **Supabase PostgreSQL** which does not expire after 30 days.
- **Supabase Free Tier**:
  - Includes 500 MB database storage, 1 GB file storage, and 2 free projects.
  - Inactivity pause: Supabase free projects pause after 7 days of complete inactivity and can be restored directly via the Supabase Dashboard.
  - Outbound IPv4 Compatibility: Render instances connect over IPv4. Because Supabase direct connections (`db.[ref].supabase.co`) use IPv6 on free tier, Render connects to Supabase via the IPv4 Supavisor connection pooler (`aws-0-ap-south-1.pooler.supabase.com:5432`).

---

## 2. Environment Variables Specification

No real secrets or credentials are hardcoded or tracked in version control. All services read configuration dynamically from environment variables.

### A. Backend Web Service (Render)

| Variable Name | Required | Default / Recommended Format | Description |
|---------------|----------|------------------------------|-------------|
| `DATABASE_URL` | **Yes** | `postgresql+psycopg://postgres.[REF]:[PWD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres` | PostgreSQL connection string using Supabase IPv4 connection pooler. |
| `ENVIRONMENT` | **Yes** | `production` | Deployment environment flag. |
| `LOG_LEVEL` | No | `INFO` | Application log level (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |
| `JWT_SECRET` | **Yes** | 32+ character random hex/string | Cryptographic key used to sign and verify JWT authentication tokens. |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm. |
| `JWT_EXPIRE_MINUTES` | No | `1440` | Token expiration duration (24 hours). |
| `SUPABASE_URL` | **Yes** | `https://[PROJECT_REF].supabase.co` | Supabase API endpoint. |
| `SUPABASE_KEY` | **Yes** | `[SUPABASE_SERVICE_ROLE_KEY]` | Supabase service-role secret key for backend storage management. |
| `CORS_ORIGINS` | No | `https://[YOUR_APP].vercel.app` | Comma-separated list of additional allowed frontend origins. (Vercel `*.vercel.app` domains are matched via production regex). |
| `MAX_UPLOAD_SIZE` | No | `10485760` (10 MB) | Maximum permitted file upload size in bytes. |
| `EMBEDDING_PROVIDER` | No | `fastembed` | Embedding provider (`fastembed`, `openai`, `mock`). |
| `EMBEDDING_MODEL` | No | `BAAI/bge-small-en-v1.5` | FastEmbed ONNX embedding model name. |
| `EMBEDDING_DIMENSION` | No | `384` | Embedding vector dimension for pgvector. |
| `RAG_MAX_DISTANCE` | No | `0.45` | Cosine distance relevance cutoff threshold. |
| `LLM_PROVIDER` | **Yes** | `groq` | Conversational LLM provider (`groq`, `openai`, `mock`). |
| `GROQ_API_KEY` | Conditional | `gsk_...` | API key from Groq Console (required when `LLM_PROVIDER=groq`). |
| `LLM_API_KEY` | Conditional | `sk-...` | API key from OpenAI, OpenRouter, or Groq. |
| `LLM_MODEL` | No | `openai/gpt-oss-120b` | Model identifier (e.g. `openai/gpt-oss-120b`, `llama-3.3-70b-versatile`, `gpt-4o-mini`). |
| `LLM_TEMPERATURE` | No | `0.1` | Temperature for factual accuracy and zero hallucination. |
| `LLM_MAX_TOKENS` | No | `1000` | Maximum token length for AI responses. |
| `LLM_TIMEOUT_SECONDS` | No | `30.0` | Upstream provider HTTP timeout. |

### B. Frontend Application (Vercel)

| Variable Name | Required | Default / Recommended Format | Description |
|---------------|----------|------------------------------|-------------|
| `VITE_API_URL` | **Yes** | `https://[RENDER_APP_NAME].onrender.com/api/v1` | Public API base URL pointing to the deployed Render backend. |

---

## 3. Build, Startup, and Migration Commands

### Backend:
- **Runtime Version Specification**: `backend/runtime.txt` (`python-3.10.14`).
- **Dependency Installation**: `pip install -r requirements.txt`.
- **Database Schema Migration Command**: `alembic upgrade head`.
- **Production ASGI Startup Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
- **Health Check Endpoint**: `GET /health` (returns `{"status": "healthy", "service": "ai-productivity-backend", "version": "1.0.0"}`).

### Frontend:
- **Framework**: Vite + React 19 + TypeScript.
- **Dependency Installation**: `npm install`.
- **Production Build Command**: `npm run build` (`tsc -b && vite build`).
- **Build Output Directory**: `dist`.
- **SPA Routing Rewrites**: Configured via `frontend/vercel.json` (`"source": "/(.*)", "destination": "/index.html"`).

### Infrastructure as Code:
- `render.yaml` Blueprint created at repository root to automate web service provisioning, build commands, startup parameters, and environment declarations.

---

## 4. Supabase Readiness & Security Audit

Live connectivity and schema checks were conducted directly against the Mumbai Supabase instance:

| Check | Expected | Verified State | Audit Result |
|-------|----------|----------------|--------------|
| **PostgreSQL Connection** | Live connection | Connected via SQLAlchemy psycopg3 driver | **PASSED** |
| **pgvector Extension** | `vector` installed | Version `0.8.2` active in `pg_extension` | **PASSED** |
| **Schema Migrations** | Alembic head `d81cbe4bdd6a` | Version table contains `['d81cbe4bdd6a']` | **PASSED** |
| **Required Database Tables** | 11 core application tables | `users`, `workspaces`, `workspace_members`, `projects`, `tasks`, `documents`, `document_chunks`, `conversations`, `messages`, `project_activities`, `alembic_version` | **PASSED** |
| **Storage Buckets** | `project_documents` | Found and verified | **PASSED** |
| **Storage Public Access** | Private (`public: False`) | Verified: `public: False` (No anonymous direct URL downloads allowed) | **PASSED** |
| **Signed Download URLs** | Time-limited signed URL | Signed URLs generated and verified | **PASSED** |
| **Database Permissions** | Service-role backend | Backend utilizes service-role authorization; client has zero direct database credentials | **PASSED** |

---

## 5. Security & Isolation Controls

1. **Workspace and Project Boundaries**:
   - Every API endpoint under `/api/v1/workspaces/...`, `/api/v1/projects/...`, `/api/v1/tasks/...`, `/api/v1/documents/...`, and `/api/v1/ai/...` strictly validates the user's workspace/project membership via `get_project_for_member()`.
   - Unauthorized attempts by non-members consistently return `HTTP 403 Forbidden` or `HTTP 404 Not Found`.
2. **Document & File Security**:
   - Storage bucket `project_documents` is private.
   - Files are validated against `MAX_UPLOAD_SIZE` (10 MB) and allowed file extensions (`pdf`, `txt`, `md`, `docx`, `csv`).
   - File retrieval generates authenticated, short-lived signed URLs; direct public downloads are blocked.
3. **CORS Restrictions**:
   - `CORSMiddleware` in `backend/app/main.py` is configured with `settings.allowed_cors_origins` and regex `^https://.*\.vercel\.app$`.
   - Insecure wildcard `allow_origins=["*"]` with credentials has been eliminated.
4. **Data Protection & Secret Hygiene**:
   - Neither `.env` nor API tokens are committed to git (`.gitignore` protects all `.env*` files).
   - Frontend bundles contain only public `VITE_API_URL`; service keys, database passwords, and LLM API keys remain strictly server-side.
5. **Human-in-the-Loop AI Guardrails**:
   - AI task expansion, subtask breakdown, and priority proposals exist only as transient in-memory objects in the frontend until the user explicitly reviews and commits them via standard CRUD endpoints.
   - Zero silent mutations occur without explicit human approval.

---

## 6. Verification and Test Results

### Local & Backend Automated Test Suites:
- **Full Backend Pytest Suite**: 106 passed out of 106 tests across 9 test modules:
  - `test_ai_productivity.py`: 13 passed (100%)
  - `test_auth.py`: 11 passed (100%)
  - `test_conversational_rag.py`: 10 passed (100%)
  - `test_documents.py`: 12 passed (100%)
  - `test_projects.py`: 6 passed (100%)
  - `test_rag.py`: 11 passed (100%)
  - `test_search.py`: 11 passed (100%)
  - `test_tasks.py`: 7 passed (100%)
  - `test_workspaces.py`: 25 passed (100%)
- **Frontend Linter (`oxlint`)**: 0 errors on 33 source files.
- **Frontend Production Build (`npm run build`)**: `tsc -b && vite build` succeeded in 649 ms with zero TypeScript or packaging errors.

### 10-Scenario Production Readiness Verification Suite:
Executed against live FastAPI instance, Supabase PostgreSQL, Supabase Storage, and Groq LLM API:

| # | Check Description | Verified Behavior | Status |
|---|-------------------|-------------------|--------|
| **1** | Register, Login & JWT Navigation | Successfully created user, acquired JWT access token, and navigated protected `/api/v1/auth/me`. | **PASSED** |
| **2** | Workspace, Project & Task CRUD | Created workspace, project, and high-priority task with deadlines. | **PASSED** |
| **3** | Document Upload, Extraction & Indexing | Uploaded text file to Supabase Storage; extracted text; generated FastEmbed 384-dim embeddings into `document_chunks`. | **PASSED** |
| **4** | Semantic Search Vector Retrieval | Queried vector index using cosine distance operator `<=>`; returned relevant match (`distance: 0.2776`, Tier: moderate). | **PASSED** |
| **5** | Grounded Conversational RAG & Citations | Created conversation thread; Groq LLM generated grounded response citing `deployment_specs.txt` (`similarity_score: 0.74`). | **PASSED** |
| **6** | Zero-Hallucination Out-of-Domain Abstention | Submitted pizza dough query; system returned 0 citations and honest insufficient-evidence response without hallucinating. | **PASSED** |
| **7** | AI Task Proposal Guardrail | Generated structured description and 5 acceptance criteria; verified database task count remained strictly 1 with zero silent mutation. | **PASSED** |
| **8** | Factual Metrics Synthesis | Evaluated project progress summary; verified factual metrics strip (`total: 1`, `todo: 1`, `completed: 0`, `completion: 0%`) matched database records exactly. | **PASSED** |
| **9** | Cross-Project Boundaries & Storage Security | Secondary user attempted project/document access and was rejected with `HTTP 403 Forbidden`; primary user received authenticated signed URL. | **PASSED** |
| **10** | Provider Failure & Error Translation | Injected gateway timeout; verified system translated failure to `HTTP 504 Gateway Timeout` with structured error payload. | **PASSED** |

---

## 7. Deployment Handoff & Manual Dashboard Instructions

The codebase is committed to the GitHub repository:
`https://github.com/Bhomaramsuthar/Sync-Ai-Productivity-Platform.git` (branch `main`).

To complete cloud deployment without purchasing any plans or sharing secrets, perform the following two manual dashboard actions:

### Step 1: Deploy Backend to Render
1. Log in to [dashboard.render.com](https://dashboard.render.com).
2. Click **New +** -> **Web Service**.
3. Connect your GitHub repository `Bhomaramsuthar/Sync-Ai-Productivity-Platform`.
4. Render will detect the repository. Configure the following settings:
   - **Name**: `sync-ai-productivity-backend` (or your preferred name)
   - **Region**: `Singapore` (closest to Mumbai Supabase)
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt && alembic upgrade head`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
5. In the **Environment Variables** section, add the following variables:
   - `ENVIRONMENT` = `production`
   - `DATABASE_URL` = `postgresql+psycopg://postgres.[YOUR_PROJECT_REF]:[YOUR_PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:5432/postgres` *(Use your Supabase pooler connection string)*
   - `JWT_SECRET` = *(Generate a 32+ character random secret)*
   - `SUPABASE_URL` = `https://[YOUR_PROJECT_REF].supabase.co`
   - `SUPABASE_KEY` = `[YOUR_SUPABASE_SERVICE_ROLE_KEY]`
   - `LLM_PROVIDER` = `groq`
   - `GROQ_API_KEY` = `[YOUR_GROQ_API_KEY]`
   - `LLM_MODEL` = `openai/gpt-oss-120b`
   - `EMBEDDING_PROVIDER` = `fastembed`
   - `EMBEDDING_MODEL` = `BAAI/bge-small-en-v1.5`
   - `EMBEDDING_DIMENSION` = `384`
   - `RAG_MAX_DISTANCE` = `0.45`
6. Click **Create Web Service**.
7. Once deployment finishes, note your public backend URL (e.g., `https://sync-ai-productivity-backend.onrender.com`).
8. Verify liveness by visiting `https://sync-ai-productivity-backend.onrender.com/health` in your browser.

### Step 2: Deploy Frontend to Vercel
1. Log in to [vercel.com](https://vercel.com).
2. Click **Add New...** -> **Project**.
3. Import the GitHub repository `Bhomaramsuthar/Sync-Ai-Productivity-Platform`.
4. In **Project Settings**:
   - **Framework Preset**: `Vite`
   - **Root Directory**: Click "Edit" and select `frontend`
   - **Build Command**: `npm run build` (default)
   - **Output Directory**: `dist` (default)
5. Under **Environment Variables**, add:
   - `VITE_API_URL` = `https://[YOUR_RENDER_BACKEND_URL]/api/v1` *(e.g. `https://sync-ai-productivity-backend.onrender.com/api/v1`)*
6. Click **Deploy**.
7. Once deployed, test navigation, page refresh on `/workspaces`, login, task management, document upload, and AI chat.
8. *(Optional)*: In Render dashboard under Environment Variables, update `CORS_ORIGINS` with your assigned Vercel URL (e.g. `https://sync-ai-productivity-platform.vercel.app`).

---

## 8. Verified Progress & Status

- **Week 13 Status**: **READY FOR DEPLOYMENT** (All configuration files, environment documentation, SPA routing rules, CORS policies, Supabase schema checks, and end-to-end verification tests completed).
- **Week 14**: Not started, reserved for subsequent testing & evaluation phase as instructed.
