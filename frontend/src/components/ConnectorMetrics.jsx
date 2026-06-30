import { useState } from "react";
import { Server, Activity, HardDrive, Network, Wifi, Terminal, Cloud, Archive, Shield, BarChart2, ChevronDown, ChevronUp, Database, Play, Square, RefreshCcw, Loader, Cpu, Thermometer, Lock, Globe, Layers, Bookmark, AlertTriangle, CheckCircle, XCircle, Zap } from "lucide-react";
import MetricBar from "./MetricBar";
import { formatBytes, formatUptime, num, pct, toPercent } from "../utils/format";
import { api } from "../api/client";

// --- Gemeinsame Bausteine -----------------------------------------------------

function StatTiles({ tiles }) {
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0, 1fr))` }}
    >
      {tiles.map((t) => (
        <div key={t.label} className="bg-black/20 rounded-lg px-2 py-2 text-center">
          <div className={`text-lg font-bold tabular-nums ${t.color ?? "text-white"}`}>{t.value}</div>
          <div className="text-[11px] text-white/40 leading-tight mt-0.5">{t.label}</div>
        </div>
      ))}
    </div>
  );
}

function Pill({ tone = "neutral", children }) {
  const map = {
    ok: "text-emerald-300 bg-green-400/10",
    warn: "text-yellow-300 bg-yellow-400/10",
    bad: "text-red-300 bg-red-400/10",
    neutral: "text-white/55 bg-white/8",
  };
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 ${map[tone]}`}>
      {children}
    </span>
  );
}

function InfoLine({ items }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {items.map(([k, v]) => (
        <span key={k}>
          <span className="text-white/40">{k}: </span>
          <span className="text-white/75 font-medium">{v || "–"}</span>
        </span>
      ))}
    </div>
  );
}

function SubList({ children }) {
  return <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5">{children}</div>;
}

function ListRow({ children }) {
  return (
    <div className="flex items-center justify-between gap-3 bg-black/20 rounded-lg px-3 py-2">{children}</div>
  );
}

// --- Proxmox ------------------------------------------------------------------

