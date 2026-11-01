import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  workspaceService,
  memberService,
  invitationService,
  joinRequestService,
  type Workspace,
  type Member,
  type WorkspaceCapacity,
  type Invitation,
  type JoinRequest,
} from '../services/workspaceService';
import {
  Settings,
  Users,
  ArrowLeft,
  Trash2,
  Edit2,
  Plus,
  X,
  Video,
  Briefcase,
  FolderKanban,
  Check,
  Copy,
  Link as LinkIcon,
  Mail,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Clock,
  Key,
  Info,
} from 'lucide-react';
import { extractErrorMessage } from '../services/api';
import { useBreadcrumbs } from '../context/BreadcrumbContext';
import { SelectBox } from '../components/ui/select';
import { ThinkingLoader } from '../components/ThinkingLoader';
import { QRCodeDisplay } from '../components/QRCodeDisplay';
import { toast } from '../utils/toast';
import { useWorkspaceRealtime } from '../utils/useWorkspaceRealtime';
import { HoldToDeleteButton } from '../components/ui/HoldToDeleteButton';
import { LottieAnimation } from '../components/ui/LottieAnimation';

const WorkspaceDetail: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setBreadcrumbs, cacheWorkspaceName } = useBreadcrumbs();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [capacity, setCapacity] = useState<WorkspaceCapacity | null>(null);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Active section tab for team management
  const [activeTab, setActiveTab] = useState<'members' | 'requests' | 'invitations'>('members');

  // Edit workspace general details
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [updatingWorkspace, setUpdatingWorkspace] = useState(false);
  const [deletingWorkspace, setDeletingWorkspace] = useState(false);

  // Edit capacity modal
  const [showCapacityModal, setShowCapacityModal] = useState(false);
  const [newCapacity, setNewCapacity] = useState<number>(50);
  const [newRequiresApproval, setNewRequiresApproval] = useState<boolean>(true);
  const [updatingCapacity, setUpdatingCapacity] = useState(false);

  // Invitations creation modal & hub
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteType, setInviteType] = useState<'LINK' | 'CODE' | 'EMAIL'>('LINK');
  const [inviteRole, setInviteRole] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMaxUses, setInviteMaxUses] = useState<number | ''>('');
  const [inviteExpiresDays, setInviteExpiresDays] = useState<number>(7);
  const [inviteRequiresApproval, setInviteRequiresApproval] = useState<boolean>(true);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [latestCreatedInvite, setLatestCreatedInvite] = useState<Invitation | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Join requests management
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  // Direct member addition
  const [showAddMember, setShowAddMember] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('MEMBER');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Member management states
  const [roleUpdatingUserId, setRoleUpdatingUserId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);

  const canManage = workspace?.current_user_role === 'OWNER' || workspace?.current_user_role === 'ADMIN';
  const isOwner = workspace?.current_user_role === 'OWNER';

  const loadData = async () => {
    if (!workspaceId) return;
    try {
      setLoading(true);
      setError('');
      const [wsRes, memRes] = await Promise.all([
        workspaceService.get(workspaceId),
        memberService.list(workspaceId),
      ]);
      setWorkspace(wsRes.data);
      setMembers(memRes.data);
      setEditName(wsRes.data.name);
      setEditDesc(wsRes.data.description || '');

      cacheWorkspaceName(wsRes.data.id, wsRes.data.name);
      setBreadcrumbs([
        { label: 'Workspaces', path: '/workspaces' },
        { label: wsRes.data.name },
      ]);

      // Load capacity
      const capRes = await workspaceService.getCapacity(workspaceId);
      setCapacity(capRes.data);
      setNewCapacity(capRes.data.max_capacity);
      setNewRequiresApproval(capRes.data.requires_approval);

      // If authorized, load invitations and pending join requests
      const role = wsRes.data.current_user_role;
      if (role === 'OWNER' || role === 'ADMIN') {
        const [invRes, reqRes] = await Promise.all([
          invitationService.list(workspaceId).catch(() => ({ data: [] })),
          joinRequestService.listForWorkspace(workspaceId).catch(() => ({ data: [] })),
        ]);
        setInvitations(invRes.data);
        setJoinRequests(reqRes.data);
      }
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to load workspace details'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  // Real-Time event subscription
  useWorkspaceRealtime(workspaceId, {
    onEvent: (evt) => {
      if (!evt.event) return;
      if (evt.event === 'workspace:updated') {
        if (evt.data?.name) {
          setWorkspace((prev) => (prev ? { ...prev, ...evt.data } : null));
          setEditName(evt.data.name);
          setEditDesc(evt.data.description || '');
        }
      } else if (evt.event === 'workspace:deleted') {
        toast.info('Workspace Deleted', 'This workspace has been deleted.');
        navigate('/workspaces');
      } else if (evt.event === 'member:removed') {
        if (evt.data?.user_id === user?.id) {
          toast.warning('Access Revoked', 'You have been removed from this workspace.');
          navigate('/workspaces');
          return;
        }
        memberService.list(workspaceId!).then((res) => setMembers(res.data)).catch(() => {});
      } else if (evt.event === 'member:added' || evt.event === 'member:updated') {
        memberService.list(workspaceId!).then((res) => setMembers(res.data)).catch(() => {});
      } else if (evt.event === 'workspace:capacity:updated') {
        setCapacity((prev) => (prev ? { ...prev, ...evt.data } : evt.data));
      } else if (evt.event === 'workspace:join_request:created') {
        if (canManage) {
          toast.info('New Join Request', `${evt.data.user_name} requested to join.`);
          joinRequestService.listForWorkspace(workspaceId!).then((res) => setJoinRequests(res.data)).catch(() => {});
          workspaceService.getCapacity(workspaceId!).then((res) => setCapacity(res.data)).catch(() => {});
        }
      } else if (evt.event === 'workspace:invitation:created' || evt.event === 'workspace:invitation:revoked') {
        if (canManage) {
          invitationService.list(workspaceId!).then((res) => setInvitations(res.data)).catch(() => {});
        }
      }
    },
    onReconnect: () => {
      loadData();
    },
    onRevoked: () => {
      toast.warning('Access Revoked', 'Your membership in this workspace is no longer active.');
      navigate('/workspaces');
    },
  });

  // ---- Capacity Management ----

  const handleSaveCapacity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId || updatingCapacity) return;
    setUpdatingCapacity(true);
    try {
      const res = await workspaceService.updateCapacity(workspaceId, {
        max_capacity: newCapacity,
        requires_approval: newRequiresApproval,
      });
      setCapacity(res.data);
      setWorkspace((prev) => (prev ? { ...prev, max_capacity: newCapacity, requires_approval: newRequiresApproval } : null));
      toast.success('Capacity Updated', `Workspace capacity set to ${newCapacity} seats.`);
      setShowCapacityModal(false);
    } catch (err: any) {
      toast.error('Failed to Update Capacity', extractErrorMessage(err, 'Failed to update capacity'));
    } finally {
      setUpdatingCapacity(false);
    }
  };

  // ---- Invitation Management ----

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspaceId || creatingInvite) return;
    setCreatingInvite(true);
    try {
      const res = await invitationService.create(workspaceId, {
        invitation_type: inviteType,
        role: inviteRole,
        requires_approval: inviteRequiresApproval,
        recipient_email: inviteType === 'EMAIL' ? inviteEmail.trim() : undefined,
        max_uses: inviteMaxUses ? Number(inviteMaxUses) : undefined,
        expires_in_days: inviteExpiresDays,
      });
      setLatestCreatedInvite(res.data);
      toast.success('Invitation Created', `${inviteType} invitation is ready to share.`);
      invitationService.list(workspaceId).then((r) => setInvitations(r.data)).catch(() => {});
      workspaceService.getCapacity(workspaceId).then((r) => setCapacity(r.data)).catch(() => {});
    } catch (err: any) {
      toast.error('Creation Failed', extractErrorMessage(err, 'Failed to create invitation'));
    } finally {
      setCreatingInvite(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    if (!workspaceId || !confirm('Are you sure you want to revoke this invitation? Any user with this link will no longer be able to join.'))
      return;
    try {
      await invitationService.revoke(workspaceId, invitationId);
      toast.info('Invitation Revoked', 'The invitation token and code have been invalidated.');
      invitationService.list(workspaceId).then((r) => setInvitations(r.data)).catch(() => {});
      workspaceService.getCapacity(workspaceId).then((r) => setCapacity(r.data)).catch(() => {});
    } catch (err: any) {
      toast.error('Revocation Failed', extractErrorMessage(err, 'Failed to revoke invitation'));
    }
  };

  const handleRegenerateInvitation = async (invitationId: string) => {
    if (!workspaceId) return;
    try {
      const res = await invitationService.regenerate(workspaceId, invitationId);
      setLatestCreatedInvite(res.data);
      toast.success('Regenerated', 'Previous invitation revoked and new token generated.');
      invitationService.list(workspaceId).then((r) => setInvitations(r.data)).catch(() => {});
    } catch (err: any) {
      toast.error('Regeneration Failed', extractErrorMessage(err, 'Failed to regenerate invitation'));
    }
  };

  const handleCopyLink = (url: string, id: string) => {
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    toast.success('Copied', 'Invitation URL copied to clipboard.');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCopyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    toast.success('Copied', `Invite code "${code}" copied to clipboard.`);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // ---- Join Requests Management ----

  const handleApproveRequest = async (requestId: string, applicantName: string) => {
    if (processingRequestId) return;
    setProcessingRequestId(requestId);
    try {
      await joinRequestService.approve(requestId);
      toast.success('Request Approved', `${applicantName} has joined the workspace.`);
      // Optimistically remove from list
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
      memberService.list(workspaceId!).then((res) => setMembers(res.data)).catch(() => {});
      workspaceService.getCapacity(workspaceId!).then((res) => setCapacity(res.data)).catch(() => {});
    } catch (err: any) {
      toast.error('Approval Failed', extractErrorMessage(err, 'Failed to approve join request'));
    } finally {
      setProcessingRequestId(null);
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (processingRequestId) return;
    setProcessingRequestId(requestId);
    try {
      await joinRequestService.reject(requestId, rejectionReason.trim() || undefined);
      toast.info('Request Rejected', 'The join request has been declined.');
      setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
      setRejectingRequestId(null);
      setRejectionReason('');
      workspaceService.getCapacity(workspaceId!).then((res) => setCapacity(res.data)).catch(() => {});
    } catch (err: any) {
      toast.error('Rejection Failed', extractErrorMessage(err, 'Failed to reject join request'));
    } finally {
      setProcessingRequestId(null);
    }
  };

  // ---- Direct Member Addition & Roles ----

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    try {
      await memberService.add(workspaceId!, { email: addEmail, role: addRole });
      toast.success('Member Added', `${addEmail} was added as ${addRole}.`);
      setAddEmail('');
      setAddRole('MEMBER');
      setShowAddMember(false);
      loadData();
    } catch (err: any) {
      const msg = extractErrorMessage(err, 'Failed to add member to workspace');
      setAddError(msg);
      toast.error('Failed to Add Member', msg);
    } finally {
      setAddLoading(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    if (roleUpdatingUserId) return;
    setRoleUpdatingUserId(userId);
    try {
      await memberService.updateRole(workspaceId!, userId, { role: newRole });
      toast.success('Role Updated', `Member role changed to ${newRole}`);
      loadData();
    } catch (err: any) {
      toast.error('Role Update Failed', extractErrorMessage(err, 'Failed to update member role'));
    } finally {
      setRoleUpdatingUserId(null);
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from this workspace?`)) return;
    if (removingMemberId) return;
    setRemovingMemberId(userId);
    try {
      await memberService.remove(workspaceId!, userId);
      toast.success('Member Removed', `${name} has been removed from this workspace.`);
      loadData();
    } catch (err: any) {
      toast.error('Failed to Remove Member', extractErrorMessage(err, 'Failed to remove member'));
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (updatingWorkspace) return;
    setUpdatingWorkspace(true);
    try {
      const payload: { name: string; description: string; max_capacity?: number; requires_approval?: boolean } = {
        name: editName,
        description: editDesc,
      };
      if (isOwner) {
        payload.max_capacity = newCapacity;
        payload.requires_approval = newRequiresApproval;
      }
      await workspaceService.update(workspaceId!, payload);
      toast.success('Workspace Updated', 'Workspace details and configuration saved successfully.');
      setEditing(false);
      loadData();
    } catch (err: any) {
      toast.error('Failed to Update Workspace', extractErrorMessage(err, 'Failed to update workspace'));
    } finally {
      setUpdatingWorkspace(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (deletingWorkspace) return;
    setDeletingWorkspace(true);
    try {
      await workspaceService.delete(workspaceId!);
      toast.success('Workspace Deleted', 'The workspace has been removed.');
      navigate('/workspaces');
    } catch (err: any) {
      toast.error('Failed to Delete Workspace', extractErrorMessage(err, 'Failed to delete workspace'));
      setDeletingWorkspace(false);
    }
  };

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case 'OWNER':
        return 'badge badge-primary';
      case 'ADMIN':
        return 'badge badge-warning';
      default:
        return 'badge badge-neutral';
    }
  };

  if (loading) {
    return (
      <ThinkingLoader
        state="working"
        size={64}
        message="Loading workspace details..."
        description="Fetching projects, team members, and workspace activity"
      />
    );
  }

  if (error || !workspace) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <div className="error-message" style={{ maxWidth: 500, margin: '0 auto 1.5rem auto' }}>
          {error || 'Workspace not found'}
        </div>
        <button className="btn btn-secondary" onClick={() => navigate('/workspaces')}>
          <ArrowLeft size={16} />
          <span>Back to Workspaces</span>
        </button>
      </div>
    );
  }

  const activePercent = capacity ? Math.min(100, Math.round((capacity.active_members / capacity.max_capacity) * 100)) : 0;
  const isFull = capacity?.is_full ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1360, margin: '0 auto', width: '100%' }}>
      {/* Back button */}
      <div>
        <button
          className="btn btn-ghost"
          onClick={() => navigate('/workspaces')}
          style={{ paddingLeft: 0, color: 'var(--text-secondary)' }}
          id="btn-back-workspaces-overview"
        >
          <ArrowLeft size={16} />
          <span>Back to Workspaces</span>
        </button>
      </div>

      {/* Hero Header Banner */}
      <div className="page-hero-banner">
        <div className="page-hero-info">
          <div className="page-hero-icon">
            <Briefcase size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
              <h1 className="page-hero-title">{workspace.name}</h1>
              <span className={roleBadgeClass(workspace.current_user_role)}>
                {workspace.current_user_role}
              </span>
            </div>
            <p className="page-hero-subtitle">
              {workspace.description || 'Collaborate with your team across roadmap projects, video meetings, and tasks.'}
            </p>
          </div>
        </div>

        <div className="page-hero-actions">
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/workspaces/${workspaceId}/meetings`)}
            id="workspace-meetings-nav-btn"
          >
            <Video size={16} style={{ color: '#818cf8' }} />
            <span>Video Meetings</span>
          </button>

          <button
            className="btn btn-primary"
            onClick={() => navigate(`/workspaces/${workspaceId}/projects`)}
            id="workspace-projects-nav-btn"
          >
            <FolderKanban size={16} />
            <span>View Projects</span>
          </button>
        </div>
      </div>

      {/* Workspace Member Capacity Overview Card - Visible ONLY to the workspace owner */}
      {isOwner && capacity && (
        <div
          className="card"
          style={{
            padding: '1.25rem 1.5rem',
            background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.06) 0%, rgba(139, 92, 246, 0.03) 100%)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: isFull ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                  color: isFull ? '#f87171' : '#818cf8',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Users size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>
                    Workspace Capacity
                  </span>
                  <span
                    className={`badge ${isFull ? 'badge-warning' : 'badge-primary'}`}
                    style={{ fontSize: '0.68rem', letterSpacing: '0.04em' }}
                  >
                    {isFull ? 'FULL' : `${capacity.available_seats} SEATS AVAILABLE`}
                  </span>
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  {capacity.active_members} of {capacity.max_capacity} member seats occupied &bull;{' '}
                  {capacity.requires_approval ? 'Approval required to join' : 'Direct join enabled'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {isOwner && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowCapacityModal(true)}
                  style={{ fontSize: '0.75rem', gap: '6px' }}
                  id="btn-edit-capacity"
                >
                  <Edit2 size={13} />
                  <span>Configure Capacity</span>
                </button>
              )}

              {canManage && (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setLatestCreatedInvite(null);
                    setShowInviteModal(true);
                  }}
                  style={{ fontSize: '0.75rem', gap: '6px' }}
                  id="btn-open-invite-hub"
                >
                  <Plus size={14} />
                  <span>Invite &amp; Share</span>
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div style={{ marginTop: '1rem' }}>
            <div
              style={{
                width: '100%',
                height: 7,
                borderRadius: 4,
                background: 'rgba(255, 255, 255, 0.08)',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${activePercent}%`,
                  height: '100%',
                  borderRadius: 4,
                  background: isFull
                    ? '#ef4444'
                    : activePercent >= 80
                    ? '#f59e0b'
                    : 'linear-gradient(90deg, #6366f1 0%, #8b5cf6 100%)',
                  transition: 'width 0.4s ease',
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Main Grid: Management Hub & Workspace Settings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '1.25rem' }}>
        {/* Team & Invitation Hub Card */}
        <div className="card">
          <div className="card-header" style={{ paddingBottom: '0.5rem', borderBottom: 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                className={`btn btn-sm ${activeTab === 'members' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('members')}
                style={{ fontSize: '0.78rem', gap: '6px' }}
                id="tab-members"
              >
                <Users size={14} />
                <span>Members ({members.length})</span>
              </button>

              {canManage && (
                <button
                  className={`btn btn-sm ${activeTab === 'requests' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActiveTab('requests')}
                  style={{ fontSize: '0.78rem', gap: '6px' }}
                  id="tab-join-requests"
                >
                  <Clock size={14} />
                  <span>Join Requests ({joinRequests.length})</span>
                  {joinRequests.length > 0 && (
                    <span
                      style={{
                        padding: '1px 6px',
                        borderRadius: 10,
                        background: '#ef4444',
                        color: '#ffffff',
                        fontSize: '0.65rem',
                        fontWeight: 700,
                      }}
                    >
                      {joinRequests.length}
                    </span>
                  )}
                </button>
              )}

              {canManage && (
                <button
                  className={`btn btn-sm ${activeTab === 'invitations' ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => setActiveTab('invitations')}
                  style={{ fontSize: '0.78rem', gap: '6px' }}
                  id="tab-invitations"
                >
                  <Key size={14} />
                  <span>Invitations ({invitations.length})</span>
                </button>
              )}
            </div>

            {canManage && activeTab === 'members' && (
              <button
                className={`btn ${showAddMember ? 'btn-secondary' : 'btn-primary'}`}
                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
                onClick={() => setShowAddMember(!showAddMember)}
              >
                {showAddMember ? (
                  <>
                    <X size={13} />
                    <span>Cancel</span>
                  </>
                ) : (
                  <>
                    <Plus size={13} />
                    <span>Direct Add</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* TAB 1: Team Members */}
          {activeTab === 'members' && (
            <div>
              {/* Direct Add Member Form */}
              {showAddMember && (
                <div style={{ padding: '1.25rem', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(99, 102, 241, 0.05)' }}>
                  <form onSubmit={handleAddMember} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{ display: 'flex', gap: '0.625rem', flexWrap: 'wrap' }}>
                      <input
                        className="form-input"
                        type="email"
                        placeholder="teammate@example.com"
                        value={addEmail}
                        onChange={(e) => setAddEmail(e.target.value)}
                        required
                        style={{ flex: 1, minWidth: 200 }}
                      />
                      <div style={{ width: 130 }}>
                        <SelectBox
                          value={addRole}
                          onValueChange={(val) => setAddRole(val)}
                          options={[
                            { value: 'MEMBER', label: 'Member' },
                            { value: 'ADMIN', label: 'Admin' },
                          ]}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={addLoading}
                        className="btn btn-primary"
                        style={{ padding: '0.55rem 1rem' }}
                      >
                        {addLoading ? 'Adding...' : 'Add Member'}
                      </button>
                    </div>
                    {addError && <div className="error-message" style={{ margin: 0 }}>{addError}</div>}
                  </form>
                </div>
              )}

              {/* Members Rows */}
              <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {members.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.75rem 1rem',
                      borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: '50%',
                          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '0.8125rem',
                          fontWeight: 700,
                        }}
                      >
                        {m.user_name ? m.user_name.charAt(0).toUpperCase() : 'U'}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>
                          {m.user_name || m.user_email}
                          {m.user_id === user?.id && <span style={{ color: '#818cf8', fontSize: '0.75rem', marginLeft: 6 }}>(You)</span>}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#71717a' }}>{m.user_email}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {canManage && m.user_id !== user?.id && m.role !== 'OWNER' ? (
                        <div style={{ width: 110 }}>
                          <SelectBox
                            size="sm"
                            value={m.role}
                            onValueChange={(val) => handleChangeRole(m.user_id, val)}
                            options={[
                              { value: 'MEMBER', label: 'Member' },
                              { value: 'ADMIN', label: 'Admin' },
                            ]}
                          />
                        </div>
                      ) : (
                        <span className={roleBadgeClass(m.role)}>{m.role}</span>
                      )}

                      {canManage && m.user_id !== user?.id && m.role !== 'OWNER' && (
                        <button
                          onClick={() => handleRemoveMember(m.user_id, m.user_name || m.user_email)}
                          disabled={removingMemberId === m.user_id}
                          className="btn-icon btn-ghost"
                          style={{ color: '#f87171', padding: '0.35rem', opacity: removingMemberId === m.user_id ? 0.5 : 1 }}
                          title="Remove member"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: Pending Join Requests */}
          {activeTab === 'requests' && (
            <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {joinRequests.length === 0 ? (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <ShieldCheck size={32} style={{ color: '#818cf8', margin: '0 auto 8px auto', opacity: 0.6 }} />
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>No Pending Requests</div>
                  <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>All join requests have been reviewed.</div>
                </div>
              ) : (
                joinRequests.map((req) => (
                  <div
                    key={req.id}
                    style={{
                      padding: '1rem',
                      borderRadius: 12,
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: '50%',
                            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                            color: '#ffffff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                          }}
                        >
                          {req.user_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#ffffff' }}>
                            {req.user_name}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: '#71717a' }}>{req.user_email}</div>
                        </div>
                      </div>

                      <span className="badge badge-warning" style={{ fontSize: '0.65rem' }}>
                        {req.role}
                      </span>
                    </div>

                    {req.message && (
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--text-secondary)',
                          background: 'rgba(255, 255, 255, 0.03)',
                          padding: '8px 12px',
                          borderRadius: 8,
                          fontStyle: 'italic',
                        }}
                      >
                        &ldquo;{req.message}&rdquo;
                      </div>
                    )}

                    {/* Reject Reason Input (if open) */}
                    {rejectingRequestId === req.id && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          className="form-input"
                          type="text"
                          placeholder="Optional rejection reason..."
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                        />
                        <button
                          onClick={() => handleRejectRequest(req.id)}
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}
                        >
                          Confirm Reject
                        </button>
                        <button
                          onClick={() => {
                            setRejectingRequestId(null);
                            setRejectionReason('');
                          }}
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.75rem' }}
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '6px' }}>
                      <div style={{ fontSize: '0.72rem', color: '#71717a', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={12} />
                        <span>Requested {req.created_at ? new Date(req.created_at).toLocaleDateString() : 'recently'}</span>
                      </div>

                      {rejectingRequestId !== req.id && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleApproveRequest(req.id, req.user_name)}
                            disabled={processingRequestId === req.id}
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.85rem', gap: '6px' }}
                            id={`btn-approve-request-${req.id}`}
                          >
                            <Check size={13} />
                            <span>Approve</span>
                          </button>

                          <button
                            onClick={() => setRejectingRequestId(req.id)}
                            disabled={processingRequestId === req.id}
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.85rem', gap: '6px', color: '#f87171' }}
                            id={`btn-reject-request-${req.id}`}
                          >
                            <X size={13} />
                            <span>Reject</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: Active Invitations */}
          {activeTab === 'invitations' && (
            <div style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.25rem' }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => setShowInviteModal(true)}
                  style={{ fontSize: '0.75rem', gap: '6px' }}
                >
                  <Plus size={13} />
                  <span>Create Invitation</span>
                </button>
              </div>

              {invitations.length === 0 ? (
                <div style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                  <Key size={32} style={{ color: '#818cf8', margin: '0 auto 8px auto', opacity: 0.6 }} />
                  <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>No Invitations Created</div>
                  <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Generate shareable links, invite codes, or email invites.</div>
                </div>
              ) : (
                invitations.map((inv) => (
                  <div
                    key={inv.id}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 10,
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className={`badge ${
                            inv.status === 'ACTIVE'
                              ? 'badge-primary'
                              : inv.status === 'REVOKED'
                              ? 'badge-neutral'
                              : 'badge-warning'
                          }`}
                          style={{ fontSize: '0.65rem' }}
                        >
                          {inv.invitation_type}
                        </span>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#ffffff' }}>
                          {inv.invite_code || (inv.recipient_email ? `To: ${inv.recipient_email}` : 'Invite Link')}
                        </span>
                        <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>
                          {inv.status}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.72rem', color: '#71717a', marginTop: '4px' }}>
                        Role: {inv.role} &bull; Uses: {inv.use_count}
                        {inv.max_uses ? ` / ${inv.max_uses}` : ' (Unlimited)'}
                        {inv.expires_at ? ` &bull; Expires: ${new Date(inv.expires_at).toLocaleDateString()}` : ''}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {inv.invite_code && inv.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleCopyCode(inv.invite_code!, inv.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.72rem', padding: '0.3rem 0.65rem', gap: '4px' }}
                          title="Copy short invite code"
                        >
                          {copiedId === inv.id ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                          <span>{copiedId === inv.id ? 'Copied' : 'Copy Code'}</span>
                        </button>
                      )}

                      {inv.status === 'ACTIVE' && (
                        <button
                          onClick={() => handleRevokeInvitation(inv.id)}
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem', color: '#f87171' }}
                          title="Revoke invitation"
                        >
                          Revoke
                        </button>
                      )}

                      <button
                        onClick={() => handleRegenerateInvitation(inv.id)}
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', padding: '0.3rem 0.6rem', color: '#818cf8', gap: '4px' }}
                        title="Regenerate new token and code"
                      >
                        <RefreshCw size={12} />
                        <span>Regenerate</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Workspace Settings Card */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <Settings size={18} style={{ color: '#818cf8' }} />
              <h3 className="card-title">Workspace Settings</h3>
            </div>
          </div>

          <div className="card-body">
            {editing ? (
              <form onSubmit={handleUpdateWorkspace} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Workspace Name</label>
                  <input
                    className="form-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-textarea"
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                  />
                </div>

                {isOwner && (
                  <div style={{ padding: '0.85rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: 12, border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e0e7ff', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
                      Capacity &amp; Membership Controls
                    </div>
                    <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                      <label className="form-label">Maximum Member Seats</label>
                      <input
                        type="number"
                        min={members.length}
                        max={10000}
                        value={newCapacity}
                        onChange={(e) => setNewCapacity(parseInt(e.target.value) || members.length)}
                        className="form-input"
                        required
                      />
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 3 }}>
                        Cannot be lower than current member count ({members.length}). Owner occupies 1 seat.
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: '0.5rem' }}>
                      <input
                        type="checkbox"
                        id="edit-approval-toggle"
                        checked={newRequiresApproval}
                        onChange={(e) => setNewRequiresApproval(e.target.checked)}
                        style={{ width: 16, height: 16, accentColor: '#6366f1', cursor: 'pointer' }}
                      />
                      <label htmlFor="edit-approval-toggle" style={{ fontSize: '0.78rem', color: '#ffffff', cursor: 'pointer' }}>
                        Require admin review before admitting new members
                      </label>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="submit" className="btn btn-primary" disabled={updatingWorkspace}>
                    <Check size={14} />
                    <span>{updatingWorkspace ? 'Saving Changes...' : 'Save Changes'}</span>
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)} disabled={updatingWorkspace}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Workspace Name
                  </div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginTop: '0.2rem' }}>
                    {workspace.name}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Description
                  </div>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.2rem', lineHeight: 1.5 }}>
                    {workspace.description || 'No description provided.'}
                  </div>
                </div>

                {isOwner && capacity && (
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      Workspace Capacity
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginTop: '0.35rem' }}>
                      <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.65rem 0.5rem', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Max Capacity</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', marginTop: 2 }}>{capacity.max_capacity}</div>
                      </div>
                      <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.65rem 0.5rem', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Active Seats</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#818cf8', marginTop: 2 }}>{capacity.active_members}</div>
                      </div>
                      <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.65rem 0.5rem', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: '0.68rem', color: '#94a3b8' }}>Available</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: capacity.is_full ? '#f87171' : '#10b981', marginTop: 2 }}>{capacity.available_seats}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                    Membership Policy
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#fafafa', marginTop: '0.2rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={15} style={{ color: workspace.requires_approval ? '#f59e0b' : '#10b981' }} />
                    <span>{workspace.requires_approval ? 'Administrator approval required for join requests' : 'Instant direct join enabled'}</span>
                  </div>
                </div>

                {canManage && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                    <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                      <Edit2 size={14} />
                      <span>Edit Details</span>
                    </button>

                    {isOwner && (
                      <div style={{ marginLeft: 'auto' }}>
                        <HoldToDeleteButton
                          id="btn-delete-workspace"
                          holdDuration={1800}
                          onConfirm={handleDeleteWorkspace}
                          isLoading={deletingWorkspace}
                          label="Hold to Delete Workspace"
                          itemName={workspace?.name}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* Modal: Configure Capacity & Approval Policy                           */}
      {/* ===================================================================== */}
      {showCapacityModal && (
        <div className="modal-backdrop" onClick={() => setShowCapacityModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h3 className="modal-title">Workspace Capacity &amp; Access</h3>
              <button className="btn-icon btn-ghost" onClick={() => setShowCapacityModal(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveCapacity} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="cap-input">Maximum Member Capacity</label>
                <input
                  className="form-input"
                  id="cap-input"
                  type="number"
                  min={members.length}
                  max={10000}
                  value={newCapacity}
                  onChange={(e) => setNewCapacity(parseInt(e.target.value) || 1)}
                  required
                />
                <span style={{ fontSize: '0.72rem', color: '#a1a1aa', marginTop: '4px' }}>
                  Cannot be less than active member count ({members.length} members currently).
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: 'rgba(99, 102, 241, 0.06)',
                  border: '1px solid rgba(99, 102, 241, 0.15)',
                }}
              >
                <input
                  type="checkbox"
                  id="modal-requires-approval"
                  checked={newRequiresApproval}
                  onChange={(e) => setNewRequiresApproval(e.target.checked)}
                  style={{ marginTop: '3px', cursor: 'pointer', accentColor: '#6366f1' }}
                />
                <label htmlFor="modal-requires-approval" style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  <div style={{ fontWeight: 600 }}>Require Admin Approval</div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    Applicants must be approved by an owner or admin before gaining active access.
                  </div>
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCapacityModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={updatingCapacity}>
                  {updatingCapacity ? 'Saving...' : 'Save Capacity'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* Modal: Invite & Share Hub (Link, QR Code, Short Code, Email)          */}
      {/* ===================================================================== */}
      {showInviteModal && (
        <div className="modal-backdrop" onClick={() => setShowInviteModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h3 className="modal-title">Invite to {workspace.name}</h3>
              <button className="btn-icon btn-ghost" onClick={() => setShowInviteModal(false)}>
                <X size={16} />
              </button>
            </div>

            {/* Generated Result View */}
            {latestCreatedInvite ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: 12,
                    background: 'rgba(16, 185, 129, 0.08)',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <LottieAnimation
                    src="https://lottie.host/e476421b-e0c8-4c83-a026-368aa515c6b4/QYtUQ5Zayl.lottie"
                    width={48}
                    height={48}
                    loop
                    autoplay
                    ariaLabel="Invitation ready animation"
                    lazy
                    fallback={<CheckCircle2 size={24} style={{ color: '#10b981', flexShrink: 0 }} />}
                  />
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#10b981' }}>
                      Invitation Ready to Share!
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 2 }}>
                      Share the link, code, or QR code below with your team.
                    </div>
                  </div>
                </div>

                {/* 1. Shareable Link */}
                {latestCreatedInvite.raw_token && (
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Shareable Join Link</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        className="form-input"
                        readOnly
                        value={`${window.location.origin}/join/${latestCreatedInvite.raw_token}`}
                        style={{ fontSize: '0.8rem' }}
                      />
                      <button
                        onClick={() => handleCopyLink(`/join/${latestCreatedInvite.raw_token}`, 'latest-link')}
                        className="btn btn-primary"
                        style={{ padding: '0.5rem 1rem' }}
                      >
                        {copiedId === 'latest-link' ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedId === 'latest-link' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. QR Code Preview */}
                {latestCreatedInvite.raw_token && (
                  <QRCodeDisplay
                    url={`${window.location.origin}/join/${latestCreatedInvite.raw_token}`}
                    workspaceName={workspace.name}
                    size={160}
                  />
                )}

                {/* 3. Short Code */}
                {latestCreatedInvite.invite_code && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '0.85rem 1.25rem',
                      borderRadius: 12,
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Invite Code</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#818cf8', letterSpacing: '0.08em' }}>
                        {latestCreatedInvite.invite_code}
                      </div>
                    </div>
                    <button
                      onClick={() => handleCopyCode(latestCreatedInvite.invite_code!, 'latest-code')}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', gap: '6px' }}
                    >
                      {copiedId === 'latest-code' ? <Check size={13} style={{ color: '#10b981' }} /> : <Copy size={13} />}
                      <span>{copiedId === 'latest-code' ? 'Copied' : 'Copy Code'}</span>
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button className="btn btn-secondary" onClick={() => setLatestCreatedInvite(null)}>
                    Create Another
                  </button>
                  <button className="btn btn-primary" onClick={() => setShowInviteModal(false)}>
                    Done
                  </button>
                </div>
              </div>
            ) : (
              /* Invitation Creation Form */
              <form onSubmit={handleCreateInvitation} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {/* Method Selector */}
                <div>
                  <label className="form-label" style={{ marginBottom: '8px' }}>Invitation Method</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${inviteType === 'LINK' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setInviteType('LINK')}
                      style={{ fontSize: '0.75rem', gap: '6px' }}
                    >
                      <LinkIcon size={14} />
                      <span>Link / QR</span>
                    </button>

                    <button
                      type="button"
                      className={`btn btn-sm ${inviteType === 'CODE' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setInviteType('CODE')}
                      style={{ fontSize: '0.75rem', gap: '6px' }}
                    >
                      <Key size={14} />
                      <span>Invite Code</span>
                    </button>

                    <button
                      type="button"
                      className={`btn btn-sm ${inviteType === 'EMAIL' ? 'btn-primary' : 'btn-secondary'}`}
                      onClick={() => setInviteType('EMAIL')}
                      style={{ fontSize: '0.75rem', gap: '6px' }}
                    >
                      <Mail size={14} />
                      <span>Email</span>
                    </button>
                  </div>
                </div>

                {/* Email input if EMAIL type */}
                {inviteType === 'EMAIL' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" htmlFor="inv-email">Recipient Email Address *</label>
                    <input
                      className="form-input"
                      id="inv-email"
                      type="email"
                      placeholder="colleague@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      required
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: '#a1a1aa', marginTop: '4px' }}>
                      <Info size={12} style={{ color: '#818cf8', flexShrink: 0 }} />
                      <span>Only this recipient email will be permitted to accept the invitation.</span>
                    </div>
                  </div>
                )}

                {/* Role and Limits */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Role</label>
                    <SelectBox
                      value={inviteRole}
                      onValueChange={(val) => setInviteRole(val as any)}
                      options={[
                        { value: 'MEMBER', label: 'Member' },
                        { value: 'ADMIN', label: 'Admin' },
                      ]}
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Expires In</label>
                    <SelectBox
                      value={String(inviteExpiresDays)}
                      onValueChange={(val) => setInviteExpiresDays(parseInt(val))}
                      options={[
                        { value: '1', label: '1 Day' },
                        { value: '7', label: '7 Days' },
                        { value: '30', label: '30 Days' },
                        { value: '90', label: '90 Days' },
                      ]}
                    />
                  </div>
                </div>

                {inviteType !== 'EMAIL' && (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Maximum Uses (optional)</label>
                    <input
                      className="form-input"
                      type="number"
                      min={1}
                      placeholder="Unlimited uses"
                      value={inviteMaxUses}
                      onChange={(e) => setInviteMaxUses(e.target.value ? parseInt(e.target.value) : '')}
                    />
                  </div>
                )}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: 'rgba(99, 102, 241, 0.06)',
                    border: '1px solid rgba(99, 102, 241, 0.15)',
                  }}
                >
                  <input
                    type="checkbox"
                    id="invite-requires-approval"
                    checked={inviteRequiresApproval}
                    onChange={(e) => setInviteRequiresApproval(e.target.checked)}
                    style={{ marginTop: '3px', cursor: 'pointer', accentColor: '#6366f1' }}
                  />
                  <label htmlFor="invite-requires-approval" style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 600 }}>Require Administrator Approval</div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                      When unchecked, recipients join immediately without an approval step.
                    </div>
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowInviteModal(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={creatingInvite}>
                    {creatingInvite ? 'Generating...' : 'Generate Invitation'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceDetail;
