import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { authenticate, isManager, requireRole } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { adminIds, notify } from '../services/notifications.js';
import { issueScopeSql, supervisorsOf, taskScopeSql } from '../services/scope.js';
import { asyncHandler, badRequest, forbidden, notFound, parseId } from '../utils/http.js';

const router = Router();
router.use(authenticate);

export const ISSUE_TYPES = ['technical', 'organizational', 'skill', 'resource', 'personal'] as const;
export const ISSUE_SEVERITIES = ['low', 'medium', 'critical'] as const;
export const ISSUE_STATUSES = ['open', 'analysis', 'in_progress', 'resolved', 'escalated'] as const;
const STATUS_LABEL: Record<string, string> = {
  open: 'ouverte', analysis: 'en analyse', in_progress: 'en cours de résolution', resolved: 'résolue', escalated: 'escaladée',
};

const ISSUE_SELECT = `
  SELECT i.*,
    json_build_object('id', r.id, 'first_name', r.first_name, 'last_name', r.last_name, 'role', r.role, 'avatar_url', r.avatar_url) AS reporter,
    CASE WHEN k.id IS NULL THEN NULL ELSE json_build_object('id', k.id, 'title', k.title, 'team_name', tm.name) END AS task,
    (SELECT count(*) FROM issue_responses x WHERE x.issue_id = i.id) AS response_count,
    (i.status = 'open' AND i.reported_at < now() - interval '3 days') AS is_stale
  FROM issues i
  JOIN users r ON r.id = i.reporter_id
  LEFT JOIN tasks k ON k.id = i.task_id
  LEFT JOIN teams tm ON tm.id = k.team_id`;

async function loadIssue(user: AuthUser, id: number) {
  const row = await queryOne(`${ISSUE_SELECT} WHERE i.id = $1 AND ${issueScopeSql(user, 2)}`, [id, user.id]);
  if (!row) throw notFound('Difficulté');
  return row;
}

/**
 * Un administrateur traite toutes les difficultés ; un tuteur traite celles de son périmètre
 * (déjà filtré par issueScopeSql) sauf les siennes, qui remontent à son responsable.
 */
function canHandle(user: AuthUser, issue: { reporter_id: number }) {
  if (user.role === 'admin') return true;
  return user.role === 'tutor' && issue.reporter_id !== user.id;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const params: unknown[] = [u.id];
    const where = [issueScopeSql(u, 1)];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replaceAll('$?', `$${params.length}`));
    };
    const q = req.query as Record<string, string>;
    if (q.status === 'unresolved') where.push(`i.status <> 'resolved'`);
    else if (q.status && ISSUE_STATUSES.includes(q.status as never)) add('i.status = $?', q.status);
    if (q.severity && ISSUE_SEVERITIES.includes(q.severity as never)) add('i.severity = $?', q.severity);
    if (q.type && ISSUE_TYPES.includes(q.type as never)) add('i.type = $?', q.type);
    if (q.reporterId) add('i.reporter_id = $?', Number(q.reporterId));
    if (q.taskId) add('i.task_id = $?', Number(q.taskId));
    if (q.mine === 'true') add('i.reporter_id = $?', u.id);
    if (q.search) add('(i.title ILIKE $? OR i.description ILIKE $?)', `%${q.search}%`);
    res.json(await query(`${ISSUE_SELECT} WHERE ${where.join(' AND ')}
      ORDER BY (i.status = 'resolved'), array_position(ARRAY['critical','medium','low']::issue_severity[], i.severity), i.reported_at DESC`, params));
  }),
);

