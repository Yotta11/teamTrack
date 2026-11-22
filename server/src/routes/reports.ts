import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { type Column, type Report, renderPdf, renderXlsx } from '../services/export.js';
import { internshipSummary } from '../services/internships.js';
import { issueScopeSql, myTeamsSql, taskScopeSql } from '../services/scope.js';
import { TASK_SELECT } from '../services/tasks.js';
import { asyncHandler, badRequest, forbidden } from '../utils/http.js';
import { completionRate } from '../utils/progress.js';
import { loadInternshipFor } from './internships.js';

const router = Router();
router.use(authenticate);

const L = {
  status: { backlog: 'Backlog', todo: 'À faire', in_progress: 'En cours', review: 'En revue', done: 'Terminé' } as Record<string, string>,
  priority: { low: 'Basse', normal: 'Normale', high: 'Haute', urgent: 'Urgente' } as Record<string, string>,
  role: { admin: 'Administrateur', tutor: 'Tuteur', employee: 'Employé', intern: 'Stagiaire' } as Record<string, string>,
  issueType: { technical: 'Technique', organizational: 'Organisationnel', skill: 'Compétence', resource: 'Ressource', personal: 'Personnel' } as Record<string, string>,
  severity: { low: 'Faible', medium: 'Moyenne', critical: 'Critique' } as Record<string, string>,
  issueStatus: { open: 'Ouverte', analysis: 'En analyse', in_progress: 'En résolution', resolved: 'Résolue', escalated: 'Escaladée' } as Record<string, string>,
  internship: { upcoming: 'À venir', active: 'En cours', suspended: 'Suspendu', completed: 'Terminé', evaluated: 'Évalué' } as Record<string, string>,
};

const fr = (d: string | Date | null) => {
  if (!d) return '—';
  const s = typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);
  const [y, m, day] = s.split('-');
  return `${day}/${m}/${y}`;
};
const pct = (v: number) => `${v} %`;
const names = (list: { first_name: string; last_name: string }[]) => list.map((a) => `${a.first_name} ${a.last_name}`).join(', ') || '—';

const TASK_COLUMNS: Column[] = [
  { header: 'Tâche', key: 'title', width: 10 },
  { header: 'Équipe', key: 'team_name', width: 5 },
  { header: 'Responsables', key: 'assignees', width: 7, format: (v) => names(v) },
  { header: 'Priorité', key: 'priority', width: 3.5, format: (v) => L.priority[v] },
  { header: 'Statut', key: 'status', width: 3.5, format: (v) => L.status[v] },
  { header: 'Avancement', key: 'progress', width: 3.5, align: 'right', format: (v) => pct(v) },
  { header: 'Échéance', key: 'due_date', width: 4, format: (v, r) => `${fr(v)}${r.is_overdue ? ' (retard)' : ''}` },
];

const ISSUE_COLUMNS: Column[] = [
  { header: 'Difficulté', key: 'title', width: 10 },
  { header: 'Déclarée par', key: 'reporter_name', width: 6 },
  { header: 'Type', key: 'type', width: 4, format: (v) => L.issueType[v] },
  { header: 'Gravité', key: 'severity', width: 3.5, format: (v) => L.severity[v] },
  { header: 'Statut', key: 'status', width: 4, format: (v) => L.issueStatus[v] },
  { header: 'Signalée le', key: 'reported_at', width: 4, format: (v) => fr(v) },
  { header: 'Résolue le', key: 'resolved_at', width: 4, format: (v) => fr(v) },
];

