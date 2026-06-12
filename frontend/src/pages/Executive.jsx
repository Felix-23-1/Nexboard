import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "../api/client";

const TRAFFIC_LIGHT = {
  online: {
    color: "bg-green-500",
    glow: "shadow-[0_0_60px_rgba(34,197,94,0.5)]",
    label: "Alles läuft",
    sub: "Alle Systeme sind erreichbar und arbeiten normal.",
    text: "text-green-400",
  },
  warning: {
    color: "bg-yellow-400",
    glow: "shadow-[0_0_60px_rgba(250,204,21,0.5)]",
    label: "Warnung",
    sub: "Ein oder mehrere Systeme benötigen Aufmerksamkeit.",
    text: "text-yellow-400",
  },
  critical: {
    color: "bg-red-500",
    glow: "shadow-[0_0_60px_rgba(239,68,68,0.5)]",
    label: "Kritisch",
    sub: "Mindestens ein System ist ausgefallen oder nicht erreichbar.",
    text: "text-red-400",
  },
};

export default function Executive() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(showRefresh = false) {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await api.status.overview();
      setOverview(data);
    } catch (_) {}
    finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    const iv = setInterval(() => load(true), 30000);
    return () => clearInterval(iv);
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-white/40">Lädt...</div>;
  }

  const cfg = TRAFFIC_LIGHT[overview?.overall] ?? TRAFFIC_LIGHT.online;

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] gap-10">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">IT-Status</h1>
        <p className="text-white/40 text-sm mt-1">Gesamtübersicht für das Management</p>
      </div>

      <div className="flex flex-col items-center gap-4">
        <div className={`w-36 h-36 rounded-full ${cfg.color} ${cfg.glow} transition-all duration-700`} />
        <div className="text-center">
          <div className={`text-3xl font-bold ${cfg.text}`}>{cfg.label}</div>
          <div className="text-white/55 text-sm mt-1 max-w-xs">{cfg.sub}</div>
        </div>
      </div>

      <div className="flex gap-8 text-center">
        <div>
          <div className="text-4xl font-bold text-white">{overview?.total ?? 0}</div>
          <div className="text-white/40 text-sm mt-1">Systeme gesamt</div>
        </div>
        <div className="w-px bg-black/20-border" />
        <div>
          <div className="text-4xl font-bold text-green-400">{overview?.online ?? 0}</div>
          <div className="text-white/40 text-sm mt-1">Online</div>
        </div>
        <div className="w-px bg-black/20-border" />
        <div>
          <div className="text-4xl font-bold text-red-400">{(overview?.offline ?? 0) + (overview?.warning ?? 0)}</div>
          <div className="text-white/40 text-sm mt-1">Probleme</div>
        </div>
      </div>

      {overview?.connectors?.length > 0 && (
        <div className="w-full max-w-sm space-y-2">
          {overview.connectors.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/7 border border-white/10"
            >
              <span className="text-sm font-medium">{c.name}</span>
              <span
                className={`text-xs font-semibold uppercase tracking-wide ${
                  c.status === "online"
                    ? "text-green-400"
                    : c.status === "warning"
                    ? "text-yellow-400"
                    : "text-red-400"
                }`}
              >
                {c.status === "online" ? "OK" : c.status === "warning" ? "Warnung" : "Offline"}
              </span>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => load(true)}
        className="btn-ghost flex items-center gap-2 text-sm text-white/40"
        disabled={refreshing}
      >
        <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        Aktualisieren
      </button>
    </div>
  );
}
