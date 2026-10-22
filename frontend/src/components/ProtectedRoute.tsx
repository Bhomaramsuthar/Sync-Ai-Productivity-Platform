import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AppLayout } from './AppLayout';
import { ThinkingLoader } from './ThinkingLoader';

export const ProtectedRoute: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <ThinkingLoader
        state="working"
        size={64}
        message="Loading application session..."
        description="Authenticating user credentials & workspace access"
        fullscreen
      />
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <AppLayout />;
};
