import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Download, Pencil, Settings2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, download, errorMessage } from '../api/client';
import { TrendBars } from '../components/Charts';
import { TaskRow } from '../components/TaskRow';
import { Avatar, Button, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, Panel, ProgressBar, RoleBadge, Stat, StatusRail } from '../components/ui';
import { useTeam } from '../hooks/queries';
import { useAuth } from '../lib/auth';
import { fullName } from '../lib/format';
import { PRIORITY_LABEL } from '../lib/labels';
import type { KeyCount, Priority, Role, Task } from '../lib/types';
import { TeamFormModal } from './TeamsPage';

interface TeamDashboard {
  team: { id: number; name: string; description: string | null; wipInProgress: number | null; wipReview: number | null };
  canManage: boolean;
  byStatus: KeyCount[];
  byPriority: KeyCount[];
  members: {
    id: number; firstName: string; lastName: string; role: Role; avatarUrl: string | null; jobTitle: string | null; wipLimit: number;
    total: number; done: number; inProgress: number; open: number; overdue: number; remainingHours: number; avgProgress: number; openIssues: number; completionRate: number;
  }[];
  overdue: Task[];
  throughput: { week: string; done: number }[];
  cycleTimeDays: number | null;
  blockedTasks: number;
  activeSprint: { id: number; name: string; endDate: string } | null;
}

