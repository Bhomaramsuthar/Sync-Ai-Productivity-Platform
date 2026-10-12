import React from 'react';
import { type Task } from '../services/taskService';
import { type Member } from '../services/workspaceService';
import { X, Calendar, User, Flag, CheckCircle2, Clock, Edit2 } from 'lucide-react';

interface TaskDetailModalProps {
  task: Task | null;
  onClose: () => void;
  members: Member[];
  onEdit?: (task: Task) => void;
  onStatusChange?: (taskId: string, newStatus: string) => void;
}

export const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  task,
  onClose,
  members,
  onEdit,
  onStatusChange,
}) => {
  if (!task) return null;

  const assignee = members.find(m => m.user_id === task.assignee_id);

  const getPriorityBadgeClass = (priority: string) => {
    switch (priority) {
      case 'URGENT':
      case 'HIGH':
        return 'badge-danger';
      case 'LOW':
        return 'badge-neutral';
      default:
        return 'badge-warning';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'DONE':
        return 'badge-success';
      case 'IN_PROGRESS':
        return 'badge-info';
      default:
        return 'badge-neutral';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div 
        className="modal-content" 
        style={{ maxWidth: '640px' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="flex items-center gap-3 min-w-0 pr-4">
            <span className={`badge ${getStatusBadgeClass(task.status)}`}>
              {task.status.replace('_', ' ')}
            </span>
            <span className={`badge ${getPriorityBadgeClass(task.priority)} flex items-center gap-1`}>
              <Flag size={12} />
              {task.priority}
            </span>
          </div>
          <button 
            className="btn-icon btn-ghost text-muted hover:text-primary" 
            onClick={onClose} 
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body flex flex-col gap-5">
          <div>
            <h2 className="text-xl font-bold text-primary mb-2 leading-snug">
              {task.title}
            </h2>
          </div>

          {/* Properties Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-surface-hover rounded-lg border border-subtle text-xs">
            <div className="flex items-center gap-2 text-muted">
              <User size={15} className="shrink-0" />
              <span>Assignee:</span>
              <span className="font-medium text-primary ml-auto">
                {assignee?.user_name || 'Unassigned'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-muted">
              <Calendar size={15} className="shrink-0" />
              <span>Due Date:</span>
              <span className="font-medium text-primary ml-auto">
                {task.due_date 
                  ? new Date(task.due_date).toLocaleDateString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric' }) 
                  : 'None'}
              </span>
            </div>

            <div className="flex items-center gap-2 text-muted">
              <Clock size={15} className="shrink-0" />
              <span>Created:</span>
              <span className="font-medium text-primary ml-auto">
                {new Date(task.created_at).toLocaleDateString()}
              </span>
            </div>

            {onStatusChange && (
              <div className="flex items-center gap-2 text-muted">
                <CheckCircle2 size={15} className="shrink-0" />
                <span>Status:</span>
                <select 
                  className="form-select py-0.5 px-2 text-xs ml-auto"
                  style={{ width: 'auto' }}
                  value={task.status}
                  onChange={e => onStatusChange(task.id, e.target.value)}
                >
                  <option value="TODO">TODO</option>
                  <option value="IN_PROGRESS">IN PROGRESS</option>
                  <option value="IN_REVIEW">IN REVIEW</option>
                  <option value="DONE">DONE</option>
                </select>
              </div>
            )}
          </div>

          {/* Description Section */}
          <div className="flex flex-col gap-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
              Description
            </h4>
            {task.description && task.description.trim() ? (
              <div 
                className="p-4 rounded-lg bg-base border border-subtle text-sm text-primary leading-relaxed whitespace-pre-wrap select-text"
                style={{ minHeight: '80px', maxHeight: '350px', overflowY: 'auto' }}
              >
                {task.description}
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-base border border-dashed border-subtle text-sm text-muted italic">
                No description provided for this task.
              </div>
            )}
          </div>
        </div>

        <div className="modal-footer">
          {onEdit && (
            <button 
              className="btn btn-secondary text-sm" 
              onClick={() => {
                onClose();
                onEdit(task);
              }}
            >
              <Edit2 size={14} className="mr-1.5" /> Edit Task
            </button>
          )}
          <button className="btn btn-primary text-sm" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