async function buildInternshipReport(user: Express.Request['user'], id: number): Promise<Report> {
  await loadInternshipFor(user!, id);
  const s = (await internshipSummary(id))!;
  const i = s.internship;
  const crit: [string, string][] = [
    ['attendance', 'Assiduité'], ['quality', 'Qualité du travail'], ['autonomy', 'Autonomie'],
    ['communication', 'Communication'], ['deadlines', 'Respect des délais'],
  ];
  return {
    title: `Bilan de stage — ${i.intern.first_name} ${i.intern.last_name}`,
    subtitle: `${i.subject} · ${i.school} · du ${fr(i.start_date)} au ${fr(i.end_date)} · tuteur : ${i.tutor.first_name} ${i.tutor.last_name} · statut : ${L.internship[i.status]}`,
    figures: [
      { label: 'Tâches réalisées', value: `${s.tasks.done} / ${s.tasks.total}` },
      { label: 'Taux de réussite', value: pct(s.tasks.successRate) },
      { label: 'Terminées dans les délais', value: pct(s.tasks.onTimeRate) },
      { label: 'Moyenne des évaluations', value: s.evaluations.overall !== null ? `${s.evaluations.overall} / 5` : '—' },
      { label: 'Difficultés signalées', value: String(s.issues.total) },
      { label: 'Difficultés résolues', value: String(s.issues.resolved) },
      { label: 'Délai moyen de résolution', value: s.issues.avgResolutionDays !== null ? `${s.issues.avgResolutionDays} j` : '—' },
      { label: 'Tâches en retard', value: String(s.tasks.overdue) },
    ],
    paragraphs: [{ title: 'Objectifs pédagogiques', text: i.objectives }],
    sections: [
      {
        title: 'Évaluations — moyenne par critère',
        columns: [{ header: 'Critère', key: 'label', width: 8 }, { header: 'Moyenne (sur 5)', key: 'value', width: 4, align: 'right' }],
        rows: crit.map(([k, label]) => ({ label, value: s.evaluations.criteriaAverages[k] ?? '—' })),
      },
      {
        title: 'Historique des évaluations',
        columns: [
          { header: 'Date', key: 'eval_date', width: 3, format: (v) => fr(v) },
          { header: 'Évaluateur', key: 'evaluator_name', width: 5 },
          { header: 'Moyenne', key: 'average', width: 2.5, align: 'right' },
          { header: 'Commentaire', key: 'comment', width: 14 },
        ],
        rows: s.evaluations.list,
        empty: 'Aucune évaluation enregistrée.',
      },
      { title: 'Tâches du stage', columns: TASK_COLUMNS.filter((c) => !['team_name', 'assignees'].includes(c.key)), rows: s.tasks.list, empty: 'Aucune tâche.' },
      {
        title: 'Difficultés rencontrées',
        columns: ISSUE_COLUMNS.filter((c) => c.key !== 'reporter_name'),
        rows: s.issues.list,
        empty: 'Aucune difficulté signalée.',
      },
    ],
  };
}

async function buildTeamReport(user: Express.Request['user'], id: number): Promise<Report> {
  if (user!.role !== 'admin') {
    const ok = await queryOne(`SELECT 1 FROM teams WHERE id = $1 AND id IN ${myTeamsSql(2)}`, [id, user!.id]);
    if (!ok) throw forbidden();
  }
  const team = await queryOne('SELECT name, description FROM teams WHERE id = $1', [id]);
  if (!team) throw badRequest('Équipe introuvable.');
  const members = await query(
    `SELECT u.first_name || ' ' || u.last_name AS name, u.role,
       count(k.id) FILTER (WHERE k.status <> 'backlog') AS total, count(k.id) FILTER (WHERE k.status = 'done') AS done,
       count(k.id) FILTER (WHERE k.status NOT IN ('done','backlog')) AS open,
       count(k.id) FILTER (WHERE k.status NOT IN ('done','backlog') AND k.due_date < CURRENT_DATE) AS overdue,
       COALESCE(round(sum(k.estimate_hours * (100 - k.progress) / 100.0) FILTER (WHERE k.status NOT IN ('done','backlog')), 1), 0) AS hours
     FROM team_members m JOIN users u ON u.id = m.user_id AND u.is_active
     LEFT JOIN task_assignments a ON a.user_id = u.id AND a.active LEFT JOIN tasks k ON k.id = a.task_id AND k.team_id = $1
     WHERE m.team_id = $1 GROUP BY u.id ORDER BY u.last_name`, [id]);
  const tasks = await query(`${TASK_SELECT} WHERE t.team_id = $1 AND t.status <> 'backlog' ORDER BY t.status, t.due_date NULLS LAST`, [id]);
  const done = tasks.filter((t) => t.status === 'done').length;
  return {
    title: `Tableau de bord — ${team.name}`,
    subtitle: team.description ?? undefined,
    figures: [
      { label: 'Tâches', value: String(tasks.length) },
      { label: 'Terminées', value: `${done} (${completionRate(done, tasks.length)} %)` },
      { label: 'En retard', value: String(tasks.filter((t) => t.is_overdue).length) },
      { label: 'Membres', value: String(members.length) },
    ],
    sections: [
      {
        title: 'Charge et avancement par membre',
        columns: [
          { header: 'Membre', key: 'name', width: 8 },
          { header: 'Rôle', key: 'role', width: 4, format: (v) => L.role[v] },
          { header: 'Tâches', key: 'total', width: 3, align: 'right' },
          { header: 'Terminées', key: 'done', width: 3, align: 'right' },
          { header: 'Ouvertes', key: 'open', width: 3, align: 'right' },
          { header: 'En retard', key: 'overdue', width: 3, align: 'right' },
          { header: 'Taux', key: 'done', width: 3, align: 'right', format: (_v, r) => pct(completionRate(r.done, r.total)) },
          { header: 'Reste (h)', key: 'hours', width: 3, align: 'right' },
        ],
        rows: members,
      },
      { title: 'Tâches de l’équipe', columns: TASK_COLUMNS.filter((c) => c.key !== 'team_name'), rows: tasks },
    ],
  };
}

