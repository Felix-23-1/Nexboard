#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  Nexboard – Installer
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
  error "Docker nicht gefunden. Installation: curl -fsSL https://get.docker.com | sh"
fi

if ! docker compose version &>/dev/null; then
  error "Docker Compose Plugin nicht gefunden. Installieren: sudo apt install docker-compose-plugin"
fi

DOCKER_V=$(docker --version | grep -oP '[\d]+\.[\d]+\.[\d]+' | head -1)
COMPOSE_V=$(docker compose version --short 2>/dev/null || echo "?")
success "Docker ${DOCKER_V} · Compose ${COMPOSE_V}"

# ── 2. Sicherstellen dass wir im Nexboard-Quellordner sind ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -f "docker-compose.yml" ]; then
  error "docker-compose.yml nicht gefunden. Bitte install.sh aus dem geklonten Nexboard-Ordner ausführen."
fi

success "Arbeitsverzeichnis: ${BOLD}$SCRIPT_DIR${RESET}"

# ── 3. .env anlegen ───────────────────────────────────────
if [ ! -f .env ]; then
  info "Erstelle .env…"

  # Freien Port finden (Standard 8080)
  PORT=8080
  while ss -tlnp 2>/dev/null | grep -q ":${PORT} " || lsof -i :"$PORT" &>/dev/null 2>&1; do
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

# ── 4. Docker Images bauen + starten ──────────────────────
info "Baue Docker Images (kann einige Minuten dauern)…"
docker compose build --quiet

info "Starte Nexboard…"
docker compose up -d

# ── 5. Warten bis healthy ─────────────────────────────────
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

# ── 6. IP ermitteln ───────────────────────────────────────
HOST_IP=$(hostname -I 2>/dev/null | awk '{print $1}')

# ── 7. Fertig ─────────────────────────────────────────────
echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════════${RESET}"
echo -e "${GREEN}${BOLD}  Nexboard läuft! 🚀${RESET}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════════${RESET}"
echo ""
echo -e "  Lokal:      ${BOLD}http://localhost:${PORT}${RESET}"
[ -n "$HOST_IP" ] && echo -e "  Im Netzwerk: ${BOLD}http://${HOST_IP}:${PORT}${RESET}"
echo ""
echo -e "  Logs:       ${BOLD}docker compose logs -f${RESET}"
echo -e "  Stoppen:    ${BOLD}docker compose down${RESET}"
echo -e "  Update:     ${BOLD}bash update.sh${RESET}"
echo ""
echo -e "  Beim ersten Aufruf startet der Setup-Assistent."
echo ""
