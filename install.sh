#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  Nexboard – One-Shot Installer
#  Verwendung: bash install.sh
#  Voraussetzungen: Docker + Docker Compose Plugin
# ═══════════════════════════════════════════════════════════
set -e

BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✔ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }
error()   { echo -e "${RED}✖ $*${RESET}"; exit 1; }

echo -e "${BOLD}"
echo "  ███╗   ██╗███████╗██╗  ██╗██████╗  ██████╗  █████╗ ██████╗ ██████╗ "
echo "  ████╗  ██║██╔════╝╚██╗██╔╝██╔══██╗██╔═══██╗██╔══██╗██╔══██╗██╔══██╗"
echo "  ██╔██╗ ██║█████╗   ╚███╔╝ ██████╔╝██║   ██║███████║██████╔╝██║  ██║"
echo "  ██║╚██╗██║██╔══╝   ██╔██╗ ██╔══██╗██║   ██║██╔══██║██╔══██╗██║  ██║"
echo "  ██║ ╚████║███████╗██╔╝ ██╗██████╔╝╚██████╔╝██║  ██║██║  ██║██████╔╝"
echo "  ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═════╝ "
echo -e "${RESET}"
echo -e "${BOLD}  Homelab Dashboard – Installer${RESET}"
echo ""

# ── 1. Voraussetzungen prüfen ──────────────────────────────
info "Prüfe Voraussetzungen…"

if ! command -v docker &>/dev/null; then
  error "Docker nicht gefunden. Installation: https://docs.docker.com/get-docker/"
fi

if ! docker compose version &>/dev/null; then
  error "Docker Compose Plugin nicht gefunden. Bitte Docker aktualisieren (v2.0+)."
fi

DOCKER_V=$(docker --version | grep -oP '[\d]+\.[\d]+\.[\d]+' | head -1)
COMPOSE_V=$(docker compose version --short 2>/dev/null || echo "?")
success "Docker ${DOCKER_V} · Compose ${COMPOSE_V}"

# ── 2. Installationsverzeichnis ────────────────────────────
INSTALL_DIR="${1:-$(pwd)/nexboard}"

if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/docker-compose.yml" ]; then
  warn "Nexboard scheint bereits installiert zu sein unter: $INSTALL_DIR"
  read -rp "  Trotzdem fortfahren? [j/N] " confirm
  [[ "$confirm" =~ ^[jJyY]$ ]] || { echo "Abgebrochen."; exit 0; }
fi

info "Installationsverzeichnis: ${BOLD}$INSTALL_DIR${RESET}"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# ── 3. Dateien herunterladen oder kopieren ─────────────────
# Wenn das Skript aus dem Nexboard-Verzeichnis ausgeführt wird,
# direkt verwenden. Sonst von GitHub laden (wenn Repo public ist).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ -f "$SCRIPT_DIR/docker-compose.yml" ] && [ "$SCRIPT_DIR" != "$INSTALL_DIR" ]; then
  info "Kopiere Dateien aus Quellverzeichnis…"
  cp "$SCRIPT_DIR/docker-compose.yml" .
  cp -r "$SCRIPT_DIR/backend" .
  cp -r "$SCRIPT_DIR/frontend" .
  [ -f "$SCRIPT_DIR/.env.example" ] && cp "$SCRIPT_DIR/.env.example" .
  success "Dateien kopiert"
elif [ -f "$SCRIPT_DIR/docker-compose.yml" ] && [ "$SCRIPT_DIR" = "$INSTALL_DIR" ]; then
  success "Dateien bereits vorhanden"
else
  error "Bitte install.sh aus dem Nexboard-Quellverzeichnis ausführen."
fi

# ── 4. .env anlegen ───────────────────────────────────────
if [ ! -f .env ]; then
  info "Erstelle .env…"

  # Freien Port finden (Standard 8080, sonst nächsten)
  PORT=8080
  while lsof -i :"$PORT" &>/dev/null 2>&1; do
    PORT=$((PORT + 1))
  done

  # JWT-Secret generieren
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || python3 -c "import secrets; print(secrets.token_hex(32))")

  cat > .env <<ENV
# Nexboard – automatisch generiert durch install.sh
PORT=${PORT}
NEXBOARD_JWT_SECRET=${JWT_SECRET}
CORS_ORIGINS=
ENV

  success ".env erstellt (Port: ${PORT})"
else
  warn ".env existiert bereits – wird nicht überschrieben"
  PORT=$(grep -oP '(?<=^PORT=)\d+' .env 2>/dev/null || echo "8080")
fi

# ── 5. Docker Images bauen + starten ──────────────────────
info "Baue Docker Images (kann einige Minuten dauern)…"
docker compose build --quiet

info "Starte Nexboard…"
docker compose up -d

# ── 6. Warten bis healthy ─────────────────────────────────
info "Warte auf Backend-Healthcheck…"
TRIES=0
MAX=30
until docker inspect --format='{{.State.Health.Status}}' nexboard-backend 2>/dev/null | grep -q "healthy"; do
  TRIES=$((TRIES + 1))
  [ $TRIES -ge $MAX ] && { warn "Healthcheck timeout – prüfe: docker logs nexboard-backend"; break; }
  sleep 3
  echo -n "."
done
echo ""

# ── 7. Fertig ─────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  Nexboard läuft! 🚀${RESET}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════${RESET}"
echo ""
echo -e "  URL:        ${BOLD}http://localhost:${PORT}${RESET}"
echo -e "  Daten:      ${BOLD}Docker Volume: nexboard-data${RESET}"
echo -e "  Logs:       ${BOLD}docker compose logs -f${RESET}"
echo -e "  Stoppen:    ${BOLD}docker compose down${RESET}"
echo -e "  Update:     ${BOLD}bash update.sh${RESET}"
echo ""
echo -e "  Beim ersten Aufruf startet der Setup-Assistent."
echo ""
