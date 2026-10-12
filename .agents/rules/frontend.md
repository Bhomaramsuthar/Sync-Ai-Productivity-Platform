# Frontend Development Rules

## Technology

Use:

- React
- TypeScript
- Vite
- Vanilla CSS (with centralized tokens in index.css)
- lucide-react (for icons)
- REST APIs

**Important:** Do NOT use Tailwind CSS. We use a centralized custom design system in `index.css`.

## Project Structure

Define a clean React structure:

```text
frontend/src/
    components/
    pages/
    layouts/
    services/
    context/
    index.css
```

Separate UI components, API services, state management, types, and business logic.
Do not put API calls directly inside large UI components.

## UI Principles

The application must feel like a modern, premium productivity platform (Notion/Linear style).

Prioritize:
- **Clean Layout**: Use `var(--bg-base)` and `var(--bg-surface)` to create depth.
- **Consistent Spacing**: Use `var(--space-*)` variables.
- **Clear Hierarchy**: Use correct semantic typography and restrained accent colors.
- **Responsive Design**: Ensure mobile compatibility using flexbox, grids, and standard media queries.
- **Rich Interactions**: Always provide hover, active, focus, and disabled states.
- **Robust Feedback**: Provide clear loading states (skeletons/spinners) and empty states using the established patterns in `index.css`.

## Design System Tokens & Components

Always use the shared CSS custom properties defined in `index.css`:
- **Colors**: `var(--bg-base)`, `var(--bg-surface)`, `var(--text-primary)`, `var(--accent-primary)`, etc.
- **Spacing**: `var(--space-1)` through `var(--space-8)`.
- **Radii**: `var(--radius-md)`, `var(--radius-lg)`, etc.

Use the established CSS component classes instead of custom styling for standard elements:
- `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`
- `.form-group`, `.form-label`, `.form-input`
- `.card`, `.card-header`, `.card-body`
- `.badge`, `.badge-primary`, `.badge-success`
- `.empty-state`, `.loading-screen`

## Application Layout

The primary application uses `AppLayout.tsx`:
- Collapsible Sidebar navigation (`.app-sidebar`)
- Top Header (`.app-header`)
- Main Content Area (`.app-content`)

Protected pages must use this layout.

## API Communication

Keep API communication separate from UI components via the `services/` directory.

## State

Keep state as close as possible to where it is used.
Use Context (`AuthContext`) only for globally shared state like the current user.

## Kanban

Drag-and-drop changes must persist to the backend.
Do not implement visual-only task movement.

Flow:
Drag task → optimistic UI update → API request → backend validation → confirm state (or rollback on failure).

## No Fake Data

Do not add mock data to hide missing backend functionality.
If a feature is not implemented or has no data, show an appropriate `.empty-state`.