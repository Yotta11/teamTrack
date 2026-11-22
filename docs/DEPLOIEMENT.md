# Guide de déploiement et d'exploitation

## Environnements

| Environnement | Branche | Déploiement | Usage |
| --- | --- | --- | --- |
| Développement | `feature/*` | Poste local (Docker Compose ou Node + PostgreSQL) | Développement |
| Préproduction | `develop` | Automatique après chaque fusion | Tests, démonstration, recette (comptes de démo visibles) |
| Production | `main` | Après validation manuelle dans GitHub | Utilisateurs réels |

## Architecture

```
Navigateur ──HTTPS──> Nginx (VPS, TLS Let's Encrypt)
                          │
                          ▼  127.0.0.1:8080
                 ┌──────────────────┐
                 │ web (Nginx)      │  fichiers React + proxy /api
                 └────────┬─────────┘
                          ▼  api:4000
                 ┌──────────────────┐
                 │ api (Node/Express)│  migrations au démarrage, planificateur horaire
                 └────────┬─────────┘
                          ▼  db:5432
                 ┌──────────────────┐
                 │ db (PostgreSQL)  │  volume db-data
                 └──────────────────┘
```

## Première installation sur un VPS Ubuntu

```bash
# 1. Paquets et pare-feu
sudo apt update && sudo apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

# 2. Code et configuration
sudo mkdir -p /opt/teamtrack && sudo chown $USER /opt/teamtrack
git clone https://github.com/<organisation>/teamtrack.git /opt/teamtrack
cd /opt/teamtrack
cp .env.example .env
nano .env   # POSTGRES_PASSWORD, JWT_SECRET (openssl rand -hex 48), APP_URL, SMTP_*

# 3. Lancement
docker compose up -d --build
docker compose ps                      # les trois services doivent être « healthy »
curl http://127.0.0.1:8080/health

# 4. Premier compte administrateur
docker compose exec -e ADMIN_EMAIL=rh@votre-domaine.com -e ADMIN_PASSWORD='MotDePasse@2026' \
  -e ADMIN_FIRST_NAME=Prénom -e ADMIN_LAST_NAME=Nom api npm run create-admin:prod
# (préproduction uniquement) données de démonstration :
docker compose exec api npm run seed:prod

# 5. HTTPS
sudo cp deploy/nginx-teamtrack.conf /etc/nginx/sites-available/teamtrack
sudo ln -s /etc/nginx/sites-available/teamtrack /etc/nginx/sites-enabled/
sudo certbot --nginx -d teamtrack.votre-domaine.com
sudo nginx -t && sudo systemctl reload nginx
```

L'administrateur crée ensuite les comptes depuis l'écran **Administration** (ou par import CSV).

## Variables d'environnement

| Variable | Obligatoire | Description |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | oui | Mot de passe de la base |
| `JWT_SECRET` | oui | Secret de signature des jetons (48 octets aléatoires minimum) |
| `APP_URL` | oui | URL publique, utilisée dans les e-mails et pour CORS |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | non | Envoi des e-mails ; sans SMTP, ils sont écrits dans les journaux |
| `VITE_SHOW_DEMO` | non | `true` pour afficher les comptes de démonstration (préproduction) |
| `API_RATE_LIMIT` | non | Requêtes par IP et par 15 min (1 500 par défaut) |
| `REGISTRY`, `TAG` | CI | Registre et version des images publiées |

Les secrets ne sont jamais versionnés : `.env` est ignoré par Git, et la CI utilise les *GitHub Secrets* (`STAGING_HOST`, `STAGING_USER`, `STAGING_SSH_KEY`, `PROD_HOST`, `PROD_USER`, `PROD_SSH_KEY`) et les variables `STAGING_URL`, `PROD_URL`.

## Pipeline CI/CD

Fichier : `.github/workflows/ci.yml`

1. **Build** : installation des dépendances et compilation (API et front).
2. **Lint** : ESLint (API), Oxlint (front).
3. **Tests** : tests unitaires et d'intégration avec une base PostgreSQL de service ; seuil de couverture de 70 %.
4. **Sécurité** : `npm audit --audit-level=critical`.
5. **Images Docker** : construites et publiées sur GHCR à chaque fusion sur `develop` ou `main`, étiquetées par SHA de commit.
6. **Préproduction** : déploiement SSH automatique depuis `develop`, puis test de fumée sur `/health`.
7. **Production** : depuis `main`, après approbation dans l'environnement GitHub `production`.

Configurer dans GitHub : *Settings > Environments > production > Required reviewers*, et protéger `main` (pull request et CI obligatoires).

## Déploiement et retour arrière

```bash
TAG=<sha-du-commit> ./deploy/deploy.sh
```

Le script récupère les images, redémarre l'API (les migrations s'appliquent au démarrage) et vérifie `/health` pendant une minute. En cas d'échec, il restaure automatiquement la version précédente. Les deux dernières versions d'images restent disponibles dans le registre pour un retour manuel : `TAG=<sha-précédent> ./deploy/deploy.sh`.

## Sauvegardes

```bash
# Sauvegarde quotidienne à 2 h, conservation 30 jours
crontab -e
0 2 * * * /opt/teamtrack/deploy/backup.sh >> /var/log/teamtrack-backup.log 2>&1

# Test de restauration mensuel (en préproduction)
./deploy/restore.sh backups/teamtrack-AAAAMMJJ-0200.sql.gz
```

Les pièces jointes et documents sont dans le volume Docker `uploads` : l'inclure dans la sauvegarde du serveur (`docker run --rm -v teamtrack_uploads:/data -v $PWD/backups:/b alpine tar czf /b/uploads-$(date +%F).tgz /data`).

## Supervision

- `GET /health` : état de l'API et de la base (utilisé par Docker, la CI et un service externe comme UptimeRobot).
- Journaux : `docker compose logs -f api` (format *combined* en production).
- Planificateur horaire intégré à l'API : alertes d'échéance (F-28), escalade des difficultés non traitées sous 3 jours (F-31), démarrage et fin automatiques des stages.

## Maintenance

- Mises à jour de sécurité mensuelles : `npm audit`, mise à jour des images de base, `sudo apt upgrade`.
- Correctif urgent : branche `hotfix/nom` depuis `main`, pull request vers `main` puis report sur `develop`.
- Test de charge avant mise en production : `k6 run -e BASE_URL=https://preprod… tests-load/k6-api.js` (augmenter temporairement `API_RATE_LIMIT`, car toutes les requêtes viennent de la même adresse IP).
