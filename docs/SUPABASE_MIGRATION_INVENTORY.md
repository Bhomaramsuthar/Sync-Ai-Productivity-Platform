# Supabase Migration Inventory: Sydney to Mumbai

## Application Architecture Overview
- **Authentication:** Custom FastAPI JWT implementation. Not using Supabase Auth (records live in the `users` table, not `auth.users`).
- **Database Access:** Direct PostgreSQL connection using SQLAlchemy and Psycopg. 
- **Storage:** Supabase Storage is used. Bucket: `project_documents`.
- **Migrations:** Managed via Alembic, not Supabase CLI. 
- **RLS/Functions:** No evidence in the codebase of relying on Supabase Row Level Security (RLS) or custom Postgres functions/triggers, as the connection likely acts as a privileged user through SQLAlchemy.

---

## 1. Table Inventory (PostgreSQL)

*Note: Row counts are unknown without querying the production database. Run `SELECT count(*) FROM table_name;` to verify actual numbers.*

### `alembic_version`
- **Columns:** `version_num` (String)
- **Primary Keys:** `version_num`
- **Description:** Tracks the current migration state. Critical to preserve to avoid Alembic conflicts.

### `users`
- **Columns:**
  - `id` (String 36, PK)
  - `name` (String 255)
  - `email` (String 255, Unique Index)
  - `password_hash` (String 255)
  - `role` (Enum: USER, ADMIN)
  - `created_at` (DateTime)
  - `updated_at` (DateTime)
- **Primary Keys:** `id`
- **Indexes:** `ix_users_email` (Unique)

### `workspaces`
- **Columns:**
  - `id` (String 36, PK)
  - `name` (String 255)
  - `description` (String 1000)
  - `owner_id` (String 36, FK to `users.id`)
  - `created_at` (DateTime)
  - `updated_at` (DateTime)
- **Primary Keys:** `id`
- **Foreign Keys:** `owner_id` -> `users.id`

### `workspace_members`
- **Columns:**
  - `id` (String 36, PK)
  - `workspace_id` (String 36, FK to `workspaces.id` on delete CASCADE)
  - `user_id` (String 36, FK to `users.id`)
  - `role` (Enum: OWNER, ADMIN, MEMBER)
  - `joined_at` (DateTime)
- **Primary Keys:** `id`
- **Foreign Keys:** `workspace_id` -> `workspaces.id`, `user_id` -> `users.id`
- **Unique Constraints:** `uq_workspace_user` (`workspace_id`, `user_id`)

### `projects`
- **Columns:**
  - `id` (String 36, PK)
  - `workspace_id` (String 36, FK to `workspaces.id` on delete CASCADE)
  - `name` (String 255)
  - `description` (String 1000)
  - `status` (Enum: ACTIVE, COMPLETED, ARCHIVED)
  - `owner_id` (String 36, FK to `users.id`)
  - `created_at` (DateTime)
  - `updated_at` (DateTime)
- **Primary Keys:** `id`
- **Foreign Keys:** `workspace_id` -> `workspaces.id`, `owner_id` -> `users.id`

### `tasks`
- **Columns:**
  - `id` (String 36, PK)
  - `project_id` (String 36, FK to `projects.id` on delete CASCADE)
  - `title` (String 255)
  - `description` (String 2000)
  - `status` (Enum: TODO, IN_PROGRESS, IN_REVIEW, DONE)
  - `priority` (Enum: LOW, MEDIUM, HIGH, URGENT)
  - `assignee_id` (String 36, FK to `users.id` on delete SET NULL)
  - `created_by` (String 36, FK to `users.id`)
  - `due_date` (DateTime)
  - `created_at` (DateTime)
  - `updated_at` (DateTime)
- **Primary Keys:** `id`
- **Foreign Keys:** `project_id` -> `projects.id`, `assignee_id` -> `users.id`, `created_by` -> `users.id`

### `project_activities`
- **Columns:**
  - `id` (String 36, PK)
  - `project_id` (String 36, FK to `projects.id` on delete CASCADE)
  - `actor_id` (String 36, FK to `users.id` on delete SET NULL)
  - `event_type` (String 50)
  - `target_entity_type` (String 50)
  - `target_entity_id` (String 36)
  - `event_metadata` (String 2000 - JSON representation)
  - `created_at` (DateTime)
- **Primary Keys:** `id`
- **Foreign Keys:** `project_id` -> `projects.id`, `actor_id` -> `users.id`

### `documents`
- **Columns:**
  - `id` (String 36, PK)
  - `project_id` (String 36, FK to `projects.id` on delete CASCADE)
  - `uploader_id` (String 36, FK to `users.id` on delete SET NULL)
  - `filename` (String 255)
  - `storage_key` (String 1000)
  - `content_type` (String 100)
  - `file_size` (Integer)
  - `status` (String 50)
  - `created_at` (DateTime)
- **Primary Keys:** `id`
- **Foreign Keys:** `project_id` -> `projects.id`, `uploader_id` -> `users.id`

---

## 2. Storage Inventory

- **Bucket Name:** `project_documents`
- **Privacy Setting:** Private (Not Public)
- **Data Model Link:** Each object in this bucket corresponds to the `storage_key` field in the `documents` table.
- **Policies:** Since backend is accessing via the Service Role or explicitly passing standard configuration keys, no custom RLS policies are known to exist directly in Supabase for this bucket.

---

## 3. Configuration Inventory

Values that MUST be updated in environment variables when pointing to the Mumbai project:
- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_KEY`
