# Design System

This document outlines the modern, premium design system used for the AI-Driven Collaboration & Productivity Platform.

## Visual Direction

Our design system is inspired by modern productivity tools (like Notion and Linear), prioritizing:
- A sleek, high-contrast dark theme.
- Minimalist interfaces with information-dense structures.
- Restrained use of color, relying heavily on typography, spacing, and subtle borders.
- Interactive and tactile components that provide immediate feedback (hover, focus, disabled).

## Centralized Tokens (`index.css`)

All styling is managed through CSS custom properties to ensure consistency and easy theming.

### Colors
- **Backgrounds**: `--bg-base` (Deepest background), `--bg-surface` (Cards/Panels).
- **Text**: `--text-primary` (High emphasis), `--text-secondary` (Muted), `--text-tertiary` (Placeholders).
- **Accents**: `--accent-primary` (Indigo), `--accent-primary-hover`.
- **Status**: `--status-success`, `--status-warning`, `--status-danger`, `--status-info` (and their respective translucent `-bg` variants).

### Spacing Scale
A consistent spacing scale is defined to ensure predictable layouts:
- `--space-1` (0.25rem) to `--space-8` (3rem)

### Radii & Shadows
- **Radii**: `--radius-sm` (4px), `--radius-md` (8px), `--radius-lg` (12px), `--radius-full` (9999px).
- **Shadows**: `--shadow-sm`, `--shadow-md`, `--shadow-lg`.

## Component Classes

Instead of arbitrary inline styles or utility classes, use the following pre-defined component classes:

### Layout
- `.app-layout`, `.app-sidebar`, `.app-main`, `.app-header`, `.app-content`
- `.page-header`, `.page-title`, `.page-subtitle`

### Buttons
- `.btn`: Base button styling.
- `.btn-primary`: High emphasis action.
- `.btn-secondary`: Alternative action.
- `.btn-ghost`: Subtle action without borders.
- `.btn-danger`: Destructive action.
- `.btn-icon`: Square button for icons.

### Inputs & Forms
- `.form-group`: Wrapper for label and input.
- `.form-label`: Input label.
- `.form-input`, `.form-select`, `.form-textarea`: Form controls.

### Cards & Containers
- `.card`, `.card-header`, `.card-title`, `.card-body`, `.card-footer`

### Badges
- `.badge`
- Variants: `.badge-neutral`, `.badge-primary`, `.badge-success`, `.badge-warning`, `.badge-danger`

### Empty States & Loading
- `.empty-state`, `.empty-state-icon`, `.empty-state-title`
- `.loading-screen`, `.spinner`

## Icons
Use `lucide-react` for all icons, ensuring a consistent line-style iconography throughout the application.

*Note: This system serves as the current baseline. It can be easily refined later by tweaking the CSS variables in `index.css`.*
