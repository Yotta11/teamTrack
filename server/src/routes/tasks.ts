import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { fileUpload, uploadDir } from '../middleware/upload.js';
import { logActivity } from '../services/activity.js';
import { notify } from '../services/notifications.js';
import { canManageTeam, taskScopeSql } from '../services/scope.js';
import {
  PRIORITY_ORDER,
  STATUS_LABEL,
  TASK_PRIORITIES,
  TASK_SELECT,
  TASK_STATUSES,
  type TaskStatus,
  assertNotBlocked,
  canEditTask,
  canManageTask,
  checkWip,
  isAssignee,
  loadTaskFor,
  recalcProgress,
  validateAssignees,
  wipMessage,
} from '../services/tasks.js';
import { asyncHandler, badRequest, forbidden, notFound, parseId } from '../utils/http.js';

const router = Router();
router.use(authenticate);

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.');

/* ------------------------------- Listes -------------------------------- */

function buildFilters(req: import('express').Request) {
  const u = req.user!;
  const params: unknown[] = [u.id];
  const where = [taskScopeSql(u, 1)];
  const add = (sql: string, value: unknown) => {
    params.push(value);
    where.push(sql.replaceAll('$?', `$${params.length}`));
  };
  const q = req.query as Record<string, string>;
  if (q.teamId) add('t.team_id = $?', Number(q.teamId));
  if (q.sprintId === 'none') where.push('t.sprint_id IS NULL');
  else if (q.sprintId) add('t.sprint_id = $?', Number(q.sprintId));
  if (q.status && TASK_STATUSES.includes(q.status as TaskStatus)) add('t.status = $?', q.status);
  else if (q.backlog === 'true') where.push(`t.status = 'backlog'`);
  else if (q.backlog !== 'all') where.push(`t.status <> 'backlog'`);
  if (q.priority && TASK_PRIORITIES.includes(q.priority as never)) add('t.priority = $?', q.priority);
  if (q.assigneeId) add('EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.active AND a.user_id = $?)', Number(q.assigneeId));
  if (q.mine === 'true') add('EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.active AND a.user_id = $?)', u.id);
  if (q.label) add('$? = ANY(t.labels)', q.label);
  if (q.search) add('(t.title ILIKE $? OR t.description ILIKE $?)', `%${q.search}%`);
  if (q.due === 'overdue') where.push(`t.status NOT IN ('done','backlog') AND t.due_date < CURRENT_DATE`);
  if (q.due === 'soon') where.push(`t.status NOT IN ('done','backlog') AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2`);
  if (q.due === 'today') where.push(`t.due_date = CURRENT_DATE`);
  if (q.due === 'week') where.push(`t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 7`);
  return { params, where: where.join(' AND ') };
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { params, where } = buildFilters(req);
    const order =
      req.query.backlog === 'true'
        ? `t.position, ${PRIORITY_ORDER}, t.created_at`
        : `t.due_date NULLS LAST, ${PRIORITY_ORDER}, t.id`;
    res.json(await query(`${TASK_SELECT} WHERE ${where} ORDER BY ${order} LIMIT 1000`, params));
  }),
);

// F-18 / F-19 : données du tableau Kanban avec indicateurs WIP
router.get(
  '/board',
  asyncHandler(async (req, res) => {
    const { params, where } = buildFilters(req);
    const tasks = await query(`${TASK_SELECT} WHERE ${where} ORDER BY ${PRIORITY_ORDER}, t.due_date NULLS LAST, t.id`, params);
    const teamId = req.query.teamId ? Number(req.query.teamId) : null;
    const team = teamId
      ? await queryOne('SELECT id, name, wip_in_progress, wip_review FROM teams WHERE id = $1', [teamId])
      : null;
    const people = await query(
      `SELECT u.id, u.first_name, u.last_name, u.avatar_url, u.role, u.wip_limit,
         (SELECT count(*) FROM task_assignments a JOIN tasks k ON k.id = a.task_id
           WHERE a.user_id = u.id AND a.active AND k.status = 'in_progress') AS in_progress
       FROM users u WHERE u.is_active AND u.id IN (
         SELECT a.user_id FROM task_assignments a WHERE a.active AND a.task_id = ANY($1::int[])
         UNION SELECT m.user_id FROM team_members m WHERE m.team_id = $2)
       ORDER BY u.first_name`,
      [tasks.map((t) => t.id), teamId ?? 0],
    );
    res.json({
      tasks,
      team,
      people,
      canManage: teamId ? await canManageTeam(req.user!, teamId) : req.user!.role === 'admin',
    });
  }),
);

