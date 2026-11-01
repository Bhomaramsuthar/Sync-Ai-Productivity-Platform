# Workspace Invitation and Join Approval System — Architectural Plan

**Project:** Sync AI Productivity Platform  
**Document Version:** 1.0.0  
**Status:** Approved for Implementation  
**Authors:** Senior Full-Stack & Security Engineering  

---

## 1. Executive Summary

This specification outlines the architecture, data models, security controls, API contracts, real-time messaging, and user experience for a production-grade workspace invitation and membership approval flow in Sync AI.

The design extends the existing FastAPI + PostgreSQL (Alembic) backend and React + TypeScript + Vite frontend. It preserves existing workspace role models (`OWNER`, `ADMIN`, `MEMBER`) and real-time WebSocket connection management while introducing:

1. **Configurable Workspace Capacity:** Strictly enforced seat management with concurrency-safe database row locking (`SELECT FOR UPDATE`).
2. **Cryptographic Invitation Data Model:** Single-use and multi-use invite links, short entropy-rich invite codes, and email-targeted invitations with SHA-256 token hashing at rest.
3. **Structured Join Request & Approval Workflow:** State-machine driven approval flow (`PENDING`, `APPROVED`, `REJECTED`, `CANCELLED`, `EXPIRED`) with administrative review, self-approval prevention, and duplicate prevention.
4. **Real-Time Notification Infrastructure:** Targeted WebSocket event delivery to workspace administrators and requesting users, backed by persistent in-app notifications.
5. **Security & Abuse Mitigation:** Token hashing at rest, brute-force rate limiting on invite codes, identity binding on email invitations, and transactional capacity validation.
6. **Polished Notion/Linear-Class UX:** Extended workspace creation with capacity controls, a dedicated invitation management hub (links, QR codes, invite codes, email), a responsive join landing page with auth-redirection preservation, and an administrative approval queue.

---

## 2. Existing System Audit

### 2.1 Workspace & Membership Models
- **`workspaces` table:** Currently contains `id` (UUID string), `name` (VARCHAR(255)), `description` (VARCHAR(1000)), `owner_id` (FK to `users.id`), `created_at`, and `updated_at`.
- **`workspace_members` table:** Contains `id`, `workspace_id` (FK), `user_id` (FK), `role` (`OWNER`, `ADMIN`, `MEMBER`), and `joined_at`, with a unique constraint `uq_workspace_user` on `(workspace_id, user_id)`.
- **Current Limitation:** Workspaces have no maximum seat capacity field. Any workspace owner or admin can directly add users if they know the user's email, immediately granting active membership without an approval stage or invite acceptance step.

### 2.2 Permissions & Authorization
- **Owner Permissions:** Can delete the workspace, transfer ownership, manage all members, and edit workspace metadata. Last owner cannot be demoted or removed.
- **Admin Permissions:** Can update workspace details, add members, update roles (except promoting to owner or removing owners).
- **Member Permissions:** Read workspace resources, leave workspace. Cannot add members or alter settings.

### 2.3 Real-Time WebSocket Architecture
- **`WorkspaceConnectionManager` (`app/core/realtime.py`):**
  - Manages active sockets indexed by `workspace_id` and `(workspace_id, user_id)`.
  - Supports `broadcast()`, `broadcast_sync()`, `disconnect_user_sync()`, and `disconnect_all_sync()`.
  - Currently broadcasts workspace updates and member removal/addition to all connected sockets in that workspace.
- **Requirement:** Must support targeted delivery (e.g. only to workspace owners/admins, or directly to an individual requesting user) so that private invitation links and join request decisions are not leaked to regular workspace members.

### 2.4 Notifications & Email Infrastructure
- **Email Delivery:** No active SMTP or third-party email provider (SendGrid, Postmark, AWS SES) is configured in the backend environment.
- **Preferences:** Users have `email_notifications` stored in their user preferences JSON.
- **Strategy:** Build persistent in-app notifications in PostgreSQL, send targeted WebSocket events, and provide email invitation tracking. If no SMTP server is configured, the system records the invitation cleanly and exposes the direct invitation link/code for the inviter to share, while transparently displaying the configuration status.

### 2.5 Migration Head
- Current Alembic head: `e4f5a6b7c8d9` (`e4f5a6b7c8d9_add_conversation_scope_and_nullable_ids.py`).
- New migration will branch from `e4f5a6b7c8d9`.

---

## 3. Data Model Architecture

### 3.1 Workspace Table Modifications
Extend the `workspaces` table with capacity and approval configuration:
- `max_capacity`: Integer, nullable=False, server_default=50.
- `requires_approval`: Boolean, nullable=False, server_default=sa.true().

### 3.2 Workspace Invitations (`workspace_invitations`)
Supports link-based, short-code, and email-targeted invitations.

