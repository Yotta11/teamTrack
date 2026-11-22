import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { ZodError } from 'zod';
import { HttpError } from '../utils/http.js';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { message: 'Route introuvable.', code: 'NOT_FOUND' } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const fields: Record<string, string> = {};
    for (const issue of err.issues) fields[issue.path.join('.') || '_'] = issue.message;
    return res.status(400).json({
      error: { message: 'Certaines informations sont invalides.', code: 'VALIDATION', fields },
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code, details: err.details } });
  }
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: { message: `Fichier refusé : ${err.message}`, code: 'UPLOAD' } });
  }
  const pgErr = err as { code?: string; detail?: string };
  if (pgErr?.code === '23505') {
    return res.status(409).json({ error: { message: 'Cette valeur existe déjà.', code: 'DUPLICATE' } });
  }
  if (pgErr?.code === '23514' || pgErr?.code === '22P02') {
    return res.status(400).json({ error: { message: 'Donnée invalide.', code: 'INVALID' } });
  }
  console.error(err);
  res.status(500).json({ error: { message: 'Erreur interne du serveur.', code: 'INTERNAL' } });
}
