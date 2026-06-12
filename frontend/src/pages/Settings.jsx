import { useEffect, useState } from "react";
import { Eye, EyeOff, Save } from "lucide-react";
import { api } from "../api/client";

const PROVIDERS = [
  { value: "openai",    label: "OpenAI",              placeholder: "sk-..." },
  { value: "anthropic", label: "Anthropic (Claude)",  placeholder: "sk-ant-..." },
  { value: "ollama",    label: "Ollama (lokal)",       placeholder: "" },
];
const DEFAULT_MODELS = {
  openai:    "gpt-4o-mini",
  anthropic: "claude-haiku-4-5-20251001",
  ollama:    "llama3.2",
};

const TABS = ["Allgemein", "KI-Analyse", "Benachrichtigungen", "Erweitert"];

export default function Settings() {
  const [form, setForm]     = useState({
    ai_provider: "openai", ai_api_key: "", ai_model: "", ai_ollama_url: "http://localhost:11434",
  });
  const [showKey, setShowKey]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    api.settings.get().then((data) => { setForm(data); setLoading(false); });
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    await api.settings.save(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const provider = PROVIDERS.find((p) => p.value === form.ai_provider);

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <span className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Lade Einstellungen…</span>
    </div>
  );

  return (
    <div className="flex flex-col" style={{ minHeight: "100%" }}>

      {/* Topbar */}
      <div className="glass-topbar flex items-center justify-between px-5 py-3 flex-shrink-0">
        <div>
          <div className="page-title">Einstellungen</div>
          <div className="page-sub">Anwendung, KI und Benachrichtigungen konfigurieren</div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary flex items-center gap-2 text-sm py-1.5"
        >
          <Save size={13} />
          {saved ? "Gespeichert ✓" : saving ? "Speichern…" : "Speichern"}
        </button>
      </div>

      {/* Tab bar */}
      <div
        className="flex px-5 flex-shrink-0"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setActiveTab(i)}
            className={`nb-tab${activeTab === i ? " active" : ""}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-5">
        <form onSubmit={handleSave}>

          {/* Tab 0 – Allgemein */}
          {activeTab === 0 && (
            <div className="max-w-lg space-y-5">
              <div className="card space-y-4">
                <SettingsSection title="Darstellung">
                  <SettingsGrid>
                    <FormField label="Sprache">
                      <select className="nb-select">
                        <option>Deutsch</option>
                        <option>English</option>
                      </select>
                    </FormField>
                    <FormField label="Zeitzone">
                      <select className="nb-select">
                        <option>Europe/Berlin</option>
                        <option>UTC</option>
                      </select>
                    </FormField>
                    <FormField label="Aktualisierungsintervall">
                      <select className="nb-select">
                        <option>30 Sekunden</option>
                        <option>1 Minute</option>
                        <option>5 Minuten</option>
                      </select>
                    </FormField>
                    <FormField label="Datumsformat">
                      <select className="nb-select">
                        <option>DD.MM.YYYY</option>
                        <option>YYYY-MM-DD</option>
                      </select>
                    </FormField>
                  </SettingsGrid>
                </SettingsSection>
              </div>
              <div className="card space-y-1">
                <SettingsSection title="Verhalten">
                  <ToggleRow label="Auto-Refresh aktivieren" desc="Dashboard automatisch alle 30 Sek. aktualisieren" defaultOn />
                  <ToggleRow label="Browser-Benachrichtigungen" desc="Alerts als Desktop-Push anzeigen" />
                  <ToggleRow label="Zur letzten Seite zurückkehren" desc="Nach Login zur zuletzt besuchten Seite navigieren" defaultOn />
                </SettingsSection>
              </div>
            </div>
          )}

          {/* Tab 1 – KI-Analyse */}
          {activeTab === 1 && (
            <div className="max-w-lg space-y-5">
              <div className="card space-y-4">
                <SettingsSection title="KI-Provider">
                  <p className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.32)" }}>
                    Nexboard nutzt deinen eigenen API-Key — keine Daten werden an uns übertragen.
                  </p>
                  <SettingsGrid>
                    <FormField label="Provider">
                      <select
                        className="nb-select"
                        value={form.ai_provider}
                        onChange={(e) => setForm((f) => ({ ...f, ai_provider: e.target.value, ai_model: "" }))}
                      >
                        {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </FormField>
                    <FormField label="Modell">
                      <input
                        className="nb-input"
                        value={form.ai_model || DEFAULT_MODELS[form.ai_provider] || ""}
                        onChange={(e) => setForm((f) => ({ ...f, ai_model: e.target.value }))}
                        placeholder={DEFAULT_MODELS[form.ai_provider] ?? "Modell"}
                      />
                    </FormField>
                  </SettingsGrid>

                  {form.ai_provider !== "ollama" ? (
                    <FormField label="API-Key">
                      <div className="relative">
                        <input
                          type={showKey ? "text" : "password"}
                          className="nb-input pr-10"
                          value={form.ai_api_key}
                          onChange={(e) => setForm((f) => ({ ...f, ai_api_key: e.target.value }))}
                          placeholder={provider?.placeholder ?? "API Key"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowKey((s) => !s)}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2"
                          style={{ color: "rgba(255,255,255,0.35)" }}
                        >
                          {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </FormField>
                  ) : (
                    <FormField label="Ollama URL">
                      <input
                        className="nb-input"
                        value={form.ai_ollama_url}
                        onChange={(e) => setForm((f) => ({ ...f, ai_ollama_url: e.target.value }))}
                        placeholder="http://localhost:11434"
                      />
                    </FormField>
                  )}
                </SettingsSection>
              </div>
              <div className="card space-y-1">
                <SettingsSection title="KI-Funktionen">
                  <ToggleRow label="Log-Analyse" desc="KI liest Logs und erklärt was nicht stimmt" defaultOn />
                  <ToggleRow label="KI-Alerts" desc="KI erklärt den Fehler und gibt Handlungsempfehlungen" defaultOn />
                  <ToggleRow label="Tägliche Zusammenfassung" desc="Automatische KI-Zusammenfassung der Infrastruktur" />
                </SettingsSection>
              </div>
            </div>
          )}

          {/* Tab 2 – Benachrichtigungen */}
          {activeTab === 2 && (
            <div className="max-w-lg space-y-5">
              <div className="card space-y-1">
                <SettingsSection title="Aktive Kanäle">
                  <ToggleRow label="E-Mail (SMTP)"        desc="Eigener SMTP-Server" defaultOn />
                  <ToggleRow label="Discord"              desc="Webhook · #it-alerts" defaultOn />
                  <ToggleRow label="Slack"                desc="Webhook · #monitoring" />
                  <ToggleRow label="Microsoft Teams"      desc="Incoming Webhook"/>
                  <ToggleRow label="Telegram"             desc="Bot-Token & Chat-ID"/>
                  <ToggleRow label="Webhook (Custom)"     desc="HTTP POST zu beliebiger URL" />
                </SettingsSection>
              </div>
              <div className="card space-y-4">
                <SettingsSection title="Schwellenwerte">
                  <SettingsGrid>
                    <FormField label="Standard-Cooldown">
                      <select className="nb-select"><option>5 Minuten</option><option>1 Minute</option><option>15 Minuten</option></select>
                    </FormField>
                    <FormField label="Wartungsfenster">
                      <select className="nb-select"><option>Keines</option><option>Sa+So 02:00–06:00</option></select>
                    </FormField>
                  </SettingsGrid>
                </SettingsSection>
              </div>
            </div>
          )}

          {/* Tab 3 – Erweitert */}
          {activeTab === 3 && (
            <div className="max-w-lg space-y-5">
              <div className="card space-y-4">
                <SettingsSection title="Sicherheit">
                  <SettingsGrid>
                    <FormField label="Session-Timeout">
                      <select className="nb-select"><option>8 Stunden</option><option>24 Stunden</option><option>Nie</option></select>
                    </FormField>
                    <FormField label="Max. Login-Versuche">
                      <select className="nb-select"><option>5</option><option>10</option><option>Unbegrenzt</option></select>
                    </FormField>
                  </SettingsGrid>
                  <ToggleRow label="2-Faktor-Authentifizierung" desc="TOTP via Authenticator-App"/>
                </SettingsSection>
              </div>
              <div className="card space-y-3">
                <SettingsSection title="Daten & Export">
                  <div className="flex gap-3">
                    <button type="button" className="btn-ghost text-sm flex items-center gap-2">Export Konfiguration</button>
                    <button type="button" className="btn-ghost text-sm flex items-center gap-2">Import Konfiguration</button>
                  </div>
                </SettingsSection>
              </div>
            </div>
          )}

        </form>
      </div>
    </div>
  );
}

/* ── Helpers ── */
function SettingsSection({ title, children }) {
  return (
    <div>
      <div
        className="text-[11px] font-medium uppercase tracking-wider mb-3 pb-2"
        style={{ color: "rgba(255,255,255,0.38)", borderBottom: "1px solid rgba(255,255,255,0.07)" }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
function SettingsGrid({ children }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}
function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.42)" }}>{label}</label>
      {children}
    </div>
  );
}
function ToggleRow({ label, desc, defaultOn }) {
  const [on, setOn] = useState(!!defaultOn);
  return (
    <div
      className="flex items-center justify-between py-2.5"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}
    >
      <div>
        <div className="text-[12.5px] flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.75)" }}>
          {label}
          {/*badge removed – all features free */}
        </div>
        {desc && <div className="text-[11px] mt-0.5" style={{ color: "rgba(255,255,255,0.32)" }}>{desc}</div>}
      </div>
      <button
        type="button"
        onClick={() => setOn((v) => !v)}
        className={`nb-toggle${on ? " on" : ""}`}
      />
    </div>
  );
}
