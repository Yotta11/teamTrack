import type { AuthUser } from '../middleware/auth.js';
import { type Queryable, pool, query, queryOne } from '../db/pool.js';
import { badRequest, conflict, notFound } from '../utils/http.js';
import { weightedProgress } from '../utils/progress.js';
import { canManageTeam, myInternsSql, taskScopeSql } from './scope.js';

export const TASK_STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

export const STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'À faire',
  in_progress: 'En cours',
  review: 'En revue',
  done: 'Terminé',
};

export const TASK_SELECT = `
  SELECT t.id, t.title, t.description, t.priority, t.status, t.progress, t.due_date, t.estimate_hours,
    t.story_points, t.labels, t.team_id, t.sprint_id, t.creator_id, t.validated_by, t.started_at, t.completed_at,
    t.created_at, t.updated_at,
    tm.name AS team_name,
    sp.name AS sprint_name,
    COALESCE((SELECT json_agg(json_build_object('id', u.id, 'first_name', u.first_name, 'last_name', u.last_name,
        'role', u.role, 'avatar_url', u.avatar_url) ORDER BY a.assigned_at)
      FROM task_assignments a JOIN users u ON u.id = a.user_id WHERE a.task_id = t.id AND a.active), '[]') AS assignees,
    (SELECT count(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_count,
    (SELECT count(*) FROM subtasks s WHERE s.task_id = t.id AND s.done) AS subtask_done,
    (SELECT count(*) FROM task_comments c WHERE c.task_id = t.id) AS comment_count,
    (SELECT count(*) FROM task_attachments f WHERE f.task_id = t.id) AS attachment_count,
    (SELECT count(*) FROM issues i WHERE i.task_id = t.id AND i.status <> 'resolved') AS open_issue_count,
    (t.status NOT IN ('done','backlog') AND t.due_date < CURRENT_DATE) AS is_overdue,
    (t.status NOT IN ('done','backlog') AND t.due_date >= CURRENT_DATE AND t.due_date <= CURRENT_DATE + 2) AS is_due_soon
  FROM tasks t
  JOIN teams tm ON tm.id = t.team_id
  LEFT JOIN sprints sp ON sp.id = t.sprint_id`;

export const PRIORITY_ORDER = `array_position(ARRAY['urgent','high','normal','low']::task_priority[], t.priority)`;

export async function loadTaskFor(user: AuthUser, id: number, db: Queryable = pool) {
  const task = await queryOne(`${TASK_SELECT} WHERE t.id = $1 AND ${taskScopeSql(user, 2)}`, [id, user.id], db);
  if (!task) throw notFound('Tâche');
  return task;
}

export const isAssignee = (user: AuthUser, task: { assignees: { id: number }[] }) =>
  task.assignees.some((a) => a.id === user.id);

/** Admin, tuteur responsable de l'équipe ou tuteur d'un stagiaire affecté. */
export async function canManageTask(
  user: AuthUser,
  task: { team_id: number; assignees: { id: number; role: string }[] },
  db: Queryable = pool,
): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role !== 'tutor') return false;
  if (await canManageTeam(user, task.team_id, db)) return true;
  const ids = task.assignees.filter((a) => a.role === 'intern').map((a) => a.id);
  if (ids.length === 0) return false;
  const row = await queryOne(`SELECT 1 FROM users WHERE id = ANY($2::int[]) AND id IN ${myInternsSql(1)} LIMIT 1`, [user.id, ids], db);
  return !!row;
}

/** Peut modifier le contenu : gestionnaire de la tâche ou créateur (employé, tâche personnelle). */
export async function canEditTask(user: AuthUser, task: any, db: Queryable = pool): Promise<boolean> {
  return (await canManageTask(user, task, db)) || task.creator_id === user.id;
}

/**
 * RG-03 : seules les personnes de l'équipe concernée (membres ou chef) peuvent être affectées.
 * RG-04 : l'échéance d'une tâche d'un stagiaire ne peut pas dépasser la date de fin de son stage.
 */
