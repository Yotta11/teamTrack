import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { fileUpload, uploadDir } from '../middleware/upload.js';
import { logActivity } from '../services/activity.js';
import { INTERNSHIP_SELECT, internshipSummary } from '../services/internships.js';
import { notify } from '../services/notifications.js';
import { internshipScopeSql } from '../services/scope.js';
import { asyncHandler, badRequest, conflict, forbidden, notFound, parseId } from '../utils/http.js';
import { today } from '../utils/dates.js';
import type { AuthUser } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

const STATUSES = ['upcoming', 'active', 'suspended', 'completed', 'evaluated'] as const;
type Status = (typeof STATUSES)[number];

/** F-10 : transitions de statut autorisées. */
export const STATUS_TRANSITIONS: Record<Status, Status[]> = {
  upcoming: ['active', 'suspended'],
  active: ['suspended', 'completed'],
  suspended: ['active', 'completed'],
  completed: ['evaluated', 'active'],
  evaluated: [],
};

const STATUS_LABEL: Record<Status, string> = {
  upcoming: 'à venir', active: 'en cours', suspended: 'suspendu', completed: 'terminé', evaluated: 'évalué',
};

export async function loadInternshipFor(user: AuthUser, id: number) {
  const row = await queryOne(`${INTERNSHIP_SELECT} WHERE s.id = $1 AND ${internshipScopeSql(user, 2)}`, [id, user.id]);
  if (!row) throw notFound('Stage');
  return row;
}

/** Le tuteur référent, le délégué actif ou un admin peuvent gérer le stage. */
export function canManageInternship(user: AuthUser, s: { tutor_id: number; delegate_id: number | null; delegate_until: string | null }) {
  if (user.role === 'admin') return true;
  if (s.tutor_id === user.id) return true;
  return s.delegate_id === user.id && (!s.delegate_until || s.delegate_until >= today());
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const params: unknown[] = [u.id];
    const where = [internshipScopeSql(u, 1)];
    const { status, search } = req.query as Record<string, string>;
    if (status && STATUSES.includes(status as Status)) {
      params.push(status);
      where.push(`s.status = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      where.push(`(i.first_name || ' ' || i.last_name || ' ' || s.subject || ' ' || s.school) ILIKE $${params.length}`);
    }
    res.json(await query(`${INTERNSHIP_SELECT} WHERE ${where.join(' AND ')} ORDER BY
      array_position(ARRAY['active','upcoming','suspended','completed','evaluated']::internship_status[], s.status), s.start_date DESC`, params));
  }),
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const s = await loadInternshipFor(req.user!, id);
    const [history, documents] = await Promise.all([
      query(`SELECT h.*, u.first_name || ' ' || u.last_name AS changed_by_name FROM internship_status_history h
             LEFT JOIN users u ON u.id = h.changed_by WHERE h.internship_id = $1 ORDER BY h.changed_at DESC`, [id]),
      query(`SELECT d.id, d.kind, d.file_name, d.mime, d.size, d.uploaded_at, u.first_name || ' ' || u.last_name AS uploaded_by_name
             FROM internship_documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.internship_id = $1 ORDER BY d.uploaded_at DESC`, [id]),
    ]);
    res.json({ ...s, history, documents, canManage: canManageInternship(req.user!, s), allowedTransitions: STATUS_TRANSITIONS[s.status as Status] });
  }),
);

router.get(
  '/:id/summary',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await loadInternshipFor(req.user!, id);
    res.json(await internshipSummary(id));
  }),
);

const internshipSchema = z.object({
  internId: z.number().int().positive(),
  tutorId: z.number().int().positive(),
  school: z.string().trim().min(2, 'Établissement requis.').max(180),
  subject: z.string().trim().min(3, 'Sujet requis.').max(255),
  objectives: z.string().trim().min(3, 'Objectifs pédagogiques requis.').max(5000),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de début invalide.'),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date de fin invalide.'),
});

async function validateInternship(d: z.infer<typeof internshipSchema>, excludeId?: number) {
  if (d.endDate <= d.startDate) throw badRequest('La date de fin doit être postérieure à la date de début.');
  const intern = await queryOne('SELECT role, is_active FROM users WHERE id = $1', [d.internId]);
  if (!intern || intern.role !== 'intern' || !intern.is_active) throw badRequest('La personne sélectionnée doit être un stagiaire actif.');
  // RG-01 : tuteur référent actif obligatoire
  const tutor = await queryOne('SELECT role, is_active FROM users WHERE id = $1', [d.tutorId]);
  if (!tutor || !tutor.is_active || !['tutor', 'admin'].includes(tutor.role)) {
    throw badRequest('Le tuteur référent doit être un tuteur actif.', 'RG-01');
  }
  const overlap = await queryOne(
    `SELECT id FROM internships WHERE intern_id = $1 AND id <> $4 AND status <> 'evaluated'
       AND daterange(start_date, end_date, '[]') && daterange($2::date, $3::date, '[]')`,
    [d.internId, d.startDate, d.endDate, excludeId ?? 0],
  );
  if (overlap) throw conflict('Ce stagiaire a déjà un stage sur cette période.');
}

// US-04 / F-09 : création d'un stage
router.post(
  '/',
  requireRole('admin', 'tutor'),
  asyncHandler(async (req, res) => {
    const d = internshipSchema.parse(req.body);
    if (req.user!.role === 'tutor' && d.tutorId !== req.user!.id) throw forbidden('Un tuteur ne peut créer que les stages qu\'il encadre.');
    await validateInternship(d);
    const status: Status = d.startDate > today() ? 'upcoming' : 'active';
    const row = await transaction(async (db) => {
      const s = await queryOne(
        `INSERT INTO internships (intern_id, tutor_id, school, subject, objectives, start_date, end_date, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [d.internId, d.tutorId, d.school, d.subject, d.objectives, d.startDate, d.endDate, status, req.user!.id], db);
      await query('INSERT INTO internship_status_history (internship_id, from_status, to_status, note, changed_by) VALUES ($1, NULL, $2, $3, $4)',
        [s.id, status, 'Création du stage', req.user!.id], db);
      await logActivity({ userId: req.user!.id, action: 'internship_created', entity: 'internship', entityId: s.id, summary: `Stage créé : ${d.subject}`, req }, db);
      await notify({ recipients: [d.internId, d.tutorId], excludeUserId: req.user!.id, type: 'internship',
        message: `Un stage « ${d.subject} » a été créé (${d.startDate} → ${d.endDate}).`, link: `/stages/${s.id}` }, db);
      return s;
    });
    res.status(201).json(await queryOne(`${INTERNSHIP_SELECT} WHERE s.id = $1`, [row.id]));
  }),
);

