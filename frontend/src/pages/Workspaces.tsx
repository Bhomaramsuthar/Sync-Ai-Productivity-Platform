import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService, type Workspace } from '../services/workspaceService';
import { Briefcase, Plus, Search, X } from 'lucide-react';
import { extractErrorMessage } from '../services/api';
import { WorkspaceCard } from '../components/WorkspaceCard';
import { KineticTextReveal } from '../components/ui/KineticTextReveal';

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
            <KineticTextReveal text="Team Workspaces" as="h1" className="page-hero-title" splitBy="words" direction="up" distance={18} stagger={0.05} blur />
            <p className="page-hero-subtitle">
              Collaborate across organization workspaces, project roadmaps, team members, and integrated video meetings.
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

      {/* Toolbar: Search & Statistics */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '100%' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
          <input
            type="text"
            placeholder="Search workspaces by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: 38, height: 40 }}
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
              aria-label="Clear search"
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
        <div className="workspace-grid">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="card"
              style={{
                minHeight: 400,
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: 'linear-gradient(180deg, rgba(22, 27, 40, 0.6) 0%, rgba(15, 18, 28, 0.7) 100%)',
              }}
            >
              <div>
                <div style={{ display: 'flex', gap: '0.85rem', marginBottom: '1.25rem' }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255, 255, 255, 0.05)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ width: '60%', height: 18, borderRadius: 6, background: 'rgba(255, 255, 255, 0.07)', marginBottom: 8 }} />
                    <div style={{ width: '40%', height: 12, borderRadius: 4, background: 'rgba(255, 255, 255, 0.04)' }} />
                  </div>
                </div>
                <div style={{ width: '100%', height: 14, borderRadius: 4, background: 'rgba(255, 255, 255, 0.04)', marginBottom: 6 }} />
                <div style={{ width: '75%', height: 14, borderRadius: 4, background: 'rgba(255, 255, 255, 0.04)' }} />
              </div>

              <div style={{ height: 40, borderRadius: 10, background: 'rgba(255, 255, 255, 0.04)' }} />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Briefcase size={26} />
          </div>
          <KineticTextReveal text={searchQuery ? `No workspaces matching "${searchQuery}"` : 'No workspaces found'} as="h3" className="empty-state-title" splitBy="words" direction="up" distance={14} stagger={0.04} />
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
        /* Workspace Cards Grid with 3D Flip */
        <div className="workspace-grid">
          {filtered.map((ws) => (
            <WorkspaceCard
              key={ws.id}
              workspace={ws}
              onRefresh={loadWorkspaces}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default Workspaces;
