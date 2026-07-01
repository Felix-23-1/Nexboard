const BASE = "/api";
const TOKEN_KEY = "nexboard_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token ungültig oder abgelaufen – Sitzung beenden
    if (token) {
      setToken(null);
      window.dispatchEvent(new Event("nexboard-unauthorized"));
    }
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Nicht authentifiziert");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request fehlgeschlagen");
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => request("/health"),
  auth: {
    status: () => request("/auth/status"),
    setup: (data) => request("/auth/setup", { method: "POST", body: JSON.stringify(data) }),
    login: (data) => request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
    me: () => request("/auth/me"),
  },
  users: {
    list: () => request("/users"),
    create: (data) => request("/users", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id) => request(`/users/${id}`, { method: "DELETE" }),
  },
  license: {
    get: () => request("/license"),
    activate: (key) => request("/license", { method: "POST", body: JSON.stringify({ key }) }),
    remove: () => request("/license", { method: "DELETE" }),
  },
  status: {
    overview: () => request("/status/overview"),
    detailed: () => request("/status/detailed"),
    history: (connectorId, hours = 24) => request(`/status/history/${connectorId}?hours=${hours}`),
    metricHistory: (connectorId, key, hours = 24, points = 120) =>
      request(`/status/history/${connectorId}/metrics?key=${encodeURIComponent(key)}&hours=${hours}&points=${points}`),
  },
  connectors: {
    types: () => request("/connectors/types"),
    list: () => request("/connectors"),
    create: (data) => request("/connectors", { method: "POST", body: JSON.stringify(data) }),
    update: (id, data) => request(`/connectors/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id) => request(`/connectors/${id}`, { method: "DELETE" }),
    status: (id) => request(`/connectors/${id}/status`),
  },
  settings: {
    get: () => request("/settings"),
    save: (data) => request("/settings", { method: "PUT", body: JSON.stringify(data) }),
  },
  ai: {
    analyze: (connector_id) => request("/ai/analyze", { method: "POST", body: JSON.stringify({ connector_id }) }),
    analyzeLogs: (logs, context) =>
      request("/ai/analyze-logs", { method: "POST", body: JSON.stringify({ logs, context }) }),
    chat: (question, infra_context = null) =>
      request("/ai/chat", { method: "POST", body: JSON.stringify({ question, infra_context }) }),
    connectorChat: (connector_id, messages, model = null, max_tokens = 2048, temperature = 0.7) =>
      request("/ai/connector-chat", {
        method: "POST",
        body: JSON.stringify({ connector_id, messages, model, max_tokens, temperature }),
      }),
  },
  proxmox: {
    vmAction: (connector_id, node, vmid, action) =>
      request("/proxmox/vm-action", { method: "POST", body: JSON.stringify({ connector_id, node, vmid, action }) }),
  },
  docker: {
    containerAction: (connectorId, containerId, action) =>
      request(`/docker/${connectorId}/containers/${containerId}/action`, {
        method: "POST",
        body: JSON.stringify({ action }),
      }),
  },
  ssh: {
    execute: (connectorId, command) =>
      request(`/ssh/${connectorId}/execute`, {
        method: "POST",
        body: JSON.stringify({ command }),
      }),
  },
  wol: {
    wake: (connectorId) =>
      request(`/wol/${connectorId}/wake`, { method: "POST" }),
  },
  setup: {
    state: () => request("/setup"),
    complete: () => request("/setup/complete", { method: "POST" }),
  },
  alerts: {
    channels: {
      list: () => request("/alerts/channels"),
      create: (data) => request("/alerts/channels", { method: "POST", body: JSON.stringify(data) }),
      update: (id, data) => request(`/alerts/channels/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
      delete: (id) => request(`/alerts/channels/${id}`, { method: "DELETE" }),
      test: (id) => request(`/alerts/channels/${id}/test`, { method: "POST" }),
    },
    rules: {
      list: () => request("/alerts/rules"),
      create: (data) => request("/alerts/rules", { method: "POST", body: JSON.stringify(data) }),
      update: (id, data) => request(`/alerts/rules/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
      delete: (id) => request(`/alerts/rules/${id}`, { method: "DELETE" }),
    },
    events: (limit = 50) => request(`/alerts/events?limit=${limit}`),
    check: () => request("/alerts/check", { method: "POST" }),
  },
};
