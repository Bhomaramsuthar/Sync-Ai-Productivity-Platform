# User Flows

This document outlines the primary user journeys and interactions within the AI-Driven Collaboration & Productivity Platform, detailing the UI, backend operations, database interactions, and security requirements.

## 0. Frontend Page Hierarchy

PUBLIC:
- `/login`
- `/register`

AUTHENTICATED:
- `/dashboard`
- `/workspaces/:workspaceId`
- `/workspaces/:workspaceId/projects`
- `/workspaces/:workspaceId/projects/:projectId`
- `/workspaces/:workspaceId/projects/:projectId/overview`
- `/workspaces/:workspaceId/projects/:projectId/tasks`
- `/workspaces/:workspaceId/projects/:projectId/kanban`
- `/workspaces/:workspaceId/projects/:projectId/calendar`
- `/workspaces/:workspaceId/projects/:projectId/documents`
- `/workspaces/:workspaceId/projects/:projectId/ai`
- `/settings`

---

## 1. New user registration/login
*   **MVP**: Yes
*   **Starting point**: Landing Page
*   **User action**: Fills out registration or login form and submits.
*   **UI/page**: Registration/Login Page
*   **Backend operation**: `POST /api/v1/auth/register` or `POST /api/v1/auth/login`. Hashes password, verifies credentials, generates JWT.
*   **Database operation**: `INSERT INTO User` or `SELECT FROM User`
*   **Result**: User is authenticated, receives a JWT, and is redirected to the Dashboard.
*   **Possible error**: Invalid credentials, Email already exists.
*   **Permission/security requirement**: Public route.

## 2. Creating a workspace
*   **MVP**: Yes
*   **Starting point**: Dashboard
*   **User action**: Clicks "Create Workspace", enters name and description, and submits.
*   **UI/page**: Workspace Creation Modal/Page
*   **Backend operation**: `POST /api/v1/workspaces`
*   **Database operation**: `INSERT INTO Workspace`, `INSERT INTO WorkspaceMember` (with OWNER role).
*   **Result**: Workspace created, user redirected to the Workspace Dashboard.
*   **Possible error**: Validation error (e.g., missing name).
*   **Permission/security requirement**: Must be authenticated.

## 3. Adding/inviting team members
*   **MVP**: Yes
*   **Starting point**: Workspace Settings
*   **User action**: Enters an email address, selects a role, and clicks "Invite".
*   **UI/page**: Members Management Page
*   **Backend operation**: `POST /api/v1/workspaces/{workspaceId}/members`
*   **Database operation**: `INSERT INTO WorkspaceMember`, `INSERT INTO Notification`.
*   **Result**: Member is added to the workspace and notified.
*   **Possible error**: User not found, User already in workspace.
*   **Permission/security requirement**: Must be authenticated and hold a Workspace ADMIN or OWNER role.

## 4. Creating a project
*   **MVP**: Yes
*   **Starting point**: Workspace Dashboard
*   **User action**: Clicks "New Project", enters details (name, description, dates), and submits.
*   **UI/page**: Project Creation Modal
*   **Backend operation**: `POST /api/v1/workspaces/{workspaceId}/projects`
*   **Database operation**: `INSERT INTO Project`, `INSERT INTO ProjectMember`.
*   **Result**: Project is created; user is redirected to the Project Overview.
*   **Possible error**: Validation error.
*   **Permission/security requirement**: Must be a member of the workspace.

## 5. Project overview
*   **MVP**: Yes
*   **Starting point**: Workspace Dashboard
*   **User action**: Clicks on a project card.
*   **UI/page**: Project Overview Page
*   **Backend operation**: `GET /api/v1/projects/{projectId}`
*   **Database operation**: `SELECT FROM Project`, `SELECT FROM Task`.
*   **Result**: Displays project details, progress metrics, and recent activity.
*   **Permission/security requirement**: Must be a member of the project.

## 6. Creating a task
*   **MVP**: Yes
*   **Starting point**: Project Overview / Kanban Board
*   **User action**: Clicks "New Task", enters title and description, and submits.
*   **UI/page**: Task Creation Modal
*   **Backend operation**: `POST /api/v1/projects/{projectId}/tasks`
*   **Database operation**: `INSERT INTO Task`.
*   **Result**: Task is added to the BACKLOG or TODO status.
*   **Permission/security requirement**: Must be a member of the project.

