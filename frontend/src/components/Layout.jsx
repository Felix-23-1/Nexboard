import { Outlet } from "react-router-dom";
import { useEffect } from "react";
import Sidebar from "./Sidebar";
import FloatingChat from "./FloatingChat";
import { useAuth } from "../auth/AuthContext";
import { loadBgConfig, applyBackground } from "../hooks/useBackground";

export default function Layout() {
  const { user } = useAuth();

  // Apply per-user background whenever the logged-in user changes
  useEffect(() => {
    const config = loadBgConfig(user?.username);
    applyBackground(config);
  }, [user?.username]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
      {/* Globaler KI-Assistent – auf allen Seiten verfügbar */}
      <FloatingChat />
    </div>
  );
}