function WipSettings({ open, onClose, data, onSaved }: { open: boolean; onClose: () => void; data: TeamDashboard; onSaved: () => void }) {
  const [col, setCol] = useState({ inProgress: '', review: '' });
  const [people, setPeople] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!open) return;
    setCol({ inProgress: data.team.wipInProgress?.toString() ?? '', review: data.team.wipReview?.toString() ?? '' });
    setPeople(Object.fromEntries(data.members.map((m) => [m.id, String(m.wipLimit)])));
  }, [open, data]);
  const save = useMutation({
    mutationFn: async () => {
      await api.patch(`/teams/${data.team.id}/wip`, { inProgress: col.inProgress ? Number(col.inProgress) : null, review: col.review ? Number(col.review) : null });
      for (const m of data.members) {
        if (String(m.wipLimit) !== people[m.id]) await api.patch(`/users/${m.id}/wip-limit`, { wipLimit: Number(people[m.id]) });
      }
    },
    onSuccess: () => { toast.success('Limites WIP enregistrées'); onSaved(); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Limites de travail en cours (WIP)"
      description="Limiter le nombre de tâches en cours évite la surcharge et fluidifie le flux. Par défaut : 3 tâches en cours par personne."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Enregistrer</Button></>}
    >
      <h3 className="mb-2 text-sm font-bold">Par colonne</h3>
      <div className="mb-6 grid grid-cols-2 gap-4">
        <Field label="En cours" hint="Vide = sans limite">{(id) => <Input id={id} type="number" min={1} value={col.inProgress} onChange={(e) => setCol({ ...col, inProgress: e.target.value })} />}</Field>
        <Field label="En revue" hint="Vide = sans limite">{(id) => <Input id={id} type="number" min={1} value={col.review} onChange={(e) => setCol({ ...col, review: e.target.value })} />}</Field>
      </div>
      <h3 className="mb-2 text-sm font-bold">Par personne</h3>
      <ul className="divide-y divide-ink-100">
        {data.members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 py-2">
            <Avatar user={m} size="xs" />
            <span className="flex-1 text-sm font-semibold">{fullName(m)}</span>
            <Input type="number" min={1} max={20} value={people[m.id] ?? ''} onChange={(e) => setPeople({ ...people, [m.id]: e.target.value })} className="h-9 w-20" aria-label={`Limite WIP de ${fullName(m)}`} />
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export default function TeamDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [wipOpen, setWipOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const q = useQuery({ queryKey: ['dashboard', 'team', id], queryFn: async () => (await api.get<TeamDashboard>(`/dashboard/team/${id}`)).data });
  const team = useTeam(user?.role === 'admin' ? Number(id) : null);

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const d = q.data;
  const st = (k: string) => d.byStatus.find((x) => x.key === k)?.count ?? 0;
  const total = st('todo') + st('in_progress') + st('review') + st('done');
  const overdueCount = d.members.reduce((s, m) => s + m.overdue, 0);
  const maxHours = Math.max(1, ...d.members.map((m) => m.remainingHours));
  const exportTeam = (f: 'pdf' | 'xlsx') => download(`/reports/export?type=team&id=${id}&format=${f}`).catch((e) => toast.error(errorMessage(e)));

  return (
    <>
      <PageHeader
        back={{ to: '/equipes', label: 'Équipes' }}
        title={d.team.name}
        description={d.team.description ?? undefined}
        actions={
          <>
            <Link to={`/kanban?equipe=${id}`}><Button variant="secondary">Kanban</Button></Link>
            {d.canManage && (
              <>
                <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => exportTeam('pdf')}>PDF</Button>
                <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => exportTeam('xlsx')}>Excel</Button>
                <Button variant="ghost" size="icon" onClick={() => setWipOpen(true)} aria-label="Limites WIP" title="Limites WIP"><Settings2 className="h-4 w-4" /></Button>
              </>
            )}
            {user?.role === 'admin' && <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} aria-label="Modifier l’équipe"><Pencil className="h-4 w-4" /></Button>}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Taux de réalisation" value={`${total ? Math.round((st('done') / total) * 100) : 0} %`} tone="brand" context={`${st('done')} terminées sur ${total}`} />
        <Stat label="En retard" value={overdueCount} tone={overdueCount ? 'alert' : 'default'} context={`${d.blockedTasks} tâche(s) bloquée(s) par une difficulté`} />
        <Stat label="Temps de cycle moyen" value={d.cycleTimeDays !== null ? `${d.cycleTimeDays} j` : '—'} context="Du démarrage à la fin, sur 60 jours" />
        <Stat label="Sprint en cours" value={d.activeSprint ? d.activeSprint.name.split('—')[0].trim() : '—'} context={d.activeSprint ? `Fin le ${format(parseISO(d.activeSprint.endDate), 'd MMMM', { locale: fr })}` : 'Aucun sprint actif'} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Répartition des tâches" className="lg:col-span-2">
          <StatusRail segments={[
            { key: 'todo', label: 'À faire', value: st('todo') },
            { key: 'in_progress', label: 'En cours', value: st('in_progress') },
            { key: 'review', label: 'En revue', value: st('review') },
            { key: 'done', label: 'Terminé', value: st('done') },
          ]} />
          <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-ink-100 pt-4 text-sm">
            <span className="text-ink-500">Ouvertes par priorité :</span>
            {(['urgent', 'high', 'normal', 'low'] as Priority[]).map((p) => (
              <span key={p}><strong className="tabular-nums">{d.byPriority.find((x) => x.key === p)?.count ?? 0}</strong> <span className="text-ink-600">{PRIORITY_LABEL[p].toLowerCase()}</span></span>
            ))}
            <span className="text-ink-500">· Backlog : <strong className="text-ink-900">{st('backlog')}</strong></span>
          </div>
        </Panel>
        <Panel title="Débit hebdomadaire" description="Tâches terminées par semaine">
          <TrendBars data={d.throughput} xKey="week" series={[{ key: 'done', label: 'Terminées' }]} height={170} formatX={(v) => format(parseISO(v), 'd MMM', { locale: fr })} />
        </Panel>
      </div>

      <Panel title="Membres" description="Avancement, charge restante et retards de chaque personne" className="mb-6" bodyClassName="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-ink-50 text-left text-xs text-ink-500">
              <tr>
                <th className="px-5 py-2.5 font-semibold">Membre</th>
                <th className="w-44 px-3 py-2.5 font-semibold">Réalisation</th>
                <th className="px-3 py-2.5 text-center font-semibold">En cours / WIP</th>
                <th className="px-3 py-2.5 text-right font-semibold">Ouvertes</th>
                <th className="px-3 py-2.5 text-right font-semibold">Retards</th>
                <th className="w-40 px-3 py-2.5 font-semibold">Charge restante</th>
                <th className="px-5 py-2.5 text-right font-semibold">Difficultés</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {d.members.map((m) => (
                <tr key={m.id} className="hover:bg-ink-50/70">
                  <td className="px-5 py-3">
                    <Link to={`/personnes/${m.id}`} className="flex items-center gap-3">
                      <Avatar user={m} size="sm" />
                      <span className="min-w-0"><span className="block truncate font-semibold hover:text-brand-700">{fullName(m)}</span><RoleBadge role={m.role} /></span>
                    </Link>
                  </td>
                  <td className="px-3 py-3"><ProgressBar value={m.completionRate} size="sm" showValue /><span className="text-2xs text-ink-500">{m.done}/{m.total} terminées</span></td>
                  <td className={`px-3 py-3 text-center font-bold tabular-nums ${m.inProgress >= m.wipLimit ? 'text-red-700' : 'text-ink-700'}`}>{m.inProgress}/{m.wipLimit}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{m.open}</td>
                  <td className={`px-3 py-3 text-right tabular-nums ${m.overdue ? 'font-bold text-red-700' : 'text-ink-500'}`}>{m.overdue}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-300" style={{ width: `${(m.remainingHours / maxHours) * 100}%` }} /></div>
                      <span className="w-12 text-right text-xs tabular-nums text-ink-600">{m.remainingHours} h</span>
                    </div>
                  </td>
                  <td className={`px-5 py-3 text-right tabular-nums ${m.openIssues ? 'font-semibold text-amber-700' : 'text-ink-500'}`}>{m.openIssues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Retards et échéances proches" bodyClassName="p-0">
        {d.overdue.length ? <div className="divide-y divide-ink-100">{d.overdue.map((t) => <TaskRow key={t.id} task={t} />)}</div> : <EmptyState title="Aucun retard">Toutes les tâches de l’équipe sont dans les temps.</EmptyState>}
      </Panel>

      <WipSettings open={wipOpen} onClose={() => setWipOpen(false)} data={d} onSaved={() => { q.refetch(); qc.invalidateQueries({ queryKey: ['board'] }); }} />
      {user?.role === 'admin' && <TeamFormModal open={editOpen} onClose={() => { setEditOpen(false); q.refetch(); }} team={team.data} />}
    </>
  );
}
