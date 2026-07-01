/**
 * LabNetwork – Netzwerk-Übersicht für linux_probe / linux_ssh Hosts.
 * Interfaces · IPs · Listening Ports · Bandbreite
 */
import { useEffect, useState } from "react";
import { RefreshCw, Globe, Network, ArrowDown, ArrowUp } from "lucide-react";
import { api } from "../api/client";

/* ── Badge ───────────────────────────────────────────────────── */
function Badge({ label, color }) {
  return (
    <span style={{
      fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase",
      padding: "2px 8px", borderRadius: 20,
      background: `${color}18`, border: `1px solid ${color}30`,
      color,
    }}>
      {label}
    </span>
  );
}

/* ── Interface card ──────────────────────────────────────────── */
function InterfaceCard({ iface }) {
  const up    = iface.state === "up" || iface.operstate === "up" || iface.is_up;
  const color = up ? "#34d399" : "rgba(255,255,255,0.2)";

  const fmtBytes = (b) => {
    if (b == null) return null;
    if (b >= 1e9) return `${(b / 1e9).toFixed(2)} GB`;
    if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
    if (b >= 1e3) return `${(b / 1e3).toFixed(0)} KB`;
    return `${b} B`;
  };

  const ips = iface.ip_addresses ?? (iface.ipv4 ? [iface.ipv4] : []);

  return (
    <div style={{
      background: "rgba(255,255,255,0.038)",
      border: `1px solid ${up ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.07)"}`,
      borderRadius: 13,
      padding: "14px 16px",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}12`, border: `1px solid ${color}28`, display: "flex", alignItems: "center", justifyContent: "center", color, flexShrink: 0 }}>
          <Network size={16} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--text-1)", fontFamily: "'JetBrains Mono', monospace" }}>
            {iface.name ?? iface.interface ?? "?"}
          </div>
          {iface.mac && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", fontFamily: "'JetBrains Mono', monospace", marginTop: 1 }}>{iface.mac}</div>}
        </div>
        <Badge label={up ? "UP" : "DOWN"} color={color} />
        {iface.speed_mbps && <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)" }}>{iface.speed_mbps} Mbps</span>}
      </div>

      {/* IPs */}
      {ips.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          {ips.map((ip, i) => (
            <span key={i} style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(255,255,255,0.65)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: "2px 10px", fontFamily: "'JetBrains Mono', monospace" }}>
              {ip}
            </span>
          ))}
          {iface.ipv6 && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.03)", borderRadius: 7, padding: "2px 10px", fontFamily: "'JetBrains Mono', monospace" }}>
              {iface.ipv6.slice(0, 28)}{iface.ipv6.length > 28 ? "…" : ""}
            </span>
          )}
        </div>
      )}

      {/* RX/TX */}
      {(iface.rx_bytes != null || iface.tx_bytes != null || iface.rx_mb != null || iface.tx_mb != null) && (
        <div style={{ display: "flex", gap: 16, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
          {(iface.rx_bytes != null || iface.rx_mb != null) && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <ArrowDown size={11} style={{ color: "#60a5fa" }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "#60a5fa", fontFamily: "'JetBrains Mono', monospace" }}>
                {fmtBytes(iface.rx_bytes ?? (iface.rx_mb != null ? iface.rx_mb * 1e6 : null))}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>empfangen</span>
            </div>
          )}
          {(iface.tx_bytes != null || iface.tx_mb != null) && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <ArrowUp size={11} style={{ color: "#34d399" }} />
              <span style={{ fontSize: 11.5, fontWeight: 600, color: "#34d399", fontFamily: "'JetBrains Mono', monospace" }}>
                {fmtBytes(iface.tx_bytes ?? (iface.tx_mb != null ? iface.tx_mb * 1e6 : null))}
              </span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>gesendet</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Port row ─────────────────────────────────────────────────── */
function PortRow({ port }) {
  const proto = (port.protocol ?? port.proto ?? "tcp").toUpperCase();
  const protoColor = proto === "UDP" ? "#fbbf24" : "#60a5fa";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "5px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <Badge label={proto} color={protoColor} />
      <span style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(255,255,255,0.7)", fontFamily: "'JetBrains Mono', monospace", width: 50, flexShrink: 0 }}>
        {port.port ?? port.local_port}
      </span>
      {port.process && <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.35)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{port.process}</span>}
      {port.address && <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", fontFamily: "'JetBrains Mono', monospace" }}>{port.address}</span>}
    </div>
  );
}

/* ── Host network detail ─────────────────────────────────────── */
function HostNetworkDetail({ connector: c }) {
  const m = c.metrics ?? {};

  // interfaces: try multiple field names the probe might use
  const interfaces = m.net_interfaces ?? m.interfaces ?? m.network_interfaces ?? [];
  const ports      = m.listening_ports ?? m.open_ports ?? m.ports ?? [];

  // Summary: total RX/TX
  const totalRxMb = m.net_rx_mb ?? null;
  const totalTxMb = m.net_tx_mb ?? null;

  const SC = { online: "#34d399", warning: "#fbbf24", offline: "#f87171", error: "#f87171", critical: "#f87171" };
  const sc = SC[c.status] ?? "rgba(255,255,255,0.25)";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%", overflowY: "auto", paddingBottom: 24 }}>

      {/* Host header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(96,165,250,0.12)", border: "1px solid rgba(96,165,250,0.28)", display: "flex", alignItems: "center", justifyContent: "center", color: "#60a5fa", flexShrink: 0 }}>
          <Globe size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-1)", lineHeight: 1 }}>{c.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 4, display: "flex", gap: 12 }}>
            <span style={{ color: sc, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc, boxShadow: `0 0 6px ${sc}`, display: "inline-block" }} />
              {c.status}
            </span>
            {m.hostname && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{m.hostname}</span>}
          </div>
        </div>

        {/* Total RX/TX summary */}
        {(totalRxMb != null || totalTxMb != null) && (
          <div style={{ display: "flex", gap: 16 }}>
            {totalRxMb != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#60a5fa", fontVariantNumeric: "tabular-nums" }}>
                  {totalRxMb >= 1024 ? `${(totalRxMb / 1024).toFixed(1)} GB` : `${totalRxMb.toFixed(0)} MB`}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                  <ArrowDown size={9} /> RX gesamt
                </div>
              </div>
            )}
            {totalTxMb != null && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#34d399", fontVariantNumeric: "tabular-nums" }}>
                  {totalTxMb >= 1024 ? `${(totalTxMb / 1024).toFixed(1)} GB` : `${totalTxMb.toFixed(0)} MB`}
                </div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", display: "flex", alignItems: "center", gap: 3, justifyContent: "flex-end" }}>
                  <ArrowUp size={9} /> TX gesamt
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Interfaces */}
      {interfaces.length > 0 ? (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 10 }}>
            Netzwerk-Interfaces ({interfaces.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10 }}>
            {interfaces.map((iface, i) => (
              <InterfaceCard key={i} iface={iface} />
            ))}
          </div>
        </div>
      ) : (
        /* Show basic info if no interface data */
        (m.net_rx_mb != null || m.net_tx_mb != null) && (
          <div style={{ background: "rgba(255,255,255,0.038)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, padding: "16px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>Netzwerk-Traffic</div>
            <div style={{ display: "flex", gap: 24 }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#60a5fa", fontVariantNumeric: "tabular-nums" }}>
                  {m.net_rx_mb >= 1024 ? `${(m.net_rx_mb / 1024).toFixed(1)} GB` : `${m.net_rx_mb?.toFixed(0) ?? "–"} MB`}
                </div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <ArrowDown size={10} /> Empfangen
                </div>
              </div>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#34d399", fontVariantNumeric: "tabular-nums" }}>
                  {m.net_tx_mb >= 1024 ? `${(m.net_tx_mb / 1024).toFixed(1)} GB` : `${m.net_tx_mb?.toFixed(0) ?? "–"} MB`}
                </div>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                  <ArrowUp size={10} /> Gesendet
                </div>
              </div>
            </div>
          </div>
        )
      )}

      {/* Listening ports */}
      {ports.length > 0 && (
        <div style={{ background: "rgba(255,255,255,0.038)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.11em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)" }}>
              Listening Ports ({ports.length})
            </span>
          </div>
          <div style={{ padding: "6px 16px 4px" }}>
            {ports.slice(0, 50).map((p, i) => <PortRow key={i} port={p} />)}
            {ports.length > 50 && <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.2)", padding: "8px 0" }}>+{ports.length - 50} weitere…</div>}
          </div>
        </div>
      )}

      {/* No data state */}
      {interfaces.length === 0 && ports.length === 0 && totalRxMb == null && (
        <div style={{ textAlign: "center", padding: "40px", color: "rgba(255,255,255,0.2)", fontSize: 12 }}>
          {c.status !== "online"
            ? `Keine Netzwerkdaten – Host ist ${c.status}`
            : "Keine Netzwerkdaten vom Probe-Script erhalten.\nPrüfe ob das linux_probe-Script Netzwerkdaten liefert."}
        </div>
      )}
    </div>
  );
}

/* ── LabNetwork ──────────────────────────────────────────────── */
export default function LabNetwork() {
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
  const SC = { online: "#34d399", warning: "#fbbf24", offline: "#f87171", error: "#f87171", critical: "#f87171" };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span style={{ fontSize: 13, color: "var(--text-3)" }}>Lade Netzwerkdaten…</span>
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

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", margin: 0, lineHeight: 1 }}>Netzwerk</h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>Interfaces · IPs · Ports · Traffic</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "7px 14px" }}>
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Aktualisieren
        </button>
      </div>

      {/* Host switcher */}
      {hosts.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {hosts.map(h => {
            const active = h.id === selected;
            const sc = SC[h.status] ?? "rgba(255,255,255,0.25)";
            return (
              <button key={h.id} onClick={() => setSelected(h.id)} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "6px 14px", borderRadius: 20, border: "1px solid",
                borderColor: active ? "rgba(96,165,250,0.45)" : "rgba(255,255,255,0.09)",
                background: active ? "rgba(96,165,250,0.10)" : "rgba(255,255,255,0.04)",
                cursor: "pointer", transition: "all 0.15s",
                fontSize: 12.5, fontWeight: active ? 600 : 500,
                color: active ? "#60a5fa" : "rgba(255,255,255,0.55)",
              }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc, boxShadow: active ? `0 0 6px ${sc}` : "none", display: "inline-block", flexShrink: 0 }} />
                {h.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Detail area */}
      <div style={{ flex: 1, minHeight: 0 }}>
        {hosts.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
            <Globe size={40} style={{ color: "rgba(255,255,255,0.10)" }} />
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", textAlign: "center" }}>
              Keine Linux-Hosts konfiguriert.<br />
              <span style={{ fontSize: 11 }}>Füge einen <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4 }}>linux_probe</code> Connector hinzu.</span>
            </div>
          </div>
        ) : current ? (
          <HostNetworkDetail connector={current} />
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "rgba(255,255,255,0.2)", fontSize: 13 }}>
            Host auswählen
          </div>
        )}
      </div>
    </div>
  );
}
