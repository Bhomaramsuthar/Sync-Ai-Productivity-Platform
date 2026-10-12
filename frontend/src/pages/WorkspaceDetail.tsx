import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { workspaceService, memberService } from '../services/workspaceService';
import type { Workspace, Member } from '../services/workspaceService';
import { Settings, Users, ArrowLeft, Trash2, Edit2, Plus, X } from 'lucide-react';

const WorkspaceDetail = () => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
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

  const roleBadgeClass = (role: string) => {
    switch (role) {
      case 'OWNER': return 'badge badge-primary';
      case 'ADMIN': return 'badge badge-warning';
      default: return 'badge badge-neutral';
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading workspace...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center pt-12 gap-4">
      <div className="error-message">{error}</div>
      <button className="btn btn-secondary" onClick={() => navigate('/workspaces')}>
        <ArrowLeft size={16} /> Back to Workspaces
      </button>
    </div>
  );

  if (!workspace) return null;

  return (
    <div>
      <button className="btn btn-ghost mb-4" onClick={() => navigate('/workspaces')}>
        <ArrowLeft size={16} /> Workspaces
      </button>

      <div className="page-header">
        <div className="flex-1">
          {editing ? (
            <form onSubmit={handleUpdateWorkspace} className="flex flex-col gap-4 mb-4">
              <div className="flex gap-2">
                <input className="form-input" style={{ width: 300, fontSize: '1.25rem', fontWeight: 600 }} value={editName} onChange={e => setEditName(e.target.value)} />
                <button type="submit" className="btn btn-primary">Save</button>
                <button type="button" className="btn btn-secondary" onClick={() => setEditing(false)}>Cancel</button>
              </div>
              <textarea className="form-input" style={{ width: '100%', maxWidth: 500 }} rows={2} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            </form>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="page-title mb-0">{workspace.name}</h1>
                <span className={roleBadgeClass(workspace.current_user_role)}>
                  {workspace.current_user_role}
                </span>
              </div>
              <p className="page-subtitle text-base">{workspace.description || 'No description'}</p>
            </>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" onClick={() => navigate(`/workspaces/${workspaceId}/projects`)}>
            View Projects
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-6" style={{ maxWidth: 900 }}>
        {/* Workspace Settings */}
        {canManage && !editing && (
          <div className="card">
            <div className="card-header">
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-muted" />
                <h3 className="card-title">Settings</h3>
              </div>
            </div>
            <div className="card-body flex items-center gap-4">
              <button className="btn btn-secondary" onClick={() => setEditing(true)}>
                <Edit2 size={16} /> Edit Details
              </button>
              {isOwner && (
                <button className="btn btn-danger ml-auto" onClick={handleDeleteWorkspace}>
                  <Trash2 size={16} /> Delete Workspace
                </button>
              )}
            </div>
          </div>
        )}

        {/* Members Section */}
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2">
              <Users size={18} className="text-muted" />
              <h3 className="card-title">Members ({members.length})</h3>
            </div>
            {canManage && (
              <button className={`btn ${showAddMember ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setShowAddMember(!showAddMember)}>
                {showAddMember ? <><X size={16} /> Cancel</> : <><Plus size={16} /> Add Member</>}
              </button>
            )}
          </div>

          {showAddMember && (
            <div className="card-body border-b border-subtle bg-surface-hover">
              <form onSubmit={handleAddMember} className="flex gap-3 items-start flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <input className="form-input" type="email" placeholder="member@example.com" value={addEmail} onChange={e => setAddEmail(e.target.value)} required />
                </div>
                <div className="w-32">
                  <select className="form-select" value={addRole} onChange={e => setAddRole(e.target.value)}>
                    <option value="MEMBER">MEMBER</option>
                    <option value="ADMIN">ADMIN</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" disabled={addLoading}>
                  {addLoading ? 'Adding...' : 'Add'}
                </button>
              </form>
              {addError && <div className="error-message mt-3 mb-0">{addError}</div>}
            </div>
          )}

          <div className="item-list" style={{ gap: 0 }}>
            {members.map((m, index) => (
              <div key={m.id} className="list-item" style={{ border: 'none', borderRadius: 0, borderBottom: index < members.length - 1 ? '1px solid var(--border-subtle)' : 'none' }}>
                <div className="flex items-center gap-4">
                  <div className="flex items-center justify-center w-10 h-10 rounded-full bg-surface-active text-sm font-medium">
                    {m.user_name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium">{m.user_name}</div>
                    <div className="text-muted text-sm">{m.user_email}</div>
                  </div>
                </div>
                
                <div className="flex items-center gap-4">
                  <span className="text-muted text-xs hidden sm:inline-block">Joined {new Date(m.joined_at).toLocaleDateString()}</span>
                  
                  {canManage && m.role !== 'OWNER' ? (
                    <select className="form-select text-sm py-1" style={{ width: 110 }} value={m.role} onChange={e => handleChangeRole(m.user_id, e.target.value)}>
                      <option value="MEMBER">MEMBER</option>
                      <option value="ADMIN">ADMIN</option>
                      {isOwner && <option value="OWNER">OWNER</option>}
                    </select>
                  ) : (
                    <span className={roleBadgeClass(m.role)}>{m.role}</span>
                  )}
                  
                  {canManage && m.user_id !== user?.id && m.role !== 'OWNER' ? (
                    <button className="btn-icon btn-ghost text-danger hover:bg-danger/10" onClick={() => handleRemoveMember(m.user_id, m.user_name)} title="Remove member">
                      <Trash2 size={16} />
                    </button>
                  ) : (
                    <div style={{ width: 32 }}></div> /* Spacer for alignment */
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceDetail;
