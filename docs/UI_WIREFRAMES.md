# UI Wireframes

This document outlines the wireframes and structure for the core pages of the application. The design should feel like a modern productivity software (Notion + Linear/Jira) while remaining highly usable.

## 1. Login
- **Layout**: Centered card on a clean, minimal background.
- **Main components**: Email input, Password input, Login button.
- **Primary actions**: "Log In"
- **Secondary actions**: "Forgot Password?", "Create an Account" (link to register).
- **Important information**: Logo, branding.
- **Error state**: Inline red text below the input or a global toast notification for invalid credentials.
- **Responsive behavior**: Full screen on mobile, centered card on desktop.

## 2. Registration
- **Layout**: Centered card.
- **Main components**: Name input, Email input, Password input, Confirm Password input, Register button.
- **Primary actions**: "Sign Up"
- **Secondary actions**: "Already have an account? Log in."
- **Error state**: Validation messages for short passwords, mismatched passwords.
- **Loading state**: Spinner on the button.

## 3. Dashboard (Global)
- **Layout**: Main Application Layout (Left Sidebar + Top Nav + Main Content).
- **Main components**: 
  - Sidebar: Workspaces list, User profile, Settings.
  - Content: Recent workspaces, Notifications, Global upcoming tasks.
- **Primary actions**: "Create Workspace"
- **Empty state**: "You don't belong to any workspaces yet. Create one to get started." illustration.

## 4. Workspace
- **Layout**: Main Application Layout.
- **Main components**:
  - Sidebar: Projects list within the workspace, Members, Settings.
  - Content: Grid or list of projects, Workspace activity feed, Members list overview.
- **Primary actions**: "New Project", "Invite Member"
- **Empty state**: "No projects here. Create your first project."

## 5. Project Overview
- **Layout**: Project Layout (Sidebar + Project Sub-nav + Content). Project Sub-nav contains Overview, Tasks, Kanban, Calendar, Documents, AI.
- **Main components**: Key metrics (tasks completed, pending), Recent activity feed, AI summary of project status.
- **Primary actions**: "New Task", "Ask AI"
- **Important information**: Deadline, Project members.

## 6. Task List
- **Layout**: Project Layout.
- **Main components**: Data table/list of tasks. Columns for Title, Status, Priority, Assignee, Deadline.
- **Primary actions**: "New Task"
- **Secondary actions**: Filter, Sort, Search.
- **Empty state**: "No tasks found. Create a new task."
- **Responsive behavior**: Horizontal scroll on mobile or stack cards.

## 7. Kanban
- **Layout**: Project Layout.
- **Main components**: Board with columns (Backlog, Todo, In Progress, Review, Done). Draggable task cards.
- **Primary actions**: "Add Task" button at the bottom/top of each column.
- **Secondary actions**: Filter by assignee, Search.
- **Empty state**: Empty columns display a subtle "Drop tasks here" area.

## 8. Task Details
- **Layout**: Right-side drawer or Modal over the current view (List/Kanban).
- **Main components**: 
  - Header: Task Title (editable), Status dropdown.
  - Properties: Assignee, Priority, Deadline, Estimated Hours.
  - Description: Markdown editor for task details.
  - Subtasks: Checklist.
  - Comments: Threaded conversation.
- **Primary actions**: Save changes (auto-save preferred), Add Comment.
- **Secondary actions**: Close drawer, Delete task.

## 9. Calendar
- **Layout**: Project Layout.
- **Main components**: Monthly/Weekly grid view displaying tasks as events spanning their start/deadlines.
- **Primary actions**: Click on a date to create a new task with that deadline. Click on an event to open Task Details.
- **Secondary actions**: Change view (Month/Week).

## 10. Documents
- **Layout**: Project Layout.
- **Main components**: 
  - Left panel (within content area): List of documents (tree view if hierarchical).
  - Main area: Markdown editor / Document viewer.
- **Primary actions**: "New Document", "Upload File".
- **Important information**: Document title, Last updated timestamp.
- **Empty state**: "No documents. Start writing."

## 11. AI Assistant
- **Layout**: Floating persistent chat interface (toggleable via a bottom-right FAB) OR a dedicated "AI" tab in the Project Layout.
- **Main components**: Chat history window, Input box.
- **Primary actions**: "Send message", Suggested prompts chips ("Summarize project", "Generate tasks").
- **Important information**: Clearly distinguished blocks for "Confirmation Required" (e.g., when the AI suggests creating tasks and asks for a click to confirm).
- **Loading state**: Typing indicator ("AI is thinking...").

## 12. Notifications
- **Layout**: Dropdown popover from the Top Navigation.
- **Main components**: List of recent notifications (mentions, assignments, deadlines). Unread indicator dots.
- **Primary actions**: Click notification to navigate to the item. "Mark all as read".
- **Empty state**: "You're all caught up!"

## 13. Settings
- **Layout**: Main Application Layout (dedicated Settings route).
- **Main components**: Tabs for Profile, Preferences, Account Security.
- **Primary actions**: "Update Profile", "Change Password".
