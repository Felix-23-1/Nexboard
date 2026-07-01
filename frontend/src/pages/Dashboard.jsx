/**
 * Dashboard – Clock-Hero · Stat-Pills · Service-Gruppen · EventFeed
 * Two-column layout: service grid left, fleet event feed right.
 */
import { useEffect, useState } from "react";
import { RefreshCw, Plug, Search, AlertTriangle, CheckCircle, X, HardDrive, Lock, GripVertical, Eye, EyeOff, LayoutGrid } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import ConnectorIcon from "../components/ConnectorIcon";

/* ── Connector config ────────────────────────────────────────── */
const TYPE_CFG = {
  proxmox:        { label: "Proxmox VE",        color: "#E57C00", icon: "server",       group: "Virtualisierung & Cloud" },
  proxmox_backup: { label: "Proxmox Backup",     color: "#B45309", icon: "archive",      group: "Virtualisierung & Cloud" },
  hetzner:        { label: "Hetzner Cloud",      color: "#D50C2D", icon: "cloud",        group: "Virtualisierung & Cloud" },
  netcup:         { label: "Netcup",             color: "#C00E0E", icon: "server",       group: "Virtualisierung & Cloud" },
  docker:         { label: "Docker",             color: "#2496ED", icon: "box",          group: "Container" },
  unifi:          { label: "UniFi",              color: "#0559C9", icon: "network",      group: "Netzwerk & Sicherheit" },
  pfsense:        { label: "pfSense",            color: "#E04C00", icon: "network",      group: "Netzwerk & Sicherheit" },
  cloudflare:     { label: "Cloudflare",         color: "#F48120", icon: "shield",       group: "Netzwerk & Sicherheit" },
  tls_monitor:    { label: "TLS-Zertifikat",     color: "#0E9E6E", icon: "lock",         group: "Netzwerk & Sicherheit" },
  wol:            { label: "Wake-on-LAN",        color: "#7B5EA7", icon: "zap",          group: "Netzwerk & Sicherheit" },
  uptime_kuma:    { label: "Uptime Kuma",        color: "#5CDD8B", icon: "activity",     group: "Monitoring" },
  grafana:        { label: "Grafana",            color: "#F46800", icon: "bar-chart-2",  group: "Monitoring" },
  truenas:        { label: "TrueNAS",            color: "#0095D5", icon: "hard-drive",   group: "Speicher" },
  synology:       { label: "Synology NAS",       color: "#B8BFCA", icon: "hard-drive",   group: "Speicher" },
  linux_ssh:      { label: "Linux Server",       color: "#27B43E", icon: "terminal",     group: "Server" },
  linux_probe:    { label: "Linux Full-Probe",   color: "#10B981", icon: "cpu",          group: "Server" },
  ai_models:      { label: "AI Model Server",    color: "#8B5CF6", icon: "brain",        group: "Server" },
  bookmarks:      { label: "Lesezeichen",        color: "#F59E0B", icon: "bookmark",     group: "Lesezeichen" },
};

const GROUP_ORDER = [
  "Virtualisierung & Cloud",
  "Container",
  "Netzwerk & Sicherheit",
  "Monitoring",
  "Speicher",
  "Server",
  "Lesezeichen",
];

const STATUS_COLOR = {
  online:   "#34d399",
  warning:  "#fbbf24",
  offline:  "#f87171",
  critical: "#f87171",
  error:    "#f87171",
  unknown:  "rgba(255,255,255,0.25)",
};
const STATUS_LABEL = {
  online:   "Online",
  warning:  "Warnung",
  offline:  "Offline",
  critical: "Kritisch",
  error:    "Fehler",
  unknown:  "Unbekannt",
};