export async function validateAssignees(
  teamId: number,
  userIds: number[],
  dueDate: string | null | undefined,
  db: Queryable = pool,
): Promise<void> {
  if (userIds.length === 0) return;
  const rows = await query<{ id: number; role: string; is_active: boolean; first_name: string; last_name: string; in_team: boolean }>(
    `SELECT u.id, u.role, u.is_active, u.first_name, u.last_name,
       (EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = $1 AND m.user_id = u.id)
         OR EXISTS (SELECT 1 FROM teams t WHERE t.id = $1 AND t.lead_id = u.id)) AS in_team
     FROM users u WHERE u.id = ANY($2::int[])`,
    [teamId, userIds],
    db,
  );
  if (rows.length !== new Set(userIds).size) throw badRequest('Personne affectée introuvable.');
  const outside = rows.filter((r) => !r.in_team || !r.is_active);
  if (outside.length) {
    throw badRequest(
      `${outside.map((r) => `${r.first_name} ${r.last_name}`).join(', ')} ne fait pas partie de l'équipe (ou est inactif).`,
      'RG-03',
    );
  }
  for (const intern of rows.filter((r) => r.role === 'intern')) {
    const s = await queryOne<{ end_date: string }>(
      `SELECT end_date FROM internships WHERE intern_id = $1 AND status IN ('upcoming','active','suspended')
       ORDER BY end_date DESC LIMIT 1`,
      [intern.id],
      db,
    );
    if (!s) throw badRequest(`${intern.first_name} ${intern.last_name} n'a pas de stage en cours.`, 'RG-01');
    if (dueDate && dueDate > s.end_date) {
      throw badRequest(
        `L'échéance dépasse la fin du stage de ${intern.first_name} ${intern.last_name} (${s.end_date}).`,
        'RG-04',
      );
    }
  }
}

/** RG-05 : recalcul de l'avancement à partir des sous-tâches pondérées. */
export async function recalcProgress(taskId: number, db: Queryable = pool): Promise<number | null> {
  const subs = await query<{ weight: number; done: boolean }>('SELECT weight, done FROM subtasks WHERE task_id = $1', [taskId], db);
  const p = weightedProgress(subs);
  if (p !== null) await query('UPDATE tasks SET progress = $2, updated_at = now() WHERE id = $1', [taskId, p], db);
  return p;
}

export interface WipViolation {
  scope: 'person' | 'column';
  userId?: number;
  name: string;
  limit: number;
  current: number;
}

/** F-19 / RG-09 : contrôle des limites WIP (par personne et par colonne). */
export async function checkWip(
  task: { id: number; team_id: number; sprint_id: number | null; assignees: { id: number }[] },
  target: TaskStatus,
  db: Queryable = pool,
): Promise<WipViolation[]> {
  const violations: WipViolation[] = [];
  if (target === 'in_progress' && task.assignees.length) {
    const rows = await query(
      `SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.wip_limit,
         (SELECT count(*) FROM task_assignments a JOIN tasks k ON k.id = a.task_id
          WHERE a.user_id = u.id AND a.active AND k.status = 'in_progress' AND k.id <> $2) AS current
       FROM users u WHERE u.id = ANY($1::int[])`,
      [task.assignees.map((a) => a.id), task.id],
      db,
    );
    for (const r of rows) {
      if (r.current >= r.wip_limit) violations.push({ scope: 'person', userId: r.id, name: r.name, limit: r.wip_limit, current: r.current });
    }
  }
  if (target === 'in_progress' || target === 'review') {
    const team = await queryOne(`SELECT name, wip_in_progress, wip_review FROM teams WHERE id = $1`, [task.team_id], db);
    const limit = target === 'in_progress' ? team.wip_in_progress : team.wip_review;
    if (limit) {
      const c = await queryOne(
        `SELECT count(*) AS n FROM tasks WHERE team_id = $1 AND status = $2 AND id <> $3`,
        [task.team_id, target, task.id],
        db,
      );
      if (c.n >= limit) violations.push({ scope: 'column', name: `${STATUS_LABEL[target]} (${team.name})`, limit, current: c.n });
    }
  }
  return violations;
}

export function wipMessage(v: WipViolation[]): string {
  return v
    .map((x) =>
      x.scope === 'person'
        ? `${x.name} a déjà ${x.current} tâche(s) en cours (limite ${x.limit})`
        : `la colonne ${x.name} est pleine (${x.current}/${x.limit})`,
    )
    .join(' ; ');
}

export function assertNotBlocked(v: WipViolation[], canForce: boolean, force: boolean) {
  if (v.length && !(canForce && force)) {
    throw conflict(`Limite WIP atteinte : ${wipMessage(v)}.`, 'WIP_EXCEEDED', { violations: v, canForce });
  }
}
