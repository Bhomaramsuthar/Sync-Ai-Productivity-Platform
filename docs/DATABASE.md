# Database Design

## 1. Database

Primary database: PostgreSQL (hosted on Supabase)
Vector extension: pgvector
Storage: Supabase Storage
Migrations: Alembic

No Redis schema.

---

# 2. Core Entities

## User
- id (UUID)
- name
- email
- passwordHash
- avatarUrl
- createdAt
- updatedAt

## Workspace
- id (UUID)
- name
- description
- ownerId (UUID)
- createdAt
- updatedAt

## WorkspaceMember
- id (UUID)
- workspaceId (UUID)
- userId (UUID)
- role (OWNER, ADMIN, MEMBER)
- joinedAt

## Project
- id (UUID)
- workspaceId (UUID)
- name
- description
- status
- startDate
- deadline
- createdBy (UUID)
- createdAt
- updatedAt

## ProjectMember
- id (UUID)
- projectId (UUID)
- userId (UUID)
- role

## Task
- id (UUID)
- projectId (UUID)
- title
- description
- status (BACKLOG, TODO, IN_PROGRESS, REVIEW, DONE)
- priority (LOW, MEDIUM, HIGH, CRITICAL)
- assigneeId (UUID)
- createdBy (UUID)
- dueDate
- estimatedHours
- actualHours
- createdAt
- updatedAt
- completedAt

## Subtask
- id (UUID)
- parentTaskId (UUID)
- title
- status
- assigneeId (UUID)
- dueDate

## Comment
- id (UUID)
- taskId (UUID)
- userId (UUID)
- content
- createdAt
- updatedAt

## Activity
- id (UUID)
- workspaceId (UUID)
- projectId (UUID)
- taskId (UUID)
- userId (UUID)
- action
- metadata
- createdAt

## Document
- id (UUID)
- workspaceId (UUID)
- projectId (UUID)
- title
- content
- createdBy (UUID)
- createdAt
- updatedAt

## DocumentChunk
- id (UUID)
- documentId (UUID)
- content
- chunkIndex
- embedding (pgvector)
- createdAt

## CalendarEvent
- id (UUID)
- workspaceId (UUID)
- projectId (UUID)
- taskId (UUID)
- title
- description
- startTime
- endTime
- createdBy (UUID)
- createdAt

## Notification
- id (UUID)
- userId (UUID)
- type
- title
- message
- relatedEntityId (UUID)
- isRead
- createdAt

## Conversation
- id (UUID)
- userId (UUID)
- workspaceId (UUID)
- projectId (UUID)
- title
- createdAt
- updatedAt

## Message
- id (UUID)
- conversationId (UUID)
- senderRole (USER, AI)
- content
- createdAt

---

# 3. Relationships

```text
User
 |
 +---- WorkspaceMember ---- Workspace
 |                            |
 |                            +---- Project
 |                                  |
 |                                  +---- Task
 |                                  |     |
 |                                  |     +---- Subtask
 |                                  |     |
 |                                  |     +---- Comment
 |                                  |
 |                                  +---- Document
 |                                        |
 |                                        +---- DocumentChunk
 |
 +---- Task Assignment
 |
 +---- Notifications
 |
 +---- Conversation
       |
       +---- Message
 ```

# 4. Database Rules

- Use UUID identifiers.
- Use foreign keys.
- Add timestamps to major entities.
- Use Alembic migrations.
- Do not delete important records without considering audit requirements.
- Add indexes based on actual query requirements.
- Enforce workspace/project authorization at the application layer.
- Never store plaintext passwords.
- Do not store LLM-generated permissions.