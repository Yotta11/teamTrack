import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AlertTriangle, CalendarClock, CheckCircle2, Download, GraduationCap, ListTodo } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, download } from '../api/client';
import { HBars, TrendBars } from '../components/Charts';
import { useQuickActions } from '../components/layout/AppLayout';
import { TaskRow } from '../components/TaskRow';
import {
  Avatar,
  Button,
  EmptyState,
  ErrorState,
  IssueStatusBadge,
  PageHeader,
  PageLoader,
  Panel,
  ProgressBar,
  SeverityBadge,
  Stat,
  StatusRail,
  Tabs,
} from '../components/ui';
import { useAuth } from '../lib/auth';
import { fmtAgo, fmtDate, fmtShort, pct } from '../lib/format';
import { INTERNSHIP_STATUS_LABEL, ROLE_LABEL, SEVERITY_LABEL } from '../lib/labels';
import type { ActivityItem, InternshipStatus, IssueStatus, KeyCount, Role, Severity, Task } from '../lib/types';

interface MeDashboard {
  role: Role;
  scope: 'personal' | 'perimeter';
  stats: {
    total: number; todo: number; inProgress: number; review: number; done: number; overdue: number; dueSoon: number;
    doneWeek: number; completionRate: number; onTimeRate: number; remainingHours: number;
  };
  focus: Task[];
  myIssues: { id: number; title: string; severity: Severity; status: IssueStatus; reportedAt: string }[];
  activity: ActivityItem[];
  trend: { day: string; done: number; created: number }[];
  issuesToHandle?: { id: number; title: string; severity: Severity; status: IssueStatus; reportedAt: string; reporterName: string; isStale: boolean }[];
  teams?: { id: number; name: string; total: number; done: number; overdue: number; avgProgress: number }[];
  interns?: { internshipId: number; id: number; firstName: string; lastName: string; avatarUrl: string | null; endDate: string; status: InternshipStatus; avgProgress: number; overdue: number; openIssues: number }[];
  internship?: { id: number; subject: string; startDate: string; endDate: string; status: InternshipStatus; school: string; tutorName: string; tutorEmail: string; daysLeft: number; duration: number } | null;
}

function greeting() {
  const h = new Date().getHours();
  return h < 18 ? 'Bonjour' : 'Bonsoir';
}

