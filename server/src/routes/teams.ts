import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { canManageTeam } from '../services/scope.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, parseId } from '../utils/http.js';

export const departmentsRouter = Router();
export const teamsRouter = Router();
departmentsRouter.use(authenticate);
teamsRouter.use(authenticate);

/* ----------------------------- Départements ----------------------------- */

const deptSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis.').max(120),
  description: z.string().trim().max(1000).optional().nullable(),
});

departmentsRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(
      await query(`SELECT d.*, (SELECT count(*) FROM users u WHERE u.department_id = d.id AND u.is_active) AS member_count,
        (SELECT count(*) FROM teams t WHERE t.department_id = d.id) AS team_count FROM departments d ORDER BY d.name`),
    );
  }),
);

departmentsRouter.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const d = deptSchema.parse(req.body);
    const row = await queryOne('INSERT INTO departments (name, description) VALUES ($1, $2) RETURNING *', [d.name, d.description ?? null]);
    await logActivity({ userId: req.user!.id, action: 'department_created', entity: 'department', entityId: row.id, summary: `Département créé : ${d.name}`, req });
    res.status(201).json(row);
  }),
);

departmentsRouter.put(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const d = deptSchema.parse(req.body);
    const row = await queryOne('UPDATE departments SET name = $2, description = $3 WHERE id = $1 RETURNING *', [id, d.name, d.description ?? null]);
    if (!row) throw notFound('Département');
    res.json(row);
  }),
);

departmentsRouter.delete(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const used = await queryOne(
      'SELECT (SELECT count(*) FROM users WHERE department_id = $1) + (SELECT count(*) FROM teams WHERE department_id = $1) AS n', [id]);
    if (used.n > 0) throw conflict('Ce département contient encore des équipes ou des personnes.');
    await query('DELETE FROM departments WHERE id = $1', [id]);
    res.json({ ok: true });
  }),
);

/* -------------------------------- Équipes ------------------------------- */

const TEAM_LIST_SQL = `
  SELECT t.id, t.name, t.description, t.lead_id, t.department_id, t.wip_in_progress, t.wip_review, t.created_at,
    d.name AS department_name,
    CASE WHEN l.id IS NULL THEN NULL ELSE json_build_object('id', l.id, 'first_name', l.first_name,
      'last_name', l.last_name, 'avatar_url', l.avatar_url, 'role', l.role) END AS lead,
    (SELECT count(*) FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = t.id AND u.is_active) AS member_count,
    (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status <> 'backlog') AS task_count,
    (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status = 'done') AS done_count,
    (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status NOT IN ('done','backlog') AND k.due_date < CURRENT_DATE) AS overdue_count,
    (SELECT COALESCE(round(avg(k.progress)), 0) FROM tasks k WHERE k.team_id = t.id AND k.status <> 'backlog') AS avg_progress,
    (SELECT json_build_object('id', s.id, 'name', s.name, 'end_date', s.end_date) FROM sprints s
       WHERE s.team_id = t.id AND s.status = 'active') AS active_sprint
  FROM teams t
  LEFT JOIN users l ON l.id = t.lead_id
  LEFT JOIN departments d ON d.id = t.department_id`;

teamsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const mine = req.query.mine === 'true';
    const rows = mine
      ? await query(`${TEAM_LIST_SQL} WHERE t.lead_id = $1 OR t.id IN (SELECT team_id FROM team_members WHERE user_id = $1) ORDER BY t.name`, [req.user!.id])
      : await query(`${TEAM_LIST_SQL} ORDER BY t.name`);
    res.json(rows);
  }),
);

teamsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const team = await queryOne(`${TEAM_LIST_SQL} WHERE t.id = $1`, [id]);
    if (!team) throw notFound('Équipe');
    const members = await query(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.job_title, u.avatar_url, u.wip_limit, u.is_active, m.joined_at
       FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = $1 ORDER BY u.last_name`,
      [id],
    );
    res.json({ ...team, members, canManage: await canManageTeam(req.user!, id) });
  }),
);

const teamSchema = z.object({
  name: z.string().trim().min(2, 'Nom requis.').max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  leadId: z.number().int().positive().optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
  memberIds: z.array(z.number().int().positive()).optional(),
});

async function assertLead(leadId: number | null | undefined) {
  if (!leadId) return;
  const lead = await queryOne('SELECT role, is_active FROM users WHERE id = $1', [leadId]);
  if (!lead || !lead.is_active || !['admin', 'tutor'].includes(lead.role)) {
    throw badRequest("Le chef d'équipe doit être un tuteur ou un administrateur actif.");
  }
}

// US-03 / F-06 : gestion des équipes (admin)
teamsRouter.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const t = teamSchema.parse(req.body);
    await assertLead(t.leadId);
    const team = await transaction(async (db) => {
      const row = await queryOne(
        'INSERT INTO teams (name, description, lead_id, department_id) VALUES ($1,$2,$3,$4) RETURNING id',
        [t.name, t.description ?? null, t.leadId ?? null, t.departmentId ?? null], db);
      const members = new Set([...(t.memberIds ?? []), ...(t.leadId ? [t.leadId] : [])]);
      for (const uid of members) await query('INSERT INTO team_members (team_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [row.id, uid], db);
      await logActivity({ userId: req.user!.id, action: 'team_created', entity: 'team', entityId: row.id, summary: `Équipe créée : ${t.name}`, req }, db);
      return row;
    });
    res.status(201).json(await queryOne(`${TEAM_LIST_SQL} WHERE t.id = $1`, [team.id]));
  }),
);

teamsRouter.put(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const t = teamSchema.parse(req.body);
    await assertLead(t.leadId);
    await transaction(async (db) => {
      const row = await queryOne('UPDATE teams SET name=$2, description=$3, lead_id=$4, department_id=$5 WHERE id=$1 RETURNING id',
        [id, t.name, t.description ?? null, t.leadId ?? null, t.departmentId ?? null], db);
      if (!row) throw notFound('Équipe');
      if (t.memberIds) {
        const members = [...new Set([...t.memberIds, ...(t.leadId ? [t.leadId] : [])])];
        await query('DELETE FROM team_members WHERE team_id = $1 AND NOT (user_id = ANY($2::int[]))', [id, members], db);
        for (const uid of members) await query('INSERT INTO team_members (team_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, uid], db);
      } else if (t.leadId) {
        await query('INSERT INTO team_members (team_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, t.leadId], db);
      }
      await logActivity({ userId: req.user!.id, action: 'team_updated', entity: 'team', entityId: id, summary: `Équipe modifiée : ${t.name}`, req }, db);
    });
    res.json(await queryOne(`${TEAM_LIST_SQL} WHERE t.id = $1`, [id]));
  }),
);

teamsRouter.post(
  '/:id/members',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { userId } = z.object({ userId: z.number().int().positive() }).parse(req.body);
    await query('INSERT INTO team_members (team_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, userId]);
    await logActivity({ userId: req.user!.id, action: 'member_added', entity: 'team', entityId: id, details: { userId }, req });
    res.status(201).json({ ok: true });
  }),
);

teamsRouter.delete(
  '/:id/members/:userId',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const userId = parseId(req.params.userId);
    const team = await queryOne('SELECT lead_id FROM teams WHERE id = $1', [id]);
    if (team?.lead_id === userId) throw badRequest("Désignez un autre chef d'équipe avant de retirer celui-ci.");
    await query('DELETE FROM team_members WHERE team_id = $1 AND user_id = $2', [id, userId]);
    await logActivity({ userId: req.user!.id, action: 'member_removed', entity: 'team', entityId: id, details: { userId }, req });
    res.json({ ok: true });
  }),
);

// F-19 : limites WIP par colonne
teamsRouter.patch(
  '/:id/wip',
  requireRole('admin', 'tutor'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await canManageTeam(req.user!, id))) throw forbidden();
    const w = z.object({
      inProgress: z.number().int().min(1).max(50).nullable(),
      review: z.number().int().min(1).max(50).nullable(),
    }).parse(req.body);
    await query('UPDATE teams SET wip_in_progress = $2, wip_review = $3 WHERE id = $1', [id, w.inProgress, w.review]);
    await logActivity({ userId: req.user!.id, action: 'wip_changed', entity: 'team', entityId: id, details: w, req });
    res.json({ ok: true });
  }),
);
