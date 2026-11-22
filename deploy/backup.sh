#!/usr/bin/env bash
# Sauvegarde quotidienne de la base (section 12) — conservation 30 jours.
# Crontab : 0 2 * * * /opt/teamtrack/deploy/backup.sh >> /var/log/teamtrack-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
DIR=${BACKUP_DIR:-/opt/teamtrack/backups}
mkdir -p "$DIR"
FILE="$DIR/teamtrack-$(date +%Y%m%d-%H%M).sql.gz"
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner | gzip > "$FILE"
find "$DIR" -name 'teamtrack-*.sql.gz' -mtime +30 -delete
echo "$(date -Is) sauvegarde OK : $FILE ($(du -h "$FILE" | cut -f1))"
