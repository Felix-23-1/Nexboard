/**
 * Das Lab – Fleet-Panel + Detail-Ansicht
 * Linkes Panel: kompakte Liste aller Connectors mit Mini-Bars
 * Rechtes Panel: Ring-Gauge Detail des ausgewählten Connectors
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw, Sparkles, AlertTriangle,
  Power, RotateCcw, Monitor,
  ExternalLink, Package, ChevronDown, TerminalSquare,
  Plug, History, Globe, Zap,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { api } from "../api/client";
import ConnectorIcon from "../components/ConnectorIcon";
import ConnectorMetrics from "../components/ConnectorMetrics";
import SSHTerminalModal from "../components/SSHTerminalModal";
import ScriptRunner from "../components/ScriptRunner";

/* ── Type Maps ──────────────────────────────────────────────────────── */

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
  linux_probe:    "cpu",
  ai_models:      "brain",
  bookmarks:      "bookmark",
  netcup:         "server",
  wol:            "zap",
  tls_monitor:    "lock",
};

const TYPE_LABEL = {
  proxmox:        "Proxmox VE",
  docker:         "Docker",
  uptime_kuma:    "Uptime Kuma",
  truenas:        "TrueNAS",
  unifi:          "Unifi",
  synology:       "Synology NAS",
  pfsense:        "pfSense",
  hetzner:        "Hetzner Cloud",
  proxmox_backup: "Proxmox Backup",
  cloudflare:     "Cloudflare",
  grafana:        "Grafana",
  linux_ssh:      "Linux SSH",
  linux_probe:    "Linux Full-Probe",
  ai_models:      "AI Model Server",
  bookmarks:      "Bookmark-Gruppe",
  netcup:         "Netcup",
  wol:            "Wake-on-LAN",
  tls_monitor:    "TLS-Zertifikat",
};

const TYPE_COLOR = {
  proxmox:        "#E57C00",
  proxmox_backup: "#B45309",
  hetzner:        "#D50C2D",
  netcup:         "#C00E0E",
  docker:         "#2496ED",
  unifi:          "#0559C9",
  pfsense:        "#E04C00",
  cloudflare:     "#F48120",
  tls_monitor:    "#0E9E6E",
  wol:            "#7B5EA7",
  uptime_kuma:    "#5CDD8B",
  grafana:        "#F46800",
  truenas:        "#0095D5",
  synology:       "#94A3B8",
  linux_ssh:      "#27B43E",
  linux_probe:    "#10B981",
  ai_models:      "#8B5CF6",
  bookmarks:      "#F59E0B",
};

const STATUS_DOT = {
  online:  { color: "#34d399", shadow: "0 0 7px #34d399bb" },
  warning: { color: "#fbbf24", shadow: "0 0 7px #fbbf24bb" },
  offline: { color: "#f87171", shadow: "0 0 7px #f87171bb" },
  error:   { color: "#f87171", shadow: "0 0 7px #f87171bb" },
  unknown: { color: "rgba(255,255,255,0.18)", shadow: "none" },
};

const SEVERITY = {
  low:    "text-green-400 bg-green-400/5 border-green-400/15",
  medium: "text-yellow-400 bg-yellow-400/5 border-yellow-400/15",
  high:   "text-red-400 bg-red-400/5 border-red-400/15",
};

const VM_STATUS_COLOR = {
  running: "#34d399",
  stopped: "#f87171",
  paused:  "#fbbf24",
};

const NO_WEB_TYPES = new Set(["linux_ssh", "linux_probe", "wol", "bookmarks"]);
const HOST_TYPES   = new Set(["linux_probe", "linux_ssh"]);

function getServiceUrl(c) {
  if (NO_WEB_TYPES.has(c.type)) return null;
  const cfg = c.config ?? {};
  if (cfg.url) return cfg.url;
  if (cfg.host) {
    const port   = cfg.port;
    const scheme = cfg.use_tls ? "https" : "http";
    if (port && port !== 80 && port !== 443) return `${scheme}://${cfg.host}:${port}`;
    return `${scheme}://${cfg.host}`;
  }
  return null;
}

/* ── Ring Gauge ─────────────────────────────────────────────────────── */

function RingGauge({ value = 0, label, sublabel, color = "#F59E0B", size = 120 }) {
  const r    = 38;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(100, Math.max(0, value || 0));
  const fill = circ * pct / 100;
  const ac   = pct > 90 ? "#f87171" : pct > 78 ? "#fbbf24" : color;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          {/* Track */}
          <circle cx="50" cy="50" r={r} fill="none"
            stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
          {/* Arc */}
          {pct > 0 && (
            <circle cx="50" cy="50" r={r} fill="none"
              stroke={ac} strokeWidth="7"
              strokeDasharray={`${fill} ${circ - fill}`}
              strokeDashoffset={circ * 0.25}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.55s ease, stroke 0.3s ease" }}
            />
          )}
        </svg>
        {/* Center text */}
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 0,
        }}>
          <span style={{
            fontSize: size > 110 ? 26 : 19, fontWeight: 700,
            color: ac, lineHeight: 1,
            transition: "color 0.3s ease",
          }}>
            {Math.round(pct)}
          </span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>%</span>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.07em",
          textTransform: "uppercase", color: "rgba(255,255,255,0.6)",
        }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>
            {sublabel}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Mini Bar (Fleet Panel) ─────────────────────────────────────────── */

