import { parse } from 'csv-parse/sync';
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { csvUpload } from '../middleware/upload.js';
import { logActivity } from '../services/activity.js';
import { canViewUser, managedUserIds, myTeamsSql } from '../services/scope.js';
import { USER_PUBLIC_COLUMNS } from '../services/users.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, parseId } from '../utils/http.js';
import { sendMail } from '../utils/mailer.js';
import { PASSWORD_RULES, generateTempPassword, hashPassword, isStrongPassword } from '../utils/password.js';
import { config } from '../config.js';

const router = Router();
router.use(authenticate);

const ROLES = ['admin', 'tutor', 'employee', 'intern'] as const;
const ROLE_ALIASES: Record<string, (typeof ROLES)[number]> = {
  admin: 'admin', administrateur: 'admin', rh: 'admin',
  tutor: 'tutor', tuteur: 'tutor', 'chef d\'équipe': 'tutor', chef: 'tutor',
  employee: 'employee', 'employé': 'employee', employe: 'employee',
  intern: 'intern', stagiaire: 'intern',
};

// F-07 : recherche et filtres
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, value: unknown) => {
      params.push(value);
      where.push(sql.replaceAll('$?', `$${params.length}`));
    };
    const { search, role, teamId, status, departmentId, internFrom, internTo } = req.query as Record<string, string>;
    if (search) add(`(u.first_name || ' ' || u.last_name || ' ' || u.email) ILIKE $?`, `%${search}%`);
    if (role && ROLES.includes(role as never)) add('u.role = $?', role);
    if (teamId) add('u.id IN (SELECT user_id FROM team_members WHERE team_id = $?)', Number(teamId));
    if (departmentId) add('u.department_id = $?', Number(departmentId));
    if (status === 'active') where.push('u.is_active');
    if (status === 'inactive') where.push('NOT u.is_active');
    if (internFrom) add('u.id IN (SELECT intern_id FROM internships WHERE end_date >= $?)', internFrom);
    if (internTo) add('u.id IN (SELECT intern_id FROM internships WHERE start_date <= $?)', internTo);

    // Annuaire restreint pour les employés et stagiaires : membres de leurs équipes et leurs tuteurs.
    if (u.role === 'employee' || u.role === 'intern') {
      params.push(u.id);
      const n = params.length;
      where.push(`(u.id = $${n} OR u.id IN (SELECT user_id FROM team_members WHERE team_id IN ${myTeamsSql(n)})
        OR u.id IN (SELECT lead_id FROM teams WHERE id IN ${myTeamsSql(n)})
        OR u.id IN (SELECT tutor_id FROM internships WHERE intern_id = $${n}))`);
    }

    const rows = await query(
      `SELECT ${USER_PUBLIC_COLUMNS},
         COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name)
           FROM teams t JOIN team_members m ON m.team_id = t.id WHERE m.user_id = u.id), '[]') AS teams,
         (SELECT json_build_object('id', s.id, 'start_date', s.start_date, 'end_date', s.end_date, 'status', s.status)
            FROM internships s WHERE s.intern_id = u.id ORDER BY s.start_date DESC LIMIT 1) AS internship
       FROM users u ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY u.is_active DESC, u.last_name, u.first_name`,
      params,
    );
    res.json(rows);
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    if (!(await canViewUser(req.user!, id))) throw forbidden();
    const user = await queryOne(`SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`, [id]);
    if (!user) throw notFound('Utilisateur');
    const teams = await query(
      `SELECT t.id, t.name, (t.lead_id = $1) AS is_lead FROM teams t
       WHERE t.lead_id = $1 OR t.id IN (SELECT team_id FROM team_members WHERE user_id = $1) ORDER BY t.name`,
      [id],
    );
    const internships = await query(
      `SELECT s.id, s.subject, s.status, s.start_date, s.end_date, s.school,
         tu.first_name || ' ' || tu.last_name AS tutor_name
       FROM internships s JOIN users tu ON tu.id = s.tutor_id WHERE s.intern_id = $1 ORDER BY s.start_date DESC`,
      [id],
    );
    res.json({ ...user, teams, internships });
  }),
);

const userSchema = z.object({
  firstName: z.string().trim().min(1, 'Prénom requis.').max(80),
  lastName: z.string().trim().min(1, 'Nom requis.').max(80),
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  role: z.enum(ROLES),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  departmentId: z.number().int().positive().optional().nullable(),
  skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  wipLimit: z.number().int().min(1).max(20).optional(),
  teamIds: z.array(z.number().int().positive()).optional(),
  password: z.string().optional(),
});