router.get(
  '/labels',
  asyncHandler(async (req, res) => {
    const rows = await query(
      `SELECT DISTINCT unnest(t.labels) AS label FROM tasks t WHERE ${taskScopeSql(req.user!, 1)} ORDER BY 1`,
      [req.user!.id],
    );
    const defaults = ['front', 'back', 'test', 'documentation', 'design', 'devops'];
    res.json([...new Set([...defaults, ...rows.map((r) => r.label)])]);
  }),
);

/* ------------------------------- Détail -------------------------------- */

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const task = await loadTaskFor(req.user!, id);
    const [subtasks, comments, attachments, assignmentHistory, progressUpdates, activity, issues, creator] = await Promise.all([
      query('SELECT * FROM subtasks WHERE task_id = $1 ORDER BY position, id', [id]),
      query(`SELECT c.id, c.content, c.created_at, json_build_object('id', u.id, 'first_name', u.first_name,
               'last_name', u.last_name, 'avatar_url', u.avatar_url, 'role', u.role) AS author
             FROM task_comments c JOIN users u ON u.id = c.author_id WHERE c.task_id = $1 ORDER BY c.created_at`, [id]),
      query(`SELECT f.id, f.file_name, f.mime, f.size, f.uploaded_at, u.first_name || ' ' || u.last_name AS uploaded_by_name
             FROM task_attachments f LEFT JOIN users u ON u.id = f.uploaded_by WHERE f.task_id = $1 ORDER BY f.uploaded_at DESC`, [id]),
      query(`SELECT a.id, a.active, a.assigned_at, a.unassigned_at,
               u.first_name || ' ' || u.last_name AS user_name, d.first_name || ' ' || d.last_name AS delegated_by_name
             FROM task_assignments a JOIN users u ON u.id = a.user_id LEFT JOIN users d ON d.id = a.delegated_by
             WHERE a.task_id = $1 ORDER BY a.assigned_at DESC`, [id]),
      query(`SELECT p.id, p.progress, p.note, p.created_at, u.first_name || ' ' || u.last_name AS user_name
             FROM progress_updates p JOIN users u ON u.id = p.user_id WHERE p.task_id = $1 ORDER BY p.created_at DESC`, [id]),
      query(`SELECT l.id, l.action, l.summary, l.created_at, u.first_name || ' ' || u.last_name AS user_name
             FROM activity_log l LEFT JOIN users u ON u.id = l.user_id
             WHERE l.entity = 'task' AND l.entity_id = $1 ORDER BY l.created_at DESC LIMIT 100`, [id]),
      query(`SELECT id, title, severity, status, reported_at FROM issues WHERE task_id = $1 ORDER BY reported_at DESC`, [id]),
      queryOne(`SELECT id, first_name, last_name, avatar_url, role FROM users WHERE id = $1`, [task.creator_id]),
    ]);
    const canManage = await canManageTask(req.user!, task);
    res.json({
      ...task,
      creator,
      subtasks,
      comments,
      attachments,
      assignmentHistory,
      progressUpdates,
      activity,
      issues,
      permissions: {
        canManage,
        canEdit: canManage || task.creator_id === req.user!.id,
        canUpdateProgress: canManage || isAssignee(req.user!, task),
      },
    });
  }),
);

/* ------------------------------ Création ------------------------------- */

