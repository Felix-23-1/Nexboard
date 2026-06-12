const config = {
  online:   { pill: "badge-ok",      dot: "#34d399", label: "Online" },
  warning:  { pill: "badge-warn",    dot: "#fbbf24", label: "Warnung" },
  offline:  { pill: "badge-off",     dot: "#f87171", label: "Offline" },
  critical: { pill: "badge-off",     dot: "#f87171", label: "Kritisch" },
  error:    { pill: "badge-off",     dot: "#f87171", label: "Fehler" },
  unknown:  { pill: "badge-neutral", dot: "rgba(255,255,255,0.25)", label: "Unbekannt" },
};

export default function StatusBadge({ status }) {
  const cfg = config[status] ?? config.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 ${cfg.pill}`}>
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: cfg.dot }}
      />
      {cfg.label}
    </span>
  );
}
