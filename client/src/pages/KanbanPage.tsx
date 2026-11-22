import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { AlertCircle, CheckSquare, MessageSquare, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorCode, errorDetails, errorMessage } from '../api/client';
import { useQuickActions } from '../components/layout/AppLayout';
import { TaskDrawer } from '../components/TaskDetailView';
import { DueChip } from '../components/TaskRow';
import { Avatar, AvatarStack, Button, ConfirmDialog, EmptyState, ErrorState, Input, Label, PageHeader, PageLoader, PriorityBadge, Select } from '../components/ui';
import { useLabels } from '../hooks/queries';
import { useTeamSelection } from '../hooks/useTeamSelection';
import { useAuth } from '../lib/auth';
import { fullName } from '../lib/format';
import { BOARD_COLUMNS, PRIORITY_LABEL, STATUS_LABEL } from '../lib/labels';
import type { Priority, Sprint, Task, TaskStatus, UserBrief } from '../lib/types';

interface Board {
  tasks: Task[];
  team: { id: number; name: string; wipInProgress: number | null; wipReview: number | null } | null;
  people: (UserBrief & { wipLimit: number; inProgress: number })[];
  canManage: boolean;
}

interface WipViolation {
  scope: 'person' | 'column';
  name: string;
  limit: number;
  current: number;
}

function TaskCard({ task, overlay, onOpen }: { task: Task; overlay?: boolean; onOpen?: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id, data: { task } });
  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : listeners)}
      {...(overlay ? {} : attributes)}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen?.()}
      aria-label={`${task.title}, ${STATUS_LABEL[task.status]}, priorité ${PRIORITY_LABEL[task.priority]}`}
      className={clsx(
        'group cursor-grab touch-none select-none rounded-lg border bg-white p-3 text-left shadow-card outline-none transition active:cursor-grabbing',
        'focus-visible:ring-2 focus-visible:ring-brand-500',
        task.isOverdue ? 'border-red-200' : 'border-ink-200/80 hover:border-brand-300',
        isDragging && !overlay && 'opacity-30',
        overlay && 'rotate-[1.5deg] shadow-lift ring-1 ring-brand-300',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-semibold leading-snug text-ink-900">{task.title}</p>
        {task.openIssueCount > 0 && <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-label="Difficulté ouverte" />}
      </div>
      {task.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">{task.labels.slice(0, 3).map((l) => <Label key={l}>{l}</Label>)}</div>
      )}
      {task.status !== 'todo' && task.status !== 'done' && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink-100">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${task.progress}%` }} />
          </div>
          <span className="text-2xs font-bold tabular-nums text-ink-600">{task.progress} %</span>
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <PriorityBadge priority={task.priority} compact />
          <DueChip task={task} />
        </div>
        <AvatarStack users={task.assignees} max={2} />
      </div>
      {(task.subtaskCount > 0 || task.commentCount > 0 || task.storyPoints) && (
        <div className="mt-2 flex items-center gap-3 border-t border-ink-100 pt-2 text-2xs font-semibold text-ink-500">
          {task.subtaskCount > 0 && <span className="inline-flex items-center gap-1"><CheckSquare className="h-3 w-3" />{task.subtaskDone}/{task.subtaskCount}</span>}
          {task.commentCount > 0 && <span className="inline-flex items-center gap-1"><MessageSquare className="h-3 w-3" />{task.commentCount}</span>}
          {task.storyPoints ? <span className="ml-auto rounded bg-ink-100 px-1.5 tabular-nums text-ink-700">{task.storyPoints} pts</span> : null}
        </div>
      )}
    </article>
  );
}

