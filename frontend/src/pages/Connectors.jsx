import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, RefreshCw, ChevronDown, ChevronUp, Eye, EyeOff, Sparkles, Lock, Crown } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useLicense } from "../license/LicenseContext";
import StatusBadge from "../components/StatusBadge";
import ConnectorIcon from "../components/ConnectorIcon";

export default function Connectors() {
  const { isAdmin } = useAuth();
  const { features } = useLicense();
  const [connectors, setConnectors] = useState([]);
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [statuses, setStatuses] = useState({});
  const [aiResults, setAiResults] = useState({});
  const [aiLoading, setAiLoading] = useState({});

  async function load() {
    setLoading(true);
    try {
      const [conns, typs] = await Promise.all([api.connectors.list(), api.connectors.types()]);
      setConnectors(conns);
      setTypes(typs);
    } finally {
      setLoading(false);
    }
  }

  async function testConnector(id) {
    setStatuses((s) => ({ ...s, [id]: { loading: true } }));
    try {
      const result = await api.connectors.status(id);
      setStatuses((s) => ({ ...s, [id]: result }));
    } catch (e) {
      setStatuses((s) => ({ ...s, [id]: { status: "error", error: e.message } }));
    }
  }

  async function runAiAnalysis(id) {
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

  async function deleteConnector(id) {
    if (!confirm("Connector wirklich löschen?")) return;
    await api.connectors.delete(id);
    setConnectors((c) => c.filter((x) => x.id !== id));
  }

  async function toggleEnabled(connector) {
    const updated = await api.connectors.update(connector.id, { enabled: !connector.enabled });
    setConnectors((c) => c.map((x) => (x.id === updated.id ? updated : x)));
  }

  useEffect(() => {
    load();
  }, []);

  const limit = features.max_connectors; // null = unbegrenzt (Pro)
  const atLimit = limit != null && connectors.length >= limit;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Connectors</h1>
          <p className="text-white/40 text-sm mt-0.5">
            {isAdmin ? "Verwalte deine angebundenen Services" : "Übersicht deiner angebundenen Services"}
          </p>
        </div>
        {isAdmin &&
          (atLimit ? (
            <Link to="/license" className="btn-primary flex items-center gap-2 text-sm">
              <Crown size={14} />
              Upgrade auf Pro
            </Link>
          ) : (
            <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={14} />
              Connector hinzufügen
            </button>
          ))}
      </div>

      {!isAdmin && (
        <div className="flex items-start gap-2 text-xs text-white/40 bg-white/7 border border-white/10 rounded-lg px-3 py-2">
          <Lock size={13} className="flex-shrink-0 mt-0.5" />
          <span>Du hast Viewer-Rechte – Connectors können nur von Admins geändert werden.</span>
        </div>
      )}

      {/* Free-Limit-Anzeige */}
      {limit != null && !loading && (
        <div
          className={`flex items-center justify-between text-xs border rounded-lg px-3 py-2.5 ${
            atLimit
              ? "bg-yellow-400/10 border-yellow-400/25 text-yellow-400"
              : "bg-white/7 border-white/10 text-white/55"
          }`}
        >
          <span className="flex items-center gap-2">
            {atLimit ? <Crown size={13} /> : <Lock size={13} />}
            {atLimit
              ? `Free-Limit erreicht: ${connectors.length} von ${limit} Connectors. Mit Pro bindest du beliebig viele Services an.`
              : `Free-Version: ${connectors.length} von ${limit} Connectors genutzt.`}
          </span>
          {isAdmin && (
            <Link to="/license" className="font-medium underline whitespace-nowrap ml-3">
              Pro freischalten
            </Link>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-white/40 text-sm">Lade Connectors...</div>
      ) : connectors.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-white/55">Noch keine Connectors vorhanden.</p>
          {isAdmin && (
            <button onClick={() => setShowAdd(true)} className="btn-primary mt-4 text-sm">
              Ersten Connector hinzufügen
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {connectors.map((c) => {
            const st = statuses[c.id];
            const typeInfo = types.find((t) => t.type === c.type);
            return (
              <div key={c.id} className="card">
                <div className="flex items-center gap-4">
                  <ConnectorIcon icon={typeInfo?.icon ?? "settings"} size={18} className="text-white/55" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{c.name}</div>
                    <div className="text-white/40 text-xs">{typeInfo?.label ?? c.type}</div>
                  </div>
                  {st && !st.loading && <StatusBadge status={st.status} />}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => testConnector(c.id)}
                      className="btn-ghost text-xs flex items-center gap-1"
                      disabled={st?.loading}
                    >
                      <RefreshCw size={12} className={st?.loading ? "animate-spin" : ""} />
                      Testen
                    </button>
                    <button
                      onClick={() => runAiAnalysis(c.id)}
                      className="btn-ghost text-xs flex items-center gap-1 text-purple-400 hover:text-purple-300"
                      disabled={aiLoading[c.id]}
                      title={features.ai_analysis ? "KI-Analyse starten" : "KI-Analyse ist ein Pro-Feature"}
                    >
                      {features.ai_analysis ? (
                        <Sparkles size={12} className={aiLoading[c.id] ? "animate-pulse" : ""} />
                      ) : (
                        <Lock size={12} />
                      )}
                      KI
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => toggleEnabled(c)}
                          className="btn-ghost text-xs"
                          title={c.enabled ? "Deaktivieren" : "Aktivieren"}
                        >
                          {c.enabled ? <Eye size={14} /> : <EyeOff size={14} className="text-white/25" />}
                        </button>
                        <button
                          onClick={() => deleteConnector(c.id)}
                          className="btn-ghost text-xs text-red-500 hover:text-red-400"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {st?.error && (
                  <div className="mt-3 text-xs text-red-400 bg-red-400/5 border border-red-400/10 rounded-lg px-3 py-2">
                    {st.error}
                  </div>
                )}
                {aiResults[c.id] && <AiAnalysisBlock result={aiResults[c.id]} />}
                {st?.metrics && Object.keys(st.metrics).length > 0 && (
                  <MetricsPreview metrics={st.metrics} type={c.type} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && isAdmin && (
        <AddConnectorModal
          types={types}
          onClose={() => setShowAdd(false)}
          onCreated={(c) => {
            setConnectors((prev) => [...prev, c]);
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

function AiAnalysisBlock({ result }) {
  if (result.error) {
    return (
      <div className="mt-3 border-t border-white/10 pt-3 text-xs text-red-400">
        KI-Fehler: {result.error}
      </div>
    );
  }

  const severityColor = {
    low: "text-green-400 bg-green-400/5 border-green-400/15",
    medium: "text-yellow-400 bg-yellow-400/5 border-yellow-400/15",
    high: "text-red-400 bg-red-400/5 border-red-400/15",
  }[result.severity] ?? "text-white/55 bg-black/20 border-white/10";

  return (
    <div className="mt-3 border-t border-white/10 pt-3 rounded-lg">
      <div className="flex items-center gap-1.5 text-xs text-purple-400 font-medium mb-2">
        <Sparkles size={11} />
        KI-Analyse
      </div>
      <div className={`text-xs rounded-lg px-3 py-2 border ${severityColor} mb-2`}>
        {result.explanation}
      </div>
      {result.actions?.length > 0 && (
        <div className="space-y-1">
          {result.actions.map((action, i) => (
            <div key={i} className="flex items-start gap-2 text-xs text-white/55">
              <span className="text-purple-400 flex-shrink-0 mt-0.5">{i + 1}.</span>
              <span>{action}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricsPreview({ metrics, type }) {
  const [open, setOpen] = useState(false);

  const summary = {
    proxmox: metrics.nodes
      ? `${metrics.nodes.length} Node${metrics.nodes.length > 1 ? "s" : ""} · ${metrics.vms_running}/${metrics.vms_total} VMs laufen`
      : null,
    docker: metrics.total !== undefined
      ? `${metrics.running}/${metrics.total} Container laufen`
      : null,
    uptime_kuma: metrics.total !== undefined
      ? `${metrics.up}/${metrics.total} Monitore up`
      : null,
  };

  return (
    <div className="mt-3 border-t border-white/10 pt-3">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xs text-white/40 hover:text-white/75 transition-colors"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {summary[type] ?? "Metriken anzeigen"}
      </button>
      {open && (
        <pre className="mt-2 text-xs text-white/55 bg-black/20 rounded-lg p-3 overflow-auto max-h-48">
          {JSON.stringify(metrics, null, 2)}
        </pre>
      )}
    </div>
  );
}

function AddConnectorModal({ types, onClose, onCreated }) {
  const [selectedType, setSelectedType] = useState(types[0]?.type ?? "");
  const [name, setName] = useState("");
  const [configValues, setConfigValues] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showSecrets, setShowSecrets] = useState({});

  const typeInfo = types.find((t) => t.type === selectedType);

  function handleConfigChange(key, value) {
    setConfigValues((v) => ({ ...v, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const config = {};
      for (const [key, schema] of Object.entries(typeInfo?.config_schema ?? {})) {
        const val = configValues[key] ?? schema.default ?? "";
        config[key] = schema.type === "number" ? Number(val) : schema.type === "boolean" ? Boolean(val) : val;
      }
      const created = await api.connectors.create({ name, type: selectedType, config });
      onCreated(created);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white/7 border border-white/10 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-semibold">Connector hinzufügen</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-white/55 mb-1.5">Typ</label>
            <select
              value={selectedType}
              onChange={(e) => { setSelectedType(e.target.value); setConfigValues({}); }}
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
              placeholder={`z.B. Mein ${typeInfo?.label ?? ""}`}
              required
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
            />
          </div>

          {typeInfo && Object.entries(typeInfo.config_schema).map(([key, schema]) => (
            <div key={key}>
              <label className="block text-sm text-white/55 mb-1.5">
                {schema.label}
                {schema.required && <span className="text-red-400 ml-1">*</span>}
              </label>
              {schema.type === "boolean" ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={configValues[key] ?? schema.default ?? false}
                    onChange={(e) => handleConfigChange(key, e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-white/75">{schema.label}</span>
                </label>
              ) : (
                <div className="relative">
                  <input
                    type={schema.secret && !showSecrets[key] ? "password" : "text"}
                    value={configValues[key] ?? (schema.default !== undefined ? String(schema.default) : "")}
                    onChange={(e) => handleConfigChange(key, e.target.value)}
                    required={schema.required}
                    className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 pr-8"
                  />
                  {schema.secret && (
                    <button
                      type="button"
                      onClick={() => setShowSecrets((s) => ({ ...s, [key]: !s[key] }))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/75"
                    >
                      {showSecrets[key] ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {error && (
            <div className="text-xs text-red-400 bg-red-400/5 border border-red-400/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm">
              Abbrechen
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 text-sm">
              {saving ? "Speichern..." : "Hinzufügen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
