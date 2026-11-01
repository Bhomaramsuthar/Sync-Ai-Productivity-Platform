import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Briefcase,
  UserPlus,
  ArrowRight,
  MoreVertical,
  Settings,
  FolderKanban,
  Video,
  Copy,
  Check,
  RotateCcw,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Download,
} from 'lucide-react';
import {
  type Workspace,
  type Invitation,
  invitationService,
} from '../services/workspaceService';
import { AddMemberModal } from './AddMemberModal';
import { toast } from '../utils/toast';
import { extractErrorMessage } from '../services/api';
import QRCode from 'qrcode';
import './WorkspaceCard.css';

interface WorkspaceCardProps {
  workspace: Workspace;
  onRefresh?: () => void;
}

// Generate a deterministic, vibrant gradient based on workspace name
const getWorkspaceGradient = (name: string) => {
  const gradients = [
    'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', // Indigo / Purple
    'linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)', // Blue / Cyan
    'linear-gradient(135deg, #10b981 0%, #059669 100%)', // Emerald / Teal
    'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', // Amber / Gold
    'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)', // Pink / Rose
    'linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)', // Sky / Violet
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % gradients.length;
  return gradients[index];
};

export const WorkspaceCard: React.FC<WorkspaceCardProps> = ({ workspace, onRefresh }) => {
  const navigate = useNavigate();

  // 3D Flip state
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Invitation state for the back of the card
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [qrSvg, setQrSvg] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const isOwner = workspace.current_user_role === 'OWNER';
  const isAdmin = workspace.current_user_role === 'ADMIN';
  const canManage = isOwner || isAdmin;

  // Close overflow menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  // Load or generate invitation when flipping to the back
  const loadOrCreateInvitation = async () => {
    if (invitation) return;
    try {
      setLoadingInvite(true);
      setInviteError('');

      // Check existing active link invitations first
      const res = await invitationService.list(workspace.id).catch(() => ({ data: [] }));
      const active = res.data.find(
        (inv) => inv.status === 'ACTIVE' && inv.invitation_type === 'LINK'
      );

      if (active) {
        setInvitation(active);
        generateQr(active);
      } else if (canManage) {
        // Create new link invitation automatically
        const created = await invitationService.create(workspace.id, {
          invitation_type: 'LINK',
          role: 'MEMBER',
          requires_approval: workspace.requires_approval,
          expires_in_days: 7,
        });
        setInvitation(created.data);
        generateQr(created.data);
      } else {
        setInviteError('Only workspace administrators can generate new invitation links.');
      }
    } catch (err: any) {
      setInviteError(extractErrorMessage(err, 'Failed to retrieve invitation link'));
    } finally {
      setLoadingInvite(false);
    }
  };

  const generateQr = (inv: Invitation) => {
    if (!inv.invite_url) return;
    const fullUrl = inv.invite_url.startsWith('http')
      ? inv.invite_url
      : `${window.location.origin}${inv.invite_url}`;

    QRCode.toString(fullUrl, {
      type: 'svg',
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((svg) => setQrSvg(svg))
      .catch((err) => console.error('QR generation failed:', err));
  };

  const handleFlipToInvite = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(true);
    loadOrCreateInvitation();
  };

  const handleFlipToFront = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsFlipped(false);
  };

  const fullInviteUrl = invitation?.invite_url
    ? invitation.invite_url.startsWith('http')
      ? invitation.invite_url
      : `${window.location.origin}${invitation.invite_url}`
    : '';

  const handleCopyLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!fullInviteUrl) return;
    navigator.clipboard.writeText(fullInviteUrl);
    setCopiedLink(true);
    toast.success('Link Copied', 'Invitation URL copied to clipboard.');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!invitation?.invite_code) return;
    navigator.clipboard.writeText(invitation.invite_code);
    setCopiedCode(true);
    toast.success('Code Copied', `Code "${invitation.invite_code}" copied to clipboard.`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleDownloadQr = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!qrSvg) return;
    const blob = new Blob([qrSvg], { type: 'image/svg+xml' });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = `${workspace.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-qr.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
    toast.info('QR Code Saved', 'Downloaded vector SVG QR code.');
  };

  const handleRegenerate = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!invitation || regenerating) return;
    try {
      setRegenerating(true);
      const res = await invitationService.regenerate(workspace.id, invitation.id);
      setInvitation(res.data);
      generateQr(res.data);
      toast.success('Regenerated', 'Previous invitation revoked and new token generated.');
    } catch (err: any) {
      toast.error('Regeneration Failed', extractErrorMessage(err, 'Failed to regenerate invitation'));
    } finally {
      setRegenerating(false);
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

  const gradient = getWorkspaceGradient(workspace.name);
  const memberCount = workspace.member_count ?? 1;

  // Stack initials for mock or real member preview
  const initialLetter = workspace.name.charAt(0).toUpperCase() || 'W';

  return (
    <div className={`workspace-card-scene ${isFlipped ? 'is-flipped' : ''}`} id={`workspace-card-${workspace.id}`}>
      <div className="workspace-card-flipper">
        {/* ==================================================================== */}
        {/* FRONT OF CARD                                                        */}
        {/* ==================================================================== */}
        <div className="workspace-card-front">
          <div className="workspace-card-content">
            {/* Top Row: Avatar, Title, Role, Overflow Menu */}
            <div className="workspace-card-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: 0 }}>
                <div className="workspace-avatar" style={{ background: gradient }}>
                  {initialLetter}
                </div>
                <div className="workspace-card-title-group">
                  <h3
                    className="workspace-card-title"
                    title={workspace.name}
                    onClick={() => navigate(`/workspaces/${workspace.id}`)}
                  >
                    {workspace.name}
                  </h3>
                  <div className="workspace-card-owner-meta">
                    {isOwner ? 'Created by you (Owner)' : `Created by ${workspace.owner_name || 'Owner'}`}
                  </div>
                </div>
              </div>

              {/* Role badge & Overflow Menu */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                <span className={roleBadgeClass(workspace.current_user_role)} style={{ fontSize: '0.68rem' }}>
                  {workspace.current_user_role}
                </span>

                <div ref={menuRef} style={{ position: 'relative' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowMenu(!showMenu);
                    }}
                    className="btn btn-ghost btn-sm"
                    style={{ padding: '4px', borderRadius: 6, color: '#a1a1aa' }}
                    title="Workspace Options"
                    aria-label="Workspace Options"
                  >
                    <MoreVertical size={15} />
                  </button>

                  {showMenu && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 4px)',
                        right: 0,
                        width: 180,
                        background: '#181d2a',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        borderRadius: 12,
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.6)',
                        zIndex: 100,
                        overflow: 'hidden',
                        padding: '4px',
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => {
                          setShowMenu(false);
                          navigate(`/workspaces/${workspace.id}`);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'none',
                          border: 'none',
                          color: '#ffffff',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          borderRadius: 8,
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <Briefcase size={13} style={{ color: '#818cf8' }} />
                        <span>Open Workspace</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowMenu(false);
                          navigate(`/workspaces/${workspace.id}/projects`);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'none',
                          border: 'none',
                          color: '#ffffff',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          borderRadius: 8,
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <FolderKanban size={13} style={{ color: '#38bdf8' }} />
                        <span>View Projects</span>
                      </button>

                      <button
                        onClick={() => {
                          setShowMenu(false);
                          navigate(`/workspaces/${workspace.id}/meetings`);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'none',
                          border: 'none',
                          color: '#ffffff',
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          borderRadius: 8,
                          textAlign: 'left',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <Video size={13} style={{ color: '#10b981' }} />
                        <span>Video Meetings</span>
                      </button>

                      {isOwner && (
                        <button
                          onClick={() => {
                            setShowMenu(false);
                            navigate(`/workspaces/${workspace.id}`);
                          }}
                          style={{
                            width: '100%',
                            padding: '0.5rem 0.75rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            background: 'none',
                            border: 'none',
                            color: '#ffffff',
                            fontSize: '0.78rem',
                            cursor: 'pointer',
                            borderRadius: 8,
                            textAlign: 'left',
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                        >
                          <Settings size={13} style={{ color: '#f59e0b' }} />
                          <span>Settings</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(workspace.id);
                          toast.success('Copied', 'Workspace ID copied.');
                          setShowMenu(false);
                        }}
                        style={{
                          width: '100%',
                          padding: '0.5rem 0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          background: 'none',
                          border: 'none',
                          color: '#94a3b8',
                          fontSize: '0.72rem',
                          cursor: 'pointer',
                          borderRadius: 8,
                          textAlign: 'left',
                          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                          marginTop: 2,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
                      >
                        <Copy size={12} />
                        <span>Copy Workspace ID</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Description */}
            <p className="workspace-card-desc">
              {workspace.description || 'Collaborate across projects, kanban boards, tasks, and meetings.'}
            </p>

            {/* Active Members Stack & Status */}
            <div className="workspace-members-row">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div className="members-avatar-stack">
                  <div className="member-avatar-pill" style={{ background: '#6366f1' }}>
                    {initialLetter}
                  </div>
                  {memberCount > 1 && (
                    <div className="member-avatar-pill" style={{ background: '#3b82f6' }}>
                      2
                    </div>
                  )}
                  {memberCount > 2 && (
                    <div className="member-avatar-pill" style={{ background: '#10b981' }}>
                      3
                    </div>
                  )}
                  {memberCount > 3 && (
                    <div className="member-avatar-pill" style={{ background: '#71717a' }}>
                      +{memberCount - 3}
                    </div>
                  )}
                </div>
                <span className="member-count-text">
                  {memberCount} active member{memberCount !== 1 ? 's' : ''}
                </span>
              </div>

              <div style={{ fontSize: '0.72rem', color: '#71717a' }}>
                Created {new Date(workspace.created_at).toLocaleDateString()}
              </div>
            </div>
          </div>

          {/* Front Card Action Footer */}
          <div className="workspace-card-footer">
            <div className="workspace-card-actions-left">
              <button
                className="btn btn-secondary btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddMemberModal(true);
                }}
                id={`btn-add-member-${workspace.id}`}
                style={{ fontSize: '0.75rem', padding: '0.4rem 0.85rem', gap: '5px' }}
                title="Add a teammate"
              >
                <UserPlus size={13} style={{ color: '#818cf8' }} />
                <span>Add Member</span>
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={handleFlipToInvite}
                id={`btn-invite-flip-${workspace.id}`}
                style={{
                  fontSize: '0.75rem',
                  padding: '0.4rem 0.85rem',
                  gap: '5px',
                  background: 'rgba(99, 102, 241, 0.12)',
                  borderColor: 'rgba(99, 102, 241, 0.3)',
                  color: '#e0e7ff',
                }}
                title="Flip card to share digital invitation"
              >
                <Sparkles size={13} style={{ color: '#818cf8' }} />
                <span>Invite &amp; Share</span>
              </button>
            </div>

            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/workspaces/${workspace.id}`)}
              style={{ fontSize: '0.75rem', padding: '0.4rem 0.85rem', gap: '5px' }}
              title="Open workspace dashboard"
            >
              <span>Open</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </div>

        {/* ==================================================================== */}
        {/* BACK OF CARD: DIGITAL INVITATION                                     */}
        {/* ==================================================================== */}
        <div className="workspace-card-back">
          {/* Invitation Card Header */}
          <div className="invitation-card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  color: '#ffffff',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                }}
              >
                {initialLetter}
              </div>
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#ffffff' }}>
                  {workspace.name}
                </div>
                <div className="invitation-badge-collaborate">
                  <Sparkles size={10} />
                  <span>You're invited to collaborate</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleFlipToFront}
              className="btn btn-ghost btn-sm"
              style={{ padding: '5px 8px', fontSize: '0.72rem', color: '#a1a1aa', gap: 4 }}
              title="Return to workspace view"
            >
              <RotateCcw size={12} />
              <span>Back</span>
            </button>
          </div>

          {/* Invitation Card Body */}
          <div className="invitation-card-body">
            {loadingInvite ? (
              <div style={{ padding: '2.5rem 0', textAlign: 'center', color: '#94a3b8', fontSize: '0.8125rem' }}>
                <RefreshCw size={20} className="spin" style={{ margin: '0 auto 8px auto', color: '#818cf8' }} />
                <div>Generating digital invitation...</div>
              </div>
            ) : inviteError ? (
              <div style={{ padding: '2rem 1rem', textAlign: 'center' }}>
                <p style={{ color: '#f87171', fontSize: '0.8rem', margin: '0 0 1rem 0' }}>{inviteError}</p>
                <button onClick={loadOrCreateInvitation} className="btn btn-secondary btn-sm">
                  Retry
                </button>
              </div>
            ) : (
              <>
                {/* Section A: Shareable Link */}
                <div>
                  <div className="invite-field-label">Shareable Link</div>
                  <div className="invite-copy-pill">
                    <span className="invite-copy-pill-text">{fullInviteUrl || 'Generating...'}</span>
                    <button
                      onClick={handleCopyLink}
                      className="btn btn-primary btn-sm"
                      style={{ padding: '0.25rem 0.65rem', fontSize: '0.7rem', gap: 4 }}
                    >
                      {copiedLink ? <Check size={11} style={{ color: '#10b981' }} /> : <Copy size={11} />}
                      <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>

                {/* Section B: Invite Code & QR Preview Grid */}
                <div className="invite-code-qr-grid">
                  {/* Short Code */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div className="invite-field-label">Invite Code</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className="invite-code-display">
                        {invitation?.invite_code || 'SYNC-....'}
                      </span>
                      <button
                        onClick={handleCopyCode}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.35rem 0.65rem', fontSize: '0.7rem', gap: 4 }}
                        title="Copy 8-character invite code"
                      >
                        {copiedCode ? <Check size={11} style={{ color: '#10b981' }} /> : <Copy size={11} />}
                        <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <div style={{ fontSize: '0.7rem', color: '#71717a', marginTop: 2 }}>
                      {workspace.requires_approval
                        ? '• Admin review required to join'
                        : '• Instant direct membership'}
                    </div>
                  </div>

                  {/* QR Code SVG preview */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div
                      style={{
                        padding: 6,
                        background: '#ffffff',
                        borderRadius: 8,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 90,
                        height: 90,
                      }}
                    >
                      {qrSvg ? (
                        <div dangerouslySetInnerHTML={{ __html: qrSvg }} style={{ width: 78, height: 78 }} />
                      ) : (
                        <div style={{ width: 78, height: 78, background: '#f1f5f9' }} />
                      )}
                    </div>
                    <button
                      onClick={handleDownloadQr}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#818cf8',
                        fontSize: '0.68rem',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 3,
                        padding: 0,
                      }}
                      title="Download high-res vector QR SVG"
                    >
                      <Download size={10} />
                      <span>Save SVG</span>
                    </button>
                  </div>
                </div>

                {/* Status / Expiration Info */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.7rem',
                    color: '#94a3b8',
                    padding: '4px 0',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ShieldCheck size={12} style={{ color: '#818cf8' }} />
                    <span>Role granted: Member</span>
                  </span>
                  <span>
                    {invitation?.expires_at
                      ? `Expires ${new Date(invitation.expires_at).toLocaleDateString()}`
                      : 'Never expires'}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Invitation Card Back Footer */}
          <div className="invitation-card-footer">
            <button
              onClick={handleFlipToFront}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', gap: 5 }}
            >
              <RotateCcw size={13} />
              <span>Back to Workspace</span>
            </button>

            {canManage && invitation && (
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.72rem', color: '#818cf8', gap: 4 }}
                title="Invalidate current link & generate fresh code"
              >
                <RefreshCw size={11} className={regenerating ? 'spin' : ''} />
                <span>Regenerate Link</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <AddMemberModal
          workspace={workspace}
          isOpen={showAddMemberModal}
          onClose={() => setShowAddMemberModal(false)}
          onMemberAdded={onRefresh}
        />
      )}
    </div>
  );
};
