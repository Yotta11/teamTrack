import { Router } from 'express';
import { z } from 'zod';
import { query, queryOne, transaction } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { logActivity } from '../services/activity.js';
import { notify } from '../services/notifications.js';
import { asyncHandler, badRequest, forbidden, parseId } from '../utils/http.js';
import { evaluationAverage } from '../utils/progress.js';
import { canManageInternship, loadInternshipFor } from './internships.js';

const router = Router();
router.use(authenticate);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const internshipId = parseId(req.query.internshipId, 'Stage');
    await loadInternshipFor(req.user!, internshipId); // RG-08 : périmètre
    const rows = await query(
      `SELECT e.*, u.first_name || ' ' || u.last_name AS evaluator_name FROM evaluations e
       JOIN users u ON u.id = e.evaluator_id WHERE e.internship_id = $1 ORDER BY e.eval_date DESC, e.id DESC`,
      [internshipId],
    );
    res.json(rows.map((e) => ({ ...e, average: evaluationAverage(e) })));
  }),
);

const score = z.number().int().min(1, 'Note de 1 à 5.').max(5, 'Note de 1 à 5.');
const evalSchema = z.object({
  internshipId: z.number().int().positive(),
  evalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  attendance: score,
  quality: score,
  autonomy: score,
  communication: score,
  deadlines: score,
  comment: z.string().trim().max(4000).optional().nullable(),
  isFinal: z.boolean().optional(),
});

// US-12 / F-33 : fiche d'évaluation périodique
router.post(
  '/',
  requireRole('admin', 'tutor', 'employee'),
  asyncHandler(async (req, res) => {
    const e = evalSchema.parse(req.body);
    const s = await loadInternshipFor(req.user!, e.internshipId);
    if (!canManageInternship(req.user!, s)) throw forbidden("Seul le tuteur du stagiaire peut l'évaluer.");
    if (s.status === 'upcoming') throw badRequest("Le stage n'a pas encore commencé.");
    const row = await transaction(async (db) => {
      const ev = await queryOne(
        `INSERT INTO evaluations (internship_id, evaluator_id, eval_date, attendance, quality, autonomy, communication, deadlines, comment, is_final)
         VALUES ($1,$2,COALESCE($3::date, CURRENT_DATE),$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [e.internshipId, req.user!.id, e.evalDate ?? null, e.attendance, e.quality, e.autonomy, e.communication, e.deadlines, e.comment ?? null, e.isFinal ?? false],
        db,
      );
      await logActivity({ userId: req.user!.id, action: 'evaluation_created', entity: 'internship', entityId: e.internshipId,
        summary: `Évaluation enregistrée (moyenne ${evaluationAverage(ev)}/5)`, audit: true, req }, db);
      await notify({ recipients: [s.intern_id], type: 'evaluation_new', link: `/stages/${e.internshipId}`,
        message: `Une nouvelle évaluation de votre stage est disponible.` }, db);
      return ev;
    });
    res.status(201).json({ ...row, average: evaluationAverage(row) });
  }),
);

export default router;
