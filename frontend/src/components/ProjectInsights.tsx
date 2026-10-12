import React, { useEffect, useState } from 'react';
import { projectService, type ProjectInsights as InsightsType } from '../services/projectService';
import './ProjectInsights.css';

interface Props {
  projectId: string;
}

export const ProjectInsights: React.FC<Props> = ({ projectId }) => {
  const [insights, setInsights] = useState<InsightsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchInsights = async () => {
      try {
        const response = await projectService.getInsights(projectId);
        setInsights(response.data);
      } catch (err: any) {
        setError(err.response?.data?.error?.message || 'Failed to load insights');
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
  }, [projectId]);

  if (loading) return <div className="insights-loading">Loading insights...</div>;
  if (error) return <div className="insights-error">{error}</div>;
  if (!insights) return null;

  const isCompleted = insights.completion_percentage === 100 && insights.total_tasks > 0;
  const inProgress = insights.completion_percentage > 0 && !isCompleted;

  return (
    <div className="project-insights-container">
      <h3>Project Insights</h3>
      <div className="insights-grid">
        <div className="insight-card">
          <div className="insight-value">{insights.total_tasks}</div>
          <div className="insight-label">Total Tasks</div>
        </div>
        <div className={`insight-card ${insights.completed_tasks > 0 ? 'completed' : ''}`}>
          <div className="insight-value">{insights.completed_tasks}</div>
          <div className="insight-label">Completed</div>
        </div>
        <div className="insight-card">
          <div className="insight-value">{insights.todo_tasks + insights.in_progress_tasks}</div>
          <div className="insight-label">Active</div>
        </div>
        <div className={`insight-card ${insights.overdue_tasks > 0 ? 'overdue' : ''}`}>
          <div className="insight-value">{insights.overdue_tasks}</div>
          <div className="insight-label">Overdue</div>
        </div>
      </div>
      <div className="progress-section">
        <div className="progress-header">
          <span>Completion</span>
          <span className={`completion-percentage ${isCompleted ? 'completed' : ''}`}>
            {insights.completion_percentage}%
          </span>
        </div>
        <div className="progress-bar-bg">
          <div 
            className={`progress-bar-fill ${isCompleted ? 'completed' : inProgress ? 'in-progress' : ''}`} 
            style={{ width: `${insights.completion_percentage}%` }}
          ></div>
        </div>
      </div>
    </div>
  );
};
