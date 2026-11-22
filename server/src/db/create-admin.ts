/**
 * Crée le premier compte administrateur (installation sans données de démonstration).
 * Usage : ADMIN_EMAIL=rh@entreprise.com ADMIN_PASSWORD='MotDePasse@2026' ADMIN_FIRST_NAME=Prénom ADMIN_LAST_NAME=Nom npm run create-admin
 */
import { hashPassword, isStrongPassword, PASSWORD_RULES } from '../utils/password.js';
import { migrate } from './migrate.js';
import { pool, queryOne } from './pool.js';

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  if (!email) throw new Error('Indiquez ADMIN_EMAIL.');
  if (!isStrongPassword(password)) throw new Error(`ADMIN_PASSWORD invalide : ${PASSWORD_RULES}`);
  await migrate(false);
  const row = await queryOne(
    `INSERT INTO users (first_name, last_name, email, password_hash, role, job_title)
     VALUES ($1, $2, $3, $4, 'admin', 'Administrateur') ON CONFLICT (email) DO NOTHING RETURNING id`,
    [process.env.ADMIN_FIRST_NAME ?? 'Admin', process.env.ADMIN_LAST_NAME ?? 'TeamTrack', email, await hashPassword(password)],
  );
  console.log(row ? `✔ Administrateur créé : ${email}` : `Un compte existe déjà pour ${email}.`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
