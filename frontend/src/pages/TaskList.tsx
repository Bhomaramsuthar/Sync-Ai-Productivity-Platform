import { useState, useEffect, useCallback } from 'react';
import { type Project } from '../services/projectService';
import { taskService, type Task } from '../services/taskService';
import { memberService, type Member } from '../services/workspaceService';
import { Plus, Search, Edit2, Trash2, Eye, Sparkles, ListTree } from 'lucide-react';
import { TaskDetailModal } from '../components/TaskDetailModal';
import { AITaskAssistantModal } from '../components/AITaskAssistantModal';
import { SelectBox } from '../components/ui/select';
import { productivityService } from '../services/productivityService';
import { toast } from '../utils/toast';

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

  // AI Assistant state
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [aiAssistantInitialTitle, setAiAssistantInitialTitle] = useState('');
  const [aiAssistantInitialDesc, setAiAssistantInitialDesc] = useState('');
  const [expandingDescription, setExpandingDescription] = useState(false);
  const [suggestingPriority, setSuggestingPriority] = useState(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  
  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [search, setSearch] = useState('');

  const loadTasks = useCallback(async () => {
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
  }, [project.id, filterStatus, filterPriority, search]);

  useEffect(() => {
    memberService.list(project.workspace_id).then(res => setMembers(res.data)).catch(console.error);
  }, [project.workspace_id]);

  useEffect(() => {
    loadTasks().finally(() => setLoading(false));
  }, [loadTasks]);

  const handleAutoDraftDescription = async () => {
    if (!formData.title.trim()) {
      toast.warning('Title Required', 'Please enter a task title first so AI can draft the description.');
      return;
    }
    setExpandingDescription(true);
    setAiNotice(null);
    try {
      const res = await productivityService.expandTask(project.id, {
        title: formData.title.trim(),
        context: formData.description.trim() || undefined,
      });
      const data = res.data;
      let text = data.description;
      if (data.acceptance_criteria && data.acceptance_criteria.length > 0) {
        text += '\n\nAcceptance Criteria:\n' + data.acceptance_criteria.map(c => `- [ ] ${c}`).join('\n');
      }
      setFormData(prev => ({
        ...prev,
        description: text,
        priority: data.suggested_priority || prev.priority,
      }));
      setAiNotice('✨ AI drafted description & acceptance criteria! You can review or edit before saving.');
      toast.success('Description Drafted', 'AI successfully generated task description and acceptance criteria.');
    } catch (err: any) {
      if (err.response?.status === 503) {
        toast.error('AI Unavailable', 'AI Provider is not configured in backend/.env. Please configure LLM_API_KEY or GROQ_API_KEY.');
      } else {
        toast.error('Draft Failed', err.response?.data?.detail?.error?.message || 'Failed to auto-draft description.');
      }
    } finally {
      setExpandingDescription(false);
    }
  };

  const handleSuggestPriority = async () => {
    if (!formData.title.trim()) {
      toast.warning('Title Required', 'Please enter a task title first.');
      return;
    }
    setSuggestingPriority(true);
    try {
      const res = await productivityService.suggestPriority(project.id, {
        title: formData.title.trim(),
        description: formData.description.trim() || undefined,
        due_date: formData.due_date || undefined,
      });
      setFormData(prev => ({ ...prev, priority: res.data.suggested_priority }));
      setAiNotice(`🎯 Priority set to ${res.data.suggested_priority}: ${res.data.reasoning}`);
      toast.success(`Priority: ${res.data.suggested_priority}`, res.data.reasoning);
    } catch (err: any) {
      toast.error('Suggestion Failed', err.response?.data?.detail?.error?.message || 'Failed to suggest priority.');
    } finally {
      setSuggestingPriority(false);
    }
  };

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
        toast.success('Task Updated', 'Task details saved successfully.');
      } else {
        await taskService.create(project.id, data);
        toast.success('Task Created', 'New task added to project.');
      }
      setShowForm(false);
      loadTasks();
    } catch (err: any) {
      toast.error('Save Failed', err.response?.data?.detail?.error?.message || 'Failed to save task');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this task?')) return;
    try {
      await taskService.delete(id);
      toast.success('Task Deleted', 'Task was removed.');
      loadTasks();
      if (detailTask?.id === id) setDetailTask(null);
    } catch (err: any) {
      toast.error('Delete Failed', err.response?.data?.detail?.error?.message || 'Failed to delete task');
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
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', minWidth: '240px', flex: '1 1 240px' }}>
            <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input 
              className="form-input" 
              style={{ paddingLeft: '2.25rem' }}
              placeholder="Search tasks..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
          <SelectBox
            value={filterStatus}
            onValueChange={setFilterStatus}
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'TODO', label: 'To Do' },
              { value: 'IN_PROGRESS', label: 'In Progress' },
              { value: 'IN_REVIEW', label: 'In Review' },
              { value: 'DONE', label: 'Done' },
            ]}
            placeholder="All Statuses"
            style={{ width: 'auto', minWidth: '135px' }}
          />
          <SelectBox
            value={filterPriority}
            onValueChange={setFilterPriority}
            options={[
              { value: '', label: 'All Priorities' },
              { value: 'LOW', label: 'Low' },
              { value: 'MEDIUM', label: 'Medium' },
              { value: 'HIGH', label: 'High' },
              { value: 'URGENT', label: 'Urgent' },
            ]}
            placeholder="All Priorities"
            style={{ width: 'auto', minWidth: '135px' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setAiAssistantInitialTitle('');
              setAiAssistantInitialDesc('');
              setShowAIAssistant(true);
            }}
            title="Break down tasks or get unblocking guidance"
          >
            <Sparkles size={15} style={{ color: 'var(--accent-primary)' }} /> AI Assistant
          </button>
          <button className="btn btn-primary" onClick={openCreate}>
            <Plus size={15} /> New Task
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card mb-6">
          <div className="card-header bg-surface-hover flex items-center justify-between">
            <h3 className="card-title">{editTask ? 'Edit Task' : 'Create Task'}</h3>
            <button
              type="button"
              className="btn btn-ghost text-xs py-1 px-2 text-accent-primary hover:bg-accent-primary-alpha"
              onClick={() => {
                setAiAssistantInitialTitle(formData.title);
                setAiAssistantInitialDesc(formData.description);
                setShowAIAssistant(true);
              }}
              title="Open full AI assistant"
            >
              <Sparkles size={13} className="mr-1" /> AI Assistant Tools
            </button>
          </div>
          <div className="card-body">
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  className="form-input"
                  required
                  placeholder="e.g., Build PostgreSQL user authentication"
                  value={formData.title}
                  onChange={e => setFormData({...formData, title: e.target.value})}
                />
              </div>

              <div className="form-group">
                <div className="flex items-center justify-between mb-1">
                  <label className="form-label mb-0">Description</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost text-xs py-0.5 px-2 text-accent-primary hover:bg-accent-primary-alpha"
                      onClick={handleAutoDraftDescription}
                      disabled={expandingDescription || !formData.title.trim()}
                      title="Generate structured description and acceptance criteria from title"
                    >
                      {expandingDescription ? (
                        <>
                          <div className="spinner mr-1" style={{ width: 11, height: 11 }}></div> Drafting...
                        </>
                      ) : (
                        <>
                          <Sparkles size={12} className="mr-1" /> Auto-Draft Description & Criteria
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost text-xs py-0.5 px-2 text-muted hover:text-primary"
                      onClick={() => {
                        setAiAssistantInitialTitle(formData.title);
                        setAiAssistantInitialDesc(formData.description);
                        setShowAIAssistant(true);
                      }}
                      title="Decompose task into smaller subtasks"
                    >
                      <ListTree size={12} className="mr-1" /> Break Down Subtasks
                    </button>
                  </div>
                </div>
                <textarea
                  className="form-input"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  rows={4}
                  placeholder="Add details, context, or click 'Auto-Draft' above..."
                  style={{ resize: 'vertical' }}
                />
                {aiNotice && (
                  <div className="p-2 rounded bg-surface border border-accent-primary-alpha text-xs text-primary mt-1.5 flex items-center justify-between">
                    <span>{aiNotice}</span>
                    <button
                      type="button"
                      className="text-muted hover:text-primary ml-2 font-bold"
                      onClick={() => setAiNotice(null)}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="form-group flex-1">
                  <label className="form-label">Status</label>
                  <SelectBox
                    value={formData.status}
                    onValueChange={val => setFormData({...formData, status: val})}
                    options={[
                      { value: 'TODO', label: 'TODO' },
                      { value: 'IN_PROGRESS', label: 'IN PROGRESS' },
                      { value: 'IN_REVIEW', label: 'IN REVIEW' },
                      { value: 'DONE', label: 'DONE' },
                    ]}
                  />
                </div>
                <div className="form-group flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <label className="form-label mb-0">Priority</label>
                    <button
                      type="button"
                      className="btn btn-ghost text-xs py-0 px-1 text-accent-primary hover:underline"
                      onClick={handleSuggestPriority}
                      disabled={suggestingPriority || !formData.title.trim()}
                      title="Ask AI to recommend priority"
                    >
                      {suggestingPriority ? 'Evaluating...' : '✨ Suggest'}
                    </button>
                  </div>
                  <SelectBox
                    value={formData.priority}
                    onValueChange={val => setFormData({...formData, priority: val})}
                    options={[
                      { value: 'LOW', label: 'LOW' },
                      { value: 'MEDIUM', label: 'MEDIUM' },
                      { value: 'HIGH', label: 'HIGH' },
                      { value: 'URGENT', label: 'URGENT' },
                    ]}
                  />
                </div>
                <div className="form-group flex-1">
                  <label className="form-label">Assignee</label>
                  <SelectBox
                    value={formData.assignee_id}
                    onValueChange={val => setFormData({...formData, assignee_id: val})}
                    options={[
                      { value: '', label: 'Unassigned' },
                      ...members.map(m => ({ value: m.user_id, label: m.user_name }))
                    ]}
                    placeholder="Unassigned"
                  />
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
        <div className="empty-tab-panel" style={{ minHeight: '40vh', border: 'none', background: 'transparent' }}>
          <div className="spinner"></div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>Loading tasks...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="empty-tab-panel" style={{ minHeight: '35vh' }}>
          <h3 className="empty-tab-title">No tasks found</h3>
          <p className="empty-tab-subtitle">Adjust your search/filters or click "+ New Task" to create one.</p>
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
        onOpenAIAssistant={(t) => {
          setAiAssistantInitialTitle(t.title);
          setAiAssistantInitialDesc(t.description || '');
          setShowAIAssistant(true);
        }}
      />

      {/* AI Task Assistant Modal (Breakdown / Unblock / Priority) */}
      <AITaskAssistantModal
        projectId={project.id}
        initialTitle={aiAssistantInitialTitle}
        initialDescription={aiAssistantInitialDesc}
        isOpen={showAIAssistant}
        onClose={() => setShowAIAssistant(false)}
        onTasksCreated={() => loadTasks()}
        onApplyPriority={(prio) => {
          setFormData(prev => ({ ...prev, priority: prio }));
        }}
      />
    </div>
  );
};

export default TaskList;
