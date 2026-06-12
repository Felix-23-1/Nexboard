# Nexboard – Entwicklungs-Roadmap

> Lebendiges Dokument. Wird nach jeder Session aktualisiert.
> Letztes Update: 2026-06-12 (Session 6)

---

## Aktueller Stand (Code-Analyse)

**Was fertig und funktionsfähig ist:**
- Auth/JWT + Setup-Wizard (erster Admin-User)
- Lizenz-System (kryptografisch signierte Keys, Offline-Validierung, Free/Pro)
- 7 Connectors: Proxmox VE, Docker, Uptime Kuma, TrueNAS, Unifi, Synology, pfSense
- Dashboard mit Drag & Drop Widget-Reihenfolge
- IT-Ansicht (Sysadmin) mit vollständigen Metriken
- Executive-Ansicht (Chef-View)
- KI-Analyse pro Connector (OpenAI / Anthropic / Ollama)
- Floating AI Help Desk Chat
- Alert-Engine mit 6 Kanal-Typen (Discord, Slack, Teams, Telegram, E-Mail, Webhook)
- User-Management mit Rollen (admin / viewer)
- Docker + docker-compose Setup

**Phase 1 abgeschlossen ✅**

---

## Phase 1 – Bugs & Features fertigstellen ✅ ABGESCHLOSSEN
*Ziel: Aus "lauffähig" wird "stabil und vollständig"*

### 🐛 Bugs

| # | Problem | Datei | Status |
|---|---------|-------|--------|
| B1 | CORS hardcoded auf `localhost` | `backend/app/main.py` | ✅ Erledigt |
| B2 | `/api/status/overview` fetcht sequenziell | `backend/app/routers/status.py` | ✅ Erledigt |
| B3 | Frontend API-URL | `frontend/src/api/client.js` | ✅ Kein Fix nötig |
| B4 | `ConnectorConfig.updated_at` onupdate | `backend/app/models.py` | ⏳ Niedrige Prio |
| B5 | nginx fehlte WebSocket-Support | `frontend/nginx.conf` | ✅ Erledigt |
| B6 | Docker Healthcheck crashte (curl fehlte) | `docker-compose.yml` | ✅ Erledigt |
| B7 | `setup.py` importierte gelöschten `LICENSE_SETTING_KEY` | `routers/setup.py` | ✅ Erledigt |

### ✅ Features

| # | Feature | Status |
|---|---------|--------|
| F1 | **History & Trends** (Pro) | ✅ Erledigt – StatusSnapshot + Endpoint + Frontend-Timeline |
| F2 | **Terminal Modal** | ✅ Fertig |
| F3 | **Proxmox VM-Aktionen** | ✅ Fertig |
| F4 | **Log-Analyse** | ✅ Läuft über KI-Chat-Bubble |
| F5 | **Setup-Wizard Network-Scan** | ⏳ Nice-to-have, spätere Phase |
| F6 | **Per-User Datenisolation** | ✅ Erledigt – jeder User hat eigene Connectors, Lizenz, Settings, Alerts |
| F7 | **Owner-Schutz** | ✅ Erledigt – user_id=1 kann nicht von anderen Admins verändert werden |
| F8 | **Rollen: Admin / Mitarbeiter** | ✅ Erledigt – Viewer umbenannt, Beschreibungen korrekt |

---

## Phase 2 – Neue Connectors ✅ ABGESCHLOSSEN

*Ziel: Connector-Bibliothek ausbauen, Community-Anreize schaffen*

### Connectors

| Connector | Status |
|-----------|--------|
| **Hetzner Cloud** | ✅ Backend + Frontend + Metrics-Renderer |
| **Grafana** | ✅ Backend + Frontend + Metrics-Renderer |
| **Linux SSH-Agent** | ✅ Backend + Frontend + SSH-Terminal + Metrics-Renderer (collapsible) |
| **Netcup** | ✅ Backend + Frontend + Metrics-Renderer |
| **Cloudflare** | ✅ Backend + Frontend + Metrics-Renderer |
| **Proxmox Backup Server** | ✅ Backend + Frontend + Metrics-Renderer |
| **Kubernetes** | ⏳ Phase 2b – für fortgeschrittene Nutzer |
| **Windows Server (WMI)** | ⏳ Phase 2b – KMU-Zielgruppe |

