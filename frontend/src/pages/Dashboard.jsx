/**
 * Dashboard – Gesamtübersicht mit:
 *  • Stat-Kacheln (Gesamt / Online / Warnung / Offline / VMs laufend)
 *  • Modularer, per Drag-and-Drop sortierbarer Connector-Grid
 *  • Widget-Reihenfolge wird in localStorage gespeichert
 */
import { useEffect, useRef, useState } from "react";
import {
  RefreshCw, Plug, Server, Box, Activity, HardDrive,
  Network, Wifi, Settings, GripVertical, Link as LinkIcon,
  CheckCircle, AlertTriangle, XCircle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import ConnectorIcon from "../components/ConnectorIcon";

/* ── Hilfsfunktionen ─────────────────────────────────────────────── */
const STATUS_DOT = {
  online:   "#34d399",
  warning:  "#fbbf24",
  offline:  "#f87171",
  critical: "#f87171",
  error:    "#f87171",
  unknown:  "rgba(255,255,255,0.25)",
};
const TYPE_ICON = {
  proxmox:        "server",
  docker:         "box",
  uptime_kuma:    "activity",
  truenas:        "hard-drive",
  unifi:          "network",
  synology:       "hard-drive",
  pfsense:        "network",
  hetzner:        "cloud",
  proxmox_backup: "archive",
  cloudflare:     "shield",
  grafana:        "bar-chart-2",
  linux_ssh:      "terminal",
  netcup:         "server",
};
const TYPE_LABEL = {
  proxmox:        "Proxmox VE",
  docker:         "Docker",
  uptime_kuma:    "Uptime Kuma",
  truenas:        "TrueNAS",
  unifi:          "UniFi",
  synology:       "Synology NAS",
  pfsense:        "pfSense",
  hetzner:        "Hetzner Cloud",
  proxmox_backup: "Proxmox Backup",
  cloudflare:     "Cloudflare",
  grafana:        "Grafana",
  linux_ssh:      "Linux Server",
  netcup:         "Netcup",
};

function fmt(n) { return n != null ? String(n) : "–"; }
function fmtBytes(b) {
  if (!b) return "–";
  const gb = b / 1073741824;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(b / 1048576).toFixed(0)} MB`;
}

/** Zeigt die wichtigsten Metriken eines Connectors kompakt an */
function ConnectorPreview({ type, metrics: m }) {
  if (!m) return null;
  const row = (label, value, accent = false) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
      <span style={{ fontSize: 11, color: "var(--text-3)" }}>{label}</span>
      <span style={{ fontSize: 11.5, fontWeight: 500, color: accent ? "var(--accent-light)" : "var(--text-2)" }}>
        {value}
      </span>
    </div>
  );

  if (type === "proxmox") {
    const nodes = m.nodes ?? [];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Nodes", fmt(nodes.length))}
        {row("VMs gesamt", fmt(m.vms_total))}
        {row("VMs laufen", fmt(m.vms_running), true)}
        {nodes[0] && row("CPU (Node 1)", `${fmt(nodes[0].cpu)} %`)}
      </div>
    );
  }
  if (type === "docker") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Container", fmt(m.total))}
        {row("Laufend", fmt(m.running), true)}
        {row("Beendet", fmt(m.exited))}
        {m.unhealthy > 0 && row("Ungesund", fmt(m.unhealthy))}
      </div>
    );
  }
  if (type === "uptime_kuma") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Monitore", fmt(m.total))}
        {row("Up", fmt(m.up), true)}
        {row("Down", fmt(m.down))}
      </div>
    );
  }
  if (type === "truenas") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Pools", fmt(m.pools_total))}
        {m.pools_degraded > 0 && row("Degradiert", fmt(m.pools_degraded))}
        {row("Disks", fmt(m.disks_total))}
      </div>
    );
  }
  if (type === "unifi") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Geräte", fmt(m.devices_total))}
        {row("Clients", fmt(m.clients_total), true)}
        {m.devices_disconnected > 0 && row("Offline", fmt(m.devices_disconnected))}
      </div>
    );
  }
  if (type === "synology") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Volumes", fmt(m.volumes_total))}
        {row("Modell", m.model ?? "–")}
      </div>
    );
  }
  if (type === "pfsense") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("CPU", `${m.cpu_usage ?? "–"} %`)}
        {row("RAM", `${m.mem_usage ?? "–"} %`)}
        {row("Gateways", fmt(m.gateways_total))}
      </div>
    );
  }
  if (type === "hetzner") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Server", fmt(m.servers_total))}
        {row("Laufen", fmt(m.servers_running), true)}
        {row("Gestoppt", fmt(m.servers_stopped))}
        {row("Volumes", fmt(m.volumes_total))}
      </div>
    );
  }
  if (type === "proxmox_backup") {
    const ds = m.datastores?.[0];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Datastores", fmt(m.datastores_total))}
        {ds && row("Auslastung", `${ds.used_pct ?? "–"} %`, ds.used_pct > 80)}
      </div>
    );
  }
  if (type === "cloudflare") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Zones aktiv", fmt(m.zones_active))}
        {m.tunnels_total > 0 && row("Tunnel", `${m.tunnels_healthy}/${m.tunnels_total}`, true)}
      </div>
    );
  }
  if (type === "grafana") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Dashboards", fmt(m.dashboards_total))}
        {row("Datasources", fmt(m.datasources_total))}
        {m.alerts_firing > 0 && row("Alerts", fmt(m.alerts_firing), true)}
      </div>
    );
  }
  if (type === "linux_ssh") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("CPU", `${m.cpu_pct ?? "–"} %`, m.cpu_pct > 80)}
        {row("RAM", `${m.mem_pct ?? "–"} %`, m.mem_pct > 80)}
        {row("Disk", `${m.disk_pct ?? "–"} %`, m.disk_pct > 85)}
        {row("Load", fmt(m.load1))}
      </div>
    );
  }
  if (type === "netcup") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {row("Server", fmt(m.servers_total))}
        {row("Laufen", fmt(m.servers_running), true)}
        {row("Gestoppt", fmt(m.servers_stopped))}
      </div>
    );
  }
  return null;
}

/* ── Stat-Kachel ─────────────────────────────────────────────────── */
function StatTile({ label, value, color, icon: Icon, sub }) {
  return (
    <div style={{
      flex: "1 1 0",
      minWidth: 90,
      background: "rgba(255,255,255,0.055)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 14,
      padding: "14px 16px",
      display: "flex",
      flexDirection: "column",
      gap: 6,
      transition: "border-color 0.2s",
    }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(245,158,11,0.22)")}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)")}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-3)" }}>
          {label}
        </span>
        {Icon && <Icon size={14} style={{ color: color ?? "var(--text-3)", opacity: 0.7 }} />}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? "var(--text-1)", lineHeight: 1, letterSpacing: "-0.02em" }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10.5, color: "var(--text-3)" }}>{sub}</div>
      )}
    </div>
  );
}

/* ── Connector-Widget (draggbar) ─────────────────────────────────── */
function ConnectorWidget({ connector: c, onDragStart, onDragOver, onDrop, dragging }) {
  const dotColor = STATUS_DOT[c.status] ?? STATUS_DOT.unknown;
  const statusLabel = {
    online: "Online", warning: "Warnung", offline: "Offline",
    critical: "Kritisch", error: "Fehler", unknown: "Unbekannt",
  }[c.status] ?? "Unbekannt";
  const badgeClass = {
    online: "badge-ok", warning: "badge-warn",
    offline: "badge-off", critical: "badge-off", error: "badge-off",
  }[c.status] ?? "badge-neutral";

  return (
    <div
      draggable
      onDragStart={() => onDragStart(c.id)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(c.id); }}
      onDrop={() => onDrop(c.id)}
      style={{
        background: "rgba(255,255,255,0.05)",
        border: `1px solid ${dragging ? "rgba(245,158,11,0.30)" : "rgba(255,255,255,0.09)"}`,
        borderRadius: 16,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        cursor: "default",
        opacity: dragging ? 0.55 : 1,
        transition: "border-color 0.2s, opacity 0.15s, box-shadow 0.2s",
        boxShadow: dragging ? "0 0 0 2px rgba(245,158,11,0.18)" : "none",
      }}
      onMouseEnter={(e) => { if (!dragging) e.currentTarget.style.borderColor = "rgba(245,158,11,0.18)"; }}
      onMouseLeave={(e) => { if (!dragging) e.currentTarget.style.borderColor = "rgba(255,255,255,0.09)"; }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Drag-Handle */}
        <div
          draggable={false}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ cursor: "grab", color: "rgba(255,255,255,0.18)", flexShrink: 0, paddingTop: 1 }}
          title="Ziehen um Widget zu verschieben"
        >
          <GripVertical size={14} />
        </div>

        <div style={{
          width: 34, height: 34, borderRadius: 9,
          background: "rgba(255,255,255,0.07)",
          border: "1px solid rgba(255,255,255,0.09)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, color: "rgba(255,255,255,0.5)",
        }}>
          <ConnectorIcon icon={TYPE_ICON[c.type] ?? "settings"} size={16} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 1 }}>
            {TYPE_LABEL[c.type] ?? c.type}
          </div>
        </div>

        {/* Status */}
        <span className={badgeClass} style={{ flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block", marginRight: 4 }} />
          {statusLabel}
        </span>
      </div>

      {/* Error */}
      {c.error && (
        <div style={{
          fontSize: 11, color: "#f87171",
          background: "rgba(248,113,113,0.07)",
          border: "1px solid rgba(248,113,113,0.14)",
          borderRadius: 8, padding: "6px 10px",
        }}>
          {c.error}
        </div>
      )}

      {/* Metriken Preview */}
      {c.metrics && Object.keys(c.metrics).length > 0 && (
        <div style={{
          background: "rgba(0,0,0,0.18)",
          border: "1px solid rgba(255,255,255,0.055)",
          borderRadius: 10,
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}>
          <ConnectorPreview type={c.type} metrics={c.metrics} />
        </div>
      )}

      {/* Link zur IT-Ansicht */}
      <Link
        to="/sysadmin"
        style={{
          display: "flex", alignItems: "center", gap: 5,
          fontSize: 11, color: "rgba(245,158,11,0.6)",
          textDecoration: "none", marginTop: "auto",
          transition: "color 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "#F59E0B")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(245,158,11,0.6)")}
      >
        <LinkIcon size={10} /> Details in IT-Ansicht
      </Link>
    </div>
  );
}

/* ── Dashboard ───────────────────────────────────────────────────── */
export default function Dashboard() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(null);
  const [widgetOrder, setWidgetOrder] = useState(null); // null = natural order
  const dragId = useRef(null);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const d = await api.status.detailed();
      setData(d);
      // Reihenfolge aus localStorage laden (nur einmal beim ersten Laden)
      if (!widgetOrder) {
        const saved = localStorage.getItem("nb_widget_order");
        if (saved) {
          try { setWidgetOrder(JSON.parse(saved)); } catch (_) {}
        }
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 30000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Drag-and-Drop Reihenfolge ─────────────────────────────────── */
  function handleDragStart(id) { dragId.current = id; }

  function handleDragOver(targetId) {
    if (!dragId.current || dragId.current === targetId) return;
    const connectors = sortedConnectors();
    const from = connectors.findIndex((c) => c.id === dragId.current);
    const to   = connectors.findIndex((c) => c.id === targetId);
    if (from === -1 || to === -1) return;
    const newOrder = connectors.map((c) => c.id);
    newOrder.splice(from, 1);
    newOrder.splice(to, 0, dragId.current);
    setWidgetOrder(newOrder);
    localStorage.setItem("nb_widget_order", JSON.stringify(newOrder));
  }

  function handleDrop() { dragId.current = null; }

  function sortedConnectors() {
    const connectors = data?.connectors ?? [];
    if (!widgetOrder) return connectors;
    const map = Object.fromEntries(connectors.map((c) => [c.id, c]));
    const sorted = widgetOrder.map((id) => map[id]).filter(Boolean);
    // Neue Connectors (nicht in widgetOrder) ans Ende
    connectors.forEach((c) => { if (!widgetOrder.includes(c.id)) sorted.push(c); });
    return sorted;
  }

  /* ── Stat-Berechnungen ─────────────────────────────────────────── */
  function calcStats() {
    const connectors = data?.connectors ?? [];
    const total   = connectors.length;
    const online  = connectors.filter((c) => c.status === "online").length;
    const warning = connectors.filter((c) => c.status === "warning").length;
    const offline = connectors.filter((c) => ["offline","error","critical"].includes(c.status)).length;
    const vmsRunning = connectors
      .filter((c) => c.type === "proxmox")
      .reduce((s, c) => s + (c.metrics?.vms_running ?? 0), 0);
    const vmsTotal = connectors
      .filter((c) => c.type === "proxmox")
      .reduce((s, c) => s + (c.metrics?.vms_total ?? 0), 0);
    const containersRunning = connectors
      .filter((c) => c.type === "docker")
      .reduce((s, c) => s + (c.metrics?.running ?? 0), 0);
    const hasProxmox = connectors.some((c) => c.type === "proxmox");
    const hasDocker  = connectors.some((c) => c.type === "docker");
    return { total, online, warning, offline, vmsRunning, vmsTotal, containersRunning, hasProxmox, hasDocker };
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span style={{ fontSize: 13, color: "var(--text-3)" }}>Lade Dashboard…</span>
    </div>
  );

  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>Backend nicht erreichbar</p>
        <p style={{ color: "var(--text-3)", fontSize: 11 }}>{error}</p>
        <button onClick={() => load()} className="btn-primary" style={{ marginTop: 16, fontSize: 13 }}>
          Erneut versuchen
        </button>
      </div>
    </div>
  );

  const stats = calcStats();
  const connectors = sortedConnectors();
  const overall = stats.offline > 0 ? "offline" : stats.warning > 0 ? "warning" : "online";
  const BannerIcon = overall === "online" ? CheckCircle : overall === "warning" ? AlertTriangle : XCircle;
  const bannerColor = overall === "online" ? "#34d399" : overall === "warning" ? "#fbbf24" : "#f87171";

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: 20, gap: 20 }}>

      {/* ── Topbar ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-sub">Gesamtübersicht deiner Infrastruktur</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Overall status chip */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "5px 12px", borderRadius: 20,
            background: `${bannerColor}14`,
            border: `1px solid ${bannerColor}28`,
            fontSize: 11.5, fontWeight: 500, color: bannerColor,
          }}>
            <BannerIcon size={12} />
            {overall === "online" ? "Alles in Ordnung" : overall === "warning" ? "Warnung" : "Kritisch"}
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "6px 14px" }}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Aktualisieren
          </button>
        </div>
      </div>

      {/* ── Stat-Kacheln ────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <StatTile
          label="Connectors"
          value={stats.total}
          icon={Plug}
          sub="konfiguriert"
        />
        <StatTile
          label="Online"
          value={stats.online}
          color="#34d399"
          icon={CheckCircle}
          sub={stats.total > 0 ? `${Math.round((stats.online / stats.total) * 100)} %` : "–"}
        />
        <StatTile
          label="Warnung"
          value={stats.warning}
          color={stats.warning > 0 ? "#fbbf24" : "var(--text-3)"}
          icon={AlertTriangle}
        />
        <StatTile
          label="Offline"
          value={stats.offline}
          color={stats.offline > 0 ? "#f87171" : "var(--text-3)"}
          icon={XCircle}
        />
        {stats.hasProxmox && (
          <StatTile
            label="VMs laufen"
            value={stats.vmsRunning}
            color="var(--accent-light)"
            icon={Server}
            sub={`von ${stats.vmsTotal} gesamt`}
          />
        )}
        {stats.hasDocker && (
          <StatTile
            label="Container"
            value={stats.containersRunning}
            color="#60a5fa"
            icon={Box}
            sub="laufend"
          />
        )}
      </div>

      {/* ── Widget-Grid ─────────────────────────────────────────── */}
      {connectors.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <Plug size={36} style={{ color: "rgba(255,255,255,0.12)", margin: "0 auto 12px" }} />
          <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 16 }}>
            Noch keine Connectors konfiguriert.
          </p>
          <Link to="/connectors" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
            <Plug size={13} /> Ersten Connector hinzufügen
          </Link>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="section-label" style={{ marginBottom: 0 }}>
              Connectors
            </span>
            <span style={{ fontSize: 10.5, color: "var(--text-3)" }}>
              Widgets per Drag &amp; Drop verschieben
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 14,
            }}
            onDragEnd={handleDrop}
          >
            {connectors.map((c) => (
              <ConnectorWidget
                key={c.id}
                connector={c}
                dragging={dragId.current === c.id}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