/* ── Key metrics per type ─────────────────────────────────────── */
function getMetrics(type, m) {
  if (!m) return [];
  const kv = (l, v) => ({ label: l, value: String(v ?? "–") });
  switch (type) {
    case "proxmox":        return [kv("VMs", `${m.vms_running ?? 0}/${m.vms_total ?? 0}`), kv("Nodes", m.nodes?.length ?? 0)];
    case "docker":         return [kv("Container", `${m.running ?? 0}/${m.total ?? 0}`), ...(m.unhealthy > 0 ? [kv("Ungesund", m.unhealthy)] : [])];
    case "uptime_kuma":    return [kv("Up", m.up ?? 0), kv("Down", m.down ?? 0), kv("Gesamt", m.total ?? 0)];
    case "truenas":        return [kv("Pools", m.pools_total ?? 0), kv("Disks", m.disks_total ?? 0)];
    case "unifi":          return [kv("Geräte", m.devices_total ?? 0), kv("Clients", m.clients_total ?? 0)];
    case "synology":       return [kv("Volumes", m.volumes_total ?? 0), kv("Modell", m.model ?? "–")];
    case "pfsense":        return [kv("CPU", `${m.cpu_usage ?? "–"}%`), kv("RAM", `${m.mem_usage ?? "–"}%`), kv("Gateways", m.gateways_total ?? 0)];
    case "hetzner":        return [kv("Server", `${m.servers_running ?? 0}/${m.servers_total ?? 0}`), kv("Volumes", m.volumes_total ?? 0)];
    case "proxmox_backup": return [kv("Datastores", m.datastores_total ?? 0)];
    case "cloudflare":     return [kv("Zones", m.zones_active ?? 0), ...(m.tunnels_total > 0 ? [kv("Tunnel", `${m.tunnels_healthy ?? 0}/${m.tunnels_total}`)] : [])];
    case "grafana":        return [kv("Dashboards", m.dashboards_total ?? 0), kv("Sources", m.datasources_total ?? 0), ...(m.alerts_firing > 0 ? [kv("Alerts", m.alerts_firing)] : [])];
    case "linux_ssh":      return [kv("CPU", `${m.cpu_pct ?? "–"}%`), kv("RAM", `${m.mem_pct ?? "–"}%`), kv("Disk", `${m.disk_pct ?? "–"}%`)];
    case "linux_probe":    return [
      kv("CPU", `${m.cpu_pct ?? "–"}%`),
      kv("RAM", `${m.mem_pct ?? "–"}%`),
      ...(m.gpu?.available ? [kv("VRAM", `${Math.round((m.gpu.total_vram_used_mb ?? 0) / 1024 * 10) / 10}GB`)] : []),
      ...(m.systemd?.failed_count > 0 ? [kv("Failed", m.systemd.failed_count)] : []),
    ];
    case "ai_models":      return [kv("Geladen", m.models_loaded_count ?? 0), kv("Verfügbar", m.models_available ?? 0), kv("Server", m.server_type ?? "–")];
    case "bookmarks":      return [kv("Links", m.link_count ?? 0)];
    case "netcup":         return [kv("Server", `${m.servers_running ?? 0}/${m.servers_total ?? 0}`)];
    case "wol":            return [kv("Status", m.online ? "Online" : "Offline"), kv("Host", m.host ?? "–")];
    case "tls_monitor":    return [kv("Tage", m.days_until_expiry ?? "–"), kv("Domain", m.host ?? "–")];
    default:               return [];
  }
}

/* ── Live clock ──────────────────────────────────────────────── */
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  return now;
}

const DAYS   = ["Sonntag","Montag","Dienstag","Mittwoch","Donnerstag","Freitag","Samstag"];
const MONTHS = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
const pad    = n => String(n).padStart(2, "0");

/* ── Service Tile ─────────────────────────────────────────────── */
function ServiceTile({ connector: c }) {
  const cfg         = TYPE_CFG[c.type] ?? { label: c.type, color: "rgba(255,255,255,0.3)", icon: "settings", group: "Sonstiges" };
  const dotColor    = STATUS_COLOR[c.status] ?? STATUS_COLOR.unknown;
  const statusLabel = STATUS_LABEL[c.status]  ?? "Unbekannt";
  const metrics     = getMetrics(c.type, c.metrics);

  return (
    <div
      style={{
        background: "rgba(255,255,255,0.055)",
        backdropFilter: "blur(24px) saturate(160%)",
        WebkitBackdropFilter: "blur(24px) saturate(160%)",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07)",
        borderRadius: 16,
        padding: "16px",
        display: "flex",
        flexDirection: "column",
        gap: 12,
        transition: "background 0.18s, border-color 0.18s, box-shadow 0.18s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background  = "rgba(255,255,255,0.075)";
        e.currentTarget.style.borderColor = `${cfg.color}40`;
        e.currentTarget.style.boxShadow   = `0 8px 32px rgba(0,0,0,0.30), 0 0 20px ${cfg.color}12, inset 0 1px 0 rgba(255,255,255,0.10)`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background  = "rgba(255,255,255,0.055)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
        e.currentTarget.style.boxShadow   = "0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 42, height: 42, borderRadius: 11, flexShrink: 0,
          background: `${cfg.color}1C`, border: `1px solid ${cfg.color}38`,
          display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color,
        }}>
          <ConnectorIcon icon={cfg.icon} size={20} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {c.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>{cfg.label}</div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "3px 9px", borderRadius: 20, flexShrink: 0,
          background: `${dotColor}14`, border: `1px solid ${dotColor}28`,
          fontSize: 10.5, fontWeight: 500, color: dotColor,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", display: "inline-block", background: dotColor }} />
          {statusLabel}
        </div>
      </div>

      {c.error && (
        <div style={{ fontSize: 11, color: "#f87171", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.14)", borderRadius: 8, padding: "5px 10px" }}>
          {c.error}
        </div>
      )}

      {metrics.length > 0 && (
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.055)" }}>
          {metrics.map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}</div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Bookmark Group Tile ──────────────────────────────────────── */
function BookmarkGroupTile({ connector: c }) {
  const cfg   = TYPE_CFG.bookmarks;
  const links = c.metrics?.links ?? [];
  return (
    <div style={{
      background: "rgba(255,255,255,0.055)",
      backdropFilter: "blur(24px) saturate(160%)",
      WebkitBackdropFilter: "blur(24px) saturate(160%)",
      border: "1px solid rgba(255,255,255,0.10)",
      boxShadow: "0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07)",
      borderRadius: 16, padding: "16px",
      display: "flex", flexDirection: "column", gap: 12,
      gridColumn: links.length >= 4 ? "1 / -1" : undefined,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: `${cfg.color}1C`, border: `1px solid ${cfg.color}38`, display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color }}>
          <ConnectorIcon icon="bookmark" size={16} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{c.name}</div>
          {c.metrics?.description && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{c.metrics.description}</div>}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 }}>
        {links.map((link, i) => (
          <a key={i} href={link.url} target="_blank" rel="noopener noreferrer"
            style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 10px", background: "rgba(255,255,255,0.05)", borderRadius: 9, border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none", transition: "all 0.15s", color: "rgba(255,255,255,0.75)", fontSize: 12.5 }}
            title={link.description || link.url}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(245,158,11,0.10)"; e.currentTarget.style.borderColor = "rgba(245,158,11,0.28)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <ConnectorIcon icon={link.icon ?? "globe"} size={13} className="flex-shrink-0" />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.name}</span>
          </a>
        ))}
        {links.length === 0 && <span style={{ fontSize: 11.5, color: "var(--text-3)", gridColumn: "1 / -1" }}>Keine Links konfiguriert.</span>}
      </div>
    </div>
  );
}

