import { query } from '../db/pool.js';
import { logActivity } from './activity.js';
import { adminIds, notify } from './notifications.js';

/**
 * F-28 : alertes automatiques pour les tâches en retard ou à échéance dans moins de 48 heures.
 * Une seule alerte par tâche, par personne et par type grâce à la clé de déduplication.
 */
export async function runDeadlineAlerts(): Promise<number> {
  const rows = await query(
    `SELECT t.id, t.title, t.due_date, a.user_id, (t.due_date < CURRENT_DATE) AS overdue
     FROM tasks t JOIN task_assignments a ON a.task_id = t.id AND a.active
     JOIN users u ON u.id = a.user_id AND u.is_active
     WHERE t.status NOT IN ('done','backlog') AND t.due_date IS NOT NULL AND t.due_date <= CURRENT_DATE + 2`,
  );
  let sent = 0;
  for (const r of rows) {
    sent += await notify({
      recipients: [r.user_id],
      type: r.overdue ? 'task_overdue' : 'task_due',
      link: `/taches/${r.id}`,
      dedupeKey: `${r.overdue ? 'overdue' : 'due'}:${r.id}:${r.due_date}`,
      message: r.overdue
        ? `La tâche « ${r.title} » est en retard (échéance ${r.due_date}).`
        : `La tâche « ${r.title} » arrive à échéance le ${r.due_date}.`,
    });
  }
  // Le tuteur / chef d'équipe est prévenu des retards de son périmètre
  const late = await query(
    `SELECT t.id, t.title, t.due_date, t.creator_id FROM tasks t
     WHERE t.status NOT IN ('done','backlog') AND t.due_date < CURRENT_DATE`,
  );
  for (const t of late) {
    sent += await notify({
      recipients: [t.creator_id], type: 'task_overdue', link: `/taches/${t.id}`, email: false,
      dedupeKey: `overdue-owner:${t.id}:${t.due_date}`,
      message: `Retard sur « ${t.title} » (échéance ${t.due_date}).`,
    });
  }
  return sent;
}

/** F-31 : une difficulté non traitée sous 3 jours est escaladée à l'administrateur. */
export async function runIssueEscalation(): Promise<number> {
  const stale = await query(
    `UPDATE issues SET status = 'escalated', escalated_at = now()
     WHERE status = 'open' AND reported_at < now() - interval '3 days'
     RETURNING id, title, reporter_id`,
  );
  if (stale.length === 0) return 0;
  const admins = await adminIds();
  for (const i of stale) {
    await query(
      `INSERT INTO issue_responses (issue_id, author_id, content, from_status, to_status) VALUES ($1, $2, $3, 'open', 'escalated')`,
      [i.id, i.reporter_id, 'Escalade automatique : difficulté non traitée sous 3 jours.'],
    );
    await logActivity({ userId: null, action: 'issue_escalated', entity: 'issue', entityId: i.id, summary: 'Escalade automatique (non traitée sous 3 jours)' });
    await notify({ recipients: [...admins, i.reporter_id], type: 'issue_escalated', link: `/difficultes/${i.id}`,
      message: `Difficulté non traitée depuis 3 jours, escaladée à l'administration : « ${i.title} ».` });
  }
  return stale.length;
}

/** Démarrage / clôture automatique des stages selon leurs dates. */
export async function runInternshipStatus(): Promise<void> {
  const started = await query(
    `UPDATE internships SET status = 'active' WHERE status = 'upcoming' AND start_date <= CURRENT_DATE RETURNING id`,
  );
  for (const s of started) {
    await query(`INSERT INTO internship_status_history (internship_id, from_status, to_status, note) VALUES ($1, 'upcoming', 'active', 'Démarrage automatique')`, [s.id]);
  }
  const ended = await query(
    `UPDATE internships SET status = 'completed' WHERE status = 'active' AND end_date < CURRENT_DATE RETURNING id, tutor_id, subject`,
  );
  for (const s of ended) {
    await query(`INSERT INTO internship_status_history (internship_id, from_status, to_status, note) VALUES ($1, 'active', 'completed', 'Fin de stage automatique')`, [s.id]);
    await notify({ recipients: [s.tutor_id], type: 'internship', link: `/stages/${s.id}`,
      message: `Le stage « ${s.subject} » est terminé : pensez à l'évaluation finale.` });
  }
}

export function startScheduler(intervalMs = 60 * 60 * 1000) {
  const run = async () => {
    try {
      await runInternshipStatus();
      await runDeadlineAlerts();
      await runIssueEscalation();
    } catch (err) {
      console.error('Planificateur :', (err as Error).message);
    }
  };
  setTimeout(run, 5000);
  return setInterval(run, intervalMs);
}
