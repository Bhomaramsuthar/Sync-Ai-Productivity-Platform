import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Workspaces from './pages/Workspaces';
import CreateWorkspace from './pages/CreateWorkspace';
import WorkspaceDetail from './pages/WorkspaceDetail';
import './index.css';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<Navigate to="/workspaces" replace />} />
            <Route path="/workspaces" element={<Workspaces />} />
            <Route path="/workspaces/new" element={<CreateWorkspace />} />
            <Route path="/workspaces/:workspaceId" element={<WorkspaceDetail />} />
            
            {/* Catch all for authenticated users */}
            <Route path="*" element={<Navigate to="/workspaces" replace />} />
          </Route>
          
          {/* Catch all for unauthenticated users */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