/* ── Event Feed ──────────────────────────────────────────────── */
function buildEvents(connectors) {
  const events = [];
  const ts = new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

  for (const c of connectors) {
    const m = c.metrics ?? {};

    if (["offline", "error", "critical"].includes(c.status)) {
      events.push({ id: `offline-${c.id}`, sev: "error",   title: `${c.name} nicht erreichbar`,         body: c.error?.slice(0, 60) || "Verbindung fehlgeschlagen",       icon: "x",        color: "#f87171", ts });
    }
    if (c.status === "warning") {
      events.push({ id: `warn-${c.id}`,    sev: "warning", title: `${c.name}: Warnung`,                  body: c.error?.slice(0, 60) || "Connector meldet Warnung",         icon: "triangle", color: "#fbbf24", ts });
    }
    if (c.type === "docker" && (m.unhealthy ?? 0) > 0) {
      events.push({ id: `docker-${c.id}`,  sev: "warning", title: `${c.name}: ${m.unhealthy} ungesund`,  body: "Docker Health-Check fehlgeschlagen",                         icon: "triangle", color: "#fbbf24", ts });
    }
    if ((c.type === "linux_probe" || c.type === "linux_ssh") && (m.disk_pct ?? 0) > 88) {
      events.push({ id: `disk-${c.id}`,    sev: "warning", title: `${c.name}: Disk ${Math.round(m.disk_pct)}%`, body: "Disk-Auslastung kritisch hoch",                  icon: "hdd",      color: "#fbbf24", ts });
    }
    if ((c.type === "linux_probe" || c.type === "linux_ssh") && (m.systemd?.failed_count ?? 0) > 0) {
      events.push({ id: `svc-${c.id}`,     sev: "warning", title: `${c.name}: ${m.systemd.failed_count} Service(s) failed`, body: (m.systemd.failed_units || []).slice(0, 2).join(", ") || "systemd fehlgeschlagen", icon: "triangle", color: "#fbbf24", ts });
    }
    if (c.type === "tls_monitor" && !["offline","error","critical"].includes(c.status)) {
      const days = m.days_until_expiry ?? 999;
      if (days < 14) events.push({ id: `tls-${c.id}`, sev: days < 3 ? "error" : "warning", title: `TLS: ${m.host ?? c.name}`, body: `Läuft in ${days} Tag${days === 1 ? "" : "en"} ab`, icon: "lock", color: days < 3 ? "#f87171" : "#fbbf24", ts });
    }
    if (c.type === "uptime_kuma" && (m.down ?? 0) > 0) {
      events.push({ id: `kuma-${c.id}`,    sev: "error",   title: `${c.name}: ${m.down} Monitor down`,   body: "Uptime Kuma meldet Ausfälle",                               icon: "x",        color: "#f87171", ts });
    }
  }

  if (events.length === 0 && connectors.length > 0) {
    const online     = connectors.filter(c => c.status === "online").length;
    const containers = connectors.filter(c => c.type === "docker").reduce((s, c) => s + (c.metrics?.running ?? 0), 0);
    const vms        = connectors.filter(c => c.type === "proxmox").reduce((s, c) => s + (c.metrics?.vms_running ?? 0), 0);
    events.push({ id: "clear",    sev: "ok", title: "Fleet in guter Verfassung",      body: `${online} von ${connectors.length} Connectors online`, icon: "check", color: "#34d399", ts });
    if (containers > 0) events.push({ id: "cont-ok", sev: "ok", title: `${containers} Container aktiv`,        body: "Alle Docker-Container gesund",              icon: "check", color: "#34d399", ts });
    if (vms > 0)        events.push({ id: "vm-ok",   sev: "ok", title: `${vms} VM${vms > 1 ? "s" : ""} laufen`, body: "Proxmox-Virtualisierung aktiv",            icon: "check", color: "#34d399", ts });
  }

  return events;
}

