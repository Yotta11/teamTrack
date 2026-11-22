import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { ArrowDown, ArrowUp, CalendarRange, CircleCheck, Flag, Play, Plus, Repeat2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { BurndownChart } from '../components/Charts';
import { useQuickActions } from '../components/layout/AppLayout';
import { TaskDrawer } from '../components/TaskDetailView';
import {
  AvatarStack,
  Button,
  EmptyState,
  ErrorState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Panel,
  PriorityBadge,
  ProgressBar,
  Select,
  SprintBadge,
  StatusBadge,
  Tabs,
  Textarea,
} from '../components/ui';
import { useTeamSelection } from '../hooks/useTeamSelection';
import { fmtDate, fmtShort, pct, plusDaysISO } from '../lib/format';
import type { Sprint, SprintDetail, Task } from '../lib/types';

function SprintFormModal({ open, onClose, teamId, onCreated }: { open: boolean; onClose: () => void; teamId: number; onCreated: (id: number) => void }) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [start, setStart] = useState(plusDaysISO(1));
  const [end, setEnd] = useState(plusDaysISO(14));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setName(''); setGoal(''); setStart(plusDaysISO(1)); setEnd(plusDaysISO(14)); setError(null); }
  }, [open]);
  const days = start && end ? differenceInCalendarDays(parseISO(end), parseISO(start)) + 1 : 0;
  const save = useMutation({
    mutationFn: async () => (await api.post<Sprint>('/sprints', { teamId, name, goal, startDate: start, endDate: end })).data,
    onSuccess: (s) => { toast.success('Sprint planifié'); onCreated(s.id); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Planifier un sprint"
      description="Un sprint dure entre une et deux semaines."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Créer le sprint</Button></>}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <Field label="Nom" required>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Sprint 4 — Notifications" />}</Field>
        <Field label="Objectif du sprint">{(id) => <Textarea id={id} rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Le résultat attendu à la fin du sprint" />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Début">{(id) => <Input id={id} type="date" value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
          <Field label="Fin" hint={days ? `${days} jour${days > 1 ? 's' : ''}` : undefined} error={days && (days < 7 || days > 14) ? 'Entre 7 et 14 jours.' : null}>
            {(id) => <Input id={id} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />}
          </Field>
        </div>
      </div>
    </Modal>
  );
}

function CloseSprintModal({ open, onClose, sprint, sprints, onDone }: { open: boolean; onClose: () => void; sprint: SprintDetail; sprints: Sprint[]; onDone: () => void }) {
  const unfinished = sprint.tasks.filter((t) => t.status !== 'done');
  const nextSprints = sprints.filter((s) => s.status === 'planned');
  const [decisions, setDecisions] = useState<Record<number, string>>({});
  const [retro, setRetro] = useState({ positive: '', improve: '', actions: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setDecisions(Object.fromEntries(unfinished.map((t) => [t.id, nextSprints[0] ? `sprint:${nextSprints[0].id}` : 'backlog'])));
      setRetro({ positive: sprint.retroPositive ?? '', improve: sprint.retroImprove ?? '', actions: sprint.retroActions ?? '' });
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const close = useMutation({
    mutationFn: () =>
      api.post(`/sprints/${sprint.id}/close`, {
        decisions: Object.entries(decisions).map(([taskId, v]) =>
          v === 'backlog' ? { taskId: Number(taskId), action: 'backlog' } : { taskId: Number(taskId), action: 'sprint', sprintId: Number(v.split(':')[1]) },
        ),
        retro,
      }),
    onSuccess: () => { toast.success('Sprint clôturé'); onDone(); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`Clôturer « ${sprint.name} »`}
      description="Chaque tâche non terminée doit être replanifiée ou remise dans le backlog avant la clôture."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={() => close.mutate()} loading={close.isPending}>Clôturer le sprint</Button></>}
    >
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      <h3 className="mb-2 text-sm font-bold">Tâches non terminées ({unfinished.length})</h3>
      {unfinished.length === 0 ? (
        <p className="mb-6 text-sm text-ink-500">Toutes les tâches du sprint sont terminées.</p>
      ) : (
        <ul className="mb-6 divide-y divide-ink-100 rounded-lg border border-ink-200">
          {unfinished.map((t) => (
            <li key={t.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.title}</p>
                <p className="text-xs text-ink-500">{t.progress} % · {t.storyPoints ?? 0} pts</p>
              </div>
              <Select value={decisions[t.id] ?? 'backlog'} onChange={(e) => setDecisions({ ...decisions, [t.id]: e.target.value })} className="h-9 sm:w-60" aria-label={`Destination de ${t.title}`}>
                <option value="backlog">Remettre dans le backlog</option>
                {nextSprints.map((s) => <option key={s.id} value={`sprint:${s.id}`}>Replanifier dans {s.name}</option>)}
              </Select>
            </li>
          ))}
        </ul>
      )}
      <h3 className="mb-2 text-sm font-bold">Rétrospective</h3>
      <div className="grid gap-3">
        <Field label="Ce qui a bien fonctionné">{(id) => <Textarea id={id} rows={2} value={retro.positive} onChange={(e) => setRetro({ ...retro, positive: e.target.value })} />}</Field>
        <Field label="Ce qui peut être amélioré">{(id) => <Textarea id={id} rows={2} value={retro.improve} onChange={(e) => setRetro({ ...retro, improve: e.target.value })} />}</Field>
        <Field label="Actions décidées">{(id) => <Textarea id={id} rows={2} value={retro.actions} onChange={(e) => setRetro({ ...retro, actions: e.target.value })} />}</Field>
      </div>
    </Modal>
  );
}

function Retrospective({ sprint, onSaved }: { sprint: SprintDetail; onSaved: () => void }) {
  const [r, setR] = useState({ positive: '', improve: '', actions: '' });
  useEffect(() => setR({ positive: sprint.retroPositive ?? '', improve: sprint.retroImprove ?? '', actions: sprint.retroActions ?? '' }), [sprint]);
  const save = useMutation({
    mutationFn: () => api.put(`/sprints/${sprint.id}/retro`, r),
    onSuccess: () => { toast.success('Rétrospective enregistrée'); onSaved(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const cols: { key: keyof typeof r; label: string }[] = [
    { key: 'positive', label: 'Points positifs' },
    { key: 'improve', label: 'Points à améliorer' },
    { key: 'actions', label: 'Actions décidées' },
  ];
  return (
    <Panel title="Rétrospective" actions={sprint.canManage && <Button size="sm" variant="secondary" onClick={() => save.mutate()} loading={save.isPending}>Enregistrer</Button>}>
      <div className="grid gap-4 md:grid-cols-3">
        {cols.map((c) => (
          <div key={c.key}>
            <p className="mb-1.5 text-[13px] font-semibold text-ink-700">{c.label}</p>
            {sprint.canManage ? (
              <Textarea rows={4} value={r[c.key]} onChange={(e) => setR({ ...r, [c.key]: e.target.value })} aria-label={c.label} />
            ) : (
              <p className="whitespace-pre-line text-sm text-ink-700">{r[c.key] || '—'}</p>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function SprintView({ id, sprints, onChanged, onOpenTask }: { id: number; sprints: Sprint[]; onChanged: () => void; onOpenTask: (id: number) => void }) {
  const qc = useQueryClient();
  const [closeOpen, setCloseOpen] = useState(false);
  const q = useQuery({ queryKey: ['sprint', id], queryFn: async () => (await api.get<SprintDetail>(`/sprints/${id}`)).data });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['sprint', id] }); onChanged(); };
  const start = useMutation({
    mutationFn: () => api.post(`/sprints/${id}/start`),
    onSuccess: () => { toast.success('Sprint démarré'); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const unplan = useMutation({
    mutationFn: (taskId: number) => api.delete(`/sprints/${id}/items/${taskId}`),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['backlog'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const daysLeft = differenceInCalendarDays(parseISO(s.endDate), new Date());

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-ink-200/80 bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><h2 className="text-lg font-extrabold">{s.name}</h2><SprintBadge status={s.status} /></div>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] text-ink-500"><CalendarRange className="h-4 w-4" /> {fmtDate(s.startDate)} au {fmtDate(s.endDate)}{s.status === 'active' && ` · ${daysLeft >= 0 ? `${daysLeft} j restants` : 'échéance dépassée'}`}</p>
            {s.goal && <p className="mt-2 flex items-start gap-1.5 text-sm text-ink-700"><Flag className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />{s.goal}</p>}
          </div>
          {s.canManage && (
            <div className="flex gap-2">
              {s.status === 'planned' && <Button icon={<Play className="h-4 w-4" />} onClick={() => start.mutate()} loading={start.isPending}>Démarrer</Button>}
              {s.status === 'active' && <Button icon={<CircleCheck className="h-4 w-4" />} variant="secondary" onClick={() => setCloseOpen(true)}>Clôturer</Button>}
            </div>
          )}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><p className="text-xs text-ink-500">Points terminés</p><p className="text-xl font-extrabold tabular-nums">{s.pointsDone}<span className="text-sm font-semibold text-ink-400"> / {s.pointsTotal}</span></p></div>
          <div><p className="text-xs text-ink-500">Tâches terminées</p><p className="text-xl font-extrabold tabular-nums">{s.doneCount}<span className="text-sm font-semibold text-ink-400"> / {s.taskCount}</span></p></div>
          <div className="col-span-2"><p className="mb-2 text-xs text-ink-500">Réalisation</p><ProgressBar value={pct(s.pointsTotal ? s.pointsDone : s.doneCount, s.pointsTotal || s.taskCount)} showValue /></div>
        </div>
      </div>

      <Panel title="Burndown" description={`Reste à faire par jour, en ${s.burndown.unit}`}>
        {s.burndown.total ? (
          <BurndownChart data={s.burndown.points} unit={s.burndown.unit} formatX={(v) => format(parseISO(v), 'd MMM', { locale: fr })} />
        ) : (
          <EmptyState title="Aucun élément dans ce sprint">Ajoutez des user stories depuis le backlog.</EmptyState>
        )}
      </Panel>

      <Panel title="Contenu du sprint" bodyClassName="p-0">
        {s.tasks.length ? (
          <ul className="divide-y divide-ink-100">
            {s.tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                <button onClick={() => onOpenTask(t.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate text-sm font-semibold hover:text-brand-700">{t.title}</p>
                  <div className="mt-1 flex items-center gap-2"><StatusBadge status={t.status} /><PriorityBadge priority={t.priority} compact /></div>
                </button>
                <span className="w-14 text-right text-xs font-bold tabular-nums text-ink-600">{t.storyPoints ?? '–'} pts</span>
                <AvatarStack users={t.assignees} />
                {s.canManage && s.status !== 'closed' && t.status !== 'done' && (
                  <Button variant="ghost" size="sm" onClick={() => unplan.mutate(t.id)}>Retirer</Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState title="Sprint vide">Sélectionnez des éléments dans le backlog pour les planifier.</EmptyState>
        )}
      </Panel>

      <Retrospective sprint={s} onSaved={refresh} />
      <CloseSprintModal open={closeOpen} onClose={() => setCloseOpen(false)} sprint={s} sprints={sprints} onDone={() => { refresh(); qc.invalidateQueries({ queryKey: ['backlog'] }); }} />
    </div>
  );
}

function Backlog({ teamId, sprints, canManage, onOpenTask }: { teamId: number; sprints: Sprint[]; canManage: boolean; onOpenTask: (id: number) => void }) {
  const qc = useQueryClient();
  const { openTask } = useQuickActions();
  const [selected, setSelected] = useState<number[]>([]);
  const targets = sprints.filter((s) => s.status !== 'closed');
  const [target, setTarget] = useState<string>('');
  useEffect(() => setTarget(targets[0] ? String(targets[0].id) : ''), [sprints]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useQuery({ queryKey: ['backlog', teamId], queryFn: async () => (await api.get<Task[]>('/sprints/backlog', { params: { teamId } })).data });
  const items = q.data ?? [];
  const reorder = useMutation({
    mutationFn: (ids: number[]) => api.patch('/sprints/backlog/order', { teamId, taskIds: ids }),
    onMutate: (ids) => qc.setQueryData<Task[]>(['backlog', teamId], (old) => ids.map((id) => old!.find((t) => t.id === id)!)),
    onError: (e) => { toast.error(errorMessage(e)); qc.invalidateQueries({ queryKey: ['backlog', teamId] }); },
  });
  const plan = useMutation({
    mutationFn: () => api.post(`/sprints/${target}/items`, { taskIds: selected }),
    onSuccess: () => {
      toast.success(`${selected.length} élément(s) planifié(s)`);
      setSelected([]);
      qc.invalidateQueries({ queryKey: ['backlog', teamId] });
      qc.invalidateQueries({ queryKey: ['sprint'] });
      qc.invalidateQueries({ queryKey: ['sprints', teamId] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const move = (i: number, dir: -1 | 1) => {
    const ids = items.map((t) => t.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    reorder.mutate(ids);
  };
  const totalPoints = items.reduce((s, t) => s + (t.storyPoints ?? 0), 0);

  return (
    <Panel
      title="Product backlog"
      description={`${items.length} user stories · ${totalPoints} points, classées par priorité`}
      actions={canManage && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => openTask({ teamId, status: 'backlog' })}>User story</Button>}
      bodyClassName="p-0"
    >
      {canManage && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-100 bg-brand-50 px-5 py-2.5">
          <span className="text-sm font-semibold text-brand-800">{selected.length} sélectionné(s)</span>
          <Select value={target} onChange={(e) => setTarget(e.target.value)} className="ml-auto h-9 w-56" aria-label="Sprint cible">
            {targets.map((s) => <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (en cours)' : ''}</option>)}
          </Select>
          <Button size="sm" disabled={!target} loading={plan.isPending} onClick={() => plan.mutate()}>Planifier dans le sprint</Button>
        </div>
      )}
      {q.isLoading ? <PageLoader /> : items.length === 0 ? (
        <EmptyState icon={<Repeat2 className="h-5 w-5" />} title="Backlog vide">Ajoutez des user stories au format : en tant que…, je veux…, afin de…</EmptyState>
      ) : (
        <ol className="divide-y divide-ink-100">
          {items.map((t, i) => (
            <li key={t.id} className={clsx('flex items-center gap-3 px-5 py-3', selected.includes(t.id) && 'bg-brand-50/50')}>
              {canManage && (
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                  checked={selected.includes(t.id)}
                  onChange={(e) => setSelected(e.target.checked ? [...selected, t.id] : selected.filter((x) => x !== t.id))}
                  aria-label={`Sélectionner ${t.title}`}
                />
              )}
              <span className="w-6 text-right text-xs font-bold tabular-nums text-ink-400">{i + 1}</span>
              <button onClick={() => onOpenTask(t.id)} className="min-w-0 flex-1 text-left">
                <p className="text-sm font-medium leading-snug text-ink-800 hover:text-brand-700">{t.title}</p>
              </button>
              <PriorityBadge priority={t.priority} compact />
              <span className="w-12 rounded bg-ink-100 py-0.5 text-center text-xs font-bold tabular-nums text-ink-700">{t.storyPoints ?? '?'}</span>
              {canManage && (
                <span className="flex flex-col">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-0.5 text-ink-400 hover:text-brand-700 disabled:opacity-30" aria-label="Monter"><ArrowUp className="h-3.5 w-3.5" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="rounded p-0.5 text-ink-400 hover:text-brand-700 disabled:opacity-30" aria-label="Descendre"><ArrowDown className="h-3.5 w-3.5" /></button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export default function SprintsPage() {
  const qc = useQueryClient();
  const { teams, teamId, setTeamId } = useTeamSelection(true);
  const [tab, setTab] = useState<'sprints' | 'backlog'>('sprints');
  const [selected, setSelected] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const team = teams.data?.find((t) => t.id === teamId);

  const sprints = useQuery({
    queryKey: ['sprints', teamId],
    enabled: !!teamId,
    queryFn: async () => (await api.get<Sprint[]>('/sprints', { params: { teamId } })).data,
  });
  const teamDetail = useQuery({
    queryKey: ['team', teamId],
    enabled: !!teamId,
    queryFn: async () => (await api.get<{ canManage: boolean }>(`/teams/${teamId}`)).data,
  });
  const canManage = !!teamDetail.data?.canManage;

  const list = useMemo(() => sprints.data ?? [], [sprints.data]);
  useEffect(() => {
    if (!list.length) return setSelected(null);
    if (!selected || !list.some((s) => s.id === selected)) setSelected((list.find((s) => s.status === 'active') ?? list[0]).id);
  }, [list, selected]);

  return (
    <>
      <PageHeader
        title="Backlog et sprints"
        description="Priorisez les user stories, planifiez des sprints d’une à deux semaines et suivez le reste à faire."
        actions={
          <>
            {(teams.data?.length ?? 0) > 1 && (
              <Select value={teamId ?? ''} onChange={(e) => { setTeamId(Number(e.target.value)); setSelected(null); }} className="w-56" aria-label="Équipe">
                {teams.data!.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
            {canManage && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Nouveau sprint</Button>}
          </>
        }
      />
      {!teamId ? (
        teams.isLoading ? <PageLoader /> : <EmptyState title="Aucune équipe">Vous devez appartenir à une équipe pour planifier des sprints.</EmptyState>
      ) : (
        <>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[{ value: 'sprints', label: 'Sprints', count: list.length }, { value: 'backlog', label: 'Product backlog' }]}
          />
          {tab === 'backlog' ? (
            <Backlog teamId={teamId} sprints={list} canManage={canManage} onOpenTask={setOpenTaskId} />
          ) : sprints.isLoading ? (
            <PageLoader />
          ) : list.length === 0 ? (
            <div className="rounded-xl border border-ink-200 bg-white">
              <EmptyState icon={<Repeat2 className="h-5 w-5" />} title={`Aucun sprint pour ${team?.name ?? 'cette équipe'}`} action={canManage && <Button onClick={() => setCreateOpen(true)}>Planifier le premier sprint</Button>}>
                Un sprint regroupe les user stories que l’équipe s’engage à livrer en une à deux semaines.
              </EmptyState>
            </div>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
              <nav aria-label="Sprints" className="space-y-2">
                {list.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setSelected(s.id)}
                    aria-current={selected === s.id}
                    className={clsx(
                      'w-full rounded-xl border px-4 py-3 text-left transition',
                      selected === s.id ? 'border-brand-400 bg-white shadow-card ring-1 ring-brand-400' : 'border-ink-200 bg-white/60 hover:bg-white',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-bold">{s.name}</span>
                      <SprintBadge status={s.status} />
                    </div>
                    <p className="mt-1 text-xs text-ink-500">{fmtShort(s.startDate)} au {fmtShort(s.endDate)}</p>
                    <ProgressBar value={pct(s.pointsTotal ? s.pointsDone : s.doneCount, s.pointsTotal || s.taskCount)} size="sm" className="mt-2" />
                  </button>
                ))}
                <Link to={`/kanban?equipe=${teamId}`} className="block px-1 pt-1 text-[13px] font-semibold text-brand-700 hover:underline">Voir le Kanban du sprint</Link>
              </nav>
              {selected && <SprintView id={selected} sprints={list} onChanged={() => qc.invalidateQueries({ queryKey: ['sprints', teamId] })} onOpenTask={setOpenTaskId} />}
            </div>
          )}
        </>
      )}
      {teamId && <SprintFormModal open={createOpen} onClose={() => setCreateOpen(false)} teamId={teamId} onCreated={(id) => { qc.invalidateQueries({ queryKey: ['sprints', teamId] }); setSelected(id); setTab('sprints'); }} />}
      <TaskDrawer taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
    </>
  );
}
