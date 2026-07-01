/**
 * useBackground – Per-user background management.
 * Stores config in localStorage under key nexboard_bg_<username>.
 * Applies directly to document.body.style so it overrides the CSS.
 */

export const BG_PRESETS = [
  {
    id: "amber",
    label: "Amber (Standard)",
    preview: "linear-gradient(135deg, #1a1200 0%, #0B0F1C 60%, #070B14 100%)",
    backgroundColor: "#070B14",
    backgroundImage: `
      radial-gradient(ellipse 70% 55% at  8%  -5%,  rgba(245,158,11,0.22) 0%, transparent 60%),
      radial-gradient(ellipse 55% 45% at 92% 100%,  rgba(59,130,246,0.18) 0%, transparent 60%),
      radial-gradient(ellipse 40% 35% at 50%  50%,  rgba(139,92,246,0.08) 0%, transparent 65%),
      radial-gradient(ellipse 35% 30% at 20%  85%,  rgba(16,185,129,0.07) 0%, transparent 55%),
      linear-gradient(155deg, #111827 0%, #0B0F1C 45%, #070B14 100%)
    `.trim(),
  },
  {
    id: "ocean",
    label: "Ocean Blue",
    preview: "linear-gradient(135deg, #001524 0%, #0a1628 60%, #050d1a 100%)",
    backgroundColor: "#050d1a",
    backgroundImage: `
      radial-gradient(ellipse 70% 55% at 10%  -5%,  rgba(6,182,212,0.20) 0%, transparent 60%),
      radial-gradient(ellipse 55% 45% at 90% 100%,  rgba(59,130,246,0.22) 0%, transparent 60%),
      radial-gradient(ellipse 40% 35% at 50%  50%,  rgba(16,185,129,0.06) 0%, transparent 65%),
      linear-gradient(155deg, #0a1628 0%, #070e1d 50%, #050d1a 100%)
    `.trim(),
  },
  {
    id: "forest",
    label: "Forest Green",
    preview: "linear-gradient(135deg, #001510 0%, #090f0a 60%, #050a06 100%)",
    backgroundColor: "#050a06",
    backgroundImage: `
      radial-gradient(ellipse 70% 55% at  8%  -5%,  rgba(16,185,129,0.24) 0%, transparent 60%),
      radial-gradient(ellipse 55% 45% at 92% 100%,  rgba(5,150,105,0.18) 0%, transparent 60%),
      radial-gradient(ellipse 40% 35% at 50%  50%,  rgba(6,182,212,0.06) 0%, transparent 65%),
      radial-gradient(ellipse 35% 30% at 20%  85%,  rgba(59,130,246,0.05) 0%, transparent 55%),
      linear-gradient(155deg, #0d1f12 0%, #080f0a 50%, #050a06 100%)
    `.trim(),
  },
  {
    id: "rose",
    label: "Rose Noir",
    preview: "linear-gradient(135deg, #1a0010 0%, #0f0814 60%, #08050f 100%)",
    backgroundColor: "#08050f",
    backgroundImage: `
      radial-gradient(ellipse 70% 55% at  8%  -5%,  rgba(244,63,94,0.20) 0%, transparent 60%),
      radial-gradient(ellipse 55% 45% at 92% 100%,  rgba(139,92,246,0.16) 0%, transparent 60%),
      radial-gradient(ellipse 40% 35% at 50%  50%,  rgba(236,72,153,0.07) 0%, transparent 65%),
      linear-gradient(155deg, #170814 0%, #0f0812 50%, #08050f 100%)
    `.trim(),
  },
  {
    id: "midnight",
    label: "Midnight",
    preview: "linear-gradient(135deg, #0a0a0f 0%, #07070d 60%, #050508 100%)",
    backgroundColor: "#050508",
    backgroundImage: `
      radial-gradient(ellipse 60% 40% at 20%  10%,  rgba(99,102,241,0.10) 0%, transparent 55%),
      radial-gradient(ellipse 50% 35% at 80%  90%,  rgba(139,92,246,0.08) 0%, transparent 55%),
      linear-gradient(155deg, #0a0a14 0%, #07070d 50%, #050508 100%)
    `.trim(),
  },
  {
    id: "dark",
    label: "Pure Dark",
    preview: "linear-gradient(135deg, #0a0a0a 0%, #070707 100%)",
    backgroundColor: "#070707",
    backgroundImage: "none",
  },
];

const DEFAULT_PRESET = "amber";

function lsKey(username) {
  return `nexboard_bg_${username ?? "default"}`;
}

export function loadBgConfig(username) {
  try {
    const raw = localStorage.getItem(lsKey(username));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { type: "preset", preset: DEFAULT_PRESET };
}

export function saveBgConfig(username, config) {
  try {
    localStorage.setItem(lsKey(username), JSON.stringify(config));
  } catch { /* ignore */ }
}

/**
 * Applies background config to document.body.
 * Call whenever config or user changes.
 */
export function applyBackground(config) {
  const body = document.body;
  if (!config) {
    // Reset to CSS default
    body.style.backgroundColor = "";
    body.style.backgroundImage = "";
    body.style.backgroundSize  = "";
    body.style.backgroundPosition = "";
    return;
  }

  if (config.type === "preset" || !config.type) {
    const p = BG_PRESETS.find(b => b.id === (config.preset ?? DEFAULT_PRESET)) ?? BG_PRESETS[0];
    body.style.backgroundColor   = p.backgroundColor;
    body.style.backgroundImage   = p.backgroundImage;
    body.style.backgroundSize    = "";
    body.style.backgroundPosition = "";
    body.style.backgroundAttachment = "fixed";
  } else if (config.type === "image" && config.url) {
    body.style.backgroundColor   = "#070B14";
    body.style.backgroundImage   = `
      linear-gradient(rgba(7,11,20,0.55), rgba(7,11,20,0.55)),
      url(${config.url})
    `.trim();
    body.style.backgroundSize    = "cover";
    body.style.backgroundPosition = "center";
    body.style.backgroundAttachment = "fixed";
  } else if (config.type === "color" && config.color) {
    body.style.backgroundColor   = config.color;
    body.style.backgroundImage   = "none";
    body.style.backgroundSize    = "";
    body.style.backgroundPosition = "";
  }
}
