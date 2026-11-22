import type { NextFunction, Request, RequestHandler, Response } from 'express';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, code?: string, details?: unknown) => new HttpError(400, msg, code, details);
export const unauthorized = (msg = 'Authentification requise.') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = "Vous n'avez pas les droits pour cette action.") => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (what = 'Ressource') => new HttpError(404, `${what} introuvable.`, 'NOT_FOUND');
export const conflict = (msg: string, code?: string, details?: unknown) => new HttpError(409, msg, code, details);

/** Enveloppe un handler async pour transmettre les erreurs au middleware d'erreurs. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function parseId(value: unknown, what = 'Identifiant'): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw badRequest(`${what} invalide.`);
  return id;
}
