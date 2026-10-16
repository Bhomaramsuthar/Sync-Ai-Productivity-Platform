import api from './api';

export interface TaskExpandRequest {
  title: string;
  context?: string;
}

export interface TaskExpandResponse {
  description: string;
  acceptance_criteria: string[];
  suggested_priority: string;
}

export interface TaskBreakdownRequest {
  title: string;
  description?: string;
}

export interface ProposedSubtask {
  title: string;
  description: string;
  priority: string;
}

export interface TaskBreakdownResponse {
  subtasks: ProposedSubtask[];
}

export interface TaskPrioritySuggestionRequest {
  title: string;
  description?: string;
  due_date?: string | null;
}

export interface TaskPrioritySuggestionResponse {
  suggested_priority: string;
  reasoning: string;
}

export interface TaskUnblockRequest {
  task_id?: string;
  title: string;
  description?: string;
  blocker: string;
}

export interface TaskUnblockResponse {
  next_action: string;
  unblocking_steps: string[];
  rationale: string;
}

export interface TaskSummaryItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  due_date?: string | null;
  assignee_id?: string | null;
}

export interface ProjectFactualMetrics {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  todo_tasks: number;
  overdue_tasks: number;
  completion_percentage: number;
  overdue_task_items: TaskSummaryItem[];
  upcoming_deadlines: TaskSummaryItem[];
  recent_activity_count: number;
}

export interface TaskActionReference {
  task_id?: string | null;
  task_title?: string | null;
  action: string;
  priority?: string;
}

export interface ProjectAISummaryResponse {
  project_id: string;
  project_name: string;
  generated_at: string;
  factual_metrics: ProjectFactualMetrics;
  executive_summary: string;
  key_highlights: string[];
  potential_blockers: string[];
  recommended_actions: TaskActionReference[];
  is_empty_project: boolean;
}

export interface ProductivityRecommendation {
  id: string;
  type: string;
  priority: string;
  title: string;
  explanation: string;
  suggested_action: string;
  related_task_id?: string | null;
  related_task_title?: string | null;
}

export interface ProjectProductivityInsightsResponse {
  project_id: string;
  project_name: string;
  factual_metrics: ProjectFactualMetrics;
  recommendations: ProductivityRecommendation[];
  ai_synthesis?: string | null;
  generated_at: string;
}

export const productivityService = {
  expandTask: (projectId: string, data: TaskExpandRequest) =>
    api.post<TaskExpandResponse>(`/projects/${projectId}/ai/task-assistant/expand`, data),

  breakdownTask: (projectId: string, data: TaskBreakdownRequest) =>
    api.post<TaskBreakdownResponse>(`/projects/${projectId}/ai/task-assistant/breakdown`, data),

  suggestPriority: (projectId: string, data: TaskPrioritySuggestionRequest) =>
    api.post<TaskPrioritySuggestionResponse>(`/projects/${projectId}/ai/task-assistant/suggest-priority`, data),

  unblockTask: (projectId: string, data: TaskUnblockRequest) =>
    api.post<TaskUnblockResponse>(`/projects/${projectId}/ai/task-assistant/unblock`, data),

  getSummary: (projectId: string) =>
    api.post<ProjectAISummaryResponse>(`/projects/${projectId}/ai/summary`),

  getInsights: (projectId: string) =>
    api.get<ProjectProductivityInsightsResponse>(`/projects/${projectId}/ai/insights`),
};
