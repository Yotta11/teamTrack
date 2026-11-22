import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { Avatar, Button, DescriptionList, ErrorState, Field, Input, IssueStatusBadge, PageHeader, PageLoader, Panel, Select, SeverityBadge, Textarea } from '../components/ui';
import { useAuth } from '../lib/auth';
import { fmtAgo, fmtDateTime, fullName } from '../lib/format';
import { ISSUE_STATUS_LABEL, ISSUE_TYPE_LABEL, ROLE_LABEL } from '../lib/labels';
import type { IssueDetail, IssueStatus } from '../lib/types';

const STEPS: IssueStatus[] = ['open', 'analysis', 'in_progress', 'resolved'];

export default function IssueDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['issue', id], queryFn: async () => (await api.get<IssueDetail>(`/issues/${id}`)).data });
  const [statusValue, setStatusValue] = useState<IssueStatus | ''>('');
  const [response, setResponse] = useState('');
  const [action, setAction] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['issue', id] });
    qc.invalidateQueries({ queryKey: ['issues'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const handle = useMutation({
    mutationFn: () => api.patch(`/issues/${id}`, { status: statusValue || undefined, response: response || undefined, actionDecided: action || undefined }),
    onSuccess: () => { toast.success(statusValue === 'resolved' ? 'Difficulté résolue, le déclarant est prévenu' : 'Réponse envoyée'); setResponse(''); setAction(''); setStatusValue(''); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const reply = useMutation({
    mutationFn: () => api.post(`/issues/${id}/responses`, { content: response }),
    onSuccess: () => { toast.success('Message envoyé'); setResponse(''); refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <PageLoader />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const i = q.data;
  const stepIndex = i.status === 'escalated' ? 0 : STEPS.indexOf(i.status);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (i.canHandle) handle.mutate();
    else if (response.trim()) reply.mutate();
  };

  return (
    <>
      <PageHeader
        back={{ to: '/difficultes', label: 'Difficultés' }}
        title={i.title}
        meta={<><SeverityBadge severity={i.severity} /><IssueStatusBadge status={i.status} /><span className="text-xs text-ink-500">{ISSUE_TYPE_LABEL[i.type]} · signalée {fmtAgo(i.reportedAt)}</span></>}
      />

      {/* Parcours de traitement */}
      <ol className="mb-6 grid grid-cols-4 gap-2" aria-label="Avancement du traitement">
        {STEPS.map((s, idx) => (
          <li key={s} className="min-w-0">
            <div className={clsx('h-1.5 rounded-full', idx <= stepIndex ? (i.status === 'resolved' ? 'bg-brand-700' : 'bg-brand-500') : 'bg-ink-200')} />
            <p className={clsx('mt-1.5 truncate text-xs font-semibold', idx <= stepIndex ? 'text-ink-900' : 'text-ink-400')}>{ISSUE_STATUS_LABEL[s]}</p>
          </li>
        ))}
      </ol>
      {i.status === 'escalated' && (
        <p className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
          Cette difficulté a été escaladée à l’administration {i.severity === 'critical' ? 'en raison de sa gravité' : 'faute de traitement sous 3 jours'}.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Panel title="Description">
            <p className="whitespace-pre-line text-sm leading-relaxed text-ink-700">{i.description}</p>
          </Panel>

          <Panel title="Fil de traitement" description="Réponses, actions décidées et changements de statut">
            <ol className="space-y-5">
              {i.responses.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <Avatar user={r.author} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs">
                      <strong className="font-semibold text-ink-900">{fullName(r.author)}</strong>
                      <span className="ml-1.5 text-ink-500">{ROLE_LABEL[r.author.role]}</span>
                      <span className="ml-2 text-ink-400">{fmtDateTime(r.createdAt)}</span>
                    </p>
                    {r.toStatus && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-600">
                        {r.fromStatus && <>{ISSUE_STATUS_LABEL[r.fromStatus]} <ArrowRight className="h-3 w-3" /></>}
                        <IssueStatusBadge status={r.toStatus} />
                      </p>
                    )}
                    {r.content && <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">{r.content}</p>}
                    {r.actionDecided && (
                      <p className="mt-2 flex items-start gap-2 rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-900">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /><span><strong className="font-semibold">Action décidée :</strong> {r.actionDecided}</span>
                      </p>
                    )}
                  </div>
                </li>
              ))}
              {i.responses.length === 0 && <p className="text-sm text-ink-500">En attente d’une première réponse.</p>}
            </ol>

            {(i.canHandle || (i.reporterId === user?.id && i.status !== 'resolved')) && (
              <form onSubmit={submit} className="mt-6 space-y-3 border-t border-ink-100 pt-5">
                <Field label={i.canHandle ? 'Réponse au déclarant' : 'Ajouter une précision'}>
                  {(fid) => <Textarea id={fid} rows={3} value={response} onChange={(e) => setResponse(e.target.value)} placeholder={i.canHandle ? 'Explication, solution proposée, prochaine étape…' : 'Nouvelles informations pour votre responsable'} />}
                </Field>
                {i.canHandle && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Action décidée">{(fid) => <Input id={fid} value={action} onChange={(e) => setAction(e.target.value)} placeholder="Ex. Formation de 2 h planifiée" />}</Field>
                    <Field label="Nouveau statut">
                      {(fid) => (
                        <Select id={fid} value={statusValue} onChange={(e) => setStatusValue(e.target.value as IssueStatus)}>
                          <option value="">Inchangé ({ISSUE_STATUS_LABEL[i.status]})</option>
                          {(['analysis', 'in_progress', 'resolved', 'escalated', 'open'] as IssueStatus[]).filter((s) => s !== i.status).map((s) => <option key={s} value={s}>{ISSUE_STATUS_LABEL[s]}</option>)}
                        </Select>
                      )}
                    </Field>
                  </div>
                )}
                <div className="flex justify-end">
                  <Button type="submit" loading={handle.isPending || reply.isPending} disabled={!response.trim() && !action.trim() && !statusValue}>
                    {statusValue === 'resolved' ? 'Marquer comme résolue' : 'Envoyer'}
                  </Button>
                </div>
              </form>
            )}
          </Panel>
        </div>

        <aside className="space-y-6">
          <Panel title="Informations">
            <div className="mb-4 flex items-center gap-3">
              <Avatar user={i.reporter} size="md" />
              <div>
                <Link to={`/personnes/${i.reporter.id}`} className="text-sm font-bold hover:text-brand-700">{fullName(i.reporter)}</Link>
                <p className="text-xs text-ink-500">{ROLE_LABEL[i.reporter.role]}</p>
              </div>
            </div>
            <DescriptionList
              items={[
                { label: 'Type', value: ISSUE_TYPE_LABEL[i.type] },
                { label: 'Signalée', value: fmtDateTime(i.reportedAt) },
                { label: '1re réponse', value: i.firstResponseAt ? fmtDateTime(i.firstResponseAt) : 'En attente' },
                ...(i.escalatedAt ? [{ label: 'Escaladée', value: fmtDateTime(i.escalatedAt) }] : []),
                ...(i.resolvedAt ? [{ label: 'Résolue', value: fmtDateTime(i.resolvedAt) }] : []),
                { label: 'Tâche', value: i.task ? <Link to={`/taches/${i.task.id}`} className="text-brand-700 hover:underline">{i.task.title}</Link> : '—' },
              ]}
            />
          </Panel>
        </aside>
      </div>
    </>
  );
}
