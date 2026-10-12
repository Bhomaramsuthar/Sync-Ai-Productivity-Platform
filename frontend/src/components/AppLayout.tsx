import React from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutDashboard, Briefcase, LogOut, Settings } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="app-sidebar-header">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-8 h-8 rounded-md" style={{ backgroundColor: 'var(--accent-primary)', color: 'white' }}>
              <LayoutDashboard size={18} />
            </div>
            <span>Platform</span>
          </div>
        </div>

        <div className="app-sidebar-content">
          <NavLink 
            to="/workspaces" 
            className={({ isActive }) => `sidebar-nav-item ${isActive || location.pathname.startsWith('/projects') ? 'active' : ''}`}
          >
            <Briefcase size={18} />
            <span>Workspaces</span>
          </NavLink>
        </div>

        <div className="app-sidebar-footer">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-surface border border-strong font-medium text-sm">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-primary truncate">{user?.name}</span>
                <span className="text-xs text-muted truncate">{user?.email}</span>
              </div>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            className="sidebar-nav-item w-full bg-transparent border-none"
            style={{ paddingLeft: 'var(--space-2)' }}
          >
            <LogOut size={18} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="app-main">
        <header className="app-header">
          <div className="flex items-center gap-2 text-sm text-muted">
            {/* Breadcrumb could go here */}
            <span>Platform</span>
            <span>/</span>
            <span className="text-primary font-medium">{location.pathname.split('/')[1]?.charAt(0).toUpperCase() + location.pathname.split('/')[1]?.slice(1) || 'Dashboard'}</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-icon btn-ghost">
              <Settings size={20} />
            </button>
          </div>
        </header>

        <div className="app-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
