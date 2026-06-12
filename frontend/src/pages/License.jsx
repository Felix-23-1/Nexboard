import { useState } from "react";
import { KeyRound, Check, X, Crown, AlertTriangle, ShieldCheck, Trash2, Sparkles } from "lucide-react";
import { api } from "../api/client";
import { useLicense } from "../license/LicenseContext";

const COMPARISON = [
  { label: "Connectors", free: "Bis zu 3", pro: "Unbegrenzt" },
  { label: "Benutzer & Rollen", free: "1 Benutzer", pro: "Mehrere (Admin / Viewer)" },
  { label: "KI-Analyse & Log-Analyse", free: false, pro: true },
  { label: "Chef-Ansicht (Executive)", free: false, pro: true },
  { label: "Alert-System (E-Mail, Discord, Slack)", free: false, pro: true },
  { label: "History & Trends", free: false, pro: true },
];

function StatusBanner({ license }) {
  const map = {
    active: { cls: "bg-amber-400/15 border-accent/25 text-amber-300", icon: ShieldCheck },
    none: { cls: "bg-black/20 border-white/10 text-white/55", icon: KeyRound },
    expired: { cls: "bg-yellow-400/10 border-yellow-400/25 text-yellow-400", icon: AlertTriangle },
    invalid: { cls: "bg-red-400/10 border-red-400/25 text-red-400", icon: AlertTriangle },
  };
  const cfg = map[license?.status] ?? map.none;
  const Icon = cfg.icon;
  return (
    <div className={`flex items-start gap-2 text-sm border rounded-lg px-3 py-2.5 ${cfg.cls}`}>
      <Icon size={16} className="flex-shrink-0 mt-0.5" />
      <span>{license?.message}</span>
    </div>
  );
}

export default function License() {
  const { license, isPro, refresh } = useLicense();
  const [keyInput, setKeyInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  async function activate(e) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const result = await api.license.activate(keyInput.trim());
      await refresh();
      setKeyInput("");
      setSuccess(result.message || "Lizenz aktiviert");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeLicense() {
    if (!confirm("Lizenz wirklich entfernen? Das Dashboard wechselt danach in die Free-Version.")) return;
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      await api.license.remove();
      await refresh();
      setSuccess("Lizenz entfernt – Free-Version aktiv.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const planLabel = license?.features?.label ?? (isPro ? "Pro" : "Free");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="page-title">Lizenz</h1>
        <p className="text-white/40 text-sm mt-0.5">Plan verwalten und Pro-Features freischalten</p>
      </div>

      {/* Aktueller Plan */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                isPro ? "bg-amber-400/15 text-amber-300" : "bg-white/8 text-white/55"
              }`}
            >
              {isPro ? <Crown size={22} /> : <KeyRound size={20} />}
            </div>
            <div>
              <div className="font-semibold text-lg flex items-center gap-2">
                Nexboard {planLabel}
                {isPro && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white rounded px-1.5 py-0.5">
                    Pro
                  </span>
                )}
              </div>
              <div className="text-white/40 text-xs">
                {isPro ? "Alle Funktionen freigeschaltet" : "Eingeschränkter Funktionsumfang"}
              </div>
            </div>
          </div>
        </div>

        <StatusBanner license={license} />

        {license?.holder && (
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-white/40 text-xs">Lizenznehmer</div>
              <div className="font-medium">{license.holder}</div>
            </div>
            <div>
              <div className="text-white/40 text-xs">Ausgestellt</div>
              <div className="font-medium">{license.issued ?? "–"}</div>
            </div>
            <div>
              <div className="text-white/40 text-xs">Gültig bis</div>
              <div className="font-medium">
                {license.expires ?? "unbegrenzt"}
                {typeof license.days_remaining === "number" && license.days_remaining >= 0 && (
                  <span className="text-white/40"> ({license.days_remaining} Tage)</span>
                )}
              </div>
            </div>
          </div>
        )}

        {isPro && (
          <button
            onClick={removeLicense}
            disabled={busy}
            className="btn-ghost text-xs text-red-500 hover:text-red-400 flex items-center gap-1.5"
          >
            <Trash2 size={13} />
            Lizenz entfernen
          </button>
        )}
      </div>

      {/* Schlüssel aktivieren */}
      <form onSubmit={activate} className="card space-y-3">
        <h2 className="font-medium text-sm flex items-center gap-2">
          <KeyRound size={15} className="text-amber-300" />
          Lizenzschlüssel {isPro ? "ändern" : "aktivieren"}
        </h2>
        <p className="text-white/40 text-xs">
          Füge deinen Lizenzschlüssel ein (beginnt mit <code className="text-white/55">NEXB1.</code>). Die Prüfung
          erfolgt vollständig offline – es werden keine Daten übertragen.
        </p>
        <textarea
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          rows={3}
          placeholder="NEXB1.…"
          className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-amber-400 resize-none"
        />
        {error && (
          <div className="text-xs text-red-400 bg-red-400/5 border border-red-400/10 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-xs text-green-400 bg-green-400/5 border border-green-400/10 rounded-lg px-3 py-2">
            {success}
          </div>
        )}
        <button
          type="submit"
          disabled={busy || !keyInput.trim()}
          className="btn-primary text-sm flex items-center gap-2 disabled:opacity-40"
        >
          <Sparkles size={14} />
          {busy ? "Prüfe..." : "Lizenz aktivieren"}
        </button>
      </form>

      {/* Feature-Vergleich */}
      <div className="card">
        <h2 className="font-medium text-sm mb-4">Free vs. Pro</h2>
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_auto_auto] gap-4 text-xs text-white/40 uppercase tracking-wider pb-2 border-b border-white/10">
            <span>Funktion</span>
            <span className="w-20 text-center">Free</span>
            <span className="w-20 text-center">Pro</span>
          </div>
          {COMPARISON.map((row) => (
            <div
              key={row.label}
              className="grid grid-cols-[1fr_auto_auto] gap-4 text-sm py-2 border-b border-white/10/50 last:border-0"
            >
              <span className="text-white/75">{row.label}</span>
              <span className="w-20 text-center">
                {typeof row.free === "boolean" ? (
                  row.free ? (
                    <Check size={15} className="text-green-400 mx-auto" />
                  ) : (
                    <X size={15} className="text-white/25 mx-auto" />
                  )
                ) : (
                  <span className="text-white/55 text-xs">{row.free}</span>
                )}
              </span>
              <span className="w-20 text-center">
                {typeof row.pro === "boolean" ? (
                  row.pro ? (
                    <Check size={15} className="text-amber-300 mx-auto" />
                  ) : (
                    <X size={15} className="text-white/25 mx-auto" />
                  )
                ) : (
                  <span className="text-amber-300 text-xs">{row.pro}</span>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="text-white/40 text-xs mt-4">
          Pro kostet 9 €/Monat oder 79 €/Jahr. Du nutzt deinen eigenen KI-API-Key – keine zusätzlichen Kosten.
        </p>
      </div>
    </div>
  );
}
