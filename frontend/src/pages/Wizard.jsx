import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, Sparkles, Plug, KeyRound, Check, X, ChevronLeft, ChevronRight,
  SkipForward, Eye, EyeOff,
} from "lucide-react";
import { api } from "../api/client";
import { useLicense } from "../license/LicenseContext";

const STEPS = [
  { key: "welcome", label: "Willkommen" },
  { key: "ai", label: "KI" },
  { key: "connector", label: "Connector" },
  { key: "license", label: "Lizenz" },
  { key: "done", label: "Fertig" },
];

export default function Wizard() {
  const navigate = useNavigate();
  const { refresh: refreshLicense } = useLicense();
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState({});

  function next() { setStepIndex((i) => Math.min(i + 1, STEPS.length - 1)); }
  function back() { setStepIndex((i) => Math.max(i - 1, 0)); }
  function markDone(key) { setCompleted((c) => ({ ...c, [key]: true })); }

  async function finish() {
    try { await api.setup.complete(); } catch (_) {}
    await refreshLicense();
    navigate("/dashboard", { replace: true });
  }

  const current = STEPS[stepIndex];

  return (
    <div className="min-h-screen bg-black/20 flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Activity className="text-amber-300" size={22} />
          <span className="text-xl font-bold tracking-tight">
            <span className="text-amber-300">Nex</span>board
          </span>
        </div>

        {/* Fortschritt */}
        <div className="flex items-center gap-1 mb-3">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i <= stepIndex ? "bg-amber-500" : "bg-black/20-border"
              }`}
            />
          ))}
        </div>
        <div className="grid grid-cols-5 gap-2 mb-6 text-center">
          {STEPS.map((s, i) => (
            <div
              key={s.key}
              className={`text-xs ${
                i === stepIndex
                  ? "text-amber-300 font-medium"
                  : i < stepIndex
                  ? "text-white/75"
                  : "text-white/25"
              }`}
            >
              {s.label}
            </div>
          ))}
        </div>

        <div className="card">
          {current.key === "welcome" && <WelcomeStep onNext={next} onSkipAll={finish} />}
          {current.key === "ai" && (
            <AiStep onNext={() => { markDone("ai"); next(); }} onSkip={next} onBack={back} />
          )}
          {current.key === "connector" && (
            <ConnectorStep onNext={() => { markDone("connector"); next(); }} onSkip={next} onBack={back} />
          )}
          {current.key === "license" && (
            <LicenseStep onNext={() => { markDone("license"); next(); }} onSkip={next} onBack={back} />
          )}
          {current.key === "done" && <DoneStep completed={completed} onFinish={finish} onBack={back} />}
        </div>

        <p className="text-center text-xs text-white/25 mt-6">
          Du kannst jeden Schritt überspringen und später nachholen.
        </p>
      </div>
    </div>
  );
}

// =============================================================================
// Schritte
// =============================================================================

function WelcomeStep({ onNext, onSkipAll }) {
  return (
    <div className="text-center space-y-5">
      <div className="text-2xl font-semibold">Willkommen bei Nexboard</div>
      <p className="text-white/55 text-sm">
        In wenigen Minuten ist dein Dashboard einsatzbereit. Drei kurze Schritte – jeder einzeln überspringbar.
      </p>
      <ul className="text-sm text-white/75 text-left bg-black/20 rounded-lg p-4 space-y-2 max-w-sm mx-auto">
        <li className="flex items-center gap-2"><Sparkles size={14} className="text-purple-400" /> KI-Provider für Analyse einrichten</li>
        <li className="flex items-center gap-2"><Plug size={14} className="text-amber-300" /> Ersten Service als Connector anbinden</li>
        <li className="flex items-center gap-2"><KeyRound size={14} className="text-amber-300" /> Pro-Lizenz aktivieren (optional)</li>
      </ul>
      <div className="flex gap-3 justify-center pt-2">
        <button onClick={onSkipAll} className="btn-ghost text-sm">Direkt zum Dashboard</button>
        <button onClick={onNext} className="btn-primary text-sm flex items-center gap-2">
          Loslegen <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function AiStep({ onNext, onSkip, onBack }) {
  const [form, setForm] = useState({
    ai_provider: "openai",
    ai_api_key: "",
    ai_model: "",
    ai_ollama_url: "http://localhost:11434",
  });
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.settings.get().then((d) => setForm(d)).catch(() => {});
  }, []);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      await api.settings.save(form);
      onNext();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles size={16} className="text-purple-400" />
          KI-Provider einrichten
        </h2>
        <p className="text-white/40 text-xs mt-0.5">
          Nexboard verwendet deinen eigenen API-Key – keine Daten gehen an uns.
        </p>
      </div>

      <div>
        <label className="block text-sm text-white/55 mb-1.5">Provider</label>
        <select
          value={form.ai_provider}
          onChange={(e) => setForm((f) => ({ ...f, ai_provider: e.target.value, ai_api_key: "" }))}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
        >
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="ollama">Ollama (lokal)</option>
        </select>
      </div>

      {form.ai_provider !== "ollama" && (
        <div>
          <label className="block text-sm text-white/55 mb-1.5">API Key</label>
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={form.ai_api_key}
              onChange={(e) => setForm((f) => ({ ...f, ai_api_key: e.target.value }))}
              placeholder={form.ai_provider === "openai" ? "sk-..." : "sk-ant-..."}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/75"
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
      )}

      {form.ai_provider === "ollama" && (
        <div>
          <label className="block text-sm text-white/55 mb-1.5">Ollama URL</label>
          <input
            type="text"
            value={form.ai_ollama_url}
            onChange={(e) => setForm((f) => ({ ...f, ai_ollama_url: e.target.value }))}
            className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
          />
        </div>
      )}

      <div>
        <label className="block text-sm text-white/55 mb-1.5">
          Modell <span className="text-white/25">(optional – leer = Standard)</span>
        </label>
        <input
          type="text"
          value={form.ai_model}
          onChange={(e) => setForm((f) => ({ ...f, ai_model: e.target.value }))}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
        />
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-400/5 border border-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

      <StepNav
        onBack={onBack}
        onSkip={onSkip}
        onNext={save}
        nextLabel={saving ? "Speichere..." : "Speichern und weiter"}
        nextDisabled={saving}
      />
    </div>
  );
}

function ConnectorStep({ onNext, onSkip, onBack }) {
  const [types, setTypes] = useState([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [config, setConfig] = useState({});
  const [showSecrets, setShowSecrets] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.connectors.types().then((t) => {
      setTypes(t);
      if (t.length) setSelected(t[0].type);
    });
  }, []);

  const typeInfo = types.find((t) => t.type === selected);

  async function save() {
    if (!typeInfo) return;
    setError(null);
    setSaving(true);
    try {
      const cfg = {};
      for (const [k, schema] of Object.entries(typeInfo.config_schema)) {
        const v = config[k] ?? schema.default ?? "";
        cfg[k] = schema.type === "number" ? Number(v) : schema.type === "boolean" ? Boolean(v) : v;
      }
      await api.connectors.create({ name, type: selected, config: cfg });
      onNext();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          <Plug size={16} className="text-amber-300" />
          Ersten Connector anbinden
        </h2>
        <p className="text-white/40 text-xs mt-0.5">
          Verbinde einen ersten Dienst – du kannst später beliebig viele hinzufügen.
        </p>
      </div>

      <div>
        <label className="block text-sm text-white/55 mb-1.5">Typ</label>
        <select
          value={selected}
          onChange={(e) => { setSelected(e.target.value); setConfig({}); }}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
        >
          {types.map((t) => (
            <option key={t.type} value={t.type}>{t.label}</option>
          ))}
        </select>
        {typeInfo && <p className="text-xs text-white/40 mt-1">{typeInfo.description}</p>}
      </div>

      <div>
        <label className="block text-sm text-white/55 mb-1.5">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`Mein ${typeInfo?.label ?? ""}`}
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
        />
      </div>

      {typeInfo && Object.entries(typeInfo.config_schema).map(([k, schema]) => (
        <div key={k}>
          <label className="block text-sm text-white/55 mb-1.5">
            {schema.label}
            {schema.required && <span className="text-red-400 ml-1">*</span>}
          </label>
          {schema.type === "boolean" ? (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config[k] ?? schema.default ?? false}
                onChange={(e) => setConfig((c) => ({ ...c, [k]: e.target.checked }))}
                className="rounded"
              />
              <span className="text-sm text-white/75">{schema.label}</span>
            </label>
          ) : (
            <div className="relative">
              <input
                type={schema.secret && !showSecrets[k] ? "password" : "text"}
                value={config[k] ?? (schema.default !== undefined ? String(schema.default) : "")}
                onChange={(e) => setConfig((c) => ({ ...c, [k]: e.target.value }))}
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 pr-8"
              />
              {schema.secret && (
                <button
                  type="button"
                  onClick={() => setShowSecrets((s) => ({ ...s, [k]: !s[k] }))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/75"
                >
                  {showSecrets[k] ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
          )}
        </div>
      ))}

      {error && (
        <div className="text-xs text-red-400 bg-red-400/5 border border-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

      <StepNav
        onBack={onBack}
        onSkip={onSkip}
        onNext={save}
        nextLabel={saving ? "Speichere..." : "Connector anlegen"}
        nextDisabled={saving || !name.trim() || !selected}
      />
    </div>
  );
}

function LicenseStep({ onNext, onSkip, onBack }) {
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const { refresh } = useLicense();

  async function activate() {
    setError(null);
    setSuccess(null);
    setSaving(true);
    try {
      const result = await api.license.activate(key.trim());
      await refresh();
      setSuccess(result.message);
      setTimeout(onNext, 1100);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold flex items-center gap-2">
          <KeyRound size={16} className="text-amber-300" />
          Pro-Lizenz aktivieren <span className="text-white/25 text-xs ml-1">(optional)</span>
        </h2>
        <p className="text-white/40 text-xs mt-0.5">
          Wenn du einen Lizenzschlüssel hast, kannst du ihn jetzt einfügen. Sonst bleibst du im Free-Modus
          (bis zu 3 Connectors).
        </p>
      </div>
      <textarea
        value={key}
        onChange={(e) => setKey(e.target.value)}
        rows={3}
        placeholder="NEXB1.…"
        className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-400 resize-none"
      />
      {error && (
        <div className="text-xs text-red-400 bg-red-400/5 border border-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}
      {success && (
        <div className="text-xs text-green-400 bg-green-400/5 border border-green-400/10 rounded-lg px-3 py-2">{success}</div>
      )}
      <StepNav
        onBack={onBack}
        onSkip={onSkip}
        onNext={activate}
        nextLabel={saving ? "Aktiviere..." : "Aktivieren"}
        nextDisabled={saving || !key.trim()}
      />
    </div>
  );
}

function DoneStep({ completed, onFinish, onBack }) {
  const items = [
    { key: "ai", label: "KI-Provider" },
    { key: "connector", label: "Connector" },
    { key: "license", label: "Lizenz" },
  ];
  return (
    <div className="text-center space-y-5">
      <div className="w-14 h-14 rounded-full bg-green-400/15 text-green-400 flex items-center justify-center mx-auto">
        <Check size={28} />
      </div>
      <div>
        <div className="text-2xl font-semibold">Fertig!</div>
        <p className="text-white/55 text-sm mt-1">Dein Nexboard ist einsatzbereit.</p>
      </div>
      <div className="bg-black/20 rounded-lg p-4 text-left space-y-2 max-w-sm mx-auto">
        {items.map((it) => (
          <div key={it.key} className="flex items-center gap-2 text-sm">
            {completed[it.key] ? (
              <Check size={14} className="text-green-400" />
            ) : (
              <X size={14} className="text-white/25" />
            )}
            <span className={completed[it.key] ? "text-white/75" : "text-white/40"}>
              {it.label} {completed[it.key] ? "konfiguriert" : "übersprungen"}
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 justify-center pt-2">
        <button onClick={onBack} className="btn-ghost text-sm flex items-center gap-2">
          <ChevronLeft size={14} /> Zurück
        </button>
        <button onClick={onFinish} className="btn-primary text-sm flex items-center gap-2">
          Zum Dashboard <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function StepNav({ onBack, onSkip, onNext, nextLabel, nextDisabled }) {
  return (
    <div className="flex items-center justify-between pt-3 border-t border-white/10">
      <button onClick={onBack} className="btn-ghost text-sm flex items-center gap-2">
        <ChevronLeft size={14} /> Zurück
      </button>
      <div className="flex gap-2">
        <button onClick={onSkip} className="btn-ghost text-sm flex items-center gap-2">
          <SkipForward size={14} /> Überspringen
        </button>
        <button onClick={onNext} disabled={nextDisabled} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40">
          {nextLabel} <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
