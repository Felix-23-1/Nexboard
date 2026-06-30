/**
 * Dashboard – Homepage-inspired redesign
 * Clock-Hero · Stat-Pills · Service-Gruppen mit farbigen Tiles
 */
import { useEffect, useState } from "react";
import { RefreshCw, Plug, Search } from "lucide-react";
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
    case "ai_models":      return [
      kv("Geladen", m.models_loaded_count ?? 0),
      kv("Verfügbar", m.models_available ?? 0),
      kv("Server", m.server_type ?? "–"),
    ];
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
        e.currentTarget.style.background  = `rgba(255,255,255,0.075)`;
        e.currentTarget.style.borderColor = `${cfg.color}40`;
        e.currentTarget.style.boxShadow   = `0 8px 32px rgba(0,0,0,0.30), 0 0 20px ${cfg.color}12, inset 0 1px 0 rgba(255,255,255,0.10)`;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background  = "rgba(255,255,255,0.055)";
        e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
        e.currentTarget.style.boxShadow   = "0 4px 20px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07)";
      }}
    >
      {/* Header: icon + name + status */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {/* Colored icon */}
        <div style={{
          width: 42, height: 42, borderRadius: 11, flexShrink: 0,
          background: `${cfg.color}1C`, border: `1px solid ${cfg.color}38`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: cfg.color,
        }}>
          <ConnectorIcon icon={cfg.icon} size={20} />
        </div>

        {/* Name + type */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 600, color: "var(--text-1)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {c.name}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2 }}>
            {cfg.label}
          </div>
        </div>

        {/* Status badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 4,
          padding: "3px 9px", borderRadius: 20, flexShrink: 0,
          background: `${dotColor}14`, border: `1px solid ${dotColor}28`,
          fontSize: 10.5, fontWeight: 500, color: dotColor,
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: "50%",
            display: "inline-block", background: dotColor,
          }} />
          {statusLabel}
        </div>
      </div>

      {/* Error message */}
      {c.error && (
        <div style={{
          fontSize: 11, color: "#f87171",
          background: "rgba(248,113,113,0.07)",
          border: "1px solid rgba(248,113,113,0.14)",
          borderRadius: 8, padding: "5px 10px",
        }}>
          {c.error}
        </div>
      )}

      {/* Metrics */}
      {metrics.length > 0 && (
        <div style={{
          display: "flex", gap: 20, flexWrap: "wrap",
          paddingTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.055)",
        }}>
          {metrics.map(({ label, value }) => (
            <div key={label}>
              <div style={{
                fontSize: 15, fontWeight: 700, color: "var(--text-1)",
                lineHeight: 1, fontVariantNumeric: "tabular-nums",
              }}>
                {value}
              </div>
              <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 3 }}>
                {label}
              </div>
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
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 9, flexShrink: 0,
          background: `${cfg.color}1C`, border: `1px solid ${cfg.color}38`,
          display: "flex", alignItems: "center", justifyContent: "center", color: cfg.color,
        }}>
          <ConnectorIcon icon="bookmark" size={16} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{c.name}</div>
          {c.metrics?.description && <div style={{ fontSize: 11, color: "var(--text-3)" }}>{c.metrics.description}</div>}
        </div>
      </div>
      {/* Link grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 6 }}>
        {links.map((link, i) => (
          <a
            key={i}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "7px 10px",
              background: "rgba(255,255,255,0.05)", borderRadius: 9,
              border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none",
              transition: "all 0.15s", color: "rgba(255,255,255,0.75)", fontSize: 12.5,
            }}
            title={link.description || link.url}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(245,158,11,0.10)"; e.currentTarget.style.borderColor = "rgba(245,158,11,0.28)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <ConnectorIcon icon={link.icon ?? "globe"} size={13} className="flex-shrink-0" />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.name}</span>
          </a>
        ))}
        {links.length === 0 && (
          <span style={{ fontSize: 11.5, color: "var(--text-3)", gridColumn: "1 / -1" }}>Keine Links konfiguriert.</span>
        )}
      </div>
    </div>
  );
}

/* ── Dashboard ────────────────────────────────────────────────── */
export default function Dashboard() {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);
  const [search, setSearch]         = useState("");
  const now = useClock();

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

  /* ── Stats ──────────────────────────────────────────────────── */
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

  /* ── Grouped + filtered connectors ──────────────────────────── */
  function getGroups() {
    const all = data?.connectors ?? [];
    const q   = search.toLowerCase().trim();
    const filtered = q
      ? all.filter(c =>
          c.name.toLowerCase().includes(q) ||
          (TYPE_CFG[c.type]?.label ?? c.type).toLowerCase().includes(q)
        )
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
    // unknown groups at end
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
        <button onClick={() => load()} className="btn-primary" style={{ marginTop: 16 }}>
          Erneut versuchen
        </button>
      </div>
    </div>
  );

  const stats  = calcStats();
  const groups = getGroups();
  const overall = stats.offline > 0 ? "offline" : stats.warning > 0 ? "warning" : "online";

  const overallColor = overall === "online" ? "#34d399" : overall === "warning" ? "#fbbf24" : "#f87171";
  const overallText  = overall === "online" ? "Alles in Ordnung" : overall === "warning" ? "Warnung aktiv" : "System kritisch";

  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const secStr  = pad(now.getSeconds());
  const dateStr = `${DAYS[now.getDay()]}, ${now.getDate()}. ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: "28px 32px", gap: 28 }}>

      {/* ── Hero: Clock + Status ──────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        {/* Clock */}
        <div>
          <div style={{ display: "flex", alignItems: "baseline" }}>
            <span style={{
              fontSize: 60, fontWeight: 700, color: "var(--text-1)",
              lineHeight: 1, letterSpacing: "-0.04em", fontVariantNumeric: "tabular-nums",
            }}>
              {timeStr}
            </span>
            <span style={{
              fontSize: 24, fontWeight: 300, color: "var(--text-3)",
              letterSpacing: "-0.02em", marginLeft: 5,
            }}>
              :{secStr}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 6, letterSpacing: "0.01em" }}>
            {dateStr}
          </div>
        </div>

        {/* Status + Refresh */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 20,
            background: `${overallColor}14`, border: `1px solid ${overallColor}2A`,
            fontSize: 12.5, fontWeight: 500, color: overallColor,
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              display: "inline-block", background: overallColor,
              boxShadow: `0 0 8px ${overallColor}`,
            }} />
            {overallText}
          </div>
          <button
            onClick={() => load(true)}
            disabled={refreshing}
            className="btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "7px 14px" }}
          >
            <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
            Aktualisieren
          </button>
        </div>
      </div>

      {/* ── Stat pills ───────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[
          { label: "Services",   value: stats.total,      color: "var(--text-2)" },
          { label: "Online",     value: stats.online,     color: "#34d399" },
          ...(stats.warning > 0 ? [{ label: "Warnung",   value: stats.warning,   color: "#fbbf24" }] : []),
          ...(stats.offline > 0 ? [{ label: "Offline",   value: stats.offline,   color: "#f87171" }] : []),
          ...(stats.hasProxmox  ? [{ label: "VMs",       value: stats.vmsRunning, color: "#FCD34D" }] : []),
          ...(stats.hasDocker   ? [{ label: "Container", value: stats.containers, color: "#60a5fa" }] : []),
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            padding: "5px 14px", borderRadius: 20,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", gap: 7,
          }}>
            <span style={{ fontWeight: 700, color, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
              {value}
            </span>
            <span style={{ color: "var(--text-3)", fontSize: 11 }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Search ───────────────────────────────────────────────── */}
      <div style={{ position: "relative", maxWidth: 380 }}>
        <Search size={14} style={{
          position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)",
          color: "var(--text-3)", pointerEvents: "none",
        }} />
        <input
          className="nb-input"
          placeholder="Services filtern…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ paddingLeft: 34 }}
        />
      </div>

      {/* ── Service groups ───────────────────────────────────────── */}
      {groups.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px" }}>
          <Plug size={36} style={{ color: "rgba(255,255,255,0.12)", margin: "0 auto 12px" }} />
          <p style={{ color: "var(--text-2)", fontSize: 13, marginBottom: 16 }}>
            {search ? "Keine Services gefunden." : "Noch keine Connectors konfiguriert."}
          </p>
          {!search && (
            <Link
              to="/connectors"
              className="btn-primary"
              style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}
            >
              <Plug size={13} /> Ersten Connector hinzufügen
            </Link>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {groups.map(({ name, connectors }) => (
            <div key={name}>
              {/* Group header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
              }}>
                <span style={{
                  fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em",
                  textTransform: "uppercase", color: "var(--text-3)",
                }}>
                  {name}
                </span>
                <span style={{
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 10, padding: "1px 7px",
                  fontSize: 9.5, fontWeight: 600, color: "var(--text-3)",
                }}>
                  {connectors.length}
                </span>
                <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.055)" }} />
              </div>

              {/* Tile grid */}
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
                gap: 12,
              }}>
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
