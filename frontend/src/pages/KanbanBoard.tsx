import { useState, useEffect } from 'react';
import { type Project } from '../services/projectService';
import { taskService, type Task } from '../services/taskService';
import { memberService, type Member } from '../services/workspaceService';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { AITaskAssistantModal } from '../components/AITaskAssistantModal';

const KanbanBoard = ({ project }: { project: Project }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiTask, setAiTask] = useState<Task | null>(null);

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

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      // Optimistic update
      setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus as any } : t));
      if (selectedTask && selectedTask.id === taskId) {
        setSelectedTask({ ...selectedTask, status: newStatus as any });
      }
      await taskService.update(taskId, { status: newStatus });
    } catch (err) {
      alert('Failed to update status');
      loadTasks(); // rollback
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-12 gap-4 text-muted">
      <div className="spinner"></div>
      <p>Loading board...</p>
    </div>
  );

  const columns = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'];

  return (
    <div className="kanban-board">
      {columns.map(col => (
        <div key={col} className="kanban-column">
          <div className="kanban-column-header">
            <span>{col.replace('_', ' ')}</span>
            <span className="badge badge-neutral">{tasks.filter(t => t.status === col).length}</span>
          </div>
          <div className="kanban-column-content">
            {tasks.filter(t => t.status === col).map(task => (
              <div 
                key={task.id} 
                className="kanban-task hover:border-primary/60 transition-colors"
                onClick={() => setSelectedTask(task)}
                style={{ cursor: 'pointer' }}
                title="Click to view task details"
              >
                <div className="kanban-task-title">{task.title}</div>

                {/* Task Description Preview */}
                {task.description && task.description.trim() ? (
                  <p className="task-desc-preview line-clamp-2 mt-1 mb-2" title={task.description}>
                    {task.description}
                  </p>
                ) : null}

                <div className="kanban-task-meta">
                  <span className={`badge ${task.priority === 'HIGH' || task.priority === 'URGENT' ? 'badge-danger' : task.priority === 'LOW' ? 'badge-neutral' : 'badge-primary'}`}>
                    {task.priority}
                  </span>
                  {task.due_date && (
                    <span className="text-xs text-muted ml-auto mr-2">
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
                  <select 
                    className="form-select text-xs py-1" 
                    value={task.status} 
                    onChange={e => handleStatusChange(task.id, e.target.value)}
                  >
                    {columns.map(c => (
                      <option key={c} value={c}>Move to {c.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
            {tasks.filter(t => t.status === col).length === 0 && (
              <div className="empty-state py-8" style={{ border: '1px dashed var(--border-subtle)', background: 'transparent' }}>
                <p className="text-xs text-muted">No tasks</p>
              </div>
            )}
          </div>
        </div>
      ))}

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
