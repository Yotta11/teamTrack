import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Mail } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client';
import { TrendBars } from '../components/Charts';
import { TaskRow } from '../components/TaskRow';
import { Avatar, EmptyState, ErrorState, InternshipBadge, IssueStatusBadge, PageLoader, Panel, RoleBadge, SeverityBadge, Stat, StatusRail } from '../components/ui';
import { fmtAgo, fmtDate, fullName } from '../lib/format';
import { ISSUE_TYPE_LABEL } from '../lib/labels';
import type { InternshipStatus, IssueStatus, IssueType, Role, Severity, Task } from '../lib/types';

interface PersonData {
  person: { id: number; firstName: string; lastName: string; email: string; role: Role; jobTitle: string | null; avatarUrl: string | null; wipLimit: number; isActive: boolean; skills: string[]; departmentName: string | null };
  stats: { total: number; todo: number; inProgress: number; review: number; done: number; overdue: number; dueSoon: number; completionRate: number; onTimeRate: number; remainingHours: number };
  tasks: Task[];
  issues: { id: number; title: string; type: IssueType; severity: Severity; status: IssueStatus; reportedAt: string }[];
  progressHistory: { week: string; done: number }[];
  internship: { id: number; subject: string; status: InternshipStatus; startDate: string; endDate: string } | null;
}

export default function PersonPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['dashboard', 'person', id], queryFn: async () => (await api.get<PersonData>(`/dashboard/person/${id}`)).data });
  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const { person: p, stats: s } = q.data;
  const open = q.data.tasks.filter((t) => t.status !== 'done');
  const done = q.data.tasks.filter((t) => t.status === 'done');
  return (
    <>
      <div className="mb-6 flex flex-col gap-5 rounded-xl border border-ink-200/80 bg-white p-6 shadow-card sm:flex-row sm:items-center">
        <Avatar user={p} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-extrabold tracking-tight">{fullName(p)}</h1><RoleBadge role={p.role} />{!p.isActive && <span className="text-xs font-semibold text-ink-500">Compte désactivé</span>}</div>
          <p className="mt-1 text-sm text-ink-600">{p.jobTitle ?? '—'}{p.departmentName && ` · ${p.departmentName}`}</p>
          <a href={`mailto:${p.email}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline"><Mail className="h-4 w-4" />{p.email}</a>
          {p.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{p.skills.map((k) => <span key={k} className="rounded-md bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-700">{k}</span>)}</div>}
        </div>
        {q.data.internship && (
          <Link to={`/stages/${q.data.internship.id}`} className="rounded-xl bg-ink-50 px-4 py-3 text-sm hover:bg-brand-50 sm:max-w-xs">
            <span className="flex items-center gap-2 text-xs font-semibold text-ink-500">Stage <InternshipBadge status={q.data.internship.status} /></span>
            <span className="mt-1 block font-semibold leading-snug">{q.data.internship.subject}</span>
            <span className="text-xs text-ink-500">Jusqu’au {fmtDate(q.data.internship.endDate)}</span>
          </Link>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Taux de réalisation" value={`${s.completionRate} %`} tone="brand" context={`${s.done} terminées sur ${s.total}`} />
        <Stat label="En cours" value={s.inProgress} context={`Limite WIP : ${p.wipLimit}`} tone={s.inProgress > p.wipLimit ? 'alert' : 'default'} />
        <Stat label="En retard" value={s.overdue} tone={s.overdue ? 'alert' : 'default'} context={`${s.dueSoon} échéance(s) sous 48 h`} />
        <Stat label="Dans les délais" value={`${s.onTimeRate} %`} context={`${s.remainingHours} h de travail restant estimé`} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Répartition" className="lg:col-span-1">
          <StatusRail segments={[
            { key: 'todo', label: 'À faire', value: s.todo },
            { key: 'progress', label: 'En cours', value: s.inProgress },
            { key: 'review', label: 'En revue', value: s.review },
            { key: 'done', label: 'Terminé', value: s.done },
          ]} />
        </Panel>
        <Panel title="Tâches terminées par semaine" className="lg:col-span-2">
          <TrendBars data={q.data.progressHistory} xKey="week" series={[{ key: 'done', label: 'Terminées' }]} height={170} formatX={(v) => format(parseISO(v), 'd MMM', { locale: fr })} />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel title={`Tâches en cours (${open.length})`} bodyClassName="p-0">
            {open.length ? <div className="divide-y divide-ink-100">{open.map((t) => <TaskRow key={t.id} task={t} showTeam />)}</div> : <EmptyState title="Aucune tâche ouverte" />}
          </Panel>
          {done.length > 0 && (
            <Panel title={`Tâches terminées (${done.length})`} bodyClassName="p-0">
              <div className="divide-y divide-ink-100">{done.slice(0, 15).map((t) => <TaskRow key={t.id} task={t} showTeam />)}</div>
            </Panel>
          )}
        </div>
        <Panel title="Difficultés signalées" bodyClassName="p-0">
          {q.data.issues.length ? (
            <ul className="divide-y divide-ink-100">
              {q.data.issues.map((i) => (
                <li key={i.id}>
                  <Link to={`/difficultes/${i.id}`} className="block px-5 py-3 hover:bg-ink-50">
                    <p className="text-sm font-semibold">{i.title}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5"><SeverityBadge severity={i.severity} /><IssueStatusBadge status={i.status} /><span className="text-xs text-ink-500">{ISSUE_TYPE_LABEL[i.type]} · {fmtAgo(i.reportedAt)}</span></div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Aucune difficulté" />}
        </Panel>
      </div>
    </>
  );
}
