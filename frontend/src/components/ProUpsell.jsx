import { Link } from "react-router-dom";
import { Crown, Lock } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export default function ProUpsell({ title, description, features = [] }) {
  const { isAdmin } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="card max-w-md w-full text-center space-y-5" style={{ padding: "2rem" }}>
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto"
          style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.28)", color: "#FCD34D" }}
        >
          <Crown size={26} />
        </div>
        <div>
          <h2 className="text-base font-medium flex items-center justify-center gap-2" style={{ color: "rgba(255,255,255,0.85)" }}>
            <Lock size={14} style={{ color: "rgba(255,255,255,0.35)" }} />
            {title}
          </h2>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.38)" }}>{description}</p>
        </div>

        {features.length > 0 && (
          <ul
            className="text-sm text-left space-y-2 rounded-xl p-4"
            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)" }}
          >
            {features.map((f) => (
              <li key={f} className="flex items-center gap-2" style={{ color: "rgba(255,255,255,0.55)" }}>
                <Crown size={11} style={{ color: "#FCD34D", flexShrink: 0 }} />
                {f}
              </li>
            ))}
          </ul>
        )}

        {isAdmin ? (
          <Link to="/license" className="btn-primary inline-flex items-center gap-2 text-sm">
            <Crown size={13} />
            Pro-Lizenz aktivieren
          </Link>
        ) : (
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            Wende dich an einen Administrator, um Pro freizuschalten.
          </p>
        )}
      </div>
    </div>
  );
}
