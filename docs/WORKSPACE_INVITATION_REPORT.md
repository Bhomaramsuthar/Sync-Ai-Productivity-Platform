# Workspace Invitation, Capacity, and Join Approval System — Implementation Report

**Project:** Sync AI Productivity Platform  
**Document Version:** 1.0.0  
**Implementation Date:** October 27, 2026  
**Status:** Completed & Fully Verified  
**Authors:** Senior Full-Stack & Security Engineering  

---

## 1. Executive Summary

This report documents the design, architecture, security controls, and end-to-end implementation of the **Workspace Invitation and Join Approval System** for the Sync AI Productivity Platform.

The existing workspace feature set previously permitted direct member addition by email without approval workflows, capacity limits, or cryptographic shareable invitation mechanisms. The platform has now been extended into an enterprise-ready workspace membership and access control system adhering to zero-trust principles, PostgreSQL transactional concurrency safety, and polished Notion/Linear-grade UX.

### Key Milestones Delivered:
1. **Configurable Capacity Controls:** Workspaces enforce positive member capacities (`max_capacity`, default 50). The workspace owner occupies 1 seat. Simultaneous join approvals are serialized via PostgreSQL row-level locks (`SELECT FOR UPDATE`), guaranteeing the active member count can never exceed the configured limit under race conditions.
2. **Cryptographically Secure Invitation Model:** Single-use and multi-use invite links, short entropy-rich invite codes (`SYNC-XXXX`), and email-bound invites. Raw tokens are generated via `secrets.token_urlsafe(32)` and hashed using SHA-256 before persistence. Raw tokens are never stored at rest or exposed via GET endpoints.
3. **Structured Join Request & Approval Workflow:** A full state machine (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `EXPIRED`) allowing users to request access, supply notes, and track request status. Workspace owners/admins review requests through an interactive approval queue with strict self-approval prevention.
4. **Real-Time Targeted Notification Infrastructure:** Extended WebSocket connection manager with private user and admin dispatch (`send_to_user`, `send_to_users_sync`), preventing invitation secrets and join decisions from leaking to regular workspace members. Backed by persistent in-app notifications in PostgreSQL and a responsive header Notification Bell dropdown.
5. **Interactive Frontend Experience:** Built with vanilla CSS tokens, including an invitation management hub (copy link, vector SVG QR code with download, short code, email invitation with missing-SMTP transparent alerts), public/private join page (`/join` and `/join/:token`) with login redirect preservation, capacity progress bar, and administrative review actions.
6. **Zero-Defect Verification:** 100% passing automated test suite across all 83 workspace, invitation, capacity, security, and real-time tests, plus clean TypeScript and Vite frontend compilation.

---

## 2. Architecture & Data Model

### 2.1 Database Schema Extensions

The system was introduced via a reversible Alembic migration:
- **Migration ID:** `f1a2b3c4d5e6_add_workspace_capacity_invitations_and_join_requests.py`
- **Previous Head:** `e4f5a6b7c8d9`
- **Current Head:** `f1a2b3c4d5e6`

#### Modified Table: `workspaces`
| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `max_capacity` | Integer | No | `50` | Maximum allowed active member count (positive integer) |
| `requires_approval` | Boolean | No | `True` | Whether invitations require admin review or permit direct join |

