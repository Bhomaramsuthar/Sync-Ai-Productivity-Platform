import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';

export interface UserPreferences {
  theme: string;
  email_notifications: boolean;
  task_updates: boolean;
  meeting_reminders: boolean;
  ai_suggestions: boolean;
  weekly_digest: boolean;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar_url?: string | null;
  preferences?: UserPreferences;
  created_at?: string | null;
  updated_at?: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (token: string, userData: User, redirectTo?: string) => void;
  logout: () => void;
  updateUser: (userData: Partial<User>) => void;
  refreshUser: () => Promise<User | null>;
}


const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchCurrentUser = async (): Promise<User | null> => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
      return response.data;
    } catch {
      localStorage.removeItem('token');
      setUser(null);
      return null;
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      fetchCurrentUser().finally(() => {
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, []);

  // Synchronize and apply user appearance theme to DOM
  useEffect(() => {
    const applyTheme = (themeName?: string) => {
      let resolved = themeName || 'dark';
      if (resolved === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      document.documentElement.setAttribute('data-theme', resolved);
      if (resolved === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme(user?.preferences?.theme);

    if (user?.preferences?.theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => applyTheme('system');
      mediaQuery.addEventListener('change', listener);
      return () => mediaQuery.removeEventListener('change', listener);
    }
  }, [user?.preferences?.theme]);

  const login = (token: string, userData: User, redirectTo?: string) => {
    localStorage.setItem('token', token);
    setUser(userData);
    if (redirectTo) {
      navigate(redirectTo);
    } else {
      navigate('/dashboard');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
    navigate('/login');
  };

  const updateUser = (userData: Partial<User>) => {
    setUser(prev => (prev ? { ...prev, ...userData } : null));
  };

  const refreshUser = async () => {
    return await fetchCurrentUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, isAuthenticated: !!user, login, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};


export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
