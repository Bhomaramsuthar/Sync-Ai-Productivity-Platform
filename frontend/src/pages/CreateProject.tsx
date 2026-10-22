import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectService } from '../services/projectService';
import { ArrowLeft, FolderKanban } from 'lucide-react';

const CreateProject = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const res = await projectService.create(workspaceId!, { name, description });
      navigate(`/projects/${res.data.id}`);
    } catch (err: any) {
      setError(err.response?.data?.detail?.error?.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <button
          className="btn btn-ghost"
          style={{ marginBottom: '1rem' }}
          onClick={() => navigate(`/workspaces/${workspaceId}/projects`)}
        >
          <ArrowLeft size={16} />
          Back to Projects
        </button>

        <div className="card" style={{ padding: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 12, background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
              <FolderKanban size={22} />
            </div>
            <div>
              <h1 className="card-title" style={{ fontSize: '1.45rem', margin: 0 }}>Create Project</h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '4px 0 0 0' }}>Add a new project to your workspace</p>
            </div>
          </div>
          
          {error && <div className="error-message" style={{ marginBottom: '1.25rem' }}>{error}</div>}
          
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Project Name</label>
              <input className="form-input" required value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Mobile App Redesign" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Description (Optional)</label>
              <textarea className="form-input" value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ resize: 'vertical' }} placeholder="What are the goals of this project?" />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '6px', padding: '0.75rem' }} disabled={loading}>
              {loading ? 'Creating Project...' : 'Create Project'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateProject;
