/**
 * FloatingChat – globaler, bewegbarer KI-Assistent.
 *
 * - Öffnen/Schließen über den Fab-Button unten rechts
 * - Header ist Drag-Handle (Maus ziehen)
 * - Minimieren lässt das Fenster als kompakten Header stehen
 * - Session bleibt erhalten bis der Nutzer explizit "Neue Sitzung" wählt
 * - Holt Infra-Kontext beim ersten Öffnen automatisch
 */
import { useEffect, useRef, useState, useCallback } from "react";
import {
  Bot, X, Minus, Send, MessageSquare, User,
  RotateCcw, GripHorizontal,
} from "lucide-react";
import { api } from "../api/client";

const INITIAL_MSG = {
  role: "assistant",
  text: "Hallo! Ich bin dein Nexboard Help Desk.\nFrag mich zu VMs, Containern, Netzwerk oder Alerts – ich kenne deine aktuelle Infrastruktur.",
};

export default function FloatingChat() {
  const [open, setOpen]           = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages]   = useState([INITIAL_MSG]);
  const [input, setInput]         = useState("");
  const [busy, setBusy]           = useState(false);
  const [infraCtx, setInfraCtx]   = useState(null);

  // Position: null = default (bottom-right via CSS), {x,y} = free-float
  const [pos, setPos]             = useState(null);

  const winRef      = useRef(null);
  const drag        = useRef(null);
  const bottomRef   = useRef(null);
  const textRef     = useRef(null);

  /* ── Auto-scroll ─────────────────────────────────────────────────── */
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, minimized]);

  /* ── Infra-Kontext beim ersten Öffnen laden ───────────────────────── */
  useEffect(() => {
    if (!open || infraCtx) return;
    api.status.detailed()
      .then((d) => {
        const connectors = d?.connectors ?? [];
        if (connectors.length > 0) {
          setInfraCtx(JSON.stringify(
            connectors.map((c) => ({
              name: c.name, type: c.type, status: c.status,
              error: c.error ?? null, metrics: c.metrics,
            })),
            null, 2,
          ));
        }
      })
      .catch(() => {});
  }, [open, infraCtx]);

  /* ── Drag-Logik ──────────────────────────────────────────────────── */
  const onDragMove = useCallback((e) => {
    if (!drag.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth  - 400, e.clientX - drag.current.ox)),
      y: Math.max(0, Math.min(window.innerHeight - 60,  e.clientY - drag.current.oy)),
    });
  }, []);

  const onDragEnd = useCallback(() => {
    drag.current = null;
    document.removeEventListener("mousemove", onDragMove);
    document.removeEventListener("mouseup",   onDragEnd);
  }, [onDragMove]);

  function onHeaderMouseDown(e) {
    if (e.button !== 0) return;
    const rect = winRef.current.getBoundingClientRect();
    drag.current = { ox: e.clientX - rect.left, oy: e.clientY - rect.top };
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("mouseup",   onDragEnd);
    e.preventDefault();
  }

  /* ── Chat ────────────────────────────────────────────────────────── */
  async function send() {
    const q = input.trim();
    if (!q || busy) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const res = await api.ai.chat(q, infraCtx);
      setMessages((m) => [...m, { role: "assistant", text: res.answer }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", text: `Fehler: ${e.message}`, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  function newSession() {
    setMessages([INITIAL_MSG]);
    setInput("");
    setBusy(false);
    setInfraCtx(null);
  }

  function handleKey(e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  /* ── Window-Stil ─────────────────────────────────────────────────── */
  const WIN_W = 380;
  const WIN_H = 520;
  const winStyle = {
    position: "fixed",
    zIndex: 9999,
    width: WIN_W,
    display: "flex",
    flexDirection: "column",
    background: "rgba(9, 11, 18, 0.97)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(245,158,11,0.22)",
    borderRadius: 16,
    boxShadow: "0 24px 70px rgba(0,0,0,0.65), 0 0 0 1px rgba(245,158,11,0.06)",
    overflow: "hidden",
    ...(pos
      ? { left: pos.x, top: pos.y }
      : { bottom: 24, right: 24 }),
    ...(minimized ? {} : { height: WIN_H }),
  };

  /* ── FAB (geschlossen) ───────────────────────────────────────────── */
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Help Desk öffnen"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 9999,
          width: 50, height: 50, borderRadius: "50%",
          background: "linear-gradient(135deg, #F59E0B 0%, #D97706 100%)",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(245,158,11,0.50)",
          color: "#1C0F00",
          transition: "transform 0.15s, box-shadow 0.15s",
        }}
        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.08)"; e.currentTarget.style.boxShadow = "0 6px 28px rgba(245,158,11,0.65)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)";    e.currentTarget.style.boxShadow = "0 4px 20px rgba(245,158,11,0.50)"; }}
      >
        <MessageSquare size={21} />
      </button>
    );
  }

  return (
    <div ref={winRef} style={winStyle}>

      {/* ── Header / Drag-Handle ───────────────────────────────────── */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display: "flex", alignItems: "center", gap: 9,
          padding: "10px 14px",
          background: "rgba(245,158,11,0.08)",
          borderBottom: minimized ? "none" : "1px solid rgba(255,255,255,0.055)",
          cursor: "grab", userSelect: "none", flexShrink: 0,
        }}
      >
        <GripHorizontal size={13} style={{ color: "rgba(245,158,11,0.4)", flexShrink: 0 }} />
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.28)",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
          <Bot size={13} style={{ color: "#F59E0B" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-1)", lineHeight: 1.2 }}>
            Help Desk
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", lineHeight: 1.2 }}>
            {messages.length - 1} Nachrichten · {infraCtx ? "Infra geladen" : "lädt…"}
          </div>
        </div>

        {/* Neue Sitzung */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={newSession}
          title="Neue Sitzung starten"
          style={iconBtnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#fbbf24")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
        >
          <RotateCcw size={13} />
        </button>

        {/* Minimieren */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setMinimized((m) => !m)}
          title={minimized ? "Maximieren" : "Minimieren"}
          style={iconBtnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
        >
          <Minus size={13} />
        </button>

        {/* Schließen */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setOpen(false)}
          title="Schließen"
          style={iconBtnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
        >
          <X size={13} />
        </button>
      </div>

      {/* ── Chat-Body (versteckt wenn minimiert) ──────────────────── */}
      {!minimized && (
        <>
          {/* Nachrichten */}
          <div style={{
            flex: 1, overflowY: "auto", padding: "14px 12px",
            display: "flex", flexDirection: "column", gap: 10,
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex", gap: 8,
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                alignItems: "flex-start",
              }}>
                {msg.role === "assistant" && <Avatar type="bot" />}
                <div style={{
                  fontSize: 12, lineHeight: 1.65, padding: "9px 13px",
                  borderRadius: 12, maxWidth: "83%", whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  ...(msg.role === "user"
                    ? { background: "rgba(245,158,11,0.11)", border: "1px solid rgba(245,158,11,0.2)", color: "var(--text-1)" }
                    : msg.error
                    ? { background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.15)", color: "#f87171" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)", color: "var(--text-2)" }
                  ),
                }}>
                  {msg.text}
                </div>
                {msg.role === "user" && <Avatar type="user" />}
              </div>
            ))}
            {busy && (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <Avatar type="bot" pulse />
                <div style={{
                  fontSize: 12, padding: "9px 13px", borderRadius: 12,
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)",
                  color: "rgba(237,232,220,0.38)",
                }}>Denkt nach…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Eingabe */}
          <div style={{
            padding: "10px 12px",
            borderTop: "1px solid rgba(255,255,255,0.055)",
            display: "flex", gap: 8, flexShrink: 0,
            background: "rgba(0,0,0,0.2)",
          }}>
            <textarea
              ref={textRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              rows={2}
              placeholder="Frag deinen Help Desk… (Enter senden)"
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.09)",
                borderRadius: 10, padding: "8px 11px",
                fontSize: 12, color: "var(--text-1)", resize: "none",
                outline: "none", fontFamily: "inherit", lineHeight: 1.5,
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "rgba(245,158,11,0.45)";
                e.target.style.boxShadow   = "0 0 0 3px rgba(245,158,11,0.09)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "rgba(255,255,255,0.09)";
                e.target.style.boxShadow   = "none";
              }}
            />
            <button
              onClick={send}
              disabled={busy || !input.trim()}
              style={{
                background: "linear-gradient(135deg, #F59E0B, #D97706)",
                border: "none", borderRadius: 10,
                padding: "0 15px", cursor: "pointer",
                color: "#1C0F00", alignSelf: "stretch",
                display: "flex", alignItems: "center", justifyContent: "center",
                opacity: busy || !input.trim() ? 0.42 : 1,
                boxShadow: "0 2px 10px rgba(245,158,11,0.28)",
                transition: "opacity 0.15s",
              }}
            >
              <Send size={15} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Kleine Helfer ─────────────────────────────────────────────────── */
function Avatar({ type, pulse = false }) {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
      display: "flex", alignItems: "center", justifyContent: "center",
      ...(type === "bot"
        ? { background: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.22)" }
        : { background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.10)" }
      ),
    }}>
      {type === "bot"
        ? <Bot  size={13} style={{ color: "#F59E0B" }} className={pulse ? "animate-pulse" : ""} />
        : <User size={12} style={{ color: "rgba(237,232,220,0.45)" }} />
      }
    </div>
  );
}

const iconBtnStyle = {
  background: "none", border: "none", cursor: "pointer",
  color: "rgba(255,255,255,0.3)", padding: "3px 4px",
  display: "flex", alignItems: "center",
  transition: "color 0.15s",
};
