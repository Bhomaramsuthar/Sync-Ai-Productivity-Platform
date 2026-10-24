import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Video,
  Plus,
  ArrowRight,
  Search,
  Copy,
  Check,
  AlertCircle,
  FolderKanban,
  Clock,
  User,
  RefreshCw,
  X,
  FileText,
} from 'lucide-react';
import { meetingService, type Meeting } from '../services/meetingService';
import { projectService, type Project } from '../services/projectService';
import { workspaceService } from '../services/workspaceService';
import { CreateMeetingModal } from '../components/CreateMeetingModal';
import { useBreadcrumbs } from '../context/BreadcrumbContext';
import { extractErrorMessage } from '../services/api';
import { toast } from '../utils/toast';
import './Meetings.css';

interface MeetingsDashboardProps {
  projectId?: string;
}

export const MeetingsDashboard: React.FC<MeetingsDashboardProps> = ({ projectId: propProjectId }) => {
  const params = useParams<{ workspaceId?: string; projectId?: string }>();
  const workspaceId = params.workspaceId;
  const projectId = propProjectId || params.projectId;
  const navigate = useNavigate();
  const { setBreadcrumbs, cacheWorkspaceName, cacheProjectName } = useBreadcrumbs();

  const [resolvedWorkspaceId, setResolvedWorkspaceId] = useState<string>(workspaceId || '');
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joiningCode, setJoiningCode] = useState(false);
  const [joinCodeError, setJoinCodeError] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const loadMeetings = async () => {
    if (!workspaceId && !projectId) return;
    try {
      setLoading(true);
      setError('');
      let wsId = workspaceId;
      let projName = '';
      if (!wsId && projectId) {
        const projRes = await projectService.get(projectId);
        wsId = projRes.data.workspace_id;
        projName = projRes.data.name;
        cacheProjectName(projectId, projName);
      }

      if (wsId) {
        setResolvedWorkspaceId(wsId);
        const [mtgRes, projRes, wsRes] = await Promise.all([
          meetingService.list(wsId, { project_id: projectId }),
          projectService.list(wsId),
          workspaceService.get(wsId).catch(() => null),
        ]);
        setMeetings(mtgRes.data);
        setProjects(projRes.data);

        const wsName = wsRes?.data?.name || 'Workspace';
        cacheWorkspaceName(wsId, wsName);

        if (projectId) {
          setBreadcrumbs([
            { label: 'Workspaces', path: '/workspaces' },
            { label: wsName, path: `/workspaces/${wsId}` },
            { label: projName || 'Project', path: `/projects/${projectId}` },
            { label: 'Meetings' },
          ]);
        } else {
          setBreadcrumbs([
            { label: 'Workspaces', path: '/workspaces' },
            { label: wsName, path: `/workspaces/${wsId}` },
            { label: 'Meetings' },
          ]);
        }
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to load meetings. Please check your server connection.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMeetings();
  }, [workspaceId, projectId]);

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = joinCodeInput.trim().toLowerCase();
    if (!code) return;
    setJoiningCode(true);
    setJoinCodeError('');
    try {
      const res = await meetingService.joinByCode(code);
      toast.success('Joining Meeting', `Connecting to ${res.data.meeting.title}...`);
      navigate(`/meetings/${res.data.meeting.id}/room`);
    } catch (err: any) {
      const msg = extractErrorMessage(err, 'Invalid meeting code. Please verify and try again.');
      setJoinCodeError(msg);
      toast.error('Join Failed', msg);
    } finally {
      setJoiningCode(false);
    }
  };

  const handleCopyCode = (id: string, code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    toast.info('Meeting Code Copied', `Copied ${code} to clipboard`);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const filteredMeetings = meetings.filter((m) => {
    const matchesStatus =
      statusFilter === 'ALL' ? true : m.status === statusFilter;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      m.title.toLowerCase().includes(q) ||
      m.meeting_code.toLowerCase().includes(q) ||
      (m.project_name && m.project_name.toLowerCase().includes(q)) ||
      (m.host_name && m.host_name.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const liveCount = meetings.filter((m) => m.status === 'ACTIVE').length;
  const scheduledCount = meetings.filter((m) => m.status === 'SCHEDULED').length;
  const endedCount = meetings.filter((m) => m.status === 'ENDED').length;

  const formatMeetingDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Flexible / Instant';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="meetings-dashboard-container" id="meetings-dashboard-root">
      {/* Hero Header Banner */}
      <div className="meetings-hero-banner">
        <div className="meetings-hero-info">
          <div className="meetings-hero-icon">
            <Video size={24} />
          </div>
          <div>
            <h1 className="meetings-hero-title">Video Meetings & AI Action Items</h1>
            <p className="meetings-hero-subtitle">
              Collaborate in real-time WebRTC rooms. Audio is transcribed via Groq Whisper, and actionable tasks are extracted automatically.
            </p>
          </div>
        </div>

        <div className="meetings-hero-actions">
          {/* Quick Join By Code */}
          <form onSubmit={handleJoinByCode} className="quick-join-box">
            <input
              type="text"
              id="quick-join-code-input"
              value={joinCodeInput}
              onChange={(e) => {
                setJoinCodeInput(e.target.value);
                if (joinCodeError) setJoinCodeError('');
              }}
              placeholder="e.g. abc-defg-hij"
              className="quick-join-input"
            />
            <button
              type="submit"
              disabled={joiningCode || !joinCodeInput.trim()}
              id="quick-join-submit-btn"
              className="quick-join-btn"
            >
              {joiningCode ? 'Joining...' : 'Join Code'}
            </button>
          </form>

          {/* New Meeting Button */}
          <button
            onClick={() => setIsModalOpen(true)}
            id="open-create-meeting-modal-btn"
            className="btn-new-meeting"
          >
            <Plus size={16} />
            <span>New Meeting</span>
          </button>
        </div>
      </div>

      {/* Join Code Error Banner */}
      {joinCodeError && (
        <div className="meetings-alert error">
          <div className="meetings-alert-content">
            <AlertCircle size={16} />
            <span>{joinCodeError}</span>
          </div>
          <button
            className="meetings-alert-btn"
            onClick={() => setJoinCodeError('')}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Error Banner with Retry */}
      {error && (
        <div className="meetings-alert error">
          <div className="meetings-alert-content">
            <AlertCircle size={18} />
            <div>
              <strong>Connection Error:</strong> {error}
            </div>
          </div>
          <button className="meetings-alert-btn" onClick={loadMeetings}>
            <RefreshCw size={13} style={{ display: 'inline', marginRight: 4 }} />
            Retry Request
          </button>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="meetings-toolbar">
        <div className="meetings-filter-tabs">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`filter-tab-pill ${statusFilter === 'ALL' ? 'active' : ''}`}
            id="filter-tab-all"
          >
            <span>All</span>
            <span className="filter-badge-count">{meetings.length}</span>
          </button>
          <button
            onClick={() => setStatusFilter('ACTIVE')}
            className={`filter-tab-pill ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
            id="filter-tab-active"
          >
            <span>Live Now</span>
            {liveCount > 0 && <span className="filter-badge-count">{liveCount}</span>}
          </button>
          <button
            onClick={() => setStatusFilter('SCHEDULED')}
            className={`filter-tab-pill ${statusFilter === 'SCHEDULED' ? 'active' : ''}`}
            id="filter-tab-scheduled"
          >
            <span>Scheduled</span>
            {scheduledCount > 0 && <span className="filter-badge-count">{scheduledCount}</span>}
          </button>
          <button
            onClick={() => setStatusFilter('ENDED')}
            className={`filter-tab-pill ${statusFilter === 'ENDED' ? 'active' : ''}`}
            id="filter-tab-ended"
          >
            <span>Ended</span>
            {endedCount > 0 && <span className="filter-badge-count">{endedCount}</span>}
          </button>
        </div>

        <div className="meetings-search-wrap">
          <Search size={15} className="meetings-search-icon" />
          <input
            type="text"
            placeholder="Search by title, code, or project..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="meetings-search-input"
            id="meetings-search-input"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'transparent',
                border: 'none',
                color: '#71717a',
                cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Loading Skeletons */}
      {loading ? (
        <div className="meetings-cards-grid">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton-card">
              <div className="skeleton-shimmer" />
              <div className="skeleton-line" style={{ height: 22, width: '40%' }} />
              <div className="skeleton-line" style={{ height: 26, width: '85%' }} />
              <div className="skeleton-line" style={{ height: 16, width: '60%' }} />
              <div className="skeleton-line" style={{ height: 40, width: '100%', marginTop: 'auto' }} />
            </div>
          ))}
        </div>
      ) : error ? (
        /* Do not show "No Meetings Found" when request failed */
        null
      ) : filteredMeetings.length === 0 ? (
        <div className="meetings-empty-panel">
          <div className="empty-icon-wrap">
            <Video size={28} />
          </div>
          <div>
            <h3 className="empty-title">
              {searchQuery
                ? 'No matching meetings found'
                : statusFilter !== 'ALL'
                ? `No ${statusFilter.toLowerCase()} meetings`
                : 'No meetings scheduled yet'}
            </h3>
            <p className="empty-subtitle">
              {searchQuery
                ? `No meetings match "${searchQuery}". Try a different keyword or clear the search filter.`
                : 'Start an instant room for quick discussions or schedule ahead with your team.'}
            </p>
          </div>
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery('')}
              className="btn-card-action secondary"
              style={{ maxWidth: 160 }}
            >
              Clear Search Filter
            </button>
          ) : (
            <button
              onClick={() => setIsModalOpen(true)}
              className="btn-new-meeting"
            >
              <Plus size={16} />
              Start Instant Meeting
            </button>
          )}
        </div>
      ) : (
        /* Meetings Cards Grid */
        <div className="meetings-cards-grid">
          {filteredMeetings.map((mtg) => {
            const isLive = mtg.status === 'ACTIVE';
            const isScheduled = mtg.status === 'SCHEDULED';
            const isEnded = mtg.status === 'ENDED';

            return (
              <div
                key={mtg.id}
                id={`meeting-card-${mtg.id}`}
                className="meeting-card"
              >
                <div>
                  <div className="meeting-card-top">
                    <span
                      className={`meeting-status-badge ${
                        isLive ? 'live' : isScheduled ? 'scheduled' : 'ended'
                      }`}
                    >
                      {isLive && <span className="pulse-dot" />}
                      {isLive ? 'Live Call' : mtg.status}
                    </span>

                    <button
                      onClick={(e) => handleCopyCode(mtg.id, mtg.meeting_code, e)}
                      className="meeting-code-chip"
                      title="Click to copy meeting code"
                    >
                      <span>{mtg.meeting_code}</span>
                      {copiedCodeId === mtg.id ? (
                        <Check size={12} color="#10b981" />
                      ) : (
                        <Copy size={12} />
                      )}
                    </button>
                  </div>

                  <h3 className="meeting-card-title">{mtg.title}</h3>
                  {mtg.description && (
                    <p className="meeting-card-desc">{mtg.description}</p>
                  )}

                  <div className="meeting-meta-list">
                    <div className="meeting-meta-item">
                      <Clock size={13} />
                      <span>
                        {mtg.scheduled_start
                          ? formatMeetingDate(mtg.scheduled_start)
                          : formatMeetingDate(mtg.created_at)}
                      </span>
                    </div>

                    {mtg.host_name && (
                      <div className="meeting-meta-item">
                        <User size={13} />
                        <span>Host: {mtg.host_name}</span>
                      </div>
                    )}

                    {mtg.project_name && (
                      <div className="meeting-meta-item">
                        <FolderKanban size={13} />
                        <span className="project-tag-pill">{mtg.project_name}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="meeting-card-footer">
                  {isEnded ? (
                    <button
                      onClick={() => navigate(`/meetings/${mtg.id}`)}
                      className="btn-card-action primary"
                      style={{ width: '100%', justifyContent: 'center' }}
                      id={`view-meeting-btn-${mtg.id}`}
                    >
                      <FileText size={14} />
                      <span>View Meeting & AI Results</span>
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => navigate(`/meetings/${mtg.id}/room`)}
                        className="btn-card-action primary"
                        id={`join-room-btn-${mtg.id}`}
                      >
                        <Video size={14} />
                        <span>{isLive ? 'Join Live Call' : 'Join Room'}</span>
                      </button>

                      <button
                        onClick={() => navigate(`/meetings/${mtg.id}`)}
                        className="btn-card-action secondary"
                        id={`view-notes-btn-${mtg.id}`}
                      >
                        <span>Notes & AI</span>
                        <ArrowRight size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Meeting Modal */}
      {(resolvedWorkspaceId || workspaceId) && (
        <CreateMeetingModal
          workspaceId={resolvedWorkspaceId || workspaceId!}
          defaultProjectId={projectId}
          projects={projects}
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onMeetingCreated={(newMtg) => {
            setMeetings((prev) => [newMtg, ...prev]);
            navigate(`/meetings/${newMtg.id}`);
          }}
        />
      )}
    </div>
  );
};
