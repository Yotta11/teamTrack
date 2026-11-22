import { useQuery } from '@tanstack/react-query';
import { Download, ListChecks, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, download, errorMessage } from '../api/client';
import { useQuickActions } from '../components/layout/AppLayout';
import { DueChip } from '../components/TaskRow';
import { AvatarStack, Button, EmptyState, ErrorState, Input, Label, PageHeader, PageLoader, PriorityBadge, ProgressBar, Segmented, Select, StatusBadge } from '../components/ui';
import { useLabels, useTeams, useUsers } from '../hooks/queries';
import { useAuth } from '../lib/auth';
import { fullName } from '../lib/format';
import { PRIORITY_LABEL, STATUS_LABEL } from '../lib/labels';
import type { Priority, Task, TaskStatus } from '../lib/types';

export default function TasksPage() {
  const { user, isManager } = useAuth();
  const { openTask } = useQuickActions();
  const [params, setParams] = useSearchParams();
  const teams = useTeams(user?.role !== 'admin');
  const labels = useLabels();
  const people = useUsers({ status: 'active' });
  const [search, setSearch] = useState('');

  const get = (k: string, d = '') => params.get(k) ?? d;
  const set = (k: string, v: string) => {
    if (v) params.set(k, v);
    else params.delete(k);
    setParams(params, { replace: true });
  };
  const scope = get('vue', isManager ? 'all' : 'mine');

  const filters = {
    teamId: get('equipe') || undefined,
    status: get('statut') || undefined,
    priority: get('priorite') || undefined,
    assigneeId: get('personne') || undefined,
    due: get('echeance') || undefined,
    label: get('etiquette') || undefined,
    mine: scope === 'mine' ? 'true' : undefined,
    search: search || undefined,
  };
  const q = useQuery({ queryKey: ['tasks', filters], queryFn: async () => (await api.get<Task[]>('/tasks', { params: filters })).data });

  const exportTasks = (format: 'pdf' | 'xlsx') =>
    download(`/reports/export?type=tasks&format=${format}${filters.teamId ? `&teamId=${filters.teamId}` : ''}`).catch((e) => toast.error(errorMessage(e)));

  return (
    <>
      <PageHeader
        title="Tâches"
        description="Toutes les tâches de votre périmètre, filtrables par personne, statut et échéance."
        actions={
          <>
            {isManager && (
              <>
                <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => exportTasks('pdf')}>PDF</Button>
                <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => exportTasks('xlsx')}>Excel</Button>
              </>
            )}
            {user?.role !== 'intern' && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openTask()}>Nouvelle tâche</Button>}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {user?.role !== 'intern' && (
          <Segmented label="Périmètre" value={scope} onChange={(v) => set('vue', v)} options={[{ value: 'mine', label: 'Mes tâches' }, { value: 'all', label: 'Mon périmètre' }]} />
        )}
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher" className="pl-9" aria-label="Rechercher une tâche" />
        </div>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        <Select value={get('equipe')} onChange={(e) => set('equipe', e.target.value)} aria-label="Équipe">
          <option value="">Toutes les équipes</option>
          {(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={get('statut')} onChange={(e) => set('statut', e.target.value)} aria-label="Statut">
          <option value="">Tous les statuts</option>
          {(['todo', 'in_progress', 'review', 'done', 'backlog'] as TaskStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </Select>
        <Select value={get('priorite')} onChange={(e) => set('priorite', e.target.value)} aria-label="Priorité">
          <option value="">Toutes priorités</option>
          {(['urgent', 'high', 'normal', 'low'] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </Select>
        <Select value={get('echeance')} onChange={(e) => set('echeance', e.target.value)} aria-label="Échéance">
          <option value="">Toutes échéances</option>
          <option value="overdue">En retard</option>
          <option value="soon">Sous 48 heures</option>
          <option value="today">Aujourd’hui</option>
          <option value="week">Cette semaine</option>
        </Select>
        {scope !== 'mine' && user?.role !== 'intern' ? (
          <Select value={get('personne')} onChange={(e) => set('personne', e.target.value)} aria-label="Personne">
            <option value="">Toutes les personnes</option>
            {(people.data ?? []).map((u) => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
          </Select>
        ) : <span className="hidden xl:block" />}
        <Select value={get('etiquette')} onChange={(e) => set('etiquette', e.target.value)} aria-label="Étiquette">
          <option value="">Toutes étiquettes</option>
          {(labels.data ?? []).map((l) => <option key={l} value={l}>#{l}</option>)}
        </Select>
      </div>

      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <div className="rounded-xl border border-ink-200 bg-white">
          <EmptyState icon={<ListChecks className="h-5 w-5" />} title="Aucune tâche ne correspond">Modifiez les filtres ou créez une nouvelle tâche.</EmptyState>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-ink-200/80 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-left text-xs text-ink-500">
                <tr>
                  <th className="px-5 py-3 font-semibold">Tâche</th>
                  <th className="px-3 py-3 font-semibold">Statut</th>
                  <th className="px-3 py-3 font-semibold">Priorité</th>
                  <th className="px-3 py-3 font-semibold">Échéance</th>
                  <th className="w-40 px-3 py-3 font-semibold">Avancement</th>
                  <th className="px-5 py-3 font-semibold">Responsables</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {q.data.map((t) => (
                  <tr key={t.id} className="hover:bg-ink-50/70">
                    <td className="max-w-md px-5 py-3">
                      <Link to={`/taches/${t.id}`} className="font-semibold text-ink-900 hover:text-brand-700">{t.title}</Link>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                        <span>{t.teamName}</span>
                        {t.labels.slice(0, 2).map((l) => <Label key={l}>{l}</Label>)}
                      </div>
                    </td>
                    <td className="px-3 py-3"><StatusBadge status={t.status} /></td>
                    <td className="px-3 py-3"><PriorityBadge priority={t.priority} /></td>
                    <td className="px-3 py-3"><DueChip task={t} /></td>
                    <td className="px-3 py-3"><ProgressBar value={t.progress} size="sm" showValue /></td>
                    <td className="px-5 py-3"><AvatarStack users={t.assignees} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-ink-100 px-5 py-2.5 text-xs text-ink-500">{q.data.length} tâche{q.data.length > 1 ? 's' : ''}</p>
        </div>
      )}
    </>
  );
}
