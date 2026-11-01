import api from './api';

export interface Workspace {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  max_capacity: number;
  requires_approval: boolean;
  current_user_role: 'OWNER' | 'ADMIN' | 'MEMBER';
  member_count?: number;
  owner_name?: string | null;
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

export interface WorkspaceCapacity {
  workspace_id: string;
  max_capacity: number;
  active_members: number;
  available_seats: number;
  pending_requests: number;
  pending_invitations: number;
  requires_approval: boolean;
  is_full: boolean;
}

export interface Invitation {
  id: string;
  workspace_id: string;
  creator_id: string;
  invitation_type: 'LINK' | 'CODE' | 'EMAIL';
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'EXHAUSTED';
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  requires_approval: boolean;
  recipient_email?: string | null;
  max_uses?: number | null;
  use_count: number;
  expires_at?: string | null;
  invite_code?: string | null;
  invite_url?: string | null;
  raw_token?: string | null;
  created_at?: string | null;
}

export interface ValidateInvitationResult {
  is_valid: boolean;
  status: string;
  reason?: string | null;
  invitation_type?: 'LINK' | 'CODE' | 'EMAIL';
  workspace_id?: string;
  workspace_name?: string;
  workspace_description?: string | null;
  owner_name?: string;
  requires_approval: boolean;
  role?: 'MEMBER' | 'ADMIN';
  recipient_email?: string | null;
  is_full: boolean;
  active_members: number;
  max_capacity: number;
}

export interface JoinWorkspaceResult {
  success: boolean;
  status: 'JOINED' | 'REQUESTED';
  message: string;
  workspace_id: string;
  workspace_name: string;
  role: 'MEMBER' | 'ADMIN';
  request_id?: string | null;
}

export interface JoinRequest {
  id: string;
  workspace_id: string;
  workspace_name?: string;
  user_id: string;
  user_name: string;
  user_email: string;
  user_avatar_url?: string | null;
  invitation_id?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED';
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
  message?: string | null;
  created_at?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
}

export interface AppNotification {
  id: string;
  user_id: string;
  workspace_id?: string | null;
  type: string;
  title: string;
  message: string;
  data?: any;
  is_read: boolean;
  created_at: string;
}

export const workspaceService = {
  list: () => api.get<Workspace[]>('/workspaces'),
  get: (id: string) => api.get<Workspace>(`/workspaces/${id}`),
  create: (data: { name: string; description?: string; max_capacity?: number; requires_approval?: boolean }) =>
    api.post<Workspace>('/workspaces', data),
  update: (id: string, data: { name?: string; description?: string; max_capacity?: number; requires_approval?: boolean }) =>
    api.patch<Workspace>(`/workspaces/${id}`, data),
  delete: (id: string) => api.delete(`/workspaces/${id}`),
  getCapacity: (workspaceId: string) => api.get<WorkspaceCapacity>(`/workspaces/${workspaceId}/capacity`),
  updateCapacity: (workspaceId: string, data: { max_capacity: number; requires_approval?: boolean }) =>
    api.patch<WorkspaceCapacity>(`/workspaces/${workspaceId}/capacity`, data),
};

export const memberService = {
  list: (workspaceId: string) => api.get<Member[]>(`/workspaces/${workspaceId}/members`),
  add: (workspaceId: string, data: { email: string; role: string }) => api.post<Member>(`/workspaces/${workspaceId}/members`, data),
  updateRole: (workspaceId: string, userId: string, data: { role: string }) => api.patch<Member>(`/workspaces/${workspaceId}/members/${userId}`, data),
  remove: (workspaceId: string, userId: string) => api.delete(`/workspaces/${workspaceId}/members/${userId}`),
};

export const invitationService = {
  create: (workspaceId: string, data: {
    invitation_type: 'LINK' | 'CODE' | 'EMAIL';
    role?: 'MEMBER' | 'ADMIN';
    requires_approval?: boolean;
    recipient_email?: string;
    max_uses?: number;
    expires_in_days?: number;
  }) => api.post<Invitation>(`/workspaces/${workspaceId}/invitations`, data),

  list: (workspaceId: string) => api.get<Invitation[]>(`/workspaces/${workspaceId}/invitations`),
  revoke: (workspaceId: string, invitationId: string) => api.post(`/workspaces/${workspaceId}/invitations/${invitationId}/revoke`),
  regenerate: (workspaceId: string, invitationId: string) => api.post<Invitation>(`/workspaces/${workspaceId}/invitations/${invitationId}/regenerate`),

  validate: (params: { token?: string; code?: string }) => {
    const query = new URLSearchParams();
    if (params.token) query.set('token', params.token);
    if (params.code) query.set('code', params.code);
    return api.get<ValidateInvitationResult>(`/workspaces/invitations/validate?${query.toString()}`);
  },

  join: (data: { token?: string; code?: string; message?: string }) =>
    api.post<JoinWorkspaceResult>('/workspaces/invitations/join', data),

  acceptEmail: (data: { token?: string; invitation_id?: string }) =>
    api.post<Member>('/workspaces/invitations/email/accept', data),

  declineEmail: (data: { token?: string; invitation_id?: string }) =>
    api.post('/workspaces/invitations/email/decline', data),
};

export const joinRequestService = {
  listForWorkspace: (workspaceId: string) => api.get<JoinRequest[]>(`/workspaces/${workspaceId}/join-requests`),
  listMyRequests: () => api.get<JoinRequest[]>('/workspaces/join-requests/my'),
  cancel: (requestId: string) => api.post(`/workspaces/join-requests/${requestId}/cancel`),
  approve: (requestId: string) => api.post<Member>(`/workspaces/join-requests/${requestId}/approve`),
  reject: (requestId: string, reason?: string) => api.post(`/workspaces/join-requests/${requestId}/reject`, { reason }),
};

export const notificationService = {
  list: () => api.get<AppNotification[]>('/users/notifications'),
  markRead: (notificationId: string) => api.patch<AppNotification>(`/users/notifications/${notificationId}/read`),
  markAllRead: () => api.patch<{ updated_count: number }>('/users/notifications/read-all'),
};
