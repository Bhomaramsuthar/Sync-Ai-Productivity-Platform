import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { workspaceService, memberService } from '../services/workspaceService';
import type { Workspace, Member } from '../services/workspaceService';
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
} from 'lucide-react';
import { extractErrorMessage } from '../services/api';
import { useBreadcrumbs } from '../context/BreadcrumbContext';
import { SelectBox } from '../components/ui/select';
import { ThinkingLoader } from '../components/ThinkingLoader';
import { toast } from '../utils/toast';

const WorkspaceDetail: React.FC = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { setBreadcrumbs, cacheWorkspaceName } = useBreadcrumbs();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Add member form
  const [showAddMember, setShowAddMember] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addRole, setAddRole] = useState('MEMBER');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Edit workspace
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [wsRes, memRes] = await Promise.all([
        workspaceService.get(workspaceId!),
        memberService.list(workspaceId!),
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
    } catch (err: any) {
      setError(extractErrorMessage(err, 'Failed to load workspace details'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [workspaceId]);

  const canManage = workspace?.current_user_role === 'OWNER' || workspace?.current_user_role === 'ADMIN';
  const isOwner = workspace?.current_user_role === 'OWNER';

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
    try {
      await memberService.updateRole(workspaceId!, userId, { role: newRole });
      toast.success('Role Updated', `Member role changed to ${newRole}`);
      loadData();
    } catch (err: any) {
      toast.error('Role Update Failed', extractErrorMessage(err, 'Failed to update member role'));
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove ${name} from this workspace?`)) return;
    try {
      await memberService.remove(workspaceId!, userId);
      toast.success('Member Removed', `${name} has been removed from this workspace.`);
      loadData();
    } catch (err: any) {
      toast.error('Failed to Remove Member', extractErrorMessage(err, 'Failed to remove member'));
    }
  };

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await workspaceService.update(workspaceId!, { name: editName, description: editDesc });
      toast.success('Workspace Updated', 'Workspace details saved successfully.');
      setEditing(false);
      loadData();
    } catch (err: any) {
      toast.error('Failed to Update Workspace', extractErrorMessage(err, 'Failed to update workspace'));
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!confirm('Are you sure you want to delete this workspace? All projects and data will be permanently deleted.'))
      return;
    try {
      await workspaceService.delete(workspaceId!);
      toast.success('Workspace Deleted', 'The workspace has been removed.');
      navigate('/workspaces');
    } catch (err: any) {
      toast.error('Failed to Delete Workspace', extractErrorMessage(err, 'Failed to delete workspace'));
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: 1360, margin: '0 auto', width: '100%' }}>
      {/* Back button */}
      <div>
        <button
          className="btn btn-ghost"
          onClick={() => navigate('/workspaces')}
          style={{ paddingLeft: 0, color: 'var(--text-secondary)' }}
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

      {/* Main Grid: Settings & Members */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.5rem' }}>
        {/* Members Management Card */}
        <div className="card">
          <div className="card-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <Users size={18} style={{ color: '#818cf8' }} />
              <h3 className="card-title">Team Members ({members.length})</h3>
            </div>

            {canManage && (
              <button
                className={`btn ${showAddMember ? 'btn-secondary' : 'btn-primary'}`}
                style={{ padding: '0.4rem 0.8rem', fontSize: '0.75rem' }}
                onClick={() => setShowAddMember(!showAddMember)}
              >
                {showAddMember ? (
                  <>
                    <X size={14} />
                    <span>Cancel</span>
                  </>
                ) : (
                  <>
                    <Plus size={14} />
                    <span>Invite Member</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Add Member Form */}
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
                    {addLoading ? 'Adding...' : 'Send Invite'}
                  </button>
                </div>
                {addError && <div className="error-message" style={{ margin: 0 }}>{addError}</div>}
              </form>
            </div>
          )}

          {/* Member Rows */}
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
                      className="btn-icon btn-ghost"
                      style={{ color: '#f87171', padding: '0.35rem' }}
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

                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button type="submit" className="btn btn-primary">
                    <Check size={14} />
                    <span>Save Changes</span>
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>
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

                {canManage && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border-subtle)' }}>
                    <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                      <Edit2 size={14} />
                      <span>Edit Details</span>
                    </button>

                    {isOwner && (
                      <button
                        className="btn btn-danger"
                        onClick={handleDeleteWorkspace}
                        style={{ marginLeft: 'auto' }}
                      >
                        <Trash2 size={14} />
                        <span>Delete Workspace</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceDetail;