router.put(
  '/:id',
  requireRole('admin', 'tutor'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const s = await loadInternshipFor(req.user!, id);
    if (!canManageInternship(req.user!, s)) throw forbidden();
    const d = internshipSchema.parse(req.body);
    if (req.user!.role !== 'admin' && d.tutorId !== s.tutor_id) throw forbidden('Seul un administrateur peut changer le tuteur référent.');
    await validateInternship(d, id);
    await query(
      `UPDATE internships SET intern_id=$2, tutor_id=$3, school=$4, subject=$5, objectives=$6, start_date=$7, end_date=$8 WHERE id=$1`,
      [id, d.internId, d.tutorId, d.school, d.subject, d.objectives, d.startDate, d.endDate]);
    await logActivity({ userId: req.user!.id, action: 'internship_updated', entity: 'internship', entityId: id,
      summary: d.tutorId !== s.tutor_id ? 'Tuteur référent modifié' : 'Stage modifié', audit: d.tutorId !== s.tutor_id, req });
    res.json(await queryOne(`${INTERNSHIP_SELECT} WHERE s.id = $1`, [id]));
  }),
);

// F-10 : changement de statut avec historique
router.patch(
  '/:id/status',
  requireRole('admin', 'tutor', 'employee'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const s = await loadInternshipFor(req.user!, id);
    if (!canManageInternship(req.user!, s)) throw forbidden();
    const { status, note } = z.object({ status: z.enum(STATUSES), note: z.string().trim().max(1000).optional() }).parse(req.body);
    if (!STATUS_TRANSITIONS[s.status as Status].includes(status)) {
      throw badRequest(`Passage de « ${STATUS_LABEL[s.status as Status]} » à « ${STATUS_LABEL[status]} » impossible.`);
    }
    if (status === 'evaluated') {
      const ev = await queryOne('SELECT count(*) AS n FROM evaluations WHERE internship_id = $1', [id]);
      if (ev.n === 0) throw badRequest('Enregistrez au moins une évaluation avant de marquer le stage comme évalué.');
    }
    await transaction(async (db) => {
      await query('UPDATE internships SET status = $2 WHERE id = $1', [id, status], db);
      await query('INSERT INTO internship_status_history (internship_id, from_status, to_status, note, changed_by) VALUES ($1,$2,$3,$4,$5)',
        [id, s.status, status, note ?? null, req.user!.id], db);
      await logActivity({ userId: req.user!.id, action: 'internship_status', entity: 'internship', entityId: id,
        summary: `Stage ${STATUS_LABEL[status]}`, req }, db);
      await notify({ recipients: [s.intern_id, s.tutor_id], excludeUserId: req.user!.id, type: 'internship',
        message: `Le stage « ${s.subject} » est maintenant ${STATUS_LABEL[status]}.`, link: `/stages/${id}` }, db);
    });
    res.json({ ok: true });
  }),
);

