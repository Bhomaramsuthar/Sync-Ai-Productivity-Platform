import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectService } from '../services/projectService';
import { ArrowLeft } from 'lucide-react';

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
    <div className="flex flex-col items-center justify-center pt-8">
      <div className="w-full" style={{ maxWidth: 500 }}>
        <button className="btn btn-ghost mb-4" onClick={() => navigate(`/workspaces/${workspaceId}/projects`)}>
          <ArrowLeft size={16} />
          Back to Projects
        </button>

        <div className="card p-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold mb-2">Create Project</h1>
            <p className="text-muted">Add a new project to your workspace</p>
          </div>
          
          {error && <div className="error-message">{error}</div>}
          
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Project Name</label>
              <input className="form-input" required value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Description (Optional)</label>
              <textarea className="form-input" value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ resize: 'vertical' }} />
            </div>
            <button type="submit" className="btn btn-primary w-full mt-4" disabled={loading}>
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateProject;
