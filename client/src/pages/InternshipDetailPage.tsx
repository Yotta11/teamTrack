import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Download, FileText, Pencil, Star, Trash2, Upload, UserCog } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, download, errorMessage } from '../api/client';
import { TaskRow } from '../components/TaskRow';
import {
  Avatar,
  Button,
  Checkbox,
  ConfirmDialog,
  DescriptionList,
  EmptyState,
  ErrorState,
  Field,
  Input,
  InternshipBadge,
  IssueStatusBadge,
  Modal,
  PageLoader,
  Panel,
  ScoreDots,
  Select,
  SeverityBadge,
  Stat,
  Tabs,
  Textarea,
} from '../components/ui';
import { useUsers } from '../hooks/queries';
import { useAuth } from '../lib/auth';
import { fileSize, fmtAgo, fmtDate, fmtDateTime, fullName, todayISO } from '../lib/format';
import { CRITERIA, DOC_KIND_LABEL, INTERNSHIP_STATUS_LABEL, ISSUE_TYPE_LABEL } from '../lib/labels';
import type { Evaluation, InternshipDetail, InternshipStatus, IssueStatus, IssueType, Severity, Task } from '../lib/types';
import { InternshipFormModal } from './InternshipsPage';

interface Summary {
  tasks: { total: number; done: number; overdue: number; onTime: number; successRate: number; onTimeRate: number; estimatedHours: number; list: Task[] };
  issues: { total: number; resolved: number; avgResolutionDays: number | null; byType: Record<string, number>; list: { id: number; title: string; type: IssueType; severity: Severity; status: IssueStatus; reportedAt: string }[] };
  evaluations: { count: number; overall: number | null; criteriaAverages: Record<string, number | null>; list: Evaluation[] };
}

function EvaluationModal({ open, onClose, internshipId, onDone }: { open: boolean; onClose: () => void; internshipId: number; onDone: () => void }) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [date, setDate] = useState(todayISO());
  const [isFinal, setIsFinal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setScores({}); setComment(''); setDate(todayISO()); setIsFinal(false); setError(null); } }, [open]);
  const avg = Object.values(scores).length === 5 ? Math.round((Object.values(scores).reduce((a, b) => a + b, 0) / 5) * 10) / 10 : null;
  const save = useMutation({
    mutationFn: () => api.post('/evaluations', { internshipId, evalDate: date, comment: comment || null, isFinal, ...scores }),
    onSuccess: () => { toast.success('Évaluation enregistrée, le stagiaire est notifié'); onDone(); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Fiche d’évaluation"
      description="Notez chaque critère de 1 (insuffisant) à 5 (excellent)."
      footer={
        <>
          {avg !== null && <span className="mr-auto self-center text-sm text-ink-600">Moyenne : <strong className="text-brand-700">{avg} / 5</strong></span>}
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button onClick={() => (Object.keys(scores).length < 5 ? setError('Notez les cinq critères.') : save.mutate())} loading={save.isPending}>Enregistrer l’évaluation</Button>
        </>
      }
    >
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      <div className="divide-y divide-ink-100">
        {CRITERIA.map((c) => (
          <fieldset key={c.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
            <legend className="sr-only">{c.label}</legend>
            <div className="sm:w-56">
              <p className="text-sm font-bold">{c.label}</p>
              <p className="text-xs text-ink-500">{c.hint}</p>
            </div>
            <div className="flex gap-1.5" role="radiogroup" aria-label={c.label}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={scores[c.key] === n}
                  onClick={() => setScores({ ...scores, [c.key]: n })}
                  className={clsx(
                    'h-10 w-10 rounded-lg text-sm font-bold ring-1 ring-inset transition',
                    scores[c.key] === n ? 'bg-brand-600 text-white ring-brand-600' : scores[c.key] && n < scores[c.key] ? 'bg-brand-100 text-brand-800 ring-brand-200' : 'bg-white text-ink-600 ring-ink-200 hover:ring-brand-300',
                  )}
                >
                  {n}
                </button>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_180px]">
        <Field label="Commentaire">{(id) => <Textarea id={id} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Points forts, axes de progression, conseils" />}</Field>
        <div className="space-y-4">
          <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
          <Checkbox label="Évaluation finale" checked={isFinal} onChange={(e) => setIsFinal(e.target.checked)} />
        </div>
      </div>
    </Modal>
  );
}

function DelegateModal({ open, onClose, internship, onDone }: { open: boolean; onClose: () => void; internship: InternshipDetail; onDone: () => void }) {
  const staff = useUsers({ status: 'active' });
  const [delegateId, setDelegateId] = useState('');
  const [until, setUntil] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setDelegateId(''); setUntil(''); setError(null); } }, [open]);
  const save = useMutation({
    mutationFn: () => api.post(`/internships/${internship.id}/delegate`, { delegateId: Number(delegateId), until: until || null }),
    onSuccess: () => { toast.success('Suivi délégué'); onDone(); onClose(); },
    onError: (e) => setError(errorMessage(e)),
  });
  const options = (staff.data ?? []).filter((u) => ['tutor', 'employee', 'admin'].includes(u.role) && u.id !== internship.tutorId);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Déléguer le suivi"
      description={`En cas d’absence, confiez temporairement le suivi de ${fullName(internship.intern)} à un collègue.`}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!delegateId} onClick={() => save.mutate()} loading={save.isPending}>Déléguer</Button></>}
    >
      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      <div className="space-y-4">
        <Field label="Délégué" required>
          {(id) => (
            <Select id={id} value={delegateId} onChange={(e) => setDelegateId(e.target.value)}>
              <option value="">Choisir un tuteur ou un employé…</option>
              {options.map((u) => <option key={u.id} value={u.id}>{fullName(u)} ({u.jobTitle ?? u.role})</option>)}
            </Select>
          )}
        </Field>
        <Field label="Jusqu’au" hint="Laissez vide pour une délégation sans date de fin.">{(id) => <Input id={id} type="date" value={until} onChange={(e) => setUntil(e.target.value)} />}</Field>
      </div>
    </Modal>
  );
}

