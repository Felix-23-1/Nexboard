# Nexboard — Multitool Roadmap
> Ziel: Das einzige Homelab-Dashboard das du brauchst.
> Kombiniert Homepage (Service-Tiles, Widgets), homelab-monitor (GPU, AI, Systemd, Netzwerk, Security) und Nexboard (Auth, KI-Chat, SSH-Terminal, VM-Control, Alerts).

---

## ZIEL-DEFINITION (autonomous work target)

**Nexboard = Homepage + homelab-monitor + Nexboard in einer App.**

Ein eingeloggter User hat:
- Dashboard mit Service-Tiles, Live-Uhr, Stats, Suche (✅ fertig)
- GPU-Metriken per Server (VRAM, Auslastung, Temp, Power)
- AI-Model-Status (Ollama/vLLM: welches Modell läuft, wie viel VRAM, wer ruft es auf)
- Systemd-Service-Health pro Host (failed zuerst)
- Netzwerk-Übersicht (Interfaces, DNS, offene Ports mit Exposure-Flags)
- Security Posture (Firewall, SSH-Hardening, fail2ban, reboot-pending)
- Historische Charts pro Connector (CPU/RAM/VRAM über Zeit)
- Bookmark-Widget (Quick-Links zu Services)
- Multi-Host Switcher (zwischen SSH-Hosts wechseln)

**Nicht in Scope (für später):** Mobile App, i18n, Kubernetes, LAN-Scanner.

---

## ARCHITEKTUR (Stand heute)

```
backend/app/
├── connectors/
│   ├── base.py          # BaseConnector, ConnectorResult, ConnectorStatus
│   ├── registry.py      # register(type_id, cls)
│   ├── __init__.py      # imports + registry.register(...)
│   └── linux_ssh/       # Pattern für neue SSH-Connectoren
│       └── connector.py # asyncssh, inline Python probe via SSH
├── models.py            # StatusSnapshot (JSON metrics, schon vorhanden!)
├── routers/
│   └── status.py        # /api/status/detailed, /history/{id}
└── main.py              # FastAPI app, router registration
```

**Wichtige Patterns:**
- Neuer Connector = Subclass von `BaseConnector` + `fetch()` → `ConnectorResult`
- In `connectors/__init__.py` importieren + `registry.register()` aufrufen
- SSH-Probe = Python-Script als String, via `conn.run(script)`, gibt JSON zurück
- `StatusSnapshot.metrics` (JSON) speichert historische Daten → bereits in DB
- `StatusSnapshot` wird von `alerts/engine.py` beschrieben (Background-Task)

---

## PHASES

### Phase 1 — SSH Probe Foundation
**Ziel:** Ein einziger SSH-Call gibt alles zurück (GPU, Systemd, Netzwerk, Security).
**Datei:** `backend/app/connectors/linux_probe/probe_script.py` — der Probe-String

Der Probe läuft so:
```
ssh user@host python3 - <<'EOF'
# probe_script.py
import json, os, subprocess, ...
print(json.dumps({ gpu: {...}, systemd: [...], network: {...}, security: {...} }))
EOF
```

**Tasks:**
- [ ] `probe_script.py` schreiben — modularer Python-String mit Sektionen:
  - `collect_system()` — OS, Kernel, CPU, Uptime, Arch (erweitert linux_ssh)
  - `collect_gpu()` — nvidia-smi XML parse → VRAM used/total, util%, temp, power
  - `collect_systemd()` — systemctl list-units --failed + user-deployed units
  - `collect_network()` — /proc/net/dev, ip addr, /etc/resolv.conf, ss -tlnp
  - `collect_security()` — ufw/firewalld/nftables status, sshd_config, fail2ban, reboot-required

**Test:** `python3 probe_script.py` lokal ausführen (ohne SSH), Output validieren.

---

### Phase 2 — 3 Neue Connector-Typen

#### 2a: `linux_probe` Connector
Ersetzt/ergänzt `linux_ssh` mit vollem Datensatz in einem SSH-Call.

```python
# connector.py
class LinuxProbeConnector(BaseConnector):
    meta = ConnectorMeta(type="linux_probe", label="Linux Full-Probe", ...)
    
    async def fetch(self) -> ConnectorResult:
        # SSH connect, run probe_script, parse JSON
        # metrics enthält: system, gpu, systemd, network, security
        return ConnectorResult(status=..., metrics={...})
```

**Config:** host, port, username, ssh_key/password (identisch zu linux_ssh)

