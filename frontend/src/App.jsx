import { Routes, Route, Navigate } from "react-router-dom";
import { Activity } from "lucide-react";
import Layout from "./components/Layout";
import Dashboard from "./pages/Dashboard";
import Sysadmin from "./pages/Sysadmin";
import LabSystem from "./pages/LabSystem";
import LabNetwork from "./pages/LabNetwork";
import LabCosts from "./pages/LabCosts";
import Connectors from "./pages/Connectors";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import Alerts from "./pages/Alerts";
import License from "./pages/License";
import Login from "./pages/Login";
import Wizard from "./pages/Wizard";
import { useAuth } from "./auth/AuthContext";

function FullScreenLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="flex items-center gap-2 text-gray-500">
        <Activity className="text-accent animate-pulse" size={20} />
        <span className="text-sm">Lädt...</span>
      </div>
    </div>
  );
}

function RequireAuth({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/wizard"
        element={
          <RequireAuth adminOnly>
            <Wizard />
          </RequireAuth>
        }
      />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="sysadmin" element={<Sysadmin />} />
        <Route path="system" element={<LabSystem />} />
        <Route path="network" element={<LabNetwork />} />
        <Route path="costs" element={<LabCosts />} />
        <Route path="connectors" element={<Connectors />} />
        <Route
          path="settings"
          element={
            <RequireAuth adminOnly>
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="users"
          element={
            <RequireAuth adminOnly>
              <Users />
            </RequireAuth>
          }
        />
        <Route
          path="alerts"
          element={
            <RequireAuth adminOnly>
              <Alerts />
            </RequireAuth>
          }
        />
        <Route
          path="license"
          element={
            <RequireAuth adminOnly>
              <License />
            </RequireAuth>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
