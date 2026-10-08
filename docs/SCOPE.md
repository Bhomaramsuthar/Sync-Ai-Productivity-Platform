# Project Scope

This document defines the finalized scope, MVP definition, and technical roadmap for the AI-Driven Collaboration & Productivity Platform. The goal is to build a polished, realistic final-year project demonstrating full-stack enterprise development without falling into the trap of over-engineering or scope creep.

---

## 1. Feature Categories

### MUST HAVE (Core MVP)
These features form the essential backbone of the application. The project is a failure if these are not complete and polished.
*   **Authentication & Authorization (JWT)**: Foundation for all secure operations.
*   **Workspace & Project Management**: The basic organizational hierarchy.
*   **Task Management & Kanban Board**: Core project tracking. CRUD operations and state transitions.
*   **Document Management (Markdown-based)**: Necessary context for the AI/RAG system.
*   **Task Comments**: Essential, simple collaboration feature.
*   **Basic AI Assistant**: Chat interface integrated into FastAPI.
*   **Relational Database Persistence**: PostgreSQL (Supabase).

### SHOULD HAVE (Advanced Requirements)
These features differentiate the project and fulfill the "AI" and "Collaboration" aspects of the brief, but should only be started once the MUST HAVEs are stable.
*   **RAG (Retrieval-Augmented Generation)**: Using `pgvector` in Supabase to allow the AI to answer questions based on workspace documents.
*   **AI Tool Calling**: Allowing the AI to execute tasks (e.g., `create_task`) via backend APIs.
*   **Calendar View**: A visual representation of task deadlines (agenda or simple grid).
*   **Cloud Deployment**: Deploying frontend to Vercel and backend to Render Free Tier for the final presentation.

### FUTURE / OPTIONAL (Out of Scope for MVP)
These features are explicitly removed from the primary scope to ensure the project is realistically finishable.
*   **Microservices (Java/Python split)**: Replaced entirely by a single FastAPI application to drastically reduce architectural overhead.
*   **Real-time WebSockets**: Overkill for the core product. Notifications/comments will just load on fetch.
*   **Notion-like Block Editor**: Excessively complex to build. We will use a standard Markdown editor.
*   **Task Dependency Graph**: Complex UI and database recursive logic that distracts from core AI features.
*   **Redis Caching**: Unnecessary infrastructure for a student project scale.
*   **AWS / Kubernetes Deployment**: Replaced with simpler PaaS (Render, Vercel, Supabase).

---

## 2. Exact MVP Definition

The MVP is a complete, monolithic full-stack application (React + FastAPI) that successfully executes the following end-to-end journey:

1.  A user registers and logs in securely (JWT).
2.  The user creates a Workspace and a Project.
3.  The user populates the Project with Tasks (setting titles, descriptions, assignees, and deadlines).
4.  The user visually manages task progress by dragging cards across a Kanban board.
5.  The user writes project documentation using a Markdown editor.
6.  The user interacts with an AI Assistant panel to chat, ask questions, or request the AI to generate a task on their behalf.

---

## 3. Final Technology Stack

*   **Frontend**: React, TypeScript, Vite, Tailwind (optional).
*   **Backend**: Python, FastAPI, SQLAlchemy, Alembic, Pydantic.
*   **Database**: PostgreSQL with `pgvector` (Supabase).
*   **Infrastructure**: Vercel (Frontend), Render (Backend), Supabase (DB/Storage), Docker (Local Dev only).

---

## 4. Final Major Modules & Dependencies

The backend will be structured as a modular monolithic FastAPI app.
*   **Auth Module**: Handles registration, login, JWT validation. *(Foundation)*
*   **Workspace Module**: Handles workspace creation and user roles. *(Depends on Auth)*
*   **Project Module**: Handles project configuration. *(Depends on Workspace)*
*   **Task Module**: Handles tasks, Kanban statuses, assignments, and comments. *(Depends on Project & Auth)*
*   **Document Module**: Handles markdown document CRUD. *(Depends on Workspace)*
*   **AI Module**: Orchestrates LLM communication, RAG vectors, and tool execution. *(Depends on Document & Task modules)*

---

## 5. MVP User Journeys

1.  **Onboarding**: Registration → Login → Create Workspace.
2.  **Execution**: Workspace Dashboard → Create Project → Create Tasks → Assign Tasks → Kanban Board Drag & Drop.
3.  **Knowledge Base**: Project Dashboard → Create Document → Write Markdown → Save.
4.  **AI Collaboration**: Open AI Panel → Ask Question / Request Task Generation → Review AI Tool Execution Confirmation.

---

## 6. Week 2 Deliverables

Week 2 marks the beginning of the "Foundation" phase. The deliverables are strictly limited to setup and API Design.
1.  Initialize Git repository.
2.  Set up React + TypeScript + Vite frontend skeleton.
3.  Set up FastAPI backend skeleton with dependencies.
4.  Configure local PostgreSQL database via `docker-compose.yml`.
5.  Design Database schema and initial UI wireframes.
6.  Update API specifications.

---

## 7. Forbidden Features (Strict Rule)

To prevent scope creep and integration hell, the following features are **EXPLICITLY FORBIDDEN** from being started before their planned phase:
*   Do not write **any AI or RAG code** until Workspaces, Projects, and Tasks are fully working and tested end-to-end.
*   Do not implement **WebSockets** or **Redis** under any circumstances during the MVP phase.
*   Do not build a **custom document editor**. Use an off-the-shelf Markdown component.
*   Do not build **microservices**. Use a single FastAPI backend.
