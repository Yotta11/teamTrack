import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GraduationCap, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { Avatar, Button, EmptyState, ErrorState, Field, Input, InternshipBadge, Modal, PageHeader, PageLoader, ProgressBar, Select, Textarea } from '../components/ui';
import { useUsers } from '../hooks/queries';
import { useAuth } from '../lib/auth';
import { fmtDate, fullName, plusDaysISO } from '../lib/format';
import { INTERNSHIP_STATUS_LABEL } from '../lib/labels';
import type { Internship, InternshipStatus } from '../lib/types';

export function InternshipFormModal({ open, onClose, internship }: { open: boolean; onClose: () => void; internship?: Internship }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const interns = useUsers({ role: 'intern', status: 'active' });
  const tutors = useUsers({ role: 'tutor', status: 'active' });
  const [f, setF] = useState({ internId: '', tutorId: '', school: '', subject: '', objectives: '', startDate: plusDaysISO(7), endDate: plusDaysISO(97) });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    setF(
      internship
        ? { internId: String(internship.internId), tutorId: String(internship.tutorId), school: internship.school, subject: internship.subject, objectives: internship.objectives, startDate: internship.startDate, endDate: internship.endDate }
        : { internId: '', tutorId: user?.role === 'tutor' ? String(user.id) : '', school: '', subject: '', objectives: '', startDate: plusDaysISO(7), endDate: plusDaysISO(97) },
    );
  }, [open, internship, user]);
  const save = useMutation({
    mutationFn: async () => {
      const body = { ...f, internId: Number(f.internId), tutorId: Number(f.tutorId) };
      return internship ? (await api.put<Internship>(`/internships/${internship.id}`, body)).data : (await api.post<Internship>('/internships', body)).data;
    },
    onSuccess: (s) => {
      qc.invalidateQueries({ queryKey: ['internships'] });
      qc.invalidateQueries({ queryKey: ['internship'] });
      toast.success(internship ? 'Stage mis à jour' : 'Stage créé, le stagiaire et le tuteur sont prévenus');
      onClose();
      if (!internship) navigate(`/stages/${s.id}`);
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={internship ? 'Modifier le stage' : 'Nouveau stage'}
      description="Le stagiaire doit avoir un tuteur référent actif pendant toute la durée du stage."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{internship ? 'Enregistrer' : 'Créer le stage'}</Button></>}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Stagiaire" required>
            {(id) => (
              <Select id={id} value={f.internId} onChange={up('internId')}>
                <option value="">Choisir…</option>
                {(interns.data ?? []).map((u) => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Tuteur référent" required>
            {(id) => (
              <Select id={id} value={f.tutorId} onChange={up('tutorId')} disabled={user?.role === 'tutor'}>
                <option value="">Choisir…</option>
                {(tutors.data ?? []).map((u) => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Établissement" required>{(id) => <Input id={id} value={f.school} onChange={up('school')} placeholder="Université, école, institut…" />}</Field>
        <Field label="Sujet du stage" required>{(id) => <Input id={id} value={f.subject} onChange={up('subject')} />}</Field>
        <Field label="Objectifs pédagogiques" required hint="Un objectif par ligne">{(id) => <Textarea id={id} rows={4} value={f.objectives} onChange={up('objectives')} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Début" required>{(id) => <Input id={id} type="date" value={f.startDate} onChange={up('startDate')} />}</Field>
          <Field label="Fin" required>{(id) => <Input id={id} type="date" value={f.endDate} onChange={up('endDate')} />}</Field>
        </div>
      </div>
    </Modal>
  );
}

export default function InternshipsPage() {
  const { isManager, user } = useAuth();
  const [status, setStatus] = useState<InternshipStatus | ''>('');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const q = useQuery({
    queryKey: ['internships', status, search],
    queryFn: async () => (await api.get<Internship[]>('/internships', { params: { status: status || undefined, search: search || undefined } })).data,
  });
  return (
    <>
      <PageHeader
        title={user?.role === 'intern' ? 'Mon stage' : 'Stages'}
        description={isManager ? 'Encadrement des stagiaires : objectifs, avancement, difficultés et évaluations.' : undefined}
        actions={isManager && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Nouveau stage</Button>}
      />
      {user?.role !== 'intern' && (
        <div className="mb-5 flex flex-wrap gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Stagiaire, sujet, établissement" className="pl-9" aria-label="Rechercher un stage" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value as InternshipStatus)} className="w-48" aria-label="Statut">
            <option value="">Tous les statuts</option>
            {(Object.keys(INTERNSHIP_STATUS_LABEL) as InternshipStatus[]).map((s) => <option key={s} value={s}>{INTERNSHIP_STATUS_LABEL[s]}</option>)}
          </Select>
        </div>
      )}
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <div className="rounded-xl border border-ink-200 bg-white">
          <EmptyState icon={<GraduationCap className="h-5 w-5" />} title="Aucun stage" action={isManager && <Button onClick={() => setCreateOpen(true)}>Créer un stage</Button>}>
            {isManager ? 'Créez un stage pour définir le stagiaire, son tuteur, la période et les objectifs.' : 'Aucun stage ne vous est rattaché.'}
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {q.data.map((s) => (
            <Link key={s.id} to={`/stages/${s.id}`} className="group flex flex-col rounded-xl border border-ink-200/80 bg-white p-5 shadow-card transition hover:border-brand-300">
              <div className="flex items-start gap-3">
                <Avatar user={s.intern} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink-900 group-hover:text-brand-700">{fullName(s.intern)}</p>
                  <p className="truncate text-xs text-ink-500">{s.school}</p>
                </div>
                <InternshipBadge status={s.status} />
              </div>
              <p className="mt-4 line-clamp-2 text-sm font-semibold leading-snug text-ink-800">{s.subject}</p>
              <p className="mt-1 text-xs text-ink-500">{fmtDate(s.startDate)} au {fmtDate(s.endDate)} · tuteur {fullName(s.tutor)}{s.delegate ? ` (délégué à ${fullName(s.delegate)})` : ''}</p>
              <div className="mt-auto pt-4">
                <div className="mb-1 flex justify-between text-xs text-ink-500"><span>{s.doneCount}/{s.taskCount} tâches terminées</span><span>Avancement moyen</span></div>
                <ProgressBar value={s.avgProgress} showValue size="sm" />
                <div className="mt-3 flex gap-4 border-t border-ink-100 pt-3 text-xs">
                  <span className={s.overdueCount ? 'font-semibold text-red-700' : 'text-ink-500'}>{s.overdueCount} en retard</span>
                  <span className={s.openIssues ? 'font-semibold text-amber-700' : 'text-ink-500'}>{s.openIssues} difficulté(s)</span>
                  <span className="ml-auto text-ink-500">Évaluation <strong className="text-ink-900">{s.evalAverage !== null ? `${s.evalAverage}/5` : '—'}</strong></span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
      <InternshipFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
