import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Video,
  Sparkles,
  CheckCircle2,
  Calendar,
  User,
  Users,
  CheckSquare,
  FileText,
  Copy,
  Check,
  FolderKanban,
  AlertCircle,
  Plus,
  Loader2,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useBreadcrumbs } from '../context/BreadcrumbContext';
import { meetingService } from '../services/meetingService';
import type {
  Meeting,
  MeetingAISummary,
  MeetingSuggestedItem,
  TranscriptSegment,
  MeetingParticipant,
  SuggestionApproveRequest,
} from '../services/meetingService';
import { SuggestionCard } from '../components/SuggestionCard';
import { memberService, workspaceService } from '../services/workspaceService';
import { projectService } from '../services/projectService';
import { ThinkingLoader } from '../components/ThinkingLoader';
import { extractErrorMessage } from '../services/api';
import './Meetings.css';

const getAvatarColor = (name?: string | null) => {
  if (!name) return '#6b7280';
  const colors = ['#3b82f6', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#06b6d4'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export const MeetingDetail: React.FC = () => {
  const { meetingId } = useParams<{ meetingId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setBreadcrumbs, cacheWorkspaceName, cacheProjectName } = useBreadcrumbs();

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [summary, setSummary] = useState<MeetingAISummary | null>(null);
  const [suggestions, setSuggestions] = useState<MeetingSuggestedItem[]>([]);
  const [transcripts, setTranscripts] = useState<TranscriptSegment[]>([]);
  const [participants, setParticipants] = useState<MeetingParticipant[]>([]);
  const [workspaceMembers, setWorkspaceMembers] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);

  const [activeTab, setActiveTab] = useState<'summary' | 'action_items' | 'transcript' | 'participants'>('summary');
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const [successToast, setSuccessToast] = useState('');

  // Manual transcript ingest state
  const [showAddTranscript, setShowAddTranscript] = useState(false);
  const [manualText, setManualText] = useState('');
  const [manualSpeaker, setManualSpeaker] = useState('');

  const loadAllData = async () => {
    try {
      setLoading(true);
      setError('');
      const [mtgRes, sumRes, sugRes, transRes, partRes] = await Promise.all([
        meetingService.get(meetingId!),
        meetingService.getSummary(meetingId!),
        meetingService.listSuggestions(meetingId!),
        meetingService.getTranscript(meetingId!),
        meetingService.getParticipants(meetingId!).catch(() => ({ data: [] })),
      ]);

      setMeeting(mtgRes.data);
      setSummary(sumRes.data);
      setSuggestions(sugRes.data);
      setTranscripts(transRes.data);
      setParticipants(partRes.data);

      // Load workspace members and projects for assignee and target project resolution
      if (mtgRes.data.workspace_id) {
        const [memRes, projRes, wsRes] = await Promise.all([
          memberService.list(mtgRes.data.workspace_id),
          projectService.list(mtgRes.data.workspace_id),
          workspaceService.get(mtgRes.data.workspace_id).catch(() => null),
        ]);
        setWorkspaceMembers(memRes.data);
        setProjects(projRes.data);

        const wsName = wsRes?.data?.name || 'Workspace';
        cacheWorkspaceName(mtgRes.data.workspace_id, wsName);
        if (mtgRes.data.project_id && mtgRes.data.project_name) {
          cacheProjectName(mtgRes.data.project_id, mtgRes.data.project_name);
        }

        setBreadcrumbs([
          { label: 'Workspaces', path: '/workspaces' },
          { label: wsName, path: `/workspaces/${mtgRes.data.workspace_id}` },
          ...(mtgRes.data.project_id
            ? [
                {
                  label: mtgRes.data.project_name || 'Project',
                  path: `/projects/${mtgRes.data.project_id}`,
                },
                {
                  label: 'Meetings',
                  path: `/projects/${mtgRes.data.project_id}/meetings`,
                },
              ]
            : [
                {
                  label: 'Meetings',
                  path: `/workspaces/${mtgRes.data.workspace_id}/meetings`,
                },
              ]),
          { label: mtgRes.data.title },
        ]);
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to load meeting details'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [meetingId]);

  // Poll for post-meeting pipeline status transitions while in PROCESSING state
  useEffect(() => {
    if (!meetingId) return;
    if (summary?.processing_status === 'PROCESSING') {
      const interval = setInterval(async () => {
        try {
          const sumRes = await meetingService.getSummary(meetingId);
          if (sumRes.data) {
            setSummary(sumRes.data);
            if (sumRes.data.processing_status === 'READY') {
              const [sugRes, transRes] = await Promise.all([
                meetingService.listSuggestions(meetingId),
                meetingService.getTranscript(meetingId),
              ]);
              setSuggestions(sugRes.data);
              setTranscripts(transRes.data);
              setSuccessToast('AI processing pipeline completed! Suggestions are ready for review.');
              setTimeout(() => setSuccessToast(''), 4000);
            }
          }
        } catch (e) {
          // ignore transient poll error
        }
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [meetingId, summary?.processing_status]);

  const handleRunAIAnalysis = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const res = await meetingService.analyze(meetingId!);
      setSummary(res.data);
      // Reload suggestions
      const sugRes = await meetingService.listSuggestions(meetingId!);
      setSuggestions(sugRes.data);
      setActiveTab('action_items');
      setSuccessToast('AI summary & action items extracted successfully!');
      setTimeout(() => setSuccessToast(''), 4000);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'AI extraction failed'));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleApproveSuggestion = async (id: string, overrides?: SuggestionApproveRequest) => {
    try {
      const res = await meetingService.approveSuggestion(id, overrides);
      setSuggestions((prev) => prev.map((s) => (s.id === id ? res.data : s)));
      setSuccessToast(
        res.data.item_type === 'TASK'
          ? 'Approved! Created new task in project.'
          : 'Approved! Scheduled new event in calendar.'
      );
      setTimeout(() => setSuccessToast(''), 4000);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to approve item'));
    }
  };

  const handleRejectSuggestion = async (id: string) => {
    try {
      const res = await meetingService.rejectSuggestion(id);
      setSuggestions((prev) => prev.map((s) => (s.id === id ? res.data : s)));
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to reject item'));
    }
  };

  const handleEditSuggestion = async (id: string, updated: Partial<MeetingSuggestedItem>) => {
    try {
      const res = await meetingService.editSuggestion(id, updated);
      setSuggestions((prev) => prev.map((s) => (s.id === id ? res.data : s)));
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to edit item'));
    }
  };

  const handleBulkApprove = async () => {
    const pending = suggestions.filter((s) => s.status === 'PENDING').map((s) => s.id);
    if (pending.length === 0) return;
    try {
      const defaultProj = meeting?.project_id || projects[0]?.id;
      const res = await meetingService.bulkApprove(pending, defaultProj);
      await loadAllData();
      setSuccessToast(`Successfully approved ${res.data.length} action items!`);
      setTimeout(() => setSuccessToast(''), 4000);
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Bulk approval failed'));
    }
  };

  const handleManualTranscriptSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualText.trim()) return;
    try {
      const res = await meetingService.ingestTranscript(meetingId!, [
        {
          content: manualText.trim(),
          speaker_name: manualSpeaker.trim() || user?.name || 'Speaker',
          start_time_ms: 0,
          end_time_ms: 5000,
        },
      ]);
      setTranscripts((prev) => [...prev, ...res.data]);
      setManualText('');
      setShowAddTranscript(false);
      setSuccessToast('Transcript segment saved!');
      setTimeout(() => setSuccessToast(''), 3000);
    } catch (err: any) {
      setError('Failed to ingest transcript');
    }
  };

  const handleCopyCode = () => {
    if (meeting?.meeting_code) {
      navigator.clipboard.writeText(meeting.meeting_code);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  if (loading) {
    return (
      <ThinkingLoader
        state="searching"
        size={64}
        message="Loading meeting intelligence..."
        description="Retrieving transcripts, AI summaries, and participant logs"
      />
    );
  }

  if (!meeting) {
    return (
      <div className="empty-tab-panel" style={{ minHeight: '50vh' }}>
        <AlertCircle className="empty-tab-icon" style={{ color: 'var(--status-danger)' }} />
        <h2 className="empty-tab-title">Meeting Not Found</h2>
        <button
          onClick={() => navigate(-1)}
          className="btn btn-secondary"
          style={{ marginTop: '1rem' }}
        >
          <ArrowLeft size={14} /> Go Back
        </button>
      </div>
    );
  }

  const pendingCount = suggestions.filter((s) => s.status === 'PENDING').length;
  const approvedCount = suggestions.filter((s) => s.status === 'APPROVED').length;

  return (
    <div className="meeting-detail-container">
      {/* Toast Notification */}
      {successToast && (
        <div
          style={{
            position: 'fixed',
            top: '1.5rem',
            right: '1.5rem',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.25rem',
            borderRadius: '12px',
            background: 'var(--status-success)',
            color: '#ffffff',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.4)',
            fontSize: '0.85rem',
            fontWeight: 600,
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <CheckCircle2 size={16} />
          {successToast}
        </div>
      )}

      {/* Back button & top navigation */}
      <div className="meeting-detail-nav">
        <button
          onClick={() => {
            if (meeting.project_id) {
              navigate(`/projects/${meeting.project_id}/meetings`);
            } else if (meeting.workspace_id) {
              navigate(`/workspaces/${meeting.workspace_id}/meetings`);
            } else {
              navigate('/workspaces');
            }
          }}
          className="meeting-back-btn"
          id="meeting-detail-back-btn"
        >
          <ArrowLeft size={16} />
          Back to Meetings
        </button>

        <div className="meeting-detail-actions">
          <button
            onClick={handleCopyCode}
            id="meeting-detail-copy-code-btn"
            className="meeting-code-chip"
            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
          >
            <span>Meeting Code:</span>
            <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{meeting.meeting_code}</span>
            {copiedCode ? <Check size={14} color="var(--status-success)" /> : <Copy size={14} />}
          </button>

          {meeting.status !== 'ENDED' ? (
            <button
              onClick={() => navigate(`/meetings/${meeting.id}/room`)}
              id="join-meeting-room-btn"
              className="btn btn-primary"
            >
              <Video size={16} />
              Join Video Room
            </button>
          ) : (
            <span
              id="meeting-concluded-badge"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                background: 'rgba(100, 116, 139, 0.15)',
                color: 'var(--text-secondary)',
                fontSize: '0.8125rem',
                fontWeight: 600,
                border: '1px solid rgba(100, 116, 139, 0.25)',
              }}
            >
              <CheckCircle2 size={15} color="#94a3b8" />
              Meeting Concluded (Read-Only)
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="meetings-alert error">
          <div className="meetings-alert-content">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Hero Header Card */}
      <div className="meeting-detail-hero">
        <div className="meeting-detail-hero-top">
          <div className="meeting-detail-title-group">
            <div className="meeting-detail-title-row">
              <h1 className="meeting-detail-heading">{meeting.title}</h1>
              <span className={`meeting-status-badge ${meeting.status === 'ACTIVE' ? 'live' : meeting.status === 'ENDED' ? 'ended' : 'scheduled'}`}>
                {meeting.status === 'ACTIVE' && <span className="pulse-dot" />}
                {meeting.status}
              </span>
            </div>
            {meeting.description && (
              <p className="meeting-detail-desc">{meeting.description}</p>
            )}
          </div>

          {/* AI Trigger Button */}
          <button
            onClick={handleRunAIAnalysis}
            disabled={analyzing || transcripts.length === 0}
            id="run-ai-analysis-btn"
            className="btn-ai-analyze"
            title={transcripts.length === 0 ? 'Add transcript segments first' : 'Analyze meeting with AI'}
          >
            {analyzing ? (
              <ThinkingLoader state="solving" size={20} inline />
            ) : (
              <Sparkles size={16} />
            )}
            <span>{analyzing ? 'Analyzing discussion with AI...' : summary ? 'Re-Analyze with AI' : 'Extract AI Summary & Tasks'}</span>
          </button>
        </div>

        {/* Meeting metadata bar */}
        <div className="meeting-detail-meta-bar">
          <div className="meeting-meta-item">
            <User size={14} />
            <span>Host: {meeting.host_name || 'Host'}</span>
          </div>
          {meeting.project_name && (
            <div className="meeting-meta-item">
              <FolderKanban size={14} />
              <span>Project: {meeting.project_name}</span>
            </div>
          )}
          <div className="meeting-meta-item">
            <Calendar size={14} />
            <span>
              {new Date(meeting.scheduled_start || meeting.created_at).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>
          <div className="meeting-meta-item">
            <FileText size={14} />
            <span>{transcripts.length} transcript segments</span>
          </div>
          <div className="meeting-meta-item">
            <Users size={14} />
            <span>{participants.length} {participants.length === 1 ? 'attendee' : 'attendees'}</span>
          </div>
        </div>
      </div>

      {/* Post-Meeting AI Pipeline Status Card */}
      {summary && (
        <div className={`pipeline-status-card ${summary.processing_status === 'FAILED' ? 'failed' : summary.processing_status === 'READY' ? 'ready' : ''}`}>
          <div className="pipeline-header">
            <div className="pipeline-title-group">
              {summary.processing_status === 'PROCESSING' ? (
                <Loader2 size={18} className="animate-spin" color="#818cf8" />
              ) : summary.processing_status === 'FAILED' ? (
                <AlertCircle size={18} color="#f87171" />
              ) : (
                <CheckCircle2 size={18} color="#34d399" />
              )}
              <h3 className="pipeline-title">
                Post-Meeting Intelligence Pipeline
              </h3>
              <span className={`pipeline-badge ${summary.processing_status === 'READY' ? 'ready' : summary.processing_status === 'FAILED' ? 'failed' : ''}`}>
                {summary.processing_stage || (summary.processing_status === 'READY' ? 'Ready for review' : summary.processing_status === 'FAILED' ? 'Needs retry' : 'Processing audio')}
              </span>
            </div>

            {summary.processing_status === 'FAILED' && (
              <button
                onClick={handleRunAIAnalysis}
                disabled={analyzing}
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px', borderColor: 'rgba(239, 68, 68, 0.4)' }}
              >
                <RefreshCw size={13} className={analyzing ? 'animate-spin' : ''} />
                Retry Pipeline
              </button>
            )}

            {summary.processing_status === 'PROCESSING' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ThinkingLoader
                  state={
                    summary.processing_stage === 'Processing audio'
                      ? 'listening'
                      : summary.processing_stage === 'Generating summary'
                      ? 'composing'
                      : 'solving'
                  }
                  size={20}
                  inline
                  message={
                    summary.processing_stage === 'Processing audio'
                      ? 'Transcribing audio batches...'
                      : summary.processing_stage === 'Generating summary'
                      ? 'Composing AI executive summary & notes...'
                      : 'Formulating actionable tasks & calendar events...'
                  }
                />
              </div>
            )}
          </div>

          {/* 4 Multi-Step Visual Track */}
          <div className="pipeline-steps-track">
            {/* Step 1: Processing audio */}
            <div className={`pipeline-step-item ${
              summary.processing_status === 'READY' ||
              summary.processing_stage === 'Generating summary' ||
              summary.processing_stage === 'Preparing tasks'
                ? 'completed'
                : summary.processing_stage === 'Processing audio' || summary.processing_status === 'PROCESSING'
                ? 'active'
                : ''
            }`}>
              <div className="pipeline-step-num">
                {summary.processing_status === 'READY' ||
                summary.processing_stage === 'Generating summary' ||
                summary.processing_stage === 'Preparing tasks' ? '✓' : '1'}
              </div>
              <div>
                <p className="pipeline-step-label">Processing audio</p>
                <p className="pipeline-step-sub">Flush & transcribe batches</p>
              </div>
            </div>

            {/* Step 2: Generating summary */}
            <div className={`pipeline-step-item ${
              summary.processing_status === 'READY' || summary.processing_stage === 'Preparing tasks'
                ? 'completed'
                : summary.processing_stage === 'Generating summary'
                ? 'active'
                : ''
            }`}>
              <div className="pipeline-step-num">
                {summary.processing_status === 'READY' || summary.processing_stage === 'Preparing tasks' ? '✓' : '2'}
              </div>
              <div>
                <p className="pipeline-step-label">Generating summary</p>
                <p className="pipeline-step-sub">Decisions & discussion</p>
              </div>
            </div>

            {/* Step 3: Preparing tasks */}
            <div className={`pipeline-step-item ${
              summary.processing_status === 'READY'
                ? 'completed'
                : summary.processing_stage === 'Preparing tasks'
                ? 'active'
                : ''
            }`}>
              <div className="pipeline-step-num">
                {summary.processing_status === 'READY' ? '✓' : '3'}
              </div>
              <div>
                <p className="pipeline-step-label">Preparing tasks</p>
                <p className="pipeline-step-sub">Assignees & events</p>
              </div>
            </div>

            {/* Step 4: Ready for review */}
            <div className={`pipeline-step-item ${
              summary.processing_status === 'READY'
                ? 'completed'
                : ''
            }`}>
              <div className="pipeline-step-num">
                {summary.processing_status === 'READY' ? '✓' : '4'}
              </div>
              <div>
                <p className="pipeline-step-label">Ready for review</p>
                <p className="pipeline-step-sub">User approval gate</p>
              </div>
            </div>
          </div>

          {summary.processing_error && summary.processing_status === 'FAILED' && (
            <div style={{ fontSize: '0.75rem', color: '#fca5a5', background: 'rgba(239, 68, 68, 0.1)', padding: '6px 12px', borderRadius: '8px' }}>
              Error: {summary.processing_error}
            </div>
          )}
        </div>
      )}

      {/* Dynamic Tab Navigation */}
      <div className="meeting-detail-tabs-bar">
        <div className="meeting-tabs-group">
          <button
            onClick={() => setActiveTab('summary')}
            id="tab-btn-summary"
            className={`meeting-tab-item ${activeTab === 'summary' ? 'active' : ''}`}
          >
            <Sparkles size={15} />
            AI Summary & Decisions
          </button>

          <button
            onClick={() => setActiveTab('action_items')}
            id="tab-btn-action-items"
            className={`meeting-tab-item ${activeTab === 'action_items' ? 'active' : ''}`}
          >
            <CheckSquare size={15} />
            Action Items & Events
            {suggestions.length > 0 && (
              <span className="filter-badge-count">
                {approvedCount > 0 ? `${approvedCount}/${suggestions.length}` : suggestions.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('transcript')}
            id="tab-btn-transcript"
            className={`meeting-tab-item ${activeTab === 'transcript' ? 'active' : ''}`}
          >
            <FileText size={15} />
            Full Transcript
          </button>

          <button
            onClick={() => setActiveTab('participants')}
            id="tab-btn-participants"
            className={`meeting-tab-item ${activeTab === 'participants' ? 'active' : ''}`}
          >
            <Users size={15} />
            Participants
            {participants.length > 0 && (
              <span className="filter-badge-count">{participants.length}</span>
            )}
          </button>
        </div>

        {activeTab === 'action_items' && pendingCount > 0 && (
          <button
            onClick={handleBulkApprove}
            id="bulk-approve-btn"
            className="btn-bulk-approve"
          >
            <CheckCircle2 size={14} />
            Bulk Approve All Pending ({pendingCount})
          </button>
        )}
      </div>

      {/* Tab 1: AI Summary & Decisions */}
      {activeTab === 'summary' && (
        <div>
          {!summary ? (
            <div className="empty-tab-panel">
              <Sparkles className="empty-tab-icon" style={{ color: 'var(--accent-primary)' }} />
              <h3 className="empty-tab-title">No AI Summary Generated Yet</h3>
              <p className="empty-tab-subtitle">
                {transcripts.length > 0
                  ? 'Click "Extract AI Summary & Tasks" above to generate an executive overview and actionable task suggestions.'
                  : 'Record discussion in the video room or add transcript segments to trigger AI extraction.'}
              </p>
            </div>
          ) : (
            <div className="summary-grid-layout">
              {/* Executive Summary Card */}
              <div className="summary-card-panel">
                <div className="summary-card-header">
                  <h3 className="summary-card-title">
                    <Sparkles size={16} color="var(--accent-primary)" />
                    Executive Summary
                  </h3>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(summary.summary_text);
                      setSuccessToast('Summary copied to clipboard!');
                      setTimeout(() => setSuccessToast(''), 3000);
                    }}
                    className="btn-icon btn-ghost"
                    title="Copy summary"
                  >
                    <Copy size={15} />
                  </button>
                </div>
                <p className="summary-card-text">
                  {summary.summary_text}
                </p>
              </div>

              {/* Decisions Card */}
              <div className="summary-card-panel">
                <div className="summary-card-header">
                  <h3 className="summary-card-title">
                    <CheckCircle2 size={16} color="var(--status-success)" />
                    Key Decisions
                  </h3>
                </div>
                {summary.decisions.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: '#71717a', fontStyle: 'italic' }}>No explicit decisions recorded.</p>
                ) : (
                  <ul className="decision-items-list">
                    {summary.decisions.map((dec, i) => (
                      <li key={i} className="decision-item-chip">
                        <Check size={15} />
                        <span>{dec}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Action Items Review */}
      {activeTab === 'action_items' && (
        <div>
          {suggestions.length === 0 ? (
            <div className="empty-tab-panel">
              <CheckSquare className="empty-tab-icon" />
              <h3 className="empty-tab-title">No Action Items Extracted Yet</h3>
              <p className="empty-tab-subtitle">
                Run AI analysis on the meeting transcript to extract tasks and calendar events.
              </p>
            </div>
          ) : (
            <div className="suggestions-cards-grid">
              {suggestions.map((sug) => (
                <SuggestionCard
                  key={sug.id}
                  suggestion={sug}
                  workspaceMembers={workspaceMembers}
                  projects={projects}
                  onApprove={handleApproveSuggestion}
                  onReject={handleRejectSuggestion}
                  onEdit={handleEditSuggestion}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Full Transcript */}
      {activeTab === 'transcript' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifySelf: 'stretch', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Verified Transcript Segments</h3>
            <button
              onClick={() => setShowAddTranscript(!showAddTranscript)}
              className="btn btn-secondary"
              style={{ fontSize: '0.75rem', padding: '5px 12px' }}
            >
              <Plus size={14} />
              Add Segment
            </button>
          </div>

          {/* Add Manual Segment Form */}
          {showAddTranscript && (
            <form
              onSubmit={handleManualTranscriptSubmit}
              className="card"
              style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <h4 className="card-title" style={{ fontSize: '0.85rem' }}>
                Add Transcript Dialogue
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Speaker name (e.g., Alice)"
                  value={manualSpeaker}
                  onChange={(e) => setManualSpeaker(e.target.value)}
                  className="form-input"
                />
                <input
                  type="text"
                  placeholder="Dialogue content / statement..."
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  required
                  className="form-input"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAddTranscript(false)}
                  className="btn btn-ghost"
                  style={{ fontSize: '0.75rem' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ fontSize: '0.75rem' }}
                >
                  Save Segment
                </button>
              </div>
            </form>
          )}

          {transcripts.length === 0 ? (
            <div className="empty-tab-panel">
              <FileText className="empty-tab-icon" />
              <p className="empty-tab-subtitle">
                No transcript recorded yet. Join the video room to speak, or manually add dialogue above.
              </p>
            </div>
          ) : (
            <div className="transcript-timeline">
              {transcripts.map((t, i) => {
                const speakerInitials = (t.speaker_name ? t.speaker_name[0] : 'U').toUpperCase();
                const avatarBg = getAvatarColor(t.speaker_name || t.participant_id);
                return (
                  <div key={t.id || i} className="transcript-row-card">
                    <div className="transcript-avatar" style={{ background: avatarBg }}>
                      {speakerInitials}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div className="transcript-speaker-row">
                        <span className="transcript-speaker-badge">{t.speaker_name || 'Unknown Speaker'}</span>
                        <span className="transcript-timecode">
                          [{Math.floor(t.start_time_ms / 60000).toString().padStart(2, '0')}:
                          {Math.floor((t.start_time_ms % 60000) / 1000).toString().padStart(2, '0')}]
                        </span>
                        <span className="transcript-status-tag">{t.processing_status || 'COMPLETED'}</span>
                      </div>
                      <p className="transcript-text-content">{t.content}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 4: Meeting Participants */}
      {activeTab === 'participants' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Meeting Attendees ({participants.length})
            </h3>
          </div>

          {participants.length === 0 ? (
            <div className="empty-tab-panel">
              <Users className="empty-tab-icon" />
              <h3 className="empty-tab-title">No Attendees Recorded</h3>
              <p className="empty-tab-subtitle">
                Attendees will appear here automatically when they join the live video session.
              </p>
            </div>
          ) : (
            <div className="participants-grid">
              {participants.map((p) => {
                const isHost = p.role === 'HOST' || (meeting.host_user_id && p.user_id === meeting.host_user_id);
                const isPresent = !p.left_at && meeting.status === 'ACTIVE';
                const avatarBg = getAvatarColor(p.user_name || p.user_email || p.user_id);
                const initials = (p.user_name ? p.user_name[0] : p.user_email ? p.user_email[0] : 'U').toUpperCase();

                const joinedTime = p.joined_at
                  ? new Date(p.joined_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : 'Joined';
                const leftTime = p.left_at
                  ? new Date(p.left_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  : null;

                return (
                  <div key={p.id} className="participant-card">
                    <div className="participant-info">
                      <div className="participant-avatar" style={{ background: avatarBg }}>
                        {initials}
                      </div>
                      <div className="participant-details">
                        <div className="participant-name-row">
                          <span className="participant-name">{p.user_name || p.user_email || 'Participant'}</span>
                          <span className={`participant-role-badge ${isHost ? 'host' : 'attendee'}`}>
                            {isHost ? 'Host' : 'Attendee'}
                          </span>
                        </div>
                        <div className="participant-timestamps">
                          <Clock size={12} />
                          <span>Joined {joinedTime}</span>
                          {leftTime && <span>• Left {leftTime}</span>}
                        </div>
                      </div>
                    </div>

                    <div>
                      {isPresent ? (
                        <span className="participant-status-tag active">
                          <span className="pulse-dot" style={{ width: 6, height: 6, background: '#10b981' }} />
                          In Call
                        </span>
                      ) : (
                        <span className="participant-status-tag left">
                          {meeting.status === 'ENDED' ? 'Attended' : 'Left'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
