import { Router } from 'express';
import { z } from 'zod';
import { type Queryable, pool, query, queryOne, transaction } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { notify } from '../services/notifications.js';
import { canManageTeam, myTeamsSql } from '../services/scope.js';
import { PRIORITY_ORDER, TASK_SELECT } from '../services/tasks.js';
import { dayRange, daysBetween, today } from '../utils/dates.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, parseId } from '../utils/http.js';

const router = Router();
router.use(authenticate);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.');

async function assertTeamVisible(user: Express.Request['user'], teamId: number) {
  if (user!.role === 'admin') return;
  const row = await queryOne(`SELECT 1 FROM teams WHERE id = $1 AND id IN ${myTeamsSql(2)}`, [teamId, user!.id]);
  if (!row) throw forbidden("Vous n'appartenez pas à cette équipe.");
}

async function loadSprint(user: Express.Request['user'], id: number) {
  const sprint = await queryOne(
    `SELECT s.*, t.name AS team_name FROM sprints s JOIN teams t ON t.id = s.team_id WHERE s.id = $1`, [id]);
  if (!sprint) throw notFound('Sprint');
  await assertTeamVisible(user, sprint.team_id);
  return sprint;
}

async function assertManager(user: Express.Request['user'], teamId: number) {
  if (!(await canManageTeam(user!, teamId))) throw forbidden("Seul le chef d'équipe planifie les sprints.");
}

/** F-22 : reste à faire par jour (points d'effort, ou nombre de tâches si aucun point n'est estimé). */
export async function computeBurndown(sprint: { id: number; start_date: string; end_date: string }, db: Queryable = pool) {
  const tasks = await query<{ story_points: number | null; completed_at: Date | null; status: string }>(
    'SELECT story_points, completed_at, status FROM tasks WHERE sprint_id = $1', [sprint.id], db);
  const usePoints = tasks.some((t) => (t.story_points ?? 0) > 0);
  const weight = (t: { story_points: number | null }) => (usePoints ? t.story_points ?? 0 : 1);
  const total = tasks.reduce((s, t) => s + weight(t), 0);
  const days = dayRange(sprint.start_date, sprint.end_date);
  const span = Math.max(1, days.length - 1);
  const now = today();
  const toDay = (d: Date) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const points = days.map((day, i) => ({
    day,
    ideal: Math.round((total - (total * i) / span) * 10) / 10,
    remaining:
      day > now
        ? null
        : tasks.filter((t) => !(t.status === 'done' && t.completed_at && toDay(t.completed_at) <= day)).reduce((s, t) => s + weight(t), 0),
  }));
  return { unit: usePoints ? 'points' : 'tâches', total, points };
}

const SPRINT_STATS = `
  (SELECT count(*) FROM tasks k WHERE k.sprint_id = s.id) AS task_count,
  (SELECT count(*) FROM tasks k WHERE k.sprint_id = s.id AND k.status = 'done') AS done_count,
  (SELECT COALESCE(sum(k.story_points), 0) FROM tasks k WHERE k.sprint_id = s.id) AS points_total,
  (SELECT COALESCE(sum(k.story_points), 0) FROM tasks k WHERE k.sprint_id = s.id AND k.status = 'done') AS points_done`;

/* ------------------------------ Backlog (F-20) ------------------------------ */

router.get(
  '/backlog',
  asyncHandler(async (req, res) => {
    const teamId = parseId(req.query.teamId, 'Équipe');
    await assertTeamVisible(req.user, teamId);
    res.json(await query(`${TASK_SELECT} WHERE t.team_id = $1 AND t.status = 'backlog' ORDER BY t.position, ${PRIORITY_ORDER}, t.id`, [teamId]));
  }),
);

// Priorisation : nouvel ordre du backlog
router.patch(
  '/backlog/order',
  asyncHandler(async (req, res) => {
    const { teamId, taskIds } = z.object({ teamId: z.number().int().positive(), taskIds: z.array(z.number().int().positive()).max(500) }).parse(req.body);
    await assertManager(req.user, teamId);
    await transaction(async (db) => {
      for (const [i, id] of taskIds.entries()) {
        await query(`UPDATE tasks SET position = $3 WHERE id = $1 AND team_id = $2 AND status = 'backlog'`, [id, teamId, i + 1], db);
      }
    });
    res.json({ ok: true });
  }),
);

