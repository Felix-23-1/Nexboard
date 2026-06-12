/**
 * TerminalModal – öffnet ein In-Browser-xterm.js-Terminal das via
 * Nexboard-Backend an Proxmox termproxy angebunden ist.
 *
 * Props:
 *   connectorId  – ID des Proxmox-Connectors
 *   vm           – { vmid, node, name, ip }
 *   onClose      – Callback zum Schließen des Modals
 */
import { useEffect, useRef } from "react";
import { X, TerminalSquare } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { getToken } from "../api/client";

export default function TerminalModal({ connectorId, vm, onClose }) {
  const containerRef = useRef(null);

  useEffect(() => {
    // ── xterm.js einrichten ────────────────────────────────────────────
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
        black:               "#0d1117",
        brightBlack:         "#484f58",
        red:                 "#f87171",
        brightRed:           "#ff9090",
        green:               "#34d399",
        brightGreen:         "#6ee7b7",
        yellow:              "#fbbf24",
        brightYellow:        "#fcd34d",
        blue:                "#60a5fa",
        brightBlue:          "#93c5fd",
        magenta:             "#c084fc",
        brightMagenta:       "#d8b4fe",
        cyan:                "#2dd4bf",
        brightCyan:          "#5eead4",
        white:               "#e6edf3",
        brightWhite:         "#ffffff",
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // kurze Verzögerung damit das DOM-Layout stabilisiert ist
    setTimeout(() => fitAddon.fit(), 30);
    term.write("Verbinde mit Proxmox Terminal…\r\n");

    // ── WebSocket zu Nexboard-Backend ──────────────────────────────────
    const authToken = getToken() ?? "";
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl =
      `${proto}//${window.location.host}/api/proxmox/${connectorId}/terminal` +
      `?vmid=${vm.vmid}&node=${encodeURIComponent(vm.node)}&token=${encodeURIComponent(authToken)}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    function sendResize() {
      const dims = fitAddon.proposeDimensions();
      if (dims && ws.readyState === WebSocket.OPEN) {
        ws.send(`1:${dims.cols}:${dims.rows}:0:0\n`);
      }
    }

    ws.onopen = () => {
      // "Verbinde…"-Zeile löschen und Resize senden
      term.write("\x1b[1A\x1b[2K");
      sendResize();
    };

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data));
      } else {
        term.write(e.data);
      }
    };

    ws.onerror = () =>
      term.write("\r\n\x1b[31mVerbindungsfehler – Terminal konnte nicht gestartet werden.\x1b[0m\r\n");

    ws.onclose = (e) => {
      if (e.code !== 1000 && e.code !== 1001) {
        term.write(`\r\n\x1b[33mVerbindung getrennt (Code ${e.code}).\x1b[0m\r\n`);
      }
    };

    // Tastatureingabe → WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data);
    });

    // Resize-Observer: Terminal-Größe bei Größenänderung anpassen
    const ro = new ResizeObserver(() => {
      fitAddon.fit();
      sendResize();
    });
    if (containerRef.current) ro.observe(containerRef.current);

    // ESC schließt das Modal
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      ro.disconnect();
      document.removeEventListener("keydown", onKeyDown);
      ws.close(1000);
      term.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectorId, vm.vmid, vm.node]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(5px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "min(960px, 96vw)",
          height: "min(600px, 88vh)",
          display: "flex",
          flexDirection: "column",
          background: "#0a0e1a",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.8), 0 0 0 1px rgba(45,212,191,0.08)",
        }}
      >
        {/* Titelzeile */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "9px 14px",
            background: "rgba(0,0,0,0.5)",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
            flexShrink: 0,
          }}
        >
          <TerminalSquare size={14} style={{ color: "#2dd4bf" }} />
          <span style={{ fontSize: "12px", fontFamily: "monospace", color: "rgba(255,255,255,0.65)" }}>
            {vm.name}
          </span>
          <span style={{ fontSize: "11px", fontFamily: "monospace", color: "rgba(255,255,255,0.28)" }}>
            vm-{vm.vmid} · {vm.node}
          </span>
          {vm.ip && (
            <span style={{ fontSize: "11px", fontFamily: "monospace", color: "rgba(45,212,191,0.55)" }}>
              {vm.ip}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.2)" }}>ESC zum Schließen</span>
          <button
            onClick={onClose}
            title="Schließen"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "rgba(255,255,255,0.3)",
              padding: "2px 4px",
              marginLeft: "4px",
              display: "flex",
              alignItems: "center",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.75)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.3)")}
          >
            <X size={15} />
          </button>
        </div>

        {/* xterm.js Container */}
        <div
          ref={containerRef}
          style={{ flex: 1, overflow: "hidden", padding: "6px 10px" }}
        />
      </div>
    </div>
  );
}
