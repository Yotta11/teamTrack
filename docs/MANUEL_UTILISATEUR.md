# Manuel d'utilisation

TeamTrack s'utilise depuis un navigateur récent (Chrome, Firefox, Edge, Safari), sur ordinateur, tablette ou téléphone.

## Se connecter

1. Saisissez votre e-mail professionnel et votre mot de passe.
2. Après 5 erreurs, le compte est bloqué 15 minutes.
3. Mot de passe oublié : cliquez sur le lien, saisissez votre e-mail, puis ouvrez le lien reçu (valable 30 minutes).

Au premier accès, changez votre mot de passe provisoire depuis **Mon profil**.

## Ce que voit chaque rôle

| Rôle | Accès principal |
| --- | --- |
| Stagiaire | Ses tâches, son Kanban, ses difficultés, sa fiche de stage et ses évaluations |
| Employé | Les tâches de ses équipes ; il met à jour les siennes et peut créer une tâche pour lui-même |
| Tuteur / chef d'équipe | Ses équipes et ses stagiaires : délégation, sprints, difficultés, évaluations, exports |
| Administrateur RH | Tout, plus la gestion des comptes, équipes, départements et le journal d'audit |

## Tableau de bord

Il affiche, selon votre rôle : les tâches ouvertes, les retards, les échéances sous 48 heures, le taux de réalisation, les tâches à traiter en priorité, vos difficultés et l'activité récente. Les tuteurs voient aussi l'avancement de leurs équipes, leurs stagiaires et les difficultés à traiter. L'administrateur dispose d'un onglet **Vue globale** exportable.

## Tâches

**Créer et déléguer** (tuteur, administrateur) : bouton **Nouvelle tâche**. Indiquez le titre, l'équipe, la priorité, l'échéance, l'estimation, les responsables (membres de l'équipe uniquement) et, si besoin, des sous-tâches pondérées.

**Mettre à jour l'avancement** (personne affectée) : ouvrez la tâche, réglez le curseur et ajoutez un commentaire de progression. Si la tâche contient des sous-tâches, cochez-les : l'avancement se calcule tout seul.

**Déléguer à quelqu'un d'autre** : dans la fiche, bouton **Déléguer**. L'ancienne et la nouvelle personne sont prévenues, l'historique conserve la trace.

**Discuter** : la section Discussion permet de commenter et de **mentionner** un membre de l'équipe (il reçoit une notification).

## Tableau Kanban

- Glissez une carte d'une colonne à l'autre : À faire, En cours, En revue, Terminé.
- Une tâche passe en **Terminé** seulement à 100 % ; sinon, c'est le tuteur qui la valide.
- Les pastilles en haut indiquent, pour chaque personne, le nombre de tâches en cours et sa limite (3 par défaut). Au-delà, le déplacement est refusé ; un tuteur peut forcer en connaissance de cause.
- Cliquez sur une carte pour l'ouvrir sans quitter le tableau.

## Backlog et sprints

1. Onglet **Product backlog** : ajoutez des user stories (« En tant que…, je veux…, afin de… ») avec des points d'effort, classez-les avec les flèches.
2. **Nouveau sprint** : durée de 7 à 14 jours, avec un objectif.
3. Cochez des éléments du backlog et cliquez sur **Planifier dans le sprint**, puis **Démarrer**.
4. Suivez le **burndown** (reste à faire par jour).
5. **Clôturer** : chaque tâche non terminée doit être replanifiée ou remise dans le backlog ; saisissez la rétrospective.

## Difficultés

**Signaler** (tout le monde) : bouton **Signaler une difficulté** en haut de l'écran. Choisissez le type (technique, organisationnel, compétence, ressource, personnel) et la gravité. Une difficulté **critique** prévient immédiatement votre tuteur et l'administration.

**Traiter** (tuteur, administrateur) : ouvrez la difficulté, répondez, indiquez l'action décidée et faites évoluer le statut (en analyse, en cours de résolution, résolue). Sans traitement sous 3 jours, elle est escaladée automatiquement à l'administration.

L'onglet **Statistiques** montre les types de difficultés par personne et par équipe pour repérer les besoins de formation.

## Stages

- **Nouveau stage** : stagiaire, tuteur référent, établissement, sujet, objectifs et période.
- **Statut** : à venir, en cours, suspendu, terminé, évalué (chaque changement est historisé).
- **Déléguer le suivi** pendant une absence, avec une date de fin.
- **Documents** : convention, rapports, attestation.
- **Évaluer** : cinq critères notés de 1 à 5 (assiduité, qualité du travail, autonomie, communication, respect des délais) et un commentaire. Le stagiaire est notifié et consulte ses évaluations.
- **Bilan PDF / Excel** : synthèse automatique (tâches réalisées, taux de réussite, difficultés, évaluations).

## Équipes et personnes

La page d'une équipe présente la répartition des tâches, le débit hebdomadaire, le temps de cycle et, pour chaque membre, le taux de réalisation, la charge restante, les retards et les difficultés. Les tuteurs y règlent les limites WIP. La fiche d'une personne détaille son avancement.

## Administration

- **Comptes et rôles** : créer un compte (un mot de passe provisoire est envoyé par e-mail), modifier le rôle, réinitialiser le mot de passe, désactiver ou réactiver. Les comptes ne sont jamais supprimés.
- **Importer un CSV** : colonnes `prenom;nom;email;role;poste;departement;equipe` (modèle téléchargeable).
- **Équipes** et **Départements**.
- **Journal d'audit** : connexions, créations de comptes, changements de rôle, évaluations.

## Notifications

La cloche indique les notifications non lues : nouvelle tâche, changement de statut, échéance proche ou dépassée, mention, difficulté signalée ou résolue, nouvelle évaluation. Les plus importantes sont aussi envoyées par e-mail.