### SSH-Terminal (linux_ssh) ✅
- Schwebendes, verschiebbares Fenster (Portal → kein z-index-Konflikt mit Cards)
- z-index 9500, KI-Chat bei 9999 → beide immer erreichbar
- xterm.js mit FitAddon, Resize-Support
- asyncssh mit encoding=None + read(4096) → sofortiges Echo ohne Line-Buffering
- PTY-Modes: ECHO, ICANON, ICRNL, OPOST, ONLCR

### ConnectorMetrics ✅
- Alle 13 Connector-Typen haben eigene Renderer (kein raw JSON mehr)
- linux_ssh: collapsible (kompakte Kopfzeile mit CPU/RAM/Disk %, aufklappbar für Details)
- Status-API gibt jetzt sichere Config-Felder mit (host, username – ohne Passwörter)

### Connector bauen – Template
Jeder neue Connector braucht:
1. `backend/app/connectors/<name>/connector.py` – erbt von `BaseConnector`, implementiert `fetch()`
2. `backend/app/connectors/<name>/__init__.py` – registriert im Registry
3. Frontend: `TYPE_ICON` + `TYPE_LABEL` Eintrag in Dashboard.jsx + Sysadmin.jsx + `ConnectorPreview`-Block

---

## Phase 2b – Homelab-Features ✅ ABGESCHLOSSEN
*"Das Lab" – was andere Homelab-Dashboards (Homarr, Homepage, Dashy) nicht haben*

### Features

| Feature | Status |
|---------|--------|
| **Rename "IT-Ansicht" → "Das Lab"** | ✅ Sidebar + Seitenheader |
| **Service-Shortcuts** | ✅ "Öffnen"-Button auf Connector-Cards → direkt zur Web-UI |
| **Docker-Monitor mit Kontrolle** | ✅ Start / Stop / Restart direkt aus Das Lab (keine Portainer-Umweg) |
| **Script-Runner / SSH Quick-Commands** | ✅ Gespeicherte Bash-Befehle per Klick ausführen, Output inline |

### Technische Details

**Service-Shortcuts**
- `getServiceUrl(connector)` leitet URL aus `config.url` oder `config.host[:port]` ab
- `linux_ssh` Connectors werden ausgenommen (kein Web-UI)
- `ExternalLink`-Button erscheint nur wenn URL vorhanden

**Docker Container Controls** (`backend/app/routers/docker_ctrl.py`)
- `POST /api/docker/{connector_id}/containers/{container_id}/action`
- Body: `{"action": "start"|"stop"|"restart"}`
- Spricht Docker Engine API direkt an (kein docker-client Dependency)
- HTTP 204 = Erfolg, 304 = Container bereits im gewünschten Zustand

**Script-Runner** (`frontend/src/components/ScriptRunner.jsx`)
- Accordion-Section auf jedem `linux_ssh` Connector-Card
- Commands per localStorage gespeichert (key: `nb_scripts_{connectorId}`)
- Ausführung: `POST /api/ssh/{id}/execute` → asyncssh `conn.run()` (kein PTY, max 30s Timeout)
- Output: stdout (weiß) + stderr (rot) + exit code, inline im Accordion

---

## Phase 3 – Deployment & Docker-Setup ✅ ABGESCHLOSSEN

*Ziel: Mit einem Befehl deployen, auf echten Servern laufen*

| # | Aufgabe | Status |
|---|---------|--------|
| D1 | **Env-Vars in docker-compose** | ✅ `PORT`, `NEXBOARD_JWT_SECRET`, `CORS_ORIGINS` via `.env` |
| D2 | **Frontend Nginx-Config** | ✅ API-Proxy `/api/` → Backend + WebSocket + SPA-Fallback |
| D3 | **Healthchecks** | ✅ Backend (Python urllib) + Frontend (wget) |
| D4 | **Reverse Proxy Beispiel** | ✅ `docs/reverse-proxy.md` – NPM, Traefik v3, Caddy |
| D5 | **`.env.example`** | ✅ Dokumentiertes Template mit allen Variablen |
| D6 | **install.sh** | ✅ One-Shot-Installer mit ASCII-Art, Port-Detection, JWT-Generierung |
| D7 | **backup.sh** | ✅ Volume-Backup als tar.gz, letzte 7 Backups behalten |
| D8 | **update.sh** | ✅ Backup → Build → `docker compose up -d` → Healthcheck |