const taskSchema = z.object({
  title: z.string().trim().min(3, 'Titre requis (3 caractères minimum).').max(200),
  description: z.string().trim().max(10000).optional().nullable(),
  priority: z.enum(TASK_PRIORITIES).default('normal'),
  dueDate: dateStr.optional().nullable(),
  estimateHours: z.number().min(0).max(999).optional().nullable(),
  storyPoints: z.number().int().min(0).max(100).optional().nullable(),
  labels: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10).default([]),
  teamId: z.number().int().positive(),
  sprintId: z.number().int().positive().optional().nullable(),
  status: z.enum(['backlog', 'todo']).default('todo'),
  assigneeIds: z.array(z.number().int().positive()).default([]),
  subtasks: z.array(z.object({ title: z.string().trim().min(1).max(200), weight: z.number().int().min(1).max(10).default(1) })).max(50).default([]),
});

// US-05 / F-13 / F-14 : création et délégation d'une tâche
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const d = taskSchema.parse(req.body);
    if (u.role === 'intern') throw forbidden('Les stagiaires ne créent pas de tâches. Signalez plutôt une difficulté à votre tuteur.');
    if (u.role === 'employee') {
      const member = await queryOne('SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2', [d.teamId, u.id]);
      if (!member) throw forbidden("Vous n'êtes pas membre de cette équipe.");
      if (d.assigneeIds.some((id) => id !== u.id)) throw forbidden('Un employé ne peut créer une tâche que pour lui-même.');
      if (d.assigneeIds.length === 0) d.assigneeIds = [u.id];
    } else if (!(await canManageTeam(u, d.teamId))) {
      throw forbidden("Vous ne gérez pas cette équipe.");
    }
    // RG-03 : au moins un responsable (les éléments du backlog peuvent être affectés lors de la planification)
    if (d.status !== 'backlog' && d.assigneeIds.length === 0) throw badRequest('Affectez la tâche à au moins une personne.', 'RG-03');
    await validateAssignees(d.teamId, d.assigneeIds, d.dueDate);
    if (d.sprintId) {
      const sp = await queryOne(`SELECT team_id, status FROM sprints WHERE id = $1`, [d.sprintId]);
      if (!sp || sp.team_id !== d.teamId || sp.status === 'closed') throw badRequest('Sprint invalide pour cette équipe.');
    }

    const created = await transaction(async (db) => {
      const pos = await queryOne(`SELECT COALESCE(max(position), 0) + 1 AS p FROM tasks WHERE team_id = $1`, [d.teamId], db);
      const t = await queryOne(
        `INSERT INTO tasks (title, description, priority, due_date, estimate_hours, story_points, labels, team_id, sprint_id, status, creator_id, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [d.title, d.description ?? null, d.priority, d.dueDate ?? null, d.estimateHours ?? null, d.storyPoints ?? null,
          d.labels, d.teamId, d.sprintId ?? null, d.status, u.id, pos.p],
        db,
      );
      for (const uid of new Set(d.assigneeIds)) {
        await query('INSERT INTO task_assignments (task_id, user_id, delegated_by) VALUES ($1,$2,$3)', [t.id, uid, u.id], db);
      }
      for (const [i, s] of d.subtasks.entries()) {
        await query('INSERT INTO subtasks (task_id, title, weight, position) VALUES ($1,$2,$3,$4)', [t.id, s.title, s.weight, i], db);
      }
      if (d.subtasks.length) await recalcProgress(t.id, db);
      await logActivity({ userId: u.id, action: 'task_created', entity: 'task', entityId: t.id, summary: `Tâche créée : ${d.title}`, req }, db);
      await notify({ recipients: d.assigneeIds, excludeUserId: u.id, type: 'task_assigned', link: `/taches/${t.id}`,
        message: `${u.firstName} ${u.lastName} vous a confié la tâche « ${d.title} »${d.dueDate ? ` (échéance ${d.dueDate})` : ''}.` }, db);
      return t;
    });
    res.status(201).json(await queryOne(`${TASK_SELECT} WHERE t.id = $1`, [created.id]));
  }),
);

/* ---------------------------- Modification ----------------------------- */

const updateSchema = taskSchema.pick({
  title: true, description: true, priority: true, dueDate: true, estimateHours: true, storyPoints: true, labels: true,
}).partial();

router.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const task = await loadTaskFor(req.user!, id);
    if (!(await canEditTask(req.user!, task))) throw forbidden();
    const d = updateSchema.parse(req.body);
    if (d.dueDate !== undefined && d.dueDate !== task.due_date) {
      await validateAssignees(task.team_id, task.assignees.map((a: { id: number }) => a.id), d.dueDate);
    }
    await query(
      `UPDATE tasks SET title = COALESCE($2, title), description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         priority = COALESCE($5, priority), due_date = CASE WHEN $6::boolean THEN $7::date ELSE due_date END,
         estimate_hours = CASE WHEN $8::boolean THEN $9 ELSE estimate_hours END,
         story_points = CASE WHEN $10::boolean THEN $11 ELSE story_points END,
         labels = COALESCE($12, labels), updated_at = now() WHERE id = $1`,
      [id, d.title ?? null, d.description !== undefined, d.description ?? null, d.priority ?? null,
        d.dueDate !== undefined, d.dueDate ?? null, d.estimateHours !== undefined, d.estimateHours ?? null,
        d.storyPoints !== undefined, d.storyPoints ?? null, d.labels ?? null],
    );
    const changed = Object.keys(d).join(', ');
    await logActivity({ userId: req.user!.id, action: 'task_updated', entity: 'task', entityId: id, summary: `Tâche modifiée (${changed})`, req });
    res.json(await queryOne(`${TASK_SELECT} WHERE t.id = $1`, [id]));
  }),
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const task = await loadTaskFor(req.user!, id);
    if (!(await canManageTask(req.user!, task))) throw forbidden();
    await query('DELETE FROM tasks WHERE id = $1', [id]);
    await logActivity({ userId: req.user!.id, action: 'task_deleted', entity: 'task', entityId: id, summary: `Tâche supprimée : ${task.title}`, req });
    res.json({ ok: true });
  }),
);

/* ---------------------- Kanban : changement de statut ---------------------- */

router.patch(
  '/:id/status',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const id = parseId(req.params.id);
    const { status, force } = z.object({ status: z.enum(TASK_STATUSES), force: z.boolean().optional() }).parse(req.body);
    const task = await loadTaskFor(u, id);
    const manager = await canManageTask(u, task);
    if (!manager && !isAssignee(u, task)) throw forbidden('Vous ne pouvez déplacer que vos propres tâches.');
    if (status === task.status) return res.json(task);
    if ((status === 'backlog' || task.status === 'backlog') && !manager) {
      throw forbidden('Seul le chef d\'équipe gère le backlog.');
    }
    if (status !== 'backlog' && status !== 'todo' && task.assignees.length === 0) {
      throw badRequest('Affectez cette tâche à quelqu\'un avant de la démarrer.', 'RG-03');
    }
    // RG-02 : « Terminé » uniquement si 100 % ou validation par le tuteur
    let validated = false;
    if (status === 'done' && task.progress < 100) {
      if (!manager) {
        throw badRequest(`Avancement à ${task.progress} % : la tâche doit être à 100 % ou validée par votre tuteur pour passer en « Terminé ».`, 'RG-02');
      }
      validated = true;
    }
    const violations = await checkWip(task, status);
    assertNotBlocked(violations, manager, !!force);

    await transaction(async (db) => {
      await query(
        `UPDATE tasks SET status = $2::task_status,
           progress = CASE WHEN $3::boolean THEN 100 ELSE progress END,
           validated_by = CASE WHEN $2::task_status = 'done' AND $3::boolean THEN $4::int WHEN $2::task_status = 'done' THEN validated_by ELSE NULL END,
           started_at = CASE WHEN $2::task_status = 'in_progress' AND started_at IS NULL THEN now() ELSE started_at END,
           completed_at = CASE WHEN $2::task_status = 'done' THEN now() ELSE NULL END,
           sprint_id = CASE WHEN $2::task_status = 'backlog' THEN NULL ELSE sprint_id END,
           updated_at = now()
         WHERE id = $1`,
        [id, status, validated, u.id],
        db,
      );
      await logActivity({ userId: u.id, action: 'task_moved', entity: 'task', entityId: id,
        summary: `Déplacée de « ${STATUS_LABEL[task.status as TaskStatus]} » vers « ${STATUS_LABEL[status]} »${validated ? ' (validée par le tuteur)' : ''}${violations.length ? ' — limite WIP dépassée' : ''}`,
        details: { from: task.status, to: status }, req }, db);
      const recipients = [...task.assignees.map((a: { id: number }) => a.id), task.creator_id];
      await notify({ recipients, excludeUserId: u.id, type: 'task_status', link: `/taches/${id}`, email: status === 'review' || status === 'done',
        message: `« ${task.title} » est passée en ${STATUS_LABEL[status]}.` }, db);
      if (violations.length) {
        await notify({ recipients: [task.creator_id], excludeUserId: u.id, type: 'wip_exceeded', link: '/kanban', email: false,
          message: `Limite WIP dépassée : ${wipMessage(violations)}.` }, db);
      }
    });
    res.json({ ...(await queryOne(`${TASK_SELECT} WHERE t.id = $1`, [id])), wipWarnings: violations });
  }),
);

/* ------------------------- Avancement (F-24) --------------------------- */

router.patch(
  '/:id/progress',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const id = parseId(req.params.id);
    const { progress, note } = z.object({
      progress: z.number().int().min(0).max(100),
      note: z.string().trim().max(2000).optional(),
    }).parse(req.body);
    const task = await loadTaskFor(u, id);
    if (!isAssignee(u, task) && !(await canManageTask(u, task))) throw forbidden('Seules les personnes affectées peuvent déclarer l\'avancement.');
    if (task.subtask_count > 0) throw badRequest("L'avancement de cette tâche est calculé automatiquement à partir de ses sous-tâches.", 'RG-05');
    if (task.status === 'done') throw badRequest('Cette tâche est terminée.');
    await transaction(async (db) => {
      await query(
        `UPDATE tasks SET progress = $2, updated_at = now(),
           status = CASE WHEN status = 'todo' AND $2 > 0 THEN 'in_progress'::task_status ELSE status END,
           started_at = CASE WHEN status = 'todo' AND $2 > 0 THEN now() ELSE started_at END
         WHERE id = $1`, [id, progress], db);
      await query('INSERT INTO progress_updates (task_id, user_id, progress, note) VALUES ($1,$2,$3,$4)', [id, u.id, progress, note ?? null], db);
      await logActivity({ userId: u.id, action: 'task_progress', entity: 'task', entityId: id,
        summary: `Avancement : ${task.progress} % → ${progress} %${note ? ` — ${note}` : ''}`, req }, db);
      await notify({ recipients: [task.creator_id], excludeUserId: u.id, type: 'task_status', link: `/taches/${id}`, email: false,
        message: `${u.firstName} ${u.lastName} a mis à jour « ${task.title} » : ${progress} %.` }, db);
    });
    res.json(await queryOne(`${TASK_SELECT} WHERE t.id = $1`, [id]));
  }),
);

/* -------------------- Délégation / réaffectation (F-14) -------------------- */

router.post(
  '/:id/assign',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const id = parseId(req.params.id);
    const { userIds, note } = z.object({
      userIds: z.array(z.number().int().positive()).min(1, 'Choisissez au moins une personne.'),
      note: z.string().trim().max(500).optional(),
    }).parse(req.body);
    const task = await loadTaskFor(u, id);
    const manager = await canManageTask(u, task);
    if (!manager) {
      if (u.role !== 'employee' || task.creator_id !== u.id || userIds.some((x) => x !== u.id)) {
        throw forbidden('Seul le chef d\'équipe peut déléguer cette tâche.');
      }
    }
    await validateAssignees(task.team_id, userIds, task.due_date);
    const current: number[] = task.assignees.map((a: { id: number }) => a.id);
    const added = userIds.filter((x) => !current.includes(x));
    const removed = current.filter((x) => !userIds.includes(x));
    await transaction(async (db) => {
      if (removed.length) {
        await query(`UPDATE task_assignments SET active = FALSE, unassigned_at = now() WHERE task_id = $1 AND active AND user_id = ANY($2::int[])`, [id, removed], db);
      }
      for (const uid of added) await query('INSERT INTO task_assignments (task_id, user_id, delegated_by) VALUES ($1,$2,$3)', [id, uid, u.id], db);
      const names = await query(`SELECT id, first_name || ' ' || last_name AS name FROM users WHERE id = ANY($1::int[])`, [[...added, ...removed]], db);
      const nameOf = (x: number) => names.find((n) => n.id === x)?.name;
      await logActivity({ userId: u.id, action: 'task_reassigned', entity: 'task', entityId: id,
        summary: [added.length ? `Affectée à ${added.map(nameOf).join(', ')}` : '', removed.length ? `retirée à ${removed.map(nameOf).join(', ')}` : '']
          .filter(Boolean).join(' ; ') + (note ? ` — ${note}` : ''), req }, db);
      await notify({ recipients: added, excludeUserId: u.id, type: 'task_assigned', link: `/taches/${id}`,
        message: `${u.firstName} ${u.lastName} vous a délégué la tâche « ${task.title} »${note ? ` : ${note}` : ''}.` }, db);
      await notify({ recipients: removed, excludeUserId: u.id, type: 'task_assigned', link: `/taches/${id}`, email: false,
        message: `La tâche « ${task.title} » a été réaffectée.` }, db);
    });
    res.json(await queryOne(`${TASK_SELECT} WHERE t.id = $1`, [id]));
  }),
);

/* --------------------------- Sous-tâches (F-15) --------------------------- */

const subtaskSchema = z.object({
  title: z.string().trim().min(1).max(200),
  weight: z.number().int().min(1).max(10).default(1),
});

router.post(
  '/:id/subtasks',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const task = await loadTaskFor(req.user!, id);
    if (!(await canEditTask(req.user!, task)) && !isAssignee(req.user!, task)) throw forbidden();
    const s = subtaskSchema.parse(req.body);
    const row = await queryOne(
      `INSERT INTO subtasks (task_id, title, weight, position) VALUES ($1,$2,$3,(SELECT COALESCE(max(position),0)+1 FROM subtasks WHERE task_id = $1)) RETURNING *`,
      [id, s.title, s.weight]);
    const progress = await recalcProgress(id);
    await logActivity({ userId: req.user!.id, action: 'subtask_added', entity: 'task', entityId: id, summary: `Sous-tâche ajoutée : ${s.title}`, req });
    res.status(201).json({ subtask: row, progress });
  }),
);

router.patch(
  '/:id/subtasks/:sid',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const sid = parseId(req.params.sid);
    const task = await loadTaskFor(req.user!, id);
    if (!(await canEditTask(req.user!, task)) && !isAssignee(req.user!, task)) throw forbidden();
    const d = z.object({ title: z.string().trim().min(1).max(200).optional(), weight: z.number().int().min(1).max(10).optional(), done: z.boolean().optional() }).parse(req.body);
    const row = await queryOne(
      `UPDATE subtasks SET title = COALESCE($3, title), weight = COALESCE($4, weight), done = COALESCE($5, done)
       WHERE id = $2 AND task_id = $1 RETURNING *`, [id, sid, d.title ?? null, d.weight ?? null, d.done ?? null]);
    if (!row) throw notFound('Sous-tâche');
    const progress = await recalcProgress(id);
    if (d.done !== undefined) {
      await logActivity({ userId: req.user!.id, action: 'subtask_checked', entity: 'task', entityId: id,
        summary: `Sous-tâche « ${row.title} » ${d.done ? 'terminée' : 'rouverte'} — avancement ${progress} %`, req });
    }
    res.json({ subtask: row, progress });
  }),
);

router.delete(
  '/:id/subtasks/:sid',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const task = await loadTaskFor(req.user!, id);
    if (!(await canEditTask(req.user!, task))) throw forbidden();
    await query('DELETE FROM subtasks WHERE id = $2 AND task_id = $1', [id, parseId(req.params.sid)]);
    const progress = await recalcProgress(id);
    res.json({ ok: true, progress: progress ?? task.progress });
  }),
);

/* -------------------------- Commentaires (F-16) -------------------------- */

router.post(
  '/:id/comments',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const id = parseId(req.params.id);
    const task = await loadTaskFor(u, id);
    const { content, mentions } = z.object({
      content: z.string().trim().min(1, 'Le commentaire est vide.').max(5000),
      mentions: z.array(z.number().int().positive()).max(20).default([]),
    }).parse(req.body);
    const row = await queryOne(
      `INSERT INTO task_comments (task_id, author_id, content) VALUES ($1,$2,$3)
       RETURNING id, content, created_at`, [id, u.id, content]);
    await logActivity({ userId: u.id, action: 'task_commented', entity: 'task', entityId: id, summary: 'Commentaire ajouté', req });
    // Mentions : uniquement des personnes ayant accès à l'équipe de la tâche
    const allowed = mentions.length
      ? (await query(`SELECT user_id AS id FROM team_members WHERE team_id = $1 AND user_id = ANY($2::int[])
                      UNION SELECT lead_id FROM teams WHERE id = $1 AND lead_id = ANY($2::int[])`, [task.team_id, mentions])).map((r) => r.id)
      : [];
    await notify({ recipients: allowed, excludeUserId: u.id, type: 'task_comment', link: `/taches/${id}`,
      message: `${u.firstName} ${u.lastName} vous a mentionné sur « ${task.title} ».` });
    const others = [...task.assignees.map((a: { id: number }) => a.id), task.creator_id].filter((x) => !allowed.includes(x));
    await notify({ recipients: others, excludeUserId: u.id, type: 'task_comment', link: `/taches/${id}`, email: false,
      message: `Nouveau commentaire de ${u.firstName} ${u.lastName} sur « ${task.title} ».` });
    res.status(201).json({ ...row, author: { id: u.id, first_name: u.firstName, last_name: u.lastName, role: u.role } });
  }),
);

/* ------------------------- Pièces jointes (F-13) ------------------------- */

router.post(
  '/:id/attachments',
  fileUpload('tasks').single('file'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await loadTaskFor(req.user!, id);
    if (!req.file) throw badRequest('Aucun fichier reçu.');
    const row = await queryOne(
      `INSERT INTO task_attachments (task_id, file_name, stored_name, mime, size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, file_name, mime, size, uploaded_at`,
      [id, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user!.id]);
    await logActivity({ userId: req.user!.id, action: 'attachment_added', entity: 'task', entityId: id, summary: `Pièce jointe : ${req.file.originalname}`, req });
    res.status(201).json(row);
  }),
);

router.get(
  '/:id/attachments/:aid',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await loadTaskFor(req.user!, id);
    const f = await queryOne('SELECT * FROM task_attachments WHERE id = $1 AND task_id = $2', [parseId(req.params.aid), id]);
    if (!f) throw notFound('Pièce jointe');
    const filePath = path.join(uploadDir('tasks'), path.basename(f.stored_name));
    if (!fs.existsSync(filePath)) throw notFound('Fichier');
    res.download(filePath, f.file_name);
  }),
);

router.delete(
  '/:id/attachments/:aid',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const task = await loadTaskFor(req.user!, id);
    const f = await queryOne('SELECT * FROM task_attachments WHERE id = $1 AND task_id = $2', [parseId(req.params.aid), id]);
    if (!f) throw notFound('Pièce jointe');
    if (f.uploaded_by !== req.user!.id && !(await canManageTask(req.user!, task))) throw forbidden();
    await query('DELETE FROM task_attachments WHERE id = $1', [f.id]);
    fs.rmSync(path.join(uploadDir('tasks'), path.basename(f.stored_name)), { force: true });
    res.json({ ok: true });
  }),
);

export default router;
