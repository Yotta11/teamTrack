# API REST TeamTrack

Base : `/api` · Format : JSON (clés en camelCase) · Authentification : `Authorization: Bearer <jeton d'accès>`

## Conventions

- **Jeton d'accès** JWT HS256 valable 15 minutes, renvoyé par `/auth/login` et `/auth/refresh`.
- **Jeton de rafraîchissement** opaque, valable 7 jours, stocké haché en base et transmis dans le cookie `tt_refresh` (httpOnly, SameSite=Strict, chemin `/api/auth`). Il est à usage unique (rotation à chaque renouvellement).
- **Anti-CSRF** : `/auth/refresh` exige l'en-tête `X-Requested-With: TeamTrack`.
- **Erreurs** : `{ "error": { "message": "…", "code": "…", "fields"?: {…}, "details"?: {…} } }`

| Code HTTP | Code | Signification |
| --- | --- | --- |
| 400 | `VALIDATION` | Données invalides (`fields` détaille chaque champ) |
| 400 | `RG-01` … `RG-05` | Règle de gestion non respectée |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` | Non authentifié, identifiants incorrects |
| 403 | `FORBIDDEN`, `INACTIVE`, `CSRF` | Droits insuffisants, compte désactivé |
| 404 | `NOT_FOUND` | Ressource absente ou hors de votre périmètre (RG-08) |
| 409 | `DUPLICATE`, `WIP_EXCEEDED`, `RG-10`, `TUTOR_HAS_INTERNSHIPS` | Conflit |
| 423 | `LOCKED` | Compte bloqué 15 min après 5 échecs |
| 429 | `RATE_LIMIT` | Trop de requêtes |

## Authentification et profil

| Méthode | Route | Rôles | Description |
| --- | --- | --- | --- |
| POST | `/auth/login` | public | `{ email, password }` → `{ accessToken, user }` + cookie |
| POST | `/auth/refresh` | cookie | Nouveau jeton d'accès (rotation du cookie) |
| POST | `/auth/logout` | cookie | Révoque le jeton de rafraîchissement |
| POST | `/auth/forgot-password` | public | `{ email }` → e-mail avec lien valable 30 min (réponse identique si le compte n'existe pas) |
| POST | `/auth/reset-password` | public | `{ token, password }` |
| GET | `/auth/me` | tous | Profil + équipes |
| PUT | `/auth/me` | tous | `{ firstName, lastName, phone, jobTitle, skills[] }` |
| POST | `/auth/me/avatar` | tous | multipart `avatar` (PNG, JPEG, WebP, 2 Mo) |
| POST | `/auth/me/password` | tous | `{ currentPassword, newPassword }` |

Politique de mot de passe : 8 caractères minimum, majuscule, minuscule, chiffre et caractère spécial.

## Personnel, départements, équipes

| Méthode | Route | Rôles | Description |
| --- | --- | --- | --- |
| GET | `/users` | tous* | Filtres : `search`, `role`, `teamId`, `departmentId`, `status=active\|inactive`, `internFrom`, `internTo` |
| GET | `/users/:id` | périmètre | Fiche + équipes + stages |
| POST | `/users` | admin | Création ; renvoie `temporaryPassword` si aucun mot de passe fourni |
| PUT | `/users/:id` | admin | Modification (changement de rôle audité) |
| PATCH | `/users/:id/status` | admin | `{ active }` (RG-07 : jamais de suppression) |
| PATCH | `/users/:id/wip-limit` | admin, tuteur | `{ wipLimit }` (RG-09) |
| POST | `/users/:id/reset-password` | admin | Mot de passe provisoire |
| POST | `/users/import` | admin | multipart `file` CSV : `prenom;nom;email;role;poste;departement;equipe` |
| GET / POST | `/departments` | tous / admin | |
| PUT / DELETE | `/departments/:id` | admin | Suppression refusée si utilisé |
| GET | `/teams` | tous | `?mine=true` pour ses équipes |
| GET | `/teams/:id` | tous | Membres + `canManage` |
| POST / PUT | `/teams`, `/teams/:id` | admin | `{ name, description, leadId, departmentId, memberIds[] }` |
| POST / DELETE | `/teams/:id/members[/:userId]` | admin | |
| PATCH | `/teams/:id/wip` | admin, chef | `{ inProgress, review }` limites par colonne |

\* Employés et stagiaires ne voient que les membres de leurs équipes et leur tuteur.

## Stages et évaluations

| Méthode | Route | Rôles | Description |
| --- | --- | --- | --- |
| GET | `/internships` | périmètre | Filtres `status`, `search` |
| GET | `/internships/:id` | périmètre | Détail, historique, documents, transitions autorisées |
| GET | `/internships/:id/summary` | périmètre | Bilan automatique (F-34) |
| POST | `/internships` | admin, tuteur | `{ internId, tutorId, school, subject, objectives, startDate, endDate }` (RG-01) |
| PUT | `/internships/:id` | tuteur référent, admin | |
| PATCH | `/internships/:id/status` | tuteur, délégué, admin | `{ status, note }` — transitions contrôlées |
| POST / DELETE | `/internships/:id/delegate` | tuteur référent, admin | `{ delegateId, until }` (F-11) |
| POST | `/internships/:id/documents` | périmètre | multipart `file` + `kind` (convention, attestation, rapport, autre) |
| GET / DELETE | `/internships/:id/documents/:docId` | périmètre | Téléchargement authentifié |
| GET | `/evaluations?internshipId=` | périmètre | |
| POST | `/evaluations` | tuteur, délégué, admin | 5 critères de 1 à 5 + commentaire |

## Tâches et Kanban

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/tasks` | Filtres : `teamId`, `sprintId` (ou `none`), `status`, `backlog=true\|all`, `priority`, `assigneeId`, `mine`, `label`, `search`, `due=overdue\|soon\|today\|week` |
| GET | `/tasks/board` | Tâches + limites WIP de l'équipe + charge en cours par personne |
| GET | `/tasks/labels` | Étiquettes disponibles |
| GET | `/tasks/:id` | Détail complet (sous-tâches, commentaires, pièces jointes, historiques, permissions) |
| POST | `/tasks` | Création et délégation (RG-03, RG-04) |
| PUT / DELETE | `/tasks/:id` | Modification / suppression (gestionnaire) |
| PATCH | `/tasks/:id/status` | `{ status, force? }` — Kanban (RG-02, WIP) |
| PATCH | `/tasks/:id/progress` | `{ progress, note }` (F-24) |
| POST | `/tasks/:id/assign` | `{ userIds[], note }` — délégation / réaffectation (F-14) |
| POST / PATCH / DELETE | `/tasks/:id/subtasks[/:sid]` | Sous-tâches pondérées (RG-05) |
| POST | `/tasks/:id/comments` | `{ content, mentions[] }` |
| POST / GET / DELETE | `/tasks/:id/attachments[/:aid]` | Pièces jointes (10 Mo) |

