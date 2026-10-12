# Supabase Sydney → Mumbai Migration Plan

## Safety Principles
- **Zero Data Loss:** We execute full backup and restores, verifying before committing.
- **Downtime Management:** A maintenance window will be required during cutover to prevent data writes to the Sydney project.
- **Rollback Awareness:** The Sydney project remains untouched until full acceptance tests pass. Rolling back means reverting environment variables.

---

## 1. Inventory & Pre-Migration Prep
1. Verify the schema mapping from `SUPABASE_MIGRATION_INVENTORY.md` against the production Sydney database using read-only dashboard access.
2. Determine current row counts for all tables (`users`, `workspaces`, `workspace_members`, `projects`, `tasks`, `project_activities`, `documents`).
3. Take a snapshot count of the objects in the Supabase Storage `project_documents` bucket.
4. Determine the exact Alembic revision currently deployed on the database (`alembic_version` table).

## 2. Backup the Sydney Database
1. Set the application in Maintenance Mode (or stop frontend traffic) to prevent new writes.
2. Using `pg_dump` via connection string, run a full backup:
   ```bash
   pg_dump -U postgres -h db.[SYDNEY_PROJECT_REF].supabase.co -p 5432 -d postgres -F c -f sydney_backup.dump
   ```
3. Backup verification: Use `pg_restore -l sydney_backup.dump` to ensure the backup file is intact and contains the expected tables.

## 3. Storage Export
1. Write a script using the Supabase Python SDK or use a tool like `rclone` or AWS CLI (if using S3 compatability) to download all objects in the `project_documents` bucket from the Sydney project locally.
2. Verify downloaded files match the snapshot count.

## 4. Provision the Mumbai Project
1. In the Supabase Dashboard, create a new project.
2. Select the **South Asia (Mumbai)** region.
3. Note the new Database URL, API URL, and Service Role Key.

## 5. Restoration of Database
1. Use `pg_restore` to push the database backup into the Mumbai PostgreSQL database:
   ```bash
   pg_restore -U postgres -h db.[MUMBAI_PROJECT_REF].supabase.co -p 5432 -d postgres -1 sydney_backup.dump
   ```
2. *Important:* **Do NOT run `alembic upgrade head`** against the Mumbai database after restoring. The `alembic_version` table will be imported from the backup, safely retaining the exact state of migrations. 
3. Verify that all tables, foreign keys, and indexes exist in the Mumbai database via the Supabase Dashboard or `psql`.

## 6. Recreation of Platform Settings
1. Go to Supabase Storage in the Mumbai project and manually create the `project_documents` bucket.
2. Ensure the bucket privacy is set correctly (Private).

## 7. Migration of Storage Objects
1. Use the Supabase Python SDK, or `rclone`, to upload all downloaded files from Step 3 into the new Mumbai `project_documents` bucket.
2. Ensure that the object paths (keys) match exactly what they were originally so the DB `storage_key` references remain valid.

## 8. Configuration Updates
1. Create a new environment configuration (or duplicate the `.env` file for local testing).
2. Update the following variables:
   - `DATABASE_URL` -> Set to the Mumbai Postgres connection string.
   - `SUPABASE_URL` -> Set to the Mumbai Project API URL.
   - `SUPABASE_KEY` -> Set to the Mumbai Project Service Role Key.

## 9. Verification & Data Integrity Checks
1. Run application queries locally pointing to the new DB.
2. Verify Authentication: Since custom JWTs and our own `users` table are used, existing password hashes will work immediately.
3. Verify `alembic current` correctly identifies the state without proposing changes.
4. Verify relationships (Workspaces -> Projects -> Tasks).

## 10. Cutover
1. Update deployment secrets (Vercel, Render, AWS, etc.) with the new Mumbai credentials.
2. Redeploy or restart the backend to apply the new connection strings.
3. Disable Maintenance Mode.

## 11. Post-Cutover & Retirement
1. Monitor application logs for database connection issues.
2. Confirm no traffic is routing to Sydney.
3. Keep the Sydney project active for at least 7 days as a fallback. 
4. Once all data integrity is signed off, retire and delete the Sydney project.
