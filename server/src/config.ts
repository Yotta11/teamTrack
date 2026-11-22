import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
}

const env = process.env.NODE_ENV ?? 'development';

export const config = {
  env,
  isProd: env === 'production',
  isTest: env === 'test',
  port: Number(process.env.PORT ?? 4000),
  // En test, une base dédiée est utilisée (elle est réinitialisée par la suite de tests).
  databaseUrl:
    env === 'test'
      ? required('TEST_DATABASE_URL', 'postgres://teamtrack:teamtrack@localhost:5432/teamtrack_test')
      : required('DATABASE_URL', env === 'production' ? undefined : 'postgres://teamtrack:teamtrack@localhost:5432/teamtrack'),
  jwtSecret: required('JWT_SECRET', env === 'production' ? undefined : 'dev-only-secret-change-me'),
  accessTokenTtlSeconds: 15 * 60,
  refreshTokenDays: 7,
  resetTokenMinutes: 30,
  maxLoginAttempts: 5,
  lockMinutes: 15,
  corsOrigin: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(','),
  appUrl: process.env.APP_URL ?? 'http://localhost:5173',
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 10),
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM ?? 'TeamTrack <no-reply@teamtrack.local>',
  },
  apiRateLimit: Number(process.env.API_RATE_LIMIT ?? 1500), // requêtes / 15 min / IP
  schedulerEnabled: process.env.SCHEDULER_ENABLED !== 'false' && env !== 'test',
};
