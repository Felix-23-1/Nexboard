import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, getToken, setToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  // Beim Start: vorhandenes Token prüfen
  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.auth.me();
        if (!cancelled) setUser(me);
      } catch (_) {
        if (!cancelled) clearSession();
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    bootstrap();
    return () => { cancelled = true; };
  }, [clearSession]);

  // Auf abgelaufene/ungültige Tokens reagieren
  useEffect(() => {
    function handleUnauthorized() {
      setUser(null);
    }
    window.addEventListener("nexboard-unauthorized", handleUnauthorized);
    return () => window.removeEventListener("nexboard-unauthorized", handleUnauthorized);
  }, []);

  const login = useCallback(async (username, password) => {
    const res = await api.auth.login({ username, password });
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const setupAdmin = useCallback(async (data) => {
    const res = await api.auth.setup(data);
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  const refreshUser = useCallback(async () => {
    try {
      const me = await api.auth.me();
      setUser(me);
    } catch (_) {
      clearSession();
    }
  }, [clearSession]);

  const value = {
    user,
    loading,
    isAdmin: user?.role === "admin",
    login,
    setupAdmin,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth muss innerhalb von AuthProvider verwendet werden");
  return ctx;
}
