import React, { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Edit3,
  Calendar,
  CheckSquare,
  Clock,
  User,
  Quote,
  Sparkles,
  Save,
} from 'lucide-react';
import { SelectBox } from './ui/select';
import type { MeetingSuggestedItem, SuggestionApproveRequest } from '../services/meetingService';

interface SuggestionCardProps {
  suggestion: MeetingSuggestedItem;
  workspaceMembers?: Array<{ id: string; name: string; email: string }>;
  projects?: Array<{ id: string; name: string }>;
  onApprove: (id: string, overrides?: SuggestionApproveRequest) => Promise<void>;
  onReject: (id: string) => Promise<void>;
  onEdit: (id: string, updated: Partial<MeetingSuggestedItem>) => Promise<void>;
}

export const SuggestionCard: React.FC<SuggestionCardProps> = ({
  suggestion,
  workspaceMembers = [],
  projects = [],
  onApprove,
  onReject,
  onEdit,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [loading, setLoading] = useState(false);

  // Edit form state
  const [title, setTitle] = useState(suggestion.title);
  const [description, setDescription] = useState(suggestion.description || '');
  const [assigneeId, setAssigneeId] = useState(suggestion.suggested_assignee_id || '');
  const [dueDate, setDueDate] = useState(suggestion.suggested_due_date ? suggestion.suggested_due_date.substring(0, 10) : '');
  const [priority, setPriority] = useState(suggestion.suggested_priority || 'MEDIUM');
  const [targetProjectId, setTargetProjectId] = useState(projects[0]?.id || '');

  const isApproved = suggestion.status === 'APPROVED';
  const isRejected = suggestion.status === 'REJECTED';
  const isTask = suggestion.item_type === 'TASK';

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onApprove(suggestion.id, {
        target_project_id: targetProjectId || undefined,
        title,
        description,
        assignee_id: assigneeId || undefined,
        due_date: dueDate ? new Date(dueDate).toISOString() : undefined,
        priority,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    try {
      await onReject(suggestion.id);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdit = async () => {
    setLoading(true);
    try {
      await onEdit(suggestion.id, {
        title,
        description,
        suggested_assignee_id: assigneeId || null,
        suggested_due_date: dueDate ? new Date(dueDate).toISOString() : null,
        suggested_priority: priority,
      });
      setIsEditing(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      id={`suggestion-card-${suggestion.id}`}
      className={`suggestion-card-box ${isApproved ? 'approved' : ''} ${isRejected ? 'rejected' : ''}`}
    >
      {/* Top badges */}
      <div className="suggestion-top-row">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isTask ? (
            <span className="suggestion-type-chip task">
              <CheckSquare size={13} />
              Project Task
            </span>
          ) : (
            <span className="suggestion-type-chip event">
              <Calendar size={13} />
              Calendar Event
            </span>
          )}

          {suggestion.is_explicit_commitment ? (
            <span className="suggestion-commitment-pill">
              <Sparkles size={11} />
              Explicit Commitment
            </span>
          ) : (
            <span style={{ fontSize: '0.68rem', color: '#71717a', padding: '2px 7px', background: 'rgba(255, 255, 255, 0.04)', borderRadius: '20px' }}>
              Identified Suggestion
            </span>
          )}
        </div>

        {/* Status indicator */}
        <div>
          {isApproved && (
            <span className="suggestion-status-pill approved">
              <CheckCircle2 size={13} />
              Approved
            </span>
          )}
          {isRejected && (
            <span className="suggestion-status-pill rejected">
              <XCircle size={13} />
              Dismissed
            </span>
          )}
          {!isApproved && !isRejected && (
            <span className="suggestion-status-pill pending">
              Pending Review
            </span>
          )}
        </div>
      </div>

      {/* Main Content */}
      {isEditing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="field-input"
            placeholder="Title"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="field-textarea"
            placeholder="Description..."
          />
          <div style={{ display: 'grid', gridTemplateColumns: isTask ? '1fr 1fr 1fr' : '1fr', gap: '8px' }}>
            {isTask && (
              <div>
                <label className="field-label">Assignee</label>
                <SelectBox
                  size="sm"
                  value={assigneeId}
                  onValueChange={setAssigneeId}
                  placeholder="Unassigned"
                  options={[
                    { value: '', label: 'Unassigned' },
                    ...workspaceMembers.map((m) => ({
                      value: m.id,
                      label: m.name || m.email,
                    })),
                  ]}
                />
              </div>
            )}
            <div>
              <label className="field-label">{isTask ? 'Due Date' : 'Event Date'}</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="field-input"
              />
            </div>
            {isTask && (
              <div>
                <label className="field-label">Priority</label>
                <SelectBox
                  size="sm"
                  value={priority}
                  onValueChange={setPriority}
                  options={[
                    { value: 'LOW', label: 'Low' },
                    { value: 'MEDIUM', label: 'Medium' },
                    { value: 'HIGH', label: 'High' },
                    { value: 'URGENT', label: 'Urgent' },
                  ]}
                />
              </div>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' }}>
            <button
              onClick={() => setIsEditing(false)}
              className="btn-reject-item"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={loading}
              className="btn-approve-item"
            >
              <Save size={13} />
              Save Edits
            </button>
          </div>
        </div>
      ) : (
        <div>
          <h4 className="suggestion-title">{suggestion.title}</h4>
          {suggestion.description && (
            <p className="suggestion-description">{suggestion.description}</p>
          )}

          {/* Details row */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '14px', marginTop: '10px', fontSize: '0.75rem', color: '#a1a1aa' }}>
            {isTask && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <User size={13} color="#71717a" />
                <span>{suggestion.suggested_assignee_name || 'Unassigned'}</span>
              </div>
            )}

            {(suggestion.suggested_due_date || suggestion.suggested_start_time) && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Clock size={13} color="#71717a" />
                <span>
                  {new Date(
                    suggestion.suggested_due_date || suggestion.suggested_start_time!
                  ).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}

            {suggestion.suggested_priority && isTask && (
              <span
                style={{
                  padding: '2px 7px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  borderRadius: '5px',
                  background: suggestion.suggested_priority === 'URGENT' || suggestion.suggested_priority === 'HIGH' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.08)',
                  color: suggestion.suggested_priority === 'URGENT' || suggestion.suggested_priority === 'HIGH' ? '#fca5a5' : '#d4d4d8',
                }}
              >
                {suggestion.suggested_priority}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Evidence Quote Accordion */}
      {suggestion.evidence_text && (
        <div>
          <button
            onClick={() => setShowEvidence(!showEvidence)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.75rem',
              color: '#818cf8',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Quote size={13} />
            {showEvidence ? 'Hide Transcript Context' : 'View Verified Transcript Context'}
          </button>
          {showEvidence && (
            <div className="suggestion-evidence-box">
              "{suggestion.evidence_text}"
            </div>
          )}
        </div>
      )}

      {/* Target Project Selector for tasks when approving if needed */}
      {!isApproved && !isRejected && !isEditing && isTask && projects.length > 1 && (
        <div style={{ margin: '4px 0' }}>
          <label className="field-label" style={{ marginBottom: '4px', display: 'block' }}>Target Project to Create Task in:</label>
          <SelectBox
            size="sm"
            value={targetProjectId}
            onValueChange={setTargetProjectId}
            options={projects.map((p) => ({
              value: p.id,
              label: p.name,
            }))}
          />
        </div>
      )}

      {/* Actions */}
      {!isApproved && !isRejected && !isEditing && (
        <div className="suggestion-actions-row">
          <button
            onClick={() => setIsEditing(true)}
            id={`edit-suggestion-btn-${suggestion.id}`}
            className="btn-edit-item"
            style={{ marginRight: 'auto' }}
          >
            <Edit3 size={13} />
            Customize
          </button>

          <button
            onClick={handleReject}
            disabled={loading}
            id={`reject-suggestion-btn-${suggestion.id}`}
            className="btn-reject-item"
          >
            Dismiss
          </button>
          <button
            onClick={handleApprove}
            disabled={loading}
            id={`approve-suggestion-btn-${suggestion.id}`}
            className="btn-approve-item"
          >
            <CheckCircle2 size={14} />
            Approve & Save
          </button>
        </div>
      )}

      {/* Approved link badge */}
      {isApproved && (
        <div style={{ paddingTop: '8px', fontSize: '0.75rem', color: '#34d399', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(16, 185, 129, 0.2)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>✓ {isTask ? 'Saved to Project Tasks' : 'Scheduled in Workspace Calendar'}</span>
            {isTask && targetProjectId && (
              <a
                href={`/projects/${targetProjectId}`}
                style={{ color: '#818cf8', textDecoration: 'underline', fontWeight: 600, fontSize: '0.72rem' }}
              >
                View in Kanban →
              </a>
            )}
            {!isTask && (
              <a
                href="/calendar"
                style={{ color: '#818cf8', textDecoration: 'underline', fontWeight: 600, fontSize: '0.72rem' }}
              >
                View in Calendar →
              </a>
            )}
          </div>
          <span style={{ fontSize: '0.7rem', color: '#71717a' }}>
            {suggestion.approved_at && new Date(suggestion.approved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  );
};
