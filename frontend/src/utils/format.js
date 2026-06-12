// Hilfsfunktionen zur Formatierung von Metrik-Werten

export function num(value) {
  const n = typeof value === "string" ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : null;
}

export function formatBytes(bytes) {
  const n = num(bytes);
  if (n === null) return "–";
  if (n === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(Math.abs(n)) / Math.log(1024)), units.length - 1);
  const value = n / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatUptime(seconds) {
  const s = num(seconds);
  if (s === null || s < 0) return "–";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} Tage ${h} Std.`;
  if (h > 0) return `${h} Std. ${m} Min.`;
  return `${m} Min.`;
}

// Anteil used/total als gerundeter Prozentwert (0-100)
export function pct(used, total) {
  const u = num(used);
  const t = num(total);
  if (u === null || t === null || t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((u / t) * 100)));
}

// Wandelt einen Wert in einen Prozentwert um (akzeptiert "55%", "55", 55)
export function toPercent(value) {
  if (typeof value === "string") {
    const n = parseFloat(value.replace("%", ""));
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0;
  }
  const n = num(value);
  return n === null ? 0 : Math.max(0, Math.min(100, Math.round(n)));
}
