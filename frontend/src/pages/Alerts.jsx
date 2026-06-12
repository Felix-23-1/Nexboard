import { useEffect, useState, useCallback } from "react";
import {
  Bell, Plus, Trash2, Pencil, Mail, MessageSquare, Hash, Send,
  RefreshCw, PlayCircle, CheckCircle2, XCircle, AlertTriangle,
  Eye, EyeOff, Webhook, Smartphone,
} from "lucide-react";
import { api } from "../api/client";
import { useLicense } from "../license/LicenseContext";
import ProUpsell from "../components/ProUpsell";

// ── Channel type metadata (email, discord, slack, teams, telegram, webhook) ──
const TYPE_META = {
  email: {
    label: "E-Mail (SMTP)",
    icon: Mail,
    iconBg: "rgba(59,130,246,0.18)",
    iconColor: "#93c5fd",
    pro: false,
  },
  discord: {
    label: "Discord",
    icon: MessageSquare,
    iconBg: "rgba(99,102,241,0.18)",
    iconColor: "#a5b4fc",
    pro: false,
  },
  slack: {
    label: "Slack",
    icon: Hash,
    iconBg: "rgba(236,72,153,0.15)",
    iconColor: "#f9a8d4",
    pro: false,
  },
  teams: {
    label: "Microsoft Teams",
    icon: Send,
    iconBg: "rgba(91,111,247,0.18)",
    iconColor: "#a5b4fc",
    pro: true,
  },
  telegram: {
    label: "Telegram",
    icon: Smartphone,
    iconBg: "rgba(14,165,233,0.18)",
    iconColor: "#7dd3fc",
    pro: true,
  },
  webhook: {
    label: "Webhook (Custom)",
    icon: Webhook,
    iconBg: "rgba(20,184,166,0.18)",
    iconColor: "#5eead4",
    pro: false,
  },
};

const STATUSES = ["online", "warning", "offline", "error", "unknown"];

