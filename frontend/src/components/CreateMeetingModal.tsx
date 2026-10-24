import React, { useState } from 'react';
import { X, Video, Calendar, ShieldCheck } from 'lucide-react';
import { meetingService, type Meeting } from '../services/meetingService';
import { extractErrorMessage } from '../services/api';
import { SelectBox } from './ui/select';
import { toast } from '../utils/toast';

interface CreateMeetingModalProps {
  workspaceId: string;
  defaultProjectId?: string;
  projects?: Array<{ id: string; name: string }>;
  isOpen: boolean;
  onClose: () => void;
  onMeetingCreated: (meeting: Meeting) => void;
}

export const CreateMeetingModal: React.FC<CreateMeetingModalProps> = ({
  workspaceId,
  defaultProjectId,
  projects = [],
  isOpen,
  onClose,
  onMeetingCreated,
}) => {
  const [mode, setMode] = useState<'instant' | 'scheduled'>('instant');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(defaultProjectId || '');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [recordingConsent, setRecordingConsent] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter a meeting title.');
      toast.warning('Title Required', 'Please enter a meeting title.');
      return;
    }

    let scheduledStartIso: string | undefined = undefined;
    let scheduledEndIso: string | undefined = undefined;

    if (mode === 'scheduled') {
      if (!scheduledDate || !scheduledTime) {
        setError('Please select both a scheduled date and start time.');
        toast.warning('Schedule Incomplete', 'Please select both a scheduled date and start time.');
        return;
      }
      const start = new Date(`${scheduledDate}T${scheduledTime}`);
      if (isNaN(start.getTime())) {
        setError('Invalid scheduled date or time.');
        toast.error('Invalid Date/Time', 'The selected date or time is invalid.');
        return;
      }
      scheduledStartIso = start.toISOString();
      const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
      scheduledEndIso = end.toISOString();
    }

    setLoading(true);
    setError('');

    try {
      const res = await meetingService.create(workspaceId, {
        title: title.trim(),
        description: description.trim() || undefined,
        project_id: projectId || undefined,
        scheduled_start: scheduledStartIso,
        scheduled_end: scheduledEndIso,
        recording_consent: recordingConsent,
      });
      toast.success(
        mode === 'instant' ? 'Meeting Ready' : 'Meeting Scheduled',
        mode === 'instant' ? 'Instant meeting created. Entering room...' : `Scheduled for ${scheduledDate} at ${scheduledTime}`
      );
      onMeetingCreated(res.data);
      onClose();
    } catch (err: any) {
      const msg = extractErrorMessage(err, 'Failed to create meeting. Please try again.');
      setError(msg);
      toast.error('Creation Failed', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-backdrop-overlay" id="create-meeting-modal-overlay">
      <div className="create-meeting-dialog" id="create-meeting-modal-card">
        {/* Header */}
        <div className="modal-header-row">
          <div className="modal-header-title-box">
            <div className="modal-header-icon">
              <Video size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                {mode === 'instant' ? 'Start Instant Meeting' : 'Schedule Meeting'}
              </h2>
              <p style={{ fontSize: '0.75rem', color: '#a1a1aa', margin: 0 }}>
                Live video collaboration with Groq Whisper AI transcription
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="modal-close-btn"
            id="close-create-meeting-modal"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="modal-form-body">
            {/* Mode Switch Tabs */}
            <div className="modal-mode-tabs">
              <button
                type="button"
                onClick={() => {
                  setMode('instant');
                  setError('');
                }}
                className={`modal-mode-tab ${mode === 'instant' ? 'active' : ''}`}
                id="modal-mode-instant-btn"
              >
                <Video size={14} />
                <span>Start Now</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('scheduled');
                  setError('');
                  if (!scheduledDate) {
                    const tmrw = new Date();
                    tmrw.setDate(tmrw.getDate() + 1);
                    setScheduledDate(tmrw.toISOString().substring(0, 10));
                    setScheduledTime('10:00');
                  }
                }}
                className={`modal-mode-tab ${mode === 'scheduled' ? 'active' : ''}`}
                id="modal-mode-schedule-btn"
              >
                <Calendar size={14} />
                <span>Schedule Later</span>
              </button>
            </div>

            {error && (
              <div className="meetings-alert error" style={{ padding: '0.625rem 0.875rem' }}>
                <span>{error}</span>
              </div>
            )}

            {/* Title */}
            <div className="field-group">
              <label className="field-label" htmlFor="meeting-title-input">
                Meeting Title *
              </label>
              <input
                id="meeting-title-input"
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (error) setError('');
                }}
                placeholder="e.g. Sprint Architecture Sync"
                className="field-input"
                autoFocus
              />
            </div>

            {/* Description */}
            <div className="field-group">
              <label className="field-label" htmlFor="meeting-desc-input">
                Description (Optional)
              </label>
              <textarea
                id="meeting-desc-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Outline agenda or topics for this discussion..."
                className="field-textarea"
                rows={2}
              />
            </div>

            {/* Project Selection */}
            {projects.length > 0 && (
              <div className="field-group">
                <label className="field-label" htmlFor="meeting-project-select">
                  Attach to Project
                </label>
                <SelectBox
                  id="meeting-project-select"
                  value={projectId}
                  onValueChange={setProjectId}
                  placeholder="No Project (Workspace-wide)"
                  options={[
                    { value: '', label: 'No Project (Workspace-wide)' },
                    ...projects.map((p) => ({ value: p.id, label: p.name })),
                  ]}
                />
              </div>
            )}

            {/* Schedule Controls */}
            {mode === 'scheduled' && (
              <>
                <div className="modal-grid-2">
                  <div className="field-group">
                    <label className="field-label" htmlFor="meeting-date-input">
                      Date *
                    </label>
                    <input
                      id="meeting-date-input"
                      type="date"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="field-input"
                      min={new Date().toISOString().substring(0, 10)}
                    />
                  </div>
                  <div className="field-group">
                    <label className="field-label" htmlFor="meeting-time-input">
                      Start Time *
                    </label>
                    <input
                      id="meeting-time-input"
                      type="time"
                      value={scheduledTime}
                      onChange={(e) => setScheduledTime(e.target.value)}
                      className="field-input"
                    />
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label" htmlFor="meeting-duration-select">
                    Duration
                  </label>
                  <SelectBox
                    id="meeting-duration-select"
                    value={String(durationMinutes)}
                    onValueChange={(val) => setDurationMinutes(Number(val))}
                    options={[
                      { value: '15', label: '15 minutes (Quick Standup)' },
                      { value: '30', label: '30 minutes' },
                      { value: '45', label: '45 minutes' },
                      { value: '60', label: '1 hour' },
                      { value: '90', label: '1.5 hours' },
                    ]}
                  />
                </div>
              </>
            )}

            {/* AI Transcription & Consent Notice */}
            <div className="consent-notice-card">
              <ShieldCheck size={18} />
              <div>
                <strong>AI Transcription & Action Items</strong>
                <p style={{ margin: '0.2rem 0 0 0', opacity: 0.9 }}>
                  Participants will be prompted for audio transcription consent. Raw audio is processed through Groq Whisper to extract reviewable tasks.
                </p>
              </div>
            </div>

            {/* Consent Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                id="enable-transcription-consent-cb"
                checked={recordingConsent}
                onChange={(e) => setRecordingConsent(e.target.checked)}
                style={{ accentColor: '#6366f1', width: 16, height: 16, cursor: 'pointer' }}
              />
              <label
                htmlFor="enable-transcription-consent-cb"
                style={{ fontSize: '0.8125rem', color: '#e4e4e7', cursor: 'pointer' }}
              >
                Enable AI Speech-to-Text & Action-Item Pipeline
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="modal-footer-actions">
            <button
              type="button"
              onClick={onClose}
              className="btn-modal-cancel"
              id="cancel-create-meeting-btn"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="btn-modal-submit"
              id="submit-create-meeting-btn"
            >
              {loading ? (
                <span>Creating...</span>
              ) : mode === 'instant' ? (
                <>
                  <Video size={14} />
                  <span>Start Instant Meeting</span>
                </>
              ) : (
                <>
                  <Calendar size={14} />
                  <span>Schedule Meeting</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
