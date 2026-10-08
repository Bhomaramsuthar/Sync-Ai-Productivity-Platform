# Week 1 Requirements & Architecture Review

## 1. Product Summary
The AI-Driven Collaboration & Productivity Platform is a centralized workspace designed to replace fragmented toolsets (like Notion, Jira, Slack, and ChatGPT) with a single, unified application. It combines document management, project and task tracking (via Kanban boards), and scheduling. These core features are enhanced by a context-aware AI assistant capable of answering questions based on project documents (using RAG), summarizing text, generating and prioritizing tasks, and autonomously executing project operations via controlled backend tools.

## 2. Main Users and Responsibilities
*   **Workspace Administrator**: Manages the overarching workspace, invites members, assigns roles, configures settings, and oversees projects.
*   **Project Manager**: Creates projects, assigns tasks, sets deadlines/priorities, monitors progress via Kanban boards, and analyzes project metrics.
*   **Team Member**: Executes tasks, updates statuses, collaborates via comments, manages documents, and utilizes the AI assistant.

## 3. Major Modules
*   Authentication & Authorization
*   Workspace Management
*   Project Management
*   Task Management & Kanban
*   Calendar (Agenda View)
*   Document Management
*   Collaboration (Comments)
*   AI Assistant (Conversational AI & Productivity Tools)
*   RAG (Document Search & Question Answering)
*   AI Agents (Tool Execution)

## 4. Most Important User Journeys
*   **Onboarding**: Registering an account, creating a workspace, and inviting team members.
*   **Project Execution**: Creating a project, generating tasks (manually or via AI), and tracking them through a Kanban board from Todo to Done.
*   **Collaboration**: Assigning tasks, discussing details via comments, and uploading/editing shared documents.
*   **AI-Assisted Productivity**: Asking the AI for project insights (RAG), summarizing action items from text, and approving AI-proposed task modifications.

## 5. MVP Features vs. Later Features
*   **MVP Features**: Authentication, Workspace Management, Project Management, Task Management, Kanban, Calendar, Documents, Collaboration (Comments), and AI Assistant, RAG (pgvector), AI tool calling/Agents.
*   **Later Features**: Real-time Chat (WebSockets), Redis, Complex Notion-like editor, Advanced dependency graphs.

## 6. Documentation Review & Simplifications
*   **Simplification 1 (No Microservices)**: The backend will be a single FastAPI application containing both business logic and AI logic, avoiding microservice overhead.
*   **Simplification 2 (No WebSockets)**: Real-time chat is dropped from MVP. Task comments will use standard REST APIs.
*   **Simplification 3 (Document Editor)**: Use a simple Markdown editor (like SimpleMDE or React Markdown) and store documents as raw Markdown text.
*   **Simplification 4 (Deployment)**: Use Vercel, Render, and Supabase instead of AWS EC2 and Kubernetes.

## 7. Dependencies Between Modules
*   **Authentication** → Foundational; required by all modules.
*   **Workspace** → Depends on Auth. Required by Projects, Documents.
*   **Project** → Depends on Workspace. Required by Tasks and Calendar.
*   **Task** → Depends on Project and Auth (for assignees). Required by Kanban and Calendar.
*   **Documents** → Depends on Workspace/Project. Required by RAG/AI.
*   **AI Service** → Integrated in FastAPI. Depends on Backend APIs (for tool execution) and Documents (for RAG).

## 8. Week 1/2 Requirements Checklist
*   [ ] Finalize the reduced project scope and agree on MVP simplifications.
*   [ ] Set up the Git repository, branching strategy.
*   [ ] Create UI wireframes for core flows (Login, Dashboard, Kanban, Document View).
*   [ ] Finalize database schema.
*   [ ] Update API designs for REST/FastAPI.