function Column({ status, tasks, limit, onOpen, onAdd }: { status: TaskStatus; tasks: Task[]; limit: number | null; onOpen: (id: number) => void; onAdd?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const over = limit !== null && tasks.length > limit;
  const full = limit !== null && tasks.length >= limit;
  return (
    <section
      ref={setNodeRef}
      aria-label={`Colonne ${STATUS_LABEL[status]}`}
      className={clsx(
        'flex min-h-[60vh] w-[290px] shrink-0 flex-col rounded-xl p-2 transition-colors lg:w-auto lg:flex-1',
        isOver ? 'bg-brand-50 ring-2 ring-inset ring-brand-300' : 'bg-ink-100/70',
      )}
    >
      <header className="flex items-center justify-between px-2 pb-2.5 pt-1.5">
        <div className="flex items-center gap-2">
          <h2 className="text-[13px] font-bold text-ink-800">{STATUS_LABEL[status]}</h2>
          <span className="rounded-full bg-white px-1.5 text-2xs font-bold tabular-nums text-ink-600 ring-1 ring-ink-200">{tasks.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {limit !== null && (
            <span
              className={clsx('rounded-md px-1.5 py-0.5 text-2xs font-bold tabular-nums', over ? 'bg-red-600 text-white' : full ? 'bg-amber-100 text-amber-800' : 'bg-white text-ink-500 ring-1 ring-ink-200')}
              title="Limite de travail en cours (WIP) de la colonne"
            >
              WIP {tasks.length}/{limit}
            </span>
          )}
          {onAdd && (
            <button onClick={onAdd} className="rounded-md p-1 text-ink-500 hover:bg-white hover:text-brand-700" aria-label="Ajouter une tâche">
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto px-0.5 pb-1 scrollbar-thin">
        {tasks.map((t) => <TaskCard key={t.id} task={t} onOpen={() => onOpen(t.id)} />)}
        {tasks.length === 0 && <p className="rounded-lg border-2 border-dashed border-ink-200 px-3 py-6 text-center text-xs text-ink-400">Déposez une carte ici</p>}
      </div>
    </section>
  );
}

export default function KanbanPage() {
  const { user, isManager } = useAuth();
  const { openTask } = useQuickActions();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { teams, teamId, setTeamId } = useTeamSelection(user?.role !== 'admin');
  const labels = useLabels();
  const [scope, setScope] = useState<string>('active');
  const [assignee, setAssignee] = useState<number | null>(null);
  const [priority, setPriority] = useState<Priority | ''>('');
  const [label, setLabel] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [forceMove, setForceMove] = useState<{ task: Task; status: TaskStatus; message: string } | null>(null);
  const openTaskId = params.get('tache') ? Number(params.get('tache')) : null;

  const sprints = useQuery({
    queryKey: ['sprints', teamId],
    enabled: !!teamId && user?.role !== 'intern',
    queryFn: async () => (await api.get<Sprint[]>('/sprints', { params: { teamId } })).data,
  });
  const activeSprint = sprints.data?.find((s) => s.status === 'active');
  const sprintParam = scope === 'active' ? activeSprint?.id : scope === 'all' ? undefined : Number(scope);

  const boardKey = ['board', teamId, sprintParam ?? 'all'];
  const board = useQuery({
    queryKey: boardKey,
    enabled: !!teamId && (user?.role === 'intern' || !sprints.isLoading),
    queryFn: async () => (await api.get<Board>('/tasks/board', { params: { teamId, sprintId: sprintParam } })).data,
  });

  const move = useMutation({
    mutationFn: async ({ task, status, force }: { task: Task; status: TaskStatus; force?: boolean }) =>
      (await api.patch<Task & { wipWarnings?: WipViolation[] }>(`/tasks/${task.id}/status`, { status, force })).data,
    onMutate: async ({ task, status }) => {
      await qc.cancelQueries({ queryKey: boardKey });
      const prev = qc.getQueryData<Board>(boardKey);
      qc.setQueryData<Board>(boardKey, (b) => (b ? { ...b, tasks: b.tasks.map((t) => (t.id === task.id ? { ...t, status } : t)) } : b));
      return { prev };
    },
    onError: (err, vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(boardKey, ctx.prev);
      if (errorCode(err) === 'WIP_EXCEEDED' && (errorDetails(err) as { canForce?: boolean })?.canForce) {
        setForceMove({ task: vars.task, status: vars.status, message: errorMessage(err) });
      } else {
        toast.error(errorMessage(err));
      }
    },
    onSuccess: (t, vars) => {
      if (t.wipWarnings?.length) toast.warning('Limite WIP dépassée', { description: 'Le chef d’équipe a été prévenu.' });
      else if (vars.status === 'done' && vars.task.progress < 100) toast.success('Tâche validée et terminée');
      else toast.success(`Déplacée vers « ${STATUS_LABEL[vars.status]} »`);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (board.data?.tasks ?? []).filter(
      (t) =>
        (!assignee || t.assignees.some((a) => a.id === assignee)) &&
        (!priority || t.priority === priority) &&
        (!label || t.labels.includes(label)) &&
        (!q || t.title.toLowerCase().includes(q)),
    );
  }, [board.data, assignee, priority, label, search]);

  const byStatus = (s: TaskStatus) => filtered.filter((t) => t.status === s);
  const team = board.data?.team;
  const limitFor = (s: TaskStatus) => (s === 'in_progress' ? team?.wipInProgress ?? null : s === 'review' ? team?.wipReview ?? null : null);

  const onDragStart = (e: DragStartEvent) => setDragging((e.active.data.current as { task: Task }).task);
  const onDragEnd = (e: DragEndEvent) => {
    setDragging(null);
    const task = (e.active.data.current as { task: Task }).task;
    const target = e.over?.id as TaskStatus | undefined;
    if (!target || target === task.status) return;
    move.mutate({ task, status: target });
  };

  const openDrawer = (id: number) => {
    params.set('tache', String(id));
    setParams(params);
  };
  const closeDrawer = () => {
    params.delete('tache');
    setParams(params);
  };

  const activeFilters = [assignee, priority, label, search].filter(Boolean).length;

  return (
    <>
      <PageHeader
        title="Tableau Kanban"
        description="Glissez une carte d’une colonne à l’autre pour mettre à jour son statut. Une tâche passe en « Terminé » à 100 % ou après validation du tuteur."
        actions={
          <>
            {(teams.data?.length ?? 0) > 1 && (
              <Select value={teamId ?? ''} onChange={(e) => setTeamId(Number(e.target.value))} className="w-52" aria-label="Équipe">
                {teams.data!.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
            {user?.role !== 'intern' && (
              <Select value={scope} onChange={(e) => setScope(e.target.value)} className="w-52" aria-label="Sprint">
                <option value="active">{activeSprint ? `Sprint en cours` : 'Sprint en cours (aucun)'}</option>
                <option value="all">Toutes les tâches</option>
                {(sprints.data ?? []).filter((s) => s.status !== 'active').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            )}
          </>
        }
      />

      {/* Barre de filtres + charge WIP par personne */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher une carte" className="pl-9" aria-label="Rechercher une carte" />
        </div>
        <Button variant={showFilters || activeFilters ? 'subtle' : 'secondary'} size="sm" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setShowFilters((s) => !s)} className="h-10">
          Filtres{activeFilters ? ` (${activeFilters})` : ''}
        </Button>
        {user?.role !== 'intern' && board.data && (
          <div className="flex items-center gap-1.5 overflow-x-auto" role="group" aria-label="Filtrer par personne">
            {board.data.people.map((p) => {
              const over = p.inProgress >= p.wipLimit;
              return (
                <button
                  key={p.id}
                  onClick={() => setAssignee(assignee === p.id ? null : p.id)}
                  aria-pressed={assignee === p.id}
                  title={`${fullName(p)} : ${p.inProgress} tâche(s) en cours, limite ${p.wipLimit}`}
                  className={clsx('relative flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 ring-1 transition', assignee === p.id ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-ink-200 hover:ring-brand-300')}
                >
                  <Avatar user={p} size="xs" className="ring-0" />
                  <span className={clsx('text-2xs font-bold tabular-nums', assignee === p.id ? 'text-white' : over ? 'text-red-700' : 'text-ink-600')}>
                    {p.inProgress}/{p.wipLimit}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      {showFilters && (
        <div className="mb-4 flex flex-wrap gap-3 rounded-xl border border-ink-200 bg-white p-3">
          <Select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')} className="w-44" aria-label="Priorité">
            <option value="">Toutes priorités</option>
            {(['urgent', 'high', 'normal', 'low'] as Priority[]).map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </Select>
          <Select value={label} onChange={(e) => setLabel(e.target.value)} className="w-44" aria-label="Étiquette">
            <option value="">Toutes étiquettes</option>
            {(labels.data ?? []).map((l) => <option key={l} value={l}>#{l}</option>)}
          </Select>
          {user?.role !== 'intern' && (
            <Button variant="ghost" size="sm" className="h-10" onClick={() => setAssignee(assignee === user!.id ? null : user!.id)}>
              {assignee === user?.id ? 'Toute l’équipe' : 'Mes tâches uniquement'}
            </Button>
          )}
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" className="h-10" onClick={() => { setAssignee(null); setPriority(''); setLabel(''); setSearch(''); }}>
              Effacer les filtres
            </Button>
          )}
        </div>
      )}

      {teams.data && teams.data.length === 0 ? (
        <EmptyState title="Vous n’appartenez à aucune équipe">Demandez à l’administrateur de vous affecter à une équipe pour voir son tableau.</EmptyState>
      ) : board.isLoading || !teamId ? (
        <PageLoader />
      ) : board.error ? (
        <ErrorState error={board.error} onRetry={() => board.refetch()} />
      ) : (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
            {BOARD_COLUMNS.map((s) => (
              <Column
                key={s}
                status={s}
                tasks={byStatus(s)}
                limit={limitFor(s)}
                onOpen={openDrawer}
                onAdd={s === 'todo' && user?.role !== 'intern' ? () => openTask({ teamId: teamId!, sprintId: sprintParam }) : undefined}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>{dragging ? <TaskCard task={dragging} overlay /> : null}</DragOverlay>
        </DndContext>
      )}

      {scope === 'active' && !activeSprint && isManager && !sprints.isLoading && board.data && (
        <p className="mt-2 text-xs text-ink-500">Aucun sprint en cours : le tableau affiche toutes les tâches de l’équipe.</p>
      )}

      <ConfirmDialog
        open={!!forceMove}
        onClose={() => setForceMove(null)}
        title="Limite WIP atteinte"
        message={<><p>{forceMove?.message}</p><p className="mt-2">En tant que responsable, vous pouvez dépasser la limite. L’équipe risque toutefois la surcharge.</p></>}
        confirmLabel="Déplacer quand même"
        onConfirm={() => {
          if (forceMove) move.mutate({ task: forceMove.task, status: forceMove.status, force: true });
          setForceMove(null);
        }}
      />
      <TaskDrawer taskId={openTaskId} onClose={closeDrawer} />
    </>
  );
}
