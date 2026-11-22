import type { AuthUser } from '../middleware/auth.js';
import { type Queryable, pool, query, queryOne } from '../db/pool.js';

/**
 * RG-08 : périmètres de visibilité.
 * - Admin : tout.
 * - Tuteur : ses équipes (chef ou membre) et les stagiaires qu'il encadre (ou dont le suivi lui est délégué).
 * - Employé : les tâches de ses équipes, ses propres difficultés.
 * - Stagiaire : uniquement ses tâches, ses difficultés et ses évaluations.
 */

/** Sous-requête SQL : équipes de l'utilisateur ($n = id utilisateur). */
export const myTeamsSql = (n: number) =>
  `(SELECT team_id FROM team_members WHERE user_id = $${n} UNION SELECT id FROM teams WHERE lead_id = $${n})`;

/** Sous-requête SQL : stagiaires encadrés par l'utilisateur ($n = id utilisateur). */
export const myInternsSql = (n: number) =>
  `(SELECT intern_id FROM internships WHERE tutor_id = $${n}
      OR (delegate_id = $${n} AND (delegate_until IS NULL OR delegate_until >= CURRENT_DATE)))`;

/** Clause WHERE limitant les tâches visibles (alias `t`). */
export function taskScopeSql(user: AuthUser, n: number): string {
  switch (user.role) {
    case 'admin':
      return `($${n}::int > 0)`; // tout est visible (le paramètre reste typé pour PostgreSQL)
    case 'tutor':
      return `(t.team_id IN ${myTeamsSql(n)} OR EXISTS (SELECT 1 FROM task_assignments a
                WHERE a.task_id = t.id AND a.active AND a.user_id IN ${myInternsSql(n)}))`;
    case 'employee':
      return `(t.team_id IN ${myTeamsSql(n)} OR EXISTS (SELECT 1 FROM task_assignments a
                WHERE a.task_id = t.id AND a.active AND a.user_id = $${n}))`;
    case 'intern':
      return `EXISTS (SELECT 1 FROM task_assignments a WHERE a.task_id = t.id AND a.active AND a.user_id = $${n})`;
  }
}

/** Clause WHERE limitant les difficultés visibles (alias `i`). */
export function issueScopeSql(user: AuthUser, n: number): string {
  if (user.role === 'admin') return `($${n}::int > 0)`;
  if (user.role === 'tutor') {
    return `(i.reporter_id = $${n} OR i.reporter_id IN ${myInternsSql(n)}
             OR i.reporter_id IN (SELECT user_id FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE lead_id = $${n}))
             OR i.task_id IN (SELECT id FROM tasks WHERE team_id IN ${myTeamsSql(n)}))`;
  }
  return `i.reporter_id = $${n}`;
}

/** Clause WHERE limitant les stages visibles (alias `s`). */
export function internshipScopeSql(user: AuthUser, n: number): string {
  if (user.role === 'admin') return `($${n}::int > 0)`;
  if (user.role === 'intern') return `s.intern_id = $${n}`;
  return `(s.tutor_id = $${n} OR (s.delegate_id = $${n} AND (s.delegate_until IS NULL OR s.delegate_until >= CURRENT_DATE)))`;
}

/** Identifiants des personnes dont l'utilisateur assure le suivi. */
export async function managedUserIds(user: AuthUser, db: Queryable = pool): Promise<number[] | 'all'> {
  if (user.role === 'admin') return 'all';
  if (user.role !== 'tutor') return [user.id];
  const rows = await query<{ id: number }>(
    `SELECT user_id AS id FROM team_members WHERE team_id IN (SELECT id FROM teams WHERE lead_id = $1)
     UNION SELECT intern_id FROM internships WHERE tutor_id = $1
       OR (delegate_id = $1 AND (delegate_until IS NULL OR delegate_until >= CURRENT_DATE))
     UNION SELECT $1`,
    [user.id],
    db,
  );
  return rows.map((r) => r.id);
}

export async function canViewUser(user: AuthUser, targetId: number): Promise<boolean> {
  if (user.id === targetId || user.role === 'admin') return true;
  const ids = await managedUserIds(user);
  return ids === 'all' || ids.includes(targetId);
}

/**
 * Responsables d'une personne : tuteur (et délégué) pour un stagiaire,
 * chefs de ses équipes pour un employé.
 */
export async function supervisorsOf(userId: number, db: Queryable = pool): Promise<number[]> {
  const rows = await query<{ id: number }>(
    `SELECT tutor_id AS id FROM internships WHERE intern_id = $1 AND status IN ('upcoming','active','suspended')
     UNION SELECT delegate_id FROM internships WHERE intern_id = $1 AND delegate_id IS NOT NULL
       AND status IN ('upcoming','active','suspended') AND (delegate_until IS NULL OR delegate_until >= CURRENT_DATE)
     UNION SELECT t.lead_id FROM teams t JOIN team_members m ON m.team_id = t.id
       WHERE m.user_id = $1 AND t.lead_id IS NOT NULL`,
    [userId],
    db,
  );
  return rows.map((r) => r.id).filter((id) => id !== userId);
}

/** L'utilisateur est-il chef de l'équipe (ou admin) ? */
export async function canManageTeam(user: AuthUser, teamId: number, db: Queryable = pool): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role !== 'tutor') return false;
  const row = await queryOne(
    `SELECT 1 FROM teams WHERE id = $1 AND (lead_id = $2 OR EXISTS
       (SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2))`,
    [teamId, user.id],
    db,
  );
  return !!row;
}
