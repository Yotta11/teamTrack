import type { Request } from 'express';
import { type Queryable, pool, query } from '../db/pool.js';

interface LogInput {
  userId: number | null;
  action: string;
  entity: string;
  entityId?: number | null;
  summary?: string;
  details?: Record<string, unknown>;
  audit?: boolean;
  req?: Request;
}

/** F-27 : journal horodaté des actions. `audit: true` marque les opérations sensibles (section 13). */
export async function logActivity(input: LogInput, db: Queryable = pool): Promise<void> {
  await query(
    `INSERT INTO activity_log (user_id, action, entity, entity_id, summary, details, is_audit, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.userId,
      input.action,
      input.entity,
      input.entityId ?? null,
      input.summary ?? null,
      input.details ? JSON.stringify(input.details) : null,
      input.audit ?? false,
      input.req?.ip ?? null,
    ],
    db,
  );
}
