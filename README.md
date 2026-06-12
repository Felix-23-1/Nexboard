<div align="center">

# Nexboard

**A self-hosted homelab dashboard that actually gives you control.**

[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/get-docker/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Self-Hosted](https://img.shields.io/badge/Self--Hosted-yes-orange)](https://github.com/awesome-selfhosted/awesome-selfhosted)

<!-- Add a screenshot here once you have one -->
<!-- ![Nexboard Screenshot](docs/screenshot.png) -->

</div>

---

## What is Nexboard?

Nexboard is a homelab dashboard built for people who actually want to **do things**, not just look at them.

Most homelab dashboards (Homarr, Homepage, Dashy) are great bookmark managers. Nexboard goes further:

- 🖥️ **SSH directly in the browser** — xterm.js terminal, no PuTTY needed
- 🐳 **Start / Stop / Restart Docker containers** with one click
- ⚡ **Run bash scripts** on your Linux servers from the dashboard
- 📊 **Real metrics** from Proxmox, TrueNAS, pfSense, Unifi and more
- 🔔 **Alerting** to Discord, Telegram, Slack, E-Mail and more
- 🤖 **AI analysis** of your infrastructure (OpenAI / Anthropic / Ollama)

Everything runs **100% locally**. No cloud, no phone-home, no subscriptions for the core features.

---

## Features

### 🔌 Connectors (13 supported)
| Service | Metrics | Control |
|---------|---------|---------|
| Proxmox VE | Nodes, VMs, RAM/CPU | Start / Stop / Reboot VMs, noVNC Console |
| Docker | Containers, health | **Start / Stop / Restart containers** |
| Linux Server (SSH) | CPU, RAM, Disk, Load | **SSH Terminal + Script Runner** |
| Uptime Kuma | Monitors, ping | — |
| TrueNAS | Pools, disks | — |
| Unifi | Devices, clients, APs | — |
| Synology NAS | Volumes, usage | — |
| pfSense | CPU, gateways, interfaces | — |
| Hetzner Cloud | Servers, IPs, volumes | — |
| Proxmox Backup Server | Datastores, usage | — |
| Cloudflare | Zones, tunnels | — |
| Grafana | Dashboards, datasources, alerts | — |
| Netcup | Servers | — |

### 🧰 Das Lab (Sysadmin View)
- Full metrics for all connectors in one view
- **Service Shortcuts** — one-click to open the web UI of any service
- **Docker Monitor** — start/stop/restart containers without Portainer
- **SSH Terminal** — floating, draggable xterm.js terminal
- **Script Runner** — save bash snippets per server, run with one click, see output inline
- Drag & drop widget reordering
- **History & Trends** — 24h status timeline per connector *(Pro)*

### 📊 Dashboard
- Live status overview with color-coded health indicators
- Drag & drop widget layout (saved per user)
- AI analysis per connector *(Pro)*

### 👔 Executive View
- Clean traffic-light status for non-technical users

### 🔔 Alert Engine
- 6 alert channels: Discord, Slack, Teams, Telegram, E-Mail, Webhook
- Rule-based: alert when connector goes offline / status changes

### 🔐 Multi-User
- Admin / Viewer roles
- Per-user data isolation — every user manages their own connectors
- JWT authentication

---

## Quick Start

**Requires:** Docker + Docker Compose Plugin (v2)

```bash
git clone https://github.com/Felix-23-1/nexboard.git
cd nexboard
bash install.sh
```

The installer will:
1. Check that Docker is available
2. Auto-detect a free port (default: 8080)
3. Generate a secure JWT secret
4. Build and start the containers
5. Wait for the health check to pass

Then open **http://localhost:8080** — the setup wizard will guide you through creating your admin account.

### Manual setup

```bash
cp .env.example .env
# Edit .env if needed (port, JWT secret)
docker compose up -d
```

---

## Update

```bash
bash update.sh
```

Automatically creates a backup, rebuilds the images and restarts the containers.

## Backup

```bash
bash backup.sh
# Creates: ./backups/nexboard-backup-YYYYMMDD_HHMMSS.tar.gz
# Keeps last 7 backups automatically
```

---

## HTTPS / Custom Domain

See **[docs/reverse-proxy.md](docs/reverse-proxy.md)** for setup guides with:
- **Nginx Proxy Manager** (easiest, recommended for beginners)
- **Traefik v3** (for advanced setups)
- **Caddy** (simplest TLS config)

---

## Configuration

All configuration is done via `.env` (copy from `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Host port Nexboard listens on |
| `NEXBOARD_JWT_SECRET` | auto-generated | JWT signing secret — set a fixed value to keep sessions after rebuilds |
| `CORS_ORIGINS` | *(empty)* | Only needed if accessing the API directly without nginx |

---

## AI Analysis (optional)

Nexboard can analyze your infrastructure with AI. Configure under **Settings → AI**:

- **OpenAI** — GPT-4o / GPT-4o-mini
- **Anthropic** — Claude
- **Ollama** — local models (Llama 3, Mistral, etc.) — 100% offline

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, Vite, Tailwind CSS, xterm.js |
| Backend | FastAPI (Python 3.12), SQLAlchemy, aiosqlite |
| Database | SQLite (zero-dependency, file-based) |
| Auth | JWT (PyJWT + bcrypt) |
| SSH | asyncssh |
| Deployment | Docker + nginx |

---

## Why not just use Homarr / Homepage / Dashy?

Those are great tools if you want a **bookmark page with widgets**.

Nexboard is for the homelab user who wants to **actually manage their infrastructure** from a single tab — open a terminal, restart a container, run a script, check if that backup finished — without switching between 5 different web UIs.

---

## Roadmap

- [ ] Kubernetes connector
- [ ] Windows Server (WMI) connector
- [ ] Wake-on-LAN
- [ ] TLS certificate expiry monitor
- [ ] Mobile responsive layout
- [ ] Docker image update checker
- [ ] Landing page + public release

---

## Contributing

Issues and PRs welcome. The codebase is straightforward:

```
nexboard/
├── backend/          # FastAPI app
│   └── app/
│       ├── connectors/   # One folder per connector type
│       ├── routers/      # API endpoints
│       └── models.py     # SQLAlchemy models
├── frontend/         # React app
│   └── src/
│       ├── components/   # Reusable UI components
│       └── pages/        # Route pages
├── docker-compose.yml
├── install.sh
└── .env.example
```

Adding a new connector is straightforward — see any existing connector in `backend/app/connectors/` as a template.

---

## License

MIT — do whatever you want with it.

---

<div align="center">
Made with ☕ for the homelab community
</div>
