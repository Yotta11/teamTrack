/**
 * Jeu de données de démonstration.
 * Usage : npm run seed            (base vide)
 *         npm run seed -- --reset (réinitialise entièrement la base)
 * Tous les comptes de démonstration utilisent le mot de passe : TeamTrack@2026
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addDays, today } from '../utils/dates.js';
import { hashPassword } from '../utils/password.js';
import { migrate } from './migrate.js';
import { pool, query, queryOne } from './pool.js';

export const DEMO_PASSWORD = 'TeamTrack@2026';
const d = (offset: number) => addDays(today(), offset);
const ts = (offset: number, hour = 10) => `${d(offset)} ${String(hour).padStart(2, '0')}:00:00`;

export async function seed({ reset = false, log = true } = {}) {
  if (reset) {
    await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  }
  await migrate(log);
  const existing = await queryOne('SELECT count(*) AS n FROM users');
  if (existing.n > 0) {
    if (log) console.log('La base contient déjà des données : utilisez --reset pour la réinitialiser.');
    return;
  }
  const hash = await hashPassword(DEMO_PASSWORD);

  /* ---------------------------- Départements ---------------------------- */
  const dept = async (name: string, description: string) =>
    (await queryOne('INSERT INTO departments (name, description) VALUES ($1,$2) RETURNING id', [name, description])).id as number;
  const dIT = await dept('Systèmes d’information', 'Développement, infrastructure et support');
  const dMkt = await dept('Marketing digital', 'Contenus, campagnes et réseaux sociaux');
  const dRH = await dept('Ressources humaines', 'Recrutement, stages et formation');

  /* ----------------------------- Utilisateurs ----------------------------- */
  const user = async (first: string, last: string, email: string, role: string, job: string, dep: number, skills: string[] = [], phone?: string) =>
    (await queryOne(
      `INSERT INTO users (first_name, last_name, email, password_hash, role, job_title, department_id, skills, phone, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now() - interval '120 days') RETURNING id`,
      [first, last, email, hash, role, job, dep, skills, phone ?? null],
    )).id as number;

  const admin = await user('Clarisse', 'Mbarga', 'admin@teamtrack.app', 'admin', 'Responsable RH', dRH, ['Gestion RH', 'Droit du travail'], '+237 6 90 00 00 01');
  const tSamuel = await user('Samuel', 'Ndjock', 'samuel.ndjock@teamtrack.app', 'tutor', 'Lead développeur', dIT, ['Node.js', 'React', 'PostgreSQL', 'Scrum'], '+237 6 90 00 00 02');
  const tAurelie = await user('Aurélie', 'Fotso', 'aurelie.fotso@teamtrack.app', 'tutor', 'Cheffe de projet mobile', dIT, ['Flutter', 'Kotlin', 'UX']);
  const tPatrick = await user('Patrick', 'Essomba', 'patrick.essomba@teamtrack.app', 'tutor', 'Responsable marketing', dMkt, ['Meta Ads', 'Stratégie de contenu']);
  const eNadia = await user('Nadia', 'Kamdem', 'nadia.kamdem@teamtrack.app', 'employee', 'Développeuse back-end', dIT, ['Express', 'TypeScript', 'Docker']);
  const eJunior = await user('Junior', 'Abena', 'junior.abena@teamtrack.app', 'employee', 'Développeur front-end', dIT, ['React', 'Tailwind CSS']);
  const eLaure = await user('Laure', 'Tchoupo', 'laure.tchoupo@teamtrack.app', 'employee', 'Testeuse QA', dIT, ['Playwright', 'Tests manuels']);
  const eHerve = await user('Hervé', 'Onana', 'herve.onana@teamtrack.app', 'employee', 'Community manager', dMkt, ['Canva', 'TikTok', 'Rédaction']);
  const iKevin = await user('Kevin', 'Mballa', 'kevin.mballa@teamtrack.app', 'intern', 'Stagiaire développeur web', dIT, ['HTML', 'JavaScript']);
  const iGrace = await user('Grâce', 'Ngo Bassa', 'grace.ngobassa@teamtrack.app', 'intern', 'Stagiaire développeuse back-end', dIT, ['Python', 'SQL']);
  const iBrice = await user('Brice', 'Tagne', 'brice.tagne@teamtrack.app', 'intern', 'Stagiaire mobile', dIT, ['Dart']);
  const iSandrine = await user('Sandrine', 'Ewane', 'sandrine.ewane@teamtrack.app', 'intern', 'Stagiaire marketing digital', dMkt, ['Photoshop']);
  const iYann = await user('Yann', 'Biyong', 'yann.biyong@teamtrack.app', 'intern', 'Stagiaire QA', dIT, []);
  await user('Paul', 'Atangana', 'paul.atangana@teamtrack.app', 'employee', 'Ancien technicien support', dIT);
  await query(`UPDATE users SET is_active = FALSE WHERE email = 'paul.atangana@teamtrack.app'`);

  /* -------------------------------- Équipes -------------------------------- */
  const team = async (name: string, description: string, lead: number, dep: number, members: number[], wip?: number) => {
    const id = (await queryOne(
      'INSERT INTO teams (name, description, lead_id, department_id, wip_in_progress, wip_review) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
      [name, description, lead, dep, wip ?? null, wip ? 3 : null],
    )).id as number;
    for (const m of new Set([lead, ...members])) await query('INSERT INTO team_members (team_id, user_id) VALUES ($1,$2)', [id, m]);
    return id;
  };
  const tmWeb = await team('Plateforme web', 'Portail client et API de facturation', tSamuel, dIT, [eNadia, eJunior, eLaure, iKevin, iGrace, iYann], 6);
  const tmMobile = await team('Applications mobiles', 'Application mobile de suivi des commandes', tAurelie, dIT, [eJunior, iBrice]);
  const tmMkt = await team('Marketing digital', 'Campagnes, contenus et réseaux sociaux', tPatrick, dMkt, [eHerve, iSandrine]);

  /* -------------------------------- Stages -------------------------------- */
  const internship = async (intern: number, tutor: number, school: string, subject: string, objectives: string, start: number, end: number, status: string) => {
    const id = (await queryOne(
      `INSERT INTO internships (intern_id, tutor_id, school, subject, objectives, start_date, end_date, status, created_by, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, $10) RETURNING id`,
      [intern, tutor, school, subject, objectives, d(start), d(end), status, admin, ts(start - 10)],
    )).id as number;
    await query(`INSERT INTO internship_status_history (internship_id, from_status, to_status, note, changed_by, changed_at) VALUES ($1, NULL, 'upcoming', 'Création du stage', $2, $3)`, [id, admin, ts(start - 10)]);
    if (status !== 'upcoming') await query(`INSERT INTO internship_status_history (internship_id, from_status, to_status, note, changed_at) VALUES ($1, 'upcoming', 'active', 'Démarrage automatique', $2)`, [id, ts(start, 8)]);
    if (status === 'completed' || status === 'evaluated') await query(`INSERT INTO internship_status_history (internship_id, from_status, to_status, note, changed_by, changed_at) VALUES ($1, 'active', 'completed', 'Fin de stage', $2, $3)`, [id, tutor, ts(end, 17)]);
    if (status === 'evaluated') await query(`INSERT INTO internship_status_history (internship_id, from_status, to_status, note, changed_by, changed_at) VALUES ($1, 'completed', 'evaluated', 'Bilan final validé', $2, $3)`, [id, tutor, ts(end + 3, 11)]);
    return id;
  };
  const sKevin = await internship(iKevin, tSamuel, 'École nationale supérieure polytechnique de Yaoundé', 'Refonte du portail client en React',
    '• Maîtriser React et Tailwind CSS\n• Appliquer la méthode Scrum au sein d’une équipe\n• Écrire des tests unitaires\n• Présenter une démonstration en fin de sprint', -45, 45, 'active');
  const sGrace = await internship(iGrace, tSamuel, 'Université de Yaoundé I', 'API de facturation et rapports PDF',
    '• Concevoir une API REST sécurisée\n• Modéliser une base PostgreSQL\n• Mettre en place l’intégration continue', -30, 60, 'active');
  await internship(iBrice, tAurelie, 'IUT de Douala', 'Module hors-ligne de l’application mobile',
    '• Découvrir le développement mobile Flutter\n• Gérer la synchronisation hors-ligne\n• Documenter le module', -20, 70, 'active');
  const sSandrine = await internship(iSandrine, tPatrick, 'ESSEC Douala', 'Stratégie de contenu sur les réseaux sociaux',
    '• Construire un calendrier éditorial\n• Produire des visuels et vidéos courtes\n• Mesurer la performance des publications', -60, 10, 'active');
  await internship(iYann, tSamuel, 'Institut africain d’informatique', 'Automatisation des tests de bout en bout',
    '• Écrire des scénarios Playwright\n• Intégrer les tests au pipeline CI', 12, 100, 'upcoming');
  await query(`UPDATE internships SET delegate_id = $1, delegate_until = $2 WHERE id = $3`, [eNadia, d(5), sGrace]);

  /* -------------------------------- Sprints -------------------------------- */
  const sprint = async (teamId: number, name: string, goal: string, start: number, end: number, status: string, retro?: string[]) =>
    (await queryOne(
      `INSERT INTO sprints (team_id, name, goal, start_date, end_date, status, retro_positive, retro_improve, retro_actions, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [teamId, name, goal, d(start), d(end), status, retro?.[0] ?? null, retro?.[1] ?? null, retro?.[2] ?? null, status === 'closed' ? ts(end, 18) : null],
    )).id as number;
  const sp1 = await sprint(tmWeb, 'Sprint 1 — Socle sécurisé', 'Authentification, comptes et rôles opérationnels', -24, -11, 'closed',
    ['Bonne entraide entre stagiaires et employés ; démonstration réussie.', 'Les estimations étaient trop optimistes sur la partie sécurité.', 'Découper les user stories au-delà de 5 points ; daily à 9 h précises.']);
  const sp2 = await sprint(tmWeb, 'Sprint 2 — Portail client', 'Livrer la consultation des factures et le tableau de bord client', -10, 3, 'active');
  await sprint(tmWeb, 'Sprint 3 — Paiement en ligne', 'Intégrer le paiement mobile et les reçus PDF', 4, 17, 'planned');
  const spM = await sprint(tmMobile, 'Sprint mobile 4', 'Mode hors-ligne et notifications push', -6, 7, 'active');

  /* --------------------------------- Tâches --------------------------------- */
  interface T {
    title: string; desc?: string; team: number; sprint?: number | null; status: string; priority?: string; progress?: number;
    due?: number | null; est?: number; pts?: number; labels?: string[]; who: number[]; by: number; created?: number;
    started?: number; completed?: number; subtasks?: [string, number, boolean][];
  }
  const task = async (t: T) => {
    const id = (await queryOne(
      `INSERT INTO tasks (title, description, team_id, sprint_id, status, priority, progress, due_date, estimate_hours, story_points, labels,
         creator_id, created_at, started_at, completed_at, validated_by, position)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`,
      [t.title, t.desc ?? null, t.team, t.sprint ?? null, t.status, t.priority ?? 'normal', t.status === 'done' ? 100 : t.progress ?? 0,
        t.due === null || t.due === undefined ? null : d(t.due), t.est ?? null, t.pts ?? null, t.labels ?? [], t.by, ts(t.created ?? -15, 9),
        t.started !== undefined ? ts(t.started, 10) : null, t.completed !== undefined ? ts(t.completed, 16) : null, null, 0],
    )).id as number;
    for (const w of t.who) await query('INSERT INTO task_assignments (task_id, user_id, delegated_by, assigned_at) VALUES ($1,$2,$3,$4)', [id, w, t.by, ts(t.created ?? -15, 9)]);
    for (const [i, [title, weight, done]] of (t.subtasks ?? []).entries()) {
      await query('INSERT INTO subtasks (task_id, title, weight, done, position) VALUES ($1,$2,$3,$4,$5)', [id, title, weight, done, i]);
    }
    if (t.subtasks?.length) {
      const tot = t.subtasks.reduce((s, x) => s + x[1], 0);
      const dn = t.subtasks.filter((x) => x[2]).reduce((s, x) => s + x[1], 0);
      await query('UPDATE tasks SET progress = $2 WHERE id = $1', [id, Math.round((dn / tot) * 100)]);
    }
    await query(`INSERT INTO activity_log (user_id, action, entity, entity_id, summary, created_at) VALUES ($1,'task_created','task',$2,$3,$4)`,
      [t.by, id, `Tâche créée : ${t.title}`, ts(t.created ?? -15, 9)]);
    if (t.status === 'done' && t.completed !== undefined) {
      await query(`INSERT INTO activity_log (user_id, action, entity, entity_id, summary, created_at) VALUES ($1,'task_moved','task',$2,$3,$4)`,
        [t.who[0], id, 'Déplacée de « En revue » vers « Terminé »', ts(t.completed, 16)]);
    }
    return id;
  };

  // Sprint 1 (clôturé)
  for (const [title, who, pts, c] of [
    ['Connexion par e-mail et mot de passe', [eNadia], 3, -20], ['Blocage après 5 échecs de connexion', [iGrace], 2, -18],
    ['Création des comptes et rôles', [eNadia, iGrace], 5, -15], ['Écran de connexion responsive', [iKevin], 3, -16],
    ['Gestion des équipes (CRUD)', [eJunior], 5, -13], ['Tests unitaires du module auth', [eLaure], 3, -12],
  ] as [string, number[], number, number][]) {
    await task({ title, team: tmWeb, sprint: sp1, status: 'done', who, by: tSamuel, pts, est: pts * 3, created: -25, started: c - 3, completed: c, due: c + 1, labels: title.includes('Tests') ? ['test'] : title.includes('Écran') ? ['front'] : ['back'] });
  }
  // Sprint 2 (en cours)
  const kFactures = await task({ title: 'Liste des factures du client', desc: 'Afficher les factures du client connecté, filtrables par période et statut (payée, en attente, en retard).',
    team: tmWeb, sprint: sp2, status: 'in_progress', priority: 'high', who: [iKevin], by: tSamuel, pts: 5, est: 12, due: 1, labels: ['front'], created: -10, started: -8,
    subtasks: [['Maquette de la liste', 1, true], ['Appel API et pagination', 2, true], ['Filtres par période', 2, false], ['Tests du composant', 1, false]] });
  const kPdf = await task({ title: 'Génération des factures en PDF', desc: 'Endpoint GET /api/invoices/:id/pdf avec en-tête de l’entreprise et lignes détaillées.',
    team: tmWeb, sprint: sp2, status: 'in_progress', priority: 'urgent', progress: 40, who: [iGrace], by: tSamuel, pts: 8, est: 16, due: -1, labels: ['back'], created: -10, started: -7 });
  await task({ title: 'Tableau de bord client', team: tmWeb, sprint: sp2, status: 'review', priority: 'high', progress: 100, who: [eJunior], by: tSamuel, pts: 5, est: 10, due: 2, labels: ['front'], created: -10, started: -9 });
  await task({ title: 'Pagination côté API', team: tmWeb, sprint: sp2, status: 'done', who: [eNadia], by: tSamuel, pts: 3, est: 6, due: -4, labels: ['back'], created: -10, started: -9, completed: -6 });
  await task({ title: 'Plan de tests du portail', team: tmWeb, sprint: sp2, status: 'done', who: [eLaure], by: tSamuel, pts: 2, est: 4, due: -5, labels: ['test', 'documentation'], created: -10, started: -9, completed: -5 });
  await task({ title: 'Cache des requêtes fréquentes', team: tmWeb, sprint: sp2, status: 'done', who: [eNadia], by: tSamuel, pts: 3, est: 6, due: -2, labels: ['back'], created: -10, started: -6, completed: -3 });
  await task({ title: 'Export Excel des factures', team: tmWeb, sprint: sp2, status: 'todo', priority: 'normal', who: [iGrace], by: tSamuel, pts: 3, est: 6, due: 3, labels: ['back'], created: -10 });
  await task({ title: 'Accessibilité clavier du portail', team: tmWeb, sprint: sp2, status: 'todo', priority: 'low', who: [iKevin, eJunior], by: tSamuel, pts: 2, est: 4, due: 3, labels: ['front'], created: -10 });
  await task({ title: 'Tests de bout en bout du parcours facture', team: tmWeb, sprint: sp2, status: 'in_progress', progress: 30, who: [eLaure], by: tSamuel, pts: 3, est: 8, due: 2, labels: ['test'], created: -9, started: -2 });
  // Backlog Plateforme web
  let pos = 1;
  for (const [title, pts, pr] of [
    ['En tant que client, je veux payer une facture par mobile money afin de régler sans me déplacer', 8, 'high'],
    ['En tant que client, je veux télécharger un reçu PDF après paiement afin de garder une preuve', 5, 'high'],
    ['En tant que gestionnaire, je veux relancer automatiquement les factures en retard afin de réduire les impayés', 5, 'normal'],
    ['En tant que client, je veux modifier mes coordonnées afin de garder mon profil à jour', 3, 'normal'],
    ['En tant qu’admin, je veux consulter le journal des connexions afin de détecter les abus', 3, 'low'],
    ['En tant que client, je veux recevoir mes factures par e-mail afin de ne rien manquer', 5, 'normal'],
  ] as [string, number, string][]) {
    const id = await task({ title, team: tmWeb, status: 'backlog', priority: pr, who: [], by: tSamuel, pts, created: -12, labels: ['back'] });
    await query('UPDATE tasks SET position = $2 WHERE id = $1', [id, pos++]);
  }
  // Mobile
  await task({ title: 'Stockage local des commandes (SQLite)', team: tmMobile, sprint: spM, status: 'in_progress', priority: 'high', who: [iBrice], by: tAurelie, pts: 5, est: 14, due: 3, labels: ['front'], created: -6, started: -4,
    subtasks: [['Schéma de la base locale', 1, true], ['Lecture hors-ligne', 2, false], ['Tests de synchronisation', 2, false]] });
  await task({ title: 'File d’attente de synchronisation', team: tmMobile, sprint: spM, status: 'todo', priority: 'high', who: [iBrice], by: tAurelie, pts: 8, est: 16, due: 6, labels: ['back'], created: -6 });
  await task({ title: 'Notifications push des commandes', team: tmMobile, sprint: spM, status: 'review', progress: 100, who: [eJunior], by: tAurelie, pts: 3, est: 6, due: 1, labels: ['front'], created: -6, started: -5 });
  await task({ title: 'Écran des paramètres', team: tmMobile, sprint: spM, status: 'done', who: [eJunior], by: tAurelie, pts: 2, est: 4, due: -2, labels: ['front', 'design'], created: -6, started: -5, completed: -3 });
  await task({ title: 'Documentation du module hors-ligne', team: tmMobile, sprint: spM, status: 'todo', priority: 'low', who: [iBrice], by: tAurelie, pts: 2, est: 4, due: 7, labels: ['documentation'], created: -6 });
  // Marketing (Kanban sans sprint)
  await task({ title: 'Calendrier éditorial du mois', team: tmMkt, status: 'done', who: [iSandrine], by: tPatrick, est: 6, due: -12, labels: ['documentation'], created: -25, started: -20, completed: -13 });
  await task({ title: 'Série de 8 visuels produits', team: tmMkt, status: 'in_progress', priority: 'high', progress: 75, who: [iSandrine], by: tPatrick, est: 12, due: 2, labels: ['design'], created: -12, started: -8 });
  await task({ title: 'Vidéos courtes TikTok (3 épisodes)', team: tmMkt, status: 'in_progress', priority: 'normal', progress: 20, who: [iSandrine, eHerve], by: tPatrick, est: 10, due: 6, labels: ['design'], created: -8, started: -3 });
  await task({ title: 'Rapport de performance des publications', team: tmMkt, status: 'todo', priority: 'normal', who: [iSandrine], by: tPatrick, est: 5, due: 9, labels: ['documentation'], created: -5 });
  await task({ title: 'Campagne Meta Ads « rentrée »', team: tmMkt, status: 'review', priority: 'urgent', progress: 100, who: [eHerve], by: tPatrick, est: 8, due: -1, labels: [], created: -10, started: -7 });
  await task({ title: 'Réponses aux messages privés', team: tmMkt, status: 'in_progress', priority: 'low', progress: 60, who: [eHerve], by: tPatrick, est: 3, due: -3, labels: [], created: -9, started: -9 });

  /* ---------------------- Commentaires, avancement ---------------------- */
  const comment = (task: number, author: number, content: string, offset: number, hour: number) =>
    query('INSERT INTO task_comments (task_id, author_id, content, created_at) VALUES ($1,$2,$3,$4)', [task, author, content, ts(offset, hour)]);
  await comment(kFactures, tSamuel, 'Pense à réutiliser le composant de pagination de Nadia.', -7, 11);
  await comment(kFactures, iKevin, 'C’est fait, la pagination fonctionne. Je passe aux filtres demain. @Nadia Kamdem peux-tu vérifier le format des dates renvoyé par l’API ?', -3, 15);
  await comment(kFactures, eNadia, 'Les dates sont en ISO (AAAA-MM-JJ). Tu peux utiliser date-fns pour l’affichage.', -3, 16);
  await comment(kPdf, iGrace, 'Je bloque sur les polices accentuées dans le PDF, j’ai ouvert une difficulté.', -2, 10);
  const progress = (task: number, user: number, p: number, note: string, offset: number) =>
    query('INSERT INTO progress_updates (task_id, user_id, progress, note, created_at) VALUES ($1,$2,$3,$4,$5)', [task, user, p, note, ts(offset, 17)]);
  await progress(kPdf, iGrace, 20, 'Structure de l’endpoint et requête SQL prêtes.', -5);
  await progress(kPdf, iGrace, 40, 'Mise en page de l’en-tête terminée ; reste les lignes et les totaux.', -2);

  /* ------------------------------ Difficultés ------------------------------ */
  const issue = async (title: string, desc: string, type: string, sev: string, status: string, reporter: number, task: number | null, offset: number, responses: [number, string, string | null, string | null][] = []) => {
    const id = (await queryOne(
      `INSERT INTO issues (title, description, type, severity, status, reporter_id, task_id, reported_at, first_response_at, resolved_at, escalated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [title, desc, type, sev, status, reporter, task, ts(offset, 9), responses.length ? ts(offset + 1, 10) : null,
        status === 'resolved' ? ts(offset + 2, 15) : null, status === 'escalated' ? ts(offset, 9) : null],
    )).id as number;
    for (const [i, [author, content, action, to]] of responses.entries()) {
      await query('INSERT INTO issue_responses (issue_id, author_id, content, action_decided, to_status, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [id, author, content, action, to, ts(offset + 1 + i, 10 + i)]);
    }
    return id;
  };
  await issue('Accents mal affichés dans les PDF', 'Les caractères é, è, à apparaissent comme des carrés dans les factures générées.', 'technical', 'medium', 'in_progress', iGrace, kPdf, -2,
    [[tSamuel, 'Il faut embarquer une police TTF qui contient les glyphes latins étendus. On regarde ça ensemble à 14 h.', 'Session de binôme avec Nadia', 'in_progress']]);
  await issue('Pas d’accès au serveur de préproduction', 'Je n’ai pas encore reçu mes identifiants SSH pour déployer et tester.', 'resource', 'critical', 'escalated', iKevin, null, -1);
  await issue('Besoin d’une formation sur les tests unitaires', 'Je ne sais pas comment tester les composants React qui appellent l’API.', 'skill', 'low', 'resolved', iKevin, null, -14,
    [[tSamuel, 'Je t’ai partagé un module de formation interne et un exemple avec Vitest et React Testing Library.', 'Formation de 2 h planifiée avec Laure', 'resolved']]);
  await issue('Charge de travail trop élevée cette semaine', 'J’ai trois tâches urgentes en parallèle et je ne pourrai pas tout finir.', 'organizational', 'medium', 'analysis', iSandrine, null, -1,
    [[tPatrick, 'Merci de l’avoir signalé, je revois les priorités avec Hervé.', null, 'analysis']]);
  await issue('Ordinateur de test très lent', 'Le poste de test met plusieurs minutes à lancer l’émulateur Android.', 'resource', 'medium', 'open', iBrice, null, -4);
  await issue('Spécifications floues sur la relance automatique', 'Les règles de relance des factures ne sont pas précisées (fréquence, canal).', 'organizational', 'low', 'open', eNadia, null, 0);

  /* ------------------------------ Évaluations ------------------------------ */
  const evaluation = (s: number, by: number, offset: number, n: number[], comment: string) =>
    query(`INSERT INTO evaluations (internship_id, evaluator_id, eval_date, attendance, quality, autonomy, communication, deadlines, comment)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [s, by, d(offset), ...n, comment]);
  await evaluation(sKevin, tSamuel, -30, [4, 3, 3, 4, 3], 'Bon démarrage, curieux et ponctuel. Doit gagner en autonomie sur le débogage.');
  await evaluation(sKevin, tSamuel, -2, [5, 4, 4, 4, 3], 'Nette progression technique. Les estimations restent optimistes : découper davantage les tâches.');
  await evaluation(sGrace, tSamuel, -10, [5, 4, 3, 3, 4], 'Travail rigoureux sur la base de données. Ne pas hésiter à poser des questions plus tôt.');
  await evaluation(sSandrine, tPatrick, -35, [4, 4, 4, 5, 4], 'Très bonne communication, visuels de qualité.');
  await evaluation(sSandrine, tPatrick, -5, [4, 5, 4, 5, 3], 'Production excellente ; attention aux délais quand plusieurs demandes arrivent en même temps.');

  /* ----------------------------- Notifications ----------------------------- */
  const notif = (to: number, type: string, message: string, link: string, offset: number, read = false) =>
    query('INSERT INTO notifications (recipient_id, type, message, link, is_read, created_at) VALUES ($1,$2,$3,$4,$5,$6)', [to, type, message, link, read, ts(offset, 12)]);
  await notif(tSamuel, 'issue_critical', 'Difficulté critique signalée par Kevin Mballa : « Pas d’accès au serveur de préproduction ».', '/difficultes', -1);
  await notif(admin, 'issue_critical', 'Difficulté critique signalée par Kevin Mballa : « Pas d’accès au serveur de préproduction ».', '/difficultes', -1);
  await notif(tSamuel, 'task_overdue', 'Retard sur « Génération des factures en PDF ».', `/taches/${kPdf}`, 0);
  await notif(iKevin, 'evaluation_new', 'Une nouvelle évaluation de votre stage est disponible.', `/stages/${sKevin}`, -2);
  await notif(iKevin, 'task_assigned', 'Samuel Ndjock vous a confié la tâche « Liste des factures du client ».', `/taches/${kFactures}`, -10, true);
  await notif(iGrace, 'task_due', 'La tâche « Export Excel des factures » arrive bientôt à échéance.', '/kanban', 0);

  if (log) {
    console.log('✔ Données de démonstration créées.');
    console.log(`  Mot de passe commun : ${DEMO_PASSWORD}`);
    console.log('  admin@teamtrack.app · samuel.ndjock@teamtrack.app (tuteur) · nadia.kamdem@teamtrack.app (employée) · kevin.mballa@teamtrack.app (stagiaire)');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  seed({ reset: process.argv.includes('--reset') })
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
