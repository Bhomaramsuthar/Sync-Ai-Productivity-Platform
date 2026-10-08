# AI-Driven Collaboration & Productivity Platform

A final-year project demonstrating a modern, unified collaboration workspace featuring project management, Kanban boards, documents, and integrated AI. 

## Features

- **Workspaces & Projects**: Organize your team and projects.
- **Task Management**: Track tasks via Kanban boards.
- **Documents**: Write and share project documentation.
- **AI Assistant**: Context-aware AI integrated directly into the backend.
- **RAG**: Ask questions about your documents (powered by Supabase pgvector).
- **AI Agents**: The AI can execute tasks and manage projects on your behalf through controlled tools.

## Architecture

Optimized for speed and free deployment:

- **Frontend**: React + TypeScript + Vite (Deployed on Vercel)
- **Backend**: FastAPI (Python) (Deployed on Render Free Tier)
- **Database**: PostgreSQL with pgvector (Hosted on Supabase)
- **Storage**: Supabase Storage

## Development

Use `docker-compose.yml` for running local dependencies (like a local Postgres instance with pgvector).
