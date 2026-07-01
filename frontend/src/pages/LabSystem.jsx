/**
 * LabSystem – Detailed system metrics for linux_probe / linux_ssh hosts.
 * Host-switcher pills · CPU/RAM/Disk ring gauges · Memory breakdown ·
 * Disk mounts · Systemd · GPU
 */
import { useEffect, useState } from "react";
import { RefreshCw, Cpu, HardDrive, Database, AlertTriangle, CheckCircle, Server } from "lucide-react";
import { api } from "../api/client";

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
      <div style={{ padding: "14px 16px" }}>
        {children}
      </div>
    </div>
  );
}

/* ── Stat key/value pair ─────────────────────────────────────── */
function KV({ label, value, mono = false }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.38)" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.75)", fontFamily: mono ? "'JetBrains Mono', monospace" : undefined }}>{value ?? "–"}</span>
    </div>
  );
}

/* ── Host Detail ─────────────────────────────────────────────── */
function HostDetail({ connector: c }) {
  const m   = c.metrics ?? {};
  const gpu = m.gpu ?? {};

  const diskPct   = m.disk_pct ?? 0;
  const diskUsed  = m.disk_used_gb  != null ? `${m.disk_used_gb.toFixed(1)} GB` : null;
  const diskTotal = m.disk_total_gb != null ? `${m.disk_total_gb.toFixed(1)} GB` : null;
  const memTotal  = m.mem_total_gb  != null ? `${m.mem_total_gb.toFixed(1)} GB`  : null;
  const memUsed   = m.mem_used_gb   != null ? `${m.mem_used_gb.toFixed(1)} GB`   : null;

  // Load average
  const load = m.load_avg;
  const loadStr = load
    ? (Array.isArray(load)
        ? `${load[0]?.toFixed(2)} / ${load[1]?.toFixed(2)} / ${load[2]?.toFixed(2)}`
        : `${load["1m"]?.toFixed(2) ?? "–"} / ${load["5m"]?.toFixed(2) ?? "–"} / ${load["15m"]?.toFixed(2) ?? "–"}`)
    : null;

  // Disk mounts
  const mounts = m.disks ?? [];

  // Systemd
  const svc = m.systemd ?? {};

  // Status color
  const SC = { online: "#34d399", warning: "#fbbf24", offline: "#f87171", error: "#f87171", critical: "#f87171", unknown: "rgba(255,255,255,0.25)" };
  const sc = SC[c.status] ?? SC.unknown;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", overflowY: "auto", paddingBottom: 24 }}>

      {/* Host header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.28)", display: "flex", alignItems: "center", justifyContent: "center", color: "#10B981", flexShrink: 0 }}>
          <Server size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", lineHeight: 1 }}>{c.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4, display: "flex", gap: 12 }}>
            <span style={{ color: sc, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc, boxShadow: `0 0 6px ${sc}`, display: "inline-block" }} />
              {c.status}
            </span>
            {m.os_pretty && <span>{m.os_pretty}</span>}
            {m.hostname && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{m.hostname}</span>}
          </div>
        </div>
        {m.uptime_days != null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text-1)", fontVariantNumeric: "tabular-nums" }}>{m.uptime_days}</div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>Tage uptime</div>
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
        <RingGauge value={m.cpu_pct} label="CPU" sublabel={m.cpu_cores ? `${m.cpu_cores} Cores` : null} color="#F59E0B" />
        <div style={{ width: 1, background: "rgba(255,255,255,0.07)", alignSelf: "stretch" }} />
        <RingGauge value={m.mem_pct} label="RAM" sublabel={memTotal} color="#10B981" />
        <div style={{ width: 1, background: "rgba(255,255,255,0.07)", alignSelf: "stretch" }} />
        <RingGauge value={diskPct}   label="Disk" sublabel={diskTotal} color="#6366f1" />
      </div>

      {/* CPU details */}
      <Section title="CPU" icon={<Cpu size={13} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {m.cpu_model && <KV label="Modell" value={m.cpu_model} mono />}
          {m.cpu_cores && <KV label="Kerne" value={m.cpu_cores} />}
          {m.cpu_freq_mhz && <KV label="Frequenz" value={`${(m.cpu_freq_mhz / 1000).toFixed(1)} GHz`} />}
          {loadStr && <KV label="Load Avg (1/5/15m)" value={loadStr} mono />}
          {m.cpu_temp_c && <KV label="Temperatur" value={`${m.cpu_temp_c}°C`} />}
        </div>
        {m.cpu_pct != null && (
          <div style={{ marginTop: 10 }}>
            <Bar value={m.cpu_pct} color="#F59E0B" label="CPU-Auslastung" sublabel={`${Math.round(m.cpu_pct ?? 0)}% belegt`} />
          </div>
        )}
      </Section>

      {/* Memory */}
      <Section title="Arbeitsspeicher" icon={<Database size={13} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {memTotal  && <KV label="Gesamt" value={memTotal} />}
          {memUsed   && <KV label="Belegt" value={memUsed} />}
          {m.mem_cached_gb != null && <KV label="Gecacht" value={`${m.mem_cached_gb.toFixed(1)} GB`} />}
          {m.mem_free_gb   != null && <KV label="Frei" value={`${m.mem_free_gb.toFixed(1)} GB`} />}
        </div>
        {m.mem_pct != null && (
          <div style={{ marginTop: 10 }}>
            <Bar value={m.mem_pct} color="#10B981" label="RAM-Auslastung" sublabel={memUsed && memTotal ? `${memUsed} von ${memTotal}` : null} />
          </div>
        )}
      </Section>

      {/* Disk mounts – if detailed mount data available */}
      {mounts.length > 0 ? (
        <Section title="Datenträger" icon={<HardDrive size={13} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {mounts.map((disk, i) => (
              <div key={i}>
                <Bar
                  value={disk.use_pct ?? disk.percent}
                  color="#6366f1"
                  label={disk.mountpoint ?? disk.mount ?? disk.device ?? `Disk ${i + 1}`}
                  sublabel={disk.used_gb != null
                    ? `${disk.used_gb.toFixed(1)} GB von ${disk.total_gb?.toFixed(1) ?? "?"} GB`
                    : disk.fstype ?? null}
                />
              </div>
            ))}
          </div>
        </Section>
      ) : (
        /* Single disk fallback */
        diskPct > 0 && (
          <Section title="Datenträger" icon={<HardDrive size={13} />}>
            <Bar value={diskPct} color="#6366f1" label="/" sublabel={diskUsed && diskTotal ? `${diskUsed} von ${diskTotal}` : null} />
          </Section>
        )
      )}

      {/* GPU */}
      {gpu.available && (
        <Section title="GPU" icon={<Cpu size={13} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {gpu.model      && <KV label="Modell" value={gpu.model} mono />}
            {gpu.vram_total_gb != null && <KV label="VRAM gesamt" value={`${gpu.vram_total_gb} GB`} />}
            {gpu.vram_used_gb  != null && <KV label="VRAM belegt" value={`${gpu.vram_used_gb} GB`} />}
            {gpu.driver_version && <KV label="Treiber" value={gpu.driver_version} mono />}
          </div>
          {gpu.utilization_pct != null && (
            <div style={{ marginTop: 10 }}>
              <Bar value={gpu.utilization_pct} color="#8B5CF6" label="GPU-Auslastung" />
            </div>
          )}
          {gpu.vram_total_gb && gpu.vram_used_gb && (
            <div style={{ marginTop: 8 }}>
              <Bar value={(gpu.vram_used_gb / gpu.vram_total_gb) * 100} color="#a78bfa" label="VRAM-Auslastung" sublabel={`${gpu.vram_used_gb} / ${gpu.vram_total_gb} GB`} />
            </div>
          )}
        </Section>
      )}

      {/* Systemd */}
      {(svc.running != null || svc.failed_count != null) && (
        <Section title="Systemd-Services" icon={<CheckCircle size={13} />}>
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {svc.running       != null && <KV label="Aktiv" value={svc.running} />}
            {svc.inactive      != null && <KV label="Inaktiv" value={svc.inactive} />}
            {svc.failed_count  != null && <KV label="Failed" value={svc.failed_count} />}
            {svc.total         != null && <KV label="Gesamt" value={svc.total} />}
          </div>
          {(svc.failed_units ?? []).length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 2 }}>Failed Units</div>
              {svc.failed_units.map(u => (
                <div key={u} style={{ fontSize: 11.5, color: "#f87171", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.14)", borderRadius: 7, padding: "4px 10px", fontFamily: "'JetBrains Mono', monospace" }}>
                  {u}
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* Offline placeholder */}
      {c.status !== "online" && !c.metrics?.cpu_pct && (
        <div style={{ textAlign: "center", padding: "32px", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
          Keine Metriken verfügbar – Host ist {c.status}
        </div>
      )}
    </div>
  );
}

/* ── Empty state ─────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
      <Cpu size={40} style={{ color: "rgba(255,255,255,0.10)" }} />
      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
        Keine Linux-Hosts konfiguriert.<br />
        <span style={{ fontSize: 11 }}>Füge einen <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4 }}>linux_probe</code> Connector hinzu.</span>
      </div>
    </div>
  );
}

/* ── LabSystem ───────────────────────────────────────────────── */
export default function LabSystem() {
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState(null);
  const [selected, setSelected]   = useState(null);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const d = await api.status.detailed();
      setData(d);
      // auto-select first linux host
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

  const hosts    = (data?.connectors ?? []).filter(c => c.type === "linux_probe" || c.type === "linux_ssh");
  const current  = hosts.find(h => h.id === selected) ?? null;

  const SC = { online: "#34d399", warning: "#fbbf24", offline: "#f87171", error: "#f87171", critical: "#f87171", unknown: "rgba(255,255,255,0.25)" };

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

      {/* Page header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", margin: 0, lineHeight: 1 }}>System</h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Detaillierte Hardware- und OS-Metriken</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "7px 14px" }}>
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Aktualisieren
        </button>
      </div>

      {/* Host switcher pills */}
      {hosts.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hosts.map(h => {
            const active = h.id === selected;
            const sc = SC[h.status] ?? SC.unknown;
            return (
              <button
                key={h.id}
                onClick={() => setSelected(h.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 14px", borderRadius: 20, border: "1px solid",
                  borderColor: active ? "rgba(16,185,129,0.45)" : "rgba(255,255,255,0.09)",
                  background: active ? "rgba(16,185,129,0.10)" : "rgba(255,255,255,0.04)",
                  cursor: "pointer", transition: "all 0.15s",
                  fontSize: 12.5, fontWeight: active ? 600 : 500,
                  color: active ? "#10B981" : "rgba(255,255,255,0.55)",
                }}
              >
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

      {/* Detail area */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {hosts.length === 0 ? (
          <EmptyState />
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
