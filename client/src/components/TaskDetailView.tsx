import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import {
  AlertCircle,
  AtSign,
  ExternalLink,
  FileText,
  Paperclip,
  Pencil,
  Plus,
  Send,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, download, errorMessage } from '../api/client';
import { useTeam } from '../hooks/queries';
import { useAuth } from '../lib/auth';
import { dueLabel, fileSize, fmtAgo, fmtDate, fmtDateTime, fullName } from '../lib/format';
import { ROLE_LABEL, STATUS_LABEL } from '../lib/labels';
import type { TaskDetail, TaskStatus } from '../lib/types';
import { useQuickActions } from './layout/AppLayout';
import { TaskFormModal } from './TaskFormModal';
import {
  Avatar,
  Button,
  ConfirmDialog,
  Drawer,
  ErrorState,
  Field,
  Input,
  IssueStatusBadge,
  Label,
  Modal,
  PageLoader,
  PriorityBadge,
  ProgressBar,
  Select,
  SeverityBadge,
  StatusBadge,
  Tabs,
  Textarea,
} from './ui';

function Section({ title, children, actions, count }: { title: string; children: ReactNode; actions?: ReactNode; count?: number }) {
  return (
    <section className="rounded-xl border border-ink-200/80 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-900">
          {title}
          {count !== undefined && <span className="ml-1.5 text-ink-400">{count}</span>}
        </h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function MetaRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-3 py-2.5 text-sm">
      <span className="pt-0.5 text-ink-500">{label}</span>
      <div className="min-w-0 font-medium text-ink-900">{children}</div>
    </div>
  );
}

/** Mise en évidence des @mentions dans les commentaires. */
function renderComment(text: string) {
  return text.split(/(@[A-ZÀ-ÖØ-Ý][\p{L}'’-]+(?: [A-ZÀ-ÖØ-Ý][\p{L}'’-]+)?)/u).map((part, i) =>
    part.startsWith('@') ? <strong key={i} className="font-semibold text-brand-700">{part}</strong> : part,
  );
}

