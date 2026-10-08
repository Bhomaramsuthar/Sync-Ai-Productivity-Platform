import api from './api';

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  current_user_role: 'OWNER' | 'ADMIN' | 'MEMBER';
  created_at: string;
  updated_at: string | null;
}

export interface Member {
  id: string;
  user_id: string;
  workspace_id: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  joined_at: string;
  user_name: string;
  user_email: string;
}

export const workspaceService = {
  list: () => api.get<Workspace[]>('/workspaces'),
  get: (id: string) => api.get<Workspace>(`/workspaces/${id}`),
  create: (data: { name: string; description?: string }) => api.post<Workspace>('/workspaces', data),
  update: (id: string, data: { name?: string; description?: string }) => api.patch<Workspace>(`/workspaces/${id}`, data),
  delete: (id: string) => api.delete(`/workspaces/${id}`),
};

export const memberService = {
  list: (workspaceId: string) => api.get<Member[]>(`/workspaces/${workspaceId}/members`),
  add: (workspaceId: string, data: { email: string; role: string }) => api.post<Member>(`/workspaces/${workspaceId}/members`, data),
  updateRole: (workspaceId: string, userId: string, data: { role: string }) => api.patch<Member>(`/workspaces/${workspaceId}/members/${userId}`, data),
  remove: (workspaceId: string, userId: string) => api.delete(`/workspaces/${workspaceId}/members/${userId}`),
};
