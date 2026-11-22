#!/usr/bin/env bash
# Restauration d'une sauvegarde (test mensuel recommandé sur la préproduction).
# Usage : ./deploy/restore.sh backups/teamtrack-20261121-0200.sql.gz
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
[ -f "$1" ] || { echo "Fichier introuvable : $1"; exit 1; }
read -r -p "Remplacer la base $POSTGRES_DB par $1 ? (oui/non) " ok
[ "$ok" = "oui" ] || exit 1
docker compose stop api
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
gunzip -c "$1" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose start api
echo "Restauration terminée."
