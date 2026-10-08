# Architecture Rules

## General

- Follow docs/ARCHITECTURE.md as the primary architecture reference.
- Follow docs/PROJECT_SPEC.md for product requirements.
- Prefer simple and maintainable solutions over unnecessary abstraction.
- Do not rewrite working modules unless there is a clear technical reason.
- Before making major architectural changes, inspect the existing implementation and explain the impact.

## System Architecture

The system consists of:

- React + TypeScript + Vite frontend
- FastAPI backend
- PostgreSQL database (Supabase)
- pgvector for RAG
- Supabase Storage

## Service Boundaries

Frontend:
- Responsible for UI and client-side state.
- Communicates with backend through REST APIs.
- Must not contain business-critical authorization logic.

FastAPI Backend:
- Main application backend.
- Owns authentication, authorization, business logic, AI logic, and application data access.
- AI logic must access the database through the same service layer as standard REST endpoints.

PostgreSQL:
- Primary source of persistent application data.

pgvector:
- Used for document embeddings and semantic search.

## API Boundary

Frontend → FastAPI Backend → Database

Never:

Frontend → Direct Database
AI Engine → Direct Database (Bypassing Services)

## Feature Development

Implement features as vertical slices.

A feature should preferably include:

1. Database Schema (Alembic)
2. Backend (Service & Router)
3. API Specs
4. Frontend
5. Validation (Pydantic)
6. Tests

## Data Ownership

Each module should own its business logic.

Examples:

- Task logic belongs to Task module.
- Workspace authorization belongs to Workspace/security layer.
- AI generation belongs to AI module.
- Document retrieval belongs to document/RAG modules.

## Security

Authorization must always be performed by the backend.

Never trust:

- Frontend permissions
- AI-generated permissions
- AI-generated user IDs
- AI-generated workspace IDs

Validate all important identifiers and permissions on the server.