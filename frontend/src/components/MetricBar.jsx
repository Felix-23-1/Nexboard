export default function MetricBar({ label, percent = 0, detail }) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const fillColor = p >= 90 ? "#f87171" : p >= 75 ? "#fbbf24" : "#F59E0B";

  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1.5">
        <span style={{ color: "rgba(255,255,255,0.45)" }}>{label}</span>
        <span className="font-medium tabular-nums" style={{ color: "rgba(255,255,255,0.75)" }}>
          {detail ?? `${p}%`}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.09)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${p}%`, background: fillColor }}
        />
      </div>
    </div>
  );
}
