import { type Queryable, pool, query, queryOne } from '../db/pool.js';
import { completionRate, evaluationAverage } from '../utils/progress.js';

export const INTERNSHIP_SELECT = `
  SELECT s.*,
    json_build_object('id', i.id, 'first_name', i.first_name, 'last_name', i.last_name, 'email', i.email,
      'avatar_url', i.avatar_url, 'job_title', i.job_title, 'phone', i.phone) AS intern,
    json_build_object('id', t.id, 'first_name', t.first_name, 'last_name', t.last_name, 'avatar_url', t.avatar_url,
      'email', t.email) AS tutor,
    CASE WHEN dl.id IS NULL THEN NULL ELSE json_build_object('id', dl.id, 'first_name', dl.first_name,
      'last_name', dl.last_name, 'avatar_url', dl.avatar_url, 'role', dl.role) END AS delegate,
    (SELECT count(*) FROM task_assignments a JOIN tasks k ON k.id = a.task_id
       WHERE a.user_id = s.intern_id AND a.active AND k.status <> 'backlog') AS task_count,
    (SELECT count(*) FROM task_assignments a JOIN tasks k ON k.id = a.task_id
       WHERE a.user_id = s.intern_id AND a.active AND k.status = 'done') AS done_count,
    (SELECT count(*) FROM task_assignments a JOIN tasks k ON k.id = a.task_id
       WHERE a.user_id = s.intern_id AND a.active AND k.status NOT IN ('done','backlog') AND k.due_date < CURRENT_DATE) AS overdue_count,
    (SELECT COALESCE(round(avg(k.progress)), 0) FROM task_assignments a JOIN tasks k ON k.id = a.task_id
       WHERE a.user_id = s.intern_id AND a.active AND k.status <> 'backlog') AS avg_progress,
    (SELECT count(*) FROM issues x WHERE x.reporter_id = s.intern_id AND x.status <> 'resolved') AS open_issues,
    (SELECT round(avg((e.attendance + e.quality + e.autonomy + e.communication + e.deadlines) / 5.0), 1)
       FROM evaluations e WHERE e.internship_id = s.id) AS eval_average
  FROM internships s
  JOIN users i ON i.id = s.intern_id
  JOIN users t ON t.id = s.tutor_id
  LEFT JOIN users dl ON dl.id = s.delegate_id`;

/** F-34 : synthèse automatique du stage (bilan final). */
export async function internshipSummary(id: number, db: Queryable = pool) {
  const internship = await queryOne(`${INTERNSHIP_SELECT} WHERE s.id = $1`, [id], db);
  if (!internship) return null;
  const internId = internship.intern_id;

  const tasks = await query(
    `SELECT k.id, k.title, k.status, k.priority, k.progress, k.due_date, k.completed_at, k.estimate_hours,
       (k.status = 'done' AND (k.due_date IS NULL OR k.completed_at::date <= k.due_date)) AS on_time
     FROM tasks k JOIN task_assignments a ON a.task_id = k.id AND a.active
     WHERE a.user_id = $1 AND k.status <> 'backlog' AND k.created_at::date <= $3
       AND (k.due_date IS NULL OR k.due_date >= $2 OR k.status <> 'done' OR k.completed_at::date >= $2)
     ORDER BY k.due_date NULLS LAST`,
    [internId, internship.start_date, internship.end_date],
    db,
  );
  const done = tasks.filter((t) => t.status === 'done');
  const overdue = tasks.filter((t) => t.status !== 'done' && t.due_date && t.due_date < new Date().toISOString().slice(0, 10));

  const issues = await query(
    `SELECT id, title, type, severity, status, reported_at, resolved_at FROM issues WHERE reporter_id = $1 ORDER BY reported_at DESC`,
    [internId],
    db,
  );
  const resolved = issues.filter((i) => i.resolved_at);
  const avgResolutionDays = resolved.length
    ? Math.round(
        (resolved.reduce((s, i) => s + (new Date(i.resolved_at).getTime() - new Date(i.reported_at).getTime()), 0) /
          resolved.length / 86400000) * 10,
      ) / 10
    : null;
  const countBy = (key: string) =>
    issues.reduce<Record<string, number>>((acc, i) => ((acc[i[key]] = (acc[i[key]] ?? 0) + 1), acc), {});

  const evaluations = await query(
    `SELECT e.*, u.first_name || ' ' || u.last_name AS evaluator_name FROM evaluations e
     JOIN users u ON u.id = e.evaluator_id WHERE e.internship_id = $1 ORDER BY e.eval_date, e.id`,
    [id],
    db,
  );
  const criteria = ['attendance', 'quality', 'autonomy', 'communication', 'deadlines'] as const;
  const criteriaAverages = Object.fromEntries(
    criteria.map((c) => [
      c,
      evaluations.length ? Math.round((evaluations.reduce((s, e) => s + e[c], 0) / evaluations.length) * 10) / 10 : null,
    ]),
  );

  return {
    internship,
    tasks: {
      total: tasks.length,
      done: done.length,
      overdue: overdue.length,
      onTime: tasks.filter((t) => t.on_time).length,
      successRate: completionRate(done.length, tasks.length),
      onTimeRate: completionRate(tasks.filter((t) => t.on_time).length, done.length),
      estimatedHours: tasks.reduce((s, t) => s + (t.estimate_hours ?? 0), 0),
      list: tasks,
    },
    issues: {
      total: issues.length,
      resolved: resolved.length,
      avgResolutionDays,
      byType: countBy('type'),
      bySeverity: countBy('severity'),
      list: issues,
    },
    evaluations: {
      count: evaluations.length,
      overall: evaluations.length
        ? Math.round((evaluations.reduce((s, e) => s + evaluationAverage(e), 0) / evaluations.length) * 10) / 10
        : null,
      criteriaAverages,
      list: evaluations.map((e) => ({ ...e, average: evaluationAverage(e) })),
    },
  };
}
