import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService } from '../services/workspaceService';

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
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: 500 }}>
        <h1 className="auth-title">Create Workspace</h1>
        <p className="auth-subtitle">Set up a new team workspace</p>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="ws-name">Workspace Name</label>
            <input className="form-input" id="ws-name" type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="My Team" />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="ws-desc">Description (optional)</label>
            <textarea className="form-input" id="ws-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="What is this workspace for?" rows={3} style={{ resize: 'vertical' }} />
          </div>
          <button type="submit" className="btn-primary" disabled={isLoading}>
            {isLoading ? 'Creating...' : 'Create Workspace'}
          </button>
        </form>
        <div className="auth-links">
          <a href="#" onClick={e => { e.preventDefault(); navigate('/workspaces'); }}>← Back to Workspaces</a>
        </div>
      </div>
    </div>
  );
};

export default CreateWorkspace;
