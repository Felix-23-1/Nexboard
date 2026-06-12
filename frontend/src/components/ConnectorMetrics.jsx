import { useState } from "react";
import { Server, Activity, HardDrive, Network, Wifi, Terminal, Cloud, Archive, Shield, BarChart2, ChevronDown, ChevronUp, Database, Play, Square, RefreshCcw, Loader } from "lucide-react";
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
          <div className="text-[11px] text-white/40 truncate">{c.image}</div>
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
  hetzner:        HetznerMetrics,
  proxmox_backup: ProxmoxBackupMetrics,
  cloudflare:     CloudflareMetrics,
  grafana:        GrafanaMetrics,
  netcup:         NetcupMetrics,
};

export default function ConnectorMetrics({ type, metrics, connectorId }) {
  const m = metrics ?? {};
  if (Object.keys(m).length === 0) {
    return <p className="text-xs text-white/25">Keine Metriken verfügbar – siehe Status oben.</p>;
  }
  const Renderer = RENDERERS[type] ?? GenericMetrics;
  return <Renderer m={m} connectorId={connectorId} />;
}