// F-11 : délégation du suivi en cas d'absence
router.post(
  '/:id/delegate',
  requireRole('admin', 'tutor'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const s = await loadInternshipFor(req.user!, id);
    if (req.user!.role !== 'admin' && s.tutor_id !== req.user!.id) throw forbidden('Seul le tuteur référent peut déléguer le suivi.');
    const d = z.object({
      delegateId: z.number().int().positive(),
      until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
      note: z.string().trim().max(500).optional(),
    }).parse(req.body);
    const delegate = await queryOne('SELECT role, is_active, first_name, last_name FROM users WHERE id = $1', [d.delegateId]);
    if (!delegate?.is_active || !['tutor', 'employee', 'admin'].includes(delegate.role) || d.delegateId === s.tutor_id) {
      throw badRequest('Choisissez un autre tuteur ou employé actif.');
    }
    await query('UPDATE internships SET delegate_id = $2, delegate_until = $3 WHERE id = $1', [id, d.delegateId, d.until ?? null]);
    await logActivity({ userId: req.user!.id, action: 'internship_delegated', entity: 'internship', entityId: id,
      summary: `Suivi délégué à ${delegate.first_name} ${delegate.last_name}${d.until ? ` jusqu'au ${d.until}` : ''}`, details: { note: d.note }, req });
    await notify({ recipients: [d.delegateId], type: 'internship', link: `/stages/${id}`,
      message: `Le suivi du stage de ${s.intern.first_name} ${s.intern.last_name} vous est délégué${d.until ? ` jusqu'au ${d.until}` : ''}.` });
    res.json({ ok: true });
  }),
);

router.delete(
  '/:id/delegate',
  requireRole('admin', 'tutor'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const s = await loadInternshipFor(req.user!, id);
    if (req.user!.role !== 'admin' && s.tutor_id !== req.user!.id) throw forbidden();
    await query('UPDATE internships SET delegate_id = NULL, delegate_until = NULL WHERE id = $1', [id]);
    await logActivity({ userId: req.user!.id, action: 'internship_delegation_ended', entity: 'internship', entityId: id, summary: 'Délégation terminée', req });
    res.json({ ok: true });
  }),
);

// F-12 : documents du stage
const DOC_KINDS = ['convention', 'attestation', 'rapport', 'autre'] as const;

router.post(
  '/:id/documents',
  fileUpload('internships').single('file'),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const s = await loadInternshipFor(req.user!, id);
    if (!req.file) throw badRequest('Aucun fichier reçu.');
    const kind = DOC_KINDS.includes(req.body.kind) ? req.body.kind : 'autre';
    if (req.user!.role === 'intern' && kind === 'attestation') {
      fs.rmSync(req.file.path, { force: true });
      throw forbidden("L'attestation est déposée par le tuteur ou l'administration.");
    }
    const doc = await queryOne(
      `INSERT INTO internship_documents (internship_id, kind, file_name, stored_name, mime, size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, kind, file_name, mime, size, uploaded_at`,
      [id, kind, req.file.originalname, req.file.filename, req.file.mimetype, req.file.size, req.user!.id]);
    await logActivity({ userId: req.user!.id, action: 'document_uploaded', entity: 'internship', entityId: id, summary: `Document déposé : ${req.file.originalname}`, req });
    await notify({ recipients: [s.intern_id, s.tutor_id], excludeUserId: req.user!.id, type: 'internship', email: false,
      message: `Nouveau document (${kind}) sur le stage « ${s.subject} ».`, link: `/stages/${id}` });
    res.status(201).json(doc);
  }),
);

router.get(
  '/:id/documents/:docId',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    await loadInternshipFor(req.user!, id);
    const doc = await queryOne('SELECT * FROM internship_documents WHERE id = $1 AND internship_id = $2', [parseId(req.params.docId), id]);
    if (!doc) throw notFound('Document');
    const filePath = path.join(uploadDir('internships'), path.basename(doc.stored_name));
    if (!fs.existsSync(filePath)) throw notFound('Fichier');
    res.download(filePath, doc.file_name);
  }),
);

router.delete(
  '/:id/documents/:docId',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id);
    const s = await loadInternshipFor(req.user!, id);
    const doc = await queryOne('SELECT * FROM internship_documents WHERE id = $1 AND internship_id = $2', [parseId(req.params.docId), id]);
    if (!doc) throw notFound('Document');
    if (doc.uploaded_by !== req.user!.id && !canManageInternship(req.user!, s)) throw forbidden();
    await query('DELETE FROM internship_documents WHERE id = $1', [doc.id]);
    fs.rmSync(path.join(uploadDir('internships'), path.basename(doc.stored_name)), { force: true });
    res.json({ ok: true });
  }),
);

export default router;
