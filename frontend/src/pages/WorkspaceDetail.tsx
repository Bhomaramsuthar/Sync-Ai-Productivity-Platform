import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { workspaceService, memberService } from '../services/workspaceService';
import type { Workspace, Member } from '../services/workspaceService';
import api from '../services/api';

const WorkspaceDetail = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
      const [wsRes, memRes] = await Promise.all([
        workspaceService.get(workspaceId!),
        memberService.list(workspaceId!),
      ]);
      setWorkspace(wsRes.data);
      setMembers(memRes.data);
      setEditName(wsRes.data.name);
      setEditDesc(wsRes.data.description || '');
    } catch (err: any) {
      if (err.response?.status === 403) setError('You do not have access to this workspace');
      else if (err.response?.status === 404) setError('Workspace not found');
      else setError('Failed to load workspace');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [workspaceId]);

  const canManage = workspace?.current_user_role === 'OWNER' || workspace?.current_user_role === 'ADMIN';
  const isOwner = workspace?.current_user_role === 'OWNER';

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError('');
    setAddLoading(true);
    try {
      await memberService.add(workspaceId!, { email: addEmail, role: addRole });
      setAddEmail('');
      setAddRole('MEMBER');
      setShowAddMember(false);
      loadData();
    } catch (err: any) {
      setAddError(err.response?.data?.detail?.error?.message || 'Failed to add member');
    } finally {
      setAddLoading(false);
    }
  };

  const handleChangeRole = async (userId: string, newRole: string) => {
    try {
      await memberService.updateRole(workspaceId!, userId, { role: newRole });
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.error?.message || 'Failed to change role');
    }
  };

  const handleRemoveMember = async (userId: string, name: string) => {
    if (!confirm(`Remove ${name} from this workspace?`)) return;
    try {
      await memberService.remove(workspaceId!, userId);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.error?.message || 'Failed to remove member');
    }
  };

  const handleUpdateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await workspaceService.update(workspaceId!, { name: editName, description: editDesc });
      setEditing(false);
      loadData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.error?.message || 'Failed to update workspace');
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!confirm('Are you sure you want to delete this workspace? This cannot be undone.')) return;
    try {
      await workspaceService.delete(workspaceId!);
      navigate('/workspaces');
    } catch (err: any) {
      alert(err.response?.data?.detail?.error?.message || 'Failed to delete workspace');
    }
  };

  const handleLogout = async () => {
    try { await api.post('/auth/logout'); } catch {}
    logout();
  };

  if (loading) return <div className="loading-screen">Loading workspace...</div>;
  if (error) return (
    <div className="page-container">
      <div className="error-message" style={{ maxWidth: 500, margin: '4rem auto' }}>{error}</div>
      <div style={{ textAlign: 'center' }}>
        <button className="btn-secondary" onClick={() => navigate('/workspaces')}>← Back to Workspaces</button>
      </div>
    </div>
  );
  if (!workspace) return null;

  return (
    <div className="page-container">
      <header className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <button className="btn-link" onClick={() => navigate('/workspaces')}>← Workspaces</button>
          </div>
          {editing ? (
            <form onSubmit={handleUpdateWorkspace} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <input className="form-input" value={editName} onChange={e => setEditName(e.target.value)} style={{ width: 250 }} />
              <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem' }}>Save</button>
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
            </form>
          ) : (
            <h1 className="page-title">{workspace.name}</h1>
          )}
          <p className="page-subtitle">{workspace.description || 'No description'}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <span className={`badge ${workspace.current_user_role === 'OWNER' ? 'badge-owner' : workspace.current_user_role === 'ADMIN' ? 'badge-admin' : 'badge-member'}`}>
            {workspace.current_user_role}
          </span>
          <span className="text-muted">{user?.name}</span>
          <button onClick={handleLogout} className="btn-secondary">Sign Out</button>
        </div>
      </header>

      {/* Workspace Settings */}
      {canManage && (
        <div className="section-card" style={{ marginBottom: '2rem' }}>
          <h2 className="section-title">Workspace Settings</h2>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {!editing && <button className="btn-secondary" onClick={() => setEditing(true)}>Edit Details</button>}
            {editing && (
              <div className="form-group" style={{ width: '100%' }}>
                <label className="form-label">Description</label>
                <textarea className="form-input" value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={2} style={{ resize: 'vertical' }} />
              </div>
            )}
            {isOwner && <button className="btn-danger" onClick={handleDeleteWorkspace}>Delete Workspace</button>}
          </div>
        </div>
      )}

      {/* Members Section */}
      <div className="section-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h2 className="section-title" style={{ margin: 0 }}>Members ({members.length})</h2>
          {canManage && (
            <button className="btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={() => setShowAddMember(!showAddMember)}>
              {showAddMember ? 'Cancel' : '+ Add Member'}
            </button>
          )}
        </div>

        {showAddMember && (
          <form onSubmit={handleAddMember} className="add-member-form">
            {addError && <div className="error-message">{addError}</div>}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <input className="form-input" style={{ flex: 2, minWidth: 200 }} type="email" placeholder="member@example.com" value={addEmail} onChange={e => setAddEmail(e.target.value)} required />
              <select className="form-input" style={{ flex: 1, minWidth: 120 }} value={addRole} onChange={e => setAddRole(e.target.value)}>
                <option value="MEMBER">MEMBER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
              <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem' }} disabled={addLoading}>
                {addLoading ? 'Adding...' : 'Add'}
              </button>
            </div>
          </form>
        )}

        <div className="members-list">
          {members.map(m => (
            <div key={m.id} className="member-row">
              <div className="member-info">
                <div className="member-avatar">{m.user_name.charAt(0).toUpperCase()}</div>
                <div>
                  <div className="member-name">{m.user_name}</div>
                  <div className="text-muted text-sm">{m.user_email}</div>
                </div>
              </div>
              <div className="member-actions">
                <span className="text-muted text-sm">Joined {new Date(m.joined_at).toLocaleDateString()}</span>
                {canManage && m.role !== 'OWNER' ? (
                  <select className="form-input role-select" value={m.role} onChange={e => handleChangeRole(m.user_id, e.target.value)}>
                    <option value="MEMBER">MEMBER</option>
                    <option value="ADMIN">ADMIN</option>
                    {isOwner && <option value="OWNER">OWNER</option>}
                  </select>
                ) : (
                  <span className={`badge ${m.role === 'OWNER' ? 'badge-owner' : m.role === 'ADMIN' ? 'badge-admin' : 'badge-member'}`}>{m.role}</span>
                )}
                {canManage && m.user_id !== user?.id && m.role !== 'OWNER' && (
                  <button className="btn-icon-danger" onClick={() => handleRemoveMember(m.user_id, m.user_name)} title="Remove member">✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorkspaceDetail;
