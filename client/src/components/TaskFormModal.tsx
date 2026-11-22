import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { useLabels, useTeam, useTeams } from '../hooks/queries';
import { useAuth } from '../lib/auth';
import { fullName } from '../lib/format';
import { PRIORITY_LABEL, ROLE_LABEL } from '../lib/labels';
import type { Priority, Sprint, Task } from '../lib/types';
import { Avatar, Button, Field, Input, Modal, Segmented, Select, Textarea } from './ui';

export interface TaskDefaults {
  teamId?: number;
  status?: 'todo' | 'backlog';
  sprintId?: number;
  assigneeIds?: number[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  defaults?: TaskDefaults;
  task?: Task; // mode modification
}

const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

export function TaskFormModal({ open, onClose, defaults, task }: Props) {
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const editing = !!task;
  const teams = useTeams(user?.role !== 'admin');
  const labels = useLabels();

  const [teamId, setTeamId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [estimate, setEstimate] = useState('');
  const [points, setPoints] = useState('');
  const [status, setStatus] = useState<'todo' | 'backlog'>('todo');
  const [sprintId, setSprintId] = useState<string>('');
  const [assignees, setAssignees] = useState<number[]>([]);
  const [chosenLabels, setChosenLabels] = useState<string[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [subtasks, setSubtasks] = useState<{ title: string; weight: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (task) {
      setTeamId(task.teamId);
      setTitle(task.title);
      setDescription(task.description ?? '');
      setPriority(task.priority);
      setDueDate(task.dueDate ?? '');
      setEstimate(task.estimateHours?.toString() ?? '');
      setPoints(task.storyPoints?.toString() ?? '');
      setChosenLabels(task.labels);
    } else {
      setTeamId(defaults?.teamId ?? null);
      setTitle('');
      setDescription('');
      setPriority('normal');
      setDueDate('');
      setEstimate('');
      setPoints('');
      setStatus(defaults?.status ?? 'todo');
      setSprintId(defaults?.sprintId ? String(defaults.sprintId) : '');
      setAssignees(defaults?.assigneeIds ?? (user?.role === 'employee' ? [user.id] : []));
      setChosenLabels([]);
      setSubtasks([]);
    }
  }, [open, task, defaults, user]);

  useEffect(() => {
    if (open && !teamId && teams.data?.length) setTeamId(teams.data[0].id);
  }, [open, teamId, teams.data]);

  const team = useTeam(teamId);
  const sprints = useQuery({
    queryKey: ['sprints', teamId],
    enabled: open && !!teamId && isManager && !editing,
    queryFn: async () => (await api.get<Sprint[]>('/sprints', { params: { teamId } })).data,
  });

  const members = useMemo(
    () => (team.data?.members ?? []).filter((m) => m.isActive && (user?.role !== 'employee' || m.id === user.id)),
    [team.data, user],
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description: description || null,
        priority,
        dueDate: dueDate || null,
        estimateHours: estimate ? Number(estimate) : null,
        storyPoints: points ? Number(points) : null,
        labels: chosenLabels,
      };
      if (editing) return (await api.put<Task>(`/tasks/${task!.id}`, payload)).data;
      return (
        await api.post<Task>('/tasks', {
          ...payload,
          teamId,
          status,
          sprintId: sprintId ? Number(sprintId) : null,
          assigneeIds: assignees,
          subtasks: subtasks.filter((s) => s.title.trim()),
        })
      ).data;
    },
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ['tasks'] });
      qc.invalidateQueries({ queryKey: ['task', t.id] });
      qc.invalidateQueries({ queryKey: ['board'] });
      qc.invalidateQueries({ queryKey: ['backlog'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['sprint'] });
      onClose();
      if (editing) toast.success('Tâche mise à jour');
      else
        toast.success(status === 'backlog' ? 'Élément ajouté au backlog' : 'Tâche créée et déléguée', {
          action: { label: 'Ouvrir', onClick: () => navigate(`/taches/${t.id}`) },
        });
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 3) return setError('Donnez un titre d’au moins 3 caractères.');
    if (!editing && !teamId) return setError('Choisissez une équipe.');
    if (!editing && status !== 'backlog' && assignees.length === 0) return setError('Affectez la tâche à au moins une personne.');
    save.mutate();
  };

  const toggle = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? 'Modifier la tâche' : 'Nouvelle tâche'}
      description={editing ? undefined : 'Décrivez le travail, fixez une échéance et déléguez-le à une ou plusieurs personnes de l’équipe.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="task-form" loading={save.isPending}>
            {editing ? 'Enregistrer' : status === 'backlog' ? 'Ajouter au backlog' : 'Créer la tâche'}
          </Button>
        </>
      }
    >
      <form id="task-form" onSubmit={submit} className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Titre" required className="sm:col-span-2">
            {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Intégrer la page de paiement" maxLength={200} />}
          </Field>
          <Field label="Équipe" required>
            {(id) => (
              <Select id={id} value={teamId ?? ''} onChange={(e) => { setTeamId(Number(e.target.value)); setAssignees(user?.role === 'employee' ? [user.id] : []); setSprintId(''); }} disabled={editing}>
                {(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
          </Field>
        </div>

        <Field label="Description">
          {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Contexte, résultat attendu, critères de fin…" />}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Priorité">
            {() => <Segmented label="Priorité" value={priority} onChange={setPriority} options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))} />}
          </Field>
          {!editing && isManager && (
            <Field label="Destination">
              {() => (
                <Segmented
                  label="Destination"
                  value={status}
                  onChange={setStatus}
                  options={[{ value: 'todo', label: 'Tableau (à faire)' }, { value: 'backlog', label: 'Backlog' }]}
                />
              )}
            </Field>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Échéance" hint="Pour un stagiaire, au plus tard la fin du stage.">
            {(id) => <Input id={id} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />}
          </Field>
          <Field label="Estimation (heures)">
            {(id) => <Input id={id} type="number" min={0} step={0.5} value={estimate} onChange={(e) => setEstimate(e.target.value)} placeholder="Ex. 6" />}
          </Field>
          <Field label="Points d’effort" hint="Suite de Fibonacci : 1, 2, 3, 5, 8, 13">
            {(id) => (
              <Select id={id} value={points} onChange={(e) => setPoints(e.target.value)}>
                <option value="">—</option>
                {[1, 2, 3, 5, 8, 13, 21].map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            )}
          </Field>
        </div>

        {!editing && status === 'todo' && isManager && (sprints.data ?? []).some((s) => s.status !== 'closed') && (
          <Field label="Sprint" hint="Facultatif : rattacher la tâche au sprint en cours ou à venir.">
            {(id) => (
              <Select id={id} value={sprintId} onChange={(e) => setSprintId(e.target.value)}>
                <option value="">Aucun sprint</option>
                {(sprints.data ?? []).filter((s) => s.status !== 'closed').map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.status === 'active' ? ' (en cours)' : ''}</option>
                ))}
              </Select>
            )}
          </Field>
        )}

        {!editing && (
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold text-ink-700">
              Responsables {status !== 'backlog' && <span className="text-brand-600">*</span>}
            </legend>
            <p className="mb-2 text-xs text-ink-500">Seuls les membres de l’équipe peuvent être affectés.</p>
            <div className="grid max-h-52 gap-1.5 overflow-y-auto sm:grid-cols-2">
              {members.map((m) => {
                const active = assignees.includes(m.id);
                return (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => setAssignees(toggle(assignees, m.id))}
                    aria-pressed={active}
                    className={clsx(
                      'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ring-1 ring-inset transition',
                      active ? 'bg-brand-50 ring-brand-400' : 'bg-white ring-ink-200 hover:ring-ink-300',
                    )}
                  >
                    <Avatar user={m} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold">{fullName(m)}</span>
                      <span className="block text-2xs text-ink-500">{ROLE_LABEL[m.role]}</span>
                    </span>
                    <span className={clsx('h-4 w-4 rounded border-2', active ? 'border-brand-600 bg-brand-600' : 'border-ink-300')} />
                  </button>
                );
              })}
              {team.isLoading && <p className="text-sm text-ink-500">Chargement des membres…</p>}
            </div>
          </fieldset>
        )}

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-700">Étiquettes</legend>
          <div className="flex flex-wrap items-center gap-1.5">
            {[...new Set([...(labels.data ?? []), ...chosenLabels])].map((l) => {
              const on = chosenLabels.includes(l);
              return (
                <button
                  type="button"
                  key={l}
                  aria-pressed={on}
                  onClick={() => setChosenLabels(on ? chosenLabels.filter((x) => x !== l) : [...chosenLabels, l])}
                  className={clsx('rounded-md px-2 py-1 text-xs font-semibold ring-1 ring-inset', on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-600 ring-ink-200 hover:ring-ink-300')}
                >
                  #{l}
                </button>
              );
            })}
            <span className="inline-flex items-center gap-1">
              <input
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const v = newLabel.trim().toLowerCase();
                    if (v && !chosenLabels.includes(v)) setChosenLabels([...chosenLabels, v]);
                    setNewLabel('');
                  }
                }}
                placeholder="Nouvelle…"
                aria-label="Nouvelle étiquette"
                className="h-7 w-28 rounded-md border-0 px-2 text-xs ring-1 ring-inset ring-ink-200 focus:ring-2 focus:ring-brand-500"
              />
            </span>
          </div>
        </fieldset>

        {!editing && (
          <fieldset>
            <legend className="mb-1 text-[13px] font-semibold text-ink-700">Sous-tâches</legend>
            <p className="mb-2 text-xs text-ink-500">L’avancement sera calculé automatiquement selon le poids de chaque sous-tâche.</p>
            <div className="space-y-2">
              {subtasks.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={s.title} onChange={(e) => setSubtasks(subtasks.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder={`Sous-tâche ${i + 1}`} aria-label={`Sous-tâche ${i + 1}`} />
                  <Select value={s.weight} onChange={(e) => setSubtasks(subtasks.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))} className="w-28" aria-label="Poids">
                    {[1, 2, 3, 5].map((w) => <option key={w} value={w}>Poids {w}</option>)}
                  </Select>
                  <Button variant="ghost" size="icon" onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))} aria-label="Retirer">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="subtle" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setSubtasks([...subtasks, { title: '', weight: 1 }])}>
                Ajouter une sous-tâche
              </Button>
            </div>
          </fieldset>
        )}
      </form>
    </Modal>
  );
}