function EventFeed({ connectors }) {
  const events      = buildEvents(connectors);
  const hasErrors   = events.some(e => e.sev === "error");
  const hasWarnings = events.some(e => e.sev === "warning");
  const headerColor = hasErrors ? "#f87171" : hasWarnings ? "#fbbf24" : "#34d399";

  function EvIcon({ icon }) {
    if (icon === "x")     return <X size={11} />;
    if (icon === "check") return <CheckCircle size={11} />;
    if (icon === "hdd")   return <HardDrive size={11} />;
    if (icon === "lock")  return <Lock size={11} />;
    return <AlertTriangle size={11} />;
  }

  return (
    <div style={{
      width: 282,
      flexShrink: 0,
      background: "rgba(255,255,255,0.032)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      alignSelf: "flex-start",
      position: "sticky",
      top: 0,
    }}>
      {/* Header */}
      <div style={{ padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: "50%", background: headerColor, boxShadow: `0 0 6px ${headerColor}`, display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", flex: 1 }}>
          Fleet Events
        </span>
        <span style={{
          background: hasErrors ? "rgba(248,113,113,0.12)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${hasErrors ? "rgba(248,113,113,0.25)" : "rgba(255,255,255,0.08)"}`,
          borderRadius: 10, padding: "1px 7px",
          fontSize: 9.5, fontWeight: 700,
          color: hasErrors ? "#f87171" : "rgba(255,255,255,0.25)",
        }}>
          {events.length}
        </span>
      </div>

      {/* Event list */}
      <div style={{ overflowY: "auto", maxHeight: "calc(100vh - 200px)" }}>
        {events.length === 0 && connectors.length === 0 && (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 11.5 }}>
            Keine Daten geladen
          </div>
        )}
        {events.map((ev, i) => (
          <div key={ev.id} style={{
            padding: "10px 16px",
            borderBottom: i < events.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
            display: "flex", gap: 10, alignItems: "flex-start",
          }}>
            <div style={{
              width: 22, height: 22, borderRadius: "50%", flexShrink: 0, marginTop: 1,
              background: `${ev.color}16`, border: `1px solid ${ev.color}28`,
              display: "flex", alignItems: "center", justifyContent: "center", color: ev.color,
            }}>
              <EvIcon icon={ev.icon} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.82)", lineHeight: 1.25 }}>{ev.title}</div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.32)", marginTop: 2.5, lineHeight: 1.3 }}>{ev.body}</div>
              <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.18)", marginTop: 3 }}>{ev.ts} Uhr</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Mini bar ─────────────────────────────────────────────────── */
function MiniBar({ value = 0, color }) {
  const pct = Math.min(100, Math.max(0, value ?? 0));
  const bc  = pct > 90 ? "#f87171" : pct > 78 ? "#fbbf24" : color;
  return (
    <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, flex: 1 }}>
      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: bc, transition: "width 0.4s ease" }} />
    </div>
  );
}