const exportSchema = z.object({
  type: z.enum(['internship', 'team', 'tasks', 'issues', 'users', 'global']),
  format: z.enum(['pdf', 'xlsx']).default('pdf'),
  id: z.coerce.number().int().positive().optional(),
  teamId: z.coerce.number().int().positive().optional(),
});

// F-35 / US-14 : exports PDF et Excel
router.get(
  '/export',
  requireRole('admin', 'tutor'),
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const p = exportSchema.parse(req.query);
    let report: Report;
    switch (p.type) {
      case 'internship':
        if (!p.id) throw badRequest('Stage manquant.');
        report = await buildInternshipReport(u, p.id);
        break;
      case 'team':
        if (!p.id) throw badRequest('Équipe manquante.');
        report = await buildTeamReport(u, p.id);
        break;
      case 'tasks': {
        const params: unknown[] = [u.id];
        let where = `${taskScopeSql(u, 1)} AND t.status <> 'backlog'`;
        if (p.teamId) {
          params.push(p.teamId);
          where += ` AND t.team_id = $2`;
        }
        const rows = await query(`${TASK_SELECT} WHERE ${where} ORDER BY t.team_id, t.due_date NULLS LAST`, params);
        report = {
          title: 'Liste des tâches',
          figures: [
            { label: 'Tâches', value: String(rows.length) },
            { label: 'Terminées', value: String(rows.filter((r) => r.status === 'done').length) },
            { label: 'En retard', value: String(rows.filter((r) => r.is_overdue).length) },
          ],
          sections: [{ title: 'Tâches', columns: TASK_COLUMNS, rows }],
        };
        break;
      }
      case 'issues': {
        const rows = await query(
          `SELECT i.*, r.first_name || ' ' || r.last_name AS reporter_name FROM issues i JOIN users r ON r.id = i.reporter_id
           WHERE ${issueScopeSql(u, 1)} ORDER BY i.reported_at DESC`, [u.id]);
        report = {
          title: 'Difficultés signalées',
          figures: [
            { label: 'Total', value: String(rows.length) },
            { label: 'Non résolues', value: String(rows.filter((r) => r.status !== 'resolved').length) },
            { label: 'Critiques', value: String(rows.filter((r) => r.severity === 'critical').length) },
          ],
          sections: [{ title: 'Difficultés', columns: ISSUE_COLUMNS, rows }],
        };
        break;
      }
      case 'users': {
        if (u.role !== 'admin') throw forbidden();
        const rows = await query(
          `SELECT u.first_name || ' ' || u.last_name AS name, u.email, u.role, u.job_title, u.is_active,
             (SELECT name FROM departments d WHERE d.id = u.department_id) AS department,
             (SELECT string_agg(t.name, ', ') FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = u.id) AS teams
           FROM users u ORDER BY u.last_name`);
        report = {
          title: 'Personnel et stagiaires',
          sections: [{
            title: 'Comptes',
            columns: [
              { header: 'Nom', key: 'name', width: 6 }, { header: 'E-mail', key: 'email', width: 8 },
              { header: 'Rôle', key: 'role', width: 4, format: (v) => L.role[v] }, { header: 'Poste', key: 'job_title', width: 5 },
              { header: 'Département', key: 'department', width: 5 }, { header: 'Équipes', key: 'teams', width: 6 },
              { header: 'Statut', key: 'is_active', width: 3, format: (v) => (v ? 'Actif' : 'Désactivé') },
            ],
            rows,
          }],
        };
        break;
      }
      case 'global': {
        if (u.role !== 'admin') throw forbidden();
        const teams = await query(
          `SELECT t.name, (SELECT count(*) FROM team_members m WHERE m.team_id = t.id) AS members,
             (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status <> 'backlog') AS total,
             (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status = 'done') AS done,
             (SELECT count(*) FROM tasks k WHERE k.team_id = t.id AND k.status NOT IN ('done','backlog') AND k.due_date < CURRENT_DATE) AS overdue
           FROM teams t ORDER BY t.name`);
        const internships = await query(
          `SELECT i.first_name || ' ' || i.last_name AS intern, t.first_name || ' ' || t.last_name AS tutor, s.subject, s.status, s.start_date, s.end_date
           FROM internships s JOIN users i ON i.id = s.intern_id JOIN users t ON t.id = s.tutor_id ORDER BY s.start_date DESC`);
        const k = (await queryOne(`SELECT count(*) FILTER (WHERE status <> 'backlog') AS total, count(*) FILTER (WHERE status = 'done') AS done,
            count(*) FILTER (WHERE status NOT IN ('done','backlog') AND due_date < CURRENT_DATE) AS overdue FROM tasks`))!;
        const iss = (await queryOne(`SELECT count(*) FILTER (WHERE status <> 'resolved') AS open, count(*) FILTER (WHERE status = 'escalated') AS escalated FROM issues`))!;
        report = {
          title: 'Tableau de bord global',
          figures: [
            { label: 'Tâches', value: String(k.total) },
            { label: 'Taux de réalisation', value: pct(completionRate(k.done, k.total)) },
            { label: 'Tâches en retard', value: String(k.overdue) },
            { label: 'Difficultés ouvertes', value: `${iss.open} (dont ${iss.escalated} escaladées)` },
          ],
          sections: [
            {
              title: 'Équipes',
              columns: [
                { header: 'Équipe', key: 'name', width: 8 }, { header: 'Membres', key: 'members', width: 3, align: 'right' },
                { header: 'Tâches', key: 'total', width: 3, align: 'right' }, { header: 'Terminées', key: 'done', width: 3, align: 'right' },
                { header: 'Taux', key: 'done', width: 3, align: 'right', format: (_v, r) => pct(completionRate(r.done, r.total)) },
                { header: 'En retard', key: 'overdue', width: 3, align: 'right' },
              ],
              rows: teams,
            },
            {
              title: 'Stages',
              columns: [
                { header: 'Stagiaire', key: 'intern', width: 5 }, { header: 'Tuteur', key: 'tutor', width: 5 },
                { header: 'Sujet', key: 'subject', width: 9 }, { header: 'Statut', key: 'status', width: 3, format: (v) => L.internship[v] },
                { header: 'Début', key: 'start_date', width: 3, format: (v) => fr(v) }, { header: 'Fin', key: 'end_date', width: 3, format: (v) => fr(v) },
              ],
              rows: internships,
            },
          ],
        };
        break;
      }
    }
    const buffer = p.format === 'pdf' ? await renderPdf(report) : await renderXlsx(report);
    const slug = report.title.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase().replace(/^-|-$/g, '');
    await logActivity({ userId: u.id, action: 'report_exported', entity: 'report', summary: `Export ${p.format.toUpperCase()} : ${report.title}`, req });
    res.setHeader('Content-Type', p.format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.${p.format}"`);
    res.send(buffer);
  }),
);

export default router;
