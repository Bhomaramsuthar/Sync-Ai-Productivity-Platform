import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { workspaceService } from '../services/workspaceService';
import { ArrowLeft, Briefcase, Users, ShieldCheck, Info } from 'lucide-react';
import { toast } from '../utils/toast';
import { KineticTextReveal } from '../components/ui/KineticTextReveal';
import { LottieAnimation } from '../components/ui/LottieAnimation';

const CreateWorkspace = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [maxCapacity, setMaxCapacity] = useState<number>(50);
  const [requiresApproval, setRequiresApproval] = useState<boolean>(true);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Workspace name is required');
      toast.warning('Name Required', 'Please enter a workspace name.');
      return;
    }
    if (!maxCapacity || maxCapacity < 1) {
      setError('Member capacity must be at least 1 seat');
      toast.warning('Invalid Capacity', 'Member capacity must be 1 or higher.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await workspaceService.create({
        name: name.trim(),
        description: description.trim() || undefined,
        max_capacity: Number(maxCapacity),
        requires_approval: requiresApproval,
      });
      toast.success('Workspace Created', `Workspace "${name.trim()}" is ready with ${maxCapacity} seats.`);
      navigate(`/workspaces/${res.data.id}`);
    } catch (err: any) {
      const msg = err.response?.data?.detail?.error?.message || 'Failed to create workspace';
      setError(msg);
      toast.error('Creation Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '75vh', padding: '1rem' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        <button
          className="btn btn-ghost"
          style={{ marginBottom: '1rem' }}
          onClick={() => navigate('/workspaces')}
          id="btn-back-workspaces"
        >
          <ArrowLeft size={16} />
          Back to Workspaces
        </button>

        <div className="card" style={{ padding: '2.25rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: 14, background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
              <Briefcase size={24} />
            </div>
            <div>
              <KineticTextReveal text="Create Workspace" as="h1" className="card-title" style={{ fontSize: '1.5rem', margin: 0 }} splitBy="words" direction="up" distance={16} stagger={0.06} blur />
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '4px 0 0 0' }}>Configure collaboration limits and membership approval</p>
            </div>
          </div>

          {error && <div className="error-message" style={{ marginBottom: '1.25rem' }}>{error}</div>}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="ws-name">Workspace Name *</label>
              <input
                className="form-input"
                id="ws-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="e.g., Engineering Team"
              />
            </div>

            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="ws-desc">Description (optional)</label>
              <textarea
                className="form-input"
                id="ws-desc"
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="What projects and roadmaps live here?"
                rows={3}
                style={{ resize: 'vertical' }}
              />
            </div>

            {/* Capacity & Approval Settings */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr',
                gap: '14px',
                padding: '14px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {/* Capacity heading with small animation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingBottom: '4px' }}>
                <LottieAnimation
                  src="https://lottie.host/e476421b-e0c8-4c83-a026-368aa515c6b4/QYtUQ5Zayl.lottie"
                  width={36}
                  height={36}
                  loop
                  autoplay
                  ariaLabel="Adding members animation"
                  lazy
                  fallback={<Users size={18} style={{ color: '#818cf8' }} />}
                />
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>How many people can join?</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>You can change this limit later in Workspace Settings.</div>
                </div>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="form-label" htmlFor="ws-capacity" style={{ display: 'flex', alignItems: 'center', gap: '6px', margin: 0 }}>
                    <Users size={15} style={{ color: '#818cf8' }} />
                    <span>Member Capacity</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', color: '#a1a1aa' }}>Owner occupies 1 seat</span>
                </div>
                <input
                  className="form-input"
                  id="ws-capacity"
                  type="number"
                  min={1}
                  max={10000}
                  value={maxCapacity}
                  onChange={e => setMaxCapacity(parseInt(e.target.value) || 1)}
                  required
                />
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
                  id="ws-requires-approval"
                  checked={requiresApproval}
                  onChange={e => setRequiresApproval(e.target.checked)}
                  style={{ marginTop: '3px', cursor: 'pointer', accentColor: '#6366f1' }}
                />
                <label htmlFor="ws-requires-approval" style={{ cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-primary)', lineHeight: 1.4 }}>
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <ShieldCheck size={14} style={{ color: '#818cf8' }} />
                    Require Administrator Approval to Join
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    When enabled, users opening invite links or submitting codes must be approved by an owner or admin before gaining active access.
                  </div>
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              <Info size={14} style={{ flexShrink: 0, color: '#818cf8' }} />
              <span>After creation, you will receive shareable links, invite codes, and QR codes.</span>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ flex: 1, padding: '0.75rem' }}
                onClick={() => navigate('/workspaces')}
                disabled={isLoading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 2, padding: '0.75rem' }}
                disabled={isLoading}
                id="btn-create-workspace-submit"
              >
                {isLoading ? 'Creating Workspace...' : 'Create Workspace'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateWorkspace;
