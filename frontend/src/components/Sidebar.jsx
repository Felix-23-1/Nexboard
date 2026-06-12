import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Server, Plug, Bell, Settings,
  Users, KeyRound, Compass, LogOut, Activity,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useLicense } from "../license/LicenseContext";

const NAV_TOP = [
  { to: "/dashboard",  icon: LayoutDashboard, label: "Dashboard" },
  { to: "/sysadmin",   icon: Server,           label: "Das Lab" },
  { to: "/connectors", icon: Plug,              label: "Connectors" },
  { to: "/alerts",     icon: Bell,              label: "Alerts",        adminOnly: true },
  { to: "/settings",   icon: Settings,          label: "Einstellungen", adminOnly: true },
];

const NAV_BOTTOM = [
  { to: "/users",   icon: Users,    label: "Benutzer",        adminOnly: true },
  { to: "/license", icon: KeyRound, label: "Lizenz",          adminOnly: true },
  { to: "/wizard",  icon: Compass,  label: "Setup-Assistent", adminOnly: true },
];

export default function Sidebar() {
  const { user, isAdmin, logout } = useAuth();
  const { isPro } = useLicense();
  const navigate = useNavigate();

  const filterItems = (items) => items.filter((i) => !i.adminOnly || isAdmin);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const initial = user?.username?.charAt(0)?.toUpperCase() ?? "?";

  return (
    <aside
      className="glass-sidebar flex flex-col items-center py-3 gap-0.5"
      style={{ width: "56px", flexShrink: 0 }}
    >
      {/* Logo icon */}
      <div
        className="flex items-center justify-center rounded-xl mb-1"
        style={{
          width: 36, height: 36,
          background: "rgba(245,158,11,0.18)",
          border: "1px solid rgba(245,158,11,0.32)",
          color: "#FCD34D",
        }}
        title="Nexboard"
      >
        <Activity size={17} />
      </div>

      {/* Pro / Free badge */}
      <div
        className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded mb-2"
        style={
          isPro
            ? {
                background: "rgba(245,158,11,0.16)",
                color: "#FCD34D",
                border: "1px solid rgba(245,158,11,0.3)",
              }
            : {
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.28)",
                border: "1px solid rgba(255,255,255,0.1)",
              }
        }
      >
        {isPro ? "Pro" : "Free"}
      </div>

      {/* Top navigation */}
      <nav className="flex flex-col items-center gap-0.5 w-full px-2">
        {filterItems(NAV_TOP).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `nav-item w-full justify-center${isActive ? " active" : ""}`
            }
          >
            <Icon size={17} />
          </NavLink>
        ))}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom navigation */}
      <nav className="flex flex-col items-center gap-0.5 w-full px-2">
        {filterItems(NAV_BOTTOM).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `nav-item w-full justify-center${isActive ? " active" : ""}`
            }
          >
            <Icon size={17} />
          </NavLink>
        ))}
      </nav>

      {/* Divider */}
      <div
        className="w-8 my-1"
        style={{ height: 1, background: "rgba(255,255,255,0.08)" }}
      />

      {/* User avatar */}
      {user && (
        <div
          className="flex items-center justify-center rounded-full text-[11px] font-semibold cursor-default mb-0.5"
          style={{
            width: 30, height: 30,
            background: "rgba(245,158,11,0.16)",
            border: "1px solid rgba(245,158,11,0.28)",
            color: "#FCD34D",
          }}
          title={`${user.username} · ${user.role === "admin" ? "Admin" : "Viewer"}`}
        >
          {initial}
        </div>
      )}

      {/* Logout */}
      <button
        onClick={handleLogout}
        title="Abmelden"
        className="nav-item w-10 justify-center"
      >
        <LogOut size={15} />
      </button>
    </aside>
  );
}