export default function InternshipDetailPage() {
  const { id } = useParams();
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const [tab, setTab] = useState<'summary' | 'tasks' | 'issues' | 'evaluations' | 'documents' | 'history'>('summary');
  const [evalOpen, setEvalOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [nextStatus, setNextStatus] = useState<InternshipStatus | null>(null);
  const [statusNote, setStatusNote] = useState('');
  const [docKind, setDocKind] = useState('convention');
  const fileRef = useRef<HTMLInputElement>(null);

  const q = useQuery({ queryKey: ['internship', id], queryFn: async () => (await api.get<InternshipDetail>(`/internships/${id}`)).data });
  const summary = useQuery({ queryKey: ['internship', id, 'summary'], queryFn: async () => (await api.get<Summary>(`/internships/${id}/summary`)).data });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['internship', id] }); qc.invalidateQueries({ queryKey: ['internships'] }); };

  const changeStatus = useMutation({
    mutationFn: () => api.patch(`/internships/${id}/status`, { status: nextStatus, note: statusNote || undefined }),
    onSuccess: () => { toast.success(`Stage : ${INTERNSHIP_STATUS_LABEL[nextStatus!].toLowerCase()}`); setNextStatus(null); setStatusNote(''); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const endDelegation = useMutation({ mutationFn: () => api.delete(`/internships/${id}/delegate`), onSuccess: () => { toast.success('Délégation terminée'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const uploadDoc = useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append('file', file); fd.append('kind', docKind); return api.post(`/internships/${id}/documents`, fd); },
    onSuccess: () => { toast.success('Document déposé'); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const deleteDoc = useMutation({ mutationFn: (docId: number) => api.delete(`/internships/${id}/documents/${docId}`), onSuccess: refresh, onError: (e) => toast.error(errorMessage(e)) });

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const s = q.data;
  const sm = summary.data;
  const canEvaluate = s.canManage && s.status !== 'upcoming';
  const exportReport = (format: 'pdf' | 'xlsx') => download(`/reports/export?type=internship&id=${s.id}&format=${format}`).catch((e) => toast.error(errorMessage(e)));

  return (
    <>
      <Link to="/stages" className="mb-3 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-500 hover:text-brand-700">‹ Stages</Link>
      <div className="mb-6 rounded-xl border border-ink-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          <Avatar user={s.intern} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-extrabold tracking-tight">{fullName(s.intern)}</h1>
              <InternshipBadge status={s.status} />
            </div>
            <p className="mt-1 text-[15px] font-semibold text-ink-700">{s.subject}</p>
            <p className="mt-1 text-sm text-ink-500">{s.school} · du {fmtDate(s.startDate)} au {fmtDate(s.endDate)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <span className="flex items-center gap-2"><Avatar user={s.tutor} size="xs" /><span className="text-ink-500">Tuteur</span> <strong className="font-semibold">{fullName(s.tutor)}</strong></span>
              {s.delegate && (
                <span className="flex items-center gap-2 rounded-lg bg-brand-50 px-2 py-1 text-brand-900">
                  <UserCog className="h-4 w-4" /> Suivi délégué à <strong className="font-semibold">{fullName(s.delegate)}</strong>{s.delegateUntil && ` jusqu’au ${fmtDate(s.delegateUntil)}`}
                  {(user?.role === 'admin' || user?.id === s.tutorId) && <button onClick={() => endDelegation.mutate()} className="ml-1 text-xs font-semibold underline">Mettre fin</button>}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {canEvaluate && <Button icon={<Star className="h-4 w-4" />} onClick={() => setEvalOpen(true)}>Évaluer</Button>}
            {isManager && (
              <>
                <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => exportReport('pdf')}>Bilan PDF</Button>
                <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => exportReport('xlsx')}>Excel</Button>
              </>
            )}
            {s.canManage && isManager && <Button variant="ghost" size="icon" onClick={() => setEditOpen(true)} aria-label="Modifier le stage"><Pencil className="h-4 w-4" /></Button>}
          </div>
        </div>
        {s.canManage && (s.allowedTransitions.length > 0 || (isManager && !s.delegate)) && (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
            {s.allowedTransitions.length > 0 && <span className="mr-1 text-[13px] font-semibold text-ink-600">Changer le statut :</span>}
            {s.allowedTransitions.map((t) => (
              <Button key={t} size="sm" variant="secondary" onClick={() => setNextStatus(t)}>{INTERNSHIP_STATUS_LABEL[t]}</Button>
            ))}
            {(user?.role === 'admin' || user?.id === s.tutorId) && !s.delegate && (
              <Button size="sm" variant="ghost" className="ml-auto" icon={<UserCog className="h-4 w-4" />} onClick={() => setDelegateOpen(true)}>Déléguer le suivi</Button>
            )}
          </div>
        )}
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'summary', label: 'Bilan' },
          { value: 'tasks', label: 'Tâches', count: sm?.tasks.total },
          { value: 'issues', label: 'Difficultés', count: sm?.issues.total },
          { value: 'evaluations', label: 'Évaluations', count: sm?.evaluations.count },
          { value: 'documents', label: 'Documents', count: s.documents.length },
          { value: 'history', label: 'Historique' },
        ]}
      />

      {tab === 'summary' && (
        !sm ? <PageLoader /> : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Stat label="Tâches réalisées" value={`${sm.tasks.done}/${sm.tasks.total}`} context={`Taux de réussite ${sm.tasks.successRate} %`} tone="brand" />
              <Stat label="Dans les délais" value={`${sm.tasks.onTimeRate} %`} context={`${sm.tasks.overdue} tâche(s) en retard`} tone={sm.tasks.overdue ? 'alert' : 'default'} />
              <Stat label="Difficultés" value={sm.issues.total} context={`${sm.issues.resolved} résolue(s)${sm.issues.avgResolutionDays !== null ? `, en ${sm.issues.avgResolutionDays} j en moyenne` : ''}`} />
              <Stat label="Moyenne des évaluations" value={sm.evaluations.overall !== null ? `${sm.evaluations.overall}/5` : '—'} context={`${sm.evaluations.count} évaluation(s)`} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel title="Objectifs pédagogiques"><p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{s.objectives}</p></Panel>
              <Panel title="Évaluation par critère" description="Moyenne de toutes les évaluations">
                <ul className="space-y-3">
                  {CRITERIA.map((c) => {
                    const v = sm.evaluations.criteriaAverages[c.key];
                    return (
                      <li key={c.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-semibold text-ink-800">{c.label}</span>
                        <span className="flex items-center gap-3">{v !== null ? <><ScoreDots value={v} /><strong className="w-8 text-right tabular-nums">{v}</strong></> : <span className="text-ink-400">Non évalué</span>}</span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </div>
            <Panel title="Informations du stage">
              <DescriptionList items={[
                { label: 'Établissement', value: s.school },
                { label: 'Période', value: `${fmtDate(s.startDate)} au ${fmtDate(s.endDate)}` },
                { label: 'Contact du stagiaire', value: <>{s.intern.email}{s.intern.phone && ` · ${s.intern.phone}`}</> },
                { label: 'Charge estimée', value: `${sm.tasks.estimatedHours} h sur l’ensemble des tâches` },
              ]} />
            </Panel>
          </div>
        )
      )}

      {tab === 'tasks' && (
        <Panel bodyClassName="p-0">
          {sm?.tasks.list.length ? <div className="divide-y divide-ink-100">{sm.tasks.list.map((t) => <TaskRow key={t.id} task={{ ...t, assignees: [], commentCount: 0, openIssueCount: 0, isOverdue: !!(t.dueDate && t.status !== 'done' && t.dueDate < todayISO()), isDueSoon: false } as Task} />)}</div>
            : <EmptyState title="Aucune tâche">Les tâches confiées au stagiaire apparaîtront ici.</EmptyState>}
        </Panel>
      )}

      {tab === 'issues' && (
        <Panel bodyClassName="p-0">
          {sm?.issues.list.length ? (
            <ul className="divide-y divide-ink-100">
              {sm.issues.list.map((i) => (
                <li key={i.id}>
                  <Link to={`/difficultes/${i.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-ink-50">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{i.title}</p>
                      <p className="text-xs text-ink-500">{ISSUE_TYPE_LABEL[i.type]} · {fmtAgo(i.reportedAt)}</p>
                    </div>
                    <SeverityBadge severity={i.severity} />
                    <IssueStatusBadge status={i.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : <EmptyState title="Aucune difficulté signalée" />}
        </Panel>
      )}

      {tab === 'evaluations' && (
        <div className="space-y-4">
          {canEvaluate && <div className="flex justify-end"><Button icon={<Star className="h-4 w-4" />} onClick={() => setEvalOpen(true)}>Nouvelle évaluation</Button></div>}
          {sm?.evaluations.list.length ? [...sm.evaluations.list].reverse().map((e) => (
            <Panel key={e.id} title={<span className="flex items-center gap-2">Évaluation du {fmtDate(e.evalDate)}{e.isFinal && <span className="rounded bg-brand-600 px-1.5 py-0.5 text-2xs font-bold text-white">Finale</span>}</span>} description={`Par ${e.evaluatorName}`} actions={<span className="text-2xl font-extrabold tabular-nums text-brand-700">{e.average}<span className="text-sm text-ink-400">/5</span></span>}>
              <div className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
                {CRITERIA.map((c) => (
                  <div key={c.key} className="flex items-center justify-between text-sm"><span className="text-ink-600">{c.label}</span><span className="flex items-center gap-2"><ScoreDots value={e[c.key]} /><strong className="w-4 tabular-nums">{e[c.key]}</strong></span></div>
                ))}
              </div>
              {e.comment && <p className="mt-4 rounded-lg bg-ink-50 px-4 py-3 text-sm leading-relaxed text-ink-700">{e.comment}</p>}
            </Panel>
          )) : <div className="rounded-xl border border-ink-200 bg-white"><EmptyState icon={<Star className="h-5 w-5" />} title="Aucune évaluation">Les évaluations périodiques notent l’assiduité, la qualité, l’autonomie, la communication et le respect des délais.</EmptyState></div>}
        </div>
      )}

      {tab === 'documents' && (
        <Panel
          title="Convention, attestation et rapports"
          actions={
            <>
              <Select value={docKind} onChange={(e) => setDocKind(e.target.value)} className="h-9 w-40" aria-label="Type de document">
                {Object.entries(DOC_KIND_LABEL).filter(([k]) => user?.role !== 'intern' || k !== 'attestation').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
              <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc.mutate(f); e.target.value = ''; }} />
              <Button size="sm" icon={<Upload className="h-4 w-4" />} loading={uploadDoc.isPending} onClick={() => fileRef.current?.click()}>Déposer</Button>
            </>
          }
          bodyClassName="p-0"
        >
          {s.documents.length ? (
            <ul className="divide-y divide-ink-100">
              {s.documents.map((d) => (
                <li key={d.id} className="flex items-center gap-3 px-5 py-3">
                  <FileText className="h-5 w-5 text-brand-500" />
                  <button className="min-w-0 flex-1 text-left" onClick={() => download(`/internships/${s.id}/documents/${d.id}`, d.fileName).catch((e) => toast.error(errorMessage(e)))}>
                    <p className="truncate text-sm font-semibold hover:text-brand-700">{d.fileName}</p>
                    <p className="text-xs text-ink-500">{DOC_KIND_LABEL[d.kind] ?? d.kind} · {fileSize(d.size)} · {d.uploadedByName}, {fmtAgo(d.uploadedAt)}</p>
                  </button>
                  <Button variant="ghost" size="icon" onClick={() => deleteDoc.mutate(d.id)} aria-label={`Supprimer ${d.fileName}`}><Trash2 className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={<FileText className="h-5 w-5" />} title="Aucun document">Déposez la convention de stage, les rapports et l’attestation de fin de stage.</EmptyState>}
        </Panel>
      )}

      {tab === 'history' && (
        <Panel title="Historique des statuts">
          <ol className="space-y-3">
            {s.history.map((h) => (
              <li key={h.id} className="flex gap-4 text-sm">
                <span className="w-40 shrink-0 tabular-nums text-ink-400">{fmtDateTime(h.changedAt)}</span>
                <span>
                  {h.fromStatus ? <>{INTERNSHIP_STATUS_LABEL[h.fromStatus]} → </> : null}<strong className="font-semibold">{INTERNSHIP_STATUS_LABEL[h.toStatus]}</strong>
                  {h.note && <span className="text-ink-500"> · {h.note}</span>}
                  {h.changedByName && <span className="text-ink-500"> · {h.changedByName}</span>}
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      )}

      <EvaluationModal open={evalOpen} onClose={() => setEvalOpen(false)} internshipId={s.id} onDone={() => { refresh(); summary.refetch(); }} />
      <InternshipFormModal open={editOpen} onClose={() => setEditOpen(false)} internship={s} />
      <DelegateModal open={delegateOpen} onClose={() => setDelegateOpen(false)} internship={s} onDone={refresh} />
      <ConfirmDialog
        open={!!nextStatus}
        onClose={() => setNextStatus(null)}
        onConfirm={() => changeStatus.mutate()}
        loading={changeStatus.isPending}
        title={`Passer le stage en « ${nextStatus ? INTERNSHIP_STATUS_LABEL[nextStatus] : ''} » ?`}
        message={
          <div className="space-y-3">
            <p>Le changement est enregistré dans l’historique et notifié au stagiaire et au tuteur.</p>
            <Input value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder="Motif (facultatif)" aria-label="Motif" />
          </div>
        }
        confirmLabel="Confirmer"
      />
    </>
  );
}
