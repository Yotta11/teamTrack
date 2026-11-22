import { Router } from 'express';
import { query, queryOne } from '../db/pool.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { managedUserIds } from '../services/scope.js';
import { asyncHandler, parseId } from '../utils/http.js';

export const notificationsRouter = Router();
notificationsRouter.use(authenticate);

notificationsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const unreadOnly = req.query.unread === 'true';
    const items = await query(
      `SELECT id, type, message, link, is_read, created_at FROM notifications
       WHERE recipient_id = $1 ${unreadOnly ? 'AND NOT is_read' : ''} ORDER BY created_at DESC LIMIT 60`,
      [req.user!.id],
    );
    const { n } = (await queryOne('SELECT count(*) AS n FROM notifications WHERE recipient_id = $1 AND NOT is_read', [req.user!.id]))!;
    res.json({ items, unread: n });
  }),
);

notificationsRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    await query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND recipient_id = $2', [parseId(req.params.id), req.user!.id]);
    res.json({ ok: true });
  }),
);

notificationsRouter.post(
  '/read-all',
  asyncHandler(async (req, res) => {
    await query('UPDATE notifications SET is_read = TRUE WHERE recipient_id = $1 AND NOT is_read', [req.user!.id]);
    res.json({ ok: true });
  }),
);

/* -------------------- Journal d'activité et d'audit (F-27) -------------------- */

export const activityRouter = Router();
activityRouter.use(authenticate);

activityRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const u = req.user!;
    const q = req.query as Record<string, string>;
    const params: unknown[] = [];
    const where: string[] = [];
    const add = (sql: string, v: unknown) => {
      params.push(v);
      where.push(sql.replaceAll('$?', `$${params.length}`));
    };
    const ids = await managedUserIds(u);
    if (ids !== 'all') add('l.user_id = ANY($?::int[])', ids);
    if (q.audit === 'true') {
      if (u.role !== 'admin') return res.json({ items: [], total: 0 });
      where.push('l.is_audit');
    }
    if (q.entity) add('l.entity = $?', q.entity);
    if (q.userId) add('l.user_id = $?', Number(q.userId));
    if (q.search) add('l.summary ILIKE $?', `%${q.search}%`);
    const limit = Math.min(Number(q.limit) || 50, 200);
    const offset = Math.max(Number(q.offset) || 0, 0);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const items = await query(
      `SELECT l.id, l.action, l.entity, l.entity_id, l.summary, l.is_audit, l.ip, l.created_at,
         u.first_name || ' ' || u.last_name AS user_name, u.avatar_url, u.role AS user_role
       FROM activity_log l LEFT JOIN users u ON u.id = l.user_id ${clause}
       ORDER BY l.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const total = (await queryOne(`SELECT count(*) AS n FROM activity_log l ${clause}`, params))!.n;
    res.json({ items, total });
  }),
);

activityRouter.get('/audit', requireRole('admin'), (req, res) => res.redirect(307, `${req.baseUrl}?audit=true`));