```text
Table: workspace_invitations
-----------------------------------------------------------------------------
id                  String(36)       PRIMARY KEY (UUID)
workspace_id        String(36)       FOREIGN KEY -> workspaces.id (ON DELETE CASCADE)
creator_id          String(36)       FOREIGN KEY -> users.id (ON DELETE CASCADE)
token_hash          String(64)       NOT NULL, INDEXED (SHA-256 of raw secret token)
invite_code         String(32)       NULL, UNIQUE, INDEXED (Uppercase alphanumeric code)
invitation_type     String(20)       NOT NULL ('LINK', 'CODE', 'EMAIL')
status              String(20)       NOT NULL ('ACTIVE', 'REVOKED', 'EXPIRED', 'EXHAUSTED')
role                String(20)       NOT NULL DEFAULT 'MEMBER' ('MEMBER', 'ADMIN')
requires_approval   Boolean          NOT NULL DEFAULT TRUE
recipient_email     String(255)      NULL, INDEXED (Normalized lowercase email)
max_uses            Integer          NULL (NULL = unlimited, 1 = single-use, N = limited)
use_count           Integer          NOT NULL DEFAULT 0
expires_at          DateTime(TZ)     NULL
revoked_at          DateTime(TZ)     NULL
revoked_by_id       String(36)       NULL, FOREIGN KEY -> users.id
created_at          DateTime(TZ)     server_default=now()
updated_at          DateTime(TZ)     onupdate=now()
```

### 3.3 Workspace Join Requests (`workspace_join_requests`)
Tracks requests submitted by users joining via links, codes, or discovery.

```text
Table: workspace_join_requests
-----------------------------------------------------------------------------
id                  String(36)       PRIMARY KEY (UUID)
workspace_id        String(36)       FOREIGN KEY -> workspaces.id (ON DELETE CASCADE)
user_id             String(36)       FOREIGN KEY -> users.id (ON DELETE CASCADE)
invitation_id       String(36)       NULL, FOREIGN KEY -> workspace_invitations.id (ON DELETE SET NULL)
status              String(20)       NOT NULL ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED')
role                String(20)       NOT NULL DEFAULT 'MEMBER'
message             String(500)      NULL (Optional applicant note)
reviewed_by_id      String(36)       NULL, FOREIGN KEY -> users.id
reviewed_at         DateTime(TZ)     NULL
rejection_reason    String(500)      NULL
created_at          DateTime(TZ)     server_default=now()
updated_at          DateTime(TZ)     onupdate=now()
CONSTRAINT: UniqueConstraint('workspace_id', 'user_id', 'status', name='uq_pending_workspace_user_request')
(Or application-level enforcement preventing multiple active PENDING requests per user per workspace)
```

### 3.4 In-App Notifications (`notifications`)
Persists notifications for offline and asynchronous notification retrieval.

```text
Table: notifications
-----------------------------------------------------------------------------
id                  String(36)       PRIMARY KEY (UUID)
user_id             String(36)       FOREIGN KEY -> users.id (ON DELETE CASCADE)
workspace_id        String(36)       NULL, FOREIGN KEY -> workspaces.id (ON DELETE CASCADE)
type                String(50)       NOT NULL (e.g. 'join_request_created', 'join_request_approved')
title               String(255)      NOT NULL
message             String(1000)     NOT NULL
data                JSON             NULL (Payload with IDs, status, actions)
is_read             Boolean          NOT NULL DEFAULT FALSE
created_at          DateTime(TZ)     server_default=now()
```

---

## 4. Workspace Capacity & Concurrency Policy

### 4.1 Capacity Accounting Rules
1. **Active Members Count:** Total records in `workspace_members` for the given `workspace_id`. The workspace `OWNER` occupies 1 active seat.
2. **Pending Join Requests & Invitations:** Do not consume hard seats in advance to avoid seat starvation attacks (e.g. creating 50 invitations and freezing the workspace).
3. **Available Seats:** `max(0, workspace.max_capacity - active_members_count)`.
4. **Enforcement Points:**
   - **Direct Join / Invitation Acceptance:** Atomically checks `active_members < max_capacity`. If full, throws `409 Conflict` (`WORKSPACE_FULL`).
   - **Join Request Submission:** Checked as a pre-condition; users cannot request to join a full workspace.
   - **Admin Approval:** Strictly verified inside a database transaction with a row lock (`with_for_update()`) on the `Workspace` entity.

