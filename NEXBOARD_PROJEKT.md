# Nexboard – Projektübersicht & Ziel

## Was ist Nexboard?
Nexboard ist ein self-hosted IT-Dashboard das als Docker Container installiert wird. Es verbindet sich mit allem was du bereits hast – egal welche Geräte, Server oder Services – und bringt alles in einer einzigen Oberfläche zusammen. Mit KI-gestützter Analyse erkennt Nexboard Fehler, erklärt was nicht stimmt und zeigt was zu tun ist. Keine Cloud-Abhängigkeit, keine Pflicht zu einem bestimmten Stack.

---

## Das Problem das wir lösen
IT-Teams und Homelab-Nutzer haben heute 5–10 verschiedene Admin-UIs gleichzeitig offen. Jedes Gerät, jeder Service hat seine eigene Oberfläche – auf verschiedenen Ports, mit verschiedenen Logins. Niemand hat eine saubere Gesamtübersicht. Der Chef weiß nicht was läuft. Der Sysadmin jongliert Tabs.

Nexboard ist die eine Oberfläche für alles – egal was du hast.

---

## Kernidee: Flexible Connectors
Nexboard funktioniert **nicht** nur mit einem fixen Stack. Nutzer binden ein was sie haben – über ein modulares Connector-System. Jeder Connector ist ein Modul das separat aktiviert und konfiguriert wird.

**Beispiele:**
- Homelab solo → Proxmox + TrueNAS + Unifi
- Kleines Büro → Windows Server + Synology + Fritzbox
- Dev-Team → Docker + Hetzner + Uptime Kuma
- Netzwerker → pfSense + Cisco Switch + Unifi

Nexboard passt sich dem Nutzer an – nicht umgekehrt.

---

## Zielgruppe

### Primär – Community
- Homelab-Enthusiasten (r/homelab, r/selfhosted)
- Solo-Sysadmins die ihre eigene Infrastruktur verwalten
- Leute die keine Lust auf YAML und komplexe Konfiguration haben

### Sekundär – Kleine Unternehmen / Teams
- Kleine IT-Teams (1–5 Personen)
- KMUs die Proxmox, Synology, Unifi oder ähnliches betreiben
- IT-Dienstleister die mehrere Kunden-Infrastrukturen verwalten
- Chefs/Manager die eine einfache Übersicht ohne technische Details wollen

---

## Zwei Ansichten – eine Oberfläche

### Chef-Ansicht (Executive View)
- Ampel-Status: Alles grün / Warnung / Kritisch
- Welche Services laufen, welche nicht
- Keine technischen Details – nur was wichtig ist
- Ideal für Geschäftsführer, Manager, Teamleiter

### IT-Ansicht (Sysadmin View)
- Vollständige Metriken: CPU, RAM, Disk, Netzwerk
- Log-Analyse mit KI-Erklärung
- Welcher Fehler, warum, was tun
- Alerts mit konkreten Handlungsempfehlungen

---

## Geschäftsmodell – Free vs Pro

### Free (kostenlos, für immer)
- Dashboard mit bis zu **3 Connectors**
- Basis-Statusanzeige (online / offline / Warnung)
- Proxmox, Docker, Uptime Kuma als erste kostenlose Connectors
- Community Support (GitHub, Discord)
- Für Einzelpersonen und zum Ausprobieren

### Pro (9€/Monat oder 79€/Jahr)
- **Unbegrenzte Connectors** – bind ein was du willst
- **KI-Analyse** – eigener API-Key (OpenAI / Claude / Ollama / lokal)
- **KI-Alerts** – KI erklärt den Fehler und gibt Handlungsempfehlungen
- **Log-Analyse** – KI liest Logs und fasst zusammen was nicht stimmt
- **Chef-Ansicht** – Executive Dashboard für nicht-technische Nutzer
- **Alert-System** – Benachrichtigungen via E-Mail, Webhook, Discord, Slack
- **History & Trends** – Verlauf und Langzeit-Metriken
- **Multi-User** – mehrere Nutzer mit verschiedenen Rollen (Admin / Viewer)
- **Setup-Wizard** – erkennt Services im Netzwerk automatisch

