# Méthodologie hybride et traçabilité

TeamTrack combine le **cycle en V** pour le cadrage et la validation, **Scrum** pour la réalisation itérative, **Kanban** pour le pilotage du flux et **DevOps** pour l'automatisation de la livraison (section 8 du cahier des charges).

## 1. Cycle en V : correspondance conception / validation

| Phase descendante | Artefact dans le dépôt | Phase ascendante | Preuve |
| --- | --- | --- | --- |
| Expression des besoins | Cahier des charges v1.0 | Recette utilisateur | `docs/PLAN_DE_TESTS.md` §4, PV de recette |
| Spécifications fonctionnelles | `docs/MANUEL_UTILISATEUR.md`, règles RG-01 à RG-10 | Tests système (bout en bout) | Scénarios §3 du plan de tests |
| Conception générale | `server/src/db/migrations/001_init.sql`, `docs/DEPLOIEMENT.md` (architecture 3 couches) | Tests d'intégration | `server/tests/api.test.ts` (Supertest + PostgreSQL) |
| Conception détaillée | `docs/API.md`, `server/src/services/*` | Tests unitaires | `server/tests/unit.test.ts`, `client/src/test/*` |
| Codage en sprints | `server/src`, `client/src` | — | Historique Git, pull requests |

## 2. Matrice de traçabilité exigences → code → tests

| Exigence | Implémentation principale | Test automatisé |
| --- | --- | --- |
| F-01 connexion, blocage après 5 échecs | `routes/auth.ts` (login) | `F-01 : authentification` (4 cas) |
| F-02 RBAC | `middleware/auth.ts` `requireRole`, `services/scope.ts` | `F-02 / RG-08` (7 cas) |
| F-03 mot de passe oublié 30 min | `routes/auth.ts` forgot / reset | `F-03 : réinitialisation par lien à usage unique` |
| F-05 / RG-07 désactivation | `routes/users.ts` PATCH status | `RG-07 : un compte désactivé…` |
| F-06 équipes multiples | `routes/teams.ts`, table `team_members` | `F-18 : le tableau Kanban…` (membres) |
| F-07 recherche | `routes/users.ts` GET | `F-07 : recherche et filtres` |
| F-08 import CSV | `routes/users.ts` POST import | `F-08 : import CSV avec rapport d'erreurs` |
| F-09 / RG-01 stage et tuteur | `routes/internships.ts` | `RG-01 : le tuteur référent…` |
| F-10 statuts historisés | `STATUS_TRANSITIONS`, `internship_status_history` | `F-10 : transitions de statut…` |
| F-11 délégation | `POST /internships/:id/delegate` | `F-11 : délégation du suivi…` |
| F-13 / F-14 création, délégation | `routes/tasks.ts` POST, POST assign | `US-05`, `F-14 : réaffectation tracée` |
| F-15 / RG-05 sous-tâches | `utils/progress.ts`, `recalcProgress` | `RG-05` (unitaire + intégration) |
| F-16 commentaires, mentions | `POST /tasks/:id/comments` | `F-16 : commentaire avec mention notifiée` |
| F-18 / F-19 / RG-09 Kanban et WIP | `GET /tasks/board`, `checkWip` | `RG-09 / F-19`, `F-18` |
| RG-02 validation du tuteur | `PATCH /tasks/:id/status` | `RG-02 : « Terminé » impossible…` |
| RG-03 / RG-04 affectation, échéance | `validateAssignees` | `RG-03` (2 cas), `RG-04` |
| F-20 à F-23 / RG-10 Scrum | `routes/sprints.ts` | `Sprints` (5 cas) |
| F-24 avancement | `PATCH /tasks/:id/progress` | `F-24 : la personne affectée…` |
| F-25 / F-26 tableaux de bord | `routes/dashboard.ts` | `F-25 / F-26` |
| F-27 historique | `services/activity.ts` | `F-27 : chaque action est journalisée` |
| F-28 alertes de retard | `services/scheduler.ts` `runDeadlineAlerts` | `F-28 : alertes d'échéance sans doublon` |
| F-29 / F-30 / RG-06 difficultés | `routes/issues.ts` | `RG-06`, `US-10` |
| F-31 escalade 3 jours | `runIssueEscalation` | `F-31 : escalade automatique…` |
| F-32 statistiques | `GET /issues/stats` | `F-32 : statistiques…` |
| F-33 évaluation | `routes/evaluations.ts` | `US-12 : évaluation enregistrée…` |
| F-34 bilan | `services/internships.ts` `internshipSummary` | `F-34 : bilan de stage automatique` |
| F-35 exports | `services/export.ts`, `routes/reports.ts` | `F-35 : exports PDF et Excel` |
| F-36 notifications | `services/notifications.ts` | `notifications : liste et marquage…` |
| F-37 tableau de bord par rôle | `GET /dashboard/me` | `F-37 : tableau de bord personnalisé…` |
| Sécurité (section 13) | Helmet, rate limit, bcrypt, JWT, CSRF, audit | `Santé et sécurité de base`, `anti-CSRF`, `journal d'audit` |

## 3. Scrum

| Cérémonie / artefact | Dans le projet | Dans l'application |
| --- | --- | --- |
| Product backlog | User stories US-01 à US-15 (section 9) | Onglet **Product backlog**, priorisation, points Fibonacci |
| Sprint planning | 5 sprints de 2 semaines (section 10) | Sélection d'éléments du backlog, démarrage du sprint |
| Daily Scrum | 15 min, blocages remontés comme difficultés | Kanban + **Signaler une difficulté** |
| Sprint review | Démonstration en préproduction | Burndown, taux de réalisation |
| Rétrospective | Points positifs, à améliorer, actions | Formulaire de rétrospective à la clôture |
| Definition of Done | Voir `CONTRIBUTING.md` | — |

### Découpage réalisé

| Sprint | User stories | Modules livrés |
| --- | --- | --- |
| 1 | US-01, US-02, US-03 | Authentification, comptes et rôles, équipes, départements |
| 2 | US-04, US-05, US-06 | Stages, tâches et délégation, Kanban |
| 3 | US-07 à US-10 | Avancement, tableaux de bord, difficultés |
| 4 | US-11 à US-13 | Sprints, burndown, évaluations, notifications |
| 5 | US-14, US-15 | Exports PDF / Excel, tableau de bord global, recette, déploiement |

## 4. Kanban

Colonnes de l'équipe de développement : Backlog, À faire, En cours (WIP 3), En revue, Tests, Terminé. Indicateurs suivis : temps de cycle, débit, tâches bloquées. TeamTrack offre la même logique à ses utilisateurs : limites WIP par colonne et par personne, **temps de cycle moyen**, **débit hebdomadaire** et **tâches bloquées** sur la page de chaque équipe.

## 5. DevOps

Branche → pull request relue → pipeline (build, lint, tests ≥ 70 %, audit) → image Docker → préproduction automatique → production après validation. Détails : `docs/DEPLOIEMENT.md`.

## 6. Risques et mesures intégrées au produit

| Risque | Mesure dans TeamTrack |
| --- | --- |
| Surcharge de l'équipe | Limites WIP bloquantes, charge restante par personne |
| Retard de développement | Burndown, alertes d'échéance, tâches en retard mises en avant |
| Faille de sécurité | RBAC côté serveur, requêtes paramétrées, rate limiting, audit, `npm audit` en CI |
| Perte de données | Sauvegardes quotidiennes 30 jours, script de restauration, comptes jamais supprimés |
| Faible adoption | Interface en français, actions principales en 3 clics maximum, comptes de démonstration |
