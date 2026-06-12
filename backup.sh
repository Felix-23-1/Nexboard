#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
#  Nexboard – Backup Script
#  Sichert das nexboard-data Volume (SQLite-DB + JWT-Secret).
#  Verwendung: bash backup.sh [zielverzeichnis]
#  Standard-Ziel: ./backups/
# ═══════════════════════════════════════════════════════════
set -e

CYAN="\033[36m"; GREEN="\033[32m"; BOLD="\033[1m"; RESET="\033[0m"
info()    { echo -e "${CYAN}▶ $*${RESET}"; }
success() { echo -e "${GREEN}✔ $*${RESET}"; }

cd "$(dirname "$0")"

BACKUP_DIR="${1:-./backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/nexboard-backup-${TIMESTAMP}.tar.gz"

info "Sichere nexboard-data Volume → ${BACKUP_FILE}…"

# Temporärer Alpine-Container mountet das Volume und erstellt ein tar.gz
docker run --rm \
  -v nexboard-data:/data:ro \
  -v "$(realpath "$BACKUP_DIR")":/backup \
  alpine \
  tar czf "/backup/nexboard-backup-${TIMESTAMP}.tar.gz" -C /data .

success "Backup erstellt: ${BOLD}${BACKUP_FILE}${RESET}"

# Alte Backups aufräumen – letzte 7 behalten
KEPT=7
COUNT=$(ls "$BACKUP_DIR"/nexboard-backup-*.tar.gz 2>/dev/null | wc -l)
if [ "$COUNT" -gt "$KEPT" ]; then
  ls -t "$BACKUP_DIR"/nexboard-backup-*.tar.gz | tail -n +"$((KEPT+1))" | xargs rm -f
  info "Alte Backups aufgeräumt (behalte letzte $KEPT)"
fi

echo ""
echo -e "  Wiederherstellen:"
echo -e "  ${BOLD}docker run --rm -v nexboard-data:/data -v \$(pwd)/backups:/backup alpine tar xzf /backup/$(basename "$BACKUP_FILE") -C /data${RESET}"
echo ""
