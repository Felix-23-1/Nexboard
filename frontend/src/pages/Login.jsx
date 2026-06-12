import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Activity, Eye, EyeOff, ShieldCheck, LogIn } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export default function Login() {
  const { user, loading: authLoading, login, setupAdmin } = useAuth();
  const navigate = useNavigate();

  const [mode, setMode]         = useState(null);
  const [form, setForm]         = useState({ username: "", email: "", password: "", confirm: "" });
  const [showPw, setShowPw]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState(null);

  useEffect(() => {
    api.auth.status()
      .then((s) => setMode(s.needs_setup ? "setup" : "login"))
      .catch(() => setMode("login"));
  }, []);

  if (!authLoading && user) return <Navigate to="/dashboard" replace />;

  function update(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    if (mode === "setup") {
      if (form.password.length < 6) { setError("Passwort muss mindestens 6 Zeichen lang sein."); return; }
      if (form.password !== form.confirm) { setError("Passwörter stimmen nicht überein."); return; }
    }
    setSubmitting(true);
    try {
      let u;
      if (mode === "setup") {
        u = await setupAdmin({ username: form.username.trim(), email: form.email.trim(), password: form.password });
      } else {
        u = await login(form.username.trim(), form.password);
      }
      let target = "/dashboard";
      if (u?.role === "admin") {
        try {
          const s = await api.setup.state();
          if (!s.wizard_completed) target = "/wizard";
        } catch (_) {}
      }
      navigate(target, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const isSetup = mode === "setup";

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex flex-col items-center mb-8 gap-2">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: "rgba(245,158,11,0.18)", border: "1px solid rgba(245,158,11,0.32)", color: "#FCD34D" }}
          >
            <Activity size={22} />
          </div>
          <div className="text-[22px] font-medium tracking-tight" style={{ color: "rgba(255,255,255,0.9)" }}>
            <span style={{ color: "#FCD34D" }}>Nex</span>board
          </div>
          <p className="text-sm" style={{ color: "rgba(255,255,255,0.35)" }}>
            {mode === null
              ? "Lädt…"
              : isSetup
              ? "Erst-Einrichtung – lege dein Admin-Konto an"
              : "Melde dich an um fortzufahren"}
          </p>
        </div>

        {mode === null ? (
          <div className="card text-center text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>Lädt…</div>
        ) : (
          <form onSubmit={handleSubmit} className="card space-y-4" style={{ padding: "1.75rem" }}>
            {isSetup && (
              <div
                className="flex items-start gap-2 text-xs rounded-lg px-3 py-2"
                style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.22)", color: "#FCD34D" }}
              >
                <ShieldCheck size={13} className="flex-shrink-0 mt-0.5" />
                <span>Erster Start – dieses Konto erhält Admin-Rechte.</span>
              </div>
            )}

            <div>
              <label className="block text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                Benutzername
              </label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => update("username", e.target.value)}
                required autoFocus autoComplete="username"
                className="nb-input"
              />
            </div>

            {isSetup && (
              <div>
                <label className="block text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  E-Mail <span style={{ color: "rgba(255,255,255,0.22)" }}>(optional)</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  autoComplete="email"
                  className="nb-input"
                />
              </div>
            )}

            <div>
              <label className="block text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                Passwort
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  required
                  autoComplete={isSetup ? "new-password" : "current-password"}
                  className="nb-input pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: "rgba(255,255,255,0.35)" }}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {isSetup && (
              <div>
                <label className="block text-xs mb-1.5" style={{ color: "rgba(255,255,255,0.45)" }}>
                  Passwort bestätigen
                </label>
                <input
                  type={showPw ? "text" : "password"}
                  value={form.confirm}
                  onChange={(e) => update("confirm", e.target.value)}
                  required autoComplete="new-password"
                  className="nb-input"
                />
              </div>
            )}

            {error && (
              <div
                className="text-xs rounded-lg px-3 py-2"
                style={{ color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.18)" }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
            >
              <LogIn size={14} />
              {submitting ? "Bitte warten…" : isSetup ? "Admin-Konto erstellen" : "Anmelden"}
            </button>
          </form>
        )}

        <p className="text-center text-[11px] mt-6" style={{ color: "rgba(255,255,255,0.18)" }}>
          Nexboard · Self-hosted IT-Dashboard
        </p>
      </div>
    </div>
  );
}
