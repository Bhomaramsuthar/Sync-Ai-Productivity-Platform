# AI System Specification

## 1. Objective

The AI subsystem provides intelligent assistance for project management, productivity, document understanding, and controlled interaction with project data.

---

# 2. AI Service

Technology:

Python
FastAPI (Integrated into main backend)
OpenAI-compatible LLM Provider

The AI service is built directly into the FastAPI backend (within `backend/app/ai/`).
It accesses application data via internal backend services.

The AI service must NOT directly access the PostgreSQL application database without using the service layer.

---

# 3. AI Features

## AI Chat

Users can communicate with the AI assistant using natural language.

Example:

User:

"Show me my overdue tasks."

The AI should retrieve the relevant task data through an authorized backend internal service (tool call).

---

## Task Generation & Engineering Assistant (Week 12 Implemented)

Input:
Task title, optional existing description, or project scope context.

Capabilities:
1. **Description & Acceptance Criteria Expansion**: Transforms short titles into structured 2-4 sentence descriptions with testable checkbox acceptance criteria and recommended priority.
2. **Subtask Breakdown**: Decomposes larger tasks or epics into 3-6 logical, non-overlapping subtasks with suggested priorities.
3. **Objective Priority Suggestion**: Recommends `LOW`, `MEDIUM`, `HIGH`, or `URGENT` with transparent justification based on task deadline and project context.
4. **Blocker Unblocking**: Analyzes user-identified blockers and outputs immediate next action, 2-4 concrete unblocking steps, and rationale.

Guardrails:
- Output is validated using Pydantic V2 schemas (`TaskExpandResponse`, `TaskBreakdownResponse`, `TaskPrioritySuggestionResponse`, `TaskUnblockResponse`).
- Strict User Confirmation: Suggestions remain in proposal state and are NEVER persisted or modified in the database without explicit user confirmation.

---

## AI Project Progress Summary (Week 12 Implemented)

Input:
Live database records for authorized project members (tasks, deadlines, priorities, assignees, and persistent project activities).

Output:
Structured summary distinguishing live factual metrics from AI analysis:
- **Factual Metrics Strip**: Total tasks, completed tasks, in-progress tasks, to-do tasks, overdue task count, completion percentage, overdue task items (IDs & titles), upcoming deadlines (next 7 days), and recent logged activity count.
- **AI Narrative Progress Analysis**: Concise 2-3 sentence executive summary of delivery health.
- **Key Highlights**: Real achievements derived from completed tasks and logged events.
- **Potential Blockers & Risks**: Real risks derived from overdue tasks or unassigned urgent items.
- **Actionable Next Steps**: Structured recommendations referencing real task IDs and titles.

Guardrails:
- Never invents tasks, team members, deadlines, or completed work.
- Empty Project Handling: Zero LLM calls when a project has 0 tasks; immediately returns factual zeros and setup guidance.
- Missing Provider Handling: If `LLM_API_KEY` or `GROQ_API_KEY` is missing, returns `503 LLM_NOT_CONFIGURED` while deterministic metrics remain operational.

---

## Context-Aware Productivity Insights (Week 12 Implemented)

Combines deterministic rules for factual metrics and task status checks with optional AI natural-language synthesis:
- **Rule 1 (Overdue Risk)**: Tasks with past due dates not in `DONE` status are flagged with days overdue, priority, and link to the task.
- **Rule 2 (Unassigned High Priority)**: Tasks marked `HIGH` or `URGENT` without an assignee are flagged with an immediate assignment recommendation.
- **Rule 3 (Stagnant Work)**: Tasks in `IN_PROGRESS` or `IN_REVIEW` open for > 7 days are flagged for progress verification.
- **Rule 4 (Approaching Deadlines)**: Tasks due within 48 hours are highlighted for final review.
- Every recommendation contains `id`, `type`, `priority`, `title`, `explanation` (why produced), and `suggested_action`.

---

# 4. RAG & Conversational Question Answering (Week 11 Implemented)

The RAG system allows users to have persistent, multi-turn conversations grounded in project documents.

Pipeline:

```text
Document
    ↓
Text Extraction (PDF, TXT, MD, DOCX, CSV)
    ↓
Text Chunking (Paragraph-aware, 800-1000 chars, 150 chars overlap)
    ↓
Embedding Generation (FastEmbed BAAI/bge-small-en-v1.5, 384 dim, local ONNX CPU)
    ↓
pgvector vector(384) in Supabase PostgreSQL (document_chunks table)
    ↓
Semantic Search (Cosine distance operator <=>)
    ↓
Relevance Threshold Filtering (distance <= 0.45)
    ├─ If no chunks qualify: Immediate insufficient-evidence response (No hallucination, 0 LLM calls)
    └─ If relevant chunks qualify:
            ↓
       Bounded Context & History Construction (Top 5 chunks, max 4000 chars, last 6 messages)
            ↓
       LLM Provider via Provider-Neutral Interface (OpenAI, Groq, OpenRouter, Google AI Studio, Mock)
            ↓
       Strict Safety & Evidence Grounding Prompt (Untrusted document data defense)
            ↓
       Grounded Answer + Structured Citations
            ↓
       Database Persistence (conversations & messages with citations_json)
```

### Safety & Guardrails:
1. **Untrusted Data Isolation**: Document passages are labeled and treated strictly as untrusted excerpt text; commands embedded within documents are neutralized.
2. **Relevance Thresholding**: Unrelated queries receive zero citations and an honest notification rather than a fabricated answer.
3. **Structured Citation Verification**: Citations are derived exclusively from chunks retrieved and verified by the backend.
4. **Project Scoping**: Strict workspace/project isolation prevents cross-project information leakage.

---

# 5. AI Tools

The AI assistant may use:

### get_tasks()

Retrieve tasks available to the authenticated user.

### create_task()

Create a task after authorization and confirmation.

### update_task()

Modify task information.

### get_project()

Retrieve project information.

### search_documents()

Search project/workspace documents using semantic search.

### get_team_members()

Retrieve members that the authenticated user is allowed to access.

---

# 6. Authorization

AI must never decide authorization.

Authorization is always handled by the backend logic layer.

Example:

```text
User
 ↓
AI Route (FastAPI)
 ↓
LLM Tool Request
 ↓
FastAPI Service Layer
 ↓
JWT validation & Permission check
 ↓
Business logic
 ↓
Database
```
---

# 7. Confirmation

The AI must ask for confirmation before important actions such as:

- Creating multiple tasks
- Deleting tasks
- Changing task assignments
- Changing deadlines
- Major project modifications

Example:

```text
I found 6 action items.

Would you like me to create these as tasks?
```

---

# 8. AI Safety
- Validate structured AI output with Pydantic.
- Never trust AI-generated IDs.
- Never trust AI-generated permissions.
- Never allow direct database access bypassing the service layer.
- Log important AI actions.
- Require confirmation for destructive actions.
- Handle model/API failures gracefully.

---

# 9. AI Evaluation

AI functionality will be evaluated based on:

- Response relevance
- Task extraction accuracy
- Summarization quality
- RAG retrieval quality
- Hallucination rate
- Tool-calling correctness
- Response latency