## 7. Assigning a task
*   **MVP**: Yes
*   **Starting point**: Task Detail Modal / Kanban Card
*   **User action**: Selects an assignee from a dropdown list.
*   **UI/page**: Task Detail Modal
*   **Backend operation**: `PUT /api/v1/tasks/{taskId}/assignee`
*   **Database operation**: `UPDATE Task SET assigneeId`, `INSERT INTO Notification`.
*   **Result**: Task is assigned, and the assignee receives a notification.
*   **Permission/security requirement**: Must be a member of the project.

## 8. Moving tasks through Kanban
*   **MVP**: Yes
*   **Starting point**: Kanban Board
*   **User action**: Drags a task from one column (e.g., TODO) and drops it into another (e.g., IN_PROGRESS).
*   **UI/page**: Kanban Board Page
*   **Backend operation**: `PUT /api/v1/tasks/{taskId}/status`
*   **Database operation**: `UPDATE Task SET status = ...`, `INSERT INTO Activity`.
*   **Result**: UI updates column placement, and backend state is saved.
*   **Permission/security requirement**: Must be a member of the project.

## 9. Adding comments
*   **MVP**: Yes
*   **Starting point**: Task Detail Modal
*   **User action**: Types a comment into the input field and clicks "Send".
*   **UI/page**: Task Comments Section
*   **Backend operation**: `POST /api/v1/tasks/{taskId}/comments`
*   **Database operation**: `INSERT INTO Comment`, `INSERT INTO Notification`.
*   **Result**: Comment is appended to the thread.
*   **Permission/security requirement**: Must be a member of the project.

## 10. Creating/uploading documents
*   **MVP**: Yes
*   **Starting point**: Documents Page
*   **User action**: Clicks "New Document", types content, or uploads a file.
*   **UI/page**: Document Editor / Upload Modal
*   **Backend operation**: `POST /api/v1/workspaces/{workspaceId}/documents` (or `/upload`).
*   **Database operation**: `INSERT INTO Document` (and file storage mapping in Supabase).
*   **Result**: Document is saved and available to the workspace.
*   **Permission/security requirement**: Must be a member of the workspace.

## 11. Asking AI questions
*   **MVP**: Yes
*   **Starting point**: AI Assistant Chat Panel
*   **User action**: Types a question (e.g., "What was the decision on the API spec?") and sends.
*   **UI/page**: AI Chat Interface
*   **Backend operation**: `POST /api/v1/ai/document-question` (FastAPI). Extracts embeddings, searches pgvector, queries LLM.
*   **Database operation**: `SELECT FROM DocumentChunk` using pgvector similarity search.
*   **Result**: AI responds with an answer grounded in the retrieved document context.
*   **Permission/security requirement**: Backend ensures RAG search only pulls chunks from documents the user is authorized to view.

## 12. AI-generated task suggestions
*   **MVP**: Yes
*   **Starting point**: Project Overview / AI Chat
*   **User action**: Asks AI to break down a larger goal into tasks.
*   **UI/page**: AI Suggestion Modal / Chat
*   **Backend operation**: `POST /api/v1/ai/generate-tasks` (FastAPI).
*   **Result**: AI returns a structured JSON list of suggested tasks, presented in UI for user review.

## 13. AI performing an action through a tool
*   **MVP**: Yes
*   **Starting point**: AI Chat Panel
*   **User action**: Types a command (e.g., "Assign the backend tasks to Alice").
*   **UI/page**: AI Chat Interface
*   **Backend operation**: FastAPI processes intent, triggers tool, calls internal logic to update task.
*   **Database operation**: `UPDATE Task` (via FastAPI).
*   **Result**: Tasks are updated; AI responds with confirmation text.
*   **Permission/security requirement**: Backend must verify that the user initiating the AI request has permission to modify those specific tasks.

## 14. Confirmation before important AI actions
*   **MVP**: Yes
*   **Starting point**: AI Chat Panel
*   **User action**: Types a destructive command (e.g., "Delete all my completed tasks").
*   **UI/page**: AI Chat Interface / Confirmation Dialog
*   **Backend operation**: AI identifies the destructive intent and returns a "Requires Confirmation" payload instead of executing.
*   **Result**: UI displays a confirmation dialog: "Are you sure you want to delete 5 tasks?"

## 15. Completing a project
*   **MVP**: Yes
*   **Starting point**: Project Settings / Dashboard
*   **User action**: Changes the project status to "Completed" and confirms.
*   **UI/page**: Project Settings Modal
*   **Backend operation**: `PUT /api/v1/projects/{projectId}`
*   **Database operation**: `UPDATE Project SET status = 'COMPLETED'`.
*   **Result**: Project is marked complete and visually archived.
