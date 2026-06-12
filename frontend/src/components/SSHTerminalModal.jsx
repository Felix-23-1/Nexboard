/**
 * SSHTerminalModal – schwebendes, verschiebbares SSH-Terminal.
 * Gleicher Drag-Mechanismus wie FloatingChat (getBoundingClientRect).
 * z-index: 9500 (immer über Seiteninhalt); KI-Chat liegt bei 9999.
 *
 * Props:
 *   connector  – { id, name, config: { host, username } }
 *   onClose    – Callback zum Schließen
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, TerminalSquare, GripHorizontal, Minus, Maximize2 } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { getToken } from "../api/client";

const DEFAULT_W = 860;
const DEFAULT_H = 480;

export default function SSHTerminalModal({ connector, onClose }) {
  const winRef       = useRef(null);
  const containerRef = useRef(null);
  const fitAddonRef  = useRef(null);
  const wsRef        = useRef(null);
  const drag         = useRef(null);

  // Startposition: mittig horizontal, oberes Viertel vertikal
  const [pos, setPos] = useState(() => ({
    x: Math.max(0, Math.round((window.innerWidth  - DEFAULT_W) / 2)),
    y: Math.max(0, Math.round((window.innerHeight - DEFAULT_H) / 4)),
  }));
  const [minimized, setMin] = useState(false);

  /* ── Drag – identisch zu FloatingChat ─────────────────────────────── */
  const onDragMove = useCallback((e) => {
    if (!drag.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth  - DEFAULT_W, e.clientX - drag.current.ox)),
      y: Math.max(0, Math.min(window.innerHeight - 44,         e.clientY - drag.current.oy)),
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

  /* ── xterm + WebSocket ────────────────────────────────────────────── */
  useEffect(() => {
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
      lineHeight: 1.3,
      theme: {
        background:          "#0a0e1a",
        foreground:          "#c9d1d9",
        cursor:              "#2dd4bf",
        cursorAccent:        "#0a0e1a",
        selectionBackground: "rgba(45,212,191,0.22)",
        black:   "#0d1117", brightBlack:   "#484f58",
        red:     "#f87171", brightRed:     "#ff9090",
        green:   "#34d399", brightGreen:   "#6ee7b7",
        yellow:  "#fbbf24", brightYellow:  "#fcd34d",
        blue:    "#60a5fa", brightBlue:    "#93c5fd",
        magenta: "#c084fc", brightMagenta: "#d8b4fe",
        cyan:    "#2dd4bf", brightCyan:    "#5eead4",
        white:   "#e6edf3", brightWhite:   "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    setTimeout(() => { fitAddon.fit(); term.focus(); }, 50);

    const host     = connector.config?.host     ?? connector.name;
    const username = connector.config?.username ?? "user";
    term.write(`Verbinde mit ${username}@${host}…\r\n`);

    const authToken = getToken() ?? "";
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(
      `${proto}//${window.location.host}/api/ssh/${connector.id}/terminal?token=${encodeURIComponent(authToken)}`
    );
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    function sendResize() {
      const dims = fitAddon.proposeDimensions();
      if (dims && ws.readyState === WebSocket.OPEN)
        ws.send(`1:${dims.cols}:${dims.rows}:0:0\n`);
    }

    ws.onopen    = () => { term.write("\x1b[1A\x1b[2K"); sendResize(); };
    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) term.write(new Uint8Array(e.data));
      else term.write(e.data);
    };
    ws.onerror = () =>
      term.write("\r\n\x1b[31mVerbindungsfehler.\x1b[0m\r\n");
    ws.onclose = (e) => {
      if (e.code !== 1000 && e.code !== 1001)
        term.write(`\r\n\x1b[33mVerbindung getrennt (Code ${e.code}).\x1b[0m\r\n`);
    };

    term.onData((data) => { if (ws.readyState === WebSocket.OPEN) ws.send(data); });

    const ro = new ResizeObserver(() => { fitAddon.fit(); sendResize(); });
    if (containerRef.current) ro.observe(containerRef.current);

    const onKeyDown = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      ro.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      ws.close(1000);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connector.id]);

  // Nach Minimize wieder aufklappen → Terminal-Größe neu berechnen
  useEffect(() => {
    if (!minimized) setTimeout(() => {
      fitAddonRef.current?.fit();
      // Fokus nach Wiederherstellen zurück ans Terminal
      containerRef.current?.querySelector(".xterm-helper-textarea")?.focus();
    }, 60);
  }, [minimized]);

  const host     = connector.config?.host     ?? connector.name;
  const username = connector.config?.username ?? "";

  // Portal: direkt in document.body rendern – weg von draggable/backdropFilter-Eltern
  return createPortal(
    <div
      ref={winRef}
      style={{
        position:      "fixed",
        left:          pos.x,
        top:           pos.y,
        width:         DEFAULT_W,
        zIndex:        9500,
        display:       "flex",
        flexDirection: "column",
        background:    "#0a0e1a",
        border:        "1px solid rgba(45,212,191,0.25)",
        borderRadius:  "12px",
        overflow:      "hidden",
        boxShadow:     "0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(45,212,191,0.08)",
      }}
    >
      {/* ── Titelleiste (Drag-Handle) ─────────────────────────────── */}
      <div
        onMouseDown={onHeaderMouseDown}
        style={{
          display:      "flex",
          alignItems:   "center",
          gap:          "8px",
          padding:      "8px 12px",
          background:   "rgba(0,0,0,0.55)",
          borderBottom: minimized ? "none" : "1px solid rgba(255,255,255,0.07)",
          flexShrink:   0,
          cursor:       "grab",
          userSelect:   "none",
        }}
      >
        <GripHorizontal size={13} style={{ color: "rgba(255,255,255,0.2)", flexShrink: 0 }} />
        <TerminalSquare size={13} style={{ color: "#2dd4bf", flexShrink: 0 }} />
        <span style={{ fontSize: "12px", fontFamily: "monospace", color: "rgba(255,255,255,0.65)" }}>
          {username}@{host}
        </span>
        <span style={{ fontSize: "11px", fontFamily: "monospace", color: "rgba(255,255,255,0.28)" }}>
          — {connector.name}
        </span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.18)", marginRight: 4 }}>
          ESC schließt
        </span>
        {/* Minimieren */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => setMin((m) => !m)}
          title={minimized ? "Wiederherstellen" : "Minimieren"}
          style={btnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
        >
          {minimized ? <Maximize2 size={13} /> : <Minus size={13} />}
        </button>
        {/* Schließen */}
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={onClose}
          title="Schließen"
          style={btnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
        >
          <X size={13} />
        </button>
      </div>

      {/* ── xterm.js Container ───────────────────────────────────── */}
      {!minimized && (
        <div
          ref={containerRef}
          onClick={() => containerRef.current?.querySelector(".xterm-helper-textarea")?.focus()}
          style={{ height: DEFAULT_H, overflow: "hidden", padding: "6px 10px", cursor: "text" }}
        />
      )}
    </div>,
    document.body,
  );
}

const btnStyle = {
  background:  "none",
  border:      "none",
  cursor:      "pointer",
  color:       "rgba(255,255,255,0.3)",
  padding:     "2px 4px",
  display:     "flex",
  alignItems:  "center",
};
