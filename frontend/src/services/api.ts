import axios from 'axios';

/**
 * Resolves the backend API base URL for development and production.
 * Ensures the `/api/v1` prefix is attached without duplication,
 * and strips any trailing slashes from the configured environment variable.
 */
export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL || '').trim();
  if (!envUrl) {
    return 'http://127.0.0.1:8000/api/v1';
  }
  const cleanUrl = envUrl.replace(/\/+$/, '');
  return cleanUrl.endsWith('/api/v1') ? cleanUrl : `${cleanUrl}/api/v1`;
}

/**
 * Extracts a human-readable, specific error message from an Axios error response.
 * Handles FastAPI default error schemas ({ detail: string | array | object }),
 * custom backend error wrappers ({ detail: { error: { message: string } } }),
 * and network-level failure descriptions.
 */
export function extractErrorMessage(err: any, fallback: string = 'An unexpected error occurred'): string {
  if (!err) return fallback;

  if (err.response?.data) {
    const data = err.response.data;
    if (typeof data.detail === 'string' && data.detail.trim()) {
      return data.detail;
    }
    if (data.detail?.error?.message && typeof data.detail.error.message === 'string') {
      return data.detail.error.message;
    }
    if (Array.isArray(data.detail) && data.detail.length > 0) {
      const messages = data.detail
        .map((item: any) => (typeof item === 'string' ? item : item.msg || JSON.stringify(item)))
        .filter(Boolean);
      if (messages.length > 0) return messages.join('; ');
    }
    if (typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }
  }

  if (err.response?.status) {
    const status = err.response.status;
    if (status === 404) return 'The requested resource or endpoint was not found on the server (404).';
    if (status === 403) return 'You do not have permission to access this resource (403).';
    if (status === 401) return 'Your session has expired. Please log in again (401).';
    if (status >= 500) return 'The server encountered an internal error. Please try again later (500).';
  }

  if (err.message && typeof err.message === 'string') {
    if (err.message === 'Network Error') {
      return 'Network Error: Unable to reach the backend API. Please ensure the local server is running on http://127.0.0.1:8000.';
    }
    return err.message;
  }

  return fallback;
}

const api = axios.create({
  baseURL: getApiBaseUrl(),
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
    }
    return Promise.reject(error);
  }
);

export default api;
