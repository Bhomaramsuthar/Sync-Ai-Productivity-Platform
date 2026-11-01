import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectService, type Project } from '../services/projectService';
import { workspaceService, type Workspace } from '../services/workspaceService';
import { FolderKanban, Plus, ArrowLeft, Search, Clock, ArrowRight, X } from 'lucide-react';
import { extractErrorMessage } from '../services/api';

import { useWorkspaceRealtime } from '../utils/useWorkspaceRealtime';

const ProjectsList: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const refreshProjects = () => {
    if (!workspaceId) return;
    projectService
      .list(workspaceId)
      .then((res) => setProjects(res.data))
      .catch(() => {});
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setError('');
        const [wsRes, projRes] = await Promise.all([
          workspaceService.get(workspaceId!),
          projectService.list(workspaceId!),
        ]);
        setWorkspace(wsRes.data);
        setProjects(projRes.data);
      } catch (err: any) {
        setError(extractErrorMessage(err, 'Failed to load projects'));
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [workspaceId]);

  useWorkspaceRealtime(workspaceId, {
    onEvent: (evt) => {
      if (!evt.event) return;
      if (evt.event.startsWith('project:')) {
        refreshProjects();
      }
    },
    onReconnect: () => {
      refreshProjects();
    },
  });

  const filtered = projects.filter((p) => {
    const q = searchQuery.toLowerCase();
    return p.name.toLowerCase().includes(q) || (p.description && p.description.toLowerCase().includes(q));
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1360, margin: '0 auto', width: '100%' }}>
      {/* Back button */}
      <div>
        <button
          className="btn btn-ghost"
          onClick={() => navigate(`/workspaces/${workspaceId}`)}
          style={{ paddingLeft: 0, color: 'var(--text-secondary)' }}
        >
          <ArrowLeft size={16} />
          <span>Back to Workspace</span>
        </button>
      </div>

      {/* Hero Header Banner */}
      <div className="page-hero-banner">
        <div className="page-hero-info">
          <div className="page-hero-icon">
            <FolderKanban size={24} />
          </div>
          <div>
            <h1 className="page-hero-title">Projects Roadmap</h1>
            <p className="page-hero-subtitle">
              {workspace ? `Projects inside ${workspace.name}` : 'Organize deliverables, kanban boards, and task execution.'}
            </p>
          </div>
        </div>

        <div className="page-hero-actions">
          <button
            className="btn btn-primary"
            onClick={() => navigate(`/workspaces/${workspaceId}/projects/new`)}
            id="create-project-btn"
          >
            <Plus size={16} />
            <span>New Project</span>
          </button>
        </div>
      </div>

      {/* Toolbar: Search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.85rem' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '100%' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#71717a' }} />
          <input
            type="text"
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="form-input"
            style={{ paddingLeft: 38, height: 40 }}
            id="projects-search-input"
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
          Showing {filtered.length} of {projects.length} project{projects.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && <div className="error-message">{error}</div>}

      {/* Loading Skeletons */}
      {loading ? (
        <div className="projects-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card" style={{ height: 180, padding: '1.25rem' }} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <FolderKanban size={26} />
          </div>
          <h3 className="empty-state-title">
            {searchQuery ? `No projects matching "${searchQuery}"` : 'No projects found'}
          </h3>
          <p className="text-muted" style={{ maxWidth: 420, fontSize: '0.8125rem' }}>
            {searchQuery
              ? 'Try searching with a different name or clear the search filter.'
              : 'Create your first project to start organizing tasks, tracking progress, and extracting action items.'}
          </p>
          {searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="btn btn-secondary">
              Clear Search
            </button>
          ) : (
            <button
              onClick={() => navigate(`/workspaces/${workspaceId}/projects/new`)}
              className="btn btn-primary"
            >
              <Plus size={16} />
              Create First Project
            </button>
          )}
        </div>
      ) : (
        /* Project Cards Grid */
        <div className="projects-grid">
          {filtered.map((p) => (
            <div
              key={p.id}
              onClick={() => navigate(`/projects/${p.id}`)}
              className="card"
              style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
              id={`project-card-${p.id}`}
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
                      <FolderKanban size={18} />
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                      {p.name}
                    </h3>
                  </div>

                  <span className="badge badge-primary">{p.status || 'ACTIVE'}</span>
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
                  {p.description || 'No description provided.'}
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
                  Created {new Date(p.created_at).toLocaleDateString()}
                </span>
                <span style={{ color: '#818cf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                  <span>Open Roadmap</span>
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

export default ProjectsList;
