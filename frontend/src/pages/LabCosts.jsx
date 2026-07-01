/**
 * LabCosts – AI API Kosten-Übersicht.
 * Zeigt ai_models Connector-Daten + manuelles Kosten-Tracking mit localStorage.
 */
import { useEffect, useState, useRef } from "react";
import { RefreshCw, DollarSign, Plus, Trash2, TrendingUp, Brain, Zap, Globe } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { api } from "../api/client";

/* ── localStorage helpers ────────────────────────────────────── */
const LS_KEY = "nexboard_ai_costs";

function loadCosts() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveCosts(entries) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(entries));
  } catch { /* ignore */ }
}

/* ── Mini bar chart ──────────────────────────────────────────── */
function CostBar({ entries }) {
  if (!entries.length) return null;
  const max = Math.max(...entries.map(e => e.amount), 0.01);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 56 }}>
      {entries.slice(-12).map((e, i) => {
        const h = Math.max(4, (e.amount / max) * 52);
        return (
          <div key={i} title={`${e.label}: €${e.amount.toFixed(2)}`} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
            <div style={{ width: "100%", height: h, borderRadius: "3px 3px 0 0", background: `rgba(139,92,246,${0.4 + 0.6 * (e.amount / max)})`, transition: "height 0.3s ease" }} />
            <span style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%", textAlign: "center" }}>
              {e.label.slice(-3)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Provider config ─────────────────────────────────────────── */
function providerMeta(usage, baseUrl) {
  const url = (baseUrl ?? "").toLowerCase();
  if (usage?.provider === "openrouter" || url.includes("openrouter"))
    return { label: "OpenRouter", short: "OR", accent: "#8B5CF6", rgb: "139,92,246" };
  if (usage?.provider === "openai" || url.includes("openai"))
    return { label: "OpenAI", short: "OA", accent: "#10a37f", rgb: "16,163,127" };
  return { label: "AI Server", short: "AI", accent: "#F59E0B", rgb: "245,158,11" };
}

/* ── Custom tooltip ──────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const val = payload[0]?.value;
  return (
    <div style={{
      background: "rgba(10,12,20,0.92)", border: "1px solid rgba(255,255,255,0.10)",
      borderRadius: 9, padding: "8px 12px", fontSize: 11,
    }}>
      <div style={{ color: "rgba(255,255,255,0.4)", marginBottom: 3 }}>{label}</div>
      <div style={{ color: "var(--text-1)", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
        ${typeof val === "number" ? val.toFixed(4) : "–"}
      </div>
    </div>
  );
}

/* ── AI connector card ───────────────────────────────────────── */
function AiConnectorCard({ connector: c }) {
  const m   = c.metrics ?? {};
  const u   = m.usage ?? null;
  const pm  = providerMeta(u, c.config?.base_url);
  const SC  = { online: "#34d399", warning: "#fbbf24", offline: "#f87171", error: "#f87171" };
  const sc  = SC[c.status] ?? "rgba(255,255,255,0.25)";

  const models  = m.available_models ?? m.models_loaded ?? [];
  const used    = u?.credits_used;
  const limit   = u?.credits_limit;
  const remaining = u?.credits_remaining;
  const pct     = (limit && used != null) ? Math.min(100, (used / limit) * 100) : null;
  const barCol  = pct > 85 ? "#f87171" : pct > 60 ? "#fbbf24" : "#34d399";

  // Fetch metric history from StatusSnapshot
  const [history, setHistory] = useState([]);
  useEffect(() => {
    api.status.metricHistory(c.id, "usage.credits_used", 168, 40)
      .then(d => {
        if (d?.labels?.length) {
          setHistory(d.labels.map((ts, i) => ({
            t: new Date(ts).toLocaleDateString("de", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
            v: d.values[i],
          })));
        }
      })
      .catch(() => {});
  }, [c.id]);

  return (
    <div style={{
      background: `rgba(${pm.rgb},0.05)`,
      border: `1px solid rgba(${pm.rgb},0.18)`,
      borderRadius: 18,
      overflow: "hidden",
    }}>
      {/* ── Header ── */}
      <div style={{
        padding: "16px 20px", display: "flex", alignItems: "center", gap: 12,
        borderBottom: `1px solid rgba(${pm.rgb},0.10)`,
        background: `rgba(${pm.rgb},0.04)`,
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
          background: `rgba(${pm.rgb},0.16)`, border: `1px solid rgba(${pm.rgb},0.30)`,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: pm.accent, fontWeight: 800, fontSize: 13, letterSpacing: "-0.02em",
        }}>
          {pm.short}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", lineHeight: 1 }}>{c.name}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 3 }}>
            {pm.label} · {m.models_available ?? models.length ?? 0} Modelle
            {u?.is_free_tier && <span style={{ marginLeft: 6, color: "#34d399" }}>· Free Tier</span>}
          </div>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 5, padding: "4px 10px",
          borderRadius: 20, background: `${sc}14`, border: `1px solid ${sc}28`,
          fontSize: 10.5, color: sc, flexShrink: 0,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: sc }} />
          {c.status}
        </div>
      </div>

      <div style={{ padding: "20px" }}>

        {/* ── Credit Stats ── */}
        {u ? (
          <>
            <div style={{ display: "flex", gap: 0, marginBottom: 18 }}>
              {[
                { label: "Verbraucht",   val: used != null     ? `$${used.toFixed(4)}`      : "–", col: "var(--text-1)", big: true },
                { label: "Verbleibend",  val: remaining != null ? `$${remaining.toFixed(2)}` : "–", col: "#34d399" },
                { label: "Limit",        val: limit != null    ? `$${limit.toFixed(2)}`      : "∞",  col: "rgba(255,255,255,0.4)" },
                ...(u.plan ? [{ label: "Plan", val: u.plan, col: "rgba(255,255,255,0.5)" }] : []),
                ...(u.period ? [{ label: "Zeitraum", val: u.period, col: "rgba(255,255,255,0.4)" }] : []),
              ].map(({ label, val, col, big }, i) => (
                <div key={label} style={{
                  flex: 1, padding: "12px 14px",
                  borderRight: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none",
                }}>
                  <div style={{
                    fontSize: big ? 24 : 18, fontWeight: 700, color: col, lineHeight: 1,
                    fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
                  }}>
                    {val}
                  </div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 5, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    {label}
                  </div>
                </div>
              ))}
            </div>

            {/* Credit meter */}
            {pct != null && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                  <span>Credit-Verbrauch</span>
                  <span style={{ color: barCol, fontWeight: 600 }}>{pct.toFixed(1)}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`, borderRadius: 3,
                    background: `linear-gradient(90deg, ${pm.accent}, ${barCol})`,
                    transition: "width 0.6s ease",
                    boxShadow: `0 0 8px ${barCol}60`,
                  }} />
                </div>
              </div>
            )}

            {used == null && (
              <div style={{ marginBottom: 16, fontSize: 11, color: "rgba(255,255,255,0.28)", padding: "8px 12px", background: "rgba(255,255,255,0.03)", borderRadius: 8 }}>
                Keine Usage-Daten — API-Key benötigt Billing-Berechtigung
              </div>
            )}
          </>
        ) : (
          <div style={{ marginBottom: 16, fontSize: 11, color: "rgba(255,255,255,0.28)" }}>
            Kein Usage-Tracking für lokale Server
          </div>
        )}

        {/* ── History Chart ── */}
        {history.length >= 2 ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 10 }}>
              Verbrauchsverlauf (letzte 7 Tage)
            </div>
            <ResponsiveContainer width="100%" height={120}>
              <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={`grad-${c.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={pm.accent} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={pm.accent} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} tickFormatter={v => `$${v.toFixed(3)}`} width={52} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: `rgba(${pm.rgb},0.3)`, strokeWidth: 1 }} />
                <Area
                  type="monotone" dataKey="v" stroke={pm.accent} strokeWidth={2}
                  fill={`url(#grad-${c.id})`} dot={false} activeDot={{ r: 4, fill: pm.accent, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : history.length === 0 && u ? (
          <div style={{ marginBottom: 20, padding: "14px", background: "rgba(255,255,255,0.02)", borderRadius: 10, textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>Verlaufsdaten werden gesammelt — nach dem ersten Poll-Zyklus (60s) erscheint hier ein Chart</div>
          </div>
        ) : null}

        {/* ── Model list ── */}
        {models.length > 0 && (
          <div>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)", marginBottom: 8 }}>
              Modelle ({models.length})
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, maxHeight: 80, overflow: "hidden" }}>
              {models.slice(0, 16).map((model, i) => {
                const name = typeof model === "string" ? model : (model.name ?? model.id ?? String(i));
                return (
                  <span key={i} style={{
                    fontSize: 10, padding: "3px 9px", borderRadius: 6,
                    background: `rgba(${pm.rgb},0.10)`, border: `1px solid rgba(${pm.rgb},0.22)`,
                    color: pm.accent, fontFamily: "'JetBrains Mono', monospace",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180,
                  }}>
                    {name}
                  </span>
                );
              })}
              {models.length > 16 && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", alignSelf: "center" }}>+{models.length - 16} weitere</span>
              )}
            </div>
          </div>
        )}

        {c.error && (
          <div style={{ marginTop: 12, fontSize: 11, color: "#f87171", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.14)", borderRadius: 8, padding: "7px 12px" }}>
            {c.error}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Cost entry form ─────────────────────────────────────────── */
function CostForm({ onAdd }) {
  const [label, setLabel]   = useState("");
  const [amount, setAmount] = useState("");
  const labelRef = useRef();

  function submit(e) {
    e.preventDefault();
    const amt = parseFloat(amount.replace(",", "."));
    if (!label.trim() || isNaN(amt) || amt < 0) return;
    onAdd({ label: label.trim(), amount: amt, date: new Date().toISOString() });
    setLabel("");
    setAmount("");
    labelRef.current?.focus();
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <input
        ref={labelRef}
        className="nb-input"
        placeholder="Zeitraum (z.B. Jun 2026)"
        value={label}
        onChange={e => setLabel(e.target.value)}
        style={{ width: 180, flexShrink: 0 }}
      />
      <input
        className="nb-input"
        placeholder="Kosten in €"
        type="text"
        inputMode="decimal"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        style={{ width: 120, flexShrink: 0 }}
      />
      <button type="submit" className="btn-primary" style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", fontSize: 12.5 }}>
        <Plus size={13} /> Eintragen
      </button>
    </form>
  );
}

/* ── LabCosts ────────────────────────────────────────────────── */
export default function LabCosts() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]       = useState(null);
  const [costs, setCosts]       = useState(() => loadCosts());

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
    const iv = setInterval(() => load(true), 60000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addCost(entry) {
    const next = [...costs, entry];
    setCosts(next);
    saveCosts(next);
  }

  function removeCost(idx) {
    const next = costs.filter((_, i) => i !== idx);
    setCosts(next);
    saveCosts(next);
  }

  const aiConnectors = (data?.connectors ?? []).filter(c => c.type === "ai_models");
  const totalModels  = aiConnectors.reduce((s, c) => {
    const m = c.metrics ?? {};
    const count = m.models_loaded_count ?? (Array.isArray(m.models_loaded) ? m.models_loaded.length : null) ?? (Array.isArray(m.available_models) ? m.available_models.length : 0);
    return s + count;
  }, 0);
  const totalCosts   = costs.reduce((s, e) => s + e.amount, 0);
  const lastCost     = costs.length ? costs[costs.length - 1] : null;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span style={{ fontSize: 13, color: "var(--text-3)" }}>Lade AI-Daten…</span>
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
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%", padding: "28px 32px", gap: 24, paddingBottom: 40 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "var(--text-1)", margin: 0, lineHeight: 1 }}>API Kosten</h1>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 4 }}>AI Model Server · Ausgaben-Tracking</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-ghost" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, padding: "7px 14px" }}>
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
          Aktualisieren
        </button>
      </div>

      {/* Summary pills */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {[
          { label: "AI Server",        value: aiConnectors.length,                 color: "#8B5CF6", icon: <Brain size={14} /> },
          { label: "Modelle geladen",  value: totalModels,                          color: "#a78bfa", icon: <Brain size={14} /> },
          { label: "Kosten gesamt",    value: `€ ${totalCosts.toFixed(2)}`,         color: "#34d399", icon: <DollarSign size={14} /> },
          ...(lastCost ? [{ label: "Letzter Eintrag", value: `€ ${lastCost.amount.toFixed(2)}`, color: "#fbbf24", icon: <TrendingUp size={14} /> }] : []),
        ].map(({ label, value, color, icon }) => (
          <div key={label} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 18px", borderRadius: 12,
            background: `${color}0C`, border: `1px solid ${color}20`,
          }}>
            <span style={{ color: `${color}80` }}>{icon}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700, color, fontVariantNumeric: "tabular-nums", lineHeight: 1 }}>{String(value)}</div>
              <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.3)", marginTop: 2 }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* AI Connectors */}
      {aiConnectors.length === 0 ? (
        <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "40px", textAlign: "center" }}>
          <Brain size={36} style={{ color: "rgba(255,255,255,0.10)", margin: "0 auto 12px", display: "block" }} />
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.3)", marginBottom: 4 }}>Keine AI Model Server konfiguriert</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.18)" }}>Füge einen <code style={{ background: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: 4 }}>ai_models</code> Connector hinzu</div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.3)", marginBottom: 12 }}>
            AI Server ({aiConnectors.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))", gap: 16 }}>
            {aiConnectors.map(c => <AiConnectorCard key={c.id} connector={c} />)}
          </div>
        </div>
      )}

      {/* External AI API info */}
      <div style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.18)", borderRadius: 14, padding: "16px 20px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(99,102,241,0.7)", marginBottom: 10 }}>
          Externe AI APIs einbinden
        </div>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", margin: "0 0 10px", lineHeight: 1.6 }}>
          OpenAI, Groq, Together.ai und andere OpenAI-kompatible Anbieter funktionieren bereits über den <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>ai_models</code> Connector — er listet dann deine verfügbaren Modelle automatisch.
        </p>
        <div style={{ background: "rgba(0,0,0,0.25)", borderRadius: 9, padding: "10px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, overflowX: "auto" }}>
          <span style={{ color: "#94a3b8" }}>type:</span> ai_models<br />
          <span style={{ color: "#94a3b8" }}>server_type:</span> <span style={{ color: "#a78bfa" }}>openai</span><br />
          <span style={{ color: "#94a3b8" }}>base_url:</span> <span style={{ color: "#34d399" }}>https://api.openai.com</span><span style={{ color: "rgba(255,255,255,0.3)" }}> # oder api.groq.com/openai/v1 etc.</span><br />
          <span style={{ color: "#94a3b8" }}>api_key:</span> <span style={{ color: "#fbbf24" }}>sk-...</span>
        </div>
        <p style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", margin: "10px 0 0", lineHeight: 1.5 }}>
          Anthropic (Claude API) ist nicht OpenAI-kompatibel — dafür kommt bald ein eigener Connector-Typ. Bis dahin: Kosten manuell unten eintragen.
        </p>
      </div>

      {/* Cost tracking */}
      <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden" }}>
        {/* Section header */}
        <div style={{ padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
          <DollarSign size={13} style={{ color: "rgba(255,255,255,0.35)" }} />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.35)", flex: 1 }}>
            Manuelles Ausgaben-Tracking
          </span>
          <span style={{ fontSize: 10.5, color: "rgba(255,255,255,0.2)" }}>
            Daten bleiben lokal gespeichert
          </span>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Chart */}
          {costs.length >= 2 && (
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>Verlauf</div>
              <CostBar entries={costs} />
            </div>
          )}

          {/* Add form */}
          <CostForm onAdd={addCost} />

          {/* Cost entries table */}
          {costs.length > 0 && (
            <div>
              <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.25)", marginBottom: 8 }}>
                Einträge ({costs.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {[...costs].reverse().map((entry, ri) => {
                  const idx = costs.length - 1 - ri;
                  return (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <span style={{ flex: 1, fontSize: 12.5, color: "rgba(255,255,255,0.65)" }}>{entry.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#34d399", fontVariantNumeric: "tabular-nums", fontFamily: "'JetBrains Mono', monospace" }}>
                        € {entry.amount.toFixed(2)}
                      </span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>
                        {new Date(entry.date).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      </span>
                      <button
                        onClick={() => removeCost(idx)}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.2)", padding: 4, lineHeight: 0 }}
                        title="Löschen"
                        onMouseEnter={e => e.currentTarget.style.color = "#f87171"}
                        onMouseLeave={e => e.currentTarget.style.color = "rgba(255,255,255,0.2)"}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 10 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#34d399", fontFamily: "'JetBrains Mono', monospace" }}>
                    Σ € {totalCosts.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {costs.length === 0 && (
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", textAlign: "center", padding: "16px 0" }}>
              Noch keine Einträge – trag deine monatlichen API-Ausgaben ein.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