### 4.2 Concurrency Safety (`SELECT FOR UPDATE`)
To prevent race conditions where two simultaneous approvals push member count past `max_capacity`:
```python
# Atomic Transaction
workspace = db.query(Workspace).filter(Workspace.id == workspace_id).with_for_update().first()
active_count = db.query(WorkspaceMember).filter(WorkspaceMember.workspace_id == workspace_id).count()
if active_count >= workspace.max_capacity:
    raise HTTPException(status_code=409, detail={"error": {"code": "WORKSPACE_FULL", "message": "Workspace member capacity reached"}})

# Proceed to create membership and update request status
```
*Note: SQLite in testing falls back gracefully to standard table locking without breaking compatibility.*

---

## 5. Security & Token Architecture

1. **Token Generation:**
   - Secret Link Tokens: `secrets.token_urlsafe(32)` (256 bits of entropy).
   - Invite Codes: 8 alphanumeric uppercase characters (e.g., `SYNC-7K9M`) using `secrets.choice` excluding ambiguous characters (`0`, `O`, `1`, `I`, `L`).
2. **Token Storage:**
   - Raw tokens are NEVER persisted. Only `token_hash = sha256(raw_token)` is stored.
   - Raw tokens are returned to the caller exactly ONCE upon creation.
   - Invitation validation hashes the incoming token parameter and queries by `token_hash`.
3. **Invite Code Brute-Force Rate Limiting:**
   - In-memory sliding window or count-based attempt limiter tracking failed lookups by IP/User ID.
   - Exceeding 10 failed attempts within 5 minutes results in `429 Too Many Requests`.
4. **Email Invitation Identity Binding:**
   - When an invitation is of type `EMAIL`, accepting or joining validates that `current_user.email.lower() == invitation.recipient_email.lower()`.
   - Prevents an unintended user from intercepting an email invite link and claiming access.
5. **Self-Approval Prevention:**
   - An administrator cannot approve their own join request (`request.user_id != current_user.id`).

---

## 6. Backend API Specification

### 6.1 Capacity & Metadata
- `GET /api/v1/workspaces/{workspace_id}/capacity`
  - Authorization: Workspace member or admin.
  - Returns: `max_capacity`, `active_members`, `pending_requests`, `pending_invitations`, `available_seats`, `requires_approval`.
- `PATCH /api/v1/workspaces/{workspace_id}/capacity`
  - Authorization: Workspace `OWNER` only.
  - Request: `{ "max_capacity": 100, "requires_approval": true }`.
  - Validation: `max_capacity >= current_active_members`.

### 6.2 Invitations Management
- `POST /api/v1/workspaces/{workspace_id}/invitations`
  - Authorization: `OWNER` or `ADMIN`.
  - Request:
    ```json
    {
      "invitation_type": "LINK" | "CODE" | "EMAIL",
      "role": "MEMBER" | "ADMIN",
      "requires_approval": true,
      "recipient_email": "optional@example.com",
      "max_uses": 10,
      "expires_in_days": 7
    }
    ```
  - Returns: Invitation schema containing `id`, `invite_url`, `raw_token` (one-time), `invite_code`, `status`, `expires_at`, etc.
- `GET /api/v1/workspaces/{workspace_id}/invitations`
  - Authorization: `OWNER` or `ADMIN`.
  - Returns: List of invitations (token hash omitted, shows use count, expiration, status).
- `POST /api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/revoke`
  - Authorization: `OWNER` or `ADMIN`.
- `POST /api/v1/workspaces/{workspace_id}/invitations/{invitation_id}/regenerate`
  - Authorization: `OWNER` or `ADMIN`. Generates new secret token / code and revokes previous.

### 6.3 Public & Authenticated Join Flow
- `GET /api/v1/workspaces/invitations/validate?token=...&code=...`
  - Public/Authenticated.
  - Returns public workspace preview (`workspace_name`, `workspace_description`, `member_count`, `requires_approval`, `invitation_type`, `is_valid`, `status`, `reason`).
- `POST /api/v1/workspaces/invitations/join`
  - Authenticated.
  - Request: `{ "token": "...", "code": "...", "message": "Optional note" }`.
  - If `requires_approval` is True: Creates a `PENDING` `WorkspaceJoinRequest`.
  - If `requires_approval` is False: Direct-joins the user into `WorkspaceMember` atomically.

### 6.4 Join Requests Management
- `GET /api/v1/workspaces/{workspace_id}/join-requests`
  - Authorization: `OWNER` or `ADMIN`. Returns list of `PENDING` requests with applicant profile info.
- `GET /api/v1/workspaces/join-requests/my`
  - Authenticated. Returns all join requests submitted by `current_user`.
- `POST /api/v1/workspaces/join-requests/{request_id}/cancel`
  - Authenticated. Requesting user can cancel their own `PENDING` request.
- `POST /api/v1/workspaces/join-requests/{request_id}/approve`
  - Authorization: `OWNER` or `ADMIN`. Transactional check of capacity + user creation + status update to `APPROVED`.
