import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const toDate = (v: string | Date) => (typeof v === 'string' ? parseISO(v) : v);

export const fmtDate = (v?: string | null, pattern = 'd MMM yyyy') => (v ? format(toDate(v), pattern, { locale: fr }) : '—');
export const fmtShort = (v?: string | null) => fmtDate(v, 'd MMM');
export const fmtDateTime = (v?: string | null) => fmtDate(v, "d MMM yyyy 'à' HH:mm");
export const fmtAgo = (v?: string | null) => (v ? `il y a ${formatDistanceToNowStrict(toDate(v), { locale: fr })}` : '—');

/** Libellé relatif d'une échéance : « aujourd'hui », « demain », « dans 3 j », « 2 j de retard ». */
export function dueLabel(due?: string | null): string {
  if (!due) return 'Sans échéance';
  const diff = differenceInCalendarDays(parseISO(due), new Date());
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Demain';
  if (diff === -1) return 'Hier';
  if (diff < 0) return `${-diff} j de retard`;
  if (diff < 7) return `Dans ${diff} j`;
  return fmtShort(due);
}

export const fullName = (u?: { firstName: string; lastName: string } | null) => (u ? `${u.firstName} ${u.lastName}` : '—');
export const initials = (u?: { firstName: string; lastName: string } | null) =>
  u ? `${u.firstName[0] ?? ''}${u.lastName[0] ?? ''}`.toUpperCase() : '?';

export const pct = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);

export const fileSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} o` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} Ko` : `${(bytes / 1024 / 1024).toFixed(1)} Mo`;

export const todayISO = () => format(new Date(), 'yyyy-MM-dd');
export const plusDaysISO = (n: number) => format(new Date(Date.now() + n * 86400000), 'yyyy-MM-dd');