function ProxmoxMetrics({ m }) {
  const nodes = m.nodes ?? [];
  return (
    <div className="space-y-3">
      <StatTiles
        tiles={[
          { label: "Nodes", value: nodes.length },
          { label: "VMs gesamt", value: m.vms_total ?? 0 },
          { label: "VMs laufen", value: m.vms_running ?? 0, color: "text-emerald-300" },
        ]}
      />
      {nodes.map((n) => (
        <div key={n.name} className="bg-black/20 rounded-lg p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <Server size={13} className="text-white/40" />
              {n.name}
            </span>
            <Pill tone={n.status === "online" ? "ok" : "warn"}>{n.status}</Pill>
          </div>
          <MetricBar label="CPU" percent={num(n.cpu) ?? 0} detail={`${num(n.cpu) ?? 0} %`} />
          <MetricBar
            label="Arbeitsspeicher"
            percent={pct(n.mem_used, n.mem_total)}
            detail={`${formatBytes(n.mem_used)} / ${formatBytes(n.mem_total)}`}
          />
          <div className="text-xs text-white/40">
            {n.vms_running}/{n.vms} VMs laufen
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Docker -------------------------------------------------------------------

function ContainerRow({ c, connectorId }) {
  const [acting, setActing] = useState(null);   // "start" | "stop" | "restart"
  const [feedback, setFeedback] = useState(null);
  const isRunning = c.state === "running";

  async function doAction(action) {
    if (!connectorId) return;
    setActing(action); setFeedback(null);
    try {
      await api.docker.containerAction(connectorId, c.id, action);
      const labels = { start: "Gestartet", stop: "Gestoppt", restart: "Neustart" };
      setFeedback({ ok: true, msg: labels[action] ?? "OK" });
    } catch (e) {
      setFeedback({ ok: false, msg: e.message });
    } finally {
      setActing(null);
    }
  }

  const btnBase = {
    display: "inline-flex", alignItems: "center", gap: 3,
    fontSize: 10, padding: "2px 7px", borderRadius: 5, cursor: "pointer",
    border: "1px solid", background: "none", fontFamily: "inherit",
    transition: "opacity 0.15s",
    opacity: acting ? 0.5 : 1,
  };

  return (
    <div className="bg-black/20 rounded-lg px-3 py-2 space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{c.name}</div>
          <div className="text-[11px] text-white/40 flex items-center gap-1.5">
                <span className="truncate">{c.image}</span>
                {c.image_age != null && (
                  <span
                    className={`flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                      c.image_age > 90 ? "text-red-300 bg-red-400/10" :
                      c.image_age > 30 ? "text-yellow-300 bg-yellow-400/10" :
                      "text-white/30 bg-white/5"
                    }`}
                    title={`Image ist ${c.image_age} Tage alt`}
                  >
                    {c.image_age}d
                  </span>
                )}
              </div>
        </div>
        <div className="text-right flex-shrink-0">
          <Pill tone={isRunning ? "ok" : c.state === "exited" ? "bad" : "warn"}>
            {c.state}
          </Pill>
          <div className="text-[11px] text-white/40 mt-0.5 max-w-[10rem] truncate">{c.status}</div>
        </div>
      </div>
      {connectorId && (
        <div className="flex items-center gap-2 flex-wrap">
          {isRunning ? (
            <>
              <button
                onClick={() => doAction("restart")}
                disabled={!!acting}
                style={{ ...btnBase, color: "#fbbf24", borderColor: "rgba(251,191,36,0.3)" }}
                title="Container neu starten"
              >
                {acting === "restart"
                  ? <Loader size={9} style={{ animation: "spin 1s linear infinite" }} />
                  : <RefreshCcw size={9} />}
                Restart
              </button>
              <button
                onClick={() => doAction("stop")}
                disabled={!!acting}
                style={{ ...btnBase, color: "#f87171", borderColor: "rgba(248,113,113,0.3)" }}
                title="Container stoppen"
              >
                {acting === "stop"
                  ? <Loader size={9} style={{ animation: "spin 1s linear infinite" }} />
                  : <Square size={9} />}
                Stop
              </button>
            </>
          ) : (
            <button
              onClick={() => doAction("start")}
              disabled={!!acting}
              style={{ ...btnBase, color: "#34d399", borderColor: "rgba(52,211,153,0.3)" }}
              title="Container starten"
            >
              {acting === "start"
                ? <Loader size={9} style={{ animation: "spin 1s linear infinite" }} />
                : <Play size={9} />}
              Start
            </button>
          )}
          {feedback && (
            <span style={{ fontSize: 10, color: feedback.ok ? "#34d399" : "#f87171" }}>
              {feedback.msg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function DockerMetrics({ m, connectorId }) {
  const containers = m.containers ?? [];
  return (
    <div className="space-y-3">
      <StatTiles
        tiles={[
          { label: "Gesamt", value: m.total ?? 0 },
          { label: "Laufen", value: m.running ?? 0, color: "text-emerald-300" },
          { label: "Beendet", value: m.exited ?? 0, color: m.exited ? "text-red-300" : "text-white" },
          { label: "Ungesund", value: m.unhealthy ?? 0, color: m.unhealthy ? "text-yellow-300" : "text-white" },
        ]}
      />
      <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5">
        {containers.map((c) => (
          <ContainerRow key={c.id} c={c} connectorId={connectorId} />
        ))}
        {containers.length === 0 && <p className="text-xs text-white/25">Keine Container.</p>}
      </div>
    </div>
  );
}

// --- Uptime Kuma --------------------------------------------------------------

function UptimeKumaMetrics({ m }) {
  const monitors = m.monitors ?? [];
  return (
    <div className="space-y-3">
      <StatTiles
        tiles={[
          { label: "Monitore", value: m.total ?? 0 },
          { label: "Up", value: m.up ?? 0, color: "text-emerald-300" },
          { label: "Down", value: m.down ?? 0, color: m.down ? "text-red-300" : "text-white" },
        ]}
      />
      <SubList>
        {monitors.map((mon) => (
          <ListRow key={mon.id}>
            <span className="text-sm truncate flex items-center gap-2">
              <Activity size={13} className="text-white/40 flex-shrink-0" />
              {mon.name}
            </span>
            <span className="flex items-center gap-2 flex-shrink-0">
              {mon.ping != null && (
                <span className="text-[11px] text-white/40 tabular-nums">{Math.round(mon.ping)} ms</span>
              )}
              <Pill tone={mon.up ? "ok" : "bad"}>{mon.up ? "Up" : "Down"}</Pill>
            </span>
          </ListRow>
        ))}
        {monitors.length === 0 && <p className="text-xs text-white/25">Keine Monitore.</p>}
      </SubList>
    </div>
  );
}

// --- TrueNAS ------------------------------------------------------------------

function TrueNASMetrics({ m }) {
  const pools = m.pools ?? [];
  return (
    <div className="space-y-3">
      <InfoLine
        items={[
          ["Host", m.hostname],
          ["Version", m.version],
          ["Laufzeit", formatUptime(m.uptime_seconds)],
        ]}
      />
      <StatTiles
        tiles={[
          { label: "Pools", value: m.pools_total ?? 0 },
          {
            label: "Pools degradiert",
            value: m.pools_degraded ?? 0,
            color: m.pools_degraded ? "text-red-300" : "text-white",
          },
          { label: "Disks", value: m.disks_total ?? 0 },
        ]}
      />
      {pools.map((p) => {
        const size = num(p.size);
        const free = num(p.free);
        const used = size !== null && free !== null ? size - free : null;
        const healthy = ["ONLINE", "HEALTHY"].includes(String(p.status));
        return (
          <div key={p.name} className="bg-black/20 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <HardDrive size={13} className="text-white/40" />
                {p.name}
              </span>
              <Pill tone={healthy ? "ok" : "bad"}>{p.status}</Pill>
            </div>
            {used !== null && (
              <MetricBar
                label="Belegung"
                percent={pct(used, size)}
                detail={`${formatBytes(used)} / ${formatBytes(size)}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Unifi --------------------------------------------------------------------

const UNIFI_TYPE = { uap: "Access Point", usw: "Switch", ugw: "Gateway" };

function UnifiMetrics({ m }) {
  const devices = m.devices ?? [];
  return (
    <div className="space-y-3">
      <StatTiles
        tiles={[
          { label: "Geräte", value: m.devices_total ?? 0 },
          {
            label: "Offline",
            value: m.devices_disconnected ?? 0,
            color: m.devices_disconnected ? "text-red-300" : "text-white",
          },
          { label: "APs", value: m.access_points ?? 0 },
          { label: "Switches", value: m.switches ?? 0 },
          { label: "Clients", value: m.clients_total ?? 0, color: "text-amber-300" },
        ]}
      />
      <SubList>
        {devices.map((d, i) => (
          <ListRow key={d.name + i}>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-2">
                <Wifi size={13} className="text-white/40 flex-shrink-0" />
                {d.name}
              </div>
              <div className="text-[11px] text-white/40 truncate">
                {UNIFI_TYPE[d.type] ?? d.type} · {d.model} · {d.ip || "keine IP"}
              </div>
            </div>
            <Pill tone={d.state === 1 ? "ok" : "bad"}>{d.state === 1 ? "Online" : "Offline"}</Pill>
          </ListRow>
        ))}
        {devices.length === 0 && <p className="text-xs text-white/25">Keine Geräte.</p>}
      </SubList>
    </div>
  );
}

// --- Synology -----------------------------------------------------------------

function SynologyMetrics({ m }) {
  const volumes = m.volumes ?? [];
  return (
    <div className="space-y-3">
      <InfoLine
        items={[
          ["Modell", m.model],
          ["CPU-Kerne", m.cpu_cores],
          ["RAM", m.ram ? `${m.ram} MB` : null],
        ]}
      />
      <StatTiles
        tiles={[
          { label: "Volumes", value: m.volumes_total ?? 0 },
          {
            label: "Volumes degradiert",
            value: m.volumes_degraded ?? 0,
            color: m.volumes_degraded ? "text-red-300" : "text-white",
          },
        ]}
      />
      {volumes.map((v) => {
        const healthy = String(v.status) === "normal";
        return (
          <div key={v.id} className="bg-black/20 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <HardDrive size={13} className="text-white/40" />
                {v.id}
              </span>
              <Pill tone={healthy ? "ok" : "warn"}>{v.status}</Pill>
            </div>
            <MetricBar
              label="Belegung"
              percent={pct(v.size_used, v.size_total)}
              detail={`${formatBytes(v.size_used)} / ${formatBytes(v.size_total)}`}
            />
          </div>
        );
      })}
    </div>
  );
}

// --- pfSense ------------------------------------------------------------------

function PfSenseMetrics({ m }) {
  const gateways = m.gateways ?? [];
  return (
    <div className="space-y-3">
      <InfoLine
        items={[
          ["Host", m.hostname],
          ["Version", m.version],
          ["Laufzeit", m.uptime],
        ]}
      />
      <div className="space-y-2.5">
        <MetricBar label="CPU" percent={toPercent(m.cpu_usage)} detail={`${toPercent(m.cpu_usage)} %`} />
        <MetricBar label="Arbeitsspeicher" percent={toPercent(m.mem_usage)} detail={`${toPercent(m.mem_usage)} %`} />
      </div>
      <StatTiles
        tiles={[
          { label: "Interfaces", value: m.interfaces_total ?? 0 },
          { label: "Gateways", value: m.gateways_total ?? 0 },
          {
            label: "Gateways down",
            value: m.gateways_down ?? 0,
            color: m.gateways_down ? "text-red-300" : "text-white",
          },
        ]}
      />
      <SubList>
        {gateways.map((g, i) => (
          <ListRow key={(g.name ?? "gw") + i}>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-2">
                <Network size={13} className="text-white/40 flex-shrink-0" />
                {g.name}
              </div>
              <div className="text-[11px] text-white/40 truncate">{g.gateway || "keine Adresse"}</div>
            </div>
            <span className="flex items-center gap-2 flex-shrink-0">
              {g.latency != null && g.latency !== "" && (
                <span className="text-[11px] text-white/40 tabular-nums">{g.latency}</span>
              )}
              <Pill tone={g.timedout ? "bad" : "ok"}>{g.timedout ? "Down" : "Online"}</Pill>
            </span>
          </ListRow>
        ))}
        {gateways.length === 0 && <p className="text-xs text-white/25">Keine Gateways.</p>}
      </SubList>
    </div>
  );
}

// --- Linux SSH ----------------------------------------------------------------

function LinuxSSHMetrics({ m }) {
  const [expanded, setExpanded] = useState(false);
  const cpuPct  = m.cpu_pct  ?? 0;
  const memPct  = m.mem_pct  ?? 0;
  const diskPct = m.disk_pct ?? 0;
  return (
    <div className="space-y-2.5">
      {/* Kompakt-Kopfzeile – immer sichtbar */}
      <div
        className="flex items-center justify-between cursor-pointer select-none gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Terminal size={13} className="text-white/40 flex-shrink-0" />
          <span className="text-sm font-medium truncate">{m.hostname || "–"}</span>
          <span className="text-[11px] text-white/35 truncate hidden sm:inline">{m.os || ""}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Mini CPU / RAM / Disk Pills */}
          <span className="text-[11px] text-white/55 tabular-nums">
            CPU <span className={cpuPct > 80 ? "text-red-300" : "text-white/75"}>{cpuPct}%</span>
          </span>
          <span className="text-[11px] text-white/55 tabular-nums">
            RAM <span className={memPct > 80 ? "text-red-300" : "text-white/75"}>{memPct}%</span>
          </span>
          <span className="text-[11px] text-white/55 tabular-nums">
            Disk <span className={diskPct > 80 ? "text-red-300" : "text-white/75"}>{diskPct}%</span>
          </span>
          {expanded
            ? <ChevronUp size={14} className="text-white/35" />
            : <ChevronDown size={14} className="text-white/35" />}
        </div>
      </div>

      {/* Aufgeklappter Bereich */}
      {expanded && (
        <div className="space-y-2.5 pt-1">
          <InfoLine
            items={[
              ["OS", m.os],
              ["Laufzeit", m.uptime_h != null ? `${m.uptime_h} h` : null],
            ]}
          />
          <MetricBar
            label="CPU"
            percent={cpuPct}
            detail={`${cpuPct} %`}
          />
          <MetricBar
            label="Arbeitsspeicher"
            percent={memPct}
            detail={`${formatBytes(m.mem_used)} / ${formatBytes(m.mem_total)}`}
          />
          <MetricBar
            label="Disk /"
            percent={diskPct}
            detail={`${formatBytes(m.disk_used)} / ${formatBytes(m.disk_total)}`}
          />
          {(m.load1 != null) && (
            <StatTiles
              tiles={[
                { label: "Load 1m",  value: m.load1?.toFixed(2)  ?? "–" },
                { label: "Load 5m",  value: m.load5?.toFixed(2)  ?? "–" },
                { label: "Load 15m", value: m.load15?.toFixed(2) ?? "–" },
              ]}
            />
          )}
        </div>
      )}
    </div>
  );
}

// --- Hetzner Cloud ------------------------------------------------------------

function HetznerMetrics({ m }) {
  const servers = m.servers ?? [];
  return (
    <div className="space-y-3">
      <StatTiles
        tiles={[
          { label: "Server",   value: m.servers_total   ?? 0 },
          { label: "Laufen",   value: m.servers_running ?? 0, color: "text-emerald-300" },
          { label: "Gestoppt", value: m.servers_stopped ?? 0, color: m.servers_stopped ? "text-yellow-300" : "text-white" },
          { label: "Fehler",   value: m.servers_error   ?? 0, color: m.servers_error   ? "text-red-300"    : "text-white" },
          { label: "Volumes",  value: m.volumes_total   ?? 0 },
          { label: "Float-IPs",value: m.floating_ips    ?? 0 },
        ]}
      />
      <SubList>
        {servers.map((s) => (
          <ListRow key={s.id}>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-2">
                <Cloud size={13} className="text-white/40 flex-shrink-0" />
                {s.name}
              </div>
              <div className="text-[11px] text-white/40 truncate">
                {s.type} · {s.location} · {s.ipv4 || "keine IP"}
              </div>
            </div>
            <Pill tone={s.status === "running" ? "ok" : s.status === "off" ? "warn" : "bad"}>
              {s.status}
            </Pill>
          </ListRow>
        ))}
        {servers.length === 0 && <p className="text-xs text-white/25">Keine Server.</p>}
      </SubList>
    </div>
  );
}

// --- Proxmox Backup Server ----------------------------------------------------

function ProxmoxBackupMetrics({ m }) {
  const datastores = m.datastores ?? [];
  const nodes      = m.nodes      ?? [];
  return (
    <div className="space-y-3">
      <StatTiles
        tiles={[
          { label: "Datastores", value: m.datastores_total ?? 0 },
          { label: "Belegt",     value: formatBytes(m.total_used_bytes) },
          { label: "Frei",       value: formatBytes(m.total_avail_bytes), color: "text-emerald-300" },
        ]}
      />
      {nodes.map((n) => (
        <div key={n.name} className="bg-black/20 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
          <span className="text-sm font-medium flex items-center gap-2">
            <Server size={13} className="text-white/40" />
            {n.name}
          </span>
          <Pill tone={n.status === "online" ? "ok" : "bad"}>{n.status}</Pill>
        </div>
      ))}
      {datastores.map((ds) => (
        <div key={ds.name} className="bg-black/20 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-2">
              <Archive size={13} className="text-white/40" />
              {ds.name}
            </span>
            <Pill tone={ds.used_pct > 90 ? "bad" : ds.used_pct > 75 ? "warn" : "ok"}>
              {ds.used_pct} %
            </Pill>
          </div>
          <MetricBar
            label="Belegung"
            percent={ds.used_pct}
            detail={`${formatBytes(ds.used_bytes)} / ${formatBytes(ds.total_bytes)}`}
          />
        </div>
      ))}
    </div>
  );
}

// --- Cloudflare ---------------------------------------------------------------

function CloudflareMetrics({ m }) {
  const zones   = m.zones   ?? [];
  const tunnels = m.tunnels ?? [];
  return (
    <div className="space-y-3">
      <StatTiles
        tiles={[
          { label: "Zones",         value: m.zones_total      ?? 0 },
          { label: "Aktiv",         value: m.zones_active     ?? 0, color: "text-emerald-300" },
          { label: "Inaktiv",       value: m.zones_inactive   ?? 0, color: m.zones_inactive   ? "text-yellow-300" : "text-white" },
          ...(m.tunnels_total
            ? [
                { label: "Tunnel",       value: m.tunnels_total    ?? 0 },
                { label: "Healthy",      value: m.tunnels_healthy  ?? 0, color: "text-emerald-300" },
                { label: "Degradiert",   value: m.tunnels_degraded ?? 0, color: m.tunnels_degraded ? "text-red-300" : "text-white" },
              ]
            : []),
        ]}
      />
      <SubList>
        {zones.map((z) => (
          <ListRow key={z.name}>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-2">
                <Shield size={13} className="text-white/40 flex-shrink-0" />
                {z.name}
              </div>
              <div className="text-[11px] text-white/40 truncate">{z.plan}</div>
            </div>
            <Pill tone={z.status === "active" ? "ok" : "warn"}>{z.status}</Pill>
          </ListRow>
        ))}
        {tunnels.map((t) => (
          <ListRow key={t.id}>
            <div className="text-sm truncate flex items-center gap-2">
              <Network size={13} className="text-white/40 flex-shrink-0" />
              <span>{t.name}</span>
              <span className="text-[11px] text-white/35">(Tunnel)</span>
            </div>
            <Pill tone={t.status === "healthy" ? "ok" : "warn"}>{t.status}</Pill>
          </ListRow>
        ))}
        {zones.length === 0 && <p className="text-xs text-white/25">Keine Zones.</p>}
      </SubList>
    </div>
  );
}

// --- Grafana ------------------------------------------------------------------

function GrafanaMetrics({ m }) {
  const datasources    = m.datasources        ?? [];
  const firingAlerts   = m.firing_alert_names ?? [];
  return (
    <div className="space-y-3">
      <InfoLine
        items={[
          ["Version",    m.version],
          ["Datenbank",  m.database_ok ? "OK" : "Fehler"],
        ]}
      />
      <StatTiles
        tiles={[
          { label: "Dashboards",  value: m.dashboards_total  ?? 0 },
          { label: "Datasources", value: m.datasources_total ?? 0 },
          { label: "Alerts",      value: m.alerts_total      ?? 0 },
          { label: "Feuern",      value: m.alerts_firing     ?? 0, color: m.alerts_firing ? "text-red-300" : "text-white" },
        ]}
      />
      {firingAlerts.length > 0 && (
        <div className="bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 space-y-1">
          <p className="text-[11px] text-red-300 font-semibold uppercase tracking-wide">Aktive Alerts</p>
          {firingAlerts.map((name, i) => (
            <p key={i} className="text-xs text-red-200/80 truncate">• {name}</p>
          ))}
        </div>
      )}
      <SubList>
        {datasources.map((ds, i) => (
          <ListRow key={ds.name + i}>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-2">
                <Database size={13} className="text-white/40 flex-shrink-0" />
                {ds.name}
              </div>
              <div className="text-[11px] text-white/40 truncate">{ds.type}</div>
            </div>
          </ListRow>
        ))}
        {datasources.length === 0 && <p className="text-xs text-white/25">Keine Datasources.</p>}
      </SubList>
    </div>
  );
}

// --- Netcup -------------------------------------------------------------------

function NetcupMetrics({ m }) {
  const servers = m.servers ?? [];
  return (
    <div className="space-y-3">
      <StatTiles
        tiles={[
          { label: "Server",   value: m.servers_total   ?? 0 },
          { label: "An",       value: m.servers_running ?? 0, color: "text-emerald-300" },
          { label: "Gestoppt", value: m.servers_stopped ?? 0, color: m.servers_stopped ? "text-yellow-300" : "text-white" },
        ]}
      />
      <SubList>
        {servers.map((s) => (
          <ListRow key={s.name}>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate flex items-center gap-2">
                <Server size={13} className="text-white/40 flex-shrink-0" />
                {s.name}
              </div>
              <div className="text-[11px] text-white/40 truncate">
                {s.cores ? `${s.cores} Kerne` : ""}
                {s.memory_mb ? ` · ${Math.round(s.memory_mb / 1024)} GB RAM` : ""}
                {s.ipv4 ? ` · ${s.ipv4}` : ""}
              </div>
            </div>
            <Pill tone={s.status === "on" ? "ok" : "warn"}>{s.status === "on" ? "Online" : s.status}</Pill>
          </ListRow>
        ))}
        {servers.length === 0 && <p className="text-xs text-white/25">Keine Server.</p>}
      </SubList>
    </div>
  );
}

// --- Wake-on-LAN --------------------------------------------------------------

function WolMetrics({ m }) {
  return (
    <div className="space-y-2">
      <InfoLine items={[
        ["Host", m.host],
        ["MAC",  m.mac],
      ]} />
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${m.online ? "text-emerald-300 bg-green-400/10" : "text-white/40 bg-white/5"}`}>
          {m.online ? "Online" : "Offline / Schläft"}
        </span>
        {!m.online && (
          <span className="text-[11px] text-white/35">Wake-Up-Button in der Karte oben</span>
        )}
      </div>
    </div>
  );
}

// --- TLS-Zertifikat -----------------------------------------------------------

function TlsMetrics({ m }) {
  const days = m.days_until_expiry ?? 0;
  const color = days < 0 ? "text-red-400" : days < 7 ? "text-red-300" : days < 30 ? "text-yellow-300" : "text-emerald-300";
  const barPct = Math.max(0, Math.min(100, (days / 90) * 100));
  return (
    <div className="space-y-3">
      <InfoLine items={[
        ["Domain",  m.host],
        ["Aussteller", m.issuer_o || m.issuer_cn],
        ["Ablauf",  m.not_after],
      ]} />
      <div className="bg-black/20 rounded-lg px-3 py-3 space-y-2">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-white/40">Tage bis Ablauf</span>
          <span className={`text-2xl font-bold tabular-nums ${color}`}>
            {days < 0 ? "Abgelaufen" : `${days} Tage`}
          </span>
        </div>
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${barPct}%`,
              background: days < 7 ? "#f87171" : days < 30 ? "#fbbf24" : "#34d399",
            }}
          />
        </div>
      </div>
      {m.san?.length > 0 && (
        <div className="text-[11px] text-white/35 space-y-0.5">
          {m.san.map((s) => <div key={s}>· {s}</div>)}
        </div>
      )}
    </div>
  );
}

// --- Linux Full-Probe ---------------------------------------------------------

function ProbeTab({ label, active, onClick, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6,
        border: "none", cursor: "pointer", transition: "all 0.15s",
        background: active ? "rgba(245,158,11,0.15)" : "transparent",
        color: active ? "#F59E0B" : "rgba(255,255,255,0.38)",
        display: "flex", alignItems: "center", gap: 4,
      }}
    >
      {Icon && <Icon size={11} />}
      {label}
    </button>
  );
}

function VramBar({ used, total, label }) {
  if (!total) return null;
  const pct = Math.round((used / total) * 100);
  const color = pct > 85 ? "#f87171" : pct > 60 ? "#fbbf24" : "#34d399";
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{label || "VRAM"}</span>
        <span style={{ fontSize: 11, fontFamily: "monospace", color }}>
          {Math.round(used / 1024 * 10) / 10} / {Math.round(total / 1024 * 10) / 10} GB ({pct}%)
        </span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
    </div>
  );
}

function SecCheck({ ok, label, detail }) {
  const icon = ok === true
    ? <CheckCircle size={13} style={{ color: "#34d399", flexShrink: 0 }} />
    : ok === false
    ? <XCircle size={13} style={{ color: "#f87171", flexShrink: 0 }} />
    : <AlertTriangle size={13} style={{ color: "#fbbf24", flexShrink: 0 }} />;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      {icon}
      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", flex: 1 }}>{label}</span>
      {detail && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>{detail}</span>}
    </div>
  );
}

function LinuxProbeMetrics({ m }) {
  const TABS = ["System", "GPU", "Systemd", "Netzwerk", "Security"];
  const TAB_ICONS = { System: Cpu, GPU: Zap, Systemd: Layers, Netzwerk: Network, Security: Shield };
  const [tab, setTab] = useState("System");

  const gpu  = m.gpu      ?? {};
  const sysd = m.systemd  ?? {};
  const net  = m.network  ?? {};
  const sec  = m.security ?? {};

  const cpuPct  = m.cpu_pct  ?? 0;
  const memPct  = m.mem_pct  ?? 0;
  const diskPct = m.disk_pct ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Host-Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Terminal size={13} style={{ color: "rgba(255,255,255,0.4)", flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{m.hostname || "–"}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{m.os || ""}</span>
        {m.is_vm && (
          <span style={{ fontSize: 9.5, color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 4, padding: "1px 6px" }}>
            VM · {m.vm_type}
          </span>
        )}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
          ↑ {m.uptime_h != null ? `${m.uptime_h}h` : "–"}
          {m.temp_c != null && <span style={{ marginLeft: 8, color: m.temp_c > 80 ? "#f87171" : "#fbbf24" }}>🌡 {m.temp_c}°C</span>}
        </span>
      </div>

      {/* Quick bars (always visible) */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <MetricBar label="CPU" percent={cpuPct} detail={`${cpuPct} %`} />
        <MetricBar label="RAM" percent={memPct} detail={`${formatBytes(m.mem_used)} / ${formatBytes(m.mem_total)}`} />
        <MetricBar label="Disk /" percent={diskPct} detail={`${formatBytes(m.disk_used)} / ${formatBytes(m.disk_total)}`} />
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 2, borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: 6 }}>
        {TABS.map((t) => (
          <ProbeTab key={t} label={t} active={tab === t} onClick={() => setTab(t)} icon={TAB_ICONS[t]} />
        ))}
      </div>

      {/* ── System ── */}
      {tab === "System" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {m.load1 != null && (
            <StatTiles tiles={[
              { label: "Load 1m",  value: m.load1?.toFixed(2)  ?? "–" },
              { label: "Load 5m",  value: m.load5?.toFixed(2)  ?? "–" },
              { label: "Load 15m", value: m.load15?.toFixed(2) ?? "–" },
              { label: "CPU-Kerne", value: m.cpu_cores ?? "–" },
            ]} />
          )}
          <InfoLine items={[
            ["Kernel", m.kernel],
            ["Arch",   m.arch],
          ]} />
          {/* All disks */}
          {(m.disks ?? []).length > 1 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {m.disks.map((d) => (
                <MetricBar key={d.mount} label={d.mount} percent={d.pct}
                  detail={`${formatBytes(d.used)} / ${formatBytes(d.total)}`} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── GPU ── */}
      {tab === "GPU" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!gpu.available ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", padding: "8px 0" }}>
              {gpu.reason || "Kein GPU erkannt"}
            </div>
          ) : (
            <>
              <StatTiles tiles={[
                { label: "GPUs", value: gpu.gpu_count ?? 0 },
                { label: "VRAM gesamt", value: `${Math.round((gpu.total_vram_mb ?? 0) / 1024)} GB` },
                { label: "VRAM belegt", value: `${Math.round((gpu.total_vram_used_mb ?? 0) / 1024)} GB`, color: "text-amber-300" },
              ]} />
              {(gpu.gpus ?? []).map((g, i) => (
                <div key={i} style={{ background: "rgba(0,0,0,0.22)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>
                      GPU {g.index} · {g.name}
                    </span>
                    <div style={{ display: "flex", gap: 10, fontSize: 11, fontFamily: "monospace" }}>
                      {g.temp_c != null && <span style={{ color: g.temp_c > 80 ? "#f87171" : "#fbbf24" }}>{g.temp_c}°C</span>}
                      {g.power_w != null && <span style={{ color: "rgba(255,255,255,0.5)" }}>{Math.round(g.power_w)}W</span>}
                    </div>
                  </div>
                  {g.vram_total_mb && <VramBar used={g.vram_used_mb ?? 0} total={g.vram_total_mb} label="VRAM" />}
                  {g.util_pct != null && <MetricBar label="GPU Util" percent={g.util_pct} detail={`${Math.round(g.util_pct)} %`} />}
                  {g.fan_pct != null && (
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Lüfter: {Math.round(g.fan_pct)}%</div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── Systemd ── */}
      {tab === "Systemd" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!sysd.available ? (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>systemd nicht verfügbar</div>
          ) : (
            <>
              <StatTiles tiles={[
                { label: "Units gesamt", value: sysd.total ?? 0 },
                { label: "Laufen",       value: sysd.running ?? 0,       color: "text-emerald-300" },
                { label: "Failed",       value: sysd.failed_count ?? 0,  color: sysd.failed_count ? "text-red-300" : "text-white" },
              ]} />
              {(sysd.failed ?? []).length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: "#f87171", letterSpacing: "0.07em", textTransform: "uppercase" }}>
                    Failed Units
                  </span>
                  {sysd.failed.map((u, i) => (
                    <div key={i} style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)", borderRadius: 8, padding: "6px 10px", fontSize: 11.5 }}>
                      <span style={{ fontFamily: "monospace", color: "#f87171" }}>{u.unit}</span>
                      {u.desc && <span style={{ color: "rgba(255,255,255,0.4)", marginLeft: 8 }}>{u.desc}</span>}
                    </div>
                  ))}
                </div>
              )}
              {(sysd.user_services ?? []).length > 0 && (
                <div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                    Eigene Services
                  </span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {sysd.user_services.slice(0, 20).map((u) => (
                      <span key={u} style={{ fontSize: 10.5, fontFamily: "monospace", background: "rgba(255,255,255,0.07)", borderRadius: 5, padding: "2px 7px", color: "rgba(255,255,255,0.6)" }}>
                        {u.replace(".service", "")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Netzwerk ── */}
      {tab === "Netzwerk" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <InfoLine items={[
            ["Gateway", net.gateway],
            ["DNS",     (net.dns_servers ?? []).join(", ")],
            ["Pub. Ports", net.public_ports_count ?? 0],
          ]} />
          {/* Interfaces */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {(net.interfaces ?? []).map((iface) => (
              <div key={iface.name} style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                  <span style={{
                    width: 7, height: 7, borderRadius: "50%", flexShrink: 0,
                    background: iface.state === "up" ? "#34d399" : iface.state === "down" ? "#f87171" : "rgba(255,255,255,0.25)",
                  }} />
                  <span style={{ fontSize: 12.5, fontWeight: 600, fontFamily: "monospace", color: "rgba(255,255,255,0.8)" }}>{iface.name}</span>
                  <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)" }}>{iface.state}</span>
                  {iface.mac && <span style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.2)", marginLeft: "auto" }}>{iface.mac}</span>}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {(iface.addrs ?? []).map((a, i) => (
                    <span key={i} style={{ fontSize: 11, fontFamily: "monospace", color: a.family === "inet" ? "#60a5fa" : "rgba(255,255,255,0.4)" }}>
                      {a.address}/{a.prefix}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {/* Public listening ports */}
          {(net.open_ports ?? []).filter(p => p.public).length > 0 && (
            <div>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
                Öffentliche Ports
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {net.open_ports.filter(p => p.public).map((p, i) => (
                  <span key={i} style={{
                    fontSize: 11, fontFamily: "monospace",
                    background: [22, 80, 443].includes(p.port) ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.07)",
                    color: [22, 80, 443].includes(p.port) ? "#F59E0B" : "rgba(255,255,255,0.6)",
                    border: `1px solid ${[22, 80, 443].includes(p.port) ? "rgba(245,158,11,0.25)" : "rgba(255,255,255,0.08)"}`,
                    borderRadius: 5, padding: "2px 8px",
                  }}>
                    :{p.port}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Security ── */}
      {tab === "Security" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sec.issue_count > 0 && (
            <div style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "8px 12px", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#f87171" }}>
                {sec.issue_count} Problem{sec.issue_count !== 1 ? "e" : ""} erkannt
              </span>
            </div>
          )}
          <SecCheck
            ok={sec.firewall && !sec.firewall.includes("inactive") && !sec.firewall.includes("empty") && sec.firewall !== "unknown"}
            label="Firewall"
            detail={sec.firewall ?? "–"}
          />
          <SecCheck ok={sec.ssh_root_login === false} label="SSH Root-Login deaktiviert" />
          <SecCheck ok={sec.ssh_pw_auth === false}    label="SSH Passwort-Auth deaktiviert" />
          <SecCheck ok={sec.fail2ban === true}         label="fail2ban aktiv" />
          <SecCheck ok={!sec.reboot_required}          label="Kein Reboot ausstehend" />
          <SecCheck ok={sec.auto_updates === true}     label="Auto-Updates aktiv" />
          {sec.mac && <SecCheck ok={true} label="MAC-Framework" detail={sec.mac} />}
          {(sec.issues ?? []).length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {sec.issues.map((issue, i) => (
                <div key={i} style={{ fontSize: 11.5, color: "#fbbf24", display: "flex", alignItems: "center", gap: 6 }}>
                  <AlertTriangle size={11} style={{ flexShrink: 0 }} />
                  {issue}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- AI Models ----------------------------------------------------------------

function AIModelsMetrics({ m }) {
  const loaded    = m.models_loaded     ?? [];
  const available = m.available_models  ?? [];
  const typeLabel = {
    ollama: "Ollama", vllm: "vLLM", llamacpp: "llama.cpp", openai: "OpenAI-compat",
  }[m.server_type] ?? m.server_type ?? "Unbekannt";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Cpu size={13} style={{ color: "rgba(255,255,255,0.4)" }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{typeLabel}</span>
        {m.server_version && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>v{m.server_version}</span>
        )}
        {m.idle && (
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 5, padding: "2px 7px" }}>
            Idle – kein Modell geladen
          </span>
        )}
      </div>

      <StatTiles tiles={[
        { label: "Geladen", value: m.models_loaded_count ?? 0, color: m.models_loaded_count > 0 ? "text-emerald-300" : "text-white" },
        { label: "Verfügbar", value: m.models_available ?? 0 },
      ]} />

      {loaded.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
            Aktive Modelle
          </span>
          {loaded.map((model, i) => (
            <div key={i} style={{ background: "rgba(52,211,153,0.08)", border: "1px solid rgba(52,211,153,0.15)", borderRadius: 8, padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 12.5, fontFamily: "monospace", color: "rgba(255,255,255,0.8)" }}>{model.name}</span>
              {model.vram_mb && (
                <span style={{ fontSize: 11, fontFamily: "monospace", color: "#34d399" }}>
                  {Math.round(model.vram_mb / 1024 * 10) / 10} GB VRAM
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: "rgba(255,255,255,0.35)", letterSpacing: "0.07em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>
            Installierte Modelle
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 200, overflowY: "auto" }}>
            {available.map((model, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ fontSize: 12, fontFamily: "monospace", color: "rgba(255,255,255,0.65)" }}>{model.name}</span>
                {model.size_gb && <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{model.size_gb} GB</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// --- Bookmarks ----------------------------------------------------------------

function BookmarkMetrics({ m }) {
  const links = m.links ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {m.description && (
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", margin: 0 }}>{m.description}</p>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 6 }}>
        {links.map((link, i) => (
          <a
            key={i}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "flex", alignItems: "center", gap: 7, padding: "7px 10px",
              background: "rgba(255,255,255,0.05)", borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.08)", textDecoration: "none",
              transition: "all 0.15s", color: "rgba(255,255,255,0.75)", fontSize: 12,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(245,158,11,0.1)"; e.currentTarget.style.borderColor = "rgba(245,158,11,0.25)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
          >
            <Globe size={12} style={{ color: "#F59E0B", flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{link.name}</span>
          </a>
        ))}
        {links.length === 0 && <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", gridColumn: "1 / -1" }}>Keine Links konfiguriert.</p>}
      </div>
    </div>
  );
}

// --- Fallback -----------------------------------------------------------------

function GenericMetrics({ m }) {
  return (
    <pre className="text-xs text-white/55 bg-black/20 rounded-lg p-3 overflow-auto max-h-72">
      {JSON.stringify(m, null, 2)}
    </pre>
  );
}

const RENDERERS = {
  proxmox:        ProxmoxMetrics,
  docker:         DockerMetrics,
  uptime_kuma:    UptimeKumaMetrics,
  truenas:        TrueNASMetrics,
  unifi:          UnifiMetrics,
  synology:       SynologyMetrics,
  pfsense:        PfSenseMetrics,
  linux_ssh:      LinuxSSHMetrics,
  linux_probe:    LinuxProbeMetrics,
  ai_models:      AIModelsMetrics,
  bookmarks:      BookmarkMetrics,
  hetzner:        HetznerMetrics,
  proxmox_backup: ProxmoxBackupMetrics,
  cloudflare:     CloudflareMetrics,
  grafana:        GrafanaMetrics,
  netcup:         NetcupMetrics,
  wol:            WolMetrics,
  tls_monitor:    TlsMetrics,
};

export default function ConnectorMetrics({ type, metrics, connectorId }) {
  const m = metrics ?? {};
  if (Object.keys(m).length === 0) {
    return <p className="text-xs text-white/25">Keine Metriken verfügbar – siehe Status oben.</p>;
  }
  const Renderer = RENDERERS[type] ?? GenericMetrics;
  return <Renderer m={m} connectorId={connectorId} />;
}
