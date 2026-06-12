import { createContext, useContext } from "react";

const LicenseContext = createContext(null);

// Nexboard ist vollständig kostenlos und open source.
// Alle Features sind für alle Nutzer freigeschaltet.
const ALL_FEATURES = {
  max_connectors: null,
  max_users: null,
  ai_analysis: true,
  executive_view: true,
  alerts: true,
  history: true,
};

export function LicenseProvider({ children }) {
  return (
    <LicenseContext.Provider value={{ license: null, loading: false, refresh: () => {}, features: ALL_FEATURES, isPro: true }}>
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense muss innerhalb von LicenseProvider verwendet werden");
  return ctx;
}
