import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { workspaceService, type Workspace } from '../services/workspaceService';
import {
  Sparkles,
  Briefcase,
  Video,
  ArrowRight,
  Plus,
  Clock,
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    workspaceService
      .list()
      .then((res) => setWorkspaces(res.data))
      .catch((err) => console.error('Dashboard workspaces load error:', err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1360, margin: '0 auto', width: '100%' }}>
      {/* Hero Banner */}
      <div className="page-hero-banner">
        <div className="page-hero-info">
          <div className="page-hero-icon">
            <Sparkles size={24} />
          </div>
          <div>
            <h1 className="page-hero-title">Welcome back, {user?.name || 'Teammate'}</h1>
            <p className="page-hero-subtitle">
              Your AI-driven collaboration workspace. Organize tasks, host LiveKit meetings, and transcribe action items with Groq Whisper.
            </p>
          </div>
        </div>

        <div className="page-hero-actions">
          <button
            onClick={() => navigate('/workspaces/new')}
            className="btn btn-primary"
            id="dashboard-new-workspace-btn"
          >
            <Plus size={16} />
            <span>New Workspace</span>
          </button>
        </div>
      </div>

      {/* Stats Cards Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Workspaces
            </span>
            <div style={{ padding: 6, borderRadius: 8, background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
              <Briefcase size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>
            {loading ? '...' : workspaces.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem' }}>
            Active collaboration spaces
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              Video Meetings
            </span>
            <div style={{ padding: 6, borderRadius: 8, background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
              <Video size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>
            LiveKit + Groq Whisper
          </div>
          <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem' }}>
            Real-time audio transcription
          </div>
        </div>

        <div className="card" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
              AI Intelligence
            </span>
            <div style={{ padding: 6, borderRadius: 8, background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
              <Sparkles size={16} />
            </div>
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#ffffff' }}>
            Nova-2 + LLM
          </div>
          <div style={{ fontSize: '0.75rem', color: '#71717a', marginTop: '0.25rem' }}>
            Automated task extraction
          </div>
        </div>
      </div>

      {/* Workspaces Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
              Your Workspaces
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: 0 }}>
              Select a workspace to manage projects, tasks, and team video meetings
            </p>
          </div>

          <button
            onClick={() => navigate('/workspaces')}
            className="btn btn-secondary"
            style={{ fontSize: '0.75rem', padding: '0.45rem 0.85rem' }}
          >
            <span>View All</span>
            <ArrowRight size={13} />
          </button>
        </div>

        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="card" style={{ height: 160, padding: '1.25rem' }} />
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <Briefcase size={24} />
            </div>
            <h3 className="empty-state-title">No workspaces found</h3>
            <p className="text-muted" style={{ maxWidth: 400, fontSize: '0.8125rem' }}>
              Create your first team workspace to start managing projects, organizing tasks, and launching AI video meetings.
            </p>
            <button
              onClick={() => navigate('/workspaces/new')}
              className="btn btn-primary"
              style={{ marginTop: '0.5rem' }}
            >
              <Plus size={16} />
              Create First Workspace
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                onClick={() => navigate(`/workspaces/${ws.id}`)}
                className="card"
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
              >
                <div style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: '#818cf8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Briefcase size={16} />
                      </div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                        {ws.name}
                      </h3>
                    </div>

                    <span
                      className={`badge ${
                        ws.current_user_role === 'OWNER'
                          ? 'badge-primary'
                          : ws.current_user_role === 'ADMIN'
                          ? 'badge-warning'
                          : 'badge-neutral'
                      }`}
                    >
                      {ws.current_user_role}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: '0.8125rem',
                      color: 'var(--text-secondary)',
                      lineHeight: 1.45,
                      margin: 0,
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
                    padding: '0.75rem 1.25rem',
                    borderTop: '1px solid var(--border-subtle)',
                    background: 'rgba(0, 0, 0, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.75rem',
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Clock size={12} />
                    {new Date(ws.created_at).toLocaleDateString()}
                  </span>
                  <span style={{ color: '#818cf8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    Enter &rarr;
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
