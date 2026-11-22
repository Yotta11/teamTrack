#!/usr/bin/env bash
# Déploiement avec contrôle de santé et retour arrière automatique (section 12).
# Usage : TAG=<sha> ./deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."
NEW_TAG=${TAG:?Indiquez TAG}
PREV_TAG=$(grep -E '^TAG=' .env | cut -d= -f2 || echo latest)

echo "Déploiement de $NEW_TAG (version précédente : $PREV_TAG)"
sed -i "s/^TAG=.*/TAG=$NEW_TAG/" .env
docker compose pull api web
docker compose up -d api web   # les migrations s'appliquent au démarrage de l'API

for i in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:${WEB_PORT:-8080}/health >/dev/null; then
    echo "Contrôle de santé OK"
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done

echo "Échec du contrôle de santé : retour à $PREV_TAG"
sed -i "s/^TAG=.*/TAG=$PREV_TAG/" .env
docker compose up -d api web
exit 1
