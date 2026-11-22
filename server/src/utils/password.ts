import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

const ROUNDS = 12;

export const PASSWORD_RULES =
  'Au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial.';

/** Politique de complexité (section 13). */
export function isStrongPassword(pwd: string): boolean {
  return (
    pwd.length >= 8 &&
    pwd.length <= 128 &&
    /[A-Z]/.test(pwd) &&
    /[a-z]/.test(pwd) &&
    /\d/.test(pwd) &&
    /[^A-Za-z0-9]/.test(pwd)
  );
}

export const hashPassword = (pwd: string) => bcrypt.hash(pwd, ROUNDS);
export const verifyPassword = (pwd: string, hash: string) => bcrypt.compare(pwd, hash);

/** Mot de passe provisoire conforme à la politique (création de compte, import CSV). */
export function generateTempPassword(): string {
  const base = crypto.randomBytes(9).toString('base64').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  return `${base}Aa1!`;
}

export const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('hex');
