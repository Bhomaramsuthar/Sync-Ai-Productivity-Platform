import { useNavigate } from 'react-router-dom';
import { type Project } from '../services/projectService';
import { ProjectInsights } from '../components/ProjectInsights';
import { ProjectActivityFeed } from '../components/ProjectActivityFeed';
import { ProjectAISummary } from '../components/ProjectAISummary';

const ProjectOverview = ({ project }: { project: Project }) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-6" style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">About this project</h2>
        </div>
        <div className="card-body">
          <p className="text-muted leading-relaxed">{project.description || 'No description provided.'}</p>
        </div>
      </div>

      {/* Week 12: AI Project Summary & Productivity Insights */}
      <ProjectAISummary
        projectId={project.id}
        onNavigateToTasks={() => navigate(`/projects/${project.id}/tasks`)}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <ProjectInsights projectId={project.id} />
        </div>
        <div>
          <ProjectActivityFeed projectId={project.id} />
        </div>
      </div>
    </div>
  );
};

export default ProjectOverview;

