import { useState, useEffect } from 'react';
import { Routes, Route, useParams, useNavigate, useLocation, Navigate } from 'react-router-dom';
import { projectService, type Project } from '../services/projectService';
import ProjectOverview from './ProjectOverview';
import TaskList from './TaskList';
import KanbanBoard from './KanbanBoard';
import { ProjectCalendar } from './ProjectCalendar';
import { DocumentLibrary } from './DocumentLibrary';
import DocumentChat from './DocumentChat';
import { MeetingsDashboard } from './MeetingsDashboard';
import {
  ArrowLeft,
  LayoutDashboard,
  CheckSquare,
  Kanban,
  Calendar,
  Video,
  FileText,
  MessageSquare,
  FolderKanban,
} from 'lucide-react';
import { useBreadcrumbs } from '../context/BreadcrumbContext';
import { workspaceService } from '../services/workspaceService';
import { ThinkingLoader } from '../components/ThinkingLoader';

const ProjectDashboard = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { setBreadcrumbs, cacheWorkspaceName, cacheProjectName } = useBreadcrumbs();
  const [project, setProject] = useState<Project | null>(null);
  const [workspaceName, setWorkspaceName] = useState<string>('Workspace');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await projectService.get(projectId!);
        setProject(res.data);
        cacheProjectName(res.data.id, res.data.name);

        const wsRes = await workspaceService.get(res.data.workspace_id).catch(() => null);
        const wsName = wsRes?.data?.name || 'Workspace';
        setWorkspaceName(wsName);
        cacheWorkspaceName(res.data.workspace_id, wsName);
      } catch (err: any) {
        setError(err.response?.data?.detail?.error?.message || 'Project not found');
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  useEffect(() => {
    if (!project) return;
    const tabSuffix = location.pathname.replace(`/projects/${projectId}`, '');
    let tabLabel = '';
    if (tabSuffix.startsWith('/tasks')) tabLabel = 'Tasks';
    else if (tabSuffix.startsWith('/kanban')) tabLabel = 'Kanban';
    else if (tabSuffix.startsWith('/calendar')) tabLabel = 'Calendar';
    else if (tabSuffix.startsWith('/meetings')) tabLabel = 'Meetings';
    else if (tabSuffix.startsWith('/documents')) tabLabel = 'Documents';
    else if (tabSuffix.startsWith('/chat')) tabLabel = 'Document Chat';

    setBreadcrumbs([
      { label: 'Workspaces', path: '/workspaces' },
      { label: workspaceName, path: `/workspaces/${project.workspace_id}` },
      { label: project.name, path: `/projects/${project.id}` },
      ...(tabLabel ? [{ label: tabLabel }] : []),
    ]);
  }, [project, location.pathname, workspaceName]);

  if (loading) return (
    <ThinkingLoader
      state="working"
      size={64}
      message="Loading project workspace..."
      description="Synchronizing tasks, board, and project documents"
    />
  );
  
  if (error || !project) return (
    <div className="empty-tab-panel" style={{ minHeight: '50vh', margin: '2rem auto', maxWidth: 500 }}>
      <div className="error-message">{error || 'Project not found'}</div>
      <button className="btn btn-secondary" style={{ marginTop: '1rem' }} onClick={() => navigate('/workspaces')}>
        <ArrowLeft size={16} /> Back to Workspaces
      </button>
    </div>
  );

  const tabs = [
    { label: 'Overview', path: '', icon: LayoutDashboard },
    { label: 'Tasks', path: '/tasks', icon: CheckSquare },
    { label: 'Kanban', path: '/kanban', icon: Kanban },
    { label: 'Calendar', path: '/calendar', icon: Calendar },
    { label: 'Meetings', path: '/meetings', icon: Video },
    { label: 'Documents', path: '/documents', icon: FileText },
    { label: 'Document Chat', path: '/chat', icon: MessageSquare },
  ];

  const currentPath = location.pathname.replace(`/projects/${projectId}`, '') || '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Modern Project Hero Banner */}
      <div className="page-hero-banner" style={{ marginBottom: '1.25rem' }}>
        <div className="page-hero-info">
          <div className="page-hero-icon">
            <FolderKanban size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="badge badge-primary">Project Space</span>
              <h1 className="page-hero-title" style={{ margin: 0 }}>{project.name}</h1>
            </div>
            <p className="page-hero-subtitle">{project.description || 'Collaborative workspace for tasks, documents, and meetings.'}</p>
          </div>
        </div>

        <div className="page-hero-actions">
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/workspaces/${project.workspace_id}/projects`)}
          >
            <ArrowLeft size={15} /> Back to Projects
          </button>
        </div>
      </div>

      {/* Modern Pill Tab Bar */}
      <div
        className="meetings-filter-tabs"
        style={{
          marginBottom: '1.5rem',
          overflowX: 'auto',
          maxWidth: '100%',
          flexShrink: 0,
        }}
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = currentPath === t.path;
          return (
            <button
              key={t.label}
              className={`filter-tab-pill ${isActive ? 'active' : ''}`}
              onClick={() => navigate(`/projects/${projectId}${t.path}`)}
            >
              <Icon size={14} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Routes Container */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <Routes>
          <Route path="/" element={<ProjectOverview project={project} />} />
          <Route path="/tasks" element={<TaskList project={project} />} />
          <Route path="/kanban" element={<KanbanBoard project={project} />} />
          <Route path="/calendar" element={<ProjectCalendar project={project} />} />
          <Route path="/meetings" element={<MeetingsDashboard projectId={projectId} />} />
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
