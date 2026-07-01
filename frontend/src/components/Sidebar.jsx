import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, Server, Plug, Bell, Settings,
  Users, Compass, LogOut, Activity, Cpu, Globe, DollarSign,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const NAV_TOP = [
  { to: "/dashboard",  icon: LayoutDashboard, label: "Dashboard" },
  { to: "/sysadmin",   icon: Server,           label: "Das Lab" },
  { to: "/system",     icon: Cpu,              label: "System" },
  { to: "/network",    icon: Globe,            label: "Netzwerk" },
  { to: "/costs",      icon: DollarSign,       label: "API Kosten" },
  { to: "/connectors", icon: Plug,             label: "Connectors" },
  { to: "/alerts",     icon: Bell,             label: "Alerts",        adminOnly: true },
  { to: "/settings",   icon: Settings,         label: "Einstellungen", adminOnly: true },
];

const NAV_BOTTOM = [
  { to: "/users",   icon: Users,   label: "Benutzer",        adminOnly: true },
  { to: "/wizard",  icon: Compass, label: "Setup-Assistent", adminOnly: true },
];

/* Lab sub-routes – used to highlight "Das Lab" group visually */
const LAB_ROUTES = ["/sysadmin", "/system", "/network", "/costs"];

export default function Sidebar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const filterItems = (items) => items.filter((i) => !i.adminOnly || isAdmin);

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  const initial    = user?.username?.charAt(0)?.toUpperCase() ?? "?";
  const inLabGroup = LAB_ROUTES.some(r => location.pathname.startsWith(r));

  return (
    <aside
      className="glass-sidebar flex flex-col items-center py-3 gap-0.5"
      style={{ width: "56px", flexShrink: 0 }}
    >
      {/* Logo icon */}
      <div
        className="flex items-center justify-center rounded-xl mb-3"
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

      {/* Top navigation */}
      <nav className="flex flex-col items-center gap-0 w-full px-2">
        {filterItems(NAV_TOP).map(({ to, icon: Icon, label }) => {
          /* Thin divider before /connectors – separates lab sub-pages from infra */
          const showDivider = to === "/connectors";

          return (
            <div key={to} className="w-full">
              {showDivider && (
                <div style={{ height: 1, background: "rgba(255,255,255,0.07)", margin: "4px 4px" }} />
              )}
              <NavLink
                to={to}
                title={label}
                className={({ isActive }) =>
                  `nav-item w-full justify-center${isActive ? " active" : ""}`
                }
              >
                <Icon size={17} />
              </NavLink>
            </div>
          );
        })}
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
