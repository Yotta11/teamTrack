import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import type { AuthUser } from '../middleware/auth.js';
import { canManageTeam, canViewUser, issueScopeSql, myTeamsSql, taskScopeSql } from '../services/scope.js';
import { PRIORITY_ORDER, TASK_SELECT } from '../services/tasks.js';
import { asyncHandler, forbidden, notFound, parseId } from '../utils/http.js';
import { completionRate } from '../utils/progress.js';

const router = Router();
router.use(authenticate);

const MINE = (n: number) => `EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.active AND a.user_id = $${n})`;

/** Statistiques d'avancement sur un ensemble de tâches (une personne F-25, ou un périmètre). */
async function statsFor(whereSql: string, params: unknown[]) {
  const s = await queryOne(
    `SELECT
       count(*) FILTER (WHERE t.status <> 'backlog') AS total,
       count(*) FILTER (WHERE t.status = 'todo') AS todo,
       count(*) FILTER (WHERE t.status = 'in_progress') AS in_progress,
       count(*) FILTER (WHERE t.status = 'review') AS review,
       count(*) FILTER (WHERE t.status = 'done') AS done,
       count(*) FILTER (WHERE t.status NOT IN ('done','backlog') AND t.due_date < CURRENT_DATE) AS overdue,
       count(*) FILTER (WHERE t.status NOT IN ('done','backlog') AND t.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2) AS due_soon,
       count(*) FILTER (WHERE t.status = 'done' AND t.completed_at > now() - interval '7 days') AS done_week,
       count(*) FILTER (WHERE t.status = 'done' AND (t.due_date IS NULL OR t.completed_at::date <= t.due_date)) AS done_on_time,
       COALESCE(sum(t.estimate_hours * (100 - t.progress) / 100.0) FILTER (WHERE t.status NOT IN ('done','backlog')), 0) AS remaining_hours,
       COALESCE(round(avg(t.progress) FILTER (WHERE t.status NOT IN ('done','backlog'))), 0) AS avg_open_progress
     FROM tasks t WHERE ${whereSql}`,
    params,
  );
  return {
    ...s,
    remainingHours: Math.round(Number(s.remaining_hours) * 10) / 10,
    completionRate: completionRate(s.done, s.total),
    onTimeRate: completionRate(s.done_on_time, s.done),
  };
}

export const personStats = (userId: number) => statsFor(MINE(1), [userId]);

const ENTITY_TITLE = `CASE WHEN l.entity = 'task' THEN (SELECT title FROM tasks WHERE id = l.entity_id)
  WHEN l.entity = 'issue' THEN (SELECT title FROM issues WHERE id = l.entity_id) END AS entity_title`;

async function recentActivity(user: AuthUser, limit = 12) {
  if (user.role === 'admin') {
    return query(`SELECT l.id, l.action, l.entity, l.entity_id, l.summary, l.created_at, ${ENTITY_TITLE},
        u.first_name || ' ' || u.last_name AS user_name, u.avatar_url
      FROM activity_log l LEFT JOIN users u ON u.id = l.user_id
      WHERE l.action NOT IN ('login') ORDER BY l.created_at DESC LIMIT $1`, [limit]);
  }
  return query(
    `SELECT l.id, l.action, l.entity, l.entity_id, l.summary, l.created_at, ${ENTITY_TITLE},
        u.first_name || ' ' || u.last_name AS user_name, u.avatar_url
     FROM activity_log l LEFT JOIN users u ON u.id = l.user_id
     WHERE l.action NOT IN ('login') AND (
       (l.entity = 'task' AND l.entity_id IN (SELECT t.id FROM tasks t WHERE ${taskScopeSql(user, 1)}))
       OR (l.entity = 'issue' AND l.entity_id IN (SELECT i.id FROM issues i WHERE ${issueScopeSql(user, 1)}))
       OR (l.user_id = $1 AND l.entity <> 'user'))
     ORDER BY l.created_at DESC LIMIT $2`,
    [user.id, limit],
  );
}

