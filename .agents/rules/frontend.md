# Frontend Development Rules

## Technology

Use:

- React
- TypeScript
- Vite
- Tailwind CSS (optional but recommended)
- REST APIs

Follow the existing frontend stack once established.

## Project Structure

Define a clean React structure such as:

```text
frontend/src/
    components/
    pages/
    layouts/
    features/
    services/
    hooks/
    types/
    lib/
    store/
```

Prefer feature-oriented organization where appropriate.
Separate UI components, API services, state management, types, and business logic.
Do not put API calls directly inside large UI components.

## UI Principles


The application should feel like a modern productivity platform.

Prioritize:

- Clean layout
- Consistent spacing
- Clear hierarchy
- Responsive design
- Fast interactions
- Useful empty states
- Useful loading states
- Useful error states

## Application Layout

The primary application should use:

- Sidebar navigation
- Top navigation/header
- Main content area
- Contextual panels where useful

## Components

Create reusable components for repeated UI patterns.

Examples:

- Button
- Modal
- Dropdown
- Input
- Select
- Task card
- User avatar

## API Communication

Keep API communication separate from UI components.

Prefer:

components
    ↓
hooks/services
    ↓
API
    ↓
FastAPI Backend

## State

Keep state as close as possible to where it is used.

Use global state only when genuinely shared (e.g. User authentication state).

## Authentication

Protected pages must require authentication.

The backend remains the source of truth for authorization.

## Kanban

Drag-and-drop changes must persist to the backend.

Do not implement visual-only task movement.

Flow:

Drag task
→ update UI
→ API request
→ backend validation
→ database update
→ confirm state

## AI UI

AI responses should clearly distinguish:

- Normal response
- Suggested action
- Tool execution
- Confirmation request
- Error

For important actions, show confirmation before execution.

Example:

"Create 5 tasks from this document?"

[Cancel] [Create tasks]

## No Fake Data

Do not add mock data to hide missing backend functionality.

If a feature is not implemented, show an appropriate empty state.