- `POST /api/v1/workspaces/join-requests/{request_id}/reject`
  - Authorization: `OWNER` or `ADMIN`. Request: `{ "reason": "Optional rejection note" }`. Status -> `REJECTED`.

### 6.5 In-App Notifications
- `GET /api/v1/users/notifications`
  - Returns user's persistent notifications.
- `PATCH /api/v1/users/notifications/{id}/read`
  - Marks notification as read.
- `PATCH /api/v1/users/notifications/read-all`
  - Marks all user notifications as read.

---

## 7. Real-Time WebSocket Event Contracts

Using existing `WorkspaceConnectionManager`:

| Event | Recipients | Payload |
|---|---|---|
| `workspace:join_request:created` | Workspace Owners/Admins | `{ request_id, workspace_id, user_name, user_email, requested_at }` |
| `workspace:join_request:approved` | Requesting User Socket | `{ request_id, workspace_id, workspace_name, role, approved_at }` |
| `workspace:join_request:rejected` | Requesting User Socket | `{ request_id, workspace_id, workspace_name, reason }` |
| `workspace:invitation:created` | Workspace Owners/Admins | `{ invitation_id, invitation_type, role, expires_at }` |
| `workspace:invitation:revoked` | Workspace Owners/Admins | `{ invitation_id }` |
| `workspace:capacity:updated` | All Workspace Members | `{ workspace_id, active_members, max_capacity, available_seats }` |
| `member:added` | All Workspace Members | Existing member response payload |

---

## 8. Frontend User Experience Architecture

1. **Workspace Creation (`CreateWorkspace.tsx`):**
   - Add maximum capacity input (`max_capacity`, default 50).
   - Add approval toggle (`requires_approval`, default checked).
   - Informative badge: "Owner occupies 1 active seat".
2. **Workspace Management (`WorkspaceDetail.tsx`):**
   - **Capacity Metric Card:** Visual progress bar (`active / max_capacity`), available seats, pending requests count.
   - **Invitations Panel:**
     - Tab 1: Shareable Link with 1-click Copy and expiry selector.
     - Tab 2: Offline SVG QR Code generator component embedding the invite URL.
     - Tab 3: Short 8-character Invite Code with Copy button.
     - Tab 4: Email Invitation form (with clear configuration status indicator).
     - Active Invitations Table with use counts, expiration, and Revoke/Regenerate buttons.
   - **Approval Queue Tab / Section:**
     - Displays pending applicant cards with user name, email, request timestamp, and optional message.
     - One-click "Approve" (with instant optimistic seat update) and "Reject" actions.
3. **Join Landing Page (`JoinWorkspace.tsx`):**
   - Public route `/join/:token?` (supporting `?token=...` or `?code=...`).
   - If not signed in: displays workspace card + "Sign in to Join" with redirect state saved.
   - If signed in: displays workspace name, member count, seat status, and either "Request to Join" or "Join Workspace".
   - Shows real-time request statuses: `Pending Review`, `Approved`, `Rejected`, `Workspace Full`, or `Expired Link`.

---

## 9. Future Waiting List Architecture

If a workspace reaches `active_members == max_capacity`, a future waiting list can be activated:
1. When capacity is 0, join requests enter a `WAITLISTED` status with a monotonic `waitlist_position`.
2. When a member is removed or capacity is increased, the oldest waitlisted applicant is flagged `ELIGIBLE` and notified.
3. Admins can configure automatic promotion vs. manual approval for waitlisted users.

---

## 10. Verification & Test Plan

1. **Capacity Enforcement:**
   - Workspace creation with capacity 2.
   - Owner occupies 1 seat (available seats = 1).
   - Adding 1 member leaves 0 available seats.
   - Next join attempt or approval receives `409 Conflict`.
2. **Token Security & Validation:**
   - Raw tokens are not found in the database.
   - Expired invitations return `410 Gone` / `EXPIRED`.
   - Revoked invitations return `403 Forbidden` / `REVOKED`.
   - Single-use invitations transition to `EXHAUSTED` after 1 acceptance.
3. **Join Request Lifecycle:**
   - User submits request -> status `PENDING`.
   - Duplicate submission returns `409 Conflict`.
   - Self-approval by user returns `403 Forbidden`.
   - Admin approves -> membership created, request `APPROVED`.
   - Admin rejects -> membership not created, request `REJECTED`.
   - User cancels -> request `CANCELLED`.
4. **Email Identity Check:**
   - Email invitation for `alice@example.com` attempted by `bob@example.com` is rejected.
5. **Real-Time Delivery & Disconnect:**
   - Approval event delivered to applicant.
   - Member removal immediately disconnects user socket.
6. **Frontend Test & Build:**
   - `npm run build` succeeds cleanly with zero errors.
   - End-to-end browser walkthrough of invitation creation, join request, approval, and capacity limits.
