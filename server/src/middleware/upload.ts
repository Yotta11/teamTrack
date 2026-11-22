import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../utils/http.js';

const ALLOWED = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export function uploadDir(sub: string): string {
  const dir = path.resolve(config.uploadDir, sub);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function storage(sub: string) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir(sub)),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  });
}

export const fileUpload = (sub: string) =>
  multer({
    storage: storage(sub),
    limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
    fileFilter: (_req, file, cb) =>
      ALLOWED.has(file.mimetype) ? cb(null, true) : cb(badRequest('Type de fichier non autorisé.')),
  });

export const imageUpload = multer({
  storage: storage('avatars'),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /^image\/(png|jpeg|webp)$/.test(file.mimetype) ? cb(null, true) : cb(badRequest('Image PNG, JPEG ou WebP attendue.')),
});

export const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
});