// F-32 : statistiques pour identifier les besoins de formation
router.get(
  '/stats',
  requireRole('admin', 'tutor'),
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const scope = issueScopeSql(u, 1);
    const [byType, bySeverity, byStatus, byPerson, byTeam, monthly, resolution] = await Promise.all([
      query(`SELECT i.type AS key, count(*) AS count FROM issues i WHERE ${scope} GROUP BY 1 ORDER BY 2 DESC`, [u.id]),
      query(`SELECT i.severity AS key, count(*) AS count FROM issues i WHERE ${scope} GROUP BY 1`, [u.id]),
      query(`SELECT i.status AS key, count(*) AS count FROM issues i WHERE ${scope} GROUP BY 1`, [u.id]),
      query(`SELECT r.id, r.first_name || ' ' || r.last_name AS name, r.role, count(*) AS count,
               count(*) FILTER (WHERE i.type = 'skill') AS skill_count,
               count(*) FILTER (WHERE i.status <> 'resolved') AS open_count,
               mode() WITHIN GROUP (ORDER BY i.type) AS main_type
             FROM issues i JOIN users r ON r.id = i.reporter_id WHERE ${scope}
             GROUP BY r.id ORDER BY count DESC LIMIT 15`, [u.id]),
      query(`SELECT tm.id, tm.name, count(i.id) AS count, count(i.id) FILTER (WHERE i.status <> 'resolved') AS open_count
             FROM issues i JOIN team_members m ON m.user_id = i.reporter_id JOIN teams tm ON tm.id = m.team_id
             WHERE ${scope} GROUP BY tm.id ORDER BY count DESC`, [u.id]),
      query(`SELECT to_char(date_trunc('month', i.reported_at), 'YYYY-MM') AS month, count(*) AS count
             FROM issues i WHERE ${scope} AND i.reported_at > now() - interval '6 months' GROUP BY 1 ORDER BY 1`, [u.id]),
      queryOne(`SELECT round(avg(extract(epoch FROM (i.resolved_at - i.reported_at)) / 86400)::numeric, 1) AS avg_days,
               count(*) FILTER (WHERE i.status = 'resolved') AS resolved, count(*) AS total
             FROM issues i WHERE ${scope}`, [u.id]),
    ]);
    res.json({ byType, bySeverity, byStatus, byPerson, byTeam, monthly, resolution });
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const issue = await loadIssue(req.user!, id);
    const responses = await query(
      `SELECT x.*, json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name, 'role', u.role, 'avatar_url', u.avatar_url) AS author
       FROM issue_responses x JOIN users u ON u.id = x.author_id WHERE x.issue_id = $1 ORDER BY x.created_at`, [id]);
    res.json({ ...issue, responses, canHandle: canHandle(req.user!, issue) });
  }),
);

const issueSchema = z.object({
  title: z.string().trim().min(3, 'Titre requis.').max(200),
  description: z.string().trim().min(5, 'Décrivez la difficulté.').max(5000),
  type: z.enum(ISSUE_TYPES),
  severity: z.enum(ISSUE_SEVERITIES),
  taskId: z.number().int().positive().optional().nullable(),
});

