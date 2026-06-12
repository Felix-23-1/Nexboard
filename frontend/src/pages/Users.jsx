import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { UserPlus, Trash2, Pencil, Shield, User as UserIcon, Crown, Lock, Eye, EyeOff } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { useLicense } from "../license/LicenseContext";

const ROLE_BADGE = {
  admin: { label: "Admin", cls: "text-amber-300 bg-amber-400/15 border-amber-400/30", icon: Shield },
  viewer: { label: "Mitarbeiter", cls: "text-blue-300 bg-blue-400/15 border-blue-400/30", icon: UserIcon },
};

function fmtDate(value) {
  if (!value) return "–";
  const d = new Date(value);
  return d.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

export default function Users() {
  const { user: me } = useAuth();
  const { features } = useLicense();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await api.users.list());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function deleteUser(u) {
    if (!confirm(`Benutzer "${u.username}" wirklich löschen?`)) return;
    try {
      await api.users.delete(u.id);
      setUsers((list) => list.filter((x) => x.id !== u.id));
    } catch (e) {
      alert(e.message);
    }
  }

  const limit = features.max_users;
  const atLimit = limit != null && users.length >= limit;
  // Eigentümer = Benutzer mit der niedrigsten ID
  const ownerId = users.length > 0 ? Math.min(...users.map((u) => u.id)) : null;
  const canEditOwner = me?.id === ownerId;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Benutzer</h1>
          <p className="text-white/40 text-sm mt-0.5">Konten und Rollen verwalten</p>
        </div>
        {atLimit ? (
          <Link to="/license" className="btn-primary flex items-center gap-2 text-sm">
            <Crown size={14} /> Upgrade auf Pro
          </Link>
        ) : (
          <button
            onClick={() => setModal({ mode: "create" })}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <UserPlus size={14} /> Benutzer anlegen
          </button>
        )}
      </div>

      {limit != null && !loading && (
        <div className={`flex items-center justify-between text-xs border rounded-lg px-3 py-2.5 ${
          atLimit
            ? "bg-yellow-400/10 border-yellow-400/25 text-yellow-400"
            : "bg-white/7 border-white/10 text-white/55"
        }`}>
          <span className="flex items-center gap-2">
            {atLimit ? <Crown size={13} /> : <Lock size={13} />}
            {atLimit
              ? "Multi-User ist ein Pro-Feature. Mit Pro legst du mehrere Benutzer mit Rollen an."
              : `Free-Version: ${users.length} von ${limit} Benutzer genutzt.`}
          </span>
          <Link to="/license" className="font-medium underline whitespace-nowrap ml-3">
            Pro freischalten
          </Link>
        </div>
      )}

      {/* Rollen-Erklärung */}
      {!loading && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-amber-400/5 border border-amber-400/15 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-1.5 font-medium text-amber-300 mb-0.5">
              <Shield size={11} /> Admin
            </div>
            <p className="text-white/40">Volle Rechte inkl. Benutzerverwaltung</p>
          </div>
          <div className="bg-blue-400/5 border border-blue-400/15 rounded-lg px-3 py-2.5">
            <div className="flex items-center gap-1.5 font-medium text-blue-300 mb-0.5">
              <UserIcon size={11} /> Mitarbeiter
            </div>
            <p className="text-white/40">Dashboard, Connectors, Einstellungen – kein Benutzermanagement</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-white/40 text-sm">Lade Benutzer...</div>
      ) : error ? (
        <div className="card text-red-400 text-sm">{error}</div>
      ) : (
        <div className="space-y-2">
          {users.map((u) => {
            const badge = ROLE_BADGE[u.role] ?? ROLE_BADGE.viewer;
            const BadgeIcon = badge.icon;
            const isOwner = u.id === ownerId;
            const isMe = u.id === me?.id;
            const editBlocked = isOwner && !canEditOwner;

            return (
              <div key={u.id} className="card flex items-center gap-4">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${
                  u.active ? "bg-amber-400/15 text-amber-300" : "bg-white/8 text-white/25"
                }`}>
                  {u.username.charAt(0).toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm flex items-center gap-2">
                    {u.username}
                    {isOwner && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-amber-300/70 border border-amber-400/20 rounded px-1.5 py-0.5">
                        <Crown size={9} /> Eigentümer
                      </span>
                    )}
                    {isMe && !isOwner && (
                      <span className="text-[10px] text-white/40 border border-white/10 rounded px-1.5 py-0.5">
                        Du
                      </span>
                    )}
                    {isMe && isOwner && (
                      <span className="text-[10px] text-white/40 border border-white/10 rounded px-1.5 py-0.5">
                        Du
                      </span>
                    )}
                    {!u.active && <span className="text-[10px] text-red-400">deaktiviert</span>}
                  </div>
                  <div className="text-white/40 text-xs">
                    {u.email || "keine E-Mail"} · zuletzt aktiv {fmtDate(u.last_login)}
                  </div>
                </div>

                <span className={`inline-flex items-center gap-1 text-xs font-medium border rounded-full px-2.5 py-0.5 ${badge.cls}`}>
                  <BadgeIcon size={11} />
                  {badge.label}
                </span>

                <div className="flex items-center gap-1">
                  {editBlocked ? (
                    <span
                      className="btn-ghost text-xs text-white/20 cursor-not-allowed"
                      title="Nur der Eigentümer kann sein Konto bearbeiten"
                    >
                      <Lock size={14} />
                    </span>
                  ) : (
                    <button
                      onClick={() => setModal({ mode: "edit", user: u })}
                      className="btn-ghost text-xs"
                      title="Bearbeiten"
                    >
                      <Pencil size={14} />
                    </button>
                  )}
                  <button
                    onClick={() => deleteUser(u)}
                    disabled={isMe || editBlocked}
                    className="btn-ghost text-xs text-red-500 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
                    title={
                      isMe ? "Eigenes Konto nicht löschbar"
                      : editBlocked ? "Eigentümer-Account kann nicht gelöscht werden"
                      : "Löschen"
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <UserModal
          mode={modal.mode}
          user={modal.user}
          onClose={() => setModal(null)}
          onSaved={(saved) => {
            setUsers((list) => {
              const exists = list.some((x) => x.id === saved.id);
              return exists ? list.map((x) => (x.id === saved.id ? saved : x)) : [...list, saved];
            });
            setModal(null);
          }}
        />
      )}
    </div>
  );
}

function UserModal({ mode, user, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState({
    username: user?.username ?? "",
    email: user?.email ?? "",
    password: "",
    role: user?.role ?? "viewer",
    active: user?.active ?? true,
  });
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (!isEdit && form.password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    if (isEdit && form.password && form.password.length < 6) {
      setError("Das neue Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }

    setSaving(true);
    try {
      let saved;
      if (isEdit) {
        const payload = { email: form.email.trim(), role: form.role, active: form.active };
        if (form.password) payload.password = form.password;
        saved = await api.users.update(user.id, payload);
      } else {
        saved = await api.users.create({
          username: form.username.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
        });
      }
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white/7 border border-white/10 rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="font-semibold">{isEdit ? "Benutzer bearbeiten" : "Benutzer anlegen"}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white text-xl leading-none">
            &times;
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm text-white/55 mb-1.5">Benutzername</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
              required
              disabled={isEdit}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 disabled:opacity-50"
            />
            {isEdit && <p className="text-xs text-white/25 mt-1">Benutzername kann nicht geändert werden.</p>}
          </div>

          <div>
            <label className="block text-sm text-white/55 mb-1.5">
              E-Mail <span className="text-white/25">(optional)</span>
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
            />
          </div>

          <div>
            <label className="block text-sm text-white/55 mb-1.5">
              {isEdit ? "Neues Passwort" : "Passwort"}
              {isEdit && <span className="text-white/25 ml-1">(leer = unverändert)</span>}
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={form.password}
                onChange={(e) => update("password", e.target.value)}
                required={!isEdit}
                autoComplete="new-password"
                className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/75"
              >
                {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-white/55 mb-1.5">Rolle</label>
            <select
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
              className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-amber-400"
            >
              <option value="viewer">Mitarbeiter – Dashboard & Connectors, kein Benutzermanagement</option>
              <option value="admin">Admin – volle Rechte inkl. Benutzerverwaltung</option>
            </select>
          </div>

          {isEdit && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => update("active", e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-white/75">Konto aktiv</span>
            </label>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-400/5 border border-red-400/10 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm">
              Abbrechen
            </button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 text-sm">
              {saving ? "Speichern..." : isEdit ? "Speichern" : "Anlegen"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
