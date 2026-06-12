/**
 * ScriptRunner – SSH Quick-Commands für linux_ssh Connectors.
 *
 * - Commands werden per localStorage pro Connector gespeichert (key: nb_scripts_{connectorId})
 * - Ausführung via POST /api/ssh/{id}/execute → stdout/stderr inline
 * - Accordeon-Stil wie VmControlBlock / HistoryBlock
 */
import { useState, useRef } from "react";
import { Terminal, Play, Plus, Trash2, ChevronDown, Loader, Check, AlertTriangle, Edit2, X } from "lucide-react";
import { api } from "../api/client";

const STORAGE_KEY = (id) => `nb_scripts_${id}`;

function loadScripts(connectorId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY(connectorId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveScripts(connectorId, scripts) {
  localStorage.setItem(STORAGE_KEY(connectorId), JSON.stringify(scripts));
}

export default function ScriptRunner({ connectorId }) {
  const [open, setOpen]       = useState(false);
  const [scripts, setScripts] = useState(() => loadScripts(connectorId));
  const [adding, setAdding]   = useState(false);
  const [editId, setEditId]   = useState(null);

  // Ausführungs-State pro Script-ID
  const [running, setRunning] = useState({});   // id → true/false
  const [outputs, setOutputs] = useState({});   // id → { stdout, stderr, exit_code }

  // Formular-State
  const [form, setForm] = useState({ name: "", command: "" });

  function persistAndSet(newScripts) {
    setScripts(newScripts);
    saveScripts(connectorId, newScripts);
  }

  function startAdd() {
    setForm({ name: "", command: "" });
    setAdding(true);
    setEditId(null);
  }

  function startEdit(s) {
    setForm({ name: s.name, command: s.command });
    setEditId(s.id);
    setAdding(false);
  }

  function cancelForm() {
    setAdding(false);
    setEditId(null);
    setForm({ name: "", command: "" });
  }

  function saveForm() {
    if (!form.name.trim() || !form.command.trim()) return;
    if (editId !== null) {
      persistAndSet(scripts.map((s) => s.id === editId ? { ...s, ...form } : s));
      setEditId(null);
    } else {
      const newScript = { id: Date.now(), ...form };
      persistAndSet([...scripts, newScript]);
      setAdding(false);
    }
    setForm({ name: "", command: "" });
  }

  function deleteScript(id) {
    persistAndSet(scripts.filter((s) => s.id !== id));
    setOutputs((o) => { const n = { ...o }; delete n[id]; return n; });
  }

  async function runScript(s) {
    setRunning((r) => ({ ...r, [s.id]: true }));
    setOutputs((o) => ({ ...o, [s.id]: null }));
    try {
      const result = await api.ssh.execute(connectorId, s.command);
      setOutputs((o) => ({ ...o, [s.id]: result }));
    } catch (e) {
      setOutputs((o) => ({ ...o, [s.id]: { stdout: "", stderr: e.message, exit_code: -1 } }));
    } finally {
      setRunning((r) => ({ ...r, [s.id]: false }));
    }
  }

  const isFormValid = form.name.trim() && form.command.trim();

  return (
    <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
      {/* ── Accordion-Header ──────────────────────────────────────────── */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "6px 8px", borderRadius: 8, background: "transparent",
          border: "none", cursor: "pointer", transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          fontSize: 10.5, fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase",
          color: "rgba(255,255,255,0.38)",
        }}>
          <Terminal size={11} />
          Quick-Commands
          {scripts.length > 0 && (
            <span style={{
              textTransform: "none", letterSpacing: 0, fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace", color: "rgba(45,212,191,0.65)",
            }}>
              {scripts.length}
            </span>
          )}
        </div>
        <ChevronDown
          size={13}
          style={{
            color: "rgba(255,255,255,0.28)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
          }}
        />
      </button>

      {/* ── Inhalt ────────────────────────────────────────────────────── */}
      {open && (
        <div style={{ padding: "8px 8px 4px", display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Script-Liste */}
          {scripts.map((s) => {
            const out = outputs[s.id];
            const isRunning = running[s.id];
            const isEditing = editId === s.id;

            if (isEditing) {
              return (
                <ScriptForm
                  key={s.id}
                  form={form}
                  setForm={setForm}
                  onSave={saveForm}
                  onCancel={cancelForm}
                  isValid={isFormValid}
                  label="Speichern"
                />
              );
            }

            return (
              <div
                key={s.id}
                style={{
                  borderRadius: 10,
                  background: "rgba(0,0,0,0.22)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  overflow: "hidden",
                }}
              >
                {/* Script-Header */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                }}>
                  <Terminal size={11} style={{ color: "#2dd4bf", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.80)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.name}
                    </div>
                    <div style={{ fontSize: 10, fontFamily: "monospace", color: "rgba(255,255,255,0.30)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {s.command}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <button
                    onClick={() => startEdit(s)}
                    title="Bearbeiten"
                    style={iconBtn}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
                  >
                    <Edit2 size={11} />
                  </button>
                  <button
                    onClick={() => deleteScript(s.id)}
                    title="Löschen"
                    style={iconBtn}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#f87171")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
                  >
                    <Trash2 size={11} />
                  </button>
                  <button
                    onClick={() => runScript(s)}
                    disabled={isRunning}
                    title="Ausführen"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 4,
                      fontSize: 10.5, padding: "3px 9px", borderRadius: 6,
                      background: "rgba(45,212,191,0.1)", border: "1px solid rgba(45,212,191,0.25)",
                      color: "#2dd4bf", cursor: isRunning ? "default" : "pointer",
                      opacity: isRunning ? 0.6 : 1, fontFamily: "inherit",
                    }}
                  >
                    {isRunning
                      ? <Loader size={9} style={{ animation: "spin 1s linear infinite" }} />
                      : <Play size={9} />}
                    {isRunning ? "…" : "Run"}
                  </button>
                </div>

                {/* Output */}
                {out !== undefined && out !== null && (
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.05)", padding: "8px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 5 }}>
                      {out.exit_code === 0
                        ? <Check size={10} style={{ color: "#34d399" }} />
                        : <AlertTriangle size={10} style={{ color: "#f87171" }} />}
                      <span style={{ fontSize: 9, color: out.exit_code === 0 ? "#34d399" : "#f87171", fontFamily: "monospace" }}>
                        exit {out.exit_code}
                      </span>
                    </div>
                    {out.stdout && (
                      <pre style={{
                        fontSize: 10.5, fontFamily: "'JetBrains Mono', Consolas, monospace",
                        color: "rgba(201,209,217,0.85)", whiteSpace: "pre-wrap", wordBreak: "break-all",
                        background: "rgba(0,0,0,0.3)", borderRadius: 6, padding: "6px 8px",
                        maxHeight: 200, overflowY: "auto", margin: 0,
                      }}>
                        {out.stdout}
                      </pre>
                    )}
                    {out.stderr && (
                      <pre style={{
                        fontSize: 10.5, fontFamily: "'JetBrains Mono', Consolas, monospace",
                        color: "#f87171", whiteSpace: "pre-wrap", wordBreak: "break-all",
                        background: "rgba(248,113,113,0.05)", borderRadius: 6, padding: "6px 8px",
                        maxHeight: 100, overflowY: "auto", margin: "4px 0 0",
                      }}>
                        {out.stderr}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Neues Script hinzufügen */}
          {adding ? (
            <ScriptForm
              form={form}
              setForm={setForm}
              onSave={saveForm}
              onCancel={cancelForm}
              isValid={isFormValid}
              label="Hinzufügen"
            />
          ) : (
            <button
              onClick={startAdd}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                fontSize: 11, padding: "6px 10px", borderRadius: 8,
                background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.38)", cursor: "pointer", fontFamily: "inherit",
                transition: "all 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = "rgba(45,212,191,0.35)";
                e.currentTarget.style.color = "rgba(45,212,191,0.75)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)";
                e.currentTarget.style.color = "rgba(255,255,255,0.38)";
              }}
            >
              <Plus size={11} /> Quick-Command hinzufügen
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Formular ─────────────────────────────────────────────────────── */

function ScriptForm({ form, setForm, onSave, onCancel, isValid, label }) {
  return (
    <div style={{
      borderRadius: 10,
      background: "rgba(45,212,191,0.04)",
      border: "1px solid rgba(45,212,191,0.2)",
      padding: "10px 12px",
      display: "flex", flexDirection: "column", gap: 7,
    }}>
      <input
        value={form.name}
        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
        placeholder="Name (z.B. Disk Usage)"
        autoFocus
        style={inputStyle}
        onFocus={(e) => (e.target.style.borderColor = "rgba(45,212,191,0.45)")}
        onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
      />
      <input
        value={form.command}
        onChange={(e) => setForm((f) => ({ ...f, command: e.target.value }))}
        placeholder="Befehl (z.B. df -h)"
        style={{ ...inputStyle, fontFamily: "'JetBrains Mono', Consolas, monospace", fontSize: 11 }}
        onFocus={(e) => (e.target.style.borderColor = "rgba(45,212,191,0.45)")}
        onBlur={(e) => (e.target.style.borderColor = "rgba(255,255,255,0.12)")}
        onKeyDown={(e) => { if (e.key === "Enter" && isValid) onSave(); if (e.key === "Escape") onCancel(); }}
      />
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={onCancel} style={cancelBtn}>Abbrechen</button>
        <button
          onClick={onSave}
          disabled={!isValid}
          style={{ ...saveBtn, opacity: isValid ? 1 : 0.45 }}
        >
          {label}
        </button>
      </div>
    </div>
  );
}

/* ── Styles ───────────────────────────────────────────────────────── */

const iconBtn = {
  background: "none", border: "none", cursor: "pointer",
  color: "rgba(255,255,255,0.25)", padding: "2px 4px",
  display: "flex", alignItems: "center", transition: "color 0.15s",
};

const inputStyle = {
  width: "100%", background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 7,
  padding: "6px 9px", fontSize: 12, color: "rgba(237,232,220,0.85)",
  outline: "none", fontFamily: "inherit", transition: "border-color 0.15s",
  boxSizing: "border-box",
};

const cancelBtn = {
  fontSize: 11, padding: "4px 11px", borderRadius: 6, cursor: "pointer",
  background: "none", border: "1px solid rgba(255,255,255,0.12)",
  color: "rgba(255,255,255,0.4)", fontFamily: "inherit",
};

const saveBtn = {
  fontSize: 11, padding: "4px 11px", borderRadius: 6, cursor: "pointer",
  background: "rgba(45,212,191,0.12)", border: "1px solid rgba(45,212,191,0.3)",
  color: "#2dd4bf", fontFamily: "inherit",
};
