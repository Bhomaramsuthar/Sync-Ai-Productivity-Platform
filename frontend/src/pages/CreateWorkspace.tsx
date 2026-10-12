import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService } from '../services/workspaceService';
import { ArrowLeft } from 'lucide-react';

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
    <div className="flex flex-col items-center justify-center pt-8">
      <div className="w-full" style={{ maxWidth: 500 }}>
        <button className="btn btn-ghost mb-4" onClick={() => navigate('/workspaces')}>
          <ArrowLeft size={16} />
          Back to Workspaces
        </button>

        <div className="card p-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">Create Workspace</h1>
            <p className="text-muted">Set up a new team workspace</p>
          </div>

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
            <button type="submit" className="btn btn-primary w-full mt-4" disabled={isLoading}>
              {isLoading ? 'Creating...' : 'Create Workspace'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateWorkspace;