export function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (!items.length) return <EmptyState title="Aucune activité récente" />;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-ink-100">
      {items.map((a) => (
        <li key={a.id} className="relative flex gap-3">
          <Avatar user={a.userName ? { firstName: a.userName.split(' ')[0], lastName: a.userName.split(' ').slice(1).join(' '), avatarUrl: a.avatarUrl } : null} size="sm" />
          <div className="min-w-0 pt-0.5">
            <p className="text-[13px] leading-snug text-ink-700">
              <strong className="font-semibold text-ink-900">{a.userName ?? 'TeamTrack'}</strong> {a.summary}
            </p>
            {a.entityTitle && !a.summary?.includes(a.entityTitle) && a.entityId && (
              <Link to={a.entity === 'issue' ? `/difficultes/${a.entityId}` : `/taches/${a.entityId}`} className="mt-0.5 block truncate text-[13px] font-semibold text-brand-700 hover:underline">
                {a.entityTitle}
              </Link>
            )}
            <p className="mt-0.5 text-2xs text-ink-400">{fmtAgo(a.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function PersonalDashboard({ data }: { data: MeDashboard }) {
  const { openIssue } = useQuickActions();
  const s = data.stats;
  const isManager = data.role === 'admin' || data.role === 'tutor';
  const perimeter = data.scope === 'perimeter';
  const open = s.todo + s.inProgress + s.review;

  return (
    <div className="space-y-6">
      {data.internship && (
        <div className="flex flex-col gap-4 rounded-xl bg-brand-950 p-5 text-white sm:flex-row sm:items-center">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10"><GraduationCap className="h-5 w-5 text-brand-200" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-brand-300">Mon stage · {INTERNSHIP_STATUS_LABEL[data.internship.status]}</p>
            <p className="mt-0.5 truncate text-lg font-bold">{data.internship.subject}</p>
            <p className="text-[13px] text-brand-200/90">Tuteur : {data.internship.tutorName} · jusqu’au {fmtDate(data.internship.endDate)}</p>
          </div>
          <div className="w-full sm:w-56">
            <div className="mb-1.5 flex justify-between text-xs text-brand-200">
              <span>Période écoulée</span>
              <span className="font-bold text-white">{Math.max(0, data.internship.daysLeft)} j restants</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-brand-400" style={{ width: `${Math.min(100, Math.max(0, pct(data.internship.duration - data.internship.daysLeft, data.internship.duration)))}%` }} />
            </div>
          </div>
          <Link to={`/stages/${data.internship.id}`} className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">Ma fiche</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label={perimeter ? (data.role === 'admin' ? 'Tâches ouvertes, toutes équipes' : 'Tâches ouvertes, mes équipes') : 'Mes tâches ouvertes'} value={open} icon={<ListTodo className="h-4 w-4" />} context={`${s.inProgress} en cours, ${s.review} en revue`} />
        <Stat label="En retard" value={s.overdue} tone={s.overdue ? 'alert' : 'default'} icon={<AlertTriangle className="h-4 w-4" />} context={s.overdue ? 'Échéance dépassée' : 'Aucun retard'} />
        <Stat label="Échéance sous 48 h" value={s.dueSoon} icon={<CalendarClock className="h-4 w-4" />} context="À surveiller" />
        <Stat label="Taux de réalisation" value={`${s.completionRate} %`} tone="brand" icon={<CheckCircle2 className="h-4 w-4" />} context={`${s.doneWeek} terminée${s.doneWeek > 1 ? 's' : ''} cette semaine`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel
            title="À traiter en priorité"
            description={perimeter ? 'Retards et échéances des 48 prochaines heures dans votre périmètre' : 'Retards, échéances proches et tâches en cours'}
            actions={<Link to="/kanban" className="text-[13px] font-semibold text-brand-700 hover:underline">Ouvrir le Kanban</Link>}
            bodyClassName="p-0"
          >
            {data.focus.length ? (
              <div className="divide-y divide-ink-100">{data.focus.map((t) => <TaskRow key={t.id} task={t} showTeam />)}</div>
            ) : (
              <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="Rien d’urgent">Aucune tâche en retard ni d’échéance dans les 48 prochaines heures.</EmptyState>
            )}
          </Panel>

          {isManager && data.teams && data.teams.length > 0 && (
            <Panel title="Avancement des équipes" bodyClassName="divide-y divide-ink-100 p-0">
              {data.teams.map((t) => (
                <Link key={t.id} to={`/equipes/${t.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-2 px-5 py-3.5 hover:bg-ink-50 sm:grid-cols-[180px_1fr_auto]">
                  <span className="truncate text-sm font-semibold">{t.name}</span>
                  <ProgressBar value={pct(t.done, t.total)} showValue className="col-span-2 sm:col-span-1" />
                  <span className="row-start-1 text-right text-xs text-ink-500 sm:row-auto">
                    {t.done}/{t.total} terminées
                    {t.overdue > 0 && <span className="ml-2 font-semibold text-red-700">{t.overdue} en retard</span>}
                  </span>
                </Link>
              ))}
            </Panel>
          )}

          {data.interns && (
            <Panel title="Mes stagiaires" description="Avancement moyen des tâches, retards et difficultés ouvertes" bodyClassName="p-0">
              {data.interns.length ? (
                <div className="divide-y divide-ink-100">
                  {data.interns.map((i) => (
                    <Link key={i.internshipId} to={`/stages/${i.internshipId}`} className="flex items-center gap-4 px-5 py-3 hover:bg-ink-50">
                      <Avatar user={i} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{i.firstName} {i.lastName}</p>
                        <p className="text-xs text-ink-500">Fin le {fmtShort(i.endDate)}</p>
                      </div>
                      <ProgressBar value={i.avgProgress} size="sm" showValue className="hidden w-36 sm:flex" />
                      <div className="flex w-36 justify-end gap-3 text-xs">
                        <span className={i.overdue ? 'font-semibold text-red-700' : 'text-ink-500'}>{i.overdue} retard{i.overdue > 1 ? 's' : ''}</span>
                        <span className={i.openIssues ? 'font-semibold text-amber-700' : 'text-ink-500'}>{i.openIssues} difficulté{i.openIssues > 1 ? 's' : ''}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState title="Aucun stagiaire en cours">Les stages que vous encadrez apparaîtront ici.</EmptyState>
              )}
            </Panel>
          )}
          <Panel title="Rythme des 14 derniers jours" description={perimeter ? 'Tâches créées et terminées par jour dans votre périmètre' : 'Vos tâches créées et terminées par jour'}>
            <TrendBars
              data={data.trend}
              xKey="day"
              series={[{ key: 'done', label: 'Terminées' }, { key: 'created', label: 'Créées' }]}
              formatX={(v) => format(new Date(v), 'd MMM', { locale: fr })}
            />
          </Panel>
        </div>

        <div className="space-y-6">
          {data.issuesToHandle && (
            <Panel title="Difficultés à traiter" actions={<Link to="/difficultes?status=unresolved" className="text-[13px] font-semibold text-brand-700 hover:underline">Tout voir</Link>} bodyClassName="p-0">
              {data.issuesToHandle.length ? (
                <ul className="divide-y divide-ink-100">
                  {data.issuesToHandle.map((i) => (
                    <li key={i.id}>
                      <Link to={`/difficultes/${i.id}`} className="block px-5 py-3 hover:bg-ink-50">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold leading-snug">{i.title}</p>
                          <SeverityBadge severity={i.severity} />
                        </div>
                        <p className="mt-1 text-xs text-ink-500">
                          {i.reporterName} · {fmtAgo(i.reportedAt)}
                          {i.isStale && <span className="ml-1 font-semibold text-red-700">· sans réponse depuis 3 j</span>}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Aucune difficulté en attente" />
              )}
            </Panel>
          )}

          <Panel
            title="Mes difficultés"
            actions={<Button size="sm" variant="subtle" onClick={() => openIssue()}>Signaler</Button>}
            bodyClassName="p-0"
          >
            {data.myIssues.length ? (
              <ul className="divide-y divide-ink-100">
                {data.myIssues.map((i) => (
                  <li key={i.id}>
                    <Link to={`/difficultes/${i.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-ink-50">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{i.title}</span>
                        <span className="text-xs text-ink-500">{fmtAgo(i.reportedAt)}</span>
                      </span>
                      <IssueStatusBadge status={i.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-ink-500">Aucune difficulté ouverte. Un blocage ? Signalez-le pour obtenir de l’aide rapidement.</p>
            )}
          </Panel>

          <Panel title="Activité récente">
            <ActivityFeed items={data.activity} />
          </Panel>
        </div>
      </div>
    </div>
  );
}

interface GlobalDashboard {
  people: KeyCount[];
  tasks: { total: number; done: number; inProgress: number; backlog: number; overdue: number; avgProgress: number; completionRate: number };
  issues: KeyCount[];
  internships: KeyCount[];
  teams: { id: number; name: string; members: number; total: number; done: number; overdue: number; openIssues: number; completionRate: number }[];
  weekly: { week: string; done: number; issues: number }[];
  ending: { id: number; endDate: string; subject: string; internName: string; tutorName: string }[];
  escalated: { id: number; title: string; severity: Severity; reportedAt: string; reporterName: string }[];
}

function GlobalView() {
  const q = useQuery({ queryKey: ['dashboard', 'global'], queryFn: async () => (await api.get<GlobalDashboard>('/dashboard/global')).data });
  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const g = q.data;
  const count = (list: KeyCount[], key: string) => list.find((x) => x.key === key)?.count ?? 0;
  const openIssues = g.issues.reduce((s, x) => s + x.count, 0);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => download('/reports/export?type=global&format=pdf')}>Exporter en PDF</Button>
        <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => download('/reports/export?type=global&format=xlsx')}>Exporter en Excel</Button>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Personnes actives" value={g.people.reduce((s, x) => s + x.count, 0)} context={`${count(g.people, 'intern')} stagiaires, ${count(g.people, 'employee')} employés`} />
        <Stat label="Stages en cours" value={count(g.internships, 'active')} context={`${count(g.internships, 'upcoming')} à venir`} />
        <Stat label="Taux de réalisation" value={`${g.tasks.completionRate} %`} tone="brand" context={`${g.tasks.done} tâches terminées sur ${g.tasks.total}`} />
        <Stat label="Difficultés ouvertes" value={openIssues} tone={count(g.issues, 'critical') ? 'alert' : 'default'} context={`dont ${count(g.issues, 'critical')} critique(s)`} />
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Équipes" className="xl:col-span-2" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50 text-left text-xs text-ink-500">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Équipe</th>
                  <th className="px-3 py-2.5 font-semibold">Membres</th>
                  <th className="w-1/3 px-3 py-2.5 font-semibold">Réalisation</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Retards</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Difficultés</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {g.teams.map((t) => (
                  <tr key={t.id} className="hover:bg-ink-50">
                    <td className="px-5 py-3 font-semibold"><Link to={`/equipes/${t.id}`} className="hover:text-brand-700">{t.name}</Link></td>
                    <td className="px-3 py-3 tabular-nums text-ink-600">{t.members}</td>
                    <td className="px-3 py-3"><ProgressBar value={t.completionRate} showValue size="sm" /></td>
                    <td className={`px-3 py-3 text-right tabular-nums ${t.overdue ? 'font-bold text-red-700' : 'text-ink-500'}`}>{t.overdue}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-ink-600">{t.openIssues}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Répartition des tâches">
          <StatusRail
            segments={[
              { key: 'backlog', label: 'Backlog', value: g.tasks.backlog },
              { key: 'todo', label: 'À faire / revue', value: g.tasks.total - g.tasks.done - g.tasks.inProgress },
              { key: 'progress', label: 'En cours', value: g.tasks.inProgress },
              { key: 'done', label: 'Terminées', value: g.tasks.done },
            ]}
          />
          <div className="mt-6 border-t border-ink-100 pt-5">
            <p className="mb-3 text-[13px] font-semibold text-ink-700">Personnel par rôle</p>
            <HBars items={g.people.map((p) => ({ label: ROLE_LABEL[p.key as Role], value: p.count }))} />
          </div>
        </Panel>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Activité hebdomadaire" description="Tâches terminées et difficultés signalées par semaine" className="xl:col-span-2">
          <TrendBars data={g.weekly} xKey="week" series={[{ key: 'done', label: 'Tâches terminées' }, { key: 'issues', label: 'Difficultés' }]} formatX={(v) => format(new Date(v), 'd MMM', { locale: fr })} />
        </Panel>
        <div className="space-y-6">
          <Panel title="Difficultés escaladées" bodyClassName="p-0">
            {g.escalated.length ? (
              <ul className="divide-y divide-ink-100">
                {g.escalated.map((i) => (
                  <li key={i.id}>
                    <Link to={`/difficultes/${i.id}`} className="block px-5 py-3 hover:bg-ink-50">
                      <p className="text-sm font-semibold">{i.title}</p>
                      <p className="text-xs text-ink-500">{i.reporterName} · {SEVERITY_LABEL[i.severity]} · {fmtAgo(i.reportedAt)}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-6 text-sm text-ink-500">Aucune difficulté escaladée.</p>}
          </Panel>
          <Panel title="Stages se terminant sous 3 semaines" bodyClassName="p-0">
            {g.ending.length ? (
              <ul className="divide-y divide-ink-100">
                {g.ending.map((s) => (
                  <li key={s.id}>
                    <Link to={`/stages/${s.id}`} className="block px-5 py-3 hover:bg-ink-50">
                      <p className="text-sm font-semibold">{s.internName}</p>
                      <p className="text-xs text-ink-500">Fin le {fmtDate(s.endDate)} · tuteur {s.tutorName}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 py-6 text-sm text-ink-500">Aucun stage ne se termine prochainement.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<'me' | 'global'>('me');
  const q = useQuery({ queryKey: ['dashboard', 'me'], queryFn: async () => (await api.get<MeDashboard>('/dashboard/me')).data });

  const s = q.data?.stats;
  const summary = s
    ? s.overdue
      ? `${s.overdue} tâche${s.overdue > 1 ? 's sont' : ' est'} en retard${q.data?.scope === 'perimeter' ? ' dans votre périmètre' : ''}.`
      : s.dueSoon
        ? `${s.dueSoon} échéance${s.dueSoon > 1 ? 's' : ''} dans les 48 prochaines heures.`
        : 'Aucun retard en cours.'
    : undefined;

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${user?.firstName}`}
        description={<span className="capitalize-first">{format(new Date(), "EEEE d MMMM yyyy", { locale: fr })}{summary ? ` · ${summary}` : ''}</span>}
      />
      {user?.role === 'admin' && (
        <Tabs value={tab} onChange={setTab} tabs={[{ value: 'me', label: 'Mon espace' }, { value: 'global', label: 'Vue globale' }]} />
      )}
      {tab === 'global' && user?.role === 'admin' ? (
        <GlobalView />
      ) : q.isLoading ? (
        <PageLoader />
      ) : q.error || !q.data ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <PersonalDashboard data={q.data} />
      )}
    </>
  );
}
