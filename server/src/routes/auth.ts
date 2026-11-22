import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config.js';
import { query, queryOne, transaction } from '../db/pool.js';
import { authenticate } from '../middleware/auth.js';
import { imageUpload } from '../middleware/upload.js';
import { logActivity } from '../services/activity.js';
import { USER_PUBLIC_COLUMNS } from '../services/users.js';
import { HttpError, asyncHandler, badRequest, unauthorized } from '../utils/http.js';
import { sendMail } from '../utils/mailer.js';
import {
  PASSWORD_RULES,
  hashPassword,
  isStrongPassword,
  randomToken,
  sha256,
  verifyPassword,
} from '../utils/password.js';
import { signAccessToken } from '../utils/tokens.js';

const router = Router();
const REFRESH_COOKIE = 'tt_refresh';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isTest ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Trop de tentatives, réessayez dans quelques minutes.', code: 'RATE_LIMIT' } },
});

function setRefreshCookie(res: import('express').Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.isProd,
    sameSite: 'strict',
    path: '/api/auth',
    maxAge: config.refreshTokenDays * 24 * 3600 * 1000,
  });
}

async function issueSession(res: import('express').Response, userId: number) {
  const user = await queryOne(`SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`, [userId]);
  const refresh = randomToken();
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [userId, sha256(refresh), String(config.refreshTokenDays)],
  );
  setRefreshCookie(res, refresh);
  const accessToken = signAccessToken({
    sub: user.id,
    role: user.role,
    name: `${user.first_name} ${user.last_name}`,
  });
  return { accessToken, user };
}

/** Protection CSRF des routes reposant sur le cookie : en-tête personnalisé obligatoire. */
function requireCsrfHeader(req: import('express').Request) {
  if (req.get('X-Requested-With') !== 'TeamTrack') throw new HttpError(403, 'Requête refusée.', 'CSRF');
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.'),
  password: z.string().min(1, 'Mot de passe requis.'),
});

// F-01 : connexion sécurisée avec blocage temporaire après 5 échecs.
router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body);
    const user = await queryOne(
      'SELECT id, password_hash, is_active, failed_attempts, locked_until FROM users WHERE email = $1',
      [email],
    );
    const invalid = new HttpError(401, 'E-mail ou mot de passe incorrect.', 'INVALID_CREDENTIALS');
    if (!user) throw invalid;
    if (!user.is_active) throw new HttpError(403, 'Ce compte est désactivé. Contactez votre administrateur.', 'INACTIVE');
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutes = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      throw new HttpError(423, `Compte temporairement bloqué après ${config.maxLoginAttempts} échecs. Réessayez dans ${minutes} min.`, 'LOCKED');
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const attempts = user.failed_attempts + 1;
      const lock = attempts >= config.maxLoginAttempts;
      await query(
        `UPDATE users SET failed_attempts = $2,
           locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval ELSE NULL END
         WHERE id = $1`,
        [user.id, lock ? 0 : attempts, lock, String(config.lockMinutes)],
      );
      if (lock) {
        await logActivity({ userId: user.id, action: 'account_locked', entity: 'user', entityId: user.id, audit: true, req });
        throw new HttpError(423, `Compte bloqué pendant ${config.lockMinutes} minutes après ${config.maxLoginAttempts} échecs.`, 'LOCKED');
      }
      const left = config.maxLoginAttempts - attempts;
      throw new HttpError(401, `E-mail ou mot de passe incorrect. ${left} tentative${left > 1 ? 's' : ''} restante${left > 1 ? 's' : ''}.`, 'INVALID_CREDENTIALS');
    }
    await query('UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1', [user.id]);
    await logActivity({ userId: user.id, action: 'login', entity: 'user', entityId: user.id, audit: true, req });
    res.json(await issueSession(res, user.id));
  }),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    requireCsrfHeader(req);
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('Session expirée.');
    const row = await queryOne(
      `SELECT r.id, r.user_id FROM refresh_tokens r JOIN users u ON u.id = r.user_id
       WHERE r.token_hash = $1 AND NOT r.revoked AND r.expires_at > now() AND u.is_active`,
      [sha256(token)],
    );
    if (!row) {
      res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
      throw unauthorized('Session expirée.');
    }
    // Rotation du jeton de rafraîchissement
    await query('UPDATE refresh_tokens SET revoked = TRUE WHERE id = $1', [row.id]);
    res.json(await issueSession(res, row.user_id));
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (token) await query('UPDATE refresh_tokens SET revoked = TRUE WHERE token_hash = $1', [sha256(token)]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    res.json({ ok: true });
  }),
);

