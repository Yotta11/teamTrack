import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { ISSUE_TYPE_LABEL, SEVERITY_LABEL } from '../lib/labels';
import type { Issue, IssueType, Severity, Task } from '../lib/types';
import { Button, Field, Input, Modal, Select, Textarea } from './ui';

export interface IssueDefaults {
  taskId?: number;
}

const TYPES: { value: IssueType; hint: string }[] = [
  { value: 'technical', hint: 'Bug, outil, environnement' },
  { value: 'organizational', hint: 'Priorités, charge, consignes' },
  { value: 'skill', hint: 'Besoin de formation' },
  { value: 'resource', hint: 'Accès, matériel, données' },
  { value: 'personal', hint: 'Situation personnelle' },
];

const SEVERITIES: { value: Severity; hint: string }[] = [
  { value: 'low', hint: 'Je peux avancer en attendant' },
  { value: 'medium', hint: 'Cela me ralentit nettement' },
  { value: 'critical', hint: 'Je suis bloqué' },
];

export function IssueFormModal({ open, onClose, defaults }: { open: boolean; onClose: () => void; defaults?: IssueDefaults }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<IssueType>('technical');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [taskId, setTaskId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle('');
    setDescription('');
    setType('technical');
    setSeverity('medium');
    setTaskId(defaults?.taskId ? String(defaults.taskId) : '');
    setError(null);
  }, [open, defaults]);

  const myTasks = useQuery({
    queryKey: ['tasks', { mine: true, open }],
    enabled: open,
    queryFn: async () => (await api.get<Task[]>('/tasks', { params: { mine: true } })).data.filter((t) => t.status !== 'done'),
  });

  const save = useMutation({
    mutationFn: async () =>
      (await api.post<Issue>('/issues', { title, description, type, severity, taskId: taskId ? Number(taskId) : null })).data,
    onSuccess: (issue) => {
      qc.invalidateQueries({ queryKey: ['issues'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['task'] });
      onClose();
      toast.success(
        severity === 'critical' ? 'Difficulté critique signalée : votre tuteur et l’administration sont prévenus.' : 'Difficulté signalée à votre responsable.',
        { action: { label: 'Suivre', onClick: () => navigate(`/difficultes/${issue.id}`) } },
      );
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 3) return setError('Résumez la difficulté en quelques mots.');
    if (description.trim().length < 5) return setError('Décrivez la difficulté pour que votre responsable puisse agir.');
    save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Signaler une difficulté"
      description="Un blocage, un besoin de formation ou un manque de ressources ? Votre responsable est prévenu immédiatement."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" form="issue-form" loading={save.isPending}>Signaler</Button>
        </>
      }
    >
      <form id="issue-form" onSubmit={submit} className="space-y-5">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">{error}</p>}
        <Field label="Titre" required>
          {(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Pas d’accès à la base de test" maxLength={200} />}
        </Field>
        <Field label="Description" required>
          {(id) => <Textarea id={id} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Ce qui se passe, ce que vous avez déjà essayé, ce dont vous avez besoin." />}
        </Field>

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-700">Type</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                aria-pressed={type === t.value}
                onClick={() => setType(t.value)}
                className={clsx('rounded-lg px-3 py-2 text-left ring-1 ring-inset transition', type === t.value ? 'bg-brand-50 ring-brand-500' : 'ring-ink-200 hover:ring-ink-300')}
              >
                <span className="block text-[13px] font-bold">{ISSUE_TYPE_LABEL[t.value]}</span>
                <span className="block text-2xs text-ink-500">{t.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-700">Gravité</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {SEVERITIES.map((s) => (
              <button
                type="button"
                key={s.value}
                aria-pressed={severity === s.value}
                onClick={() => setSeverity(s.value)}
                className={clsx(
                  'rounded-lg px-3 py-2 text-left ring-1 ring-inset transition',
                  severity === s.value ? (s.value === 'critical' ? 'bg-red-50 ring-red-500' : 'bg-brand-50 ring-brand-500') : 'ring-ink-200 hover:ring-ink-300',
                )}
              >
                <span className={clsx('block text-[13px] font-bold', s.value === 'critical' && severity === s.value && 'text-red-700')}>{SEVERITY_LABEL[s.value]}</span>
                <span className="block text-2xs text-ink-500">{s.hint}</span>
              </button>
            ))}
          </div>
          {severity === 'critical' && (
            <p className="mt-2 text-xs font-medium text-red-700">Une difficulté critique est transmise immédiatement à votre tuteur et à l’administration.</p>
          )}
        </fieldset>

        <Field label="Tâche concernée" hint="Facultatif">
          {(id) => (
            <Select id={id} value={taskId} onChange={(e) => setTaskId(e.target.value)}>
              <option value="">Aucune tâche en particulier</option>
              {(myTasks.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </Select>
          )}
        </Field>
      </form>
    </Modal>
  );
}