// US-09 / F-29 : déclaration d'une difficulté (tous les rôles)
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const d = issueSchema.parse(req.body);
    if (d.taskId) {
      const t = await queryOne(`SELECT id FROM tasks t WHERE t.id = $1 AND ${taskScopeSql(u, 2)}`, [d.taskId, u.id]);
      if (!t) throw badRequest('Tâche liée introuvable.');
    }
    const critical = d.severity === 'critical';
    const row = await transaction(async (db) => {
      const issue = await queryOne(
        `INSERT INTO issues (title, description, type, severity, task_id, reporter_id, status, escalated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [d.title, d.description, d.type, d.severity, d.taskId ?? null, u.id, critical ? 'escalated' : 'open', critical ? new Date() : null], db);
      await logActivity({ userId: u.id, action: 'issue_reported', entity: 'issue', entityId: issue.id,
        summary: `Difficulté signalée (${d.severity}) : ${d.title}`, req }, db);
      if (d.taskId) {
        await logActivity({ userId: u.id, action: 'issue_linked', entity: 'task', entityId: d.taskId, summary: `Difficulté signalée : ${d.title}`, req }, db);
      }
      const supervisors = await supervisorsOf(u.id, db);
      // RG-06 : difficulté critique → notification immédiate au tuteur et à l'administrateur
      if (critical) {
        await notify({ recipients: [...supervisors, ...(await adminIds(db))], excludeUserId: u.id, type: 'issue_critical',
          link: `/difficultes/${issue.id}`, message: `Difficulté critique signalée par ${u.firstName} ${u.lastName} : « ${d.title} ».` }, db);
      } else {
        await notify({ recipients: supervisors, excludeUserId: u.id, type: 'issue_reported', link: `/difficultes/${issue.id}`,
          message: `${u.firstName} ${u.lastName} a signalé une difficulté : « ${d.title} ».` }, db);
      }
      return issue;
    });
    res.status(201).json(await queryOne(`${ISSUE_SELECT} WHERE i.id = $1`, [row.id]));
  }),
);

// US-10 / F-30 : traitement par le tuteur
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const id = parseId(req.params.id);
    const issue = await loadIssue(u, id);
    if (!isManager(u) || !canHandle(u, issue)) throw forbidden('Seul le tuteur ou un administrateur traite les difficultés.');
    const d = z.object({
      status: z.enum(ISSUE_STATUSES).optional(),
      response: z.string().trim().max(5000).optional(),
      actionDecided: z.string().trim().max(2000).optional(),
    }).parse(req.body);
    if (!d.status && !d.response && !d.actionDecided) throw badRequest('Indiquez un statut, une réponse ou une action décidée.');
    if (d.status === 'resolved' && !d.response && !d.actionDecided && issue.response_count === 0) {
      throw badRequest('Décrivez la solution apportée avant de marquer la difficulté comme résolue.');
    }
    const newStatus = d.status ?? issue.status;
    await transaction(async (db) => {
      await query(
        `UPDATE issues SET status = $2::issue_status,
           first_response_at = COALESCE(first_response_at, now()),
           resolved_at = CASE WHEN $2::issue_status = 'resolved' THEN now() ELSE NULL END,
           escalated_at = CASE WHEN $2::issue_status = 'escalated' AND escalated_at IS NULL THEN now() ELSE escalated_at END
         WHERE id = $1`, [id, newStatus], db);
      await query(
        `INSERT INTO issue_responses (issue_id, author_id, content, action_decided, from_status, to_status) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, u.id, d.response || (d.status ? `Statut : ${STATUS_LABEL[newStatus]}` : ''), d.actionDecided ?? null,
          issue.status, d.status && d.status !== issue.status ? d.status : null], db);
      await logActivity({ userId: u.id, action: 'issue_updated', entity: 'issue', entityId: id,
        summary: d.status && d.status !== issue.status ? `Statut : ${STATUS_LABEL[issue.status]} → ${STATUS_LABEL[newStatus]}` : 'Réponse apportée', req }, db);
      const resolved = newStatus === 'resolved' && issue.status !== 'resolved';
      await notify({ recipients: [issue.reporter_id], excludeUserId: u.id, type: resolved ? 'issue_resolved' : 'issue_updated',
        link: `/difficultes/${id}`, email: resolved || !!d.response,
        message: resolved ? `Votre difficulté « ${issue.title} » est résolue.` : `${u.firstName} ${u.lastName} a répondu à « ${issue.title} ».` }, db);
      if (d.status === 'escalated' && issue.status !== 'escalated') {
        await notify({ recipients: await adminIds(db), excludeUserId: u.id, type: 'issue_escalated', link: `/difficultes/${id}`,
          message: `Difficulté escaladée par ${u.firstName} ${u.lastName} : « ${issue.title} ».` }, db);
      }
    });
    res.json(await queryOne(`${ISSUE_SELECT} WHERE i.id = $1`, [id]));
  }),
);

// Fil de réponse : le déclarant peut aussi apporter des précisions
router.post(
  '/:id/responses',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const id = parseId(req.params.id);
    const issue = await loadIssue(u, id);
    const { content } = z.object({ content: z.string().trim().min(1, 'Message vide.').max(5000) }).parse(req.body);
    if (issue.status === 'resolved' && !isManager(u)) throw badRequest('Cette difficulté est résolue. Signalez-en une nouvelle si besoin.');
    await query('INSERT INTO issue_responses (issue_id, author_id, content) VALUES ($1,$2,$3)', [id, u.id, content]);
    const recipients = u.id === issue.reporter_id ? await supervisorsOf(u.id) : [issue.reporter_id];
    await notify({ recipients, excludeUserId: u.id, type: 'issue_updated', link: `/difficultes/${id}`, email: false,
      message: `Nouveau message sur la difficulté « ${issue.title} ».` });
    res.status(201).json({ ok: true });
  }),
);

export default router;
