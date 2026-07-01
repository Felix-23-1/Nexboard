/**
 * LabSystem – Detailed system metrics for linux_probe / linux_ssh hosts.
 * Reads actual field names from connector.py _build_metrics:
 *   m.cpu_pct, m.mem_pct, m.disk_pct (top-level)
 *   m.mem_total / m.mem_used (bytes)
 *   m.disk_total / m.disk_used (bytes)
 *   m.disks[].{mount, pct, total, used, avail} (bytes)
 *   m.load1, m.load5, m.load15 (flat)
 *   m.uptime_s, m.temp_c, m.os, m.hostname
 *   m.gpu.{available, gpus[].{name, vram_total_mb, vram_used_mb, util_pct, temp_c, power_w}}
 *   m.systemd.{running, failed_count, failed[].{unit,desc}}
 */
import { useEffect, useState } from "react";
import { RefreshCw, Cpu, HardDrive, Database, AlertTriangle, CheckCircle, Server } from "lucide-react";
import { api } from "../api/client";

/* ── helpers ─────────────────────────────────────────────────── */
const b2g  = (b)  => b != null ? (b / 1e9).toFixed(1) : null;
const b2gb = (b)  => b != null ? `${(b / 1e9).toFixed(1)} GB` : null;

/* ── Ring Gauge ──────────────────────────────────────────────── */
function RingGauge({ value = 0, label, sublabel, color = "#F59E0B", size = 110 }) {
  const r    = 38;
  const circ = 2 * Math.PI * r;
  const pct  = Math.min(100, Math.max(0, value || 0));
  const fill = circ * pct / 100;
  const ac   = pct > 90 ? "#f87171" : pct > 78 ? "#fbbf24" : color;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: size, height: size }}>
        <svg width={size} height={size} viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="7" />
          {pct > 0 && (
            <circle cx="50" cy="50" r={r} fill="none" stroke={ac} strokeWidth="7"
              strokeDasharray={`${fill} ${circ - fill}`}
              strokeDashoffset={circ * 0.25}
              strokeLinecap="round"
              style={{ transition: "stroke-dasharray 0.55s ease, stroke 0.3s ease" }}
            />
          )}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: size > 100 ? 22 : 18, fontWeight: 700, color: ac, lineHeight: 1 }}>{Math.round(pct)}</span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>%</span>
        </div>
      </div>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(255,255,255,0.6)" }}>{label}</div>
        {sublabel && <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.28)", marginTop: 2 }}>{sublabel}</div>}
      </div>
    </div>
  );
}

/* ── Horizontal bar ──────────────────────────────────────────── */
function Bar({ value = 0, color = "#10B981", label, sublabel }) {
  const pct = Math.min(100, Math.max(0, value || 0));
  const bc  = pct > 88 ? "#f87171" : pct > 72 ? "#fbbf24" : color;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{label}</span>
        <span style={{ fontSize: 11, color: bc, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{Math.round(pct)}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: "rgba(255,255,255,0.07)" }}>
        <div style={{ width: `${pct}%`, height: "100%", borderRadius: 3, background: bc, transition: "width 0.5s ease" }} />
      </div>
      {sublabel && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", marginTop: 3 }}>{sublabel}</div>}
    </div>
  );
}

/* ── Section card ────────────────────────────────────────────── */
function Section({ title, icon, children }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.038)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "rgba(255,255,255,0.35)" }}>{icon}</span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.11em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>{title}</span>
      </div>
      <div style={{ padding: "14px 16px" }}>{children}</div>
    </div>
  );
}

/* ── KV pair ─────────────────────────────────────────────────── */
function KV({ label, value, mono = false }) {
  if (value == null || value === "") return null;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.38)" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)", fontFamily: mono ? "'JetBrains Mono', monospace" : undefined }}>{value}</span>
    </div>
  );
}

