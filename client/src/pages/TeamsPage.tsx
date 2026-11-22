import { useMutation, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Plus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { Avatar, Button, EmptyState, ErrorState, Field, Input, Modal, PageHeader, PageLoader, ProgressBar, Select, Textarea } from '../components/ui';
import { useDepartments, useTeams, useUsers } from '../hooks/queries';
import { useAuth } from '../lib/auth';
import { fullName, pct } from '../lib/format';
import { ROLE_LABEL } from '../lib/labels';
import type { Team } from '../lib/types';

export function TeamFormModal({ open, onClose, team }: { open: boolean; onClose: () => void; team?: Team | null }) {
  const qc = useQueryClient();
  const users = useUsers({ status: 'active' });
  const departments = useDepartments();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [leadId, setLeadId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [members, setMembers] = useState<number[]>([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFilter('');
    setName(team?.name ?? '');
    setDescription(team?.description ?? '');
    setLeadId(team?.leadId ? String(team.leadId) : '');
    setDepartmentId(team?.departmentId ? String(team.departmentId) : '');
    setMembers(team?.members?.map((m) => m.id) ?? []);
  }, [open, team]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { name, description: description || null, leadId: leadId ? Number(leadId) : null, departmentId: departmentId ? Number(departmentId) : null, memberIds: members };
      return team ? api.put(`/teams/${team.id}`, body) : api.post('/teams', body);
    },
    onSuccess: () => {
      toast.success(team ? 'Équipe mise à jour' : 'Équipe créée');
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['team'] });
      qc.invalidateQueries({ queryKey: ['users'] });
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const leads = (users.data ?? []).filter((u) => u.role === 'tutor' || u.role === 'admin');
  const candidates = (users.data ?? []).filter((u) => fullName(u).toLowerCase().includes(filter.toLowerCase()));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={team ? `Modifier ${team.name}` : 'Nouvelle équipe'}
      description="Une personne peut appartenir à plusieurs équipes."
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{team ? 'Enregistrer' : 'Créer l’équipe'}</Button></>}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nom" required>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Département">
            {(id) => (
              <Select id={id} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">Aucun</option>
                {(departments.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Description">{(id) => <Textarea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        <Field label="Chef d’équipe" hint="Tuteur ou administrateur">
          {(id) => (
            <Select id={id} value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">Aucun</option>
              {leads.map((u) => <option key={u.id} value={u.id}>{fullName(u)}</option>)}
            </Select>
          )}
        </Field>
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-700">Membres ({members.length})</legend>
          <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer les personnes" className="mb-2" aria-label="Filtrer les personnes" />
          <div className="grid max-h-60 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {candidates.map((u) => {
              const on = members.includes(u.id) || String(u.id) === leadId;
              return (
                <button
                  type="button"
                  key={u.id}
                  aria-pressed={on}
                  onClick={() => setMembers(members.includes(u.id) ? members.filter((x) => x !== u.id) : [...members, u.id])}
                  className={clsx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ring-1 ring-inset', on ? 'bg-brand-50 ring-brand-400' : 'ring-ink-200 hover:ring-ink-300')}
                >
                  <Avatar user={u} size="xs" />
                  <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-semibold">{fullName(u)}</span><span className="text-2xs text-ink-500">{ROLE_LABEL[u.role]}</span></span>
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

export default function TeamsPage() {
  const { user } = useAuth();
  const q = useTeams(false);
  const [createOpen, setCreateOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="Équipes"
        description="Avancement, charge et retards de chaque équipe."
        actions={user?.role === 'admin' && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Nouvelle équipe</Button>}
      />
      {q.isLoading ? <PageLoader /> : q.error ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.length ? (
        <div className="rounded-xl border border-ink-200 bg-white"><EmptyState icon={<Users className="h-5 w-5" />} title="Aucune équipe" /></div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((t) => (
            <Link key={t.id} to={`/equipes/${t.id}`} className="group rounded-xl border border-ink-200/80 bg-white p-5 shadow-card transition hover:border-brand-300">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold group-hover:text-brand-700">{t.name}</p>
                  <p className="truncate text-xs text-ink-500">{t.departmentName ?? 'Sans département'}</p>
                </div>
                {t.activeSprint && <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-2xs font-bold text-brand-700">{t.activeSprint.name.split('—')[0].trim()}</span>}
              </div>
              {t.description && <p className="mt-3 line-clamp-2 text-sm text-ink-600">{t.description}</p>}
              <div className="mt-4"><ProgressBar value={pct(t.doneCount, t.taskCount)} showValue size="sm" /></div>
              <div className="mt-4 flex items-center justify-between border-t border-ink-100 pt-3 text-xs">
                <span className="flex items-center gap-2">
                  {t.lead && <Avatar user={t.lead} size="xs" />}
                  <span className="text-ink-600">{t.lead ? fullName(t.lead) : 'Sans chef'}</span>
                </span>
                <span className="text-ink-500">
                  {t.memberCount} membres
                  {t.overdueCount > 0 && <strong className="ml-2 font-semibold text-red-700">{t.overdueCount} en retard</strong>}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
      <TeamFormModal open={createOpen} onClose={() => setCreateOpen(false)} />
    </>
  );
}
