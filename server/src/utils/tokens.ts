import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type Role = 'admin' | 'tutor' | 'employee' | 'intern';

export interface AccessPayload {
  sub: number;
  role: Role;
  name: string;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign({ ...payload, sub: String(payload.sub) }, config.jwtSecret, {
    expiresIn: config.accessTokenTtlSeconds,
    issuer: 'teamtrack',
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, config.jwtSecret, { issuer: 'teamtrack', algorithms: ['HS256'] }) as unknown as AccessPayload;
  return { sub: Number(decoded.sub), role: decoded.role, name: decoded.name };
}