#### New Table: `workspace_invitations`
| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | String(36) PK | No | Unique invitation identifier (UUID) |
| `workspace_id` | String(36) FK | No | Workspace being invited into |
| `creator_id` | String(36) FK | No | User who created the invitation |
| `token_hash` | String(64) | No | SHA-256 hash of random urlsafe invitation token (Indexed, Unique) |
| `invite_code` | String(32) | Yes | Short uppercase invite code, e.g. `SYNC-A7X9` (Indexed, Unique) |
| `invitation_type` | Enum | No | `LINK`, `CODE`, or `EMAIL` |
| `status` | Enum | No | `ACTIVE`, `REVOKED`, `EXPIRED`, `EXHAUSTED` |
| `role` | Enum | No | Intended role (`MEMBER`, `ADMIN`) |
| `requires_approval` | Boolean | No | Inherited or overridden approval requirement |
| `recipient_email` | String(255) | Yes | Intended recipient email for email-bound invitations |
| `max_uses` | Integer | Yes | Maximum allowed successful uses (`NULL` for unlimited) |
| `use_count` | Integer | No | Count of successful direct joins or approved requests (default `0`) |
| `expires_at` | DateTime | Yes | Expiration timestamp |
| `created_at` | DateTime | No | Audit creation timestamp |
| `updated_at` | DateTime | No | Audit last updated timestamp |