// F-03 : mot de passe oublié — lien valable 30 minutes.
router.post(
  '/forgot-password',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const { email } = z.object({ email: z.string().trim().toLowerCase().email('Adresse e-mail invalide.') }).parse(req.body);
    const user = await queryOne('SELECT id, first_name FROM users WHERE email = $1 AND is_active', [email]);
    if (user) {
      const token = randomToken();
      await query(
        `INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
        [user.id, sha256(token), String(config.resetTokenMinutes)],
      );
      const link = `${config.appUrl}/reinitialiser?token=${token}`;
      await sendMail(
        email,
        'TeamTrack · Réinitialisation de votre mot de passe',
        `Bonjour ${user.first_name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable ${config.resetTokenMinutes} minutes) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`,
      );
      await logActivity({ userId: user.id, action: 'password_reset_requested', entity: 'user', entityId: user.id, audit: true, req });
    }
    // Réponse identique que le compte existe ou non (pas d'énumération des comptes).
    res.json({ ok: true, message: 'Si un compte correspond à cette adresse, un lien de réinitialisation a été envoyé.' });
  }),
);

router.post(
  '/reset-password',
  asyncHandler(async (req, res) => {
    const { token, password } = z.object({ token: z.string().min(10), password: z.string() }).parse(req.body);
    if (!isStrongPassword(password)) throw badRequest(PASSWORD_RULES, 'WEAK_PASSWORD');
    await transaction(async (db) => {
      const row = await queryOne(
        `SELECT id, user_id FROM password_resets WHERE token_hash = $1 AND NOT used AND expires_at > now() FOR UPDATE`,
        [sha256(token)],
        db,
      );
      if (!row) throw badRequest('Ce lien est invalide ou a expiré. Faites une nouvelle demande.', 'INVALID_TOKEN');
      await query('UPDATE password_resets SET used = TRUE WHERE id = $1', [row.id], db);
      await query(
        'UPDATE users SET password_hash = $2, failed_attempts = 0, locked_until = NULL, updated_at = now() WHERE id = $1',
        [row.user_id, await hashPassword(password)],
        db,
      );
      await query('UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1', [row.user_id], db);
      await logActivity({ userId: row.user_id, action: 'password_reset', entity: 'user', entityId: row.user_id, audit: true, req }, db);
    });
    res.json({ ok: true });
  }),
);

// F-04 : profil utilisateur
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const me = await queryOne(`SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`, [req.user!.id]);
    const teams = await query(
      `SELECT t.id, t.name, (t.lead_id = $1) AS is_lead FROM teams t
       WHERE t.lead_id = $1 OR t.id IN (SELECT team_id FROM team_members WHERE user_id = $1) ORDER BY t.name`,
      [req.user!.id],
    );
    res.json({ ...me, teams });
  }),
);

const profileSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().max(40).optional().nullable(),
  jobTitle: z.string().trim().max(120).optional().nullable(),
  skills: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
});

router.put(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const p = profileSchema.parse(req.body);
    await query(
      `UPDATE users SET first_name = $2, last_name = $3, phone = $4, job_title = $5, skills = $6, updated_at = now() WHERE id = $1`,
      [req.user!.id, p.firstName, p.lastName, p.phone ?? null, p.jobTitle ?? null, p.skills],
    );
    await logActivity({ userId: req.user!.id, action: 'profile_updated', entity: 'user', entityId: req.user!.id, summary: 'Profil mis à jour', req });
    res.json(await queryOne(`SELECT ${USER_PUBLIC_COLUMNS} FROM users u WHERE u.id = $1`, [req.user!.id]));
  }),
);

router.post(
  '/me/avatar',
  authenticate,
  imageUpload.single('avatar'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Aucune image reçue.');
    const url = `/uploads/avatars/${req.file.filename}`;
    await query('UPDATE users SET avatar_url = $2, updated_at = now() WHERE id = $1', [req.user!.id, url]);
    res.json({ avatarUrl: url });
  }),
);

router.post(
  '/me/password',
  authenticate,
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = z
      .object({ currentPassword: z.string().min(1), newPassword: z.string() })
      .parse(req.body);
    const row = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user!.id]);
    if (!(await verifyPassword(currentPassword, row.password_hash))) {
      throw badRequest('Le mot de passe actuel est incorrect.', 'INVALID_PASSWORD');
    }
    if (!isStrongPassword(newPassword)) throw badRequest(PASSWORD_RULES, 'WEAK_PASSWORD');
    await query('UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1', [req.user!.id, await hashPassword(newPassword)]);
    await logActivity({ userId: req.user!.id, action: 'password_changed', entity: 'user', entityId: req.user!.id, audit: true, req });
    res.json({ ok: true });
  }),
);

export default router;