/* ── Fleet host row ──────────────────────────────────────────── */
function FleetHostRow({ connector: c, active, onClick }) {
  const m  = c.metrics ?? {};
  const sc = STATUS_COLOR[c.status] ?? "rgba(255,255,255,0.25)";
  return (
    <button onClick={onClick} style={{
      width: "100%", padding: "9px 10px", borderRadius: 9, border: "1px solid",
      borderColor: active ? "rgba(16,185,129,0.35)" : "transparent",
      background: active ? "rgba(16,185,129,0.07)" : "transparent",
      cursor: "pointer", textAlign: "left", transition: "all 0.15s",
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc, boxShadow: active ? `0 0 5px ${sc}` : "none", display: "inline-block", flexShrink: 0 }} />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: active ? "#10B981" : "rgba(255,255,255,0.72)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {c.name}
        </span>
        {m.temp_c != null && <span style={{ fontSize: 9, color: m.temp_c > 75 ? "#fbbf24" : "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace", flexShrink: 0 }}>{m.temp_c}°</span>}
      </div>
      {c.status === "online" && m.cpu_pct != null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {[
            { label: "CPU", pct: m.cpu_pct, color: "#F59E0B" },
            { label: "RAM", pct: m.mem_pct, color: "#10B981" },
            { label: "Disk", pct: m.disk_pct, color: "#6366f1" },
          ].filter(r => r.pct != null).map(row => (
            <div key={row.label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", width: 22, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(row.pct)}%</span>
              <MiniBar value={row.pct} color={row.color} />
              <span style={{ fontSize: 8, color: "rgba(255,255,255,0.15)", width: 20 }}>{row.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 9.5, color: sc }}>{STATUS_LABEL[c.status] ?? c.status}</div>
      )}
    </button>
  );
}

/* ── Fleet Panel (left sidebar) ──────────────────────────────── */
function FleetPanel({ hosts, selected, onSelect }) {
  return (
    <div style={{
      width: 196, flexShrink: 0,
      background: "rgba(255,255,255,0.032)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, overflow: "hidden",
      alignSelf: "flex-start", position: "sticky", top: 0,
    }}>
      <div style={{ padding: "9px 14px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)", flex: 1 }}>Das Lab</span>
        <span style={{ background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: "1px 6px", fontSize: 9.5, fontWeight: 600, color: "rgba(255,255,255,0.28)" }}>{hosts.length}</span>
      </div>
      <div style={{ padding: "6px", display: "flex", flexDirection: "column", gap: 2 }}>
        {hosts.map(h => (
          <FleetHostRow key={h.id} connector={h} active={h.id === selected} onClick={() => onSelect(h.id === selected ? null : h.id)} />
        ))}
      </div>
    </div>
  );
}

/* ── Inline ring gauge for dashboard ─────────────────────────── */
function DashRing({ value = 0, label, sublabel, color = "#F59E0B" }) {
  const r    = 30;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(100, Math.max(0, value || 0));
  const fill = circ * pct / 100;
  const ac   = pct > 90 ? "#f87171" : pct > 78 ? "#fbbf24" : color;
  const sz   = 82;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <div style={{ position: "relative", width: sz, height: sz }}>
        <svg width={sz} height={sz} viewBox="0 0 76 76">
          <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5.5" />
          {pct > 0 && (
            <circle cx="38" cy="38" r={r} fill="none" stroke={ac} strokeWidth="5.5"
              strokeDasharray={`${fill} ${circ - fill}`}
              strokeDashoffset={circ * 0.25}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.55s ease, stroke 0.3s ease" }}
            />
          )}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: ac, lineHeight: 1 }}>{Math.round(pct)}</span>
          <span style={{ fontSize: 7.5, color: "rgba(255,255,255,0.22)", marginTop: 1 }}>%</span>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(255,255,255,0.45)" }}>{label}</div>
        {sublabel && <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>{sublabel}</div>}
      </div>
    </div>
  );
}

/* ── Selected-host gauges bar ─────────────────────────────────── */
function HostGauges({ connector: c }) {
  const m      = c.metrics ?? {};
  const memGb  = m.mem_total != null ? `${(m.mem_total / 1e9).toFixed(0)} GB` : null;
  const diskGb = m.disk_total != null ? `${(m.disk_total / 1e9).toFixed(0)} GB` : null;
  const load1  = m.load1 != null ? m.load1.toFixed(2) : null;
  const uptime = m.uptime_s != null ? `${Math.floor(m.uptime_s / 86400)}d ${Math.floor((m.uptime_s % 86400) / 3600)}h` : null;

  // GPU: pick first
  const gpu    = m.gpu?.gpus?.[0] ?? null;
  const gpuPct = gpu ? ((gpu.vram_used_mb ?? 0) / Math.max(gpu.vram_total_mb ?? 1, 1)) * 100 : null;
  const gpuLbl = gpu?.name?.split(" ").slice(-1)[0] ?? null;

  return (
    <div style={{
      background: "rgba(255,255,255,0.038)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 14, padding: "12px 16px",
      display: "flex", alignItems: "center", gap: 16,
    }}>
      {/* Host meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--text-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</div>
        {m.os && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>{m.os}</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
          {load1 && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)" }}>Load: <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{load1}</span></span>}
          {uptime && <span style={{ fontSize: 9, color: "rgba(255,255,255,0.22)" }}>Up: {uptime}</span>}
          {m.temp_c != null && <span style={{ fontSize: 9, color: m.temp_c > 75 ? "#fbbf24" : "rgba(255,255,255,0.22)" }}>{m.temp_c}°C</span>}
          {(m.systemd?.failed_count ?? 0) > 0 && <span style={{ fontSize: 9, color: "#fbbf24" }}>{m.systemd.failed_count} svc failed</span>}
        </div>
      </div>
      {/* Rings */}
      <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
        <DashRing value={m.cpu_pct}  label="CPU"  sublabel={m.cpu_cores ? `${m.cpu_cores}c` : null} color="#F59E0B" />
        <DashRing value={m.mem_pct}  label="RAM"  sublabel={memGb} color="#10B981" />
        <DashRing value={m.disk_pct} label="Disk" sublabel={diskGb} color="#6366f1" />
        {m.gpu?.available && gpuPct != null && (
          <DashRing value={gpuPct} label="VRAM" sublabel={gpuLbl} color="#8B5CF6" />
        )}
      </div>
    </div>
  );
}

