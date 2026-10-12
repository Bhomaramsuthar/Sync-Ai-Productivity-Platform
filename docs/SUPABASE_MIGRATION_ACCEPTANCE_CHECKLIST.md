# Supabase Migration Acceptance Checklist

This checklist must be fully verified against the Mumbai deployment before the Sydney project can be retired.

## Automated Verification Checks (Can be scripted)
- [ ] **Alembic State Matches:** Running `alembic current` on Mumbai DB reports the exact same revision as the Sydney DB.
- [ ] **Table Count Matches:** `COUNT(*)` for every table matches exactly between Sydney and Mumbai snapshots:
  - [ ] `users`
  - [ ] `workspaces`
  - [ ] `workspace_members`
  - [ ] `projects`
  - [ ] `tasks`
  - [ ] `project_activities`
  - [ ] `documents`
- [ ] **Storage Object Counts:** Total file count in the `project_documents` bucket matches the Sydney project.
- [ ] **Test Suite Passes:** Run existing `pytest` backend tests and verify they pass using the new DB.
- [ ] **Frontend Build Passes:** Verify `npm run build` succeeds using the new environment variables.

## Manual Verification Checks (Dashboard / UI)
- [ ] **Database Structure Integrity:** 
  - Verify primary keys and foreign-key constraints exist in the new DB.
  - Verify indexes (`ix_users_email`, `uq_workspace_user`) exist.
- [ ] **Authentication & Identity:** 
  - Login to the frontend using an existing user account (tests custom JWT + `password_hash`).
  - Verify user roles are correctly enforced (e.g., ADMIN vs USER).
- [ ] **Workspace & Project Isolation:**
  - View a Workspace. Verify only assigned members can see it.
  - Check that a user cannot see projects they don't have membership in.
- [ ] **Tasks & Activity:**
  - Verify that tasks have the correct assignees and deadlines.
  - Check that project activity logs load successfully.
- [ ] **Documents & Storage Integrations:**
  - Locate an existing uploaded document.
  - Verify the metadata matches (`filename`, `file_size`).
  - Download the file and ensure it opens correctly (Validates Storage migration & signed URLs).
  - Upload a new document and ensure it lands in the Mumbai bucket.
  - Delete a document and ensure both the DB record and Storage object are removed.
- [ ] **Environment Verification:**
  - Double-check production deployment secrets (e.g., in Vercel/Render). Ensure NO active environment still points to `*.supabase.co` from the Sydney region.