/* -------------------------------- Sprints -------------------------------- */

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const teamId = parseId(req.query.teamId, 'Équipe');
    await assertTeamVisible(req.user, teamId);
    res.json(await query(`SELECT s.*, ${SPRINT_STATS} FROM sprints s WHERE s.team_id = $1
      ORDER BY array_position(ARRAY['active','planned','closed']::sprint_status[], s.status), s.start_date DESC`, [teamId]));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const sprint = await loadSprint(req.user, id);
    const [stats, tasks] = await Promise.all([
      queryOne(`SELECT ${SPRINT_STATS} FROM sprints s WHERE s.id = $1`, [id]),
      query(`${TASK_SELECT} WHERE t.sprint_id = $1 ORDER BY array_position(ARRAY['in_progress','review','todo','done']::task_status[], t.status), ${PRIORITY_ORDER}`, [id]),
    ]);
    const burndown = sprint.status === 'closed' && sprint.burndown_snapshot ? sprint.burndown_snapshot : await computeBurndown(sprint);
    res.json({ ...sprint, ...stats, tasks, burndown, canManage: await canManageTeam(req.user!, sprint.team_id) });
  }),
);

const sprintSchema = z.object({
  teamId: z.number().int().positive(),
  name: z.string().trim().min(2, 'Nom requis.').max(120),
  goal: z.string().trim().max(2000).optional().nullable(),
  startDate: dateStr,
  endDate: dateStr,
});

/** F-21 : un sprint dure de 1 à 2 semaines. */
function assertDuration(start: string, end: string) {
  const days = daysBetween(start, end) + 1;
  if (days < 7 || days > 14) throw badRequest('Un sprint dure entre 1 et 2 semaines (7 à 14 jours).');
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const d = sprintSchema.parse(req.body);
    await assertManager(req.user, d.teamId);
    assertDuration(d.startDate, d.endDate);
    const row = await queryOne(
      'INSERT INTO sprints (team_id, name, goal, start_date, end_date) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [d.teamId, d.name, d.goal ?? null, d.startDate, d.endDate]);
    await logActivity({ userId: req.user!.id, action: 'sprint_created', entity: 'sprint', entityId: row.id, summary: `Sprint créé : ${d.name}`, req });
    res.status(201).json(row);
  }),
);

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const sprint = await loadSprint(req.user, id);
    await assertManager(req.user, sprint.team_id);
    if (sprint.status === 'closed') throw badRequest('Ce sprint est clôturé.');
    const d = sprintSchema.omit({ teamId: true }).parse(req.body);
    assertDuration(d.startDate, d.endDate);
    res.json(await queryOne('UPDATE sprints SET name=$2, goal=$3, start_date=$4, end_date=$5 WHERE id=$1 RETURNING *',
      [id, d.name, d.goal ?? null, d.startDate, d.endDate]));
  }),
);

// Sprint planning : sélection des éléments du backlog
router.post(
  '/:id/items',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const sprint = await loadSprint(req.user, id);
    await assertManager(req.user, sprint.team_id);
    if (sprint.status === 'closed') throw badRequest('Ce sprint est clôturé.');
    const { taskIds } = z.object({ taskIds: z.array(z.number().int().positive()).min(1) }).parse(req.body);
    const rows = await query(
      `UPDATE tasks SET sprint_id = $1, status = CASE WHEN status = 'backlog' THEN 'todo'::task_status ELSE status END, updated_at = now()
       WHERE id = ANY($2::int[]) AND team_id = $3 AND status <> 'done' RETURNING id, title`,
      [id, taskIds, sprint.team_id]);
    for (const r of rows) {
      await logActivity({ userId: req.user!.id, action: 'task_planned', entity: 'task', entityId: r.id, summary: `Ajoutée au sprint « ${sprint.name} »`, req });
    }
    res.json({ added: rows.length });
  }),
);

router.delete(
  '/:id/items/:taskId',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const sprint = await loadSprint(req.user, id);
    await assertManager(req.user, sprint.team_id);
    const taskId = parseId(req.params.taskId);
    await query(`UPDATE tasks SET sprint_id = NULL, status = 'backlog', updated_at = now() WHERE id = $1 AND sprint_id = $2 AND status <> 'done'`, [taskId, id]);
    await logActivity({ userId: req.user!.id, action: 'task_unplanned', entity: 'task', entityId: taskId, summary: `Remise dans le backlog (sprint « ${sprint.name} »)`, req });
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/start',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const sprint = await loadSprint(req.user, id);
    await assertManager(req.user, sprint.team_id);
    if (sprint.status !== 'planned') throw badRequest('Seul un sprint planifié peut démarrer.');
    const active = await queryOne(`SELECT name FROM sprints WHERE team_id = $1 AND status = 'active'`, [sprint.team_id]);
    if (active) throw conflict(`Le sprint « ${active.name} » est déjà en cours. Clôturez-le d'abord.`);
    const count = await queryOne('SELECT count(*) AS n FROM tasks WHERE sprint_id = $1', [id]);
    if (count.n === 0) throw badRequest('Ajoutez des éléments du backlog avant de démarrer le sprint.');
    await query(`UPDATE sprints SET status = 'active' WHERE id = $1`, [id]);
    await logActivity({ userId: req.user!.id, action: 'sprint_started', entity: 'sprint', entityId: id, summary: `Sprint démarré : ${sprint.name}`, req });
    const members = await query('SELECT user_id FROM team_members WHERE team_id = $1', [sprint.team_id]);
    await notify({ recipients: members.map((m) => m.user_id), excludeUserId: req.user!.id, type: 'sprint', email: false,
      link: `/sprints?equipe=${sprint.team_id}`, message: `Le sprint « ${sprint.name} » a démarré (fin le ${sprint.end_date}).` });
    res.json({ ok: true });
  }),
);

