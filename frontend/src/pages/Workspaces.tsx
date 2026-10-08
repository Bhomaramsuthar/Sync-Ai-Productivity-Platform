import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { workspaceService } from '../services/workspaceService';
import type { Workspace } from '../services/workspaceService';
import api from '../services/api';

const Workspaces = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    workspaceService.list()
      .then(res => setWorkspaces(res.data))
      .catch(() => setError('Failed to load workspaces'))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    logout();
  };

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case 'OWNER': return 'badge badge-owner';
      case 'ADMIN': return 'badge badge-admin';
      default: return 'badge badge-member';
    }
  };

  if (loading) return <div className="loading-screen">Loading workspaces...</div>;

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <h1 className="page-title">Workspaces</h1>
          <p className="page-subtitle">Manage your team workspaces</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className="text-muted">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary">Sign Out</button>
        </div>
      </header>

      {error && <div className="error-message">{error}</div>}

      <div style={{ marginBottom: '2rem' }}>
        <button className="btn-primary" style={{ width: 'auto', padding: '0.75rem 1.5rem' }} onClick={() => navigate('/workspaces/new')}>
          + Create Workspace
        </button>
      </div>

      {workspaces.length === 0 ? (
        <div className="empty-state">
          <h3>No workspaces yet</h3>
          <p className="text-muted">Create your first workspace to get started</p>
        </div>
      ) : (
        <div className="card-grid">
          {workspaces.map(ws => (
            <Link to={`/workspaces/${ws.id}`} key={ws.id} className="workspace-card">
              <div className="workspace-card-header">
                <h3 className="workspace-card-title">{ws.name}</h3>
                <span className={roleBadgeClass(ws.current_user_role)}>{ws.current_user_role}</span>
              </div>
              <p className="workspace-card-desc">{ws.description || 'No description'}</p>
              <div className="workspace-card-footer">
                <span className="text-muted text-sm">Created {new Date(ws.created_at).toLocaleDateString()}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Workspaces;