### Warum dieses Modell?
- Free ist echte nützliche Software, kein Marketing-Teaser
- Nutzer bringt eigenen AI-Key mit → keine API-Kosten für uns, kein Lock-in
- Pro richtet sich an Teams und Unternehmen die mehr als 3 Services haben
- Multi-User macht Pro für Firmen zum No-Brainer

---

## Connector-Bibliothek (geplant)

| Kategorie | Connectors |
|---|---|
| Virtualisierung | Proxmox VE, VMware ESXi, Hyper-V |
| Storage / NAS | TrueNAS, Synology, QNAP, Unraid |
| Netzwerk | Unifi, pfSense, OPNsense, Fritzbox, Cisco |
| Container | Docker, Portainer, Kubernetes |
| Monitoring | Uptime Kuma, Grafana, Zabbix |
| Cloud | Hetzner, Netcup, Cloudflare |
| Server / OS | Linux (SSH-Agent), Windows Server (WMI) |
| Sonstiges | Proxmox Backup Server, SMTP-Check, Custom API |

Neue Connectors können von der Community beigesteuert werden.

---

## Tech Stack

| Bereich | Technologie |
|---|---|
| Frontend | React + Tailwind CSS |
| Backend | Python FastAPI |
| Datenbank | SQLite (kein extra Setup nötig) |
| Container | Docker + docker-compose |
| AI-Integration | Nutzer-eigener API-Key (OpenAI / Claude / Ollama) |
| Connector-System | Plugin-Architektur – modulare Python-Module |
| Lizenz-System | Self-hosted License Key Validierung |

---

## Roadmap

### Monat 1 – Grundgerüst
- GitHub Repo aufsetzen (öffentlich)
- Docker Container + docker-compose Setup
- Connector-Architektur entwickeln (Plugin-System)
- Erste 3 Connectors: Proxmox, Docker, Uptime Kuma
- UI Grundgerüst (React + Tailwind)

### Monat 2 – Connectors & KI
- Weitere Connectors: TrueNAS, Unifi, Synology, pfSense
- AI-API Integration (eigener Key)
- KI-Alert System + Log-Analyse
- Chef-Ansicht (Executive Dashboard)
- Beta-Tester über Reddit (r/homelab, r/selfhosted)

### Monat 3 – Pro & Launch
- Multi-User System mit Rollen
- Alert-System (E-Mail, Discord, Slack)
- Lizenz-System für Pro
- Landing Page live schalten
- Setup-Wizard erste Version

### Monat 4+ – Community & Wachstum
- Community Connector-Beiträge ermöglichen (GitHub)
- Content auf X, Reddit, YouTube
- IT-Dienstleister als Zielgruppe ansprechen
- Feedback sammeln → Mobile App

---

## Monetarisierungs-Ziele

| Zeitraum | Ziel | Einnahmen |
|---|---|---|
| Monat 3 | 10 Pro-Nutzer | ~90€/Monat |
| Monat 6 | 60 Pro-Nutzer | ~540€/Monat |
| Jahr 1 | 250 Pro-Nutzer | ~2.250€/Monat |
| Zusatz | Affiliate Hardware-Links | variabel |

---

## Budget (50€ Startkapital)
- Domain (nexboard.io oder .dev): ~15€
- Erste Reddit-Werbung optional: ~35€
- API/Hosting Kosten: 0€ (läuft auf eigenem Homelab / Netcup)
- AI-Kosten: 0€ (Nutzer bringt eigenen Key mit)

---

## Wichtige Prinzipien
1. **Connector-first** – Nutzer bindet ein was er hat, kein Pflicht-Stack
2. **Self-hosted first** – volle Kontrolle, keine Cloud-Pflicht
3. **Kein AI-Lock-in** – OpenAI, Claude, Ollama oder eigenes Modell
4. **Docker-first** – Installation mit einem einzigen Befehl
5. **Community-driven** – Open Source Basis, Pro finanziert Entwicklung
6. **Zwei Zielgruppen, eine App** – Community UND kleine Unternehmen

---

## Positionierung in einem Satz
> *"Connect whatever you have. See everything in one place. Let AI explain what's wrong."*

---

## Aktueller Status
🟡 Neuausrichtung – Connector-Modell definiert, Entwicklung startet neu

---

*Dieses Dokument beschreibt den aktuellen Stand und Plan für Nexboard. Bei Fragen oder Änderungen bitte direkt ansprechen.*