**Metrics-Output:**
```json
{
  "cpu_pct": 34.2, "mem_pct": 67.1, "disk_pct": 45.0,
  "gpu": { "available": true, "vram_used_mb": 8192, "vram_total_mb": 24576, "util_pct": 78, "temp_c": 72, "power_w": 180 },
  "systemd": { "total": 120, "running": 118, "failed": 2, "failed_units": ["myservice.service", "backup.service"] },
  "network": { "interfaces": [...], "open_ports_public": 3 },
  "security": { "firewall": "ufw-active", "ssh_root_login": false, "fail2ban": true, "reboot_required": false, "issues": [] }
}
```

**Test:** Unit-Test mit gemocktem SSH-Output (JSON fixture).

#### 2b: `ai_models` Connector
Pollt Ollama/vLLM/llama.cpp APIs — kein SSH, nur HTTP.

```python
class AIModelsConnector(BaseConnector):
    meta = ConnectorMeta(type="ai_models", label="AI Model Server", ...)
    # config: host (URL), type (ollama/vllm/llamacpp), port
    
    async def fetch(self) -> ConnectorResult:
        # GET /api/ps (Ollama) oder /v1/models (vLLM, llama.cpp)
        # Parse: welches Modell geladen, VRAM, status
```

**Config:** base_url, server_type (dropdown: ollama/vllm/llamacpp/auto)

> **Hinweis:** Felix selbst nutzt eine externe KI-API (kein lokales Ollama/vLLM).
> Der Connector ist für andere Nexboard-User gedacht.
> Felix hat auch keine NVIDIA GPU — GPU-Connector muss graceful degraden wenn nvidia-smi fehlt.

**Metrics:**
```json
{
  "server_type": "ollama",
  "models_loaded": [
    { "name": "llama3:8b", "vram_mb": 5500, "size_gb": 4.7 }
  ],
  "models_available": 12,
  "server_version": "0.3.1"
}
```

**Test:** Mock HTTP-Responses für Ollama `/api/ps` und OpenAI `/v1/models`.

#### 2c: `bookmark_group` Connector (kein Fetch, reine Anzeige)
Nicht wirklich ein Connector — eher ein Widget-Typ. Quick-Links Gruppe.

```python
class BookmarkGroupConnector(BaseConnector):
    # fetch() gibt immer ONLINE zurück, metrics = links-array
    meta = ConnectorMeta(type="bookmarks", label="Bookmark-Gruppe", ...)
```

**Config:** links (Array: name, url, icon, description)

---

### Phase 3 — History API erweitern

`StatusSnapshot` existiert schon. Neue Endpoints in `status.py`:

```python
@router.get("/history/{connector_id}/metrics")
async def get_metric_history(connector_id, metric_key: str, hours: int = 24):
    # Lädt StatusSnapshots, extrahiert metric_key aus metrics JSON
    # Downsampling: max 200 Datenpunkte, aggregiert wenn nötig
    return { "labels": [...timestamps...], "values": [...floats...] }
```

**Frontend:** Recharts LineChart-Komponente, eingebettet in Connector-Detail-Panel.

**Test:** DB-Fixture mit 1000 Snapshots, Endpoint gibt ≤200 Punkte zurück.

---

### Phase 4 — Frontend: Neue Tabs in "Das Lab" (Sysadmin)

Neue Tabs in `Sysadmin.jsx`:
- **GPU** — VRAM-Bar, Util/Temp/Power, VRAM-Timeline Chart
- **AI Models** — Model-Cards mit Name, VRAM, Status; "Idle" wenn ungeladen
- **Systemd** — Service-Liste, Failed zuerst, Unit + Status + Memory
- **Netzwerk** — Interface-Karten (IPv4/IPv6/MAC/Speed), DNS, offene Ports
- **Security** — Posture-Checklist: ✅ Firewall, ✅ SSH, ⚠️ fail2ban, usw.

**Neue Komponenten:**
- `GpuCard.jsx` — für linux_probe Connectors mit GPU-Daten
- `AIModelCard.jsx` — für ai_models Connector
- `SystemdList.jsx` — Tabelle mit Unit, Status, Memory
- `NetworkCard.jsx` — Interface + Port-Tabelle
- `SecurityPosture.jsx` — Checkliste mit Farb-Coding

**Neues Dashboard-Widget:**
- `BookmarkWidget.jsx` — Quick-Link-Grid auf Dashboard-Seite

---

### Phase 5 — Multi-Host Switcher