function MiniBar({ label, value = 0, color }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  const bc  = pct > 88 ? "#f87171" : pct > 72 ? "#fbbf24" : color;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
      <span style={{
        fontSize: 8.5, fontWeight: 700, letterSpacing: "0.05em",
        color: "rgba(255,255,255,0.25)", width: 22, flexShrink: 0,
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 3, borderRadius: 2, background: "rgba(255,255,255,0.07)" }}>
        <div style={{
          width: `${pct}%`, height: "100%", borderRadius: 2,
          background: bc, transition: "width 0.4s ease",
        }} />
      </div>
      <span style={{
        fontSize: 9, fontFamily: "'JetBrains Mono', monospace",
        color: bc, width: 25, textAlign: "right", flexShrink: 0,
      }}>
        {Math.round(pct)}%
      </span>
    </div>
  );
}

/* ── Fleet Row ──────────────────────────────────────────────────────── */

function FleetRow({ connector: c, selected, onSelect }) {
  const tc      = TYPE_COLOR[c.type] ?? "#F59E0B";
  const dot     = STATUS_DOT[c.status] ?? STATUS_DOT.unknown;
  const isHost  = HOST_TYPES.has(c.type);
  const isDead  = c.status === "offline" || c.status === "error";

  return (
    <div
      onClick={onSelect}
      style={{
        padding: "9px 11px", borderRadius: 11, cursor: "pointer",
        background: selected ? `${tc}12` : "rgba(255,255,255,0.025)",
        border: `1px solid ${selected ? `${tc}45` : "rgba(255,255,255,0.06)"}`,
        borderLeft: `3px solid ${selected ? tc : "transparent"}`,
        transition: "all 0.17s ease",
        userSelect: "none",
      }}
      onMouseEnter={(e) => {
        if (!selected) {
          e.currentTarget.style.background = "rgba(255,255,255,0.042)";
          e.currentTarget.style.borderLeftColor = `${tc}55`;
        }
      }}
      onMouseLeave={(e) => {
        if (!selected) {
          e.currentTarget.style.background = "rgba(255,255,255,0.025)";
          e.currentTarget.style.borderLeftColor = "transparent";
        }
      }}
    >
      {/* Name row */}
      <div style={{
        display: "flex", alignItems: "center", gap: 7,
        marginBottom: isHost && !isDead ? 7 : 0,
      }}>
        {/* Status dot */}
        <span style={{
          width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
          background: dot.color,
          boxShadow: selected ? dot.shadow : "none",
          transition: "box-shadow 0.2s",
        }} />
        {/* Icon */}
        <div style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          background: selected ? `${tc}22` : "rgba(255,255,255,0.06)",
          border: `1px solid ${selected ? `${tc}40` : "rgba(255,255,255,0.08)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: selected ? tc : "rgba(255,255,255,0.38)",
          transition: "all 0.17s",
        }}>
          <ConnectorIcon icon={TYPE_ICON[c.type] ?? "settings"} size={11} />
        </div>
        {/* Name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: selected ? 600 : 500,
            color: selected ? "var(--text-1)" : "rgba(255,255,255,0.68)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            transition: "color 0.15s",
          }}>
            {isHost ? (c.metrics?.hostname || c.name) : c.name}
          </div>
          {!isHost && (
            <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.28)", marginTop: 0.5 }}>
              {TYPE_LABEL[c.type] ?? c.type}
            </div>
          )}
        </div>
        {/* Temp badge (hosts only) */}
        {isHost && c.metrics?.cpu_temp && !isDead && (
          <span style={{
            fontSize: 9, color: "rgba(255,255,255,0.3)",
            fontFamily: "'JetBrains Mono', monospace", flexShrink: 0,
          }}>
            {Math.round(c.metrics.cpu_temp)}°
          </span>
        )}
      </div>

      {/* Mini bars */}
      {isHost && !isDead && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3.5 }}>
          <MiniBar label="CPU" value={c.metrics?.cpu_pct}  color="#F59E0B" />
          <MiniBar label="RAM" value={c.metrics?.mem_pct}  color="#60a5fa" />
          <MiniBar label="DSK" value={c.metrics?.disk_pct} color="#34d399" />
        </div>
      )}

      {/* Offline hint */}
      {isDead && (
        <div style={{ fontSize: 10, color: "#f87171", marginTop: 4, opacity: 0.8 }}>
          {c.error ? c.error.slice(0, 60) : "Nicht erreichbar"}
        </div>
      )}
    </div>
  );
}

/* ── Fleet Panel ────────────────────────────────────────────────────── */

function FleetPanel({ connectors, selectedId, onSelect }) {
  const hosts    = connectors.filter((c) => HOST_TYPES.has(c.type));
  const services = connectors.filter((c) => !HOST_TYPES.has(c.type));
  const online   = connectors.filter((c) => c.status === "online").length;

  return (
    <div style={{
      width: 228, flexShrink: 0,
      display: "flex", flexDirection: "column", gap: 5,
    }}>
      {/* Fleet header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 3px", marginBottom: 6,
      }}>
        <span style={{
          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em",
          color: "rgba(255,255,255,0.28)", textTransform: "uppercase",
        }}>
          Fleet
        </span>
        <span style={{
          fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
          color: online > 0 ? "rgba(52,211,153,0.75)" : "rgba(255,255,255,0.28)",
          background: "rgba(52,211,153,0.07)",
          border: "1px solid rgba(52,211,153,0.18)",
          borderRadius: 5, padding: "1px 7px",
        }}>
          {online}/{connectors.length} online
        </span>
      </div>

      {/* Hosts */}
      {hosts.map((c) => (
        <FleetRow
          key={c.id}
          connector={c}
          selected={selectedId === c.id}
          onSelect={() => onSelect(c.id)}
        />
      ))}

      {/* Services divider */}
      {services.length > 0 && (
        <>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
            color: "rgba(255,255,255,0.2)", textTransform: "uppercase",
            padding: "8px 3px 4px",
            borderTop: hosts.length > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
            marginTop: hosts.length > 0 ? 4 : 0,
          }}>
            Services
          </div>
          {services.map((c) => (
            <FleetRow
              key={c.id}
              connector={c}
              selected={selectedId === c.id}
              onSelect={() => onSelect(c.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}

/* ── Host Detail Pane ───────────────────────────────────────────────── */

function HostDetailPane({ connector: c, allConnectors, aiResult, aiLoading: aiLoad, onRunAi }) {
  const [sshOpen, setSshOpen] = useState(false);
  const tc = TYPE_COLOR[c.type] ?? "#10B981";
  const m  = c.metrics ?? {};

  // Gauge sublabels
  const memLabel  = m.mem_used_mb && m.mem_total_mb
    ? `${(m.mem_used_mb / 1024).toFixed(1)} / ${(m.mem_total_mb / 1024).toFixed(1)} GB`
    : undefined;
  const diskLabel = m.disk_used_gb && m.disk_total_gb
    ? `${Math.round(m.disk_used_gb)} / ${Math.round(m.disk_total_gb)} GB`
    : undefined;
  const cpuLabel  = m.cpu_cores ? `${m.cpu_cores} cores` : undefined;

  const hasGauges = m.cpu_pct !== undefined || m.mem_pct !== undefined || m.disk_pct !== undefined;

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Info strip ──────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        background: "rgba(255,255,255,0.032)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderLeft: `3px solid ${tc}`,
        borderRadius: 14, padding: "12px 18px",
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--text-1)", display: "flex", alignItems: "center", gap: 10 }}>
            {m.hostname || c.name}
            {m.is_vm && (
              <span style={{
                fontSize: 9.5, background: "rgba(139,92,246,0.14)",
                border: "1px solid rgba(139,92,246,0.3)", borderRadius: 5,
                padding: "2px 7px", color: "#a78bfa", fontWeight: 600,
              }}>VM</span>
            )}
          </div>
          <div style={{
            fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 3,
            display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center",
          }}>
            {m.os && <span>{m.os}</span>}
            {m.uptime && <span style={{ opacity: 0.7 }}>· {m.uptime}</span>}
            {m.kernel && <span style={{ fontFamily: "monospace", opacity: 0.55 }}>· {m.kernel}</span>}
          </div>
        </div>

        {/* Temp */}
        {m.cpu_temp && (
          <div style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{
              fontSize: 22, fontWeight: 700, lineHeight: 1,
              color: m.cpu_temp > 80 ? "#f87171" : m.cpu_temp > 65 ? "#fbbf24" : "#34d399",
            }}>
              {Math.round(m.cpu_temp)}°C
            </div>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>CPU Temp</div>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {getServiceUrl(c) && (
            <a href={getServiceUrl(c)} target="_blank" rel="noopener noreferrer"
              className="btn-ghost"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "5px 12px", textDecoration: "none" }}>
              <Globe size={12} /> Öffnen
            </a>
          )}
          <button onClick={onRunAi} disabled={aiLoad} className="btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "5px 12px" }}>
            <Sparkles size={12} className={aiLoad ? "animate-pulse" : ""} /> KI
          </button>
          {(c.type === "linux_ssh" || c.type === "linux_probe") && (
            <button onClick={() => setSshOpen(true)} className="vm-btn vm-btn-teal"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "5px 13px", borderRadius: 8 }}>
              <TerminalSquare size={12} /> SSH
            </button>
          )}
        </div>
      </div>

      {sshOpen && <SSHTerminalModal connector={c} onClose={() => setSshOpen(false)} />}

      {/* ── Error ───────────────────────────────────────────────── */}
      {c.error && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: "#f87171",
          background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)",
          borderRadius: 11, padding: "9px 13px",
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {c.error}
        </div>
      )}

      {/* ── Ring Gauges ─────────────────────────────────────────── */}
      {hasGauges && (
        <div style={{
          display: "flex", gap: 0, justifyContent: "space-around",
          background: "rgba(255,255,255,0.025)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 16, padding: "22px 20px 18px",
        }}>
          {m.cpu_pct !== undefined && (
            <RingGauge value={m.cpu_pct} label="CPU" sublabel={cpuLabel} color="#F59E0B" size={130} />
          )}
          {m.mem_pct !== undefined && (
            <RingGauge value={m.mem_pct} label="RAM" sublabel={memLabel} color="#60a5fa" size={130} />
          )}
          {m.disk_pct !== undefined && (
            <RingGauge value={m.disk_pct} label="Disk" sublabel={diskLabel} color="#34d399" size={130} />
          )}
        </div>
      )}

      {/* ── Metrics Tabs ────────────────────────────────────────── */}
      <ConnectorMetrics type={c.type} metrics={m} connectorId={c.id} />

      {/* ── Script Runner ───────────────────────────────────────── */}
      {(c.type === "linux_ssh" || c.type === "linux_probe") && <ScriptRunner connectorId={c.id} />}

      {/* ── SSH Hint ────────────────────────────────────────────── */}
      {(c.type === "truenas" || c.type === "synology" || c.type === "proxmox_backup") && (
        <SshHint config={c.config} />
      )}

      {/* ── AI Block ────────────────────────────────────────────── */}
      {aiResult && <AiBlock result={aiResult} />}

      {/* ── History ─────────────────────────────────────────────── */}
      <HistoryBlock connectorId={c.id} connectorType={c.type} />
    </div>
  );
}

/* ── Service Detail Pane ────────────────────────────────────────────── */

function ServiceDetailPane({ connector: c, allConnectors, aiResult, aiLoading: aiLoad, onRunAi }) {
  const tc  = TYPE_COLOR[c.type] ?? "#F59E0B";
  const dot = STATUS_DOT[c.status] ?? STATUS_DOT.unknown;

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 14,
        background: "rgba(255,255,255,0.032)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderLeft: `3px solid ${tc}`,
        borderRadius: 14, padding: "14px 18px",
      }}>
        <div style={{
          width: 46, height: 46, borderRadius: 13, flexShrink: 0,
          background: `${tc}18`, border: `1px solid ${tc}35`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: tc,
        }}>
          <ConnectorIcon icon={TYPE_ICON[c.type] ?? "settings"} size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 3 }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: dot.color, boxShadow: dot.shadow, flexShrink: 0,
            }} />
            <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text-1)" }}>{c.name}</span>
            {!c.enabled && (
              <span style={{
                fontSize: 9.5, color: "var(--text-3)",
                border: "1px solid rgba(255,255,255,0.10)", borderRadius: 5, padding: "1px 6px",
              }}>deaktiviert</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: tc, opacity: 0.75, fontWeight: 500 }}>
            {TYPE_LABEL[c.type] ?? c.type}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {getServiceUrl(c) && (
            <a href={getServiceUrl(c)} target="_blank" rel="noopener noreferrer"
              className="btn-ghost"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "5px 12px", textDecoration: "none" }}>
              <Globe size={12} /> Öffnen
            </a>
          )}
          <button onClick={onRunAi} disabled={aiLoad} className="btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "5px 12px" }}>
            <Sparkles size={12} className={aiLoad ? "animate-pulse" : ""} /> KI
          </button>
        </div>
      </div>

      {/* Error */}
      {c.error && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: "#f87171",
          background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)",
          borderRadius: 11, padding: "9px 13px",
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          {c.error}
        </div>
      )}

      <ConnectorMetrics type={c.type} metrics={c.metrics} connectorId={c.id} />

      {c.type === "proxmox" && c.metrics?.nodes?.length > 0 && (
        <VmControlBlock connector={c} allConnectors={allConnectors} />
      )}

      {c.type === "wol" && <WolButton connectorId={c.id} isOnline={c.status === "online"} />}

      {(c.type === "truenas" || c.type === "synology" || c.type === "proxmox_backup") && (
        <SshHint config={c.config} />
      )}

      {aiResult && <AiBlock result={aiResult} />}

      <HistoryBlock connectorId={c.id} connectorType={c.type} />
    </div>
  );
}

/* ── Hauptseite ─────────────────────────────────────────────────────── */

export default function Sysadmin() {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);
  const [aiResults, setAiResults] = useState({});
  const [aiLoading, setAiLoading] = useState({});
  const [selectedId, setSelectedId] = useState(null);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const d = await api.status.detailed();
      setData(d);
      // Auto-select first connector if none selected
      setSelectedId((prev) => {
        if (prev) return prev;
        const list = d?.connectors ?? [];
        return list[0]?.id ?? null;
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 60000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runAi(id) {
    setAiLoading((l) => ({ ...l, [id]: true }));
    try {
      const result = await api.ai.analyze(id);
      setAiResults((r) => ({ ...r, [id]: result }));
    } catch (e) {
      setAiResults((r) => ({ ...r, [id]: { error: e.message } }));
    } finally {
      setAiLoading((l) => ({ ...l, [id]: false }));
    }
  }

  /* ── Loading / Error ─────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14 }}>
        <RefreshCw size={22} style={{ color: "rgba(245,158,11,0.5)", animation: "spin 1.2s linear infinite" }} />
        <span style={{ fontSize: 13, color: "var(--text-3)" }}>Das Lab wird geladen…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div style={{
          textAlign: "center", padding: "32px 40px",
          background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 20,
        }}>
          <AlertTriangle size={28} style={{ color: "#f87171", margin: "0 auto 12px" }} />
          <p style={{ color: "#f87171", fontSize: 13, fontWeight: 500, marginBottom: 6 }}>Fehler beim Laden</p>
          <p style={{ fontSize: 11, color: "var(--text-3)", maxWidth: 300 }}>{error}</p>
          <button onClick={() => load()} className="btn-primary" style={{ marginTop: 20, fontSize: 13 }}>
            Erneut versuchen
          </button>
        </div>
      </div>
    );
  }

  const connectors = data?.connectors ?? [];
  const selected   = connectors.find((c) => c.id === selectedId) ?? connectors[0] ?? null;
  const isHost     = selected && HOST_TYPES.has(selected.type);

  if (connectors.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 className="page-title">Das Lab</h1>
            <p className="page-sub">Fleet-Übersicht · Metriken · SSH-Zugang</p>
          </div>
        </div>
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          flex: 1, gap: 16,
          background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20,
          padding: "64px 20px",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Plug size={28} style={{ color: "rgba(255,255,255,0.15)" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Noch keine Connectors</p>
            <p style={{ color: "var(--text-3)", fontSize: 12 }}>Verbinde Server, Dienste & mehr mit Nexboard.</p>
          </div>
          <Link to="/connectors" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
            <Plug size={13} /> Connector hinzufügen
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: 20, gap: 16 }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h1 className="page-title">Das Lab</h1>
          <p className="page-sub">Fleet-Übersicht · Metriken · SSH-Zugang</p>
        </div>
        <button
          onClick={() => load(true)}
          className="btn-ghost"
          disabled={refreshing}
          style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "7px 16px", flexShrink: 0, marginTop: 2 }}
        >
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Aktualisieren
        </button>
      </div>

      {/* ── Two-Column Layout ─────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

        {/* Fleet Panel */}
        <FleetPanel
          connectors={connectors}
          selectedId={selected?.id}
          onSelect={setSelectedId}
        />

        {/* Detail Pane */}
        {selected ? (
          isHost ? (
            <HostDetailPane
              connector={selected}
              allConnectors={connectors}
              aiResult={aiResults[selected.id]}
              aiLoading={aiLoading[selected.id]}
              onRunAi={() => runAi(selected.id)}
            />
          ) : (
            <ServiceDetailPane
              connector={selected}
              allConnectors={connectors}
              aiResult={aiResults[selected.id]}
              aiLoading={aiLoading[selected.id]}
              onRunAi={() => runAi(selected.id)}
            />
          )
        ) : null}
      </div>
    </div>
  );
}

/* ── VM-Kontrolle ────────────────────────────────────────────────────── */

function VmControlBlock({ connector, allConnectors }) {
  const [open, setOpen] = useState(false);

  const allVms = (connector.metrics.nodes ?? []).flatMap((n) =>
    (n.vms_detail ?? []).map((v) => ({ ...v })),
  );
  const consoleBase  = connector.metrics.console_base_url ?? "";
  const runningCount = allVms.filter((v) => v.status === "running").length;
  const dockerConnectors = (allConnectors ?? []).filter((c) => c.type === "docker");

  function portainerUrl(vmIp) {
    if (!vmIp) return null;
    for (const dc of dockerConnectors) {
      const dcHost = dc.metrics?.host ?? "";
      if (dcHost && (dcHost === vmIp || dcHost.includes(vmIp))) return `http://${vmIp}:9000`;
    }
    return null;
  }

  if (allVms.length === 0) return null;

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "7px 10px", borderRadius: 9,
          background: open ? "rgba(255,255,255,0.04)" : "transparent",
          border: "none", cursor: "pointer", transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.045)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = open ? "rgba(255,255,255,0.04)" : "transparent")}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.42)",
        }}>
          <Monitor size={11} />
          VMs
          <span style={{
            textTransform: "none", letterSpacing: 0, fontSize: 10,
            fontFamily: "'JetBrains Mono', monospace",
            color: runningCount > 0 ? "rgba(52,211,153,0.75)" : "rgba(255,255,255,0.3)",
            background: runningCount > 0 ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.05)",
            border: "1px solid rgba(52,211,153,0.2)", borderRadius: 5, padding: "1px 6px",
          }}>
            {runningCount}/{allVms.length} running
          </span>
        </div>
        <ChevronDown size={13} style={{
          color: "rgba(255,255,255,0.28)",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.22s",
        }} />
      </button>

      {open && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {allVms.map((vm) => (
            <VmRow
              key={`${vm.node}-${vm.vmid}`}
              vm={vm}
              connectorId={connector.id}
              consoleBase={consoleBase}
              portainerUrl={portainerUrl(vm.ip)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function VmRow({ vm, connectorId, consoleBase, portainerUrl }) {
  const [acting, setActing]     = useState(null);
  const [feedback, setFeedback] = useState(null);
  const dotColor  = VM_STATUS_COLOR[vm.status] ?? "rgba(255,255,255,0.25)";
  const isRunning = vm.status === "running";

  async function doAction(action) {
    setActing(action); setFeedback(null);
    try {
      await api.proxmox.vmAction(connectorId, vm.node, vm.vmid, action);
      const msg = { reboot: "Neustart angefordert", start: "Start angefordert", stop: "Stop angefordert" };
      setFeedback({ ok: true, msg: msg[action] ?? "OK" });
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    } finally { setActing(null); }
  }

  const noVncHref    = consoleBase ? `${consoleBase}/?console=kvm&novnc=1&vmid=${vm.vmid}&vmname=${encodeURIComponent(vm.name)}&node=${vm.node}&resize=off` : null;
  const proxmoxUiHref = consoleBase ? `${consoleBase}/#v1:0:=qemu/${vm.vmid}` : null;

  return (
    <div style={{
      borderRadius: 12, padding: "10px 12px",
      background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.055)",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 500, color: "rgba(255,255,255,0.80)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {vm.name}
        </span>
        <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.26)" }}>
          vm-{vm.vmid} · {vm.node}
        </span>
        {vm.ip && (
          <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(45,212,191,0.55)" }}>
            {vm.ip}
          </span>
        )}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        {isRunning && noVncHref && (
          <a href={noVncHref} target="_blank" rel="noopener noreferrer" className="vm-btn vm-btn-ghost" style={{ textDecoration: "none" }}>
            <Monitor size={10} /> noVNC
          </a>
        )}
        {proxmoxUiHref && (
          <a href={proxmoxUiHref} target="_blank" rel="noopener noreferrer" className="vm-btn vm-btn-ghost" style={{ textDecoration: "none" }}>
            <ExternalLink size={10} /> Proxmox
          </a>
        )}
        {portainerUrl && isRunning && (
          <a href={portainerUrl} target="_blank" rel="noopener noreferrer" className="vm-btn vm-btn-ghost" style={{ textDecoration: "none" }}>
            <Package size={10} /> Portainer
          </a>
        )}
        <div style={{ flex: 1 }} />
        {isRunning ? (
          <button onClick={() => doAction("reboot")} disabled={!!acting} className="vm-btn vm-btn-ghost" style={{ opacity: acting ? 0.4 : 1 }}>
            <RotateCcw size={10} className={acting === "reboot" ? "animate-spin" : ""} /> Restart
          </button>
        ) : (
          <button onClick={() => doAction("start")} disabled={!!acting} className="vm-btn vm-btn-green" style={{ opacity: acting ? 0.4 : 1 }}>
            <Power size={10} className={acting === "start" ? "animate-pulse" : ""} /> Start
          </button>
        )}
      </div>
      {feedback && (
        <div style={{ fontSize: 10, marginTop: 6, color: feedback.ok ? "#34d399" : "#f87171" }}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
}

/* ── SSH Hint ────────────────────────────────────────────────────────── */

function SshHint({ config }) {
  const host = config?.host ?? config?.url ?? "";
  if (!host) return null;
  const displayHost = host.replace(/^https?:\/\//, "").replace(/:\d+$/, "");
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 7,
      background: "rgba(45,212,191,0.06)",
      border: "1px solid rgba(45,212,191,0.15)",
      borderRadius: 8, padding: "7px 10px", fontSize: 11,
    }}>
      <TerminalSquare size={12} style={{ color: "#2dd4bf", flexShrink: 0 }} />
      <span style={{ color: "rgba(255,255,255,0.55)" }}>
        SSH-Terminal: Server als{" "}
        <span style={{ color: "#2dd4bf", fontWeight: 500 }}>Linux SSH</span>
        {" "}Connector einbinden
        {displayHost && (
          <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.35)", marginLeft: 5 }}>
            · {displayHost}
          </span>
        )}
      </span>
    </div>
  );
}

/* ── KI-Block ────────────────────────────────────────────────────────── */

function AiBlock({ result }) {
  if (result.error) {
    return (
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, fontSize: 11.5, color: "#f87171" }}>
        KI-Fehler: {result.error}
      </div>
    );
  }
  const sev = SEVERITY[result.severity] ?? "text-white/55 bg-black/20 border-white/10";
  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "#c084fc", fontWeight: 600 }}>
        <Sparkles size={11} /> KI-Analyse
      </div>
      <div className={`text-xs rounded-lg px-3 py-2 border ${sev}`}>{result.explanation}</div>
      {result.actions?.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {result.actions.map((a, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 11.5, color: "var(--text-3)" }}>
              <span style={{ color: "#c084fc", flexShrink: 0 }}>{i + 1}.</span>
              <span>{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Status Timeline ─────────────────────────────────────────────────── */

const SNAP_COLOR = {
  online:  "#34d399",
  warning: "#fbbf24",
  offline: "#f87171",
  error:   "#f87171",
  unknown: "rgba(255,255,255,0.15)",
};

function StatusTimeline({ snapshots }) {
  if (!snapshots?.length) return null;

  const now    = Date.now();
  const window = 24 * 60 * 60 * 1000;
  const start  = now - window;

  const onlineCount = snapshots.filter((s) => s.status === "online").length;
  const uptime = Math.round((onlineCount / snapshots.length) * 100);
  const uptimeColor = uptime >= 99 ? "#34d399" : uptime >= 90 ? "#fbbf24" : "#f87171";

  let lastChange = null;
  for (let i = snapshots.length - 1; i > 0; i--) {
    if (snapshots[i].status !== snapshots[i - 1].status) {
      lastChange = snapshots[i];
      break;
    }
  }

  const segments = [];
  if (snapshots.length > 0) {
    let segStart = new Date(snapshots[0].captured_at).getTime();
    let segStatus = snapshots[0].status;
    for (let i = 1; i < snapshots.length; i++) {
      const t = new Date(snapshots[i].captured_at).getTime();
      if (snapshots[i].status !== segStatus) {
        segments.push({ from: segStart, to: t, status: segStatus });
        segStart  = t;
        segStatus = snapshots[i].status;
      }
    }
    segments.push({ from: segStart, to: now, status: segStatus });
  }

  function toX(ts) {
    return Math.max(0, Math.min(100, ((ts - start) / window) * 100));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 11, color: uptimeColor, fontWeight: 600 }}>{uptime}% Uptime</span>
        <span style={{ fontSize: 10, color: "var(--text-3)" }}>{snapshots.length} Messpunkte</span>
        {lastChange && (
          <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: "auto" }}>
            Letzter Wechsel: {new Date(lastChange.captured_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>
      <div style={{ position: "relative" }}>
        <svg viewBox="0 0 400 20" style={{ width: "100%", height: 20, display: "block", borderRadius: 4, overflow: "hidden" }}>
          <rect x="0" y="0" width="400" height="20" fill="rgba(0,0,0,0.3)" />
          {segments.map((seg, i) => {
            const x1 = toX(seg.from) * 4;
            const x2 = toX(seg.to) * 4;
            const w  = Math.max(1, x2 - x1);
            return <rect key={i} x={x1} y="0" width={w} height="20" fill={SNAP_COLOR[seg.status] ?? SNAP_COLOR.unknown} opacity="0.85" />;
          })}
          {[25, 50, 75].map((pct) => (
            <line key={pct} x1={pct * 4} y1="0" x2={pct * 4} y2="20" stroke="rgba(0,0,0,0.4)" strokeWidth="1" />
          ))}
        </svg>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
          {["-24h", "-18h", "-12h", "-6h", "Jetzt"].map((l) => (
            <span key={l} style={{ fontSize: 9, color: "rgba(255,255,255,0.22)" }}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Metric Chart ────────────────────────────────────────────────────── */

function MetricChart({ connectorId, metricKey, label, color = "#F59E0B", unit = "%" }) {
  const [chartData, setChartData] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      setChartLoading(true); setErr(null);
      try {
        const d = await api.status.metricHistory(connectorId, metricKey, 24, 80);
        if (!cancelled) setChartData(d);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [connectorId, metricKey]);

  if (chartLoading) return <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Lade {label}…</div>;
  if (err)          return <div style={{ fontSize: 11, color: "#f87171" }}>{err}</div>;
  if (!chartData?.values?.length) return null;

  const points = chartData.labels.map((ts, i) => ({
    t: new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
    v: chartData.values[i],
  }));

  return (
    <div style={{
      background: "rgba(0,0,0,0.18)", border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 12, padding: "10px 12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 10.5, color, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color, opacity: 0.85 }}>
          {chartData.values[chartData.values.length - 1]?.toFixed(1)}{unit}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={72}>
        <LineChart data={points} margin={{ top: 2, right: 4, left: -30, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="t" tick={{ fontSize: 8.5, fill: "rgba(255,255,255,0.25)" }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 8.5, fill: "rgba(255,255,255,0.25)" }} domain={[0, 100]} unit={unit} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{
              background: "rgba(10,10,20,0.92)", backdropFilter: "blur(12px)",
              border: `1px solid ${color}40`, borderRadius: 10, fontSize: 11, padding: "6px 10px",
            }}
            itemStyle={{ color }}
            labelStyle={{ color: "rgba(255,255,255,0.45)", fontSize: 10 }}
            formatter={(v) => [`${v?.toFixed(1)}${unit}`, label]}
          />
          <Line type="monotone" dataKey="v" stroke={color} dot={false} strokeWidth={1.8} strokeLinecap="round" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ── History Block ───────────────────────────────────────────────────── */

function HistoryBlock({ connectorId, connectorType }) {
  const [open, setOpen]           = useState(false);
  const [histData, setHistData]   = useState(null);
  const [histLoading, setHistLoading] = useState(false);
  const [err, setErr]             = useState(null);

  const showCharts = connectorType === "linux_probe" || connectorType === "linux_ssh";

  async function loadHist() {
    setHistLoading(true); setErr(null);
    try {
      const d = await api.status.history(connectorId, 24);
      setHistData(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setHistLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !histData) loadHist();
  }

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
      <button
        onClick={toggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "7px 10px", borderRadius: 9,
          background: open ? "rgba(255,255,255,0.04)" : "transparent",
          border: "none", cursor: "pointer", transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.045)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = open ? "rgba(255,255,255,0.04)" : "transparent")}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.38)",
        }}>
          <History size={11} />
          Verlauf &amp; Metriken
          <span style={{ fontSize: 9.5, letterSpacing: 0, textTransform: "none", color: "rgba(255,255,255,0.22)", fontWeight: 400 }}>24h</span>
        </div>
        <ChevronDown size={13} style={{
          color: "rgba(255,255,255,0.28)",
          transform: open ? "rotate(180deg)" : "rotate(0deg)",
          transition: "transform 0.22s",
        }} />
      </button>

      {open && (
        <div style={{ padding: "8px 8px 4px", display: "flex", flexDirection: "column", gap: 12 }}>
          {histLoading ? (
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>Lade Verlauf…</span>
          ) : err ? (
            <span style={{ fontSize: 11, color: "#f87171" }}>{err}</span>
          ) : !histData?.snapshots?.length ? (
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              Noch keine Daten – Snapshots werden alle 60 Sek. aufgezeichnet.
            </span>
          ) : (
            <StatusTimeline snapshots={histData.snapshots} />
          )}

          {showCharts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <MetricChart connectorId={connectorId} metricKey="cpu_pct" label="CPU"  color="#F59E0B" unit="%" />
              <MetricChart connectorId={connectorId} metricKey="mem_pct" label="RAM"  color="#60a5fa" unit="%" />
              <MetricChart connectorId={connectorId} metricKey="disk_pct" label="Disk" color="#34d399" unit="%" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Wake-on-LAN ─────────────────────────────────────────────────────── */

function WolButton({ connectorId, isOnline }) {
  const [sending, setSending]   = useState(false);
  const [feedback, setFeedback] = useState(null);

  async function wake() {
    setSending(true); setFeedback(null);
    try {
      await api.wol.wake(connectorId);
      setFeedback({ ok: true, msg: "Magic Packet gesendet – Gerät startet…" });
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    } finally { setSending(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          onClick={wake}
          disabled={sending || isOnline}
          className="vm-btn vm-btn-teal"
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 11.5, padding: "6px 14px", borderRadius: 7,
            opacity: (sending || isOnline) ? 0.5 : 1,
            cursor: (sending || isOnline) ? "default" : "pointer",
          }}
        >
          <Zap size={12} className={sending ? "animate-pulse" : ""} />
          {sending ? "Sende…" : "Wake Up"}
        </button>
        {isOnline && <span style={{ fontSize: 11, color: "#34d399" }}>Gerät ist bereits online</span>}
      </div>
      {feedback && (
        <div style={{
          fontSize: 11, padding: "6px 10px", borderRadius: 8,
          color: feedback.ok ? "#34d399" : "#f87171",
          background: feedback.ok ? "rgba(52,211,153,0.07)" : "rgba(248,113,113,0.07)",
          border: `1px solid ${feedback.ok ? "rgba(52,211,153,0.2)" : "rgba(248,113,113,0.2)"}`,
        }}>
          {feedback.msg}
        </div>
      )}
    </div>
  );
}
