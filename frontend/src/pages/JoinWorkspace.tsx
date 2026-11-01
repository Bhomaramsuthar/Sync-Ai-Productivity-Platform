import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { invitationService, type ValidateInvitationResult } from '../services/workspaceService';
import { extractErrorMessage } from '../services/api';
import {
  Briefcase,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  LogIn,
  Send,
  XCircle,
} from 'lucide-react';
import { ThinkingLoader } from '../components/ThinkingLoader';
import { toast } from '../utils/toast';

export const JoinWorkspace: React.FC = () => {
  const { token: pathToken } = useParams<{ token?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const tokenParam = pathToken || searchParams.get('token') || '';
  const codeParam = searchParams.get('code') || '';

  const [inputCode, setInputCode] = useState(codeParam);
  const [activeToken, setActiveToken] = useState(tokenParam);
  const [activeCode, setActiveCode] = useState(codeParam);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [validation, setValidation] = useState<ValidateInvitationResult | null>(null);
  const [error, setError] = useState<string>('');
  const [joinMessage, setJoinMessage] = useState('');
  const [submittedStatus, setSubmittedStatus] = useState<'NONE' | 'REQUESTED' | 'JOINED'>('NONE');
  const [joinedWorkspaceId, setJoinedWorkspaceId] = useState<string | null>(null);

  const fetchValidation = async (t?: string, c?: string) => {
    if (!t && !c) return;
    setLoading(true);
    setError('');
    try {
      const res = await invitationService.validate({ token: t || undefined, code: c || undefined });
      setValidation(res.data);
      if (!res.data.is_valid && res.data.reason) {
        setError(res.data.reason);
      }
    } catch (err: any) {
      const msg = extractErrorMessage(err, 'Failed to validate invitation');
      setError(msg);
      setValidation(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeToken || activeCode) {
      fetchValidation(activeToken, activeCode);
    }
  }, [activeToken, activeCode]);

  const handleManualCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputCode.trim()) return;
    setActiveToken('');
    setActiveCode(inputCode.trim().toUpperCase());
  };

  const handleJoinOrRequest = async () => {
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await invitationService.join({
        token: activeToken || undefined,
        code: activeCode || undefined,
        message: joinMessage.trim() || undefined,
      });

      if (res.data.status === 'REQUESTED') {
        setSubmittedStatus('REQUESTED');
        toast.info('Request Sent', 'Your request has been submitted to the workspace administrators.');
      } else if (res.data.status === 'JOINED') {
        setSubmittedStatus('JOINED');
        setJoinedWorkspaceId(res.data.workspace_id);
        toast.success('Joined Workspace', `Welcome to ${res.data.workspace_name}!`);
      }
    } catch (err: any) {
      const msg = extractErrorMessage(err, 'Failed to join workspace');
      setError(msg);
      toast.error('Action Failed', msg);
    } finally {
      setSubmitting(false);
    }
  };

  const currentRedirectUrl = window.location.pathname + window.location.search;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '85vh',
        padding: 'clamp(1rem, 3vw, 1.5rem)',
      }}
    >
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: 'clamp(1.25rem, 3vw, 2rem)' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 52,
              height: 52,
              borderRadius: 16,
              background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
              color: '#ffffff',
              boxShadow: '0 8px 24px rgba(99, 102, 241, 0.4)',
              marginBottom: '1rem',
            }}
          >
            <Briefcase size={26} />
          </div>
          <h1 style={{ fontSize: 'clamp(1.35rem, 4vw, 1.65rem)', fontWeight: 700, color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
            Sync AI Workspace Invitation
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '6px' }}>
            Collaborate on roadmap projects, meetings, and team workflows
          </p>
        </div>

        {/* Code Input Box if no token/code provided */}
        {!activeToken && !activeCode && (
          <div className="card" style={{ padding: 'clamp(1.25rem, 4vw, 2rem)', marginBottom: '1.5rem' }}>
            <h2 className="card-title" style={{ fontSize: '1.15rem', marginBottom: '0.5rem' }}>
              Have an Invite Code?
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.825rem', marginBottom: '1.25rem' }}>
              Enter the 8-character code shared by your workspace administrator (e.g., SYNC-7X9K).
            </p>
            <form onSubmit={handleManualCodeSubmit} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                className="form-input"
                type="text"
                placeholder="SYNC-XXXX"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                style={{ letterSpacing: '0.08em', fontWeight: 600, minWidth: 0, flex: '1 1 180px' }}
                required
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0.6rem 1.25rem', flexShrink: 0 }}>
                Verify
              </button>
            </form>
          </div>
        )}

        {loading && (
          <div className="card" style={{ padding: '3rem', textAlign: 'center' }}>
            <ThinkingLoader state="searching" size={64} message="Verifying invitation..." description="Validating permissions and workspace capacity" />
          </div>
        )}

        {/* Submission Success States */}
        {submittedStatus === 'REQUESTED' && (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.15)',
                color: '#818cf8',
                marginBottom: '1rem',
              }}
            >
              <Clock size={28} />
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>
              Join Request Submitted
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              Your request to join <strong>{validation?.workspace_name}</strong> has been sent to workspace administrators. You will be notified once reviewed.
            </p>
            <button className="btn btn-secondary" onClick={() => navigate('/workspaces')}>
              Return to Workspaces
            </button>
          </div>
        )}

        {submittedStatus === 'JOINED' && (
          <div className="card" style={{ padding: '2.5rem', textAlign: 'center' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.15)',
                color: '#10b981',
                marginBottom: '1rem',
              }}
            >
              <CheckCircle2 size={28} />
            </div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>
              Welcome to the Workspace!
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', lineHeight: 1.5, marginBottom: '1.5rem' }}>
              You are now an active member of <strong>{validation?.workspace_name}</strong>.
            </p>
            <button
              className="btn btn-primary"
              onClick={() => navigate(joinedWorkspaceId ? `/workspaces/${joinedWorkspaceId}` : '/workspaces')}
              style={{ padding: '0.65rem 1.5rem' }}
            >
              <span>Go to Workspace</span>
              <ArrowRight size={16} />
            </button>
          </div>
        )}

        {/* Validation Review Card */}
        {!loading && submittedStatus === 'NONE' && validation && (
          <div className="card" style={{ padding: 'clamp(1.25rem, 4vw, 2rem)' }}>
            {error && (
              <div className="error-message" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '1.25rem' }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            {/* Workspace Header Details */}
            <div
              style={{
                padding: '1.25rem',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
                marginBottom: '1.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff', margin: 0 }}>
                    {validation.workspace_name}
                  </h2>
                  <p style={{ fontSize: '0.825rem', color: 'var(--text-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                    {validation.workspace_description || 'No description provided.'}
                  </p>
                  <div style={{ fontSize: '0.75rem', color: '#818cf8', marginTop: '6px' }}>
                    Created by {validation.owner_name}
                  </div>
                </div>

                <span
                  className={`badge ${validation.is_valid ? 'badge-primary' : 'badge-warning'}`}
                  style={{ textTransform: 'uppercase', fontSize: '0.68rem', letterSpacing: '0.04em' }}
                >
                  {validation.status}
                </span>
              </div>

              {/* Capacity & Approval Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '1rem', paddingTop: '0.85rem', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <Users size={14} style={{ color: '#818cf8' }} />
                  <span>
                    {validation.active_members} / {validation.max_capacity} Members
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <ShieldCheck size={14} style={{ color: validation.requires_approval ? '#f59e0b' : '#10b981' }} />
                  <span>{validation.requires_approval ? 'Admin Approval Required' : 'Instant Direct Access'}</span>
                </div>
              </div>
            </div>

            {/* If Full */}
            {validation.is_full && (
              <div
                style={{
                  padding: '1rem',
                  borderRadius: '10px',
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  color: '#f87171',
                  fontSize: '0.85rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <XCircle size={18} style={{ flexShrink: 0 }} />
                <span>This workspace has reached its member limit ({validation.max_capacity} seats). New joins are temporarily closed.</span>
              </div>
            )}

            {/* Authentication Gateway */}
            {!isAuthenticated ? (
              <div style={{ textAlign: 'center', paddingTop: '0.5rem' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                  Please sign in or create an account to accept this invitation.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Link
                    to={`/login?redirect=${encodeURIComponent(currentRedirectUrl)}`}
                    className="btn btn-primary"
                    style={{ flex: '1 1 180px', padding: '0.65rem' }}
                  >
                    <LogIn size={15} />
                    <span>Sign In to Join</span>
                  </Link>
                  <Link
                    to={`/register?redirect=${encodeURIComponent(currentRedirectUrl)}`}
                    className="btn btn-secondary"
                    style={{ flex: '1 1 180px', padding: '0.65rem' }}
                  >
                    <span>Create Account</span>
                  </Link>
                </div>
              </div>
            ) : (
              /* Authenticated User Join Actions */
              <div>
                {validation.is_valid && (
                  <>
                    {validation.requires_approval ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div className="form-group" style={{ margin: 0 }}>
                          <label className="form-label" htmlFor="join-message">
                            Message to Workspace Administrator (optional)
                          </label>
                          <textarea
                            className="form-input"
                            id="join-message"
                            rows={3}
                            placeholder="Introduce yourself or specify your project role..."
                            value={joinMessage}
                            onChange={(e) => setJoinMessage(e.target.value)}
                          />
                        </div>

                        <button
                          onClick={handleJoinOrRequest}
                          disabled={submitting}
                          className="btn btn-primary"
                          style={{ width: '100%', padding: '0.75rem' }}
                          id="btn-request-join"
                        >
                          <Send size={15} />
                          <span>{submitting ? 'Submitting Request...' : 'Request to Join Workspace'}</span>
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleJoinOrRequest}
                        disabled={submitting}
                        className="btn btn-primary"
                        style={{ width: '100%', padding: '0.75rem' }}
                        id="btn-direct-join"
                      >
                        <CheckCircle2 size={16} />
                        <span>{submitting ? 'Joining...' : 'Join Workspace Directly'}</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinWorkspace;