## Sprints et backlog

| Méthode | Route | Description |
| --- | --- | --- |
| GET | `/sprints/backlog?teamId=` | Product backlog priorisé |
| PATCH | `/sprints/backlog/order` | `{ teamId, taskIds[] }` nouvel ordre |
| GET | `/sprints?teamId=` | Sprints avec statistiques |
| GET | `/sprints/:id` | Détail, tâches, burndown |
| POST / PUT | `/sprints`, `/sprints/:id` | 7 à 14 jours |
| POST | `/sprints/:id/items` | `{ taskIds[] }` planification |
| DELETE | `/sprints/:id/items/:taskId` | Retour au backlog |
| POST | `/sprints/:id/start` | Un seul sprint actif par équipe |
| POST | `/sprints/:id/close` | `{ decisions: [{ taskId, action: 'backlog'\|'sprint', sprintId? }], retro? }` (RG-10) |
| PUT | `/sprints/:id/retro` | `{ positive, improve, actions }` |

## Difficultés

| Méthode | Route | Rôles | Description |
| --- | --- | --- | --- |
| GET | `/issues` | périmètre | Filtres `status` (ou `unresolved`), `severity`, `type`, `reporterId`, `taskId`, `mine`, `search` |
| GET | `/issues/stats` | admin, tuteur | Répartition par type, gravité, personne, équipe, mois ; délai moyen de résolution |
| GET | `/issues/:id` | périmètre | Détail et fil de traitement |
| POST | `/issues` | tous | `{ title, description, type, severity, taskId? }` (RG-06) |
| PATCH | `/issues/:id` | tuteur, admin | `{ status?, response?, actionDecided? }` |
| POST | `/issues/:id/responses` | périmètre | `{ content }` (précisions du déclarant) |

## Tableaux de bord, rapports, notifications

| Méthode | Route | Rôles | Description |
| --- | --- | --- | --- |
| GET | `/dashboard/me` | tous | Tableau de bord selon le rôle (périmètre pour les responsables) |
| GET | `/dashboard/person/:id` | périmètre | Avancement d'une personne (F-25) |
| GET | `/dashboard/team/:id` | membres, admin | Tableau de bord d'équipe (F-26) |
| GET | `/dashboard/global` | admin | Vue globale (US-15) |
| GET | `/reports/export` | admin, tuteur | `type=internship\|team\|tasks\|issues\|users\|global`, `format=pdf\|xlsx`, `id`, `teamId` |
| GET | `/notifications` | tous | 60 dernières + nombre de non lues |
| PATCH | `/notifications/:id/read` | tous | |
| POST | `/notifications/read-all` | tous | |
| GET | `/activity` | tous | Journal (périmètre) ; `audit=true` réservé à l'admin |
| GET | `/health` | public | Contrôle de santé (base de données incluse) |

## Exemple

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"samuel.ndjock@teamtrack.app","password":"TeamTrack@2026"}' | jq -r .accessToken)

curl -s -X POST http://localhost:4000/api/tasks \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Rédiger le guide","teamId":1,"assigneeIds":[9],"priority":"high","dueDate":"2026-12-01"}'
```
