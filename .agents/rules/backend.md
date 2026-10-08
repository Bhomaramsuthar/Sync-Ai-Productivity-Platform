# Backend Development Rules

## Technology

Use:

- Python
- FastAPI
- SQLAlchemy
- Alembic
- Pydantic
- PostgreSQL (Supabase)
- JWT

Do not introduce another backend framework or language unless explicitly requested.

## Project Structure

Prefer feature-based organization.

Example:

```text
backend/app/
    main.py
    core/
    auth/
    users/
    workspaces/
    projects/
    tasks/
    comments/
    calendar/
    documents/
    notifications/
    ai/
    rag/
```

Each feature should preferably contain:

- `router.py` (FastAPI APIRouters)
- `service.py` (Business logic)
- `models.py` (SQLAlchemy models)
- `schemas.py` (Pydantic models for validation)

Do not create unnecessary layers for trivial functionality.

## Routers (Controllers)

Routers should:

- Handle HTTP requests.
- Validate request input via Pydantic.
- Call services.
- Return responses.

Routers should NOT contain:

- Business logic
- Complex database operations
- AI logic

## Services

Business logic belongs in services.

Services should:

- Validate business rules.
- Coordinate database access via SQLAlchemy sessions.
- Check authorization where appropriate.
- Handle transactions.

## Validation

Use Pydantic for validation.

Validate:

- Required fields
- String length
- Email format
- Dates
- Numeric values
- IDs

Invalid input must produce a consistent error response.

## Authentication

Use:

- JWT
- Secure password hashing

Never:

- Store plaintext passwords
- Return passwords through APIs
- Trust frontend authentication state without server validation

## Authorization

Every protected resource must verify that the authenticated user has permission to access it.

Example:

User
→ Workspace
→ Project
→ Task

A user must not access a project/task merely by knowing its ID.

## Database

Use Alembic for database migrations.

Never manually change the production database schema without a migration.

Use UUID identifiers unless docs/DATABASE.md specifies otherwise.

## API Design

Use:

- GET for retrieval
- POST for creation
- PUT/PATCH for updates
- DELETE for deletion

Use appropriate HTTP status codes.

## AI Integration

The backend is the security boundary for AI actions.

AI requests must be validated before executing operations.

Never allow the AI logic to bypass backend authorization. AI tools must invoke the standard `service.py` methods that perform proper permission checks.