import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import FloatingChat from "./FloatingChat";

export default function Layout() {
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
