import { useState, useEffect } from 'react';
import { Routes, Route, useParams, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { projectService, type Project } from '../services/projectService';
import ProjectOverview from './ProjectOverview';
import TaskList from './TaskList';
import KanbanBoard from './KanbanBoard';
import ProjectCalendar from './ProjectCalendar';
import DocumentLibrary from './DocumentLibrary';
import DocumentChat from './DocumentChat';
import { ArrowLeft } from 'lucide-react';

const ProjectDashboard = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await projectService.get(projectId!);
        setProject(res.data);
      } catch (err: any) {
        setError(err.response?.data?.detail?.error?.message || 'Project not found');
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading project...</p>
    </div>
  );
  
  if (error || !project) return (
    <div className="flex flex-col items-center justify-center pt-12 gap-4">
      <div className="error-message">{error || 'Project not found'}</div>
      <button className="btn btn-secondary" onClick={() => navigate('/workspaces')}>
        <ArrowLeft size={16} /> Back to Workspaces
      </button>
    </div>
  );

  const tabs = [
    { label: 'Overview', path: '' },
    { label: 'List', path: '/tasks' },
    { label: 'Kanban', path: '/kanban' },
    { label: 'Calendar', path: '/calendar' },
    { label: 'Documents', path: '/documents' },
    { label: 'Document Chat', path: '/chat' }
  ];

  const currentPath = location.pathname.replace(`/projects/${projectId}`, '') || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <button className="btn btn-ghost mb-3" onClick={() => navigate(`/workspaces/${project.workspace_id}/projects`)}>
        <ArrowLeft size={16} /> Back to Projects
      </button>
      
      <div className="page-header mb-0">
        <div>
          <h1 className="page-title">{project.name}</h1>
          <p className="page-subtitle text-base">{project.description || 'No description provided'}</p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-subtle mb-4 pt-3">
        {tabs.map(t => (
          <button 
            key={t.label}
            className={`btn btn-ghost ${currentPath === t.path ? 'text-primary' : 'text-muted'}`}
            style={{ 
              borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
              borderBottom: currentPath === t.path ? '2px solid var(--accent-primary)' : '2px solid transparent',
              paddingBottom: '0.75rem',
            }}
            onClick={() => navigate(`/projects/${projectId}${t.path}`)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<ProjectOverview project={project} />} />
          <Route path="/tasks" element={<TaskList project={project} />} />
          <Route path="/kanban" element={<KanbanBoard project={project} />} />
          <Route path="/calendar" element={<ProjectCalendar project={project} />} />
          <Route path="/documents" element={<DocumentLibrary project={project} />} />
          <Route path="/chat" element={<DocumentChat project={project} />} />
          <Route path="/chat/:conversationId" element={<DocumentChat project={project} />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </div>
    </div>
  );
};

export default ProjectDashboard;