function fmtDate(v) {
  if (!v) return "–";
  return new Date(v).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

// ── Divider ──────────────────────────────────────────────────────────────────
function Divider() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "0" }} />;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Alerts() {
  const { features, loading: licenseLoading } = useLicense();
  const [tab, setTab] = useState("channels");

  if (licenseLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Lädt…</span>
      </div>
    );
  }

  if (!features.alerts) {
    return (
      <ProUpsell
        title="Alert-System ist ein Pro-Feature"
        description="Lass dich automatisch benachrichtigen, sobald ein System ausfällt oder kritisch wird."
        features={[
          "E-Mail-Versand über deinen eigenen SMTP-Server",
          "Discord-, Slack-, Teams- und Telegram-Webhooks",
          "Regeln pro Connector mit Cooldown gegen Spam",
          "Verlauf aller ausgelösten Alarme",
        ]}
      />
    );
  }

  return (
    <div className="flex flex-col" style={{ minHeight: "100%" }}>

      {/* Topbar */}
      <div className="glass-topbar flex items-center justify-between px-5 py-3 flex-shrink-0">
        <div>
          <div className="page-title">Alerts</div>
          <div className="page-sub">Benachrichtigungen bei Statuswechseln deiner Connectors</div>
        </div>
        <button className="btn-primary flex items-center gap-2 text-sm py-1.5">
          <Plus size={13} /> Kanal hinzufügen
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex px-5 flex-shrink-0" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        {[
          { id: "channels", label: "Kanäle" },
          { id: "rules",    label: "Regeln" },
          { id: "events",   label: "Verlauf" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`nb-tab${tab === t.id ? " active" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 p-5">
        {tab === "channels" && <ChannelsTab />}
        {tab === "rules"    && <RulesTab />}
        {tab === "events"   && <EventsTab />}
      </div>
    </div>
  );
}

// ── Channels Tab ──────────────────────────────────────────────────────────────
function ChannelsTab() {
  const [channels, setChannels]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showForm, setShowForm]   = useState(null); // type string or null
  const [editItem, setEditItem]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setChannels(await api.alerts.channels.list()); } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    if (!confirm("Kanal wirklich löschen?")) return;
    await api.alerts.channels.delete(id);
    setChannels((c) => c.filter((x) => x.id !== id));
  }

  async function handleTest(id) {
    try {
      await api.alerts.channels.test(id);
      alert("Testnachricht gesendet ✓");
    } catch (e) {
      alert("Fehler: " + e.message);
    }
  }

  if (showForm) {
    return (
      <ChannelForm
        type={showForm}
        existing={editItem}
        onSave={async ({ name, ...config }) => {
          // Backend erwartet { name, type, config: {...} }
          const payload = {
            name: name || TYPE_META[showForm]?.label || showForm,
            type: showForm,
            config,
          };
          if (editItem) {
            await api.alerts.channels.update(editItem.id, { name: payload.name, config: payload.config });
          } else {
            await api.alerts.channels.create(payload);
          }
          setShowForm(null);
          setEditItem(null);
          load();
        }}
        onCancel={() => { setShowForm(null); setEditItem(null); }}
      />
    );
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="section-label">Verfügbare Kanäle</div>

      {/* Type picker (add new) */}
      <div className="grid grid-cols-3 gap-3">
        {Object.entries(TYPE_META).map(([type, meta]) => {
          const Icon = meta.icon;
          return (
            <button
              key={type}
              onClick={() => setShowForm(type)}
              className="card flex flex-col items-center gap-2 py-4 text-center cursor-pointer"
              style={{ padding: "14px 12px" }}
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center"
                style={{ background: meta.iconBg }}
              >
                <Icon size={17} style={{ color: meta.iconColor }} />
              </div>
              <div>
                <div className="text-[12px] font-medium" style={{ color: "rgba(255,255,255,0.78)" }}>
                  {meta.label}
                  {meta.pro && <span className="badge-pro ml-1.5">Pro</span>}
                </div>
                <div className="text-[10.5px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                  + Einrichten
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Configured channels */}
      {loading ? (
        <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Lade Kanäle…</p>
      ) : channels.length > 0 ? (
        <div>
          <div className="section-label mt-4">Konfigurierte Kanäle</div>
          <div className="space-y-2">
            {channels.map((ch) => {
              const meta = TYPE_META[ch.type] ?? TYPE_META.webhook;
              const Icon = meta.icon;
              return (
                <div key={ch.id} className="card flex items-center gap-3" style={{ padding: "10px 14px" }}>
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: meta.iconBg }}
                  >
                    <Icon size={15} style={{ color: meta.iconColor }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-medium" style={{ color: "rgba(255,255,255,0.82)" }}>
                      {ch.name || meta.label}
                    </div>
                    <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.32)" }}>
                      {meta.label} · {ch.enabled ? "Aktiv" : "Deaktiviert"}
                    </div>
                  </div>
                  <span className={ch.enabled ? "badge-ok" : "badge-neutral"}>
                    {ch.enabled ? "Aktiv" : "Deaktiviert"}
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleTest(ch.id)}
                      title="Testen"
                      className="btn-ghost py-1 px-2 text-xs flex items-center gap-1"
                    >
                      <PlayCircle size={12} /> Test
                    </button>
                    <button
                      onClick={() => { setEditItem(ch); setShowForm(ch.type); }}
                      title="Bearbeiten"
                      className="btn-ghost py-1 px-2"
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      onClick={() => handleDelete(ch.id)}
                      title="Löschen"
                      className="btn-ghost py-1 px-2"
                      style={{ color: "#f87171" }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Channel Form ──────────────────────────────────────────────────────────────
function ChannelForm({ type, existing, onSave, onCancel }) {
  const meta = TYPE_META[type] ?? TYPE_META.webhook;
  const Icon = meta.icon;
  // Beim Bearbeiten: config-Felder flach + name auf oberster Ebene
  const [form, setForm] = useState(
    existing ? { name: existing.name, ...(existing.config ?? {}) } : {}
  );
  const [saving, setSaving] = useState(false);

  function upd(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try { await onSave(form); } finally { setSaving(false); }
  }

  return (
    <div className="max-w-lg">
      <button
        onClick={onCancel}
        className="text-xs mb-4 flex items-center gap-1"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        ← Zurück zu Kanälen
      </button>

      <div className="card" style={{ padding: "1.5rem" }}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: meta.iconBg }}
          >
            <Icon size={19} style={{ color: meta.iconColor }} />
          </div>
          <div>
            <div className="text-[14px] font-medium" style={{ color: "rgba(255,255,255,0.88)" }}>
              {meta.label} einrichten
              {meta.pro && <span className="badge-pro ml-2">Pro</span>}
            </div>
            <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.32)" }}>
              Alert-Kanal konfigurieren
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Common: name */}
          <FormRow label="Name (optional)">
            <input className="nb-input" value={form.name ?? ""} onChange={(e) => upd("name", e.target.value)} placeholder={`Mein ${meta.label}-Kanal`} />
          </FormRow>

          {/* E-Mail */}
          {type === "email" && <>
            <FormRow label="SMTP Host"><input className="nb-input" value={form.smtp_host ?? ""} onChange={(e) => upd("smtp_host", e.target.value)} placeholder="smtp.gmail.com" required /></FormRow>
            <div className="grid grid-cols-2 gap-3">
              <FormRow label="Port"><input className="nb-input" type="number" value={form.smtp_port ?? 587} onChange={(e) => upd("smtp_port", +e.target.value)} /></FormRow>
              <FormRow label="Verschlüsselung">
                <select className="nb-select" value={form.smtp_tls ?? "starttls"} onChange={(e) => upd("smtp_tls", e.target.value)}>
                  <option value="starttls">STARTTLS</option><option value="ssl">SSL/TLS</option><option value="none">Keine</option>
                </select>
              </FormRow>
            </div>
            <FormRow label="Benutzername"><input className="nb-input" value={form.smtp_user ?? ""} onChange={(e) => upd("smtp_user", e.target.value)} placeholder="alerts@firma.de" /></FormRow>
            <FormRow label="Passwort">
              <SecretInput value={form.smtp_pass ?? ""} onChange={(v) => upd("smtp_pass", v)} placeholder="••••••••" />
            </FormRow>
            <FormRow label="Empfänger-E-Mail"><input className="nb-input" type="email" value={form.to_email ?? ""} onChange={(e) => upd("to_email", e.target.value)} placeholder="admin@firma.de" required /></FormRow>
          </>}

          {/* Discord */}
          {type === "discord" && <>
            <div className="nb-code text-[11px] mb-1">
              Server → Kanal bearbeiten → Integrationen → Webhook erstellen → URL kopieren
            </div>
            <FormRow label="Webhook URL">
              <SecretInput value={form.webhook_url ?? ""} onChange={(v) => upd("webhook_url", v)} placeholder="https://discord.com/api/webhooks/…" required />
            </FormRow>
          </>}

          {/* Slack */}
          {type === "slack" && <>
            <div className="nb-code text-[11px] mb-1">
              api.slack.com → Apps → Incoming Webhooks → Webhook URL kopieren
            </div>
            <FormRow label="Webhook URL">
              <SecretInput value={form.webhook_url ?? ""} onChange={(v) => upd("webhook_url", v)} placeholder="https://hooks.slack.com/services/…" required />
            </FormRow>
          </>}

          {/* Teams */}
          {type === "teams" && <>
            <div className="nb-code text-[11px] mb-1">
              Teams-Kanal → ··· → Connectors → Incoming Webhook → URL kopieren
            </div>
            <FormRow label="Webhook URL">
              <SecretInput value={form.webhook_url ?? ""} onChange={(v) => upd("webhook_url", v)} placeholder="https://firma.webhook.office.com/…" required />
            </FormRow>
          </>}

          {/* Telegram */}
          {type === "telegram" && <>
            <div className="nb-code text-[11px] mb-1">
              1. @BotFather → /newbot → Token kopieren&nbsp;&nbsp;
              2. Bot anschreiben → api.telegram.org/bot&lt;TOKEN&gt;/getUpdates → Chat-ID
            </div>
            <FormRow label="Bot-Token">
              <SecretInput value={form.bot_token ?? ""} onChange={(v) => upd("bot_token", v)} placeholder="7412305867:AAGxyz…" required />
            </FormRow>
            <FormRow label="Chat-ID">
              <input className="nb-input" value={form.chat_id ?? ""} onChange={(e) => upd("chat_id", e.target.value)} placeholder="-100123456789" required />
            </FormRow>
            <FormRow label="Nachrichtenformat">
              <select className="nb-select" value={form.parse_mode ?? "text"} onChange={(e) => upd("parse_mode", e.target.value)}>
                <option value="text">Standard (Text)</option>
                <option value="Markdown">Markdown</option>
                <option value="HTML">HTML</option>
              </select>
            </FormRow>
          </>}

          {/* Webhook */}
          {type === "webhook" && <>
            <FormRow label="URL"><input className="nb-input" type="url" value={form.webhook_url ?? ""} onChange={(e) => upd("webhook_url", e.target.value)} placeholder="https://mein-server.de/alert" required /></FormRow>
            <FormRow label="HTTP-Methode">
              <select className="nb-select" value={form.method ?? "POST"} onChange={(e) => upd("method", e.target.value)}>
                <option>POST</option><option>PUT</option><option>GET</option>
              </select>
            </FormRow>
            <FormRow label="Secret Header (optional)">
              <SecretInput value={form.secret ?? ""} onChange={(v) => upd("secret", v)} placeholder="Bearer token123" />
            </FormRow>
          </>}

          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 text-sm">
              {saving ? "Speichern…" : "Kanal speichern"}
            </button>
            <button type="button" onClick={onCancel} className="btn-ghost text-sm">Abbrechen</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FormRow({ label, children }) {
  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.42)" }}>{label}</label>
      {children}
    </div>
  );
}

function SecretInput({ value, onChange, placeholder, required }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        className="nb-input pr-10"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        {show ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    </div>
  );
}

// ── Rules Tab ─────────────────────────────────────────────────────────────────
function RulesTab() {
  const [rules, setRules]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [connectors, setConnectors] = useState([]);
  const [channels, setChannels]     = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, conns, chans] = await Promise.all([
        api.alerts.rules.list(),
        api.connectors.list(),
        api.alerts.channels.list(),
      ]);
      setRules(r); setConnectors(conns); setChannels(chans);
    } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function deleteRule(id) {
    if (!confirm("Regel wirklich löschen?")) return;
    await api.alerts.rules.delete(id);
    setRules((r) => r.filter((x) => x.id !== id));
  }

  if (loading) return <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Lade Regeln…</p>;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="section-label">Aktive Regeln ({rules.length})</div>
        <button onClick={() => setShowForm(true)} className="btn-primary flex items-center gap-2 text-sm py-1.5">
          <Plus size={13} /> Neue Regel
        </button>
      </div>

      {showForm && (
        <RuleForm
          connectors={connectors}
          channels={channels}
          onSave={async (data) => {
            await api.alerts.rules.create(data);
            setShowForm(false);
            load();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {rules.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>Noch keine Regeln angelegt.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div key={r.id} className="card flex items-center gap-3" style={{ padding: "10px 14px" }}>
              <div className="flex-1 min-w-0">
                <div className="text-[12.5px] font-medium" style={{ color: "rgba(255,255,255,0.82)" }}>
                  {r.connector_name ?? r.connector_id}
                </div>
                <div className="text-[11px]" style={{ color: "rgba(255,255,255,0.32)" }}>
                  Status → {r.trigger_status} · Cooldown {r.cooldown_minutes} Min.
                  {r.channel_names?.length > 0 && ` · → ${r.channel_names.join(", ")}`}
                </div>
              </div>
              <span className={r.enabled ? "badge-ok" : "badge-neutral"}>
                {r.enabled ? "Aktiv" : "Pausiert"}
              </span>
              <button onClick={() => deleteRule(r.id)} className="btn-ghost py-1 px-2" style={{ color: "#f87171" }}>
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RuleForm({ connectors, channels, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: "",
    connector_ids: [],
    trigger_statuses: ["offline", "error"],
    cooldown_minutes: 30,
    channel_ids: [],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);

  function upd(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function toggleId(key, id) {
    setForm((f) => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id],
    }));
  }

  async function submit(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError("Bitte einen Namen eingeben."); return; }
    if (form.connector_ids.length === 0) { setError("Mindestens einen Connector auswählen."); return; }
    if (form.trigger_statuses.length === 0) { setError("Mindestens einen Auslöser auswählen."); return; }
    if (form.channel_ids.length === 0) { setError("Mindestens einen Kanal auswählen."); return; }
    setSaving(true);
    try {
      await onSave({
        name: form.name.trim(),
        connector_ids: form.connector_ids.map(Number),
        trigger_statuses: form.trigger_statuses,
        cooldown_minutes: form.cooldown_minutes,
        channel_ids: form.channel_ids.map(Number),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const chipActive = (bg) => ({ background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.32)", color: "#FCD34D" });
  const chipInactive = () => ({ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.45)" });

  return (
    <div className="card" style={{ padding: "1.25rem" }}>
      <div className="text-[13px] font-medium mb-4" style={{ color: "rgba(255,255,255,0.8)" }}>Neue Regel</div>
      {error && (
        <div style={{ fontSize: 11.5, color: "#f87171", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 8, padding: "7px 12px", marginBottom: 12 }}>
          {error}
        </div>
      )}
      <form onSubmit={submit} className="space-y-3">
        <FormRow label="Name">
          <input className="nb-input" value={form.name} onChange={(e) => upd("name", e.target.value)} placeholder="z.B. Proxmox offline → Discord" required />
        </FormRow>

        <FormRow label="Connectors (Mehrfachauswahl)">
          <div className="flex flex-wrap gap-2 mt-1">
            {connectors.length === 0 && (
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.3)" }}>Keine Connectors vorhanden</span>
            )}
            {connectors.map((c) => {
              const active = form.connector_ids.includes(c.id);
              return (
                <button key={c.id} type="button" onClick={() => toggleId("connector_ids", c.id)}
                  className="text-xs px-2.5 py-1 rounded-md transition-all"
                  style={active ? chipActive() : chipInactive()}>
                  {c.name}
                </button>
              );
            })}
          </div>
        </FormRow>

        <FormRow label="Auslöser (Mehrfachauswahl)">
          <div className="flex flex-wrap gap-2 mt-1">
            {STATUSES.map((s) => {
              const active = form.trigger_statuses.includes(s);
              return (
                <button key={s} type="button" onClick={() => toggleId("trigger_statuses", s)}
                  className="text-xs px-2.5 py-1 rounded-md transition-all"
                  style={active ? chipActive() : chipInactive()}>
                  {s}
                </button>
              );
            })}
          </div>
        </FormRow>

        <FormRow label="Cooldown (Minuten)">
          <input className="nb-input" type="number" min={0} max={10080} value={form.cooldown_minutes}
            onChange={(e) => upd("cooldown_minutes", +e.target.value)} style={{ maxWidth: 120 }} />
        </FormRow>

        <FormRow label="Kanäle (Mehrfachauswahl)">
          <div className="flex flex-wrap gap-2 mt-1">
            {channels.length === 0 && (
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.3)" }}>Erst Kanäle einrichten</span>
            )}
            {channels.map((ch) => {
              const active = form.channel_ids.includes(ch.id);
              return (
                <button key={ch.id} type="button" onClick={() => toggleId("channel_ids", ch.id)}
                  className="text-xs px-2.5 py-1 rounded-md transition-all"
                  style={active ? chipActive() : chipInactive()}>
                  {ch.name || (TYPE_META[ch.type]?.label ?? ch.type)}
                </button>
              );
            })}
          </div>
        </FormRow>

        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={saving} className="btn-primary text-sm">
            {saving ? "Speichern…" : "Regel speichern"}
          </button>
          <button type="button" onClick={onCancel} className="btn-ghost text-sm">Abbrechen</button>
        </div>
      </form>
    </div>
  );
}

// ── Events Tab ────────────────────────────────────────────────────────────────
function EventsTab() {
  const [events, setEvents]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEvents(await api.alerts.events()); } catch (_) {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dotColor = (status) => {
    if (status === "online") return "#34d399";
    if (status === "warning") return "#fbbf24";
    return "#f87171";
  };

  if (loading) return <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Lade Verlauf…</p>;

  return (
    <div className="max-w-2xl space-y-3">
      <div className="flex items-center justify-between">
        <div className="section-label">Verlauf ({events.length} Ereignisse)</div>
        <button onClick={load} className="btn-ghost py-1 px-2">
          <RefreshCw size={13} />
        </button>
      </div>

      {events.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>Noch keine Ereignisse aufgezeichnet.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: "0" }}>
          {events.map((ev, i) => (
            <div key={ev.id ?? i}>
              <div className="flex items-start gap-3 px-4 py-3">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5"
                  style={{ background: dotColor(ev.new_status) }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px]" style={{ color: "rgba(255,255,255,0.78)" }}>
                    <span className="font-medium">{ev.connector_name ?? ev.connector_id}</span>
                    {" → "}
                    <span style={{ color: dotColor(ev.new_status) }}>{ev.new_status}</span>
                  </div>
                  {ev.channels_notified?.length > 0 && (
                    <div className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.32)" }}>
                      Gesendet über: {ev.channels_notified.join(", ")}
                    </div>
                  )}
                </div>
                <div className="text-[11px] flex-shrink-0" style={{ color: "rgba(255,255,255,0.25)" }}>
                  {fmtDate(ev.created_at)}
                </div>
              </div>
              {i < events.length - 1 && (
                <div style={{ height: 1, background: "rgba(255,255,255,0.05)", margin: "0 16px" }} />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
