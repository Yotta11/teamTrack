# Plan de tests et recette

## 1. Niveaux de tests

| Niveau | Outil | Emplacement | Commande |
| --- | --- | --- | --- |
| Unitaires API | Vitest | `server/tests/unit.test.ts` | `cd server && npm test` |
| Intégration API + PostgreSQL | Vitest + Supertest | `server/tests/api.test.ts` | idem (base `TEST_DATABASE_URL`, réinitialisée) |
| Unitaires front | Vitest + Testing Library | `client/src/test/` | `cd client && npm test` |
| Sécurité | npm audit | CI | `npm audit --omit=dev --audit-level=critical` |
| Performance | k6 | `tests-load/k6-api.js` | `k6 run -e BASE_URL=… tests-load/k6-api.js` |
| Bout en bout | Scénarios ci-dessous (manuels ou Playwright) | §3 | — |
| Recette | Tuteur et stagiaire pilotes | §4 | PV signé |

## 2. Résultats de référence (version 1.0)

- API : **78 tests réussis** (11 unitaires, 67 d'intégration), couverture **86 % des instructions, 92 % des lignes, 94 % des fonctions**.
- Front : **9 tests réussis** (formatage, composants accessibles).
- Lint et vérification de types : aucune erreur.

## 3. Scénarios système (bout en bout)

| N° | Scénario | Résultat attendu |
| --- | --- | --- |
| S1 | Connexion avec un mauvais mot de passe 5 fois | Message clair puis blocage de 15 min |
| S2 | Le tuteur crée un stage pour un stagiaire | Stage « à venir » ou « en cours », stagiaire notifié |
| S3 | Le tuteur crée une tâche et la délègue au stagiaire | Carte visible dans le Kanban du stagiaire, notification et e-mail |
| S4 | Le stagiaire glisse la carte « À faire » → « En cours », déclare 60 % | Avancement visible par le tuteur sur la fiche stagiaire |
| S5 | Le stagiaire tente « Terminé » à 60 % | Refus expliqué (RG-02) ; le tuteur peut valider |
| S6 | Le stagiaire signale une difficulté critique | Statut « escaladée », tuteur et administrateur notifiés |
| S7 | Le tuteur répond, indique l'action décidée, résout | Le stagiaire suit le fil jusqu'à « Résolue » |
| S8 | Le tuteur planifie un sprint, le démarre puis le clôture | Burndown affiché ; clôture refusée tant que les tâches ouvertes ne sont pas replanifiées |
| S9 | Le tuteur évalue le stagiaire et exporte le bilan PDF | PDF avec chiffres clés, critères, tâches et difficultés |
| S10 | L'administrateur importe un CSV de 10 personnes | Comptes créés, erreurs listées par ligne |
| S11 | L'administrateur désactive un employé | Connexion impossible, historique conservé |
| S12 | Affichage sur téléphone (390 px) | Menu latéral repliable, Kanban défilant horizontalement |

## 4. Recette utilisateur

Critères d'acceptation (section 16) :

- [ ] Toutes les fonctionnalités Must sont livrées et testées.
- [ ] Un tuteur crée un stage, délègue une tâche et voit l'avancement de chaque stagiaire sans assistance.
- [ ] Un stagiaire déclare une difficulté et suit son traitement jusqu'à la résolution.
- [ ] Le pipeline CI/CD s'exécute sans erreur et déploie en préproduction.
- [ ] Couverture des tests ≥ 70 %.
- [ ] Aucune faille critique détectée par l'audit.

| Rôle | Nom | Date | Scénarios validés | Signature |
| --- | --- | --- | --- | --- |
| Tuteur pilote | | | S2 à S9 | |
| Stagiaire pilote | | | S3 à S7 | |
| Administrateur RH | | | S1, S10, S11 | |