/* ── Widget layout system ──────────────────────────────────────── */
const LAYOUT_KEY = "nexboard_dashboard_layout";

const DEFAULT_LAYOUT = {
  showFleet:  true,
  showEvents: true,
  center:     ["gauges", "pills", "services"],
  hidden:     [],
};

const CENTER_DEFS = [
  { id: "gauges",   label: "Host Gauges" },
  { id: "pills",    label: "Status Pills" },
  { id: "services", label: "Suche & Services" },
];

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_LAYOUT };
}

function saveLayout(l) {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(l)); } catch {}
}

/* ── WidgetShell ─────────────────────────────────────────────── */
function WidgetShell({ id, label, editMode, hidden, onToggleHide, onDragStart, onDragOver, onDrop, isDragOver, children }) {
  if (!editMode && hidden) return null;

  return (
    <div
      draggable={editMode}
      onDragStart={editMode ? e => { e.dataTransfer.effectAllowed = "move"; onDragStart(id); } : undefined}
      onDragOver={editMode ? e => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; onDragOver(id); } : undefined}
      onDrop={editMode ? e => { e.preventDefault(); onDrop(id); } : undefined}
      style={{
        outline: isDragOver ? "2px solid rgba(245,158,11,0.55)" : "2px solid transparent",
        outlineOffset: 3,
        borderRadius: 16,
        transition: "outline 0.12s",
      }}
    >
      {/* Drag handle bar */}
      {editMode && (
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "5px 10px", marginBottom: 7,
          background: "rgba(245,158,11,0.07)",
          border: "1px solid rgba(245,158,11,0.18)",
          borderRadius: 9, cursor: "grab",
        }}>
          <GripVertical size={13} style={{ color: "rgba(245,158,11,0.55)", flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(245,158,11,0.65)", flex: 1, letterSpacing: "0.1em", textTransform: "uppercase" }}>
            {label}
          </span>
          <button
            onClick={e => { e.stopPropagation(); onToggleHide(id); }}
            style={{
              background: "none", cursor: "pointer", borderRadius: 6,
              border: `1px solid ${hidden ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.12)"}`,
              padding: "2px 8px", fontSize: 10, fontWeight: 600,
              color: hidden ? "#F59E0B" : "rgba(255,255,255,0.35)",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            {hidden ? <><Eye size={11} /> Einblenden</> : <><EyeOff size={11} /> Ausblenden</>}
          </button>
        </div>
      )}
      {/* Widget content */}
      {!hidden && (
        <div style={editMode ? { pointerEvents: "none", userSelect: "none", opacity: 0.75 } : {}}>
          {children}
        </div>
      )}
      {/* Hidden placeholder */}
      {editMode && hidden && (
        <div style={{ padding: "14px 16px", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.02)", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.07)" }}>
          Widget ausgeblendet
        </div>
      )}
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────── */
export default function Dashboard() {
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [error,       setError]       = useState(null);
  const [search,      setSearch]      = useState("");
  const [primaryHost, setPrimaryHost] = useState(null);
  const [layout,      setLayout]      = useState(loadLayout);
  const [editMode,    setEditMode]    = useState(false);
  const [dragId,      setDragId]      = useState(null);
  const [dragOver,    setDragOver]    = useState(null);
  const now = useClock();

  function updLayout(patch) {
    setLayout(prev => {
      const next = { ...prev, ...patch };
      saveLayout(next);
      return next;
    });
  }

  function handleDragStart(id) { setDragId(id); }
  function handleDragOver(id)  { if (id !== dragId) setDragOver(id); }
  function handleDrop(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOver(null); return; }
    setLayout(prev => {
      const order = [...prev.center];
      const from  = order.indexOf(dragId);
      const to    = order.indexOf(targetId);
      if (from === -1 || to === -1) return prev;
      order.splice(from, 1);
      order.splice(to, 0, dragId);
      const next = { ...prev, center: order };
      saveLayout(next);
      return next;
    });
    setDragId(null);
    setDragOver(null);
  }
  function handleToggleHide(id) {
    setLayout(prev => {
      const hidden = prev.hidden.includes(id)
        ? prev.hidden.filter(h => h !== id)
        : [...prev.hidden, id];
      const next = { ...prev, hidden };
      saveLayout(next);
      return next;
    });
  }

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const d = await api.status.detailed();
      setData(d);
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

  // Auto-select first linux host when data loads
  useEffect(() => {
    if (!data) return;
    const hosts = (data.connectors ?? []).filter(c => c.type === "linux_probe" || c.type === "linux_ssh");
    if (hosts.length && !hosts.find(h => h.id === primaryHost)) {
      setPrimaryHost(hosts[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function calcStats() {
    const all = data?.connectors ?? [];
    return {
      total:      all.length,
      online:     all.filter(c => c.status === "online").length,
      warning:    all.filter(c => c.status === "warning").length,
      offline:    all.filter(c => ["offline", "error", "critical"].includes(c.status)).length,
      vmsRunning: all.filter(c => c.type === "proxmox").reduce((s, c) => s + (c.metrics?.vms_running ?? 0), 0),
      containers: all.filter(c => c.type === "docker").reduce((s, c) => s + (c.metrics?.running ?? 0), 0),
      hasProxmox: all.some(c => c.type === "proxmox"),
      hasDocker:  all.some(c => c.type === "docker"),
    };
  }

  function getGroups() {
    const all = data?.connectors ?? [];
    const q   = search.toLowerCase().trim();
    const filtered = q
      ? all.filter(c => c.name.toLowerCase().includes(q) || (TYPE_CFG[c.type]?.label ?? c.type).toLowerCase().includes(q))
      : all;

    const map = {};
    for (const c of filtered) {
      const g = TYPE_CFG[c.type]?.group ?? "Sonstiges";
      if (!map[g]) map[g] = [];
      map[g].push(c);
    }

    const result = [];
    for (const name of GROUP_ORDER) {
      if (map[name]) result.push({ name, connectors: map[name] });
    }
    for (const [name, connectors] of Object.entries(map)) {
      if (!GROUP_ORDER.includes(name)) result.push({ name, connectors });
    }
    return result;
  }

  /* ── Loading / error states ─────────────────────────────────── */
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
        <button onClick={() => load()} className="btn-primary" style={{ marginTop: 16 }}>Erneut versuchen</button>
      </div>
    </div>
  );

  const stats        = calcStats();
  const groups       = getGroups();
  const linuxHosts   = (data?.connectors ?? []).filter(c => c.type === "linux_probe" || c.type === "linux_ssh");
  const selectedHost = linuxHosts.find(h => h.id === primaryHost) ?? null;
  const overall      = stats.offline > 0 ? "offline" : stats.warning > 0 ? "warning" : "online";
  const overallColor = overall === "online" ? "#34d399" : overall === "warning" ? "#fbbf24" : "#f87171";
  const overallText  = overall === "online" ? "Alles in Ordnung" : overall === "warning" ? "Warnung aktiv" : "System kritisch";
  const timeStr      = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const secStr       = pad(now.getSeconds());
  const dateStr      = `${DAYS[now.getDay()]}, ${now.getDate()}. ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: "28px 32px", gap: 24 }}>

      {/* ── Hero: Clock + Status – full width ─────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{ fontSize: 60, fontWeight: 700, color: "var(--text-1)", lineHeight: 1, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums" }}>
              {timeStr}
            </span>
            <span style={{ fontSize: 24, fontWeight: 300, color: "var(--text-3)", letterSpacing: "-0.02em", marginLeft: 5 }}>
              :{secStr}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 6, letterSpacing: "0.01em" }}>{dateStr}</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", borderRadius: 20, background: `${overallColor}14`, border: `1px solid ${overallColor}2A`, fontSize: 12.5, fontWeight: 500, color: overallColor }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", display: "inline-block", background: overallColor, boxShadow: `0 0 8px ${overallColor}` }} />
            {overallText}
          </div>
          <button onClick={() => load(true)} disabled={refreshing} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "7px 14px" }}>
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Aktualisieren
          </button>
          <button
            onClick={() => setEditMode(m => !m)}
            className="btn-ghost"
            style={{
              display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "7px 14px",
              ...(editMode ? { borderColor: "rgba(245,158,11,0.45)", color: "#F59E0B", background: "rgba(245,158,11,0.08)" } : {}),
            }}
          >
            <LayoutGrid size={13} />
            {editMode ? "Fertig" : "Layout"}
          </button>
        </div>
      </div>

      {/* ── Edit mode: panel + hint bar ────────────────────────── */}
      {editMode && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 10 }}>
          <LayoutGrid size={11} style={{ color: "rgba(245,158,11,0.55)", flexShrink: 0 }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: "rgba(245,158,11,0.55)", letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 4 }}>Panels:</span>
          {[
            { key: "showFleet",  label: "Fleet Panel", show: linuxHosts.length > 0 },
            { key: "showEvents", label: "Event Feed",  show: true },
          ].filter(p => p.show).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => updLayout({ [key]: !layout[key] })}
              style={{
                padding: "3px 10px", borderRadius: 20, fontSize: 10.5, fontWeight: 600,
                cursor: "pointer", border: "1px solid", display: "flex", alignItems: "center", gap: 5,
                borderColor: layout[key] ? "rgba(16,185,129,0.4)"  : "rgba(255,255,255,0.12)",
                background:  layout[key] ? "rgba(16,185,129,0.08)" : "rgba(255,255,255,0.03)",
                color:       layout[key] ? "#10B981"                : "rgba(255,255,255,0.38)",
              }}
            >
              {layout[key] ? <Eye size={10} /> : <EyeOff size={10} />}
              {label}
            </button>
          ))}
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.18)", marginLeft: 6 }}>
            Widgets in der Mitte ziehen zum Umordnen · Ausblenden zum Deaktivieren
          </span>
        </div>
      )}

      {/* ── Three-column main layout ────────────────────────────── */}
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start", flex: 1 }}>

        {/* LEFT: Fleet panel */}
        {linuxHosts.length > 0 && layout.showFleet && (
          <FleetPanel hosts={linuxHosts} selected={primaryHost} onSelect={setPrimaryHost} />
        )}

        {/* CENTER: modular widget stack */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          {layout.center.map(wid => {
            const def      = CENTER_DEFS.find(d => d.id === wid);
            const isHidden = layout.hidden.includes(wid);

            // Widget content per ID
            let content = null;
            if (wid === "gauges") {
              if (selectedHost && selectedHost.metrics?.cpu_pct != null) {
                content = <HostGauges connector={selectedHost} />;
              } else if (editMode) {
                content = (
                  <div style={{ padding: "14px 16px", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)", background: "rgba(255,255,255,0.025)", borderRadius: 12, border: "1px dashed rgba(255,255,255,0.07)" }}>
                    Host Gauges — Kein Linux-Host ausgewählt
                  </div>
                );
              }
            }

            if (wid === "pills") {
              content = (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[
                    { label: "Services",   value: stats.total,        color: "var(--text-2)" },
                    { label: "Online",     value: stats.online,       color: "#34d399" },
                    ...(stats.warning > 0 ? [{ label: "Warnung",   value: stats.warning,    color: "#fbbf24" }] : []),
                    ...(stats.offline > 0 ? [{ label: "Offline",   value: stats.offline,    color: "#f87171" }] : []),
                    ...(stats.hasProxmox  ? [{ label: "VMs",       value: stats.vmsRunning, color: "#FCD34D" }] : []),
                    ...(stats.hasDocker   ? [{ label: "Container", value: stats.containers, color: "#60a5fa" }] : []),
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: "5px 14px", borderRadius: 20, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 7 }}>
                      <span style={{ fontWeight: 700, color, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{value}</span>
                      <span style={{ color: "var(--text-3)", fontSize: 11 }}>{label}</span>
                    </div>
                  ))}
                </div>
              );
            }

            if (wid === "services") {
              content = (
                <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                  {/* Search */}
                  <div style={{ position: "relative", maxWidth: 380 }}>
                    <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }} />
                    <input className="nb-input" placeholder="Services filtern…" value={search} onChange={e => setSearch(e.target.value)} style={{ paddingLeft: 34 }} />
                  </div>

                  {/* Service groups */}
                  {groups.length === 0 ? (
                    <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
                      <Plug size={36} style={{ color: "rgba(255,255,255,0.12)", margin: "0 auto 12px" }} />
                      <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 16 }}>
                        {search ? "Keine Services gefunden." : "Noch keine Connectors konfiguriert."}
                      </p>
                      {!search && (
                        <Link to="/connectors" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
                          <Plug size={13} /> Ersten Connector hinzufügen
                        </Link>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 32, paddingBottom: 32 }}>
                      {groups.map(({ name, connectors }) => (
                        <div key={name}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                            <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--text-3)" }}>
                              {name}
                            </span>
                            <span style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "1px 7px", fontSize: 9.5, fontWeight: 600, color: "var(--text-3)" }}>
                              {connectors.length}
                            </span>
                            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.055)" }} />
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                            {connectors.map(c =>
                              c.type === "bookmarks"
                                ? <BookmarkGroupTile key={c.id} connector={c} />
                                : <ServiceTile key={c.id} connector={c} />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            // Skip invisible widgets outside edit mode
            if (!editMode && (content === null || isHidden)) return null;

            return (
              <WidgetShell
                key={wid}
                id={wid}
                label={def?.label ?? wid}
                editMode={editMode}
                hidden={isHidden}
                onToggleHide={handleToggleHide}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragOver={dragOver === wid}
              >
                {content}
              </WidgetShell>
            );
          })}
        </div>

        {/* RIGHT: event feed */}
        {layout.showEvents && (
          <div style={{ flexShrink: 0 }}>
            {editMode && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", marginBottom: 7, background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.18)", borderRadius: 9 }}>
                <GripVertical size={13} style={{ color: "rgba(245,158,11,0.4)", flexShrink: 0 }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(245,158,11,0.65)", flex: 1, letterSpacing: "0.1em", textTransform: "uppercase" }}>Event Feed</span>
                <button
                  onClick={() => updLayout({ showEvents: false })}
                  style={{ background: "none", border: "1px solid rgba(255,255,255,0.12)", cursor: "pointer", padding: "2px 8px", color: "rgba(255,255,255,0.35)", display: "flex", alignItems: "center", gap: 5, borderRadius: 6, fontSize: 10, fontWeight: 600 }}
                >
                  <EyeOff size={11} /> Ausblenden
                </button>
              </div>
            )}
            <EventFeed connectors={data?.connectors ?? []} />
          </div>
        )}
      </div>
    </div>
  );
}
