#!/usr/bin/env bash
# Nightly backup of the SQLite file. Run via host cron, NOT inside the bot
# container — that way we get a consistent point-in-time copy via
# `sqlite3 .backup` without taking the bot offline.
#
# Suggested cron (Hetzner host):
#   30 3 * * *  /opt/sir/infra/backup.sh
set -euo pipefail

DATA_DIR="${SIR_DATA_DIR:-/opt/sir/data}"
BACKUP_DIR="${SIR_BACKUP_DIR:-/opt/sir/data/backups}"
DB_FILE="$DATA_DIR/sir.db"
KEEP_DAYS="${SIR_BACKUP_KEEP_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_FILE" ]]; then
  echo "no DB at $DB_FILE — skipping" >&2
  exit 0
fi

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
OUT="$BACKUP_DIR/sir-$STAMP.db"
sqlite3 "$DB_FILE" ".backup '$OUT'"
gzip -9 "$OUT"

# Prune old backups
find "$BACKUP_DIR" -name "sir-*.db.gz" -mtime "+$KEEP_DAYS" -delete

echo "backup written: ${OUT}.gz"