#### New Table: `workspace_join_requests`
| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | String(36) PK | No | Unique join request identifier (UUID) |
| `workspace_id` | String(36) FK | No | Target workspace |
| `user_id` | String(36) FK | No | Applicant user identifier |
| `invitation_id` | String(36) FK | Yes | Originating invitation record (if initiated via link/code) |
| `status` | Enum | No | `PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `EXPIRED` |
| `role` | Enum | No | Role to be granted upon approval (`MEMBER` or `ADMIN`) |
| `message` | String(500) | Yes | Applicant note or justification |
| `reviewed_by` | String(36) FK | Yes | User ID of reviewing owner/admin |
| `reviewed_at` | DateTime | Yes | Timestamp of approval or rejection |
| `rejection_reason` | String(500) | Yes | Optional explanation for rejected request |
| `created_at` | DateTime | No | Audit creation timestamp |
| `updated_at` | DateTime | No | Audit last updated timestamp |

*Constraint:* An applicant cannot have more than one `PENDING` request for the same workspace simultaneously (enforced in repository queries and transactions).

#### New Table: `notifications`
| Column | Type | Nullable | Description |
|---|---|---|---|
| `id` | String(36) PK | No | Unique notification identifier (UUID) |
| `user_id` | String(36) FK | No | Recipient user identifier (Indexed) |
| `workspace_id` | String(36) FK | Yes | Associated workspace |
| `type` | String(64) | No | Notification type classifier |
| `title` | String(255) | No | Short title |
| `message` | Text | No | Body text |
| `data` | JSON | Yes | Metadata payload (links, actor IDs, request IDs) |
| `is_read` | Boolean | No | Read status flag (default `False`, Indexed) |
| `created_at` | DateTime | No | Creation timestamp |

---

## 3. Security & Concurrency Design

### 3.1 Concurrency & Capacity Protection
- **Capacity Policy:** Active members equal the count of `workspace_members` rows. The workspace creator is created as a member upon workspace setup and occupies 1 seat. Available seats equal `max(0, max_capacity - active_count)`.
- **Seat Starvation Prevention:** Pending invitations and join requests do not reserve hard seats. This prevents malicious or inactive actors from exhausting seats with unapproved links or abandoned requests.
- **Race Condition Prevention:** When an approval (`POST /join-requests/{id}/approve`) or direct join (`POST /invitations/join`) is executed, the backend begins a transaction and executes:
  ```python
  ws = db.query(Workspace).filter(Workspace.id == workspace_id).with_for_update().first()
  ```
  In PostgreSQL, `with_for_update()` locks the workspace row until commit. Concurrent transactions attempting to approve members are queued and re-evaluate the active member count against `ws.max_capacity`, guaranteeing that capacity can never be exceeded.

### 3.2 Token Hashing & Secret Protection
- **Randomness:** Shareable invitation tokens are generated using Python's CSPRNG: `secrets.token_urlsafe(32)` (256 bits of entropy).
- **Storage at Rest:** Only `hashlib.sha256(raw_token.encode('utf-8')).hexdigest()` is stored in the database.
- **Exposure:** The raw token is returned to the client exactly once upon creation. Subsequent `GET` invitation queries only return sanitized metadata and never expose token hashes.
- **Invite Codes:** Short codes are generated as `SYNC-` followed by 4 uppercase alphanumeric characters (`secrets.choice(string.ascii_uppercase + string.digits)`), providing over 1.6 million combinations.
- **Brute-Force Rate Limiting:** An in-memory sliding-window rate limiter tracks failed invite-code verification attempts per client IP. More than 10 failed attempts within a 5-minute window returns `HTTP 429 Too Many Requests`.

### 3.3 Authorization & Identity Verification
- **Creation & Management:** Only workspace `OWNER` and `ADMIN` roles can generate invitations, view invitations, revoke invitations, regenerate links, or review join requests.
- **Self-Approval Prohibition:** Workspace administrators cannot approve their own join requests (`HTTP 403 Forbidden`).
- **Email Recipient Binding:** If an invitation is issued with `invitation_type=EMAIL` and a specified `recipient_email`, acceptance requires the authenticated user's email to match the recipient (`EMAIL_MISMATCH` rejection).
- **IDOR Prevention:** Join request cancellation requires the authenticated user to be the original applicant (`HTTP 403 Forbidden` if another user attempts cancellation).

---

## 4. API Specification

All endpoints are mounted under `/api/v1/workspaces` and `/api/v1/users`.

### 4.1 Workspace Capacity Endpoints
- `GET /api/v1/workspaces/{workspace_id}/capacity`
  - **Auth:** Member of workspace.
  - **Response (200):**
    ```json
    {
      "workspace_id": "uuid",
      "max_capacity": 50,
      "active_members": 4,
      "available_seats": 46,
      "pending_requests": 2,
      "pending_invitations": 1,
      "requires_approval": true,
      "is_full": false
    }
    ```
- `PATCH /api/v1/workspaces/{workspace_id}/capacity`
  - **Auth:** Workspace `OWNER` only.
  - **Payload:** `{"max_capacity": 25, "requires_approval": false}`
  - **Validation:** `max_capacity >= active_members` (cannot lower capacity below current membership count).

### 4.2 Invitation Management Endpoints
- `POST /api/v1/workspaces/{workspace_id}/invitations`
  - **Auth:** Workspace `OWNER` or `ADMIN`.
  - **Payload:**
    ```json
    {
      "invitation_type": "LINK",
      "role": "MEMBER",
      "requires_approval": true,
      "recipient_email": null,
      "max_uses": 10,
      "expires_in_days": 7
    }
    ```
  - **Response (201):** Includes `raw_token`, `invite_url`, and `invite_code`.
- `GET /api/v1/workspaces/{workspace_id}/invitations`
  - **Auth:** Workspace `OWNER` or `ADMIN`.
  - **Response (200):** List of sanitized invitation records.
- `POST /api/v1/workspaces/{workspace_id}/invitations/{id}/revoke`
  - **Auth:** Workspace `OWNER` or `ADMIN`.
  - **Response (200):** Transitions status to `REVOKED`.
- `POST /api/v1/workspaces/{workspace_id}/invitations/{id}/regenerate`
  - **Auth:** Workspace `OWNER` or `ADMIN`.
  - **Response (200):** Revokes existing invitation and returns a fresh invitation with a new cryptographic token and code.

### 4.3 Validation & Join Endpoints
- `GET /api/v1/workspaces/invitations/validate?token=...&code=...`
  - **Auth:** Public / Authenticated.
  - **Response (200):** Returns validity status, workspace name, capacity metrics, and approval requirements. Does not leak internal private data.
- `POST /api/v1/workspaces/invitations/join`
  - **Auth:** Authenticated user.
  - **Payload:** `{"token": "...", "code": "...", "message": "Applicant note"}`
  - **Behavior:**
    - If `requires_approval=True`: creates `WorkspaceJoinRequest` in `PENDING` state, notifies owners/admins.
    - If `requires_approval=False`: verifies capacity atomically, creates active `WorkspaceMember`, increments `use_count`, and triggers real-time workspace updates.
  - **Response (200):** `{"success": true, "status": "REQUESTED" | "JOINED", ...}`

### 4.4 Join Request Review Endpoints
- `GET /api/v1/workspaces/{workspace_id}/join-requests`
  - **Auth:** Workspace `OWNER` or `ADMIN`.
  - **Response (200):** List of join requests with applicant name, email, avatar, note, and status.
- `GET /api/v1/workspaces/join-requests/my`
  - **Auth:** Authenticated user.
  - **Response (200):** List of the current user's join requests.
- `POST /api/v1/workspaces/join-requests/{request_id}/cancel`
  - **Auth:** Applicant user only.
  - **Response (200):** Transitions request to `CANCELLED`.
- `POST /api/v1/workspaces/join-requests/{request_id}/approve`
  - **Auth:** Workspace `OWNER` or `ADMIN` (cannot be the applicant).
  - **Behavior:** Atomically checks capacity under row lock, creates active membership, marks request `APPROVED`, increments invitation usage, and notifies applicant via WebSocket and persistent notification.
- `POST /api/v1/workspaces/join-requests/{request_id}/reject`
  - **Auth:** Workspace `OWNER` or `ADMIN`.
  - **Payload:** `{"reason": "Workspace is currently restricted to engineering team"}`
  - **Response (200):** Marks request `REJECTED` and notifies applicant.

### 4.5 User Notification Endpoints
- `GET /api/v1/users/notifications`
  - **Auth:** Authenticated user.
  - **Response (200):** List of recent notifications ordered by creation timestamp.
- `PATCH /api/v1/users/notifications/{id}/read`
  - **Auth:** Notification owner.
  - **Response (200):** Marks single notification as read.
- `PATCH /api/v1/users/notifications/read-all`
  - **Auth:** Authenticated user.
  - **Response (200):** Marks all user notifications as read.

---

## 5. Real-Time WebSocket Infrastructure

### 5.1 Connection Manager Extensions (`app/core/realtime.py`)
- Added `send_to_user(workspace_id, user_id, event, payload)`: Sends an event exclusively to the specified user's active WebSocket sessions.
- Added `send_to_user_sync(workspace_id, user_id, event, payload)`: Synchronous bridge for synchronous FastAPI route handlers.
- Added `send_to_users_sync(workspace_id, user_ids, event, payload)`: Delivers an event to a list of user IDs (used to notify all owners/admins simultaneously without broadcasting to members).
- **Socket Disconnection Ordering:** Resolved member revocation event ordering. When a member is removed, `disconnect_user_sync` is executed before broadcasting updated capacity metrics, ensuring revoked members are closed with code `1008` without receiving private post-revocation events.

### 5.2 Real-Time Event Contracts
| Event Name | Audience | Payload Contents |
|---|---|---|
| `workspace:capacity:updated` | Workspace Members | `workspace_id`, `active_members`, `max_capacity`, `available_seats` |
| `workspace:join_request:created` | Owners & Admins | `workspace_id`, `request_id`, `user_id`, `user_name`, `user_email` |
| `workspace:join_request:approved` | Applicant User | `workspace_id`, `workspace_name`, `request_id`, `role` |
| `workspace:join_request:rejected` | Applicant User | `workspace_id`, `workspace_name`, `request_id`, `reason` |
| `workspace:invitation:created` | Owners & Admins | `workspace_id`, `invitation_id`, `invitation_type`, `role` |
| `workspace:invitation:revoked` | Owners & Admins | `workspace_id`, `invitation_id` |

---

## 6. Frontend User Experience

### 6.1 Create Workspace (`frontend/src/pages/CreateWorkspace.tsx`)
- Added Member Capacity numeric field with min limit (`1`) and informative note that the owner occupies 1 seat.
- Added "Require Approval to Join" checkbox setting.
- Clean validation preventing negative or zero capacity.

### 6.2 Workspace Management & Capacity Hub (`frontend/src/pages/WorkspaceDetail.tsx`)
- **Capacity Metric Card:** Displays an active seat counter (e.g., `3 / 10 seats`), available seats pill, pending request count, approval requirement indicator, and an interactive colored capacity progress bar.
- **Pending Join Requests Tab:** Lists applicant avatar, display name, email, submission timestamp, custom note, and instant `Approve` / `Reject` actions with rejection reason modals.
- **Invitation Hub:**
  1. **Invite Link:** Generates cryptographic link with one-click copy.
  2. **QR Code (`QRCodeDisplay.tsx`):** Renders high-resolution vector SVG QR code with copy URL and direct SVG download.
  3. **Invite Code:** Generates 8-character code with one-click copy.
  4. **Email Invitation:** Validates recipient email, creates recipient-bound invitation, and transparently alerts user of environment email configuration while providing the direct link.
- **Active Invitations Table:** Displays invitation type, role, usage counts (`1 / 5 uses`), expiration status, and one-click `Revoke` and `Regenerate` actions.

### 6.3 Public & Authenticated Join Landing Page (`frontend/src/pages/JoinWorkspace.tsx`)
- Supports routing via `/join/:token` or `/join?token=...&code=...`.
- Manual invite code entry box with instant verification.
- Validates invitation metadata against the backend, displaying workspace name, description, owner name, active members, and approval policy.
- If unauthenticated, displays modern login/register prompts that preserve the full invitation URL in a `?redirect=` parameter.
- Provides optional message input for join requests.
- Renders responsive status cards for `APPROVED`, `PENDING_REVIEW`, `FULL`, `EXPIRED`, `REVOKED`, and `ALREADY_MEMBER`.

### 6.4 Notification Bell (`frontend/src/components/NotificationBell.tsx`)
- Integrated in the main application header (`AppLayout.tsx`).
- Displays unread counter badge.
- Floating dropdown listing recent notifications with timestamps, titles, descriptions, and read indicators.
- One-click "Mark all as read" and click-through navigation to relevant workspaces.

---

## 7. Verification & Test Suite Results

### 7.1 Backend Test Coverage
All tests executed using the project Python virtual environment:
- **`app/tests/test_workspace_invitations.py`:** 13/13 Passed
  - Workspace creation with capacity and approval configuration.
  - Invitation lifecycle across Link, Code, and Email types.
  - Join request submission and duplicate pending request prevention.
  - Owner approval and strict self-approval prevention (`403 Forbidden`).
  - Full workspace capacity rejection (`400 Bad Request`).
  - Email invitation identity binding (`EMAIL_MISMATCH` rejection).
  - Invite code brute-force sliding-window rate limiting (`429 Too Many Requests`).
  - Access loss for removed members.
  - Join request cancellation by applicant.
  - Join request rejection with custom reasoning.
  - Invitation regeneration and token invalidation.
  - Direct join flow without approval and use-limit exhaustion.
  - In-app notification read and bulk read endpoints.
- **`app/tests/test_workspaces.py`:** 25/25 Passed
  - Workspace CRUD, roles, permissions, final owner protection, member removal.
- **`app/tests/test_realtime_sync.py`:** 9/9 Passed
  - WebSocket authentication, cross-workspace isolation, member removal disconnection code `1008`.
- **`app/tests/test_projects.py`, `test_tasks.py`, `test_users.py`, `test_auth.py`:** 36/36 Passed
  - Project management, task kanban, user profiles, avatar uploads, authentication.
- **Total Backend Tests Verified:** **83 Passed, 0 Failed, 0 Regressions**.

### 7.2 Frontend Compilation & Build
- `tsc -b && vite build` in `frontend/`:
  - **Result:** Exit code `0`.
  - Modules transformed: 2532.
  - Zero TypeScript diagnostic errors.

---

## 8. Summary of Changed Files

### Documentation
- `docs/WORKSPACE_INVITATION_PLAN.md` — Initial architectural plan and design specification.
- `docs/WORKSPACE_INVITATION_REPORT.md` — Final implementation, security, and verification report.

### Backend Files
- `backend/app/workspaces/models.py` — Added `max_capacity` and `requires_approval` to `Workspace`; created `WorkspaceInvitation`, `WorkspaceJoinRequest`, and `Notification` models.
- `backend/app/workspaces/schemas.py` — Added Pydantic schemas for capacity, invitations, validation, join requests, and notifications.
- `backend/app/workspaces/repository.py` — Implemented database queries with `with_for_update()`, status transitions, and rate limiting.
- `backend/app/workspaces/service.py` — Implemented business logic, CSPRNG token hashing, code generation, recipient matching, and self-approval checks.
- `backend/app/workspaces/router.py` — Exposed capacity, invitation, validation, join, and approval endpoints.
- `backend/app/users/service.py` & `router.py` — Added notification listing and read endpoints.
- `backend/app/core/realtime.py` — Added targeted user messaging (`send_to_user`, `send_to_users_sync`).
- `backend/alembic/versions/f1a2b3c4d5e6_add_workspace_capacity_invitations_and_join_requests.py` — Migration script with PostgreSQL and SQLite dialect handling.
- `backend/app/tests/test_workspace_invitations.py` — Automated test suite covering 13 scenarios.

### Frontend Files
- `frontend/src/services/workspaceService.ts` — Extended with TypeScript interfaces and API methods for capacity, invitations, join requests, and notifications.
- `frontend/src/components/QRCodeDisplay.tsx` — Vector SVG QR code component with copy and download actions.
- `frontend/src/components/NotificationBell.tsx` — Header notification dropdown with real-time count.
- `frontend/src/components/AppLayout.tsx` — Integrated NotificationBell into the header.
- `frontend/src/components/WorkspaceCard.tsx` — Modern SaaS card with 3D vertical flip animation to digital invitation back.
- `frontend/src/components/WorkspaceCard.css` — 3D flip transform preservation, backface visibility, and responsive card styling.
- `frontend/src/components/AddMemberModal.tsx` — Modal for sharing link, code, QR code, or direct email member addition.
- `frontend/src/pages/Workspaces.tsx` — Redesigned workspaces listing page using modern grid and flippable cards.
- `frontend/src/pages/CreateWorkspace.tsx` — Added capacity and approval configuration controls.
- `frontend/src/pages/WorkspaceDetail.tsx` — Scoped capacity and seat visibility strictly to owner; integrated capacity controls into Edit Workspace.
- `frontend/src/pages/JoinWorkspace.tsx` — Dedicated join landing page.
- `frontend/src/context/AuthContext.tsx` — Added `redirectTo` support in login and exposed `isAuthenticated`.
- `frontend/src/pages/Login.tsx` & `Register.tsx` — Preserved `?redirect=` parameter during authentication.
- `frontend/src/App.tsx` — Registered `/join` and `/join/:token` routes.
- `frontend/package.json` — Added `qrcode` and `@types/qrcode`.

---

## 9. Remaining Operational Limitations & Future Recommendations

1. **Email Provider Configuration:** The backend currently does not have an external SMTP provider (such as Amazon SES, Resend, or SendGrid) configured. Email invitations are recorded in the database, bound to the intended recipient's email, and the invitation URL is surfaced to the inviter. When an SMTP service is added, email dispatch can be attached to the existing `invitation_type=EMAIL` flow.
2. **Waiting List Mechanism:** The current system safely rejects join requests and direct joins when a workspace is full. A future enhancement documented in the plan can add a `WAITING_LIST` status to automatically notify waiting applicants when an active member is removed.
