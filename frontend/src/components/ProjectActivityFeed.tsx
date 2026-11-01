import React, { useEffect, useState, useCallback } from 'react';
import { projectService, type ProjectActivity } from '../services/projectService';
import { useWorkspaceRealtime } from '../utils/useWorkspaceRealtime';
import './ProjectActivityFeed.css';

interface Props {
  projectId: string;
  workspaceId?: string;
}

export const ProjectActivityFeed: React.FC<Props> = ({ projectId, workspaceId }) => {
  const [activities, setActivities] = useState<ProjectActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchActivities = useCallback(async () => {
    try {
      const response = await projectService.getActivity(projectId);
      setActivities(response.data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Failed to load activity feed');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchActivities();
  }, [fetchActivities]);

  // Real-time synchronization for activities
  useWorkspaceRealtime(workspaceId || null, {
    'activity:created': (payload) => {
      if (payload?.project_id === projectId) {
        setActivities(prev => {
          if (prev.some(a => a.id === payload.id)) return prev;
          return [payload, ...prev];
        });
      }
    },
    onReconnect: () => {
      fetchActivities();
    }
  });

  const formatEvent = (activity: ProjectActivity) => {
    const meta = activity.event_metadata ? JSON.parse(activity.event_metadata) : {};
    
    switch (activity.event_type) {
      case 'PROJECT_CREATED':
        return <span>Project created.</span>;
      case 'TASK_CREATED':
        return <span>Created task <strong>{meta.title}</strong></span>;
      case 'TASK_STATUS_CHANGED':
        return <span>Changed status of <strong>{meta.title}</strong> from <span className="status-badge">{meta.old_status}</span> to <span className="status-badge">{meta.new_status}</span></span>;
      case 'TASK_ASSIGNED':
        return <span>Assigned task <strong>{meta.title}</strong> to a new user</span>;
      case 'TASK_COMPLETED':
        return <span>Completed task <strong>{meta.title}</strong></span>;
      case 'TASK_DELETED':
        return <span>Deleted task <strong>{meta.title}</strong></span>;
      default:
        return <span>{activity.event_type}</span>;
    }
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('default', { 
      month: 'short', day: 'numeric', hour: 'numeric', minute: 'numeric' 
    }).format(d);
  };

  if (loading) return <div className="activity-loading">Loading activity...</div>;
  if (error) return <div className="activity-error">{error}</div>;

  return (
    <div className="activity-feed-container">
      <h3>Recent Activity</h3>
      {activities.length === 0 ? (
        <div className="empty-activity">No activity yet.</div>
      ) : (
        <ul className="activity-list">
          {activities.map((activity) => (
            <li key={activity.id} className="activity-item">
              <div className="activity-icon"></div>
              <div className="activity-content">
                <div className="activity-text">{formatEvent(activity)}</div>
                <div className="activity-time">{formatDate(activity.created_at)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
