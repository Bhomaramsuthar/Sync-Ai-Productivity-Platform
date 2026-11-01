import { useState, useEffect } from 'react';
import { type Project } from '../services/projectService';
import { taskService, type Task } from '../services/taskService';
import { memberService, type Member } from '../services/workspaceService';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { AITaskAssistantModal } from '../components/AITaskAssistantModal';
import { SelectBox } from '../components/ui/select';

import { Clock } from 'lucide-react';
import { toast } from '../utils/toast';
import { useWorkspaceRealtime } from '../utils/useWorkspaceRealtime';

const KanbanBoard = ({ project }: { project: Project }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiTask, setAiTask] = useState<Task | null>(null);
  const [mobileFilterCol, setMobileFilterCol] = useState<'ALL' | string>('ALL');

  const loadTasks = async () => {
    try {
      const res = await taskService.list(project.id);
      setTasks(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    memberService.list(project.workspace_id).then(res => setMembers(res.data)).catch(console.error);
    loadTasks().finally(() => setLoading(false));
  }, [project.id]);

  // Real-time synchronization for Kanban board
  useWorkspaceRealtime(project.workspace_id, {
    'task:created': (payload) => {
      if (payload?.project_id === project.id) {
        setTasks(prev => {
          if (prev.some(t => t.id === payload.id)) return prev;
          return [...prev, payload];
        });
      }
    },
    'task:updated': (payload) => {
      if (payload?.project_id === project.id) {
        setTasks(prev => {
          const exists = prev.some(t => t.id === payload.id);
          if (exists) {
            return prev.map(t => t.id === payload.id ? { ...t, ...payload } : t);
          }
          return [...prev, payload];
        });
        setSelectedTask(prev => (prev && prev.id === payload.id ? { ...prev, ...payload } : prev));
      }
    },
    'task:deleted': (payload) => {
      if (payload?.project_id === project.id || tasks.some(t => t.id === payload?.id)) {
        setTasks(prev => prev.filter(t => t.id !== payload.id));
        setSelectedTask(prev => (prev && prev.id === payload.id ? null : prev));
      }
    },
    onReconnect: () => {
      loadTasks();
    }
  });

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      // Optimistic update
      setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus as any } : t));
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask({ ...selectedTask, status: newStatus as any });
      }
      await taskService.update(taskId, { status: newStatus });
      toast.info('Status Updated', `Task moved to ${newStatus.replace('_', ' ')}`);
    } catch (err) {
      toast.error('Status Update Failed', 'Failed to update task status.');
      loadTasks(); // rollback
    }
  };

  if (loading) return (
    <div className="empty-tab-panel" style={{ minHeight: '50vh', border: 'none', background: 'transparent' }}>
      <div className="spinner"></div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading board...</p>
    </div>
  );

  const columnConfig = [
    { key: 'TODO', label: 'To Do', color: '#94a3b8' },
    { key: 'IN_PROGRESS', label: 'In Progress', color: '#6366f1' },
    { key: 'IN_REVIEW', label: 'In Review', color: '#a855f7' },
    { key: 'DONE', label: 'Done', color: '#10b981' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', width: '100%' }}>
      {/* Mobile Column Quick Switcher */}
      <div className="segmented-pills-track kanban-mobile-filter" style={{ alignSelf: 'flex-start' }}>
        <button
          className={`segmented-pill-item ${mobileFilterCol === 'ALL' ? 'active' : ''}`}
          onClick={() => setMobileFilterCol('ALL')}
          type="button"
        >
          All ({tasks.length})
        </button>
        {columnConfig.map((col) => {
          const count = tasks.filter((t) => t.status === col.key).length;
          return (
            <button
              key={col.key}
              className={`segmented-pill-item ${mobileFilterCol === col.key ? 'active' : ''}`}
              onClick={() => setMobileFilterCol(col.key)}
              type="button"
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: col.color, display: 'inline-block' }} />
              <span>{col.label} ({count})</span>
            </button>
          );
        })}
      </div>

      <div className="kanban-board">
        {columnConfig
          .filter((col) => mobileFilterCol === 'ALL' || mobileFilterCol === col.key)
          .map((col) => {
        const colTasks = tasks.filter(t => t.status === col.key);
        return (
          <div key={col.key} className="kanban-column">
            <div className="kanban-column-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, display: 'inline-block' }} />
                <span>{col.label}</span>
              </div>
              <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>{colTasks.length}</span>
            </div>
            <div className="kanban-column-content">
              {colTasks.map(task => (
                <div 
                  key={task.id} 
                  className="kanban-task"
                  onClick={() => setSelectedTask(task)}
                  style={{ cursor: 'pointer' }}
                  title="Click to view task details"
                >
                  <div className="kanban-task-title">{task.title}</div>

                  {/* Task Description Preview */}
                  {task.description && task.description.trim() ? (
                    <p className="task-desc-preview line-clamp-2 mt-1 mb-2" style={{ color: 'var(--text-secondary)', fontSize: '0.785rem' }} title={task.description}>
                      {task.description}
                    </p>
                  ) : null}

                  <div className="kanban-task-meta">
                    <span className={`badge ${task.priority === 'HIGH' || task.priority === 'URGENT' ? 'badge-danger' : task.priority === 'LOW' ? 'badge-neutral' : 'badge-primary'}`}>
                      {task.priority}
                    </span>
                    {task.due_date && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: 'auto', marginRight: '8px' }}>
                        <Clock size={11} />
                        {new Date(task.due_date).toLocaleDateString(undefined, { timeZone: 'UTC', month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {task.assignee_id && (
                      <div title={members.find(m => m.user_id === task.assignee_id)?.user_name} className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-active text-xs font-medium text-primary border border-subtle">
                        {members.find(m => m.user_id === task.assignee_id)?.user_name.charAt(0).toUpperCase() || '?'}
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-subtle" onClick={e => e.stopPropagation()}>
                    <SelectBox
                      size="sm"
                      value={task.status}
                      onValueChange={val => handleStatusChange(task.id, val)}
                      options={columnConfig.map(c => ({
                        value: c.key,
                        label: `Move to ${c.label}`,
                      }))}
                    />
                  </div>
                </div>
              ))}
              {colTasks.length === 0 && (
                <div style={{ padding: '2rem 1rem', textAlign: 'center', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', margin: 0 }}>No tasks in {col.label.toLowerCase()}</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
      </div>

      {/* Task Detail Modal */}
      <TaskDetailModal 
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        members={members}
        onStatusChange={handleStatusChange}
        onOpenAIAssistant={(t) => {
          setAiTask(t);
          setShowAIAssistant(true);
        }}
      />

      {/* AI Task Assistant Modal */}
      <AITaskAssistantModal
        projectId={project.id}
        initialTitle={aiTask?.title || ''}
        initialDescription={aiTask?.description || ''}
        initialDueDate={aiTask?.due_date}
        taskId={aiTask?.id}
        isOpen={showAIAssistant}
        onClose={() => {
          setShowAIAssistant(false);
          setAiTask(null);
        }}
        onTasksCreated={() => loadTasks()}
      />
    </div>
  );
};

export default KanbanBoard;
