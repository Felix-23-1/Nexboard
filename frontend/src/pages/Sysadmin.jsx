/**
 * IT-Ansicht – vollständige Metriken, VM-Kontrolle
 * Connector-Karten sind per Drag & Drop verschiebbar.
 * Help Desk wurde in FloatingChat (global) ausgelagert.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  RefreshCw, Sparkles, AlertTriangle,
  Power, RotateCcw, Monitor,
  Terminal, ExternalLink, Package, ChevronDown, TerminalSquare,
  GripVertical, Plug, History, Globe, Play, Square, RefreshCcw, Zap,
  Cpu,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "../api/client";
import ConnectorIcon from "../components/ConnectorIcon";
import ConnectorMetrics from "../components/ConnectorMetrics";
import SSHTerminalModal from "../components/SSHTerminalModal";
import ScriptRunner from "../components/ScriptRunner";

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
  linux_ssh:      "Linux Server (SSH)",
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
  online:  { color: "#34d399", shadow: "0 0 6px #34d399aa" },
  warning: { color: "#fbbf24", shadow: "0 0 6px #fbbf24aa" },
  offline: { color: "#f87171", shadow: "0 0 6px #f87171aa" },
  error:   { color: "#f87171", shadow: "0 0 6px #f87171aa" },
  unknown: { color: "rgba(255,255,255,0.2)", shadow: "none" },
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

/* ── Service-URL ableiten ─────────────────────────────────────────── */

const NO_WEB_TYPES = new Set(["linux_ssh", "linux_probe", "wol", "bookmarks"]);
const HOST_TYPES   = new Set(["linux_probe", "linux_ssh"]);

function getServiceUrl(c) {
  if (NO_WEB_TYPES.has(c.type)) return null;
  const cfg = c.config ?? {};
  if (cfg.url) return cfg.url;
  if (cfg.host) {
    const port = cfg.port;
    const scheme = cfg.use_tls ? "https" : "http";
    if (port && port !== 80 && port !== 443) return `${scheme}://${cfg.host}:${port}`;
    return `${scheme}://${cfg.host}`;
  }
  return null;
}

/* ── Hauptseite ─────────────────────────────────────────────────────── */

