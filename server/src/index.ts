import { config } from './config.js';
import { migrate } from './db/migrate.js';
import { pool } from './db/pool.js';
import { createApp } from './app.js';
import { startScheduler } from './services/scheduler.js';

async function main() {
  await migrate();
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`TeamTrack API à l'écoute sur http://localhost:${config.port} (${config.env})`);
  });
  const timer = config.schedulerEnabled ? startScheduler() : null;

  const shutdown = () => {
    console.log('Arrêt en cours…');
    if (timer) clearInterval(timer);
    server.close(() => pool.end().then(() => process.exit(0)));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((err) => {
  console.error('Échec du démarrage :', err);
  process.exit(1);
});
