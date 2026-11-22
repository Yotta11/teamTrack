import pg from 'pg';
import { config } from '../config.js';

// Les colonnes DATE sont renvoyées telles quelles (AAAA-MM-JJ) pour éviter les décalages de fuseau.
pg.types.setTypeParser(1082, (v) => v);
// NUMERIC -> nombre JavaScript
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
// COUNT(*) (int8) -> nombre
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 20 });

export type Queryable = Pick<pg.PoolClient, 'query'>;

/** Requête paramétrée : toutes les valeurs passent par $1..$n (protection contre l'injection SQL). */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
  db: Queryable = pool,
): Promise<T[]> {
  const res = await db.query<T>(text, params as any[]);
  return res.rows;
}

export async function queryOne<T extends pg.QueryResultRow = any>(
  text: string,
  params: unknown[] = [],
  db: Queryable = pool,
): Promise<T | null> {
  const rows = await query<T>(text, params, db);
  return rows[0] ?? null;
}

export async function transaction<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
