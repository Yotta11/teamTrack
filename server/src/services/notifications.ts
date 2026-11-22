import { type Queryable, pool, query } from '../db/pool.js';
import { config } from '../config.js';
import { sendMail } from '../utils/mailer.js';

export type NotificationType =
  | 'task_assigned'
  | 'task_status'
  | 'task_due'
  | 'task_overdue'
  | 'task_comment'
  | 'issue_reported'
  | 'issue_critical'
  | 'issue_updated'
  | 'issue_resolved'
  | 'issue_escalated'
  | 'evaluation_new'
  | 'internship'
  | 'wip_exceeded'
  | 'sprint';

interface NotifyInput {
  recipients: number[];
  type: NotificationType;
  message: string;
  link?: string;
  dedupeKey?: string;
  email?: boolean;
  excludeUserId?: number;
}

/**
 * F-36 : notification interne + e-mail. Les doublons sont évités via `dedupeKey`
 * (ex. une seule alerte « échéance proche » par tâche et par personne).
 */
export async function notify(input: NotifyInput, db: Queryable = pool): Promise<number> {
  const recipients = [...new Set(input.recipients)].filter((id) => id && id !== input.excludeUserId);
  if (recipients.length === 0) return 0;
  const rows = await query<{ recipient_id: number }>(
    `INSERT INTO notifications (recipient_id, type, message, link, dedupe_key)
     SELECT r, $2, $3, $4, $5 FROM unnest($1::int[]) AS r
     ON CONFLICT (recipient_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING recipient_id`,
    [recipients, input.type, input.message, input.link ?? null, input.dedupeKey ?? null],
    db,
  );
  if (input.email !== false && rows.length > 0) {
    const users = await query<{ email: string }>(
      'SELECT email FROM users WHERE id = ANY($1::int[]) AND is_active',
      [rows.map((r) => r.recipient_id)],
      db,
    );
    const link = input.link ? `\n\nOuvrir dans TeamTrack : ${config.appUrl}${input.link}` : '';
    for (const u of users) void sendMail(u.email, `TeamTrack · ${input.message.slice(0, 70)}`, `${input.message}${link}`);
  }
  return rows.length;
}

export async function adminIds(db: Queryable = pool): Promise<number[]> {
  const rows = await query<{ id: number }>("SELECT id FROM users WHERE role = 'admin' AND is_active", [], db);
  return rows.map((r) => r.id);
}
