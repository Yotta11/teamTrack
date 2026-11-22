/**
 * Tests d'intégration de l'API (Supertest + base PostgreSQL de test).
 * La base TEST_DATABASE_URL est réinitialisée et peuplée avec le jeu de démonstration.
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { pool, query, queryOne } from '../src/db/pool.js';
import { DEMO_PASSWORD, seed } from '../src/db/seed.js';
import { addDays, today } from '../src/utils/dates.js';
import { runDeadlineAlerts, runInternshipStatus, runIssueEscalation } from '../src/services/scheduler.js';

const app = createApp();
const tokens: Record<string, string> = {};
const ids: Record<string, number> = {};

async function login(email: string, password = DEMO_PASSWORD) {
  return request(app).post('/api/auth/login').send({ email, password });
}
const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

beforeAll(async () => {
  await seed({ reset: true, log: false });
  for (const [key, email] of Object.entries({
    admin: 'admin@teamtrack.app',
    tutor: 'samuel.ndjock@teamtrack.app',
    tutor2: 'aurelie.fotso@teamtrack.app',
    employee: 'nadia.kamdem@teamtrack.app',
    intern: 'kevin.mballa@teamtrack.app',
    intern2: 'grace.ngobassa@teamtrack.app',
  })) {
    const res = await login(email);
    expect(res.status).toBe(200);
    tokens[key] = res.body.accessToken;
    ids[key] = res.body.user.id;
  }
  ids.webTeam = (await queryOne(`SELECT id FROM teams WHERE name = 'Plateforme web'`)).id;
  ids.mobileTeam = (await queryOne(`SELECT id FROM teams WHERE name = 'Applications mobiles'`)).id;
  ids.herve = (await queryOne(`SELECT id FROM users WHERE email = 'herve.onana@teamtrack.app'`)).id;
});

afterAll(async () => {
  await pool.end();
});

describe('Santé et sécurité de base', () => {
  it('expose /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.database).toBe('ok');
  });
  it('refuse une requête sans jeton', async () => {
    expect((await request(app).get('/api/tasks')).status).toBe(401);
  });
  it('refuse un jeton invalide', async () => {
    expect((await request(app).get('/api/tasks').set('Authorization', 'Bearer abc')).status).toBe(401);
  });
  it('ajoute les en-têtes de sécurité (helmet)', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('F-01 : authentification', () => {
  it('renvoie un message clair en cas d’erreur', async () => {
    const res = await login('admin@teamtrack.app', 'mauvais');
    expect(res.status).toBe(401);
    expect(res.body.error.message).toMatch(/incorrect/);
  });
  it('bloque temporairement le compte après 5 échecs', async () => {
    const email = 'laure.tchoupo@teamtrack.app';
    for (let i = 0; i < 4; i++) expect((await login(email, 'faux')).status).toBe(401);
    expect((await login(email, 'faux')).status).toBe(423);
    const blocked = await login(email);
    expect(blocked.status).toBe(423);
    expect(blocked.body.error.code).toBe('LOCKED');
  });
  it('renouvelle la session avec le cookie de rafraîchissement (rotation)', async () => {
    const res = await login('admin@teamtrack.app');
    const cookie = res.headers['set-cookie'];
    const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'TeamTrack');
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    // Le jeton déjà utilisé n'est plus valable
    const reused = await request(app).post('/api/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'TeamTrack');
    expect(reused.status).toBe(401);
  });
  it('exige l’en-tête anti-CSRF pour le rafraîchissement', async () => {
    const res = await login('admin@teamtrack.app');
    const r = await request(app).post('/api/auth/refresh').set('Cookie', res.headers['set-cookie']);
    expect(r.status).toBe(403);
  });
  it('F-03 : réinitialisation par lien à usage unique', async () => {
    await request(app).post('/api/auth/forgot-password').send({ email: 'brice.tagne@teamtrack.app' }).expect(200);
    // On simule le lien en créant un jeton connu
    const { sha256 } = await import('../src/utils/password.js');
    const user = await queryOne(`SELECT id FROM users WHERE email = 'brice.tagne@teamtrack.app'`);
    await query(`INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + interval '30 minutes')`, [user.id, sha256('jeton-de-test-0123456789')]);
    await request(app).post('/api/auth/reset-password').send({ token: 'jeton-de-test-0123456789', password: 'faible' }).expect(400);
    await request(app).post('/api/auth/reset-password').send({ token: 'jeton-de-test-0123456789', password: 'Nouveau@2026' }).expect(200);
    await request(app).post('/api/auth/reset-password').send({ token: 'jeton-de-test-0123456789', password: 'Nouveau@2026' }).expect(400);
    expect((await login('brice.tagne@teamtrack.app', 'Nouveau@2026')).status).toBe(200);
  });
});

describe('F-02 / RG-08 : contrôle d’accès par rôle et périmètre', () => {
  it('réserve le tableau de bord global à l’admin', async () => {
    expect((await request(app).get('/api/dashboard/global').set(as('intern'))).status).toBe(403);
    expect((await request(app).get('/api/dashboard/global').set(as('admin'))).status).toBe(200);
  });
  it('interdit à un stagiaire de créer une tâche', async () => {
    const res = await request(app).post('/api/tasks').set(as('intern')).send({ title: 'Test', teamId: ids.webTeam, assigneeIds: [ids.intern] });
    expect(res.status).toBe(403);
  });
  it('un stagiaire ne voit que ses propres tâches', async () => {
    const res = await request(app).get('/api/tasks').set(as('intern'));
    expect(res.status).toBe(200);
    for (const t of res.body) expect(t.assignees.some((a: { id: number }) => a.id === ids.intern)).toBe(true);
    const other = await queryOne(`SELECT t.id FROM tasks t JOIN task_assignments a ON a.task_id = t.id WHERE a.user_id = $1 LIMIT 1`, [ids.intern2]);
    expect((await request(app).get(`/api/tasks/${other.id}`).set(as('intern'))).status).toBe(404);
  });
  it('un stagiaire ne voit pas les difficultés des autres', async () => {
    const res = await request(app).get('/api/issues').set(as('intern'));
    for (const i of res.body) expect(i.reporterId).toBe(ids.intern);
  });
  it('un tuteur ne voit pas les stages d’un autre tuteur', async () => {
    const res = await request(app).get('/api/internships').set(as('tutor2'));
    for (const s of res.body) expect([s.tutorId, s.delegateId]).toContain(ids.tutor2);
  });
  it('réserve la gestion des comptes à l’admin', async () => {
    const res = await request(app).post('/api/users').set(as('tutor')).send({ firstName: 'A', lastName: 'B', email: 'a@b.cm', role: 'intern' });
    expect(res.status).toBe(403);
  });
  it('valide les entrées (zod)', async () => {
    const res = await request(app).post('/api/users').set(as('admin')).send({ firstName: '', email: 'pas-un-email', role: 'roi' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });
});

describe('Tâches et règles de gestion', () => {
  let taskId: number;

  it('US-05 : un tuteur crée et délègue une tâche', async () => {
    const res = await request(app).post('/api/tasks').set(as('tutor')).send({
      title: 'Écrire la documentation API', teamId: ids.webTeam, assigneeIds: [ids.intern], priority: 'high', dueDate: addDays(today(), 5), labels: ['documentation'],
    });
    expect(res.status).toBe(201);
    taskId = res.body.id;
    expect(res.body.assignees.map((a: { id: number }) => a.id)).toEqual([ids.intern]);
    const notif = await queryOne(`SELECT count(*) AS n FROM notifications WHERE recipient_id = $1 AND type = 'task_assigned' AND link = $2`, [ids.intern, `/taches/${taskId}`]);
    expect(notif.n).toBe(1);
  });

  it('RG-03 : au moins un responsable', async () => {
    const res = await request(app).post('/api/tasks').set(as('tutor')).send({ title: 'Sans responsable', teamId: ids.webTeam, assigneeIds: [] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RG-03');
  });

  it('RG-03 : seules les personnes de l’équipe peuvent être affectées', async () => {
    const res = await request(app).post('/api/tasks').set(as('tutor')).send({ title: 'Hors équipe', teamId: ids.webTeam, assigneeIds: [ids.herve] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RG-03');
  });

  it('RG-04 : l’échéance d’un stagiaire ne dépasse pas la fin du stage', async () => {
    const res = await request(app).post('/api/tasks').set(as('tutor')).send({ title: 'Trop tard', teamId: ids.webTeam, assigneeIds: [ids.intern], dueDate: addDays(today(), 400) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RG-04');
  });

  it('un employé ne crée une tâche que pour lui-même', async () => {
    const forOther = await request(app).post('/api/tasks').set(as('employee')).send({ title: 'Pour autrui', teamId: ids.webTeam, assigneeIds: [ids.intern] });
    expect(forOther.status).toBe(403);
    const forSelf = await request(app).post('/api/tasks').set(as('employee')).send({ title: 'Ma tâche perso', teamId: ids.webTeam });
    expect(forSelf.status).toBe(201);
    expect(forSelf.body.assignees[0].id).toBe(ids.employee);
  });

  it('F-24 : la personne affectée met à jour son avancement', async () => {
    const res = await request(app).patch(`/api/tasks/${taskId}/progress`).set(as('intern')).send({ progress: 40, note: 'Plan rédigé' });
    expect(res.status).toBe(200);
    expect(res.body.progress).toBe(40);
    expect(res.body.status).toBe('in_progress');
    expect((await request(app).patch(`/api/tasks/${taskId}/progress`).set(as('intern2')).send({ progress: 90 })).status).toBe(404);
  });

  it('RG-02 : « Terminé » impossible sous 100 % sans validation du tuteur', async () => {
    const res = await request(app).patch(`/api/tasks/${taskId}/status`).set(as('intern')).send({ status: 'done' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RG-02');
    const ok = await request(app).patch(`/api/tasks/${taskId}/status`).set(as('tutor')).send({ status: 'done' });
    expect(ok.status).toBe(200);
    expect(ok.body.progress).toBe(100);
    expect(ok.body.validatedBy).toBe(ids.tutor);
  });

  it('RG-05 : l’avancement suit les sous-tâches pondérées', async () => {
    const t = await request(app).post('/api/tasks').set(as('tutor')).send({
      title: 'Tâche découpée', teamId: ids.webTeam, assigneeIds: [ids.employee],
      subtasks: [{ title: 'A', weight: 1 }, { title: 'B', weight: 3 }],
    });
    expect(t.body.progress).toBe(0);
    const detail = await request(app).get(`/api/tasks/${t.body.id}`).set(as('employee'));
    const a = detail.body.subtasks.find((s: { title: string }) => s.title === 'A');
    const b = detail.body.subtasks.find((s: { title: string }) => s.title === 'B');
    expect((await request(app).patch(`/api/tasks/${t.body.id}/subtasks/${b.id}`).set(as('employee')).send({ done: true })).body.progress).toBe(75);
    expect((await request(app).patch(`/api/tasks/${t.body.id}/subtasks/${a.id}`).set(as('employee')).send({ done: true })).body.progress).toBe(100);
    const manual = await request(app).patch(`/api/tasks/${t.body.id}/progress`).set(as('employee')).send({ progress: 10 });
    expect(manual.status).toBe(400);
  });

  it('F-14 : réaffectation tracée avec historique', async () => {
    const t = await request(app).post('/api/tasks').set(as('tutor')).send({ title: 'À réaffecter', teamId: ids.webTeam, assigneeIds: [ids.intern] });
    const res = await request(app).post(`/api/tasks/${t.body.id}/assign`).set(as('tutor')).send({ userIds: [ids.employee], note: 'Absence' });
    expect(res.status).toBe(200);
    expect(res.body.assignees.map((a: { id: number }) => a.id)).toEqual([ids.employee]);
    const hist = await query(`SELECT active FROM task_assignments WHERE task_id = $1 ORDER BY id`, [t.body.id]);
    expect(hist.map((h) => h.active)).toEqual([false, true]);
  });

  it('RG-09 / F-19 : limite WIP par personne', async () => {
    await query('UPDATE users SET wip_limit = 1 WHERE id = $1', [ids.intern2]);
    const t = await request(app).post('/api/tasks').set(as('tutor')).send({ title: 'WIP', teamId: ids.webTeam, assigneeIds: [ids.intern2] });
    const blocked = await request(app).patch(`/api/tasks/${t.body.id}/status`).set(as('intern2')).send({ status: 'in_progress' });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('WIP_EXCEEDED');
    const forced = await request(app).patch(`/api/tasks/${t.body.id}/status`).set(as('tutor')).send({ status: 'in_progress', force: true });
    expect(forced.status).toBe(200);
    expect(forced.body.wipWarnings.length).toBeGreaterThan(0);
    await query('UPDATE users SET wip_limit = 3 WHERE id = $1', [ids.intern2]);
  });

  it('F-16 : commentaire avec mention notifiée', async () => {
    const res = await request(app).post(`/api/tasks/${taskId}/comments`).set(as('intern')).send({ content: '@Nadia Kamdem tu peux relire ?', mentions: [ids.employee] });
    expect(res.status).toBe(201);
    const n = await queryOne(`SELECT count(*) AS n FROM notifications WHERE recipient_id = $1 AND type = 'task_comment'`, [ids.employee]);
    expect(n.n).toBeGreaterThan(0);
  });

  it('F-18 : le tableau Kanban renvoie les tâches et la charge WIP', async () => {
    const res = await request(app).get('/api/tasks/board').query({ teamId: ids.webTeam }).set(as('tutor'));
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBeGreaterThan(0);
    expect(res.body.team.wipInProgress).toBe(6);
    expect(res.body.people[0]).toHaveProperty('inProgress');
  });

  it('F-27 : chaque action est journalisée', async () => {
    const rows = await query(`SELECT action FROM activity_log WHERE entity = 'task' AND entity_id = $1`, [taskId]);
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(['task_created', 'task_progress', 'task_moved', 'task_commented']));
  });
});

describe('Sprints (F-20 à F-23, RG-10)', () => {
  it('impose une durée de 1 à 2 semaines', async () => {
    const res = await request(app).post('/api/sprints').set(as('tutor')).send({ teamId: ids.webTeam, name: 'Trop long', startDate: today(), endDate: addDays(today(), 30) });
    expect(res.status).toBe(400);
  });
  it('seul le chef d’équipe planifie', async () => {
    const res = await request(app).post('/api/sprints').set(as('employee')).send({ teamId: ids.webTeam, name: 'Sprint employé', startDate: today(), endDate: addDays(today(), 9) });
    expect(res.status).toBe(403);
  });
  it('calcule le burndown du sprint actif', async () => {
    const active = await queryOne(`SELECT id FROM sprints WHERE team_id = $1 AND status = 'active'`, [ids.webTeam]);
    const res = await request(app).get(`/api/sprints/${active.id}`).set(as('tutor'));
    expect(res.status).toBe(200);
    expect(res.body.burndown.points.length).toBe(14);
    expect(res.body.burndown.total).toBeGreaterThan(0);
  });
  it('RG-10 : clôture refusée tant que des tâches ne sont pas replanifiées', async () => {
    const active = await queryOne(`SELECT id FROM sprints WHERE team_id = $1 AND status = 'active'`, [ids.webTeam]);
    const refused = await request(app).post(`/api/sprints/${active.id}/close`).set(as('tutor')).send({ decisions: [] });
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('RG-10');
    const pending = await query(`SELECT id FROM tasks WHERE sprint_id = $1 AND status <> 'done'`, [active.id]);
    const ok = await request(app).post(`/api/sprints/${active.id}/close`).set(as('tutor')).send({
      decisions: pending.map((t) => ({ taskId: t.id, action: 'backlog' })),
      retro: { positive: 'Bonne entraide', improve: 'Estimations', actions: 'Découper davantage' },
    });
    expect(ok.status).toBe(200);
    const backlog = await queryOne(`SELECT count(*) AS n FROM tasks WHERE id = ANY($1::int[]) AND status = 'backlog' AND sprint_id IS NULL`, [pending.map((t) => t.id)]);
    expect(backlog.n).toBe(pending.length);
  });
  it('planifie des éléments du backlog et démarre le sprint suivant', async () => {
    const planned = await queryOne(`SELECT id FROM sprints WHERE team_id = $1 AND status = 'planned'`, [ids.webTeam]);
    const backlog = await request(app).get('/api/sprints/backlog').query({ teamId: ids.webTeam }).set(as('tutor'));
    expect(backlog.body.length).toBeGreaterThan(0);
    await request(app).post(`/api/sprints/${planned.id}/items`).set(as('tutor')).send({ taskIds: [backlog.body[0].id] }).expect(200);
    await request(app).post(`/api/sprints/${planned.id}/start`).set(as('tutor')).expect(200);
  });
});

describe('Difficultés (F-29 à F-32)', () => {
  let issueId: number;
  it('RG-06 : une difficulté critique notifie le tuteur et l’administrateur', async () => {
    const res = await request(app).post('/api/issues').set(as('intern')).send({ title: 'Poste en panne', description: 'Mon ordinateur ne démarre plus.', type: 'resource', severity: 'critical' });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('escalated');
    issueId = res.body.id;
    const notified = await query(`SELECT recipient_id FROM notifications WHERE type = 'issue_critical' AND link = $1`, [`/difficultes/${issueId}`]);
    const recipients = notified.map((n) => n.recipient_id);
    expect(recipients).toContain(ids.tutor);
    expect(recipients).toContain(ids.admin);
  });
  it('seuls le tuteur et l’admin traitent une difficulté', async () => {
    expect((await request(app).patch(`/api/issues/${issueId}`).set(as('intern')).send({ status: 'resolved' })).status).toBe(403);
  });
  it('US-10 : le tuteur répond puis résout, le déclarant est notifié', async () => {
    await request(app).patch(`/api/issues/${issueId}`).set(as('tutor')).send({ status: 'in_progress', response: 'Je préviens le support.' }).expect(200);
    const res = await request(app).patch(`/api/issues/${issueId}`).set(as('tutor')).send({ status: 'resolved', actionDecided: 'Poste de remplacement fourni' });
    expect(res.status).toBe(200);
    expect(res.body.resolvedAt).toBeTruthy();
    const n = await queryOne(`SELECT count(*) AS n FROM notifications WHERE recipient_id = $1 AND type = 'issue_resolved'`, [ids.intern]);
    expect(n.n).toBeGreaterThan(0);
    const detail = await request(app).get(`/api/issues/${issueId}`).set(as('intern'));
    expect(detail.body.responses.length).toBe(2);
  });
  it('F-31 : escalade automatique après 3 jours sans traitement', async () => {
    const res = await request(app).post('/api/issues').set(as('intern2')).send({ title: 'Question', description: 'Pas de réponse', type: 'organizational', severity: 'low' });
    await query(`UPDATE issues SET reported_at = now() - interval '4 days' WHERE id = $1`, [res.body.id]);
    expect(await runIssueEscalation()).toBeGreaterThan(0);
    const row = await queryOne('SELECT status FROM issues WHERE id = $1', [res.body.id]);
    expect(row.status).toBe('escalated');
  });
  it('F-32 : statistiques par type et par personne', async () => {
    const res = await request(app).get('/api/issues/stats').set(as('admin'));
    expect(res.status).toBe(200);
    expect(res.body.byType.length).toBeGreaterThan(0);
    expect(res.body.byPerson[0]).toHaveProperty('mainType');
  });
});

describe('Stages et évaluations (F-09 à F-12, F-33 à F-35)', () => {
  it('RG-01 : le tuteur référent doit être un tuteur actif', async () => {
    const intern = await queryOne(`SELECT id FROM users WHERE email = 'yann.biyong@teamtrack.app'`);
    const res = await request(app).post('/api/internships').set(as('admin')).send({
      internId: intern.id, tutorId: ids.employee, school: 'École', subject: 'Sujet', objectives: 'Objectifs', startDate: addDays(today(), 200), endDate: addDays(today(), 260),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RG-01');
  });
  it('un tuteur ne crée que les stages qu’il encadre', async () => {
    const intern = await queryOne(`SELECT id FROM users WHERE email = 'yann.biyong@teamtrack.app'`);
    const res = await request(app).post('/api/internships').set(as('tutor')).send({
      internId: intern.id, tutorId: ids.tutor2, school: 'École', subject: 'Sujet', objectives: 'Objectifs', startDate: addDays(today(), 200), endDate: addDays(today(), 260),
    });
    expect(res.status).toBe(403);
  });
  it('F-10 : transitions de statut contrôlées et historisées', async () => {
    const s = await queryOne(`SELECT id FROM internships WHERE intern_id = $1`, [ids.intern]);
    expect((await request(app).patch(`/api/internships/${s.id}/status`).set(as('tutor')).send({ status: 'evaluated' })).status).toBe(400);
    await request(app).patch(`/api/internships/${s.id}/status`).set(as('tutor')).send({ status: 'suspended', note: 'Congé maladie' }).expect(200);
    await request(app).patch(`/api/internships/${s.id}/status`).set(as('tutor')).send({ status: 'active' }).expect(200);
    const hist = await query(`SELECT to_status FROM internship_status_history WHERE internship_id = $1 ORDER BY id`, [s.id]);
    expect(hist.slice(-2).map((h) => h.to_status)).toEqual(['suspended', 'active']);
  });
  it('F-11 : délégation du suivi à un employé', async () => {
    const s = await queryOne(`SELECT id FROM internships WHERE intern_id = $1`, [ids.intern]);
    await request(app).post(`/api/internships/${s.id}/delegate`).set(as('tutor')).send({ delegateId: ids.employee, until: addDays(today(), 7) }).expect(200);
    const visible = await request(app).get(`/api/internships/${s.id}`).set(as('employee'));
    expect(visible.status).toBe(200);
    expect(visible.body.canManage).toBe(true);
  });
  it('US-12 : évaluation enregistrée, visible par le stagiaire', async () => {
    const s = await queryOne(`SELECT id FROM internships WHERE intern_id = $1`, [ids.intern]);
    const res = await request(app).post('/api/evaluations').set(as('tutor')).send({ internshipId: s.id, attendance: 5, quality: 4, autonomy: 4, communication: 5, deadlines: 4, comment: 'Très bien' });
    expect(res.status).toBe(201);
    expect(res.body.average).toBe(4.4);
    const list = await request(app).get('/api/evaluations').query({ internshipId: s.id }).set(as('intern'));
    expect(list.body.length).toBeGreaterThanOrEqual(3);
    expect((await request(app).post('/api/evaluations').set(as('intern')).send({ internshipId: s.id, attendance: 5, quality: 5, autonomy: 5, communication: 5, deadlines: 5 })).status).toBe(403);
  });
  it('F-34 : bilan de stage automatique', async () => {
    const s = await queryOne(`SELECT id FROM internships WHERE intern_id = $1`, [ids.intern]);
    const res = await request(app).get(`/api/internships/${s.id}/summary`).set(as('tutor'));
    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveProperty('successRate');
    expect(res.body.evaluations.overall).toBeGreaterThan(0);
  });
  it('F-35 : exports PDF et Excel', async () => {
    const s = await queryOne(`SELECT id FROM internships WHERE intern_id = $1`, [ids.intern]);
    const pdf = await request(app).get('/api/reports/export').query({ type: 'internship', id: s.id, format: 'pdf' }).set(as('tutor'));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    const xlsx = await request(app).get('/api/reports/export').query({ type: 'team', id: ids.webTeam, format: 'xlsx' }).set(as('tutor'));
    expect(xlsx.status).toBe(200);
    expect((await request(app).get('/api/reports/export').query({ type: 'global', format: 'pdf' }).set(as('tutor'))).status).toBe(403);
    expect((await request(app).get('/api/reports/export').query({ type: 'tasks', format: 'pdf' }).set(as('intern'))).status).toBe(403);
  });
});

describe('Comptes (F-05, F-08, RG-07)', () => {
  it('US-02 : création de compte avec mot de passe provisoire', async () => {
    const res = await request(app).post('/api/users').set(as('admin')).send({ firstName: 'Amina', lastName: 'Ngono', email: 'amina.ngono@teamtrack.app', role: 'intern', teamIds: [ids.webTeam] });
    expect(res.status).toBe(201);
    expect(res.body.temporaryPassword).toBeTruthy();
    expect((await login('amina.ngono@teamtrack.app', res.body.temporaryPassword)).status).toBe(200);
    const audit = await queryOne(`SELECT count(*) AS n FROM activity_log WHERE action = 'user_created' AND is_audit`);
    expect(audit.n).toBeGreaterThan(0);
  });
  it('refuse les doublons d’e-mail', async () => {
    const res = await request(app).post('/api/users').set(as('admin')).send({ firstName: 'X', lastName: 'Y', email: 'admin@teamtrack.app', role: 'employee' });
    expect(res.status).toBe(409);
  });
  it('RG-07 / RG-01 : un tuteur avec stages en cours ne peut pas être désactivé', async () => {
    const res = await request(app).patch(`/api/users/${ids.tutor}/status`).set(as('admin')).send({ active: false });
    expect(res.status).toBe(409);
  });
  it('RG-07 : un compte désactivé est conservé mais ne peut plus se connecter', async () => {
    await request(app).patch(`/api/users/${ids.herve}/status`).set(as('admin')).send({ active: false }).expect(200);
    expect((await login('herve.onana@teamtrack.app')).status).toBe(403);
    expect(await queryOne('SELECT id FROM users WHERE id = $1', [ids.herve])).toBeTruthy();
    await request(app).patch(`/api/users/${ids.herve}/status`).set(as('admin')).send({ active: true }).expect(200);
  });
  it('F-08 : import CSV avec rapport d’erreurs', async () => {
    const csv = 'prenom;nom;email;role;poste;departement;equipe\nLéa;Owona;lea.owona@teamtrack.app;stagiaire;Stagiaire;Marketing digital;Marketing digital\nX;;mauvais;roi;;;\n';
    const res = await request(app).post('/api/users/import').set(as('admin')).attach('file', Buffer.from(csv), 'membres.csv');
    expect(res.status).toBe(200);
    expect(res.body.created.length).toBe(1);
    expect(res.body.errors.length).toBe(1);
  });
  it('F-07 : recherche et filtres', async () => {
    const res = await request(app).get('/api/users').query({ role: 'intern', search: 'mballa' }).set(as('admin'));
    expect(res.body.map((u: { email: string }) => u.email)).toEqual(['kevin.mballa@teamtrack.app']);
  });
});

describe('Tableaux de bord et planificateur', () => {
  it('F-37 : tableau de bord personnalisé selon le rôle', async () => {
    const intern = await request(app).get('/api/dashboard/me').set(as('intern'));
    expect(intern.body.internship).toBeTruthy();
    const tutor = await request(app).get('/api/dashboard/me').set(as('tutor'));
    expect(tutor.body.scope).toBe('perimeter');
    expect(Array.isArray(tutor.body.interns)).toBe(true);
  });
  it('F-25 / F-26 : avancement par personne et par équipe', async () => {
    const p = await request(app).get(`/api/dashboard/person/${ids.intern}`).set(as('tutor'));
    expect(p.status).toBe(200);
    expect(p.body.stats).toHaveProperty('completionRate');
    const t = await request(app).get(`/api/dashboard/team/${ids.webTeam}`).set(as('tutor'));
    expect(t.status).toBe(200);
    expect(t.body.members.length).toBeGreaterThan(0);
    expect((await request(app).get(`/api/dashboard/team/${ids.mobileTeam}`).set(as('intern'))).status).toBe(403);
  });
  it('F-28 : alertes d’échéance sans doublon', async () => {
    const first = await runDeadlineAlerts();
    const second = await runDeadlineAlerts();
    expect(first).toBeGreaterThan(0);
    expect(second).toBe(0);
  });
  it('démarre automatiquement les stages à leur date de début', async () => {
    const s = await queryOne(`SELECT id FROM internships WHERE status = 'upcoming' LIMIT 1`);
    await query(`UPDATE internships SET start_date = CURRENT_DATE WHERE id = $1`, [s.id]);
    await runInternshipStatus();
    expect((await queryOne('SELECT status FROM internships WHERE id = $1', [s.id])).status).toBe('active');
  });
  it('notifications : liste et marquage comme lues', async () => {
    const list = await request(app).get('/api/notifications').set(as('intern'));
    expect(list.body.unread).toBeGreaterThan(0);
    await request(app).post('/api/notifications/read-all').set(as('intern')).expect(200);
    expect((await request(app).get('/api/notifications').set(as('intern'))).body.unread).toBe(0);
  });
  it('journal d’audit réservé à l’admin', async () => {
    const res = await request(app).get('/api/activity').query({ audit: true }).set(as('admin'));
    expect(res.body.items.every((i: { isAudit: boolean }) => i.isAudit)).toBe(true);
    expect((await request(app).get('/api/activity').query({ audit: true }).set(as('tutor'))).body.items).toEqual([]);
  });
});

describe('Gestion courante (profil, référentiels, fichiers)', () => {
  it('F-04 : mise à jour du profil et du mot de passe', async () => {
    const res = await request(app).put('/api/auth/me').set(as('employee')).send({ firstName: 'Nadia', lastName: 'Kamdem', phone: '+237 600', jobTitle: 'Développeuse', skills: ['Node.js', 'SQL'] });
    expect(res.status).toBe(200);
    expect(res.body.skills).toEqual(['Node.js', 'SQL']);
    expect((await request(app).post('/api/auth/me/password').set(as('employee')).send({ currentPassword: 'faux', newPassword: 'Autre@2026' })).status).toBe(400);
    await request(app).post('/api/auth/me/password').set(as('employee')).send({ currentPassword: DEMO_PASSWORD, newPassword: 'Autre@2026x' }).expect(200);
    expect((await login('nadia.kamdem@teamtrack.app', 'Autre@2026x')).status).toBe(200);
    const me = await request(app).get('/api/auth/me').set(as('employee'));
    expect(me.body.teams.length).toBeGreaterThan(0);
  });
  it('déconnexion : le cookie est révoqué', async () => {
    const res = await login('admin@teamtrack.app');
    const cookie = res.headers['set-cookie'];
    await request(app).post('/api/auth/logout').set('Cookie', cookie).expect(200);
    expect((await request(app).post('/api/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'TeamTrack')).status).toBe(401);
  });
  it('départements : création, modification, suppression protégée', async () => {
    const d = await request(app).post('/api/departments').set(as('admin')).send({ name: 'Finance', description: 'Comptabilité' });
    expect(d.status).toBe(201);
    await request(app).put(`/api/departments/${d.body.id}`).set(as('admin')).send({ name: 'Finance et achats' }).expect(200);
    const used = await queryOne(`SELECT department_id AS id FROM users WHERE department_id IS NOT NULL LIMIT 1`);
    expect((await request(app).delete(`/api/departments/${used.id}`).set(as('admin'))).status).toBe(409);
    await request(app).delete(`/api/departments/${d.body.id}`).set(as('admin')).expect(200);
    expect((await request(app).get('/api/departments').set(as('intern'))).status).toBe(200);
  });
  it('équipes : création, membres, limites WIP', async () => {
    const t = await request(app).post('/api/teams').set(as('admin')).send({ name: 'Support', leadId: ids.tutor2, memberIds: [ids.herve] });
    expect(t.status).toBe(201);
    expect(t.body.memberCount).toBe(2);
    expect((await request(app).post('/api/teams').set(as('admin')).send({ name: 'Mauvais chef', leadId: ids.intern })).status).toBe(400);
    await request(app).post(`/api/teams/${t.body.id}/members`).set(as('admin')).send({ userId: ids.employee }).expect(201);
    expect((await request(app).delete(`/api/teams/${t.body.id}/members/${ids.tutor2}`).set(as('admin'))).status).toBe(400);
    await request(app).delete(`/api/teams/${t.body.id}/members/${ids.employee}`).set(as('admin')).expect(200);
    await request(app).put(`/api/teams/${t.body.id}`).set(as('admin')).send({ name: 'Support client', leadId: ids.tutor2, memberIds: [ids.herve] }).expect(200);
    await request(app).patch(`/api/teams/${t.body.id}/wip`).set(as('tutor2')).send({ inProgress: 4, review: 2 }).expect(200);
    expect((await request(app).patch(`/api/teams/${t.body.id}/wip`).set(as('tutor')).send({ inProgress: 4, review: 2 })).status).toBe(403);
    const detail = await request(app).get(`/api/teams/${t.body.id}`).set(as('tutor2'));
    expect(detail.body.wipInProgress).toBe(4);
    expect(detail.body.canManage).toBe(true);
  });
  it('tâches : modification, pièce jointe, suppression', async () => {
    const t = await request(app).post('/api/tasks').set(as('tutor')).send({ title: 'Tâche à modifier', teamId: ids.webTeam, assigneeIds: [ids.employee] });
    const upd = await request(app).put(`/api/tasks/${t.body.id}`).set(as('tutor')).send({ title: 'Tâche modifiée', priority: 'urgent', labels: ['back'], storyPoints: 5 });
    expect(upd.body.title).toBe('Tâche modifiée');
    expect(upd.body.priority).toBe('urgent');
    const file = await request(app).post(`/api/tasks/${t.body.id}/attachments`).set(as('employee')).attach('file', Buffer.from('bonjour'), { filename: 'note.txt', contentType: 'text/plain' });
    expect(file.status).toBe(201);
    const dl = await request(app).get(`/api/tasks/${t.body.id}/attachments/${file.body.id}`).set(as('employee'));
    expect(dl.status).toBe(200);
    const sub = await request(app).post(`/api/tasks/${t.body.id}/subtasks`).set(as('employee')).send({ title: 'Étape', weight: 2 });
    expect(sub.status).toBe(201);
    await request(app).delete(`/api/tasks/${t.body.id}/subtasks/${sub.body.subtask.id}`).set(as('tutor')).expect(200);
    await request(app).delete(`/api/tasks/${t.body.id}/attachments/${file.body.id}`).set(as('employee')).expect(200);
    expect((await request(app).delete(`/api/tasks/${t.body.id}`).set(as('employee'))).status).toBe(403);
    await request(app).delete(`/api/tasks/${t.body.id}`).set(as('tutor')).expect(200);
    expect((await request(app).get(`/api/tasks/${t.body.id}`).set(as('tutor'))).status).toBe(404);
    expect((await request(app).get('/api/tasks/labels').set(as('employee'))).body).toContain('back');
  });
  it('documents de stage : dépôt, téléchargement, suppression', async () => {
    const s = await queryOne(`SELECT id FROM internships WHERE intern_id = $1`, [ids.intern]);
    const up = await request(app).post(`/api/internships/${s.id}/documents`).set(as('intern')).field('kind', 'rapport').attach('file', Buffer.from('%PDF-1.4'), { filename: 'rapport.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    const refused = await request(app).post(`/api/internships/${s.id}/documents`).set(as('intern')).field('kind', 'attestation').attach('file', Buffer.from('%PDF-1.4'), { filename: 'attestation.pdf', contentType: 'application/pdf' });
    expect(refused.status).toBe(403);
    expect((await request(app).get(`/api/internships/${s.id}/documents/${up.body.id}`).set(as('tutor'))).status).toBe(200);
    await request(app).delete(`/api/internships/${s.id}/documents/${up.body.id}`).set(as('intern')).expect(200);
    const bad = await request(app).post(`/api/internships/${s.id}/documents`).set(as('tutor')).attach('file', Buffer.from('x'), { filename: 'virus.exe', contentType: 'application/x-msdownload' });
    expect(bad.status).toBe(400);
  });
  it('backlog : priorisation et rétrospective', async () => {
    const backlog = await request(app).get('/api/sprints/backlog').query({ teamId: ids.webTeam }).set(as('tutor'));
    const reversed = backlog.body.map((t: { id: number }) => t.id).reverse();
    await request(app).patch('/api/sprints/backlog/order').set(as('tutor')).send({ teamId: ids.webTeam, taskIds: reversed }).expect(200);
    const after = await request(app).get('/api/sprints/backlog').query({ teamId: ids.webTeam }).set(as('tutor'));
    expect(after.body[0].id).toBe(reversed[0]);
    const sprints = await request(app).get('/api/sprints').query({ teamId: ids.webTeam }).set(as('employee'));
    expect(sprints.status).toBe(200);
    await request(app).put(`/api/sprints/${sprints.body[0].id}/retro`).set(as('tutor')).send({ positive: 'A', improve: 'B', actions: 'C' }).expect(200);
    expect((await request(app).get('/api/sprints').query({ teamId: ids.mobileTeam }).set(as('intern'))).status).toBe(403);
  });
  it('stages : liste filtrée, modification et fin de délégation', async () => {
    const list = await request(app).get('/api/internships').query({ status: 'active', search: 'Kevin' }).set(as('admin'));
    expect(list.body.length).toBe(1);
    const s = list.body[0];
    const upd = await request(app).put(`/api/internships/${s.id}`).set(as('tutor')).send({
      internId: s.internId, tutorId: s.tutorId, school: s.school, subject: 'Refonte du portail client (v2)', objectives: s.objectives, startDate: s.startDate, endDate: s.endDate,
    });
    expect(upd.status).toBe(200);
    expect(upd.body.subject).toBe('Refonte du portail client (v2)');
    await request(app).delete(`/api/internships/${s.id}/delegate`).set(as('tutor')).expect(200);
    expect((await request(app).get(`/api/internships/${s.id}`).set(as('employee'))).status).toBe(404);
  });
  it('fiches et exports complémentaires', async () => {
    const u = await request(app).get(`/api/users/${ids.intern}`).set(as('tutor'));
    expect(u.body.internships.length).toBe(1);
    expect((await request(app).get(`/api/users/${ids.tutor2}`).set(as('intern'))).status).toBe(403);
    for (const type of ['tasks', 'issues', 'users', 'global']) {
      const r = await request(app).get('/api/reports/export').query({ type, format: 'xlsx' }).set(as('admin'));
      expect(r.status).toBe(200);
    }
    const reset = await request(app).post(`/api/users/${ids.herve}/reset-password`).set(as('admin'));
    expect(reset.body.temporaryPassword).toBeTruthy();
  });
});