async function welcomeMail(email: string, firstName: string, password: string) {
  await sendMail(
    email,
    'TeamTrack · Votre compte a été créé',
    `Bonjour ${firstName},\n\nVotre compte TeamTrack est prêt.\nIdentifiant : ${email}\nMot de passe provisoire : ${password}\n\nConnectez-vous sur ${config.appUrl} puis changez ce mot de passe depuis votre profil.`,
  );
}

// US-02 : création de compte et attribution du rôle (admin)
router.post(
  '/',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const data = userSchema.parse(req.body);
    if (data.password && !isStrongPassword(data.password)) throw badRequest(PASSWORD_RULES, 'WEAK_PASSWORD');
    const password = data.password || generateTempPassword();
    const created = await transaction(async (db) => {
      const row = await queryOne(
        `INSERT INTO users (first_name, last_name, email, password_hash, role, job_title, phone, department_id, skills, wip_limit)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [data.firstName, data.lastName, data.email, await hashPassword(password), data.role, data.jobTitle ?? null,
          data.phone ?? null, data.departmentId ?? null, data.skills ?? [], data.wipLimit ?? 3],
        db,
      );
      for (const teamId of data.teamIds ?? []) {
        await query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [teamId, row.id], db);
      }
      await logActivity({ userId: req.user!.id, action: 'user_created', entity: 'user', entityId: row.id,
        summary: `Compte créé : ${data.firstName} ${data.lastName} (${data.role})`, audit: true, req }, db);
      return row;
    });
    await welcomeMail(data.email, data.firstName, password);
    const user = await queryOne(`SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`, [created.id]);
    res.status(201).json({ user, temporaryPassword: data.password ? undefined : password });
  }),
);

router.put(
  '/:id',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const data = userSchema.omit({ password: true }).parse(req.body);
    const before = await queryOne('SELECT role FROM users WHERE id = $1', [id]);
    if (!before) throw notFound('Utilisateur');
    if (id === req.user!.id && data.role !== 'admin') throw badRequest('Vous ne pouvez pas retirer votre propre rôle administrateur.');
    await transaction(async (db) => {
      await query(
        `UPDATE users SET first_name=$2, last_name=$3, email=$4, role=$5, job_title=$6, phone=$7, department_id=$8,
           skills=COALESCE($9, skills), wip_limit=COALESCE($10, wip_limit), updated_at=now() WHERE id=$1`,
        [id, data.firstName, data.lastName, data.email, data.role, data.jobTitle ?? null, data.phone ?? null,
          data.departmentId ?? null, data.skills ?? null, data.wipLimit ?? null],
        db,
      );
      if (data.teamIds) {
        await query('DELETE FROM team_members WHERE user_id = $1 AND NOT (team_id = ANY($2::int[]))', [id, data.teamIds], db);
        for (const teamId of data.teamIds) {
          await query('INSERT INTO team_members (team_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [teamId, id], db);
        }
      }
      await logActivity({ userId: req.user!.id, action: before.role !== data.role ? 'role_changed' : 'user_updated',
        entity: 'user', entityId: id,
        summary: before.role !== data.role ? `Rôle modifié : ${before.role} → ${data.role}` : 'Fiche modifiée',
        audit: before.role !== data.role, req }, db);
    });
    res.json(await queryOne(`SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`, [id]));
  }),
);

// RG-09 : limite WIP modifiable par le tuteur pour les personnes qu'il encadre
router.patch(
  '/:id/wip-limit',
  requireRole('admin', 'tutor'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { wipLimit } = z.object({ wipLimit: z.number().int().min(1).max(20) }).parse(req.body);
    const ids = await managedUserIds(req.user!);
    if (ids !== 'all' && !ids.includes(id)) throw forbidden();
    await query('UPDATE users SET wip_limit = $2 WHERE id = $1', [id, wipLimit]);
    await logActivity({ userId: req.user!.id, action: 'wip_changed', entity: 'user', entityId: id, summary: `Limite WIP fixée à ${wipLimit}`, req });
    res.json({ ok: true, wipLimit });
  }),
);

// RG-07 : un compte n'est jamais supprimé, il est désactivé
router.patch(
  '/:id/status',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    if (id === req.user!.id && !active) throw badRequest('Vous ne pouvez pas désactiver votre propre compte.');
    if (!active) {
      // RG-01 : un stagiaire doit toujours avoir un tuteur référent actif
      const blocking = await queryOne(
        `SELECT count(*) AS n FROM internships WHERE tutor_id = $1 AND status IN ('upcoming','active','suspended')`,
        [id],
      );
      if (blocking.n > 0) {
        throw conflict(
          `Ce tuteur encadre ${blocking.n} stage(s) en cours. Réaffectez-les à un autre tuteur avant de désactiver le compte.`,
          'TUTOR_HAS_INTERNSHIPS',
        );
      }
      await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [id]);
    }
    await query('UPDATE users SET is_active = $2, updated_at = now() WHERE id = $1', [id, active]);
    await logActivity({ userId: req.user!.id, action: active ? 'user_reactivated' : 'user_deactivated', entity: 'user',
      entityId: id, summary: active ? 'Compte réactivé' : 'Compte désactivé', audit: true, req });
    res.json({ ok: true });
  }),
);

router.post(
  '/:id/reset-password',
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const user = await queryOne('SELECT email, first_name FROM users WHERE id = $1', [id]);
    if (!user) throw notFound('Utilisateur');
    const password = generateTempPassword();
    await query('UPDATE users SET password_hash = $2, failed_attempts = 0, locked_until = NULL WHERE id = $1', [id, await hashPassword(password)]);
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [id]);
    await welcomeMail(user.email, user.first_name, password);
    await logActivity({ userId: req.user!.id, action: 'password_reset_by_admin', entity: 'user', entityId: id, audit: true, req });
    res.json({ temporaryPassword: password });
  }),
);

// F-08 : import CSV (colonnes : prenom;nom;email;role;poste;departement;equipe)
router.post(
  '/import',
  requireRole('admin'),
  csvUpload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Aucun fichier CSV reçu.');
    const text = req.file.buffer.toString('utf8').replace(/^\uFEFF/, '');
    const delimiter = (text.split('\n')[0].match(/;/g)?.length ?? 0) >= 2 ? ';' : ',';
    let records: Record<string, string>[];
    try {
      records = parse(text, { columns: (h: string[]) => h.map((c) => c.trim().toLowerCase()), delimiter, skip_empty_lines: true, trim: true });
    } catch {
      throw badRequest('Fichier CSV illisible. Vérifiez le séparateur et les en-têtes.');
    }
    const pick = (r: Record<string, string>, ...keys: string[]) => keys.map((k) => r[k]).find((v) => v) ?? '';
    const created: { email: string; name: string; temporaryPassword: string }[] = [];
    const errors: { line: number; message: string }[] = [];
    for (const [i, r] of records.entries()) {
      const line = i + 2;
      const firstName = pick(r, 'prenom', 'prénom', 'first_name', 'firstname');
      const lastName = pick(r, 'nom', 'last_name', 'lastname');
      const email = pick(r, 'email', 'e-mail', 'mail').toLowerCase();
      const role = ROLE_ALIASES[pick(r, 'role', 'rôle').toLowerCase()];
      if (!firstName || !lastName || !z.string().email().safeParse(email).success || !role) {
        errors.push({ line, message: 'Prénom, nom, e-mail valide et rôle (admin, tuteur, employé, stagiaire) obligatoires.' });
        continue;
      }
      try {
        const password = generateTempPassword();
        await transaction(async (db) => {
          const deptName = pick(r, 'departement', 'département', 'department');
          let deptId: number | null = null;
          if (deptName) {
            const d = await queryOne(
              `INSERT INTO departments (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
              [deptName], db);
            deptId = d.id;
          }
          const u = await queryOne(
            `INSERT INTO users (first_name, last_name, email, password_hash, role, job_title, department_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
            [firstName, lastName, email, await hashPassword(password), role, pick(r, 'poste', 'job_title') || null, deptId], db);
          const teamName = pick(r, 'equipe', 'équipe', 'team');
          if (teamName) {
            const t = await queryOne('SELECT id FROM teams WHERE lower(name) = lower($1)', [teamName], db);
            if (t) await query('INSERT INTO team_members (team_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [t.id, u.id], db);
          }
        });
        created.push({ email, name: `${firstName} ${lastName}`, temporaryPassword: password });
        await welcomeMail(email, firstName, password);
      } catch (err) {
        errors.push({ line, message: (err as { code?: string }).code === '23505' ? `L'adresse ${email} existe déjà.` : 'Ligne non importée.' });
      }
    }
    await logActivity({ userId: req.user!.id, action: 'users_imported', entity: 'user',
      summary: `Import CSV : ${created.length} compte(s) créé(s), ${errors.length} erreur(s)`, audit: true, req });
    res.json({ created, errors });
  }),
);

export default router;