/** Tâches terminées par jour sur les N derniers jours (graphique d'avancement). */
async function completedPerDay(whereSql: string, params: unknown[], days = 14) {
  return query(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
       (SELECT count(*) FROM tasks t WHERE ${whereSql} AND t.status = 'done' AND t.completed_at::date = d::date) AS done,
       (SELECT count(*) FROM tasks t WHERE ${whereSql} AND t.created_at::date = d::date) AS created
     FROM generate_series(CURRENT_DATE - ${days - 1}, CURRENT_DATE, interval '1 day') d ORDER BY d`,
    params,
  );
}

// F-37 : tableau de bord personnalisé selon le rôle
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    // Les responsables voient leur périmètre (équipes, stagiaires) ; les autres, leurs propres tâches.
    const manager = u.role === 'admin' || u.role === 'tutor';
    const scope = manager ? taskScopeSql(u, 1) : MINE(1);
    const stats = await statsFor(scope, [u.id]);
    const focus = await query(
      `${TASK_SELECT} WHERE ${scope} AND t.status NOT IN ('done','backlog')
         AND (t.due_date <= CURRENT_DATE + 2 OR (t.status = 'in_progress' AND ${manager ? 'FALSE' : 'TRUE'}))
       ORDER BY (t.due_date < CURRENT_DATE) DESC, t.due_date NULLS LAST, ${PRIORITY_ORDER} LIMIT 8`,
      [u.id],
    );
    const myIssues = await query(
      `SELECT id, title, severity, status, reported_at FROM issues WHERE reporter_id = $1 AND status <> 'resolved' ORDER BY reported_at DESC LIMIT 5`,
      [u.id],
    );
    const result: Record<string, unknown> = {
      role: u.role,
      scope: manager ? 'perimeter' : 'personal',
      stats,
      focus,
      myIssues,
      activity: await recentActivity(u, 8),
      trend: await completedPerDay(scope, [u.id]),
    };

    if (u.role === 'tutor' || u.role === 'admin') {
      result.issuesToHandle = await query(
        `SELECT i.id, i.title, i.severity, i.status, i.reported_at, r.first_name || ' ' || r.last_name AS reporter_name,
           (i.status = 'open' AND i.reported_at < now() - interval '3 days') AS is_stale
         FROM issues i JOIN users r ON r.id = i.reporter_id
         WHERE ${issueScopeSql(u, 1)} AND i.reporter_id <> $1 AND i.status <> 'resolved'
         ORDER BY array_position(ARRAY['critical','medium','low']::issue_severity[], i.severity), i.reported_at LIMIT 6`,
        [u.id],
      );
      result.teams = await query(
        `SELECT t.id, t.name,
           (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status NOT IN ('backlog')) AS total,
           (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status = 'done') AS done,
           (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status NOT IN ('done','backlog') AND k.due_date < CURRENT_DATE) AS overdue,
           (SELECT COALESCE(round(avg(k.progress)), 0) FROM tasks k WHERE k.team_id = t.id AND k.status <> 'backlog') AS avg_progress
         FROM teams t WHERE ${u.role === 'admin' ? 'TRUE' : `t.id IN ${myTeamsSql(1)}`} ORDER BY t.name ${u.role === 'admin' ? 'LIMIT 8' : ''}`,
        u.role === 'admin' ? [] : [u.id],
      );
      if (u.role === 'tutor') {
        result.interns = await query(
          `SELECT s.id AS internship_id, s.end_date, s.status, i.id, i.first_name, i.last_name, i.avatar_url,
             (SELECT COALESCE(round(avg(k.progress)), 0) FROM task_assignments a JOIN tasks k ON k.id = a.task_id
                WHERE a.user_id = i.id AND a.active AND k.status <> 'backlog') AS avg_progress,
             (SELECT count(*) FROM task_assignments a JOIN tasks k ON k.id = a.task_id
                WHERE a.user_id = i.id AND a.active AND k.status NOT IN ('done','backlog') AND k.due_date < CURRENT_DATE) AS overdue,
             (SELECT count(*) FROM issues x WHERE x.reporter_id = i.id AND x.status <> 'resolved') AS open_issues
           FROM internships s JOIN users i ON i.id = s.intern_id
           WHERE (s.tutor_id = $1 OR (s.delegate_id = $1 AND (s.delegate_until IS NULL OR s.delegate_until >= CURRENT_DATE)))
             AND s.status IN ('active','suspended','upcoming')
           ORDER BY s.end_date`,
          [u.id],
        );
      }
    }
    if (u.role === 'intern') {
      result.internship = await queryOne(
        `SELECT s.id, s.subject, s.start_date, s.end_date, s.status, s.school,
           t.first_name || ' ' || t.last_name AS tutor_name, t.email AS tutor_email,
           (s.end_date - CURRENT_DATE) AS days_left, (s.end_date - s.start_date) AS duration
         FROM internships s JOIN users t ON t.id = s.tutor_id WHERE s.intern_id = $1
         ORDER BY array_position(ARRAY['active','upcoming','suspended','completed','evaluated']::internship_status[], s.status) LIMIT 1`,
        [u.id],
      );
    }
    res.json(result);
  }),
);

// F-25 : avancement par personne
router.get(
  '/person/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await canViewUser(req.user!, id))) throw forbidden();
    const person = await queryOne(
      `SELECT u.id, u.first_name, u.last_name, u.email, u.role, u.job_title, u.avatar_url, u.wip_limit, u.is_active, u.skills,
         (SELECT name FROM departments d WHERE d.id = u.department_id) AS department_name
       FROM users u WHERE u.id = $1`, [id]);
    if (!person) throw notFound('Personne');
    const [stats, tasks, issues, progressHistory, internship] = await Promise.all([
      personStats(id),
      query(`${TASK_SELECT} WHERE ${MINE(1)} AND t.status <> 'backlog' ORDER BY (t.status = 'done'), t.due_date NULLS LAST LIMIT 200`, [id]),
      query(`SELECT id, title, type, severity, status, reported_at, resolved_at FROM issues WHERE reporter_id = $1 ORDER BY reported_at DESC`, [id]),
      query(`SELECT to_char(date_trunc('week', d), 'YYYY-MM-DD') AS week,
               (SELECT count(*) FROM tasks t WHERE ${MINE(1)} AND t.status = 'done'
                  AND date_trunc('week', t.completed_at) = date_trunc('week', d)) AS done
             FROM generate_series(CURRENT_DATE - 49, CURRENT_DATE, interval '7 days') d ORDER BY d`, [id]),
      queryOne(`SELECT s.id, s.subject, s.status, s.start_date, s.end_date FROM internships s WHERE s.intern_id = $1 ORDER BY s.start_date DESC LIMIT 1`, [id]),
    ]);
    res.json({ person, stats, tasks, issues, progressHistory, internship });
  }),
);

// F-26 : tableau de bord d'équipe
router.get(
  '/team/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const u = req.user!;
    if (u.role !== 'admin') {
      const ok = await queryOne(`SELECT 1 FROM teams WHERE id = $1 AND id IN ${myTeamsSql(2)}`, [id, u.id]);
      if (!ok) throw forbidden();
    }
    const team = await queryOne('SELECT id, name, description, lead_id, wip_in_progress, wip_review FROM teams WHERE id = $1', [id]);
    if (!team) throw notFound('Équipe');
    const [byStatus, byPriority, members, overdue, throughput, cycle, blocked, activeSprint] = await Promise.all([
      query(`SELECT status AS key, count(*) AS count FROM tasks WHERE team_id = $1 GROUP BY 1`, [id]),
      query(`SELECT priority AS key, count(*) AS count FROM tasks WHERE team_id = $1 AND status NOT IN ('done','backlog') GROUP BY 1`, [id]),
      query(`SELECT u.id, u.first_name, u.last_name, u.role, u.avatar_url, u.wip_limit, u.job_title,
               count(k.id) FILTER (WHERE k.status <> 'backlog') AS total,
               count(k.id) FILTER (WHERE k.status = 'done') AS done,
               count(k.id) FILTER (WHERE k.status = 'in_progress') AS in_progress,
               count(k.id) FILTER (WHERE k.status NOT IN ('done','backlog')) AS open,
               count(k.id) FILTER (WHERE k.status NOT IN ('done','backlog') AND k.due_date < CURRENT_DATE) AS overdue,
               COALESCE(sum(k.estimate_hours * (100 - k.progress) / 100.0) FILTER (WHERE k.status NOT IN ('done','backlog')), 0) AS remaining_hours,
               COALESCE(round(avg(k.progress) FILTER (WHERE k.status NOT IN ('done','backlog'))), 0) AS avg_progress,
               (SELECT count(*) FROM issues x WHERE x.reporter_id = u.id AND x.status <> 'resolved') AS open_issues
             FROM team_members m JOIN users u ON u.id = m.user_id AND u.is_active
             LEFT JOIN task_assignments a ON a.user_id = u.id AND a.active
             LEFT JOIN tasks k ON k.id = a.task_id AND k.team_id = $1
             WHERE m.team_id = $1 GROUP BY u.id ORDER BY u.last_name`, [id]),
      query(`${TASK_SELECT} WHERE t.team_id = $1 AND t.status NOT IN ('done','backlog') AND t.due_date < CURRENT_DATE + 2
             ORDER BY t.due_date LIMIT 20`, [id]),
      query(`SELECT to_char(date_trunc('week', d), 'YYYY-MM-DD') AS week,
               (SELECT count(*) FROM tasks t WHERE t.team_id = $1 AND t.status = 'done'
                  AND date_trunc('week', t.completed_at) = date_trunc('week', d)) AS done
             FROM generate_series(CURRENT_DATE - 49, CURRENT_DATE, interval '7 days') d ORDER BY d`, [id]),
      queryOne(`SELECT round(avg(extract(epoch FROM (completed_at - COALESCE(started_at, created_at))) / 86400)::numeric, 1) AS avg_days
                FROM tasks WHERE team_id = $1 AND status = 'done' AND completed_at > now() - interval '60 days'`, [id]),
      queryOne(`SELECT count(DISTINCT t.id) AS n FROM tasks t JOIN issues i ON i.task_id = t.id AND i.status <> 'resolved'
                WHERE t.team_id = $1 AND t.status NOT IN ('done','backlog')`, [id]),
      queryOne(`SELECT id, name, end_date FROM sprints WHERE team_id = $1 AND status = 'active'`, [id]),
    ]);
    res.json({
      team,
      canManage: await canManageTeam(u, id),
      byStatus,
      byPriority,
      members: members.map((m) => ({ ...m, remaining_hours: Math.round(Number(m.remaining_hours) * 10) / 10, completion_rate: completionRate(m.done, m.total) })),
      overdue,
      throughput,
      cycleTimeDays: cycle?.avg_days ?? null,
      blockedTasks: blocked.n,
      activeSprint,
    });
  }),
);

// US-15 : tableau de bord global (admin)
router.get(
  '/global',
  requireRole('admin'),
  asyncHandler(async (_req, res) => {
    const [people, tasks, issues, internships, teams, weekly, ending, escalated] = await Promise.all([
      query(`SELECT role AS key, count(*) AS count FROM users WHERE is_active GROUP BY 1`),
      queryOne(`SELECT count(*) FILTER (WHERE status <> 'backlog') AS total,
                  count(*) FILTER (WHERE status = 'done') AS done,
                  count(*) FILTER (WHERE status = 'in_progress') AS in_progress,
                  count(*) FILTER (WHERE status = 'backlog') AS backlog,
                  count(*) FILTER (WHERE status NOT IN ('done','backlog') AND due_date < CURRENT_DATE) AS overdue,
                  COALESCE(round(avg(progress) FILTER (WHERE status NOT IN ('done','backlog'))), 0) AS avg_progress
                FROM tasks`),
      query(`SELECT severity AS key, count(*) AS count FROM issues WHERE status <> 'resolved' GROUP BY 1`),
      query(`SELECT status AS key, count(*) AS count FROM internships GROUP BY 1`),
      query(`SELECT t.id, t.name,
               (SELECT count(*) FROM team_members m WHERE m.team_id = t.id) AS members,
               (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status <> 'backlog') AS total,
               (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status = 'done') AS done,
               (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status NOT IN ('done','backlog') AND k.due_date < CURRENT_DATE) AS overdue,
               (SELECT count(*) FROM issues i JOIN team_members m ON m.user_id = i.reporter_id WHERE m.team_id = t.id AND i.status <> 'resolved') AS open_issues
             FROM teams t ORDER BY t.name`),
      query(`SELECT to_char(date_trunc('week', d), 'YYYY-MM-DD') AS week,
               (SELECT count(*) FROM tasks t WHERE t.status = 'done' AND date_trunc('week', t.completed_at) = date_trunc('week', d)) AS done,
               (SELECT count(*) FROM issues i WHERE date_trunc('week', i.reported_at) = date_trunc('week', d)) AS issues
             FROM generate_series(CURRENT_DATE - 77, CURRENT_DATE, interval '7 days') d ORDER BY d`),
      query(`SELECT s.id, s.end_date, s.subject, i.first_name || ' ' || i.last_name AS intern_name, t.first_name || ' ' || t.last_name AS tutor_name
             FROM internships s JOIN users i ON i.id = s.intern_id JOIN users t ON t.id = s.tutor_id
             WHERE s.status = 'active' AND s.end_date <= CURRENT_DATE + 21 ORDER BY s.end_date`),
      query(`SELECT i.id, i.title, i.severity, i.reported_at, r.first_name || ' ' || r.last_name AS reporter_name
             FROM issues i JOIN users r ON r.id = i.reporter_id WHERE i.status = 'escalated' ORDER BY i.reported_at`),
    ]);
    res.json({
      people,
      tasks: { ...tasks, completionRate: completionRate(tasks.done, tasks.total) },
      issues,
      internships,
      teams: teams.map((t) => ({ ...t, completion_rate: completionRate(t.done, t.total) })),
      weekly,
      ending,
      escalated,
    });
  }),
);

export default router;
