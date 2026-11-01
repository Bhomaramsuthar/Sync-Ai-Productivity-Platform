# Global Workspace-Aware AI Assistant — Architecture & Implementation Plan

**Date**: October 2026  
**Document**: `docs/GLOBAL_AI_ASSISTANT_PLAN.md`  
**Platform**: Sync AI (AI-Driven Collaboration & Productivity Platform)  
**Author**: Antigravity Full-Stack & RAG Engineering Team  

---

## 1. Executive Summary

This document specifies the technical architecture, security model, and implementation plan for a global, workspace-aware AI assistant inspired by Notion AI chat for the Sync AI platform.

The assistant is accessible from any authenticated screen via a floating button fixed at the bottom-right corner. It supports multi-scope context queries:
1. **My accessible account data** (`GLOBAL`): Aggregates user assignments, deadlines, accessible workspaces, and personal productivity across all authorized spaces.
2. **Current workspace** (`WORKSPACE`): Answers questions about workspace members, all projects, calendar schedules, workspace-wide meetings, and activity.
3. **Current project** (`PROJECT`): Deep dives into project tasks, documents, semantic chunks, transcripts, and milestone progress.

---

## 2. Phase 1 — Codebase Audit & Reuse Matrix

### 2.1 Existing Authentication & Authorization
- **Location**: [`backend/app/auth/dependencies.py`](file:///s:/final-year-project/ai-productivity-platform/backend/app/auth/dependencies.py), [`backend/app/core/security.py`](file:///s:/final-year-project/ai-productivity-platform/backend/app/core/security.py)
- **Mechanism**: Custom JWT tokens with `HS256` signed with `JWT_SECRET`.
- **Dependencies**: `get_current_user` extracts `user.id` and validates active user state in the database.
- **Reuse Strategy**: The assistant endpoints will strictly rely on `get_current_user` to derive user identity directly from verified JWT claims. No client-supplied user IDs will ever be trusted.

### 2.2 Data Models Present in the Codebase

| Model | Table | Key Attributes | Assistant Relevance |
|---|---|---|---|
| `User` | `users` | `id`, `name`, `email`, `role`, `preferences_json` | Profile info, assigned tasks, user greeting, preferences |
| `Workspace` | `workspaces` | `id`, `name`, `description`, `owner_id` | Workspace scope root, workspace summaries |
| `WorkspaceMember` | `workspace_members` | `id`, `user_id`, `workspace_id`, `role` | Server-side authorization verification, team directory |
| `Project` | `projects` | `id`, `workspace_id`, `name`, `description`, `status` | Project scope root, project descriptions, status tracking |
| `Task` | `tasks` | `id`, `title`, `description`, `status`, `priority`, `due_date`, `assignee_id` | Live task status, workload distribution, deadline queries |
| `ProjectActivity` | `project_activities` | `id`, `project_id`, `actor_id`, `event_type`, `event_metadata` | Audit log, recent project updates, activity questions |
| `Document` | `documents` | `id`, `filename`, `file_type`, `status`, `extracted_text`, `indexing_status` | Source document metadata, extracted document texts |
| `DocumentChunk` | `document_chunks` | `id`, `document_id`, `project_id`, `chunk_index`, `content`, `embedding` | Semantic vector search, passage citations |
| `CalendarEvent` | `calendar_events` | `id`, `title`, `description`, `start_time`, `end_time`, `workspace_id` | Meeting schedules, milestone dates, calendar queries |
| `Meeting` | `meetings` | `id`, `title`, `status`, `scheduled_start`, `meeting_code`, `transcript_status` | Meeting records, agendas |
| `TranscriptSegment`| `transcript_segments` | `id`, `meeting_id`, `speaker_name`, `text`, `start_time` | Speech transcript passages, meeting discussion facts |
| `MeetingAISummary` | `meeting_ai_summaries` | `id`, `meeting_id`, `summary_text`, `action_items_json`, `decisions_json` | Meeting key decisions, action items, executive summaries |
| `Conversation` | `conversations` | `id`, `user_id`, `workspace_id`, `project_id`, `title` | Assistant conversation tracking |
| `Message` | `messages` | `id`, `conversation_id`, `sender_role`, `content`, `citations_json` | Chat turn persistence, structured citation records |

> [!NOTE]
> **Audit Finding on "Project Spaces"**: The prompt mentions "Current project space, if supported by the existing data model". The inspection confirms that "Project Spaces" do not exist in this database schema; the hierarchy is Workspace -> Project -> Entities. Thus, the three real scopes implemented are **Account / Global**, **Workspace**, and **Project**.

### 2.3 Existing RAG, Embeddings, & LLM Pipeline
- **Chunking**: [`backend/app/rag/chunking.py`](file:///s:/final-year-project/ai-productivity-platform/backend/app/rag/chunking.py) (`chunk_text` with overlap).
- **Embeddings Provider**: [`backend/app/rag/embeddings/factory.py`](file:///s:/final-year-project/ai-productivity-platform/backend/app/rag/embeddings/factory.py) (`FastEmbed` default 384 dim, `OpenAIProvider`, `MockEmbeddingProvider`).
- **Vector Search**: [`backend/app/rag/service.py`](file:///s:/final-year-project/ai-productivity-platform/backend/app/rag/service.py) (`search_document_chunks` with pgvector `<=>` cosine distance and SQLite offline math fallback).
- **LLM Provider**: [`backend/app/ai/llm/factory.py`](file:///s:/final-year-project/ai-productivity-platform/backend/app/ai/llm/factory.py) (Groq, OpenAI, and Mock).
- **Prompt Grounding**: [`backend/app/ai/rag_pipeline.py`](file:///s:/final-year-project/ai-productivity-platform/backend/app/ai/rag_pipeline.py) (`SYSTEM_PROMPT` containing prompt injection defense, strict citation formatting).

### 2.4 Existing Frontend UI & Tokens
- **Shell**: [`frontend/src/components/AppLayout.tsx`](file:///s:/final-year-project/ai-productivity-platform/frontend/src/components/AppLayout.tsx) renders sidebar, breadcrumbs, header, and `<Outlet />` for all authenticated views.
- **Styling**: [`frontend/src/index.css`](file:///s:/final-year-project/ai-productivity-platform/frontend/src/index.css) defines modern CSS variables (`--bg-primary`, `--bg-card`, `--border-subtle`, `--accent-primary`, `--radius-lg`, etc.) and both dark and light theme tokens.
- **Components**: `ThinkingLoader`, `SelectBox`, `toast`, and inline markdown renderer in `DocumentChat.tsx`.

---

## 3. Missing Functionality & Gap Analysis

1. **Conversations Schema Limitations**:
   - `conversations.workspace_id` and `conversations.project_id` are currently `nullable=False` foreign keys.
   - Global (Account-level) conversations cannot exist without a project ID.
   - *Fix*: Create a clean, reversible Alembic migration making `project_id` and `workspace_id` nullable, and adding a `scope` column (`VARCHAR(20)`, default `'PROJECT'`).
2. **Multi-Scope Hybrid Retrieval**:
   - Existing RAG was restricted solely to document chunks in a single project.
   - It lacked structured database queries for live tasks, upcoming deadlines, team members, and meeting summaries.
   - *Fix*: Implement `GlobalAssistantService` that combines live database records (structured facts) with semantic vector search (unstructured text) filtered strictly by the authorized scope.
3. **Global Floating UI & Scope Navigation**:
   - The platform lacked a universal floating trigger and slide-out panel.
   - *Fix*: Create `GlobalAIAssistant` component embedded in `AppLayout.tsx` with Notion AI aesthetics, automatic route context detection, scope switcher, expandable sources drawer, and responsive mobile layout.

---

## 4. Architecture & Data Flow

```
+-----------------------------------------------------------------------------------+
|                            GlobalAIAssistant (React UI)                           |
|  - Floating Trigger (bottom-right)                                                |
|  - Notion AI Drawer (Right Slide-out)                                             |
|  - Scope Selector: [ Global / Account | Workspace: Team A | Project: Core Engine ]|
|  - Route Context Auto-Detection (URL -> active workspace / project)               |
+-----------------------------------------------------------------------------------+
                                        |
                            POST /api/v1/ai/assistant/...
                                        v
+-----------------------------------------------------------------------------------+
|                        GlobalAssistantService (FastAPI)                           |
|  1. Verify JWT User & DB Membership for requested scope                           |
|  2. Structured Query Resolution:                                                  |
|     - Tasks (Status, due date, assignee, priority)                                |
|     - Projects (Descriptions, active status)                                      |
|     - Workspace Members (Directory, roles)                                        |
|     - Meetings & Action Items (Summaries, transcript segments)                    |
|     - Calendar Events (Upcoming schedule)                                         |
|  3. Semantic Vector Search:                                                       |
|     - Document chunks bounded by authorized project / workspace                   |
|  4. Grounding & Anti-Injection Context Assembly:                                  |
|     - Bounded character limit (4,000 chars)                                       |
|     - Untrusted data delimiters                                                   |
|  5. LLM Provider Execution (Groq / OpenAI / Mock):                                |
|     - Generates answer citing exact source IDs                                    |
|  6. Persist Message & Structured Citations in Database                            |
+-----------------------------------------------------------------------------------+
```

---

## 5. Security & Isolation Strategy

1. **Identity & Tenant Boundaries**:
   - Every request validates that `current_user` is an active member of the targeted workspace and project.
   - If a user is not a member of the workspace or project, the API responds with HTTP 403 Forbidden.
2. **Pre-Query Filtering (No In-Memory Post Filtering)**:
   - Vector similarity queries (`search_document_chunks`) and SQL queries filter by `workspace_id` and `project_id` inside the database query before records reach the application or LLM.
3. **Untrusted Data Isolation**:
   - All retrieved documents, transcripts, and user descriptions are enclosed within explicit untrusted quote delimiters.
   - The system prompt forbids following instructions or system prompts contained inside document passages.
4. **Graceful Degraded States**:
   - If no evidence matches the question, the assistant states what was searched and that no sufficient evidence exists, refusing to hallucinate.
   - If the LLM provider is unconfigured, the endpoint returns HTTP 503 with actionable error guidance.

---

## 6. Implementation Stages

- **Stage 1**: Database migration for conversation scope flexibility.
- **Stage 2**: `GlobalAssistantService` backend orchestration (structured fact querying + semantic chunk retrieval + prompt synthesis).
- **Stage 3**: Assistant API routes (`/api/v1/ai/assistant/conversations`, `/messages`, list, rename, delete).
- **Stage 4**: Frontend `assistantService.ts` and `GlobalAIAssistant` UI component with Notion AI aesthetic.
- **Stage 5**: Automated backend tests verifying multi-scope answers, cross-workspace isolation, member revocation, live task status updates, and citation links.
- **Stage 6**: Verification, frontend build validation, and final report.
