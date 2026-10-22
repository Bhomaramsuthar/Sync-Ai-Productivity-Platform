import React, { useState } from 'react';
import {
  productivityService,
  type ProposedSubtask,
  type TaskUnblockResponse,
  type TaskPrioritySuggestionResponse,
} from '../services/productivityService';
import { taskService } from '../services/taskService';
import {
  Sparkles,
  X,
  ListTree,
  AlertCircle,
  CheckCircle2,
  Flag,
  Plus,
} from 'lucide-react';
import { ThinkingLoader } from './ThinkingLoader';

interface Props {
  projectId: string;
  initialTitle?: string;
  initialDescription?: string;
  initialDueDate?: string | null;
  taskId?: string;
  isOpen: boolean;
  onClose: () => void;
  onApplyPriority?: (priority: string) => void;
  onTasksCreated?: () => void;
}

type TabMode = 'breakdown' | 'unblock' | 'priority';

export const AITaskAssistantModal: React.FC<Props> = ({
  projectId,
  initialTitle = '',
  initialDescription = '',
  initialDueDate = null,
  taskId,
  isOpen,
  onClose,
  onApplyPriority,
  onTasksCreated,
}) => {
  const [activeTab, setActiveTab] = useState<TabMode>('breakdown');
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [blocker, setBlocker] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Breakdown state
  const [subtasks, setSubtasks] = useState<{ checked: boolean; data: ProposedSubtask }[]>([]);
  const [creatingTasks, setCreatingTasks] = useState(false);

  // Unblock state
  const [unblockResult, setUnblockResult] = useState<TaskUnblockResponse | null>(null);

  // Priority state
  const [priorityResult, setPriorityResult] = useState<TaskPrioritySuggestionResponse | null>(null);

  if (!isOpen) return null;

  const handleGenerateBreakdown = async () => {
    if (!title.trim()) {
      setError('Please provide a task title to break down.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await productivityService.breakdownTask(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setSubtasks(res.data.subtasks.map((st) => ({ checked: true, data: st })));
    } catch (err: any) {
      const msg = err.response?.data?.detail?.error?.message || 'Failed to generate subtasks';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSelectedSubtasks = async () => {
    const selected = subtasks.filter((s) => s.checked);
    if (selected.length === 0) {
      setError('Please select at least one subtask to create.');
      return;
    }

    setCreatingTasks(true);
    setError(null);
    try {
      for (const item of selected) {
        await taskService.create(projectId, {
          title: item.data.title,
          description: item.data.description,
          priority: item.data.priority,
          status: 'TODO',
        });
      }
      if (onTasksCreated) {
        onTasksCreated();
      }
      onClose();
    } catch (err: any) {
      const msg = err.response?.data?.detail?.error?.message || 'Failed to create confirmed subtasks';
      setError(msg);
    } finally {
      setCreatingTasks(false);
    }
  };

  const handleSuggestPriority = async () => {
    if (!title.trim()) {
      setError('Please provide a task title to evaluate priority.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await productivityService.suggestPriority(projectId, {
        title: title.trim(),
        description: description.trim() || undefined,
        due_date: initialDueDate || undefined,
      });
      setPriorityResult(res.data);
    } catch (err: any) {
      const msg = err.response?.data?.detail?.error?.message || 'Failed to suggest priority';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async () => {
    if (!title.trim() || !blocker.trim()) {
      setError('Please provide both the task title and the specific blocker.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await productivityService.unblockTask(projectId, {
        task_id: taskId,
        title: title.trim(),
        description: description.trim() || undefined,
        blocker: blocker.trim(),
      });
      setUnblockResult(res.data);
    } catch (err: any) {
      const msg = err.response?.data?.detail?.error?.message || 'Failed to analyze blocker';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const toggleSubtaskCheck = (index: number) => {
    setSubtasks((prev) =>
      prev.map((item, i) => (i === index ? { ...item, checked: !item.checked } : item))
    );
  };

  const updateSubtaskTitle = (index: number, newTitle: string) => {
    setSubtasks((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, data: { ...item.data, title: newTitle } } : item
      )
    );
  };

  const updateSubtaskPriority = (index: number, newPrio: string) => {
    setSubtasks((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, data: { ...item.data, priority: newPrio } } : item
      )
    );
  };

  const checkedCount = subtasks.filter((s) => s.checked).length;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-accent-primary-alpha text-primary">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-primary">AI Task Assistant</h3>
              <p className="text-xs text-muted">Generate breakdown proposals and unblocking guidance</p>
            </div>
          </div>
          <button className="btn-icon btn-ghost text-muted hover:text-primary" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex gap-2 border-b border-subtle px-6 pt-2">
          <button
            className={`btn btn-ghost text-xs ${activeTab === 'breakdown' ? 'text-primary' : 'text-muted'}`}
            style={{
              borderBottom: activeTab === 'breakdown' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              borderRadius: 0,
            }}
            onClick={() => {
              setActiveTab('breakdown');
              setError(null);
            }}
          >
            <ListTree size={14} className="mr-1.5" /> Break Down Subtasks
          </button>
          <button
            className={`btn btn-ghost text-xs ${activeTab === 'unblock' ? 'text-primary' : 'text-muted'}`}
            style={{
              borderBottom: activeTab === 'unblock' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              borderRadius: 0,
            }}
            onClick={() => {
              setActiveTab('unblock');
              setError(null);
            }}
          >
            <AlertCircle size={14} className="mr-1.5" /> Unblock & Next Actions
          </button>
          <button
            className={`btn btn-ghost text-xs ${activeTab === 'priority' ? 'text-primary' : 'text-muted'}`}
            style={{
              borderBottom: activeTab === 'priority' ? '2px solid var(--accent-primary)' : '2px solid transparent',
              borderRadius: 0,
            }}
            onClick={() => {
              setActiveTab('priority');
              setError(null);
            }}
          >
            <Flag size={14} className="mr-1.5" /> Suggest Priority
          </button>
        </div>

        <div className="modal-body flex-1 overflow-y-auto px-6 py-4 flex flex-col gap-4">
          {error && (
            <div className="p-3 rounded-md bg-status-danger-bg border border-status-danger text-xs text-primary flex items-start gap-2">
              <AlertCircle size={16} className="text-status-danger shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {/* Context inputs */}
          <div className="flex flex-col gap-3 p-3 rounded-lg bg-surface border border-subtle">
            <div>
              <label className="text-xs font-medium text-muted mb-1 block">Task Title</label>
              <input
                className="form-input text-xs"
                placeholder="e.g., Implement OAuth2 Google Login"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            {activeTab !== 'priority' && (
              <div>
                <label className="text-xs font-medium text-muted mb-1 block">Task Description (Optional)</label>
                <textarea
                  className="form-textarea text-xs"
                  rows={2}
                  placeholder="Additional scope or requirements context..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* TAB 1: BREAKDOWN */}
          {activeTab === 'breakdown' && (
            <div className="flex flex-col gap-3">
              {subtasks.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-subtle rounded-lg flex flex-col items-center gap-2">
                  <ListTree size={28} className="text-muted" />
                  <p className="text-sm text-primary font-medium">Decompose Task into Actionable Subtasks</p>
                  <p className="text-xs text-muted max-w-md">
                    AI will suggest 3-5 structured subtasks with suggested priorities. You can review, edit, and select which ones to create.
                  </p>
                  <button
                    className="btn btn-primary text-xs mt-2"
                    onClick={handleGenerateBreakdown}
                    disabled={loading || !title.trim()}
                  >
                    {loading ? (
                      <ThinkingLoader state="solving" size={20} inline message="Generating Subtasks..." />
                    ) : (
                      <>
                        <Sparkles size={14} className="mr-1.5" /> Generate Proposed Subtasks
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>
                      Review and select proposed subtasks (<strong>{checkedCount}</strong> selected):
                    </span>
                    <button
                      className="btn btn-ghost text-xs py-1 px-2"
                      onClick={handleGenerateBreakdown}
                      disabled={loading}
                    >
                      Regenerate
                    </button>
                  </div>

                  <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                    {subtasks.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border text-xs transition-colors flex items-start gap-3 ${
                          item.checked
                            ? 'bg-surface-hover border-accent-primary-alpha'
                            : 'bg-base border-subtle opacity-60'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={item.checked}
                          onChange={() => toggleSubtaskCheck(idx)}
                        />
                        <div className="flex-1 flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <input
                              className="form-input text-xs py-1 font-medium text-primary flex-1 bg-transparent border-subtle"
                              value={item.data.title}
                              onChange={(e) => updateSubtaskTitle(idx, e.target.value)}
                            />
                            <select
                              className="form-select text-xs py-0.5 px-2 w-28 bg-surface"
                              value={item.data.priority}
                              onChange={(e) => updateSubtaskPriority(idx, e.target.value)}
                            >
                              <option value="LOW">LOW</option>
                              <option value="MEDIUM">MEDIUM</option>
                              <option value="HIGH">HIGH</option>
                              <option value="URGENT">URGENT</option>
                            </select>
                          </div>
                          <p className="text-muted leading-relaxed">{item.data.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-subtle">
                    <button className="btn btn-secondary text-xs" onClick={() => setSubtasks([])}>
                      Clear
                    </button>
                    <button
                      className="btn btn-primary text-xs"
                      onClick={handleCreateSelectedSubtasks}
                      disabled={creatingTasks || checkedCount === 0}
                    >
                      {creatingTasks ? (
                        <>
                          <div className="spinner mr-1.5" style={{ width: 12, height: 12 }}></div> Creating Tasks...
                        </>
                      ) : (
                        <>
                          <Plus size={14} className="mr-1.5" /> Confirm & Create {checkedCount} Tasks
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: UNBLOCK */}
          {activeTab === 'unblock' && (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-primary mb-1 block">
                  What is currently blocking this task? <span className="text-status-danger">*</span>
                </label>
                <textarea
                  className="form-textarea text-xs"
                  rows={2}
                  placeholder="e.g. Third-party API rate limit exceeded / Waiting on security review of JWT schema..."
                  value={blocker}
                  onChange={(e) => setBlocker(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary text-xs self-start"
                onClick={handleUnblock}
                disabled={loading || !blocker.trim()}
              >
                {loading ? (
                  <ThinkingLoader state="solving" size={20} inline message="Analyzing Blocker..." />
                ) : (
                  <>
                    <Sparkles size={14} className="mr-1.5" /> Suggest Next Action & Unblock
                  </>
                )}
              </button>

              {unblockResult && (
                <div className="mt-2 p-4 rounded-lg bg-surface border border-accent-primary-alpha flex flex-col gap-3">
                  <div>
                    <span className="badge badge-primary text-xs mb-1.5 inline-block">Immediate Next Action</span>
                    <h4 className="text-sm font-semibold text-primary">{unblockResult.next_action}</h4>
                  </div>

                  <div>
                    <h5 className="text-xs font-medium text-muted uppercase tracking-wider mb-1.5">
                      Recommended Unblocking Steps
                    </h5>
                    <ul className="flex flex-col gap-1.5 text-xs text-primary">
                      {unblockResult.unblocking_steps.map((step, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <CheckCircle2 size={14} className="text-accent-primary shrink-0 mt-0.5" />
                          <span>{step}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="text-xs text-muted pt-2 border-t border-subtle">
                    <strong>Rationale:</strong> {unblockResult.rationale}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PRIORITY */}
          {activeTab === 'priority' && (
            <div className="flex flex-col gap-3">
              <p className="text-xs text-muted">
                Evaluates task title, deadline, and project context to suggest an objective priority level with transparent reasoning.
              </p>

              <button
                className="btn btn-primary text-xs self-start"
                onClick={handleSuggestPriority}
                disabled={loading || !title.trim()}
              >
                {loading ? (
                  <ThinkingLoader state="solving" size={20} inline message="Evaluating Priority..." />
                ) : (
                  <>
                    <Sparkles size={14} className="mr-1.5" /> Analyze & Suggest Priority
                  </>
                )}
              </button>

              {priorityResult && (
                <div className="mt-2 p-4 rounded-lg bg-surface border border-subtle flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted">Suggested Priority:</span>
                    <span
                      className={`badge ${
                        priorityResult.suggested_priority === 'URGENT' || priorityResult.suggested_priority === 'HIGH'
                          ? 'badge-danger'
                          : priorityResult.suggested_priority === 'LOW'
                          ? 'badge-neutral'
                          : 'badge-warning'
                      }`}
                    >
                      {priorityResult.suggested_priority}
                    </span>
                  </div>

                  <div className="text-xs text-primary">
                    <strong className="text-muted block mb-1">Reasoning:</strong>
                    {priorityResult.reasoning}
                  </div>

                  {onApplyPriority && (
                    <button
                      className="btn btn-secondary text-xs self-start mt-1"
                      onClick={() => {
                        onApplyPriority(priorityResult.suggested_priority);
                        onClose();
                      }}
                    >
                      Apply Priority to Task
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="modal-footer px-6 py-3 border-t border-subtle flex justify-end">
          <button className="btn btn-ghost text-xs" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
