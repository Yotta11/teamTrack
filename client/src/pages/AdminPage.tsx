import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FileUp, KeyRound, Pencil, Plus, Search, Trash2, UserCheck, UserX } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { api, download, errorMessage } from '../api/client';
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  PageLoader,
  Panel,
  RoleBadge,
  Select,
  Tabs,
  Textarea,
} from '../components/ui';
import { useDepartments, useTeams, useUsers } from '../hooks/queries';
import { fmtAgo, fullName } from '../lib/format';
import { ROLE_LABEL } from '../lib/labels';
import type { Department, Role, Team, User } from '../lib/types';
import { ActivityTable } from './ActivityPage';
import { TeamFormModal } from './TeamsPage';

const ROLES: Role[] = ['admin', 'tutor', 'employee', 'intern'];

function UserFormModal({ open, onClose, user }: { open: boolean; onClose: () => void; user?: User | null }) {
  const qc = useQueryClient();
  const departments = useDepartments();
  const teams = useTeams(false);
  const empty = { firstName: '', lastName: '', email: '', role: 'employee' as Role, jobTitle: '', phone: '', departmentId: '', wipLimit: '3', teamIds: [] as number[] };
  const [f, setF] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setCreated(null);
    setF(user ? {
      firstName: user.firstName, lastName: user.lastName, email: user.email, role: user.role, jobTitle: user.jobTitle ?? '', phone: user.phone ?? '',
      departmentId: user.departmentId ? String(user.departmentId) : '', wipLimit: String(user.wipLimit), teamIds: user.teams?.map((t) => t.id) ?? [],
    } : empty);
  }, [open, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...f, departmentId: f.departmentId ? Number(f.departmentId) : null, wipLimit: Number(f.wipLimit), jobTitle: f.jobTitle || null, phone: f.phone || null };
      return user ? (await api.put(`/users/${user.id}`, body)).data : (await api.post('/users', body)).data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
      if (!user && data.temporaryPassword) setCreated({ email: f.email, password: data.temporaryPassword });
      else { toast.success('Fiche mise à jour'); onClose(); }
    },
    onError: (e) => setError(errorMessage(e)),
  });
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  if (created) {
    return (
      <Modal open={open} onClose={onClose} title="Compte créé" footer={<Button onClick={onClose}>Terminé</Button>}>
        <p className="text-sm text-ink-700">Un e-mail de bienvenue a été envoyé à <strong>{created.email}</strong> avec ce mot de passe provisoire :</p>
        <p className="mt-3 rounded-lg bg-ink-50 px-4 py-3 text-center font-mono text-lg font-bold tracking-wide">{created.password}</p>
        <p className="mt-3 text-xs text-ink-500">La personne pourra le modifier depuis son profil.</p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={user ? `Modifier ${fullName(user)}` : 'Nouveau compte'}
      description={user ? 'Le changement de rôle est enregistré dans le journal d’audit.' : 'Un mot de passe provisoire est généré et envoyé par e-mail.'}
      footer={<><Button variant="secondary" onClick={onClose}>Annuler</Button><Button onClick={() => save.mutate()} loading={save.isPending}>{user ? 'Enregistrer' : 'Créer le compte'}</Button></>}
    >
      <div className="space-y-4">
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Prénom" required>{(id) => <Input id={id} value={f.firstName} onChange={up('firstName')} />}</Field>
          <Field label="Nom" required>{(id) => <Input id={id} value={f.lastName} onChange={up('lastName')} />}</Field>
          <Field label="E-mail professionnel" required>{(id) => <Input id={id} type="email" value={f.email} onChange={up('email')} />}</Field>
          <Field label="Rôle" required>
            {(id) => <Select id={id} value={f.role} onChange={up('role')}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</Select>}
          </Field>
          <Field label="Poste">{(id) => <Input id={id} value={f.jobTitle} onChange={up('jobTitle')} />}</Field>
          <Field label="Téléphone">{(id) => <Input id={id} value={f.phone} onChange={up('phone')} />}</Field>
          <Field label="Département">
            {(id) => (
              <Select id={id} value={f.departmentId} onChange={up('departmentId')}>
                <option value="">Aucun</option>
                {(departments.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Limite WIP" hint="Tâches en cours simultanées">{(id) => <Input id={id} type="number" min={1} max={20} value={f.wipLimit} onChange={up('wipLimit')} />}</Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-[13px] font-semibold text-ink-700">Équipes</legend>
          <div className="flex flex-wrap gap-1.5">
            {(teams.data ?? []).map((t) => {
              const on = f.teamIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setF({ ...f, teamIds: on ? f.teamIds.filter((x) => x !== t.id) : [...f.teamIds, t.id] })}
                  className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset ${on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-ink-700 ring-ink-200 hover:ring-ink-300'}`}
                >
                  {t.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ created: { email: string; name: string; temporaryPassword: string }[]; errors: { line: number; message: string }[] } | null>(null);
  useEffect(() => { if (open) { setFile(null); setResult(null); } }, [open]);
  const run = useMutation({
    mutationFn: async () => { const fd = new FormData(); fd.append('file', file!); return (await api.post('/users/import', fd)).data; },
    onSuccess: (r) => { setResult(r); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const template = () => {
    const blob = new Blob(['﻿prenom;nom;email;role;poste;departement;equipe\nAmina;Ngono;amina.ngono@entreprise.com;stagiaire;Stagiaire développeuse;Systèmes d’information;Plateforme web\n'], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'modele-import-teamtrack.csv';
    a.click();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Importer des membres"
      description="Fichier CSV (séparateur ; ou ,) avec les colonnes : prenom, nom, email, role, poste, departement, equipe."
      footer={result ? <Button onClick={onClose}>Terminé</Button> : <><Button variant="secondary" onClick={onClose}>Annuler</Button><Button disabled={!file} loading={run.isPending} onClick={() => run.mutate()}>Importer</Button></>}
    >
      {!result ? (
        <div className="space-y-4">
          <button type="button" onClick={() => ref.current?.click()} className="flex w-full flex-col items-center rounded-xl border-2 border-dashed border-ink-200 px-6 py-10 text-center hover:border-brand-300 hover:bg-brand-50/40">
            <FileUp className="mb-2 h-6 w-6 text-brand-500" />
            <span className="text-sm font-semibold">{file ? file.name : 'Choisir un fichier CSV'}</span>
            <span className="mt-1 text-xs text-ink-500">Rôles acceptés : admin, tuteur, employé, stagiaire</span>
          </button>
          <input ref={ref} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={template}>Télécharger le modèle</Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm"><strong>{result.created.length}</strong> compte(s) créé(s), <strong>{result.errors.length}</strong> ligne(s) en erreur. Chaque personne a reçu son mot de passe provisoire par e-mail.</p>
          {result.created.length > 0 && (
            <ul className="max-h-48 divide-y divide-ink-100 overflow-y-auto rounded-lg border border-ink-200 text-sm">
              {result.created.map((c) => <li key={c.email} className="flex justify-between gap-3 px-3 py-2"><span>{c.name} <span className="text-ink-500">{c.email}</span></span><code className="text-xs font-bold">{c.temporaryPassword}</code></li>)}
            </ul>
          )}
          {result.errors.length > 0 && (
            <ul className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {result.errors.map((e) => <li key={e.line}>Ligne {e.line} : {e.message}</li>)}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}

function UsersTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [teamId, setTeamId] = useState('');
  const teams = useTeams(false);
  const users = useUsers({ search: search || undefined, role: role || undefined, status: status || undefined, teamId: teamId || undefined });
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [toggle, setToggle] = useState<User | null>(null);
  const [reset, setReset] = useState<User | null>(null);

  const setActive = useMutation({
    mutationFn: (u: User) => api.patch(`/users/${u.id}/status`, { active: !u.isActive }),
    onSuccess: (_r, u) => { toast.success(u.isActive ? 'Compte désactivé' : 'Compte réactivé'); setToggle(null); qc.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e) => { toast.error(errorMessage(e)); setToggle(null); },
  });
  const resetPwd = useMutation({
    mutationFn: async (u: User) => (await api.post(`/users/${u.id}/reset-password`)).data,
    onSuccess: (d, u) => { toast.success(`Nouveau mot de passe envoyé à ${u.email}`, { description: `Mot de passe provisoire : ${d.temporaryPassword}`, duration: 15000 }); setReset(null); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nom ou e-mail" className="pl-9" aria-label="Rechercher une personne" />
        </div>
        <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-40" aria-label="Rôle">
          <option value="">Tous les rôles</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </Select>
        <Select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-44" aria-label="Équipe">
          <option value="">Toutes les équipes</option>
          {(teams.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-36" aria-label="Statut">
          <option value="">Tous</option>
          <option value="active">Actifs</option>
          <option value="inactive">Désactivés</option>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={() => download('/reports/export?type=users&format=xlsx')}>Excel</Button>
          <Button variant="secondary" size="sm" icon={<FileUp className="h-4 w-4" />} onClick={() => setImportOpen(true)}>Importer un CSV</Button>
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Nouveau compte</Button>
        </div>
      </div>
      {users.isLoading ? <PageLoader /> : (
        <div className="overflow-hidden rounded-xl border border-ink-200/80 bg-white shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-ink-50 text-left text-xs text-ink-500">
                <tr>
                  <th className="px-5 py-2.5 font-semibold">Personne</th>
                  <th className="px-3 py-2.5 font-semibold">Rôle</th>
                  <th className="px-3 py-2.5 font-semibold">Poste et département</th>
                  <th className="px-3 py-2.5 font-semibold">Équipes</th>
                  <th className="px-3 py-2.5 font-semibold">Dernière connexion</th>
                  <th className="px-5 py-2.5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {(users.data ?? []).map((u) => (
                  <tr key={u.id} className={u.isActive ? 'hover:bg-ink-50/70' : 'bg-ink-50/60 text-ink-500'}>
                    <td className="px-5 py-3">
                      <Link to={`/personnes/${u.id}`} className="flex items-center gap-3">
                        <Avatar user={u} size="sm" className={u.isActive ? '' : 'opacity-50'} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold hover:text-brand-700">{fullName(u)}</span>
                          <span className="block truncate text-xs text-ink-500">{u.email}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">{u.isActive ? <RoleBadge role={u.role} /> : <Badge tone="muted">Désactivé</Badge>}</td>
                    <td className="px-3 py-3"><span className="block">{u.jobTitle ?? '—'}</span><span className="text-xs text-ink-500">{u.departmentName ?? ''}</span></td>
                    <td className="px-3 py-3 text-xs text-ink-600">{u.teams?.map((t) => t.name).join(', ') || '—'}</td>
                    <td className="px-3 py-3 text-xs text-ink-500">{u.lastLoginAt ? fmtAgo(u.lastLoginAt) : 'Jamais'}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(u)} aria-label={`Modifier ${fullName(u)}`} title="Modifier"><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setReset(u)} aria-label={`Réinitialiser le mot de passe de ${fullName(u)}`} title="Réinitialiser le mot de passe"><KeyRound className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setToggle(u)} aria-label={u.isActive ? `Désactiver ${fullName(u)}` : `Réactiver ${fullName(u)}`} title={u.isActive ? 'Désactiver' : 'Réactiver'}>
                          {u.isActive ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-ink-100 px-5 py-2.5 text-xs text-ink-500">{users.data?.length ?? 0} personne(s)</p>
        </div>
      )}
      <UserFormModal open={editing !== undefined} onClose={() => setEditing(undefined)} user={editing} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
      <ConfirmDialog
        open={!!toggle}
        onClose={() => setToggle(null)}
        onConfirm={() => toggle && setActive.mutate(toggle)}
        loading={setActive.isPending}
        danger={toggle?.isActive}
        title={toggle?.isActive ? 'Désactiver ce compte ?' : 'Réactiver ce compte ?'}
        message={toggle?.isActive
          ? <>{toggle && fullName(toggle)} ne pourra plus se connecter. Le compte n’est jamais supprimé : son historique (tâches, évaluations, difficultés) est conservé.</>
          : <>{toggle && fullName(toggle)} pourra de nouveau se connecter avec son mot de passe actuel.</>}
        confirmLabel={toggle?.isActive ? 'Désactiver' : 'Réactiver'}
      />
      <ConfirmDialog
        open={!!reset}
        onClose={() => setReset(null)}
        onConfirm={() => reset && resetPwd.mutate(reset)}
        loading={resetPwd.isPending}
        title="Réinitialiser le mot de passe ?"
        message={<>Un mot de passe provisoire sera généré et envoyé à {reset?.email}. Ses sessions ouvertes seront fermées.</>}
        confirmLabel="Réinitialiser"
      />
    </>
  );
}

function DepartmentsTab() {
  const qc = useQueryClient();
  const q = useDepartments();
  const [editing, setEditing] = useState<Department | null | undefined>(undefined);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  useEffect(() => { if (editing !== undefined) { setName(editing?.name ?? ''); setDescription(editing?.description ?? ''); } }, [editing]);
  const save = useMutation({
    mutationFn: () => (editing ? api.put(`/departments/${editing.id}`, { name, description }) : api.post('/departments', { name, description })),
    onSuccess: () => { toast.success('Département enregistré'); qc.invalidateQueries({ queryKey: ['departments'] }); setEditing(undefined); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/departments/${id}`),
    onSuccess: () => { toast.success('Département supprimé'); qc.invalidateQueries({ queryKey: ['departments'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Panel title="Départements" actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Nouveau département</Button>} bodyClassName="p-0">
      {q.isLoading ? <PageLoader /> : !q.data?.length ? <EmptyState title="Aucun département" /> : (
        <ul className="divide-y divide-ink-100">
          {q.data.map((d) => (
            <li key={d.id} className="flex items-center gap-4 px-5 py-3">
              <div className="min-w-0 flex-1"><p className="font-semibold">{d.name}</p><p className="truncate text-xs text-ink-500">{d.description ?? '—'}</p></div>
              <span className="text-xs text-ink-500">{d.memberCount} personne(s) · {d.teamCount} équipe(s)</span>
              <Button variant="ghost" size="icon" onClick={() => setEditing(d)} aria-label={`Modifier ${d.name}`}><Pencil className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => del.mutate(d.id)} aria-label={`Supprimer ${d.name}`}><Trash2 className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <Modal open={editing !== undefined} onClose={() => setEditing(undefined)} title={editing ? 'Modifier le département' : 'Nouveau département'} footer={<><Button variant="secondary" onClick={() => setEditing(undefined)}>Annuler</Button><Button onClick={() => save.mutate()} loading={save.isPending}>Enregistrer</Button></>}>
        <div className="space-y-4">
          <Field label="Nom" required>{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
          <Field label="Description">{(id) => <Textarea id={id} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}</Field>
        </div>
      </Modal>
    </Panel>
  );
}

function TeamsTab() {
  const q = useTeams(false);
  const [editing, setEditing] = useState<Team | null | undefined>(undefined);
  const [detail, setDetail] = useState<Team | null>(null);
  useEffect(() => {
    if (editing) api.get<Team>(`/teams/${editing.id}`).then((r) => setDetail(r.data));
    else setDetail(null);
  }, [editing]);
  return (
    <Panel title="Équipes" actions={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing(null)}>Nouvelle équipe</Button>} bodyClassName="p-0">
      {q.isLoading ? <PageLoader /> : (
        <ul className="divide-y divide-ink-100">
          {(q.data ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-4 px-5 py-3">
              <div className="min-w-0 flex-1">
                <Link to={`/equipes/${t.id}`} className="font-semibold hover:text-brand-700">{t.name}</Link>
                <p className="text-xs text-ink-500">{t.departmentName ?? 'Sans département'} · chef : {t.lead ? fullName(t.lead) : '—'}</p>
              </div>
              <span className="text-xs text-ink-500">{t.memberCount} membre(s)</span>
              <Button variant="ghost" size="icon" onClick={() => setEditing(t)} aria-label={`Modifier ${t.name}`}><Pencil className="h-4 w-4" /></Button>
            </li>
          ))}
        </ul>
      )}
      <TeamFormModal open={editing === null || (!!editing && !!detail)} onClose={() => setEditing(undefined)} team={editing ? detail : null} />
    </Panel>
  );
}

export default function AdminPage() {
  const [tab, setTab] = useState<'users' | 'departments' | 'teams' | 'audit'>('users');
  return (
    <>
      <PageHeader title="Administration" description="Comptes, rôles, départements et équipes. Les comptes ne sont jamais supprimés, ils sont désactivés pour conserver l’historique." />
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'users', label: 'Comptes et rôles' },
          { value: 'teams', label: 'Équipes' },
          { value: 'departments', label: 'Départements' },
          { value: 'audit', label: 'Journal d’audit' },
        ]}
      />
      {tab === 'users' && <UsersTab />}
      {tab === 'teams' && <TeamsTab />}
      {tab === 'departments' && <DepartmentsTab />}
      {tab === 'audit' && (
        <>
          <p className="mb-4 text-sm text-ink-500">Opérations sensibles : connexions, créations de comptes, changements de rôle, réinitialisations de mot de passe, évaluations.</p>
          <ActivityTable audit />
        </>
      )}
    </>
  );
}
