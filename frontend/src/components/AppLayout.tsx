import React, { useMemo } from 'react';
import { Outlet, NavLink, useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useBreadcrumbs, type BreadcrumbItem } from '../context/BreadcrumbContext';
import { Briefcase, LogOut, Sparkles, ChevronRight, Home } from 'lucide-react';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { breadcrumbs, getWorkspaceName, getProjectName } = useBreadcrumbs();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Compute fallback breadcrumbs if current page has not set explicit breadcrumbs
  const activeBreadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    if (breadcrumbs.length > 0) return breadcrumbs;

    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length === 0 || parts[0] === 'dashboard' || parts[0] === 'workspaces') {
      if (parts[1] === 'new') {
        return [
          { label: 'Workspaces', path: '/workspaces' },
          { label: 'New Workspace' },
        ];
      }
      if (parts[1]) {
        const wsId = parts[1];
        const wsName = getWorkspaceName(wsId) || 'Workspace';
        if (parts[2] === 'projects') {
          return [
            { label: 'Workspaces', path: '/workspaces' },
            { label: wsName, path: `/workspaces/${wsId}` },
            { label: parts[3] === 'new' ? 'New Project' : 'Projects' },
          ];
        }
        if (parts[2] === 'meetings') {
          return [
            { label: 'Workspaces', path: '/workspaces' },
            { label: wsName, path: `/workspaces/${wsId}` },
            { label: 'Meetings' },
          ];
        }
        return [
          { label: 'Workspaces', path: '/workspaces' },
          { label: wsName },
        ];
      }
      return [{ label: 'Workspaces', path: '/workspaces' }];
    }

    if (parts[0] === 'projects' && parts[1]) {
      const projId = parts[1];
      const projName = getProjectName(projId) || 'Project';
      const section = parts[2] ? parts[2].charAt(0).toUpperCase() + parts[2].slice(1) : 'Overview';
      return [
        { label: 'Workspaces', path: '/workspaces' },
        { label: projName, path: `/projects/${projId}` },
        { label: section },
      ];
    }

    if (parts[0] === 'meetings' && parts[1]) {
      return [
        { label: 'Workspaces', path: '/workspaces' },
        { label: 'Meetings' },
        { label: parts[2] === 'room' ? 'Live Room' : 'Meeting Details' },
      ];
    }

    return [{ label: parts[0].charAt(0).toUpperCase() + parts[0].slice(1) }];
  }, [breadcrumbs, location.pathname, getWorkspaceName, getProjectName]);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="app-sidebar">
        {/* Brand Header */}
        <div className="app-sidebar-header">
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.45)',
              }}
            >
              <Sparkles size={18} />
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
                Sync AI
              </div>
              <div style={{ fontSize: '0.68rem', color: '#71717a', fontWeight: 500 }}>
                Productivity OS
              </div>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="app-sidebar-content">
          <NavLink
            to="/workspaces"
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive || location.pathname.startsWith('/projects') || location.pathname.startsWith('/meetings') ? 'active' : ''}`
            }
            id="nav-workspaces"
          >
            <Briefcase size={17} />
            <span>Workspaces</span>
          </NavLink>
        </div>

        {/* User Footer Profile */}
        <div className="app-sidebar-footer">
          <div
            style={{
              padding: '0.65rem 0.75rem',
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              marginBottom: '0.65rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.65rem',
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#fafafa', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.name || 'User'}
              </div>
              <div style={{ fontSize: '0.68rem', color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.email || ''}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="sidebar-nav-item w-full bg-transparent border-none"
            style={{ padding: '0.45rem 0.75rem', color: '#f87171' }}
            id="nav-logout-btn"
          >
            <LogOut size={15} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="app-main">
        <header className="app-header">
          {/* Breadcrumb Hierarchy */}
          <nav className="header-breadcrumbs" aria-label="Breadcrumb">
            <Link
              to="/workspaces"
              className="breadcrumb-root-icon"
              title="Workspaces Root"
            >
              <Home size={13} />
            </Link>

            {activeBreadcrumbs.map((crumb, idx) => {
              const isLast = idx === activeBreadcrumbs.length - 1;
              return (
                <React.Fragment key={idx}>
                  <ChevronRight size={13} className="breadcrumb-separator" />
                  {isLast || !crumb.path ? (
                    <span
                      className={`breadcrumb-item current ${isLast ? 'active' : ''}`}
                      title={crumb.label}
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      to={crumb.path}
                      className="breadcrumb-item link"
                      title={crumb.label}
                    >
                      {crumb.label}
                    </Link>
                  )}
                </React.Fragment>
              );
            })}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              onClick={() => navigate('/workspaces')}
              className="btn btn-secondary btn-sm"
              style={{ fontSize: '0.75rem', padding: '0.35rem 0.75rem' }}
              title="Return to Workspaces Overview"
            >
              <Briefcase size={13} />
              <span>Workspaces</span>
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
