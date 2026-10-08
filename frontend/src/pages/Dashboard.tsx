
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const Dashboard = () => {
  const { user, logout } = useAuth();
  
  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (e) {
      console.error(e);
    } finally {
      logout();
    }
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>Dashboard</h1>
          <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Welcome back, {user?.name}</p>
        </div>
        
        <button onClick={handleLogout} className="btn-secondary">
          Sign Out
        </button>
      </header>
      
      <div style={{ padding: '2rem', background: 'var(--surface)', borderRadius: '1rem', border: '1px solid var(--border)' }}>
        <h2 style={{ marginBottom: '1.5rem', fontSize: '1.25rem', color: 'var(--text-main)' }}>Your Profile</h2>
        <div style={{ display: 'grid', gap: '1rem', color: 'var(--text-muted)' }}>
          <div><strong style={{color: 'var(--text-main)'}}>ID:</strong> {user?.id}</div>
          <div><strong style={{color: 'var(--text-main)'}}>Name:</strong> {user?.name}</div>
          <div><strong style={{color: 'var(--text-main)'}}>Email:</strong> {user?.email}</div>
          <div><strong style={{color: 'var(--text-main)'}}>Role:</strong> {user?.role}</div>
        </div>
        
        <div style={{ marginTop: '3rem', padding: '1rem', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '0.5rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <h3 style={{ color: 'var(--primary)', marginBottom: '0.5rem' }}>Success!</h3>
          <p>You have successfully completed the authentication slice. Workspace integration comes next.</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
