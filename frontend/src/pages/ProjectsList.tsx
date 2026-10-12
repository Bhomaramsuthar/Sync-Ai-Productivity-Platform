import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectService, type Project } from '../services/projectService';
import { workspaceService, type Workspace } from '../services/workspaceService';
import { LayoutGrid, Plus, ArrowLeft } from 'lucide-react';

const ProjectsList = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const [wsRes, projRes] = await Promise.all([
          workspaceService.get(workspaceId!),
          projectService.list(workspaceId!)
        ]);
        setWorkspace(wsRes.data);
        setProjects(projRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [workspaceId]);

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading projects...</p>
    </div>
  );

  return (
    <div>
      <button className="btn btn-ghost mb-4" onClick={() => navigate(`/workspaces/${workspaceId}`)}>
        <ArrowLeft size={16} />
        Back to Workspace
      </button>
      
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">{workspace?.name}</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate(`/workspaces/${workspaceId}/projects/new`)}>
          <Plus size={16} />
          New Project
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">
            <LayoutGrid size={24} />
          </div>
          <h3 className="empty-state-title">No projects found</h3>
          <p className="text-muted mb-6">Create a project to start organizing tasks.</p>
          <button className="btn btn-primary" onClick={() => navigate(`/workspaces/${workspaceId}/projects/new`)}>
            <Plus size={16} />
            New Project
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-6)' }}>
          {projects.map(p => (
            <div key={p.id} className="card" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column' }} onClick={() => navigate(`/projects/${p.id}`)}>
              <div className="card-header">
                <h3 className="card-title">{p.name}</h3>
              </div>
              <div className="card-body" style={{ flex: 1 }}>
                <p className="text-muted text-sm">{p.description || 'No description provided'}</p>
              </div>
              <div className="card-footer flex justify-between items-center">
                <span className={`badge badge-neutral`}>{p.status}</span>
                <span className="text-muted text-xs">{new Date(p.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProjectsList;
