import { useState, useEffect } from 'react';
import { type Project } from '../services/projectService';
import { taskService, type Task } from '../services/taskService';
import { memberService, type Member } from '../services/workspaceService';
import { Plus, Search, Edit2, Trash2, Eye } from 'lucide-react';
import { TaskDetailModal } from '../components/TaskDetailModal';

const TaskList = ({ project }: { project: Project }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Create/Edit form state
  const [showForm, setShowForm] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [formData, setFormData] = useState({ title: '', description: '', priority: 'MEDIUM', status: 'TODO', assignee_id: '', due_date: '' });

  // Detail Modal state
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');

  const loadTasks = async () => {
    try {
      const res = await taskService.list(project.id, {
        status: filterStatus || undefined,
        priority: filterPriority || undefined,
        search: search || undefined
      });
      setTasks(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    memberService.list(project.workspace_id).then(res => setMembers(res.data)).catch(console.error);
  }, [project.workspace_id]);

  useEffect(() => {
    loadTasks().finally(() => setLoading(false));
  }, [project.id, filterStatus, filterPriority, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const data = { 
        ...formData, 
        assignee_id: formData.assignee_id || null,
        due_date: formData.due_date ? new Date(formData.due_date).toISOString() : null
      };
      if (editTask) {
        await taskService.update(editTask.id, data);
      } else {
        await taskService.create(project.id, data);
      }
      setShowForm(false);
      loadTasks();
    } catch (err: any) {
      alert(err.response?.data?.detail?.error?.message || 'Failed to save task');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await taskService.delete(id);
      loadTasks();
      if (detailTask?.id === id) setDetailTask(null);
    } catch (err: any) {
      alert(err.response?.data?.detail?.error?.message || 'Failed to delete task');
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: string) => {
    try {
      setTasks(tasks.map(t => t.id === taskId ? { ...t, status: newStatus as any } : t));
      if (detailTask && detailTask.id === taskId) {
        setDetailTask({ ...detailTask, status: newStatus as any });
      }
      await taskService.update(taskId, { status: newStatus });
    } catch (err) {
      loadTasks();
    }
  };

  const openEdit = (task: Task) => {
    setEditTask(task);
    setFormData({
      title: task.title,
      description: task.description || '',
      priority: task.priority,
      status: task.status,
      assignee_id: task.assignee_id || '',
      due_date: task.due_date ? new Date(task.due_date).toISOString().split('T')[0] : ''
    });
    setShowForm(true);
  };

  const openCreate = () => {
    setEditTask(null);
    setFormData({ title: '', description: '', priority: 'MEDIUM', status: 'TODO', assignee_id: '', due_date: '' });
    setShowForm(true);
  };

  return (
    <div>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={16} />
            <input 
              className="form-input" 
              style={{ paddingLeft: '2.5rem' }}
              placeholder="Search tasks..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
          <select className="form-select w-36" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="TODO">TODO</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="IN_REVIEW">In Review</option>
            <option value="DONE">Done</option>
          </select>
          <select className="form-select w-36" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
            <option value="">All Priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
        <button className="btn btn-primary whitespace-nowrap" onClick={openCreate}>
          <Plus size={16} /> New Task
        </button>
      </div>

      {showForm && (
        <div className="card mb-6">
          <div className="card-header bg-surface-hover">
            <h3 className="card-title">{editTask ? 'Edit Task' : 'Create Task'}</h3>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="form-group">
                <label className="form-label">Title</label>
                <input className="form-input" required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>
              <div className="form-group">
                <label className="form-label">Description</label>
                <textarea className="form-input" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} style={{ resize: 'vertical' }} />
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="form-group flex-1">
                  <label className="form-label">Status</label>
                  <select className="form-select" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                    <option value="TODO">TODO</option>
                    <option value="IN_PROGRESS">IN PROGRESS</option>
                    <option value="IN_REVIEW">IN REVIEW</option>
                    <option value="DONE">DONE</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Priority</label>
                  <select className="form-select" value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value})}>
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                    <option value="URGENT">URGENT</option>
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Assignee</label>
                  <select className="form-select" value={formData.assignee_id} onChange={e => setFormData({...formData, assignee_id: e.target.value})}>
                    <option value="">Unassigned</option>
                    {members.map(m => (
                      <option key={m.user_id} value={m.user_id}>{m.user_name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Due Date</label>
                  <input type="date" className="form-input" value={formData.due_date} onChange={e => setFormData({...formData, due_date: e.target.value})} />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-2 border-t border-subtle pt-4">
                <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Task</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 text-muted gap-4">
          <div className="spinner"></div>
          <p>Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty-state">
          <h3 className="empty-state-title">No tasks found</h3>
          <p className="text-muted">Adjust your filters or create a new task.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ minWidth: '240px' }}>Title & Description</th>
                <th>Status</th>
                <th>Priority</th>
                <th>Assignee</th>
                <th>Due Date</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map(task => (
                <tr key={task.id}>
                  <td>
                    <div 
                      className="font-medium text-primary hover:text-accent-primary cursor-pointer transition-colors"
                      onClick={() => setDetailTask(task)}
                      title="Click to view details"
                    >
                      {task.title}
                    </div>
                    {task.description && task.description.trim() ? (
                      <div 
                        className="task-desc-preview line-clamp-2 cursor-pointer mt-1"
                        onClick={() => setDetailTask(task)}
                        title={task.description}
                      >
                        {task.description}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <span className={`badge ${task.status === 'DONE' ? 'badge-success' : task.status === 'IN_PROGRESS' ? 'badge-info' : 'badge-neutral'}`}>
                      {task.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${task.priority === 'HIGH' || task.priority === 'URGENT' ? 'badge-danger' : task.priority === 'LOW' ? 'badge-neutral' : 'badge-warning'}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td>
                    {task.assignee_id ? (
                      <div className="flex items-center gap-2 text-sm">
                        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-surface-active text-xs font-medium">
                          {members.find(m => m.user_id === task.assignee_id)?.user_name.charAt(0).toUpperCase() || '?'}
                        </div>
                        <span>{members.find(m => m.user_id === task.assignee_id)?.user_name || 'Unknown'}</span>
                      </div>
                    ) : (
                      <span className="text-muted text-sm">Unassigned</span>
                    )}
                  </td>
                  <td>
                    {task.due_date ? (
                      <span className="text-sm">
                        {new Date(task.due_date).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                      </span>
                    ) : (
                      <span className="text-muted text-sm">-</span>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-2">
                      <button className="btn-icon btn-ghost" onClick={() => setDetailTask(task)} title="View Details">
                        <Eye size={16} />
                      </button>
                      <button className="btn-icon btn-ghost" onClick={() => openEdit(task)} title="Edit">
                        <Edit2 size={16} />
                      </button>
                      <button className="btn-icon btn-ghost text-danger hover:bg-danger/10" onClick={() => handleDelete(task.id)} title="Delete">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Task Detail View Modal */}
      <TaskDetailModal 
        task={detailTask} 
        onClose={() => setDetailTask(null)} 
        members={members} 
        onEdit={openEdit}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
};

export default TaskList;