export function TaskDetailView({ id, inDrawer, onClose }: { id: number; inDrawer?: boolean; onClose?: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { openIssue } = useQuickActions();
  const q = useQuery({ queryKey: ['task', id], queryFn: async () => (await api.get<TaskDetail>(`/tasks/${id}`)).data });
  const task = q.data;
  const team = useTeam(task?.teamId);

  const [editOpen, setEditOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [progressValue, setProgressValue] = useState<number | null>(null);
  const [progressNote, setProgressNote] = useState('');
  const [newSub, setNewSub] = useState('');
  const [newSubWeight, setNewSubWeight] = useState(1);
  const [comment, setComment] = useState('');
  const [mentions, setMentions] = useState<number[]>([]);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [historyTab, setHistoryTab] = useState<'activity' | 'progress' | 'assign'>('activity');
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['task', id] });
    qc.invalidateQueries({ queryKey: ['board'] });
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const onErr = (e: unknown) => toast.error(errorMessage(e));

  const status = useMutation({
    mutationFn: (s: TaskStatus) => api.patch(`/tasks/${id}/status`, { status: s }),
    onSuccess: (_r, s) => { toast.success(`Statut : ${STATUS_LABEL[s]}`); refresh(); },
    onError: onErr,
  });
  const progress = useMutation({
    mutationFn: () => api.patch(`/tasks/${id}/progress`, { progress: progressValue, note: progressNote || undefined }),
    onSuccess: () => { toast.success('Avancement enregistré'); setProgressValue(null); setProgressNote(''); refresh(); },
    onError: onErr,
  });
  const addSub = useMutation({
    mutationFn: () => api.post(`/tasks/${id}/subtasks`, { title: newSub, weight: newSubWeight }),
    onSuccess: () => { setNewSub(''); setNewSubWeight(1); refresh(); },
    onError: onErr,
  });
  const toggleSub = useMutation({
    mutationFn: ({ sid, done }: { sid: number; done: boolean }) => api.patch(`/tasks/${id}/subtasks/${sid}`, { done }),
    onSuccess: refresh,
    onError: onErr,
  });
  const delSub = useMutation({ mutationFn: (sid: number) => api.delete(`/tasks/${id}/subtasks/${sid}`), onSuccess: refresh, onError: onErr });
  const addComment = useMutation({
    mutationFn: () => api.post(`/tasks/${id}/comments`, { content: comment, mentions }),
    onSuccess: () => { setComment(''); setMentions([]); refresh(); },
    onError: onErr,
  });
  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.post(`/tasks/${id}/attachments`, fd);
    },
    onSuccess: () => { toast.success('Pièce jointe ajoutée'); refresh(); },
    onError: onErr,
  });
  const delAttachment = useMutation({ mutationFn: (aid: number) => api.delete(`/tasks/${id}/attachments/${aid}`), onSuccess: refresh, onError: onErr });
  const remove = useMutation({
    mutationFn: () => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      toast.success('Tâche supprimée');
      refresh();
      if (inDrawer) onClose?.();
      else navigate('/taches');
    },
    onError: onErr,
  });

  if (q.isLoading) return <PageLoader />;
  if (q.error || !task) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;

  const p = task.permissions;
  const isAssignee = task.assignees.some((a) => a.id === user?.id);
  const canMove = p.canManage || isAssignee;
  const hasSubtasks = task.subtasks.length > 0;
  const members = (team.data?.members ?? []).filter((m) => m.isActive && m.id !== user?.id);
  const allowedStatuses: TaskStatus[] = p.canManage ? ['backlog', 'todo', 'in_progress', 'review', 'done'] : ['todo', 'in_progress', 'review', 'done'];

  return (
    <div className={clsx(inDrawer ? 'flex h-full flex-col' : '')}>
      {/* En-tête */}
      <div className={clsx(inDrawer ? 'border-b border-ink-200 bg-white px-6 py-4' : 'mb-6')}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-ink-500">
              <Link to={`/equipes/${task.teamId}`} className="font-semibold hover:text-brand-700">{task.teamName}</Link>
              {task.sprintName && <><span aria-hidden>/</span><span>{task.sprintName}</span></>}
              <span aria-hidden>/</span>
              <span>Tâche n° {task.id}</span>
            </div>
            <h1 className={clsx('font-extrabold tracking-tight text-ink-900', inDrawer ? 'text-xl' : 'text-2xl sm:text-[28px]')}>{task.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {task.isOverdue && <span className="text-xs font-bold text-red-700">{dueLabel(task.dueDate)}</span>}
              {task.validatedBy && <span className="text-xs text-ink-500">Validée par le tuteur</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {inDrawer && (
              <Link to={`/taches/${task.id}`} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 hover:text-ink-900" aria-label="Ouvrir en pleine page" title="Ouvrir en pleine page">
                <ExternalLink className="h-4 w-4" />
              </Link>
            )}
            {p.canEdit && <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} aria-label="Modifier"><Pencil className="h-4 w-4" /></Button>}
            {p.canManage && <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(true)} aria-label="Supprimer"><Trash2 className="h-4 w-4" /></Button>}
            {inDrawer && <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer"><X className="h-5 w-5" /></Button>}
          </div>
        </div>
      </div>

      <div className={clsx('grid gap-5 lg:grid-cols-[1fr_300px]', inDrawer && 'flex-1 overflow-y-auto p-6 scrollbar-thin')}>
        <div className="min-w-0 space-y-5">
          <Section title="Description">
            {task.description ? (
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{task.description}</p>
            ) : (
              <p className="text-sm italic text-ink-400">Aucune description.</p>
            )}
          </Section>

          {/* Avancement */}
          <Section title="Avancement">
            <div className="flex items-center gap-4">
              <span className="text-3xl font-extrabold tabular-nums text-brand-700">{progressValue ?? task.progress} %</span>
              <ProgressBar value={progressValue ?? task.progress} className="flex-1" />
            </div>
            {hasSubtasks ? (
              <p className="mt-2 text-xs text-ink-500">Calculé automatiquement à partir des sous-tâches pondérées.</p>
            ) : p.canUpdateProgress && task.status !== 'done' ? (
              <div className="mt-4 space-y-3 rounded-lg bg-ink-50 p-4">
                <label className="block text-[13px] font-semibold text-ink-700" htmlFor={`progress-${id}`}>Déclarer mon avancement</label>
                <input
                  id={`progress-${id}`}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={progressValue ?? task.progress}
                  onChange={(e) => setProgressValue(Number(e.target.value))}
                  className="w-full accent-brand-600"
                />
                <Input value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="Commentaire de progression (facultatif)" aria-label="Commentaire de progression" />
                <div className="flex justify-end gap-2">
                  {progressValue !== null && <Button variant="ghost" size="sm" onClick={() => { setProgressValue(null); setProgressNote(''); }}>Annuler</Button>}
                  <Button size="sm" disabled={progressValue === null || progressValue === task.progress} loading={progress.isPending} onClick={() => progress.mutate()}>
                    Enregistrer l’avancement
                  </Button>
                </div>
              </div>
            ) : null}
          </Section>

          {/* Sous-tâches */}
          <Section title="Sous-tâches" count={task.subtasks.length}>
            <ul className="space-y-1">
              {task.subtasks.map((s) => (
                <li key={s.id} className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-ink-50">
                  <input
                    type="checkbox"
                    checked={s.done}
                    disabled={!canMove && !p.canEdit}
                    onChange={(e) => toggleSub.mutate({ sid: s.id, done: e.target.checked })}
                    className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                    aria-label={s.title}
                  />
                  <span className={clsx('flex-1 text-sm', s.done ? 'text-ink-400 line-through' : 'text-ink-800')}>{s.title}</span>
                  <span className="text-2xs font-semibold text-ink-400" title="Poids dans le calcul de l’avancement">poids {s.weight}</span>
                  {p.canEdit && (
                    <button onClick={() => delSub.mutate(s.id)} className="rounded p-1 text-ink-400 opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100" aria-label={`Supprimer ${s.title}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {(p.canEdit || isAssignee) && (
              <form
                className="mt-3 flex gap-2"
                onSubmit={(e) => { e.preventDefault(); if (newSub.trim()) addSub.mutate(); }}
              >
                <Input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Nouvelle sous-tâche" aria-label="Nouvelle sous-tâche" />
                <Select value={newSubWeight} onChange={(e) => setNewSubWeight(Number(e.target.value))} className="w-24" aria-label="Poids">
                  {[1, 2, 3, 5].map((w) => <option key={w} value={w}>Poids {w}</option>)}
                </Select>
                <Button type="submit" variant="secondary" icon={<Plus className="h-4 w-4" />} loading={addSub.isPending}>Ajouter</Button>
              </form>
            )}
          </Section>

          {/* Commentaires */}
          <Section title="Discussion" count={task.comments.length}>
            <ul className="space-y-4">
              {task.comments.map((c) => (
                <li key={c.id} className="flex gap-3">
                  <Avatar user={c.author} size="sm" />
                  <div className="min-w-0 flex-1 rounded-lg bg-ink-50 px-3.5 py-2.5">
                    <p className="text-xs">
                      <strong className="font-semibold text-ink-900">{fullName(c.author)}</strong>
                      <span className="ml-2 text-ink-400">{fmtAgo(c.createdAt)}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">{renderComment(c.content)}</p>
                  </div>
                </li>
              ))}
              {task.comments.length === 0 && <p className="text-sm text-ink-400">Aucun commentaire. Posez une question ou partagez un point d’étape.</p>}
            </ul>
            <form className="mt-4" onSubmit={(e) => { e.preventDefault(); if (comment.trim()) addComment.mutate(); }}>
              <Textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="Écrire un commentaire…" aria-label="Commentaire" />
              <div className="mt-2 flex items-center justify-between">
                <div className="relative">
                  <Button variant="ghost" size="sm" icon={<AtSign className="h-4 w-4" />} onClick={() => setMentionOpen((o) => !o)} aria-expanded={mentionOpen}>
                    Mentionner
                  </Button>
                  {mentionOpen && (
                    <div className="absolute bottom-full left-0 z-10 mb-1 max-h-60 w-64 overflow-y-auto rounded-xl border border-ink-200 bg-white py-1 shadow-lift">
                      {members.map((m) => (
                        <button
                          type="button"
                          key={m.id}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink-50"
                          onClick={() => {
                            setComment((c) => `${c}${c && !c.endsWith(' ') ? ' ' : ''}@${m.firstName} ${m.lastName} `);
                            setMentions((ms) => [...new Set([...ms, m.id])]);
                            setMentionOpen(false);
                          }}
                        >
                          <Avatar user={m} size="xs" />
                          <span className="truncate">{fullName(m)}</span>
                        </button>
                      ))}
                      {members.length === 0 && <p className="px-3 py-2 text-sm text-ink-500">Aucun membre à mentionner.</p>}
                    </div>
                  )}
                </div>
                <Button type="submit" size="sm" icon={<Send className="h-4 w-4" />} loading={addComment.isPending} disabled={!comment.trim()}>Publier</Button>
              </div>
            </form>
          </Section>

          {/* Historique */}
          <Section title="Historique">
            <Tabs
              value={historyTab}
              onChange={setHistoryTab}
              tabs={[
                { value: 'activity', label: 'Activité', count: task.activity.length },
                { value: 'progress', label: 'Avancement', count: task.progressUpdates.length },
                { value: 'assign', label: 'Affectations', count: task.assignmentHistory.length },
              ]}
            />
            {historyTab === 'activity' && (
              <ol className="space-y-2.5">
                {task.activity.map((a) => (
                  <li key={a.id} className="flex gap-3 text-[13px]">
                    <span className="w-32 shrink-0 tabular-nums text-ink-400">{fmtDateTime(a.createdAt)}</span>
                    <span className="text-ink-700"><strong className="font-semibold text-ink-900">{a.userName ?? 'Système'}</strong> · {a.summary}</span>
                  </li>
                ))}
              </ol>
            )}
            {historyTab === 'progress' && (
              <ol className="space-y-2.5">
                {task.progressUpdates.map((u) => (
                  <li key={u.id} className="flex gap-3 text-[13px]">
                    <span className="w-32 shrink-0 tabular-nums text-ink-400">{fmtDateTime(u.createdAt)}</span>
                    <span className="text-ink-700"><strong className="font-semibold text-ink-900">{u.userName}</strong> · {u.progress} %{u.note && ` — ${u.note}`}</span>
                  </li>
                ))}
                {task.progressUpdates.length === 0 && <p className="text-sm text-ink-400">Aucune déclaration d’avancement pour l’instant.</p>}
              </ol>
            )}
            {historyTab === 'assign' && (
              <ol className="space-y-2.5">
                {task.assignmentHistory.map((a) => (
                  <li key={a.id} className="flex gap-3 text-[13px]">
                    <span className="w-32 shrink-0 tabular-nums text-ink-400">{fmtDateTime(a.assignedAt)}</span>
                    <span className="text-ink-700">
                      <strong className="font-semibold text-ink-900">{a.userName}</strong>
                      {a.delegatedByName && ` · déléguée par ${a.delegatedByName}`}
                      {!a.active && a.unassignedAt && <span className="text-ink-400"> · retirée le {fmtDate(a.unassignedAt)}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        {/* Colonne de détails */}
        <aside className="space-y-5">
          <section className="rounded-xl border border-ink-200/80 bg-white px-5 py-2 shadow-card">
            <MetaRow label="Statut">
              {canMove ? (
                <Select value={task.status} onChange={(e) => status.mutate(e.target.value as TaskStatus)} className="h-9" aria-label="Changer le statut" disabled={status.isPending}>
                  {allowedStatuses.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </Select>
              ) : (
                <StatusBadge status={task.status} />
              )}
            </MetaRow>
            <MetaRow label="Responsables">
              <ul className="space-y-1.5">
                {task.assignees.map((a) => (
                  <li key={a.id} className="flex items-center gap-2">
                    <Avatar user={a} size="xs" />
                    <Link to={`/personnes/${a.id}`} className="truncate hover:text-brand-700">{fullName(a)}</Link>
                  </li>
                ))}
                {task.assignees.length === 0 && <li className="text-ink-400">Non affectée</li>}
              </ul>
              {p.canManage && (
                <Button variant="subtle" size="sm" className="mt-2" icon={<UserPlus className="h-4 w-4" />} onClick={() => setDelegateOpen(true)}>
                  Déléguer
                </Button>
              )}
            </MetaRow>
            <MetaRow label="Échéance">
              <span className={clsx(task.isOverdue && 'text-red-700', task.isDueSoon && 'text-amber-700')}>{fmtDate(task.dueDate)}</span>
            </MetaRow>
            <MetaRow label="Estimation">{task.estimateHours ? `${task.estimateHours} h` : '—'}</MetaRow>
            <MetaRow label="Points">{task.storyPoints ?? '—'}</MetaRow>
            <MetaRow label="Étiquettes">
              {task.labels.length ? <div className="flex flex-wrap gap-1">{task.labels.map((l) => <Label key={l}>{l}</Label>)}</div> : '—'}
            </MetaRow>
            <MetaRow label="Créée par">
              <span className="flex items-center gap-2"><Avatar user={task.creator} size="xs" />{fullName(task.creator)}</span>
              <span className="block text-xs font-normal text-ink-500">{fmtDate(task.createdAt)}</span>
            </MetaRow>
          </section>

          <Section
            title="Difficultés liées"
            count={task.issues.length}
            actions={<Button variant="ghost" size="sm" icon={<AlertCircle className="h-4 w-4" />} onClick={() => openIssue({ taskId: task.id })}>Signaler</Button>}
          >
            <ul className="space-y-2">
              {task.issues.map((i) => (
                <li key={i.id}>
                  <Link to={`/difficultes/${i.id}`} className="block rounded-lg px-2 py-1.5 hover:bg-ink-50">
                    <p className="text-[13px] font-semibold leading-snug">{i.title}</p>
                    <div className="mt-1 flex gap-1.5"><SeverityBadge severity={i.severity} /><IssueStatusBadge status={i.status} /></div>
                  </Link>
                </li>
              ))}
              {task.issues.length === 0 && <p className="text-sm text-ink-400">Aucun blocage signalé.</p>}
            </ul>
          </Section>

          <Section
            title="Pièces jointes"
            count={task.attachments.length}
            actions={
              <>
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate(f); e.target.value = ''; }} />
                <Button variant="ghost" size="sm" icon={<Upload className="h-4 w-4" />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>Ajouter</Button>
              </>
            }
          >
            <ul className="space-y-1.5">
              {task.attachments.map((f) => (
                <li key={f.id} className="group flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-ink-50">
                  <FileText className="h-4 w-4 shrink-0 text-brand-500" />
                  <button className="min-w-0 flex-1 text-left" onClick={() => download(`/tasks/${id}/attachments/${f.id}`, f.fileName).catch(onErr)}>
                    <span className="block truncate text-[13px] font-semibold hover:text-brand-700">{f.fileName}</span>
                    <span className="text-2xs text-ink-400">{fileSize(f.size)} · {f.uploadedByName}</span>
                  </button>
                  <button onClick={() => delAttachment.mutate(f.id)} className="rounded p-1 text-ink-400 opacity-0 hover:text-red-600 group-hover:opacity-100 focus:opacity-100" aria-label={`Supprimer ${f.fileName}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {task.attachments.length === 0 && <p className="flex items-center gap-2 text-sm text-ink-400"><Paperclip className="h-4 w-4" /> PDF, images, documents Office (10 Mo max.)</p>}
            </ul>
          </Section>
        </aside>
      </div>

      <TaskFormModal open={editOpen} onClose={() => setEditOpen(false)} task={task} />
      <DelegateModal open={delegateOpen} onClose={() => setDelegateOpen(false)} task={task} onDone={refresh} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        danger
        title="Supprimer la tâche ?"
        message={<>La tâche « {task.title} », ses sous-tâches, commentaires et pièces jointes seront supprimés. Cette action est définitive.</>}
        confirmLabel="Supprimer la tâche"
      />
    </div>
  );
}

function DelegateModal({ open, onClose, task, onDone }: { open: boolean; onClose: () => void; task: TaskDetail; onDone: () => void }) {
  const team = useTeam(open ? task.teamId : null);
  const [selected, setSelected] = useState<number[]>(task.assignees.map((a) => a.id));
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.post(`/tasks/${task.id}/assign`, { userIds: selected, note: note || undefined }),
    onSuccess: () => { toast.success('Affectation mise à jour, les personnes concernées sont notifiées'); onDone(); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Déléguer la tâche"
      description="Choisissez les responsables parmi les membres de l’équipe. Le changement est tracé et notifié."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!selected.length}>Enregistrer</Button></>}
    >
      {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      <div className="grid gap-1.5 sm:grid-cols-2">
        {(team.data?.members ?? []).filter((m) => m.isActive).map((m) => {
          const on = selected.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={on}
              onClick={() => setSelected(on ? selected.filter((x) => x !== m.id) : [...selected, m.id])}
              className={clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ring-1 ring-inset', on ? 'bg-brand-50 ring-brand-400' : 'ring-ink-200 hover:ring-ink-300')}
            >
              <Avatar user={m} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold">{fullName(m)}</span>
                <span className="text-2xs text-ink-500">{ROLE_LABEL[m.role]}</span>
              </span>
            </button>
          );
        })}
      </div>
      <Field label="Message (facultatif)" className="mt-4">
        {(fid) => <Input id={fid} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex. Je suis absent jusqu’à lundi, Nadia reprend." />}
      </Field>
    </Modal>
  );
}

export function TaskDrawer({ taskId, onClose }: { taskId: number | null; onClose: () => void }) {
  return (
    <Drawer open={!!taskId} onClose={onClose} label="Détail de la tâche">
      {taskId && <TaskDetailView id={taskId} inDrawer onClose={onClose} />}
    </Drawer>
  );
}
