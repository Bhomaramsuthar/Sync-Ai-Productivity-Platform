import api from './api';
import type { User, UserPreferences } from '../context/AuthContext';

export interface UpdateProfilePayload {
  name?: string;
  preferences?: Partial<UserPreferences>;
}

export interface ChangePasswordPayload {
  current_password: string;
  new_password: string;
}

export interface DeleteAccountPayload {
  password: string;
  confirmation_email: string;
}

export const userService = {
  getProfile: () => api.get<User>('/users/me'),

  updateProfile: (data: UpdateProfilePayload) => api.patch<User>('/users/me', data),

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<User>('/users/me/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },

  removeAvatar: () => api.delete<User>('/users/me/avatar'),

  changePassword: (data: ChangePasswordPayload) =>
    api.post<{ message: string }>('/users/me/change-password', data),

  deleteAccount: (data: DeleteAccountPayload) =>
    api.delete<{ message: string }>('/users/me', { data }),
};
