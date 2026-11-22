import path from 'node:path';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import dashboardRoutes from './routes/dashboard.js';
import evaluationRoutes from './routes/evaluations.js';
import internshipRoutes from './routes/internships.js';
import issueRoutes from './routes/issues.js';
import { activityRouter, notificationsRouter } from './routes/notifications.js';
import reportRoutes from './routes/reports.js';
import sprintRoutes from './routes/sprints.js';
import taskRoutes from './routes/tasks.js';
import { departmentsRouter, teamsRouter } from './routes/teams.js';
import userRoutes from './routes/users.js';
import { camelize } from './utils/case.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(cors({ origin: config.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!config.isTest) app.use(morgan(config.isProd ? 'combined' : 'dev'));

  // Réponses JSON en camelCase
  app.use((_req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body?: unknown) => json(camelize(body));
    next();
  });

  // Contrôle de santé (supervision, section 12)
  app.get(['/health', '/api/health'], async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'ok', uptime: Math.round(process.uptime()), version: process.env.APP_VERSION ?? '1.0.0' });
    } catch {
      res.status(503).json({ status: 'degraded', database: 'down' });
    }
  });

  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: config.isTest ? 100000 : config.apiRateLimit,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: { message: 'Trop de requêtes, patientez un instant.', code: 'RATE_LIMIT' } },
    }),
  );

  // Les avatars sont publics ; les autres fichiers passent par des routes authentifiées.
  app.use('/uploads/avatars', express.static(path.resolve(config.uploadDir, 'avatars'), { maxAge: '7d' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/departments', departmentsRouter);
  app.use('/api/teams', teamsRouter);
  app.use('/api/internships', internshipRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/sprints', sprintRoutes);
  app.use('/api/issues', issueRoutes);
  app.use('/api/evaluations', evaluationRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/activity', activityRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);
  return app;
}
