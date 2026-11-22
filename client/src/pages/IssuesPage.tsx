import { useQuery } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { AlertCircle, Download, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, download, errorMessage } from '../api/client';
import { HBars, TrendBars } from '../components/Charts';
import { useQuickActions } from '../components/layout/AppLayout';
import { Avatar, Button, EmptyState, ErrorState, Input, IssueStatusBadge, PageHeader, PageLoader, Panel, Select, SeverityBadge, Stat, Tabs } from '../components/ui';
import { useAuth } from '../lib/auth';
import { fmtAgo, fullName } from '../lib/format';
import { ISSUE_STATUS_LABEL, ISSUE_TYPE_LABEL, ROLE_LABEL, SEVERITY_LABEL } from '../lib/labels';
import type { Issue, IssueStatus, IssueType, KeyCount, Role, Severity } from '../lib/types';

interface Stats {
  byType: KeyCount[];
  bySeverity: KeyCount[];
  byStatus: KeyCount[];
  byPerson: { id: number; name: string; role: Role; count: number; skillCount: number; openCount: number; mainType: IssueType }[];
  byTeam: { id: number; name: string; count: number; openCount: number }[];
  monthly: { month: string; count: number }[];
  resolution: { avgDays: number | null; resolved: number; total: number };
}

function StatsView() {
  const q = useQuery({ queryKey: ['issues', 'stats'], queryFn: async () => (await api.get<Stats>('/issues/stats')).data });
  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const sev = (k: Severity) => s.bySeverity.find((x) => x.key === k)?.count ?? 0;
  const skillNeeds = s.byPerson.filter((p) => p.skillCount > 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Difficultés signalées" value={s.resolution.total} />
        <Stat label="Résolues" value={s.resolution.resolved} tone="brand" context={`${s.resolution.total ? Math.round((s.resolution.resolved / s.resolution.total) * 100) : 0} % du total`} />
        <Stat label="Délai moyen de résolution" value={s.resolution.avgDays !== null ? `${s.resolution.avgDays} j` : '—'} />
        <Stat label="Critiques" value={sev('critical')} tone={sev('critical') ? 'alert' : 'default'} context={`${sev('medium')} moyennes, ${sev('low')} faibles`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Par type" description="Les difficultés de compétence révèlent des besoins de formation">
          <HBars items={s.byType.map((t) => ({ label: ISSUE_TYPE_LABEL[t.key as IssueType], value: t.count }))} />
        </Panel>
        <Panel title="Évolution sur 6 mois">
          <TrendBars data={s.monthly} xKey="month" series={[{ key: 'count', label: 'Difficultés' }]} height={200} formatX={(v) => format(parseISO(`${v}-01`), 'MMM yy', { locale: fr })} />
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Par personne" bodyClassName="p-0">
          <table className="w-full text-sm">
            <thead className="bg-ink-50 text-left text-xs text-ink-500">
              <tr><th className="px-5 py-2.5 font-semibold">Personne</th><th className="px-3 py-2.5 font-semibold">Type dominant</th><th className="px-3 py-2.5 text-right font-semibold">Total</th><th className="px-5 py-2.5 text-right font-semibold">Ouvertes</th></tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {s.byPerson.map((p) => (
                <tr key={p.id}>
                  <td className="px-5 py-2.5"><Link to={`/personnes/${p.id}`} className="font-semibold hover:text-brand-700">{p.name}</Link><span className="ml-2 text-xs text-ink-500">{ROLE_LABEL[p.role]}</span></td>
                  <td className="px-3 py-2.5 text-ink-600">{ISSUE_TYPE_LABEL[p.mainType]}</td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums">{p.count}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-ink-600">{p.openCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <div className="space-y-6">
          <Panel title="Par équipe"><HBars items={s.byTeam.map((t) => ({ label: t.name, value: t.count, sub: `dont ${t.openCount} ouverte(s)` }))} /></Panel>
          <Panel title="Besoins de formation identifiés">
            {skillNeeds.length ? (
              <ul className="space-y-2 text-sm">
                {skillNeeds.map((p) => <li key={p.id} className="flex justify-between"><span className="font-semibold">{p.name}</span><span className="text-ink-500">{p.skillCount} difficulté(s) de compétence</span></li>)}
              </ul>
            ) : <p className="text-sm text-ink-500">Aucune difficulté de compétence signalée.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function IssuesPage() {
  const { isManager } = useAuth();
  const { openIssue } = useQuickActions();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'list' | 'stats'>('list');
  const [search, setSearch] = useState('');
  const get = (k: string) => params.get(k) ?? '';
  const set = (k: string, v: string) => { if (v) params.set(k, v); else params.delete(k); setParams(params, { replace: true }); };
  const filters = { status: get('status') || undefined, severity: get('severity') || undefined, type: get('type') || undefined, search: search || undefined };
  const q = useQuery({ queryKey: ['issues', filters], queryFn: async () => (await api.get<Issue[]>('/issues', { params: filters })).data });

  return (
    <>
      <PageHeader
        title="Difficultés"
        description={isManager ? 'Blocages, besoins de formation et manques de ressources remontés par vos équipes. Une difficulté critique ou sans réponse sous 3 jours est escaladée.' : 'Signalez vos blocages et suivez leur traitement jusqu’à la résolution.'}
        actions={
          <>
            {isManager && <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => download('/reports/export?type=issues&format=xlsx').catch((e) => toast.error(errorMessage(e)))}>Excel</Button>}
            <Button size="sm" icon={<AlertCircle className="h-4 w-4" />} onClick={() => openIssue()}>Signaler une difficulté</Button>
          </>
        }
      />
      {isManager && <Tabs value={tab} onChange={setTab} tabs={[{ value: 'list', label: 'Liste' }, { value: 'stats', label: 'Statistiques' }]} />}
      {tab === 'stats' && isManager ? <StatsView /> : (
        <>
          <div className="mb-5 flex flex-wrap gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher" className="pl-9" aria-label="Rechercher une difficulté" />
            </div>
            <Select value={get('status')} onChange={(e) => set('status', e.target.value)} className="w-48" aria-label="Statut">
              <option value="">Tous les statuts</option>
              <option value="unresolved">Non résolues</option>
              {(Object.keys(ISSUE_STATUS_LABEL) as IssueStatus[]).map((s) => <option key={s} value={s}>{ISSUE_STATUS_LABEL[s]}</option>)}
            </Select>
            <Select value={get('severity')} onChange={(e) => set('severity', e.target.value)} className="w-44" aria-label="Gravité">
              <option value="">Toutes gravités</option>
              {(['critical', 'medium', 'low'] as Severity[]).map((s) => <option key={s} value={s}>{SEVERITY_LABEL[s]}</option>)}
            </Select>
            <Select value={get('type')} onChange={(e) => set('type', e.target.value)} className="w-48" aria-label="Type">
              <option value="">Tous les types</option>
              {(Object.keys(ISSUE_TYPE_LABEL) as IssueType[]).map((t) => <option key={t} value={t}>{ISSUE_TYPE_LABEL[t]}</option>)}
            </Select>
          </div>
          {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
            <div className="rounded-xl border border-ink-200 bg-white">
              <EmptyState icon={<AlertCircle className="h-5 w-5" />} title="Aucune difficulté" action={<Button variant="secondary" onClick={() => openIssue()}>Signaler une difficulté</Button>}>
                Aucune difficulté ne correspond à ces filtres.
              </EmptyState>
            </div>
          ) : (
            <ul className="space-y-2">
              {q.data.map((i) => (
                <li key={i.id}>
                  <Link to={`/difficultes/${i.id}`} className={`flex flex-col gap-3 rounded-xl border bg-white px-5 py-4 shadow-card transition hover:border-brand-300 sm:flex-row sm:items-center ${i.severity === 'critical' && i.status !== 'resolved' ? 'border-red-200' : 'border-ink-200/80'}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <SeverityBadge severity={i.severity} />
                        <IssueStatusBadge status={i.status} />
                        <span className="text-xs text-ink-500">{ISSUE_TYPE_LABEL[i.type]}</span>
                        {i.isStale && <span className="text-xs font-semibold text-red-700">Sans réponse depuis plus de 3 jours</span>}
                      </div>
                      <p className="mt-1.5 truncate text-[15px] font-bold text-ink-900">{i.title}</p>
                      {i.task && <p className="mt-0.5 truncate text-xs text-ink-500">Tâche : {i.task.title}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3 sm:w-64 sm:justify-end">
                      <Avatar user={i.reporter} size="sm" />
                      <div className="text-right text-xs">
                        <p className="font-semibold text-ink-800">{fullName(i.reporter)}</p>
                        <p className="text-ink-500">{fmtAgo(i.reportedAt)} · {i.responseCount} réponse{i.responseCount > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