Sysadmin-Seite bekommt eine Host-Bar oben:
```
[ Alle ] [ server-01 ● ] [ nas-01 ● ] [ gpu-rig ⚠ ]
```

- Filtert alle linux_probe/linux_ssh Connectors als "Hosts"
- Klick → zeigt nur die Tabs dieses Hosts
- "Alle" → Aggregiert alle Hosts

**Frontend-only** — kein Backend-Change nötig.

---

### Phase 6 — Dashboard Widgets

#### Bookmark-Widget
- Neue Connector-Kategorie "Lesezeichen" auf Dashboard
- Tiles mit Icon + Name + URL (extern öffnen)

#### Wetter-Widget
- OpenWeatherMap API-Key in Settings
- Hero-Bereich: Temp + Icon + Stadt

---

## TEST-STRATEGIE

### Backend Tests (pytest + pytest-asyncio)

```
backend/tests/
├── connectors/
│   ├── test_linux_probe.py    # mock SSH output → assert metrics
│   ├── test_ai_models.py      # mock httpx responses → assert models
│   └── test_probe_script.py   # run probe_script locally → validate JSON schema
├── routers/
│   ├── test_status_history.py # DB fixture → downsampling correct
│   └── test_connectors.py     # CRUD endpoints
└── conftest.py                # async test client, test DB
```

**Test-Pattern für SSH-Connector:**
```python
@pytest.mark.asyncio
async def test_linux_probe_gpu_parsing():
    fake_output = json.dumps({
        "gpu": {"available": True, "vram_used_mb": 4096, ...}
    })
    with mock.patch("asyncssh.connect") as mock_ssh:
        mock_ssh.return_value.__aenter__.return_value.run.return_value.stdout = fake_output
        connector = LinuxProbeConnector(config={"host": "x", "username": "y", "password": "z"})
        result = await connector.fetch()
    assert result.metrics["gpu"]["vram_used_mb"] == 4096
    assert result.status == ConnectorStatus.ONLINE
```

### Frontend Tests
- Manuelle Smoke-Tests nach jedem Phase-Ende
- Chromium-Screenshot via Playwright (optional, Phase 6)

---

## ARBEITSREIHENFOLGE (für autonomes Arbeiten)

1. **Probe-Script** schreiben + lokal testen
2. **LinuxProbeConnector** implementieren + Unit-Test
3. **AIModelsConnector** implementieren + Unit-Test  
4. **History-API-Endpoint** + Test
5. **Frontend: GPU-Tab** in Sysadmin
6. **Frontend: AI-Models-Tab** in Sysadmin
7. **Frontend: Systemd-Tab** in Sysadmin
8. **Frontend: Netzwerk-Tab** in Sysadmin
9. **Frontend: Security-Tab** in Sysadmin
10. **Frontend: Recharts-History-Charts** in Connector-Detail
11. **Frontend: Host-Switcher** in Sysadmin
12. **Frontend: Bookmark-Widget** auf Dashboard
13. **Frontend: Wetter-Widget** (optional, braucht API-Key)

---

## DONE-KRITERIEN (Definition of Done pro Feature)

| Feature | Done wenn... |
|---|---|
| LinuxProbeConnector | Unit-Test grün, Connector erscheint in Registry, Dashboard zeigt GPU-Metriken |
| AIModelsConnector | Ollama-Test-Response wird korrekt geparsed, "Idle" bei ungeladenem Modell |
| History-API | Endpoint gibt ≤200 Punkte zurück, Downsampling korrekt bei >200 Snapshots |
| GPU-Tab | VRAM-Bar angezeigt, Temp und Power sichtbar |
| Systemd-Tab | Failed Units rot/oben, laufende Units grün |
| Netzwerk-Tab | Mindestens eth0/ens3 mit IP sichtbar, offene Ports gelistet |
| Security-Tab | Firewall-Status + SSH-Root-Login sichtbar, Issues hervorgehoben |
| Host-Switcher | Klick auf Host filtert Sysadmin-Tabs korrekt |
| Bookmark-Widget | Links öffnen extern, Tiles sehen aus wie Homepage-Style |

---

## NICHT ANFASSEN (außer Bug)

- `auth.py` / JWT-Logik
- `alerts/engine.py` — Background-Task-Loop
- `models.py` — DB-Schema (nur erweitern, nicht ändern)
- `Sidebar.jsx` — Navigation bleibt wie sie ist
- `index.css` — Design-Tokens bleiben stabil
