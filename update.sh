#!/usr/bin/env bash
# ═══════════════════════════════════════════
#  Nexboard – Update Script
#  Verwendung: bash update.sh
# ═══════════════════════════════════════════
set -e

CYAN="\033[36m"; GREEN="\033[32m"; YELLOW="\033[33m"; BOLD="\033[1m"; RESET="\033[0m"
info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✔ $*${RESET}"; }
warn()    { echo -e "${YELLOW}⚠ $*${RESET}"; }

cd "$(dirname "$0")"

info "Erstelle Daten-Backup vor dem Update…"
bash backup.sh 2>/dev/null && success "Backup erstellt" || warn "Backup fehlgeschlagen – Update trotzdem fortfahren"

info "Baue neue Images…"
docker compose build --quiet

info "Starte Container neu (Zero-Downtime soweit möglich)…"
docker compose up -d --remove-orphans

info "Warte auf Healthcheck…"
sleep 5
STATUS=$(docker inspect --format='{{.State.Health.Status}}' nexboard-backend 2>/dev/null || echo "unknown")
if [ "$STATUS" = "healthy" ]; then
  success "Nexboard läuft – Update erfolgreich"
else
  warn "Status: $STATUS – prüfe: docker logs nexboard-backend"
fi

info "Ungenutzte Images aufräumen…"
docker image prune -f --filter "label=com.docker.compose.project=nexboard" 2>/dev/null || true

echo ""
success "Update abgeschlossen!"
