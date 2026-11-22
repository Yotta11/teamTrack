import type { NextFunction, Request, Response } from 'express';
import { queryOne } from '../db/pool.js';
import { forbidden, unauthorized } from '../utils/http.js';
import { type Role, verifyAccessToken } from '../utils/tokens.js';

export interface AuthUser {
  id: number;
  role: Role;
  firstName: string;
  lastName: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/** Vérifie le jeton d'accès JWT et charge l'utilisateur actif. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    let payload;
    try {
      payload = verifyAccessToken(header.slice(7));
    } catch {
      throw unauthorized('Session expirée, veuillez vous reconnecter.');
    }
    const user = await queryOne(
      'SELECT id, role, first_name, last_name, email, is_active FROM users WHERE id = $1',
      [payload.sub],
    );
    if (!user || !user.is_active) throw unauthorized('Compte désactivé ou inexistant.');
    req.user = {
      id: user.id,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
    };
    next();
  } catch (err) {
    next(err);
  }
}

/** Contrôle d'accès par rôle (RBAC) appliqué côté serveur. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}

export const isManager = (u: AuthUser) => u.role === 'admin' || u.role === 'tutor';
