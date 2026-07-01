/**
 * AiChatWidget — kompaktes Chat-Interface für ai_models Connectors.
 * Wird als Dashboard-Widget eingebettet; verwaltet State intern.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Bot, User, ChevronDown, Loader2, AlertCircle, Plug } from "lucide-react";
import { api } from "../api/client";
import { Link } from "react-router-dom";

/* ── Helper ─────────────────────────────────────────────────────── */
function getModels(connector) {
  if (!connector) return [];
  const m = connector.metrics ?? {};
  return (m.available_models ?? m.models_loaded ?? [])
    .map(x => (typeof x === "string" ? x : x.name ?? x.id))
    .filter(Boolean);
}

/* ── Compact select ─────────────────────────────────────────────── */
function MiniSelect({ value, onChange, options, placeholder }) {
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: "none",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.10)",
          borderRadius: 8,
          color: "var(--text-1)",
          fontSize: 11,
          fontWeight: 500,
          padding: "4px 26px 4px 9px",
          cursor: "pointer",
          outline: "none",
          maxWidth: 180,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {placeholder && <option value="" disabled>{placeholder}</option>}
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown
        size={11}
        style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)", pointerEvents: "none" }}
      />
    </div>
  );
}

/* ── Message bubble ─────────────────────────────────────────────── */
function MessageBubble({ msg }) {
  const isUser = msg.role === "user";
  const isError = msg.role === "error";

  if (isError) return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: "rgba(248,113,113,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AlertCircle size={12} style={{ color: "#f87171" }} />
      </div>
      <div style={{ fontSize: 12, color: "#f87171", background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.15)", borderRadius: 10, padding: "7px 11px", maxWidth: "90%", lineHeight: 1.5 }}>
        {msg.content}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", flexDirection: isUser ? "row-reverse" : "row" }}>
      {/* Avatar */}
      <div style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        background: isUser ? "rgba(245,158,11,0.15)" : "rgba(139,92,246,0.15)",
        border: `1px solid ${isUser ? "rgba(245,158,11,0.3)" : "rgba(139,92,246,0.3)"}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: isUser ? "#F59E0B" : "#8B5CF6",
      }}>
        {isUser ? <User size={11} /> : <Bot size={11} />}
      </div>
      {/* Bubble */}
      <div style={{
        fontSize: 12.5,
        lineHeight: 1.55,
        color: isUser ? "rgba(255,255,255,0.88)" : "var(--text-1)",
        background: isUser ? "rgba(245,158,11,0.09)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${isUser ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: isUser ? "12px 4px 12px 12px" : "4px 12px 12px 12px",
        padding: "8px 12px",
        maxWidth: "88%",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {msg.content}
        {msg.model && (
          <div style={{ fontSize: 9.5, color: "rgba(255,255,255,0.2)", marginTop: 5, fontFamily: "'JetBrains Mono', monospace" }}>
            {msg.model}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── AiChatWidget ───────────────────────────────────────────────── */
export default function AiChatWidget({ connectors = [] }) {
  const [selectedConnId, setSelectedConnId] = useState(null);
  const [selectedModel,  setSelectedModel]  = useState("");
  const [messages,       setMessages]       = useState([]);
  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  const onlineConns = connectors.filter(c => c.status === "online");

  // Auto-select first connector on mount / when list changes
  useEffect(() => {
    if (onlineConns.length && (!selectedConnId || !onlineConns.find(c => c.id === selectedConnId))) {
      setSelectedConnId(onlineConns[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectors]);

  const selectedConn = onlineConns.find(c => c.id === selectedConnId) ?? null;
  const models       = getModels(selectedConn);

  // When connector changes, auto-select first model
  useEffect(() => {
    if (models.length && (!selectedModel || !models.includes(selectedModel))) {
      setSelectedModel(models[0]);
    }
    if (!models.length) setSelectedModel("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConnId, connectors]);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading || !selectedConn) return;

    const userMsg    = { role: "user", content: text };
    const newMsgs    = [...messages, userMsg];
    setMessages(newMsgs);
    setInput("");
    setLoading(true);

    // Build messages array for API (only role + content)
    const apiMsgs = newMsgs
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await api.ai.connectorChat(
        selectedConn.id,
        apiMsgs,
        selectedModel || null,
      );
      setMessages(prev => [...prev, {
        role:    "assistant",
        content: res.content,
        model:   res.model,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "error", content: e.message }]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, selectedConn, selectedModel, messages]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  /* ── No connectors ──────────────────────────────────────────── */
  if (onlineConns.length === 0) {
    return (
      <div style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 16, padding: "28px 20px",
        display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center",
      }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.22)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bot size={20} style={{ color: "#8B5CF6" }} />
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)", marginBottom: 4 }}>Kein AI-Server online</div>
          <div style={{ fontSize: 11, color: "var(--text-3)" }}>Füge einen <code style={{ background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>ai_models</code> Connector hinzu</div>
        </div>
        <Link to="/connectors" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, padding: "6px 14px", textDecoration: "none" }}>
          <Plug size={12} /> Connector hinzufügen
        </Link>
      </div>
    );
  }

  /* ── Chat UI ────────────────────────────────────────────────── */
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 16,
      display: "flex", flexDirection: "column",
      overflow: "hidden",
      minHeight: 320,
    }}>

      {/* ── Header with selectors ─────────────────────────────── */}
      <div style={{
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
        background: "rgba(139,92,246,0.04)",
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "rgba(139,92,246,0.14)", border: "1px solid rgba(139,92,246,0.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Bot size={14} style={{ color: "#8B5CF6" }} />
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase", marginRight: 2 }}>AI Chat</span>

        {onlineConns.length > 1 && (
          <MiniSelect
            value={selectedConnId ?? ""}
            onChange={v => setSelectedConnId(Number(v))}
            options={onlineConns.map(c => ({ value: c.id, label: c.name }))}
          />
        )}
        {onlineConns.length === 1 && (
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>{onlineConns[0].name}</span>
        )}

        {models.length > 0 && (
          <MiniSelect
            value={selectedModel}
            onChange={setSelectedModel}
            options={models.map(m => ({ value: m, label: m }))}
            placeholder="Modell wählen"
          />
        )}

        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            style={{ marginLeft: "auto", background: "none", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, padding: "3px 9px", fontSize: 10, color: "rgba(255,255,255,0.28)", cursor: "pointer" }}
          >
            Löschen
          </button>
        )}
      </div>

      {/* ── Messages ──────────────────────────────────────────── */}
      <div style={{
        flex: 1, overflowY: "auto",
        padding: "14px",
        display: "flex", flexDirection: "column", gap: 12,
        maxHeight: 340, minHeight: 160,
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", margin: "auto", paddingTop: 24 }}>
            <Bot size={28} style={{ color: "rgba(139,92,246,0.3)", margin: "0 auto 8px", display: "block" }} />
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.22)" }}>
              {selectedModel ? `Chatte mit ${selectedModel}` : "Modell auswählen und loslegen"}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        {loading && (
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bot size={11} style={{ color: "#8B5CF6" }} />
            </div>
            <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "4px 12px 12px 12px", padding: "8px 14px", display: "flex", gap: 5, alignItems: "center" }}>
              <Loader2 size={12} style={{ color: "#8B5CF6", animation: "spin 1s linear infinite" }} />
              <span style={{ fontSize: 11.5, color: "rgba(255,255,255,0.3)" }}>Antwort wird generiert…</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ────────────────────────────────────────── */}
      <div style={{
        padding: "10px 12px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
        display: "flex", gap: 8, alignItems: "flex-end",
        background: "rgba(255,255,255,0.02)",
      }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nachricht eingeben… (Enter = Senden, Shift+Enter = Neue Zeile)"
          disabled={loading || !selectedConn}
          rows={1}
          style={{
            flex: 1, resize: "none", minHeight: 36, maxHeight: 100,
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 10,
            color: "var(--text-1)",
            fontSize: 12.5,
            padding: "8px 12px",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: 1.5,
            overflow: "auto",
            transition: "border-color 0.15s",
          }}
          onFocus={e => { e.target.style.borderColor = "rgba(139,92,246,0.45)"; }}
          onBlur={e => { e.target.style.borderColor = "rgba(255,255,255,0.10)"; }}
          onInput={e => {
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 100)}px`;
          }}
        />
        <button
          onClick={send}
          disabled={loading || !input.trim() || !selectedConn}
          style={{
            width: 36, height: 36, borderRadius: 10, flexShrink: 0,
            background: input.trim() && !loading ? "#8B5CF6" : "rgba(255,255,255,0.06)",
            border: "none", cursor: input.trim() && !loading ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: input.trim() && !loading ? "#fff" : "rgba(255,255,255,0.2)",
            transition: "background 0.15s, color 0.15s",
          }}
        >
          {loading
            ? <Loader2 size={15} style={{ animation: "spin 1s linear infinite" }} />
            : <Send size={14} />
          }
        </button>
      </div>
    </div>
  );
}
