import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService } from '../services/workspaceService';
import { ArrowLeft, Briefcase } from 'lucide-react';

const CreateWorkspace = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Workspace name is required'); return; }
    setIsLoading(true);
    try {
      const res = await workspaceService.create({ name: name.trim(), description: description.trim() || undefined });
      navigate(`/workspaces/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail?.error?.message || 'Failed to create workspace');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <button
          className="btn btn-ghost"
          style={{ marginBottom: '1rem' }}
          onClick={() => navigate('/workspaces')}
        >
          <ArrowLeft size={16} />
          Back to Workspaces
        </button>

        <div className="card" style={{ padding: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
              <Briefcase size={22} />
            </div>
            <div>
              <h1 className="card-title" style={{ fontSize: '1.45rem', margin: 0 }}>Create Workspace</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>Set up a collaborative workspace for your team</p>
            </div>
          </div>

          {error && <div className="error-message" style={{ marginBottom: '1.25rem' }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="ws-name">Workspace Name</label>
              <input className="form-input" id="ws-name" type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g., Engineering Team" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="ws-desc">Description (optional)</label>
              <textarea className="form-input" id="ws-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this workspace for?" rows={3} style={{ resize: 'vertical' }} />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '6px', padding: '0.75rem' }} disabled={isLoading}>
              {isLoading ? 'Creating Workspace...' : 'Create Workspace'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateWorkspace;