### Deployment-Kurzanleitung

```bash
# Klonen (wenn GitHub public)
git clone https://github.com/deinuser/nexboard.git
cd nexboard

# Installieren (prüft Docker, generiert JWT-Secret, startet alles)
bash install.sh

# Öffnen
http://localhost:8080
```

### Nächste Schritte vor GitHub-Launch
1. GitHub Repo anlegen + Code pushen
2. README.md mit Screenshot / GIF + Install-Anleitung
3. Reddit: r/homelab + r/selfhosted Post vorbereiten

---

## Phase 4 – UI verbessern

*Ziel: Polished, professionell, macht Spaß zu benutzen*

### UI-Verbesserungen

| # | Feature | Beschreibung |
|---|---------|--------------|
| U1 | **History-Charts** | Recharts-basierte Zeitreihen für CPU/RAM/Status-History (braucht Phase 1 F1) |
| U2 | **Mobile Responsive** | Dashboard und Sysadmin-View auf kleinen Bildschirmen nutzbar machen |
| U3 | **Connector-Config UI** | Dynamisches Formular aus `config_schema` – aktuell wahrscheinlich statische Felder |
| U4 | **Dark/Light Theme** | Toggle in Settings – aktuell nur Dark Mode |
| U5 | **Onboarding Flow** | Nach erstem Login: Connector hinzufügen → geführt durch Setup |
| U6 | **Alert-History Page** | Bessere Darstellung der `AlertEvent`-Tabelle mit Filtern |
| U7 | **Executive View** | Ausfeilen: Ampel-Status prominenter, druckbares PDF-Report |
| U8 | **Connector-Status-Badges** | Pulsierender Dot für "live" Online-Status |

---

## Phase 5 – Landing Page

*Ziel: nexboard.io live schalten, erste Nutzer gewinnen*

### Seiten-Struktur

| Seite | Inhalt |
|-------|--------|
| **/** | Hero: "Connect whatever you have." + Screenshot/Demo, CTA: GitHub / Docker Install |
| **/features** | Zwei Ansichten, Connector-System, KI-Analyse, Alert-System |
| **/pricing** | Free vs Pro Tabelle (9€/Mo, 79€/Jahr) |
| **/docs** | Installation, Connectors, API-Keys, Lizenz |

### Tech
- Astro oder reines HTML/Tailwind (kein React-Overhead nötig)
- Deployment: Cloudflare Pages (kostenlos, schnell)
- Domain: `nexboard.io` oder `nexboard.dev`

### Marketing-Strategie (parallel zur Entwicklung)
1. GitHub Repo public machen → README mit GIF/Screenshot
2. Reddit-Post auf r/homelab + r/selfhosted wenn Docker-Deploy stabil (Phase 3)
3. Screenshot-Thread auf X/Twitter
4. Produkthunt-Launch wenn Landing Page + stabile Version fertig

---

## Übersicht / Sprint-Plan

```
Phase 1  │ Bugs + Features fertig    │ ~2-3 Wochen
Phase 2  │ 2-3 neue Connectors       │ ~1-2 Wochen
Phase 3  │ Docker-Deploy stable      │ ~1 Woche
Phase 4  │ UI-Polish                 │ ~2 Wochen (parallel zu Phase 2/3)
Phase 5  │ Landing Page + Launch     │ ~1 Woche
```

**Erstes Ziel: Phase 1 + Phase 3 fertig → GitHub public + Reddit-Post**

---

## Entscheidungen / Offene Fragen

| Frage | Entscheidung |
|-------|--------------|
| Terminal-Feature: SSH-Backend bauen oder Feature raus? | ✅ **Beides** – Terminal bleibt, SSH-Backend wird gebaut |
| Hetzner als erster neuer Connector? | ✅ **Ja** |
| Domain? | ✅ **Vorerst lokal** – Domain-Kauf wenn Launch vorbereitet |
| Landing Page Tech? | ✅ **HTML + Tailwind CDN + vanilla JS** – einfach selbst editierbar |
| Stripe für Lizenz-Verkauf? | ✅ **Manuell** – Lizenz-Keys per Hand ausstellen |
| GitHub? | ✅ **Felix macht selbst** – kein Handlungsbedarf |

---

*Dieses Dokument wird nach jeder Arbeits-Session aktualisiert.*
