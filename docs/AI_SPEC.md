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

## Task Generation

Input:

Project description or document.

Output:

Structured task suggestions.

Example:

```json
[
  {
    "title": "Implement authentication",
    "priority": "HIGH",
    "estimatedHours": 8
  }
]
```
The backend must validate the generated structure (using Pydantic) before creating tasks.

---

## Task Prioritization

The system should analyze:

- Deadline
- Priority
- Dependencies
- Estimated effort
- Current status
- Project importance

and provide recommended task ordering.

---

## Project Summary

The AI can summarize:

- Project progress
- Completed tasks
- Pending tasks
- Overdue tasks
- Risks
- Important activity

---

## Meeting Summarization

Input:

Meeting transcript/text.

Output:

- Summary
- Decisions
- Action items
- Suggested tasks

---

# 4. RAG

The RAG system will allow users to ask questions about uploaded project documents.

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
Semantic Search (Cosine / vector distance)
    ↓
Relevant Chunks
    ↓
LLM
    ↓
Answer
```

The AI response should be grounded in retrieved document context.

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