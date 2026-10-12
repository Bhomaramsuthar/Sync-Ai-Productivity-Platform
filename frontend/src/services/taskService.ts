import api from './api';

export interface Task {
  id: string;
  project_id: string;
  created_by: string;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assignee_id: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string | null;
}

export const taskService = {
  list: (projectId: string, params?: any) => api.get<Task[]>(`/projects/${projectId}/tasks`, { params }),
  get: (taskId: string) => api.get<Task>(`/tasks/${taskId}`),
  create: (projectId: string, data: any) => api.post<Task>(`/projects/${projectId}/tasks`, data),
  update: (taskId: string, data: any) => api.patch<Task>(`/tasks/${taskId}`, data),
  delete: (taskId: string) => api.delete(`/tasks/${taskId}`),
};