// RG-10 : clôture uniquement si les tâches non terminées sont replanifiées ou remises dans le backlog
router.post(
  '/:id/close',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const sprint = await loadSprint(req.user, id);
    await assertManager(req.user, sprint.team_id);
    if (sprint.status !== 'active') throw badRequest('Seul le sprint en cours peut être clôturé.');
    const d = z.object({
      decisions: z.array(z.object({
        taskId: z.number().int().positive(),
        action: z.enum(['backlog', 'sprint']),
        sprintId: z.number().int().positive().optional(),
      })).default([]),
      retro: z.object({ positive: z.string().max(5000).optional(), improve: z.string().max(5000).optional(), actions: z.string().max(5000).optional() }).optional(),
    }).parse(req.body);

    const unfinished = await query(`SELECT id, title FROM tasks WHERE sprint_id = $1 AND status <> 'done'`, [id]);
    const decided = new Map(d.decisions.map((x) => [x.taskId, x]));
    const missing = unfinished.filter((t) => !decided.has(t.id));
    if (missing.length) {
      throw conflict(`${missing.length} tâche(s) non terminée(s) doivent être replanifiées ou remises dans le backlog.`, 'RG-10', { taskIds: missing.map((m) => m.id) });
    }
    for (const x of d.decisions) {
      if (x.action === 'sprint') {
        const target = x.sprintId ? await queryOne(`SELECT team_id, status FROM sprints WHERE id = $1`, [x.sprintId]) : null;
        if (!target || target.team_id !== sprint.team_id || target.status !== 'planned' || x.sprintId === id) {
          throw badRequest('Choisissez un sprint planifié de la même équipe pour replanifier.');
        }
      }
    }
    const snapshot = await computeBurndown(sprint);
    await transaction(async (db) => {
      for (const t of unfinished) {
        const x = decided.get(t.id)!;
        if (x.action === 'backlog') {
          await query(`UPDATE tasks SET sprint_id = NULL, status = 'backlog', updated_at = now() WHERE id = $1`, [t.id], db);
        } else {
          await query(`UPDATE tasks SET sprint_id = $2, updated_at = now() WHERE id = $1`, [t.id, x.sprintId], db);
        }
        await logActivity({ userId: req.user!.id, action: 'task_replanned', entity: 'task', entityId: t.id,
          summary: x.action === 'backlog' ? 'Remise dans le backlog à la clôture du sprint' : 'Replanifiée dans le sprint suivant', req }, db);
      }
      await query(
        `UPDATE sprints SET status = 'closed', closed_at = now(), burndown_snapshot = $2,
           retro_positive = COALESCE($3, retro_positive), retro_improve = COALESCE($4, retro_improve), retro_actions = COALESCE($5, retro_actions)
         WHERE id = $1`,
        [id, JSON.stringify(snapshot), d.retro?.positive ?? null, d.retro?.improve ?? null, d.retro?.actions ?? null], db);
      await logActivity({ userId: req.user!.id, action: 'sprint_closed', entity: 'sprint', entityId: id, summary: `Sprint clôturé : ${sprint.name}`, req }, db);
    });
    res.json({ ok: true });
  }),
);

// F-23 : rétrospective
router.put(
  '/:id/retro',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const sprint = await loadSprint(req.user, id);
    await assertManager(req.user, sprint.team_id);
    const r = z.object({ positive: z.string().max(5000).default(''), improve: z.string().max(5000).default(''), actions: z.string().max(5000).default('') }).parse(req.body);
    await query('UPDATE sprints SET retro_positive = $2, retro_improve = $3, retro_actions = $4 WHERE id = $1', [id, r.positive, r.improve, r.actions]);
    await logActivity({ userId: req.user!.id, action: 'retro_saved', entity: 'sprint', entityId: id, summary: 'Rétrospective enregistrée', req });
    res.json({ ok: true });
  }),
);

export default router;
