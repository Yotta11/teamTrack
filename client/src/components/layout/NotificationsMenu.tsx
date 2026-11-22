import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertOctagon, Bell, CalendarClock, CheckCheck, ClipboardCheck, MessageSquare, Star, UserPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useNotifications } from '../../hooks/queries';
import { fmtAgo } from '../../lib/format';
import { Button } from '../ui';

const ICONS: Record<string, typeof Bell> = {
  task_assigned: UserPlus,
  task_due: CalendarClock,
  task_overdue: CalendarClock,
  task_comment: MessageSquare,
  issue_critical: AlertOctagon,
  issue_escalated: AlertOctagon,
  evaluation_new: Star,
  task_status: ClipboardCheck,
};

export function NotificationsMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useNotifications();
  const qc = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const readAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  const readOne = useMutation({
    mutationFn: (id: number) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((o) => !o)} aria-label={`Notifications, ${unread} non lues`} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(92vw,380px)] animate-pop-in overflow-hidden rounded-xl border border-ink-200 bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <p className="text-sm font-bold">Notifications</p>
            {unread > 0 && (
              <button onClick={() => readAll.mutate()} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
                <CheckCheck className="h-3.5 w-3.5" /> Tout marquer comme lu
              </button>
            )}
          </div>
          <ul className="max-h-[60vh] divide-y divide-ink-100 overflow-y-auto">
            {(data?.items ?? []).slice(0, 12).map((n) => {
              const Icon = ICONS[n.type] ?? Bell;
              const alert = n.type === 'issue_critical' || n.type === 'issue_escalated' || n.type === 'task_overdue';
              return (
                <li key={n.id}>
                  <button
                    className={clsx('flex w-full gap-3 px-4 py-3 text-left hover:bg-ink-50', !n.isRead && 'bg-brand-50/50')}
                    onClick={() => {
                      if (!n.isRead) readOne.mutate(n.id);
                      setOpen(false);
                      if (n.link) navigate(n.link);
                    }}
                  >
                    <span className={clsx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', alert ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600')}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={clsx('block text-[13px] leading-snug', n.isRead ? 'text-ink-600' : 'font-semibold text-ink-900')}>{n.message}</span>
                      <span className="mt-0.5 block text-2xs text-ink-400">{fmtAgo(n.createdAt)}</span>
                    </span>
                    {!n.isRead && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Non lue" />}
                  </button>
                </li>
              );
            })}
            {!data?.items.length && <li className="px-4 py-10 text-center text-sm text-ink-500">Vous êtes à jour.</li>}
          </ul>
          <Link to="/notifications" onClick={() => setOpen(false)} className="block border-t border-ink-100 px-4 py-2.5 text-center text-[13px] font-semibold text-brand-700 hover:bg-ink-50">
            Voir toutes les notifications
          </Link>
        </div>
      )}
    </div>
  );
}
