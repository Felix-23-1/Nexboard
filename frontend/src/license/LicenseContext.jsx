import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

const LicenseContext = createContext(null);

const FREE_FEATURES = {
  max_connectors: 3,
  max_users: 1,
  ai_analysis: false,
  executive_view: false,
  alerts: false,
  history: false,
};

export function LicenseProvider({ children }) {
  const { user } = useAuth();
  const [license, setLicense] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setLicense(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setLicense(await api.license.get());
    } catch (_) {
      setLicense(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const features = license?.features ?? FREE_FEATURES;
  const isPro = license?.plan === "pro" && license?.valid === true;

  return (
    <LicenseContext.Provider value={{ license, loading, refresh, features, isPro }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense muss innerhalb von LicenseProvider verwendet werden");
  return ctx;
}
