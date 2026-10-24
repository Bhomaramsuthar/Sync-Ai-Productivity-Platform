import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { BreadcrumbProvider } from './context/BreadcrumbContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Workspaces from './pages/Workspaces';
import CreateWorkspace from './pages/CreateWorkspace';
import WorkspaceDetail from './pages/WorkspaceDetail';
import ProjectsList from './pages/ProjectsList';
import CreateProject from './pages/CreateProject';
import ProjectDashboard from './pages/ProjectDashboard';
import { MeetingsDashboard } from './pages/MeetingsDashboard';
import { MeetingDetail } from './pages/MeetingDetail';
import { MeetingRoom } from './pages/MeetingRoom';
import Settings from './pages/Settings';
import { Toaster } from 'sileo';
import 'sileo/styles.css';
import './index.css';


function App() {
  return (
    <Router>
      <Toaster position="top-right" theme="light" options={{ fill: '#141822' }} />
      <AuthProvider>
        <BreadcrumbProvider>
          <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Navigate to="/workspaces" replace />} />
            <Route path="/workspaces" element={<Workspaces />} />
            <Route path="/workspaces/new" element={<CreateWorkspace />} />
            <Route path="/workspaces/:workspaceId" element={<WorkspaceDetail />} />
            <Route path="/workspaces/:workspaceId/meetings" element={<MeetingsDashboard />} />
            <Route path="/workspaces/:workspaceId/projects" element={<ProjectsList />} />
            <Route path="/workspaces/:workspaceId/projects/new" element={<CreateProject />} />
            <Route path="/projects/:projectId/*" element={<ProjectDashboard />} />
            <Route path="/meetings/:meetingId" element={<MeetingDetail />} />
            <Route path="/meetings/:meetingId/room" element={<MeetingRoom />} />
            <Route path="/settings" element={<Settings />} />
            
            {/* Catch all for authenticated users */}
            <Route path="*" element={<Navigate to="/workspaces" replace />} />
          </Route>
          
          {/* Catch all for unauthenticated users */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
        </BreadcrumbProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