export default function Sysadmin() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(null);
  const [aiResults, setAiResults] = useState({});
  const [aiLoading, setAiLoading] = useState({});
  const [widgetOrder, setWidgetOrder] = useState(null);
  const [activeHost, setActiveHost]   = useState(null); // null = Alle
  const dragId = useRef(null);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      setData(await api.status.detailed());
      if (!widgetOrder) {
        const saved = localStorage.getItem("nb_sysadmin_order");
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

  /* ── Drag & Drop ────────────────────────────────────────────────── */
  function handleDragStart(id) { dragId.current = id; }

  function handleDragOver(targetId) {
    if (!dragId.current || dragId.current === targetId) return;
    const list = sortedConnectors();
    const from = list.findIndex((c) => c.id === dragId.current);
    const to   = list.findIndex((c) => c.id === targetId);
    if (from === -1 || to === -1) return;
    const order = list.map((c) => c.id);
    order.splice(from, 1);
    order.splice(to, 0, dragId.current);
    setWidgetOrder(order);
    localStorage.setItem("nb_sysadmin_order", JSON.stringify(order));
  }

  function handleDrop() { dragId.current = null; }

  function sortedConnectors() {
    const list = data?.connectors ?? [];
    if (!widgetOrder) return list;
    const map = Object.fromEntries(list.map((c) => [c.id, c]));
    const sorted = widgetOrder.map((id) => map[id]).filter(Boolean);
    list.forEach((c) => { if (!widgetOrder.includes(c.id)) sorted.push(c); });
    return sorted;
  }

  /* ── Render ─────────────────────────────────────────────────────── */
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
          background: "rgba(248,113,113,0.05)", border: "1px solid rgba(248,113,113,0.15)",
          borderRadius: 20,
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

  const connectors = sortedConnectors();
  const hostConnectors = connectors.filter((c) => HOST_TYPES.has(c.type));
  const visibleConnectors = activeHost
    ? connectors.filter((c) => c.id === activeHost)
    : connectors;

  // Summary stats
  const total    = connectors.length;
  const online   = connectors.filter((c) => c.status === "online").length;
  const warnings = connectors.filter((c) => c.status === "warning").length;
  const offline  = connectors.filter((c) => c.status === "offline" || c.status === "error").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: 20, gap: 18 }}>

      {/* ── Topbar ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h1 className="page-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            Das Lab
          </h1>
          <p className="page-sub">Vollständige Metriken · Container-Kontrolle · SSH-Zugang</p>
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

      {/* ── Summary Stats ─────────────────────────────────────────── */}
      {total > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            { label: "Connectors",  value: total,    color: "rgba(255,255,255,0.55)", bg: "rgba(255,255,255,0.05)" },
            { label: "Online",      value: online,   color: "#34d399",               bg: "rgba(52,211,153,0.08)"  },
            { label: "Warnungen",   value: warnings, color: "#fbbf24",               bg: "rgba(251,191,36,0.08)"  },
            { label: "Offline",     value: offline,  color: "#f87171",               bg: "rgba(248,113,113,0.08)" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} style={{
              display: "flex", alignItems: "center", gap: 8,
              background: bg, border: `1px solid ${color}25`,
              borderRadius: 10, padding: "6px 14px",
            }}>
              <span style={{ fontSize: 16, fontWeight: 700, color, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>
                {value}
              </span>
              <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── Host-Switcher (nur wenn ≥2 Server-Connectoren) ────────── */}
      {hostConnectors.length > 1 && (
        <div style={{
          display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center",
          background: "rgba(255,255,255,0.028)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderRadius: 14, padding: "8px 12px",
        }}>
          <span style={{ fontSize: 10, letterSpacing: "0.08em", color: "rgba(255,255,255,0.25)", textTransform: "uppercase", fontWeight: 600, marginRight: 4 }}>
            Host
          </span>
          <button
            onClick={() => setActiveHost(null)}
            style={{
              fontSize: 12, padding: "5px 14px", borderRadius: 9,
              border: activeHost === null ? "1px solid rgba(245,158,11,0.4)" : "1px solid transparent",
              cursor: "pointer", transition: "all 0.18s",
              background: activeHost === null ? "rgba(245,158,11,0.14)" : "transparent",
              color: activeHost === null ? "#F59E0B" : "rgba(255,255,255,0.4)",
              fontWeight: activeHost === null ? 600 : 400,
              boxShadow: activeHost === null ? "0 0 12px rgba(245,158,11,0.15)" : "none",
            }}
          >
            Alle
          </button>
          {hostConnectors.map((c) => {
            const isActive = activeHost === c.id;
            const dot = STATUS_DOT[c.status] ?? STATUS_DOT.unknown;
            const tc  = TYPE_COLOR[c.type] ?? "#F59E0B";
            return (
              <button
                key={c.id}
                onClick={() => setActiveHost(isActive ? null : c.id)}
                style={{
                  fontSize: 12, padding: "5px 14px", borderRadius: 9,
                  border: isActive ? `1px solid ${tc}55` : "1px solid transparent",
                  cursor: "pointer", transition: "all 0.18s",
                  background: isActive ? `${tc}18` : "transparent",
                  color: isActive ? tc : "rgba(255,255,255,0.5)",
                  fontWeight: isActive ? 600 : 400,
                  display: "flex", alignItems: "center", gap: 7,
                  boxShadow: isActive ? `0 0 14px ${tc}20` : "none",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: dot.color, boxShadow: isActive ? dot.shadow : "none", flexShrink: 0, transition: "box-shadow 0.2s" }} />
                {c.metrics?.hostname || c.name}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Widget-Liste ──────────────────────────────────────────── */}
      {visibleConnectors.length === 0 ? (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "64px 20px", gap: 16,
          background: "rgba(255,255,255,0.025)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(255,255,255,0.07)", borderRadius: 20,
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Plug size={28} style={{ color: "rgba(255,255,255,0.15)" }} />
          </div>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: "var(--text-2)", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
              Noch keine Connectors konfiguriert
            </p>
            <p style={{ color: "var(--text-3)", fontSize: 12 }}>
              Verbinde deine Dienste und Server mit Nexboard.
            </p>
          </div>
          <Link to="/connectors" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}>
            <Plug size={13} /> Connector hinzufügen
          </Link>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="section-label" style={{ marginBottom: 0 }}>
              {activeHost ? "Host-Detail" : "Alle Connectors"}
            </span>
            <span style={{ fontSize: 10, color: "var(--text-3)", letterSpacing: "0.04em" }}>
              Drag &amp; Drop zum Sortieren
            </span>
          </div>

          <div
            style={{ display: "flex", flexDirection: "column", gap: 12 }}
            onDragEnd={handleDrop}
          >
            {visibleConnectors.map((c) => (
              <ConnectorCard
                key={c.id}
                connector={c}
                allConnectors={connectors}
                aiResult={aiResults[c.id]}
                aiLoading={aiLoading[c.id]}
                proEnabled={true}
                historyEnabled={true}
                dragging={dragId.current === c.id}
                onRunAi={() => runAi(c.id)}
                onDragStart={() => handleDragStart(c.id)}
                onDragOver={() => handleDragOver(c.id)}
                onDrop={handleDrop}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Connector-Widget (draggbar) ─────────────────────────────────── */

function ConnectorCard({
  connector: c, allConnectors,
  aiResult, aiLoading: aiLoad,
  dragging, onRunAi, onDragStart, onDragOver, onDrop,
}) {
  const [sshTermOpen, setSshTermOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const tc   = TYPE_COLOR[c.type] ?? "#F59E0B";
  const dot  = STATUS_DOT[c.status] ?? STATUS_DOT.unknown;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDrop={onDrop}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: "rgba(255,255,255,0.042)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${dragging ? `${tc}55` : hovered ? `${tc}28` : "rgba(255,255,255,0.08)"}`,
        borderLeft: `3px solid ${tc}`,
        borderRadius: 16,
        padding: "16px 18px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        opacity: dragging ? 0.48 : 1,
        transition: "border-color 0.2s, opacity 0.15s, box-shadow 0.25s",
        boxShadow: dragging
          ? `0 0 0 2px ${tc}30, 0 8px 32px rgba(0,0,0,0.3)`
          : hovered
          ? `0 4px 28px rgba(0,0,0,0.25), 0 0 0 1px ${tc}18`
          : "0 2px 12px rgba(0,0,0,0.15)",
        cursor: "default",
      }}
    >
      {/* ── Header ────────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {/* Drag-Handle */}
        <div
          style={{
            cursor: "grab", flexShrink: 0,
            color: hovered ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.15)",
            transition: "color 0.2s",
          }}
          title="Ziehen zum Verschieben"
        >
          <GripVertical size={14} />
        </div>

        {/* Icon box — type-colored */}
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: `${tc}18`,
          border: `1px solid ${tc}35`,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0, color: tc,
          transition: "background 0.2s, border-color 0.2s",
          boxShadow: hovered ? `0 0 12px ${tc}25` : "none",
        }}>
          <ConnectorIcon icon={TYPE_ICON[c.type] ?? "settings"} size={18} />
        </div>

        {/* Name + Typ + Status dot */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13.5, fontWeight: 600, color: "var(--text-1)",
            display: "flex", alignItems: "center", gap: 8,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {/* Glowing status dot */}
            <span style={{
              width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
              background: dot.color,
              boxShadow: dot.shadow,
              display: "inline-block",
              transition: "box-shadow 0.3s",
            }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
            {!c.enabled && (
              <span style={{
                fontSize: 9.5, color: "var(--text-3)", flexShrink: 0,
                border: "1px solid rgba(255,255,255,0.10)", borderRadius: 5,
                padding: "1px 6px",
              }}>
                deaktiviert
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: tc, opacity: 0.7, fontWeight: 500 }}>{TYPE_LABEL[c.type] ?? c.type}</span>
            {c.metrics?.hostname && (
              <>
                <span style={{ opacity: 0.3 }}>·</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, opacity: 0.55 }}>
                  {c.metrics.hostname}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {getServiceUrl(c) && (
            <a
              href={getServiceUrl(c)}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-ghost"
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "5px 11px", textDecoration: "none" }}
              title={`${c.name} öffnen`}
            >
              <Globe size={12} />
              Öffnen
            </a>
          )}
          <button
            onClick={onRunAi}
            disabled={aiLoad}
            className="btn-ghost"
            style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, padding: "5px 11px" }}
            title="KI-Analyse starten"
          >
            <Sparkles size={12} className={aiLoad ? "animate-pulse" : ""} />
            KI
          </button>
        </div>
      </div>

      {/* ── Fehler ────────────────────────────────────────────────── */}
      {c.error && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 8,
          fontSize: 11.5, color: "#f87171",
          background: "rgba(248,113,113,0.06)", border: "1px solid rgba(248,113,113,0.15)",
          borderRadius: 10, padding: "8px 12px",
        }}>
          <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{c.error}</span>
        </div>
      )}

      {/* ── Metriken ──────────────────────────────────────────────── */}
      <ConnectorMetrics type={c.type} metrics={c.metrics} connectorId={c.id} />

      {/* ── VM-Kontrolle (nur Proxmox) ────────────────────────────── */}
      {c.type === "proxmox" && c.metrics?.nodes?.length > 0 && (
        <VmControlBlock connector={c} allConnectors={allConnectors} />
      )}

      {/* ── SSH-Terminal + Script-Runner (linux_ssh + linux_probe) ── */}
      {(c.type === "linux_ssh" || c.type === "linux_probe") && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setSshTermOpen(true)}
            className="vm-btn vm-btn-teal"
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, padding: "5px 12px", borderRadius: 7, cursor: "pointer" }}
          >
            <TerminalSquare size={12} /> SSH Terminal
          </button>
          {sshTermOpen && (
            <SSHTerminalModal connector={c} onClose={() => setSshTermOpen(false)} />
          )}
        </div>
      )}
      {(c.type === "linux_ssh" || c.type === "linux_probe") && <ScriptRunner connectorId={c.id} />}

      {/* ── Wake-on-LAN Button ────────────────────────────────── */}
      {c.type === "wol" && <WolButton connectorId={c.id} isOnline={c.status === "online"} />}

      {/* ── SSH-Hinweis (TrueNAS, Synology, Proxmox Backup) ─────── */}
      {(c.type === "truenas" || c.type === "synology" || c.type === "proxmox_backup") && (
        <SshHint config={c.config} />
      )}

      {/* ── KI-Ergebnis ───────────────────────────────────────────── */}
      {aiResult && <AiBlock result={aiResult} />}

      {/* ── History & Trends ──────────────────────────────────────── */}
      <HistoryBlock connectorId={c.id} connectorType={c.type} />
    </div>
  );
}