/* ── Host Detail ─────────────────────────────────────────────── */
function HostDetail({ connector: c }) {
  const m   = c.metrics ?? {};
  const gpu = m.gpu ?? {};
  const svc = m.systemd ?? {};

  // Convert bytes → GB labels
  const memTotalGb = m.mem_total != null ? `${(m.mem_total / 1e9).toFixed(1)} GB` : null;
  const memUsedGb  = m.mem_used  != null ? `${(m.mem_used  / 1e9).toFixed(1)} GB` : null;
  const memFreeGb  = (m.mem_total != null && m.mem_used != null)
    ? `${((m.mem_total - m.mem_used) / 1e9).toFixed(1)} GB` : null;
  const diskTotalGb = m.disk_total != null ? `${(m.disk_total / 1e9).toFixed(1)} GB` : null;
  const diskUsedGb  = m.disk_used  != null ? `${(m.disk_used  / 1e9).toFixed(1)} GB` : null;

  // Uptime in days
  const uptimeDays = m.uptime_s != null ? Math.floor(m.uptime_s / 86400) : null;
  const uptimeH    = m.uptime_s != null ? Math.floor((m.uptime_s % 86400) / 3600) : null;

  // Load averages (flat fields)
  const loadStr = m.load1 != null
    ? `${m.load1.toFixed(2)} / ${m.load5?.toFixed(2) ?? "–"} / ${m.load15?.toFixed(2) ?? "–"}`
    : null;

  // Disk mounts (bytes)
  const mounts = (m.disks ?? []).filter(d => d.mount && d.mount !== "none");

  // Failed systemd units (array of objects {unit, desc})
  const failedUnits = (svc.failed ?? []).map(f => f.unit ?? f);

  // GPU: pick first GPU for display
  const primaryGpu = (gpu.gpus ?? [])[0] ?? null;
  const gpuName    = primaryGpu?.name ?? null;
  const gpuVramTotal = primaryGpu?.vram_total_mb != null ? `${(primaryGpu.vram_total_mb / 1024).toFixed(1)} GB` : null;
  const gpuVramUsed  = primaryGpu?.vram_used_mb  != null ? `${(primaryGpu.vram_used_mb  / 1024).toFixed(1)} GB` : null;
  const gpuVramUsedPct = (primaryGpu?.vram_used_mb != null && primaryGpu?.vram_total_mb)
    ? (primaryGpu.vram_used_mb / primaryGpu.vram_total_mb) * 100 : null;
  const gpuUtilPct   = primaryGpu?.util_pct ?? null;
  const gpuTempC     = primaryGpu?.temp_c ?? null;
  const gpuPowerW    = primaryGpu?.power_w ?? null;

  const SC = { online: "#34d399", warning: "#fbbf24", offline: "#f87171", error: "#f87171", critical: "#f87171" };
  const sc = SC[c.status] ?? "rgba(255,255,255,0.25)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", overflowY: "auto", paddingBottom: 24 }}>

      {/* Host header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.28)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10B981", flexShrink: 0 }}>
          <Server size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", lineHeight: 1 }}>{c.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: sc, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc, boxShadow: `0 0 6px ${sc}`, display: "inline-block" }} />
              {c.status}
            </span>
            {m.os && <span>{m.os}</span>}
            {m.hostname && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{m.hostname}</span>}
          </div>
        </div>
        {uptimeDays != null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>
              {uptimeDays}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 2 }}>d</span>
              {uptimeH != null && <span style={{ fontSize: 13 }}> {uptimeH}<span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginLeft: 1 }}>h</span></span>}
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>uptime</div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {c.error && (
        <div style={{ fontSize: 11.5, color: "#f87171", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.14)", borderRadius: 10, padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <AlertTriangle size={13} /> {c.error}
        </div>
      )}

      {/* Ring gauges */}
      <div style={{ display: "flex", justifyContent: "space-around", background: "rgba(255,255,255,0.038)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "20px 16px" }}>
        <RingGauge value={m.cpu_pct}  label="CPU"  sublabel={m.cpu_cores ? `${m.cpu_cores} Cores` : null} color="#F59E0B" />
        <div style={{ width: 1, background: "rgba(255,255,255,0.07)", alignSelf: "stretch" }} />
        <RingGauge value={m.mem_pct}  label="RAM"  sublabel={memTotalGb} color="#10B981" />
        <div style={{ width: 1, background: "rgba(255,255,255,0.07)", alignSelf: "stretch" }} />
        <RingGauge value={m.disk_pct} label="Disk" sublabel={diskTotalGb} color="#6366f1" />
      </div>

      {/* CPU section */}
      <Section title="CPU" icon={<Cpu size={13} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <KV label="Modell"           value={m.cpu_model} mono />
          <KV label="Kerne"            value={m.cpu_cores} />
          <KV label="Load Avg (1/5/15m)" value={loadStr} mono />
          <KV label="Temperatur"       value={m.temp_c != null ? `${m.temp_c}°C` : null} />
          <KV label="Architektur"      value={m.arch} />
          <KV label="Kernel"           value={m.kernel} mono />
          {m.is_vm && <KV label="Virtualisierung" value={m.vm_type ?? "VM"} />}
        </div>
        {m.cpu_pct != null && (
          <div style={{ marginTop: 10 }}>
            <Bar value={m.cpu_pct} color="#F59E0B" label="CPU-Auslastung" />
          </div>
        )}
      </Section>

      {/* Memory */}
      <Section title="Arbeitsspeicher" icon={<Database size={13} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          <KV label="Gesamt" value={memTotalGb} />
          <KV label="Belegt" value={memUsedGb} />
          <KV label="Frei"   value={memFreeGb} />
        </div>
        {m.mem_pct != null && (
          <div style={{ marginTop: 10 }}>
            <Bar value={m.mem_pct} color="#10B981" label="RAM-Auslastung"
              sublabel={memUsedGb && memTotalGb ? `${memUsedGb} von ${memTotalGb}` : null} />
          </div>
        )}
      </Section>

      {/* Disk mounts */}
      {mounts.length > 0 ? (
        <Section title={`Datenträger (${mounts.length})`} icon={<HardDrive size={13} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {mounts.map((disk, i) => (
              <Bar
                key={i}
                value={disk.pct}
                color="#6366f1"
                label={disk.mount}
                sublabel={disk.used != null && disk.total != null
                  ? `${(disk.used / 1e9).toFixed(1)} GB von ${(disk.total / 1e9).toFixed(1)} GB`
                  : null}
              />
            ))}
          </div>
        </Section>
      ) : m.disk_pct != null && (
        <Section title="Datenträger" icon={<HardDrive size={13} />}>
          <Bar value={m.disk_pct} color="#6366f1" label="/"
            sublabel={diskUsedGb && diskTotalGb ? `${diskUsedGb} von ${diskTotalGb}` : null} />
        </Section>
      )}

      {/* GPU */}
      {gpu.available && (
        <Section title={`GPU${gpu.gpu_count > 1 ? ` (${gpu.gpu_count}×)` : ""}`} icon={<Cpu size={13} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <KV label="Modell"   value={gpuName} mono />
            <KV label="VRAM"     value={gpuVramTotal} />
            <KV label="Belegt"   value={gpuVramUsed} />
            <KV label="Temp"     value={gpuTempC != null ? `${gpuTempC}°C` : null} />
            <KV label="Leistung" value={gpuPowerW != null ? `${gpuPowerW} W` : null} />
          </div>
          {gpuUtilPct != null && (
            <div style={{ marginTop: 10 }}>
              <Bar value={gpuUtilPct} color="#8B5CF6" label="GPU-Auslastung" />
            </div>
          )}
          {gpuVramUsedPct != null && (
            <div style={{ marginTop: 8 }}>
              <Bar value={gpuVramUsedPct} color="#a78bfa" label="VRAM-Auslastung"
                sublabel={gpuVramUsed && gpuVramTotal ? `${gpuVramUsed} / ${gpuVramTotal}` : null} />
            </div>
          )}
        </Section>
      )}

      {/* Systemd */}
      {(svc.running != null || svc.failed_count != null) && (
        <Section title="Systemd-Services" icon={<CheckCircle size={13} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            <KV label="Aktiv"   value={svc.running} />
            <KV label="Gesamt"  value={svc.total} />
            <KV label="Failed"  value={svc.failed_count} />
          </div>
          {failedUnits.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 2 }}>Failed Units</div>
              {failedUnits.map(u => (
                <div key={u} style={{ fontSize: 11.5, color: "#f87171", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.14)", borderRadius: 7, padding: "4px 10px", fontFamily: "'JetBrains Mono', monospace" }}>
                  {u}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* No metrics state */}
      {c.status !== "online" && m.cpu_pct == null && (
        <div style={{ textAlign: "center", padding: "32px", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
          Keine Metriken verfügbar — Host ist {c.status}
        </div>
      )}
    </div>
  );
}

/* ── LabSystem ───────────────────────────────────────────────── */
export default function LabSystem() {
  const [data, setData]             = useState(null);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState(null);
  const [selected, setSelected]     = useState(null);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const d = await api.status.detailed();
      setData(d);
      const hosts = (d?.connectors ?? []).filter(c => c.type === "linux_probe" || c.type === "linux_ssh");
      if (hosts.length && (selected === null || !hosts.find(h => h.id === selected))) {
        setSelected(hosts[0].id);
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

  const hosts   = (data?.connectors ?? []).filter(c => c.type === "linux_probe" || c.type === "linux_ssh");
  const current = hosts.find(h => h.id === selected) ?? null;
  const SC      = { online: "#34d399", warning: "#fbbf24", offline: "#f87171", error: "#f87171", critical: "#f87171" };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span style={{ fontSize: 13, color: "var(--text-3)" }}>Lade System-Daten…</span>
    </div>
  );
  if (error) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#f87171", fontSize: 13, marginBottom: 8 }}>Fehler beim Laden</p>
        <p style={{ color: "var(--text-3)", fontSize: 11, marginBottom: 16 }}>{error}</p>
        <button onClick={() => load()} className="btn-primary">Erneut versuchen</button>
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "28px 32px", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", margin: 0, lineHeight: 1 }}>System</h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Hardware- und OS-Metriken</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "7px 14px" }}>
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Aktualisieren
        </button>
      </div>

      {hosts.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hosts.map(h => {
            const active = h.id === selected;
            const sc = SC[h.status] ?? "rgba(255,255,255,0.25)";
            return (
              <button key={h.id} onClick={() => setSelected(h.id)} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 14px", borderRadius: 20, border: "1px solid",
                borderColor: active ? "rgba(16,185,129,0.45)" : "rgba(255,255,255,0.09)",
                background: active ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.04)",
                cursor: "pointer", transition: "all 0.15s",
                fontSize: 12.5, fontWeight: active ? 600 : 500,
                color: active ? "#10B981" : "rgba(255,255,255,0.55)",
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc, boxShadow: active ? `0 0 6px ${sc}` : "none", display: "inline-block", flexShrink: 0 }} />
                {h.name}
                <span style={{ fontSize: 9.5, color: active ? "rgba(16,185,129,0.6)" : "rgba(255,255,255,0.2)", fontWeight: 400 }}>
                  {h.type === "linux_probe" ? "Full-Probe" : "SSH"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>
        {hosts.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
            <Cpu size={40} style={{ color: "rgba(255,255,255,0.10)" }} />
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
              Keine Linux-Hosts konfiguriert.<br />
              <span style={{ fontSize: 11 }}>Füge einen <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4 }}>linux_probe</code> Connector hinzu.</span>
            </div>
          </div>
        ) : current ? (
          <HostDetail connector={current} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
            Host auswählen
          </div>
        )}
      </div>
    </div>
  );
}
