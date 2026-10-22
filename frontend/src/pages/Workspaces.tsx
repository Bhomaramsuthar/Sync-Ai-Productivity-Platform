import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService, type Workspace } from '../services/workspaceService';
import { Briefcase, Plus, Search, ArrowRight, Clock, X } from 'lucide-react';
import { extractErrorMessage } from '../services/api';

const Workspaces: React.FC = () => {
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadWorkspaces = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await workspaceService.list();
      setWorkspaces(res.data);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to load workspaces'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkspaces();
  }, []);

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case 'OWNER':
        return 'badge badge-primary';
      case 'ADMIN':
        return 'badge badge-warning';
      default:
        return 'badge badge-neutral';
    }
  };

  const filtered = workspaces.filter((ws) => {
    const q = searchQuery.toLowerCase();
    return ws.name.toLowerCase().includes(q) || (ws.description && ws.description.toLowerCase().includes(q));
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1360, margin: '0 auto', width: '100%' }}>
      {/* Hero Header Banner */}
      <div className="page-hero-banner">
        <div className="page-hero-info">
          <div className="page-hero-icon">
            <Briefcase size={24} />
          </div>
          <div>
            <h1 className="page-hero-title">Team Workspaces</h1>
            <p className="page-hero-subtitle">
              Manage organization workspaces, project roadmaps, team members, and integrated video meetings.
            </p>
          </div>
        </div>

        <div className="page-hero-actions">
          <button
            className="btn btn-primary"
            onClick={() => navigate('/workspaces/new')}
            id="create-workspace-btn"
          >
            <Plus size={16} />
            <span>Create Workspace</span>
          </button>
        </div>
      </div>

      {/* Toolbar: Search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', minWidth: 280 }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
          <input
            type="text"
            placeholder="Search workspaces..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: 38, height: 38 }}
            id="workspaces-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#71717a',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          Showing {filtered.length} of {workspaces.length} workspace{workspaces.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Loading Skeletons */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ height: 180, padding: '1.25rem' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Briefcase size={26} />
          </div>
          <h3 className="empty-state-title">
            {searchQuery ? `No workspaces matching "${searchQuery}"` : 'No workspaces found'}
          </h3>
          <p className="text-muted" style={{ maxWidth: 420, fontSize: '0.8125rem' }}>
            {searchQuery
              ? 'Try searching with a different name or clear the search filter.'
              : 'Create your first team workspace to start organizing projects, managing tasks, and hosting video meetings.'}
          </p>
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="btn btn-secondary">
              Clear Search
            </button>
          ) : (
            <button onClick={() => navigate('/workspaces/new')} className="btn btn-primary">
              <Plus size={16} />
              Create First Workspace
            </button>
          )}
        </div>
      ) : (
        /* Workspace Cards Grid */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.25rem' }}>
          {filtered.map((ws) => (
            <div
              key={ws.id}
              onClick={() => navigate(`/workspaces/${ws.id}`)}
              className="card"
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
              id={`workspace-card-${ws.id}`}
            >
              <div style={{ padding: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: 'rgba(99, 102, 241, 0.16)',
                        color: '#818cf8',
                        border: '1px solid rgba(99, 102, 241, 0.28)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Briefcase size={18} />
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                      {ws.name}
                    </h3>
                  </div>

                  <span className={roleBadgeClass(ws.current_user_role)}>
                    {ws.current_user_role}
                  </span>
                </div>

                <p
                  style={{
                    fontSize: '0.8125rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.5,
                    margin: '0 0 0.5rem 0',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {ws.description || 'No description provided.'}
                </p>
              </div>

              <div
                style={{
                  padding: '0.85rem 1.25rem',
                  borderTop: '1px solid var(--border-subtle)',
                  background: 'rgba(0, 0, 0, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <Clock size={12} />
                  Created {new Date(ws.created_at).toLocaleDateString()}
                </span>
                <span style={{ color: '#818cf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span>Open Workspace</span>
                  <ArrowRight size={13} />
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Workspaces;
