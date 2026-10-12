# API Specification

Base URL: `/api/v1`

---

# Authentication

## Register
`POST /api/v1/auth/register`

## Login
`POST /api/v1/auth/login`

## Logout
`POST /api/v1/auth/logout`

## Current User
`GET /api/v1/auth/me`

---

## Workspaces

`POST /api/v1/workspaces`
`GET /api/v1/workspaces`
`GET /api/v1/workspaces/{workspaceId}`
`PUT /api/v1/workspaces/{workspaceId}`
`DELETE /api/v1/workspaces/{workspaceId}`

---

## Workspace Members

`GET /api/v1/workspaces/{workspaceId}/members`
`POST /api/v1/workspaces/{workspaceId}/members`
`PUT /api/v1/workspaces/{workspaceId}/members/{memberId}`
`DELETE /api/v1/workspaces/{workspaceId}/members/{memberId}`

---

## Projects

`POST /api/v1/workspaces/{workspaceId}/projects`
`GET /api/v1/workspaces/{workspaceId}/projects`
`GET /api/v1/projects/{projectId}`
`PUT /api/v1/projects/{projectId}`
`DELETE /api/v1/projects/{projectId}`
`GET /api/v1/projects/{projectId}/activity`

---

## Tasks

`POST /api/v1/projects/{projectId}/tasks`
`GET /api/v1/projects/{projectId}/tasks`
  - **Query Parameters**:
    - `status` (string, optional): Filter tasks by specific status (e.g., TODO, IN_PROGRESS).
    - `priority` (string, optional): Filter tasks by priority level (e.g., HIGH, CRITICAL).
    - `assigneeId` (UUID, optional): Filter tasks assigned to a specific user.
    - `search` (string, optional): Search query for task title and description.
    - `sort` (string, optional): Field and direction to sort by (e.g., `createdAt:desc`, `deadline:asc`).
    - `page` (integer, optional): The page number to fetch for pagination (default: 1).
    - `pageSize` (integer, optional): Number of tasks per page (default: 20).
`GET /api/v1/tasks/{taskId}`
`PUT /api/v1/tasks/{taskId}`
`DELETE /api/v1/tasks/{taskId}`
`PUT /api/v1/tasks/{taskId}/status`
`PUT /api/v1/tasks/{taskId}/assignee`
`PUT /api/v1/tasks/{taskId}/priority`
`PUT /api/v1/tasks/{taskId}/deadline`

---

## Subtasks

`POST /api/v1/tasks/{taskId}/subtasks`
`GET /api/v1/tasks/{taskId}/subtasks`
`PUT /api/v1/subtasks/{subtaskId}`
`DELETE /api/v1/subtasks/{subtaskId}`
`PUT /api/v1/subtasks/{subtaskId}/status`

---

## Comments

`POST /api/v1/tasks/{taskId}/comments`
`GET /api/v1/tasks/{taskId}/comments`
`PUT /api/v1/comments/{commentId}`
`DELETE /api/v1/comments/{commentId}`

---

## Documents

`POST /api/v1/projects/{projectId}/documents` - Upload document and enqueue background text extraction
`GET /api/v1/projects/{projectId}/documents` - List project documents
`GET /api/v1/documents/{documentId}` - Get document details and download URL
`GET /api/v1/documents/{documentId}/status` - Get document processing status and safe error details
`GET /api/v1/documents/{documentId}/text` - Get extracted plain text and character count (authorized project members only)
`POST /api/v1/documents/{documentId}/retry` - Retry text extraction for a failed or stalled document
`GET /api/v1/documents/{documentId}/indexing-status` - Get document vector indexing status and chunk count
`POST /api/v1/documents/{documentId}/retry-indexing` - Retry vector indexing for a document whose text extraction is READY
`GET /api/v1/documents/{documentId}/chunks` - Retrieve chunk metadata and text snippets for project members
`POST /api/v1/projects/{projectId}/documents/search` - Semantic search across indexed document chunks using pgvector
`DELETE /api/v1/documents/{documentId}` - Delete document, storage file, and all associated vector chunks

---

## Calendar

`GET /api/v1/workspaces/{workspaceId}/calendar`
`POST /api/v1/workspaces/{workspaceId}/calendar/events`
`PUT /api/v1/calendar/events/{eventId}`
`DELETE /api/v1/calendar/events/{eventId}`

---

## Notifications

`GET /api/v1/notifications`
`PUT /api/v1/notifications/{notificationId}/read`
`PUT /api/v1/notifications/read-all`

---

## AI

`POST /api/v1/ai/chat`
`GET /api/v1/ai/conversations`
`GET /api/v1/ai/conversations/{conversationId}/messages`
`POST /api/v1/ai/summarize`
`POST /api/v1/ai/generate-tasks`
`POST /api/v1/ai/prioritize-tasks`
`POST /api/v1/ai/project-summary`

---

## RAG

`POST /api/v1/rag/documents/{documentId}/process`
`POST /api/v1/rag/search`
`POST /api/v1/ai/document-question`

---

## AI Tools

The AI may request controlled backend operations executed directly via FastAPI services.

Available tools:
- `get_tasks`
- `create_task`
- `update_task`
- `get_project`
- `search_documents`
- `get_team_members`

Every tool request must be authenticated using JWT and authorized.
Destructive or important actions require user confirmation.

--- 

## API Rules

- Use REST style endpoints.
- Use JSON.
- Use consistent HTTP status codes.
- Validate request bodies using Pydantic.
- Return structured error responses.
- Never expose passwords.
- Never trust user-provided workspace/project ownership.
- Check authorization on every protected resource using JWT.
- Use pagination for large collections.
- Use schemas (Pydantic) rather than exposing SQLAlchemy database models directly.

## Standard Error Format

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```