/* ── VM-Kontrolle (aufklappbar) ─────────────────────────────────── */

function VmControlBlock({ connector, allConnectors }) {
  const [open, setOpen]               = useState(false);

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
    <>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
        {/* Accordion-Header */}
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "7px 10px", borderRadius: 9, background: open ? "rgba(255,255,255,0.04)" : "transparent",
            border: "none", cursor: "pointer", transition: "background 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.045)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = open ? "rgba(255,255,255,0.04)" : "transparent")}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8,
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
          <ChevronDown
            size={13}
            style={{
              color: "rgba(255,255,255,0.28)",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.22s",
            }}
          />
        </button>

        {/* VM-Zeilen */}
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

    </>
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
  const sshHref      = vm.ip ? `ssh://root@${vm.ip}` : null;

  return (
    <div style={{
      borderRadius: 12, padding: "10px 12px",
      background: "rgba(0,0,0,0.22)", border: "1px solid rgba(255,255,255,0.055)",
    }}>
      {/* Name + Meta */}
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

      {/* Buttons */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        {isRunning && (
          <>
            {vm.ip && (
              <span
                className="vm-btn vm-btn-teal"
                title={`SSH-Terminal: VM als "Linux Server (SSH)" Connector einbinden → Host: ${vm.ip}`}
                style={{ cursor: "default", fontSize: 9, opacity: 0.7 }}
              >
                <TerminalSquare size={9} /> SSH einbinden · {vm.ip}
              </span>
            )}
            {noVncHref && (
              <a href={noVncHref} target="_blank" rel="noopener noreferrer" className="vm-btn vm-btn-ghost" style={{ textDecoration: "none" }} title="noVNC Grafik-Console">
                <Monitor size={10} /> noVNC
              </a>
            )}
          </>
        )}
        {proxmoxUiHref && (
          <a href={proxmoxUiHref} target="_blank" rel="noopener noreferrer" className="vm-btn vm-btn-ghost" style={{ textDecoration: "none" }} title="Proxmox Web-UI">
            <ExternalLink size={10} /> Proxmox
          </a>
        )}
        {portainerUrl && isRunning && (
          <a href={portainerUrl} target="_blank" rel="noopener noreferrer" className="vm-btn vm-btn-ghost" style={{ textDecoration: "none" }} title="Portainer">
            <Package size={10} /> Portainer
          </a>
        )}

        <div style={{ flex: 1 }} />

        {isRunning ? (
          <button onClick={() => doAction("reboot")} disabled={!!acting} className="vm-btn vm-btn-ghost" style={{ opacity: acting ? 0.4 : 1 }} title="VM neu starten">
            <RotateCcw size={10} className={acting === "reboot" ? "animate-spin" : ""} /> Restart
          </button>
        ) : (
          <button onClick={() => doAction("start")} disabled={!!acting} className="vm-btn vm-btn-green" style={{ opacity: acting ? 0.4 : 1 }} title="VM starten">
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

/* ── KI-Analyse Block ────────────────────────────────────────────── */

function SshHint({ config }) {
  const host = config?.host ?? config?.url ?? "";
  if (!host) return null;
  // Strip protocol from URL if present
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
        SSH-Terminal verfügbar – diesen Server als{" "}
        <span style={{ color: "#2dd4bf", fontWeight: 500 }}>Linux Server (SSH)</span>
        {" "}Connector einbinden
        {displayHost && (
          <span style={{ fontFamily: "monospace", color: "rgba(255,255,255,0.35)", marginLeft: 5 }}>
            · Host: {displayHost}
          </span>
        )}
      </span>
    </div>
  );
}

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

/* ── History & Trends Block ──────────────────────────────────────── */

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
  const window = 24 * 60 * 60 * 1000; // 24h in ms
  const start  = now - window;

  // Uptime berechnen
  const onlineCount = snapshots.filter((s) => s.status === "online").length;
  const uptime = Math.round((onlineCount / snapshots.length) * 100);
  const uptimeColor = uptime >= 99 ? "#34d399" : uptime >= 90 ? "#fbbf24" : "#f87171";

  // Letzten Statuswechsel finden
  let lastChange = null;
  for (let i = snapshots.length - 1; i > 0; i--) {
    if (snapshots[i].status !== snapshots[i - 1].status) {
      lastChange = snapshots[i];
      break;
    }
  }

  // Timeline-Segmente: aufeinander folgende Snapshots gleichen Status zusammenfassen
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
    // Letztes Segment bis jetzt
    segments.push({ from: segStart, to: now, status: segStatus });
  }

  // x-Position in % innerhalb des 24h-Fensters berechnen
  function toX(ts) {
    return Math.max(0, Math.min(100, ((ts - start) / window) * 100));
  }

  // Zeitachsen-Labels
  const labels = [
    { label: "-24h", x: 0   },
    { label: "-18h", x: 25  },
    { label: "-12h", x: 50  },
    { label:  "-6h", x: 75  },
    { label: "Jetzt", x: 100 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>

      {/* Uptime + letzter Wechsel */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ fontSize: 11, color: uptimeColor, fontWeight: 600 }}>
          {uptime}% Uptime
        </span>
        <span style={{ fontSize: 10, color: "var(--text-3)" }}>
          {snapshots.length} Messpunkte
        </span>
        {lastChange && (
          <span style={{ fontSize: 10, color: "var(--text-3)", marginLeft: "auto" }}>
            Letzter Wechsel: {new Date(lastChange.captured_at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      {/* Timeline-Balken als SVG */}
      <div style={{ position: "relative" }}>
        <svg
          viewBox="0 0 400 20"
          style={{ width: "100%", height: 20, display: "block", borderRadius: 4, overflow: "hidden" }}
        >
          {/* Hintergrund */}
          <rect x="0" y="0" width="400" height="20" fill="rgba(0,0,0,0.3)" />

          {/* Status-Segmente */}
          {segments.map((seg, i) => {
            const x1 = toX(seg.from) * 4; // * 4 weil viewBox = 400
            const x2 = toX(seg.to) * 4;
            const w  = Math.max(1, x2 - x1);
            return (
              <rect
                key={i}
                x={x1} y="0" width={w} height="20"
                fill={SNAP_COLOR[seg.status] ?? SNAP_COLOR.unknown}
                opacity="0.85"
              />
            );
          })}

          {/* Stunden-Gitternetz */}
          {[25, 50, 75].map((pct) => (
            <line
              key={pct}
              x1={pct * 4} y1="0" x2={pct * 4} y2="20"
              stroke="rgba(0,0,0,0.4)" strokeWidth="1"
            />
          ))}
        </svg>

        {/* Zeitachse */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
          {labels.map(({ label, x }) => (
            <span
              key={x}
              style={{
                fontSize: 9, color: "rgba(255,255,255,0.22)",
                position: x === 0 ? "static" : x === 100 ? "static" : "absolute",
                ...(x > 0 && x < 100 ? { left: `${x}%`, transform: "translateX(-50%)" } : {}),
              }}
            >
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Metric Line Chart (Recharts) ────────────────────────────────── */

function MetricChart({ connectorId, metricKey, label, color = "#F59E0B", unit = "%" }) {
  const [chartData, setChartData] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [err, setErr]             = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetch() {
      setLoading(true); setErr(null);
      try {
        const d = await api.status.metricHistory(connectorId, metricKey, 24, 80);
        if (!cancelled) setChartData(d);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetch();
    return () => { cancelled = true; };
  }, [connectorId, metricKey]);

  if (loading) return <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>Lade {label}…</div>;
  if (err)     return <div style={{ fontSize: 11, color: "#f87171" }}>{err}</div>;
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
        <span style={{ fontSize: 10.5, color: color, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {label}
        </span>
        {chartData?.values?.length > 0 && (
          <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color, opacity: 0.85 }}>
            {chartData.values[chartData.values.length - 1]?.toFixed(1)}{unit}
          </span>
        )}
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
          <Line
            type="monotone" dataKey="v" stroke={color}
            dot={false} strokeWidth={1.8}
            strokeLinecap="round"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function HistoryBlock({ connectorId, connectorType }) {
  const [open, setOpen]       = useState(false);
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState(null);

  const showCharts = connectorType === "linux_probe" || connectorType === "linux_ssh";

  async function load() {
    setLoading(true); setErr(null);
    try {
      const d = await api.status.history(connectorId, 24);
      setData(d);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !data) load();
  }

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
      {/* Accordion-Header */}
      <button
        onClick={toggle}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "7px 10px", borderRadius: 9, background: open ? "rgba(255,255,255,0.04)" : "transparent",
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
        <ChevronDown
          size={13}
          style={{
            color: "rgba(255,255,255,0.28)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.22s",
          }}
        />
      </button>

      {/* Inhalt */}
      {open && (
        <div style={{ padding: "8px 8px 4px", display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>Lade Verlauf…</span>
          ) : err ? (
            <span style={{ fontSize: 11, color: "#f87171" }}>{err}</span>
          ) : !data?.snapshots?.length ? (
            <span style={{ fontSize: 11, color: "var(--text-3)" }}>
              Noch keine Daten – Snapshots werden alle 60 Sek. aufgezeichnet.
            </span>
          ) : (
            <StatusTimeline snapshots={data.snapshots} />
          )}

          {/* Metric Charts für Server-Connectors */}
          {showCharts && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
              <MetricChart connectorId={connectorId} metricKey="cpu_pct" label="CPU" color="#F59E0B" unit="%" />
              <MetricChart connectorId={connectorId} metricKey="mem_pct" label="RAM" color="#60a5fa" unit="%" />
              <MetricChart connectorId={connectorId} metricKey="disk_pct" label="Disk" color="#34d399" unit="%" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Wake-on-LAN Button ──────────────────────────────────────────── */

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
    } finally {
      setSending(false);
    }
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
          title={isOnline ? "Gerät ist bereits online" : "Magic Packet senden"}
        >
          <Zap size={12} className={sending ? "animate-pulse" : ""} />
          {sending ? "Sende…" : "Wake Up"}
        </button>
        {isOnline && (
          <span style={{ fontSize: 11, color: "#34d399" }}>
            Gerät ist bereits online
          </span>
        )}
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
