import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { workspaceService } from '../services/workspaceService';
import type { Workspace } from '../services/workspaceService';
import { Briefcase, Plus } from 'lucide-react';

const Workspaces = () => {
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

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case 'OWNER': return 'badge badge-primary';
      case 'ADMIN': return 'badge badge-warning';
      default: return 'badge badge-neutral';
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading workspaces...</p>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Workspaces</h1>
          <p className="page-subtitle">Manage your team workspaces and access projects</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/workspaces/new')}>
          <Plus size={16} />
          Create Workspace
        </button>
      </div>

      {error && <div className="error-message">{error}</div>}

      {workspaces.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Briefcase size={24} />
          </div>
          <h3 className="empty-state-title">No workspaces yet</h3>
          <p className="text-muted mb-6">Create your first workspace to collaborate with your team.</p>
          <button className="btn btn-primary" onClick={() => navigate('/workspaces/new')}>
            <Plus size={16} />
            Create Workspace
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
          {workspaces.map(ws => (
            <Link to={`/workspaces/${ws.id}`} key={ws.id} className="card" style={{ display: 'flex', flexDirection: 'column', color: 'inherit' }}>
              <div className="card-header">
                <h3 className="card-title">{ws.name}</h3>
                <span className={roleBadgeClass(ws.current_user_role)}>{ws.current_user_role}</span>
              </div>
              <div className="card-body" style={{ flex: 1 }}>
                <p className="text-muted text-sm">{ws.description || 'No description provided.'}</p>
              </div>
              <div className="card-footer flex justify-between items-center">
                <span className="text-muted text-xs">Created {new Date(ws.created_at).toLocaleDateString()}</span>
                <span className="text-primary text-sm font-medium">View &rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

export default Workspaces;
