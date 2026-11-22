import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { Button, EmptyState, PageHeader, PageLoader } from '../components/ui';
import { useNotifications } from '../hooks/queries';
import { fmtDateTime } from '../lib/format';

export default function NotificationsPage() {
  const q = useNotifications();
  const qc = useQueryClient();
  const readAll = useMutation({ mutationFn: () => api.post('/notifications/read-all'), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  const readOne = useMutation({ mutationFn: (id: number) => api.patch(`/notifications/${id}/read`), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Nouvelles tâches, changements de statut, échéances proches, difficultés et évaluations. Les plus importantes vous sont aussi envoyées par e-mail."
        actions={(q.data?.unread ?? 0) > 0 && <Button variant="secondary" onClick={() => readAll.mutate()}>Tout marquer comme lu</Button>}
      />
      {q.isLoading ? <PageLoader /> : !q.data?.items.length ? (
        <div className="rounded-xl border border-ink-200 bg-white"><EmptyState icon={<Bell className="h-5 w-5" />} title="Aucune notification" /></div>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-200/80 bg-white shadow-card">
          {q.data.items.map((n) => (
            <li key={n.id} className={clsx('flex items-start gap-4 px-5 py-4', !n.isRead && 'bg-brand-50/40')}>
              <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.isRead ? 'bg-ink-200' : 'bg-brand-600')} />
              <div className="min-w-0 flex-1">
                {n.link ? (
                  <Link to={n.link} onClick={() => !n.isRead && readOne.mutate(n.id)} className={clsx('text-sm hover:text-brand-700', n.isRead ? 'text-ink-600' : 'font-semibold text-ink-900')}>{n.message}</Link>
                ) : <p className="text-sm">{n.message}</p>}
                <p className="mt-0.5 text-xs text-ink-400">{fmtDateTime(n.createdAt)}</p>
              </div>
              {!n.isRead && <button onClick={() => readOne.mutate(n.id)} className="shrink-0 text-xs font-semibold text-brand-700 hover:underline">Marquer comme lue</button>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
