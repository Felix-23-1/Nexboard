import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { LicenseProvider } from "./license/LicenseContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <LicenseProvider>
          <App />
        </LicenseProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
