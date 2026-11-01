import React, { useState, useEffect } from 'react';
import {
  X,
  Link as LinkIcon,
  Key,
  QrCode as QrIcon,
  Mail,
  Copy,
  Check,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  UserPlus,
} from 'lucide-react';
import {
  type Workspace,
  type Invitation,
  invitationService,
  memberService,
} from '../services/workspaceService';
import { QRCodeDisplay } from './QRCodeDisplay';
import { extractErrorMessage } from '../services/api';
import { toast } from '../utils/toast';
import { LottieAnimation } from './ui/LottieAnimation';

interface AddMemberModalProps {
  workspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
  onMemberAdded?: () => void;
}

export const AddMemberModal: React.FC<AddMemberModalProps> = ({
  workspace,
  isOpen,
  onClose,
  onMemberAdded,
}) => {
  const [activeTab, setActiveTab] = useState<'link' | 'code' | 'qr' | 'email'>('link');
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Email direct addition
  const [emailInput, setEmailInput] = useState('');
  const [roleInput, setRoleInput] = useState<'MEMBER' | 'ADMIN'>('MEMBER');
  const [submittingEmail, setSubmittingEmail] = useState(false);
  const [emailError, setEmailError] = useState('');

  const canManage = workspace.current_user_role === 'OWNER' || workspace.current_user_role === 'ADMIN';

  // Fetch or create invitation once when modal opens
  useEffect(() => {
    if (!isOpen || !canManage) return;

    let isMounted = true;
    const fetchOrCreate = async () => {
      try {
        setLoading(true);
        // First check existing invitations
        const res = await invitationService.list(workspace.id);
        const active = res.data.find(
          (inv) => inv.status === 'ACTIVE' && inv.invitation_type === 'LINK'
        );

        if (active) {
          if (isMounted) setInvitation(active);
        } else {
          // Generate a fresh link invitation
          const created = await invitationService.create(workspace.id, {
            invitation_type: 'LINK',
            role: 'MEMBER',
            requires_approval: workspace.requires_approval,
            expires_in_days: 7,
          });
          if (isMounted) setInvitation(created.data);
        }
      } catch (err) {
        console.error('Failed to load invitation:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOrCreate();
    return () => {
      isMounted = false;
    };
  }, [isOpen, workspace.id, canManage]);

  if (!isOpen) return null;

  const fullInviteUrl = invitation?.invite_url
    ? invitation.invite_url.startsWith('http')
      ? invitation.invite_url
      : `${window.location.origin}${invitation.invite_url}`
    : '';

  const handleCopyLink = () => {
    if (!fullInviteUrl) return;
    navigator.clipboard.writeText(fullInviteUrl);
    setCopiedLink(true);
    toast.success('Link Copied', 'Invitation URL copied to clipboard.');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleCopyCode = () => {
    if (!invitation?.invite_code) return;
    navigator.clipboard.writeText(invitation.invite_code);
    setCopiedCode(true);
    toast.success('Code Copied', `Invite code "${invitation.invite_code}" copied to clipboard.`);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleRegenerate = async () => {
    if (!invitation) return;
    try {
      setLoading(true);
      const res = await invitationService.regenerate(workspace.id, invitation.id);
      setInvitation(res.data);
      toast.success('Invitation Regenerated', 'A new invitation link and code were created.');
    } catch (err: any) {
      toast.error('Regeneration Failed', extractErrorMessage(err, 'Failed to regenerate invitation'));
    } finally {
      setLoading(false);
    }
  };

  const handleDirectAddEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim()) return;
    setEmailError('');
    setSubmittingEmail(true);

    try {
      // Direct add member
      await memberService.add(workspace.id, {
        email: emailInput.trim(),
        role: roleInput,
      });
      toast.success('Member Added', `${emailInput} has been added as ${roleInput}.`);
      setEmailInput('');
      onMemberAdded?.();
      onClose();
    } catch (err: any) {
      const msg = extractErrorMessage(err, 'Failed to add member directly.');
      setEmailError(msg);
      toast.error('Add Member Failed', msg);
    } finally {
      setSubmittingEmail(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 7, 12, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 520,
          maxHeight: 'min(92dvh, 660px)',
          background: 'linear-gradient(180deg, #181d2a 0%, #121622 100%)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 20,
          boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.85), 0 0 1px rgba(255, 255, 255, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(255, 255, 255, 0.02)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', minWidth: 0 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'rgba(99, 102, 241, 0.16)',
                color: '#818cf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                flexShrink: 0,
                overflow: 'hidden',
              }}
            >
              <LottieAnimation
                src="https://lottie.host/e476421b-e0c8-4c83-a026-368aa515c6b4/QYtUQ5Zayl.lottie"
                width={36}
                height={36}
                loop
                autoplay
                ariaLabel="Add member animation"
                lazy
                fallback={<UserPlus size={18} />}
              />
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Invite to {workspace.name}
              </h3>
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Share an invitation link, code, QR badge, or email
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            style={{ padding: '6px', borderRadius: 8, color: '#94a3b8', flexShrink: 0 }}
            title="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        {!canManage ? (
          <div style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <AlertCircle size={36} style={{ color: '#f59e0b', margin: '0 auto 12px auto' }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff' }}>
              Permission Required
            </h4>
            <p style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: 6, maxWidth: 360, margin: '6px auto 0 auto' }}>
              Only workspace owners and administrators can create invitations or add members to this workspace.
            </p>
            <button
              onClick={onClose}
              className="btn btn-secondary"
              style={{ marginTop: '1.5rem' }}
            >
              Close
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
            {/* Tabs */}
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '0.5rem 1rem 0 1rem',
                gap: '0.35rem',
                background: 'rgba(0, 0, 0, 0.2)',
                overflowX: 'auto',
                scrollbarWidth: 'none',
                WebkitOverflowScrolling: 'touch',
                flexShrink: 0,
              }}
            >
              <button
                className={`btn btn-sm ${activeTab === 'link' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('link')}
                style={{ fontSize: '0.75rem', gap: 6, borderRadius: '8px 8px 0 0', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                <LinkIcon size={13} />
                <span>Invite Link</span>
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'code' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('code')}
                style={{ fontSize: '0.75rem', gap: 6, borderRadius: '8px 8px 0 0', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                <Key size={13} />
                <span>Invite Code</span>
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'qr' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('qr')}
                style={{ fontSize: '0.75rem', gap: 6, borderRadius: '8px 8px 0 0', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                <QrIcon size={13} />
                <span>QR Code</span>
              </button>
              <button
                className={`btn btn-sm ${activeTab === 'email' ? 'btn-primary' : 'btn-ghost'}`}
                onClick={() => setActiveTab('email')}
                style={{ fontSize: '0.75rem', gap: 6, borderRadius: '8px 8px 0 0', flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                <Mail size={13} />
                <span>Direct Add</span>
              </button>
            </div>

            <div style={{ padding: 'clamp(1rem, 3vw, 1.5rem)', overflowY: 'auto' }}>
              {loading && !invitation ? (
                <div style={{ padding: '2.5rem 0', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                  Loading invitation details...
                </div>
              ) : (
                <>
                  {/* TAB 1: Link */}
                  {activeTab === 'link' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div>
                        <label className="form-label">Shareable Link</label>
                        <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.5rem 0' }}>
                          Anyone with this link can {workspace.requires_approval ? 'request to join' : 'join'} as a member.
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                          <input
                            type="text"
                            readOnly
                            value={fullInviteUrl || 'Generating link...'}
                            className="form-input"
                            style={{ fontFamily: 'monospace', fontSize: '0.8rem', minWidth: 0, flex: '1 1 180px' }}
                          />
                          <button
                            onClick={handleCopyLink}
                            className="btn btn-primary"
                            disabled={!fullInviteUrl}
                            style={{ gap: 6, flexShrink: 0 }}
                          >
                            {copiedLink ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                            <span>{copiedLink ? 'Copied!' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>

                      <div
                        style={{
                          padding: '0.75rem 1rem',
                          borderRadius: 12,
                          background: 'rgba(99, 102, 241, 0.08)',
                          border: '1px solid rgba(99, 102, 241, 0.2)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontSize: '0.75rem',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#e0e7ff' }}>
                          <ShieldCheck size={15} style={{ color: '#818cf8' }} />
                          <span>
                            {workspace.requires_approval
                              ? 'Admin review required before admission'
                              : 'Instant direct admission enabled'}
                          </span>
                        </div>
                        <button
                          onClick={handleRegenerate}
                          disabled={loading}
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.72rem', color: '#818cf8', gap: 4 }}
                          title="Generate a fresh link and code"
                        >
                          <RefreshCw size={11} className={loading ? 'spin' : ''} />
                          <span>Regenerate</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* TAB 2: Short Code */}
                  {activeTab === 'code' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', textAlign: 'center' }}>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '0.75rem' }}>
                          Share this 8-character invitation code with teammates:
                        </div>
                        <div
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 'clamp(1.25rem, 6vw, 1.75rem)',
                            fontWeight: 800,
                            letterSpacing: '0.12em',
                            color: '#ffffff',
                            background: 'rgba(0, 0, 0, 0.45)',
                            padding: '0.75rem clamp(0.75rem, 4vw, 1.5rem)',
                            borderRadius: 12,
                            border: '1px solid rgba(99, 102, 241, 0.35)',
                            display: 'inline-block',
                            maxWidth: '100%',
                            wordBreak: 'break-all',
                          }}
                        >
                          {invitation?.invite_code || 'SYNC-....'}
                        </div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
                        <button
                          onClick={handleCopyCode}
                          className="btn btn-primary"
                          style={{ gap: 6 }}
                        >
                          {copiedCode ? <Check size={14} style={{ color: '#10b981' }} /> : <Copy size={14} />}
                          <span>{copiedCode ? 'Copied Code!' : 'Copy Invite Code'}</span>
                        </button>
                      </div>

                      <p style={{ fontSize: '0.75rem', color: '#71717a', margin: 0 }}>
                        Users can enter this code directly at the <span style={{ color: '#818cf8' }}>/join</span> portal.
                      </p>
                    </div>
                  )}

                  {/* TAB 3: QR Code */}
                  {activeTab === 'qr' && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      {fullInviteUrl ? (
                        <QRCodeDisplay
                          url={fullInviteUrl}
                          size={150}
                          workspaceName={workspace.name}
                        />
                      ) : (
                        <div style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Generating QR Code...</div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: Direct Add via Email */}
                  {activeTab === 'email' && (
                    <form onSubmit={handleDirectAddEmail} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div className="form-group">
                        <label className="form-label">User Email Address</label>
                        <input
                          type="email"
                          required
                          placeholder="teammate@example.com"
                          value={emailInput}
                          onChange={(e) => setEmailInput(e.target.value)}
                          className="form-input"
                        />
                      </div>

                      <div className="form-group">
                        <label className="form-label">Role</label>
                        <select
                          value={roleInput}
                          onChange={(e) => setRoleInput(e.target.value as 'MEMBER' | 'ADMIN')}
                          className="form-select"
                        >
                          <option value="MEMBER">Member (Standard Access)</option>
                          <option value="ADMIN">Admin (Can manage projects &amp; invitations)</option>
                        </select>
                      </div>

                      {emailError && (
                        <div style={{ fontSize: '0.75rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <AlertCircle size={13} />
                          <span>{emailError}</span>
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          onClick={onClose}
                          disabled={submittingEmail}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={submittingEmail || !emailInput.trim()}
                        >
                          {submittingEmail ? 'Adding Member...' : 'Add Member'}
                        </button>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
