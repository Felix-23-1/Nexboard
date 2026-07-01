# Nexboard

**Self-hosted homelab dashboard** — Fleet monitoring, AI model tracking, system deep-dive, and cost tracking in one place.

![Status](https://img.shields.io/badge/status-active-brightgreen)
![Stack](https://img.shields.io/badge/stack-FastAPI%20%2B%20React-blue)
![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## What it does

Nexboard replaces a dozen separate dashboards with a single self-hosted panel for your homelab:

- **Fleet Health** — CPU, RAM, Disk for all hosts at a glance with ring gauges and status dots
- **Live Event Feed** — automatic alerts when connectors go offline, disks fill up, TLS certs expire, or Systemd units fail — no click needed
- **System Deep-Dive** — per-host tab with CPU, memory breakdown, all mount points, GPU section, and Systemd failed units by name
- **Network View** — interfaces, IPs, listening ports, and RX/TX counters per host
- **AI Model Tracking** — monitor Ollama, vLLM, llama.cpp and OpenAI-compatible servers; see loaded models, VRAM usage, and credit balances
- **Cost Tracking** — monthly AI spend per provider with bar chart history
- **Modular Dashboard** — drag-and-drop widget layout, per-widget visibility toggle, persisted in localStorage
- **AI Chat** — built-in chat widget routed to any configured AI connector
- **Alert Engine** — background threshold checks with (upcoming) Discord and ntfy.sh push support

---

## Screenshots

> _Add screenshots here_

---

## Tech Stack

| Layer     | Technology                                      |
|-----------|-------------------------------------------------|
| Backend   | Python 3.11 · FastAPI · SQLAlchemy async · SQLite |
| Frontend  | React 18 · Vite · Tailwind CSS · Lucide Icons  |
| Auth      | JWT (HTTP-only cookie)                          |
| Deploy    | Docker Compose · nginx reverse proxy            |
| Design    | Glassmorphism · Amber `#F59E0B` accent · mesh gradient background |

---

## Connectors

Nexboard polls services over HTTP (or SSH for Linux hosts). Each connector is a self-contained Python class — easy to extend.

| Connector          | What it monitors |
|--------------------|-----------------|
| `linux_probe`      | Full host probe via SSH — CPU, RAM, disk, GPU, Systemd, network, security |
| `linux_ssh`        | Lightweight SSH ping + uptime |
| `ai_models`        | Ollama · vLLM · llama.cpp · OpenAI-compat servers + credit balance |
| `docker_connector` | Container status, unhealthy count |
| `proxmox`          | VM/CT list, node resources |
| `proxmox_backup`   | Backup jobs and status |
| `truenas`          | Pools, datasets, alerts |
| `unifi`            | Site overview, client count |
| `synology`         | DSM status, volumes |
| `pfsense`          | Firewall status, WAN IP |
| `hetzner`          | Cloud servers and their status |
| `netcup`           | VPS status |
| `cloudflare`       | Zone health, DNS |
| `grafana`          | Instance reachability |
| `uptime_kuma`      | Monitor status via API |
| `tls_monitor`      | Certificate expiry countdown |
| `wol`              | Wake-on-LAN trigger |
| `bookmarks`        | Custom service tile links |

---

## Project Structure

```
nexboard/
├── backend/
│   └── app/
│       ├── connectors/          # One folder per connector type
│       │   ├── base.py          # BaseConnector, ConnectorResult
│       │   └── <type>/
│       │       └── connector.py
│       ├── routers/             # FastAPI route handlers
│       │   ├── status.py        # /api/status/overview + /detailed
│       │   ├── connectors.py    # CRUD for connector configs
│       │   ├── ai.py            # AI chat proxy + model endpoints
│       │   └── alerts.py
│       ├── models.py            # SQLAlchemy models (ConnectorConfig, StatusSnapshot, …)
│       └── main.py
├── frontend/
│   └── src/
│       ├── pages/               # Dashboard, Sysadmin, LabSystem, LabNetwork, LabCosts, …
│       ├── components/          # AiChatWidget, ConnectorIcon, FleetPanel, EventFeed, …
│       └── api/client.js        # Typed fetch helpers
└── docker-compose.yml
```

---

## Getting Started

### Prerequisites

- Docker + Docker Compose v2
- A server or VM reachable on your LAN

### 1. Clone

```bash
git clone https://github.com/YOUR_USERNAME/nexboard.git
cd nexboard
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
SECRET_KEY=change-me-to-a-random-string
FIRST_USER_EMAIL=you@example.com
FIRST_USER_PASSWORD=changeme
```

### 3. Start

```bash
docker compose up -d --build
```

Nexboard is now running at `http://localhost` (or your server IP).

### 4. Add connectors

Open the **Connectors** page → **Add Connector** → pick a type, fill in host/URL and credentials → **Save**.

The dashboard auto-refreshes every 30 seconds.

---

## Adding a Custom Connector

1. Create `backend/app/connectors/<your_type>/connector.py`
2. Subclass `BaseConnector`, define `meta` and implement `fetch() → ConnectorResult`
3. Register in `backend/app/connectors/__init__.py`

```python
from ..base import BaseConnector, ConnectorMeta, ConnectorResult, ConnectorStatus

class MyConnector(BaseConnector):
    meta = ConnectorMeta(
        type="my_service",
        label="My Service",
        description="Monitors my service.",
        icon="server",
        config_schema={
            "host": {"type": "string", "label": "Host", "required": True},
            "api_key": {"type": "string", "label": "API Key", "secret": True},
        },
    )

    async def fetch(self) -> ConnectorResult:
        # ... HTTP call, return ConnectorResult(status=..., metrics={...})
```

No frontend changes needed — the connector form is generated automatically from `config_schema`.

---

## Architecture Notes

- **In-memory cache** in `status.py` — 60s TTL, overview timeout 8s, detailed timeout 25s
- **Secret field preservation** — PATCH endpoint never overwrites `secret: true` config fields with empty strings (safe to edit connectors without re-entering keys)
- **StatusSnapshot model** exists for time-series — history API at `GET /api/status/history/{connector_id}`
- **AI chat proxy** at `POST /api/ai/connector-chat` routes to Ollama or OpenAI-compatible endpoints

---

## Roadmap

- [ ] Mini-htop — top processes by CPU/RAM in Sysadmin
- [ ] Container log tailing — Docker `/logs` side drawer
- [ ] Push alerts — Discord webhook + ntfy.sh
- [ ] Built-in HTTP/TCP uptime monitoring (Uptime Kuma replacement)
- [ ] Prometheus `/metrics` endpoint — Nexboard as scrape target
- [ ] Deep GPU metrics — throttle reasons, memory bandwidth, clock speeds
- [ ] History charts — time-series graphs with Recharts

---

## License

MIT — do whatever you want, no warranty.
