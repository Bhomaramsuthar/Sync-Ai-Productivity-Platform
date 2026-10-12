import api from './api';

export interface Project {
  id: string;
  workspace_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  created_at: string;
  updated_at: string | null;
}

export interface ProjectActivity {
  id: string;
  project_id: string;
  actor_id: string | null;
  event_type: string;
  target_entity_type: string;
  target_entity_id: string;
  event_metadata: string | null;
  created_at: string;
}

export interface ProjectInsights {
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  todo_tasks: number;
  overdue_tasks: number;
  completion_percentage: number;
}

export const projectService = {
  list: (workspaceId: string) => api.get<Project[]>(`/workspaces/${workspaceId}/projects`),
  get: (projectId: string) => api.get<Project>(`/projects/${projectId}`),
  create: (workspaceId: string, data: { name: string; description?: string }) => api.post<Project>(`/workspaces/${workspaceId}/projects`, data),
  update: (projectId: string, data: { name?: string; description?: string; status?: string }) => api.patch<Project>(`/projects/${projectId}`, data),
  delete: (projectId: string) => api.delete(`/projects/${projectId}`),
  getActivity: (projectId: string) => api.get<ProjectActivity[]>(`/projects/${projectId}/activity`),
  getInsights: (projectId: string) => api.get<ProjectInsights>(`/projects/${projectId}/insights`),
};
