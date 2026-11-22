import { useMutation } from '@tanstack/react-query';
import { Camera, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { Avatar, Button, DescriptionList, Field, Input, PageHeader, Panel, RoleBadge } from '../components/ui';
import { useAuth } from '../lib/auth';
import { fmtDate } from '../lib/format';

export default function ProfilePage() {
  const { user, reload } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [f, setF] = useState({ firstName: '', lastName: '', phone: '', jobTitle: '' });
  const [skills, setSkills] = useState<string[]>([]);
  const [skill, setSkill] = useState('');
  const [pwd, setPwd] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [pwdError, setPwdError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setF({ firstName: user.firstName, lastName: user.lastName, phone: user.phone ?? '', jobTitle: user.jobTitle ?? '' });
      setSkills(user.skills ?? []);
    }
  }, [user]);

  const save = useMutation({
    mutationFn: () => api.put('/auth/me', { ...f, phone: f.phone || null, jobTitle: f.jobTitle || null, skills }),
    onSuccess: async () => { await reload(); toast.success('Profil enregistré'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const avatar = useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append('avatar', file); return api.post('/auth/me/avatar', fd); },
    onSuccess: async () => { await reload(); toast.success('Photo mise à jour'); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const changePwd = useMutation({
    mutationFn: () => api.post('/auth/me/password', { currentPassword: pwd.currentPassword, newPassword: pwd.newPassword }),
    onSuccess: () => { toast.success('Mot de passe modifié'); setPwd({ currentPassword: '', newPassword: '', confirm: '' }); },
    onError: (e) => setPwdError(errorMessage(e)),
  });

  if (!user) return null;
  const up = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const addSkill = () => {
    const v = skill.trim();
    if (v && !skills.includes(v)) setSkills([...skills, v]);
    setSkill('');
  };

  return (
    <>
      <PageHeader title="Mon profil" description="Vos coordonnées et compétences sont visibles par votre équipe et vos responsables." />
      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Panel>
            <div className="flex flex-col items-center text-center">
              <div className="relative">
                <Avatar user={user} size="lg" className="h-24 w-24 text-2xl" />
                <button onClick={() => fileRef.current?.click()} className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-white ring-4 ring-white hover:bg-brand-700" aria-label="Changer la photo">
                  <Camera className="h-4 w-4" />
                </button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) avatar.mutate(file); e.target.value = ''; }} />
              </div>
              <p className="mt-3 text-lg font-bold">{user.firstName} {user.lastName}</p>
              <p className="text-sm text-ink-500">{user.email}</p>
              <div className="mt-2"><RoleBadge role={user.role} /></div>
            </div>
            <div className="mt-5 border-t border-ink-100 pt-2">
              <DescriptionList items={[
                { label: 'Département', value: user.departmentName ?? '—' },
                { label: 'Équipes', value: user.teams?.map((t) => t.name).join(', ') || '—' },
                { label: 'Limite WIP', value: `${user.wipLimit} tâches en cours` },
                { label: 'Membre depuis', value: fmtDate(user.createdAt) },
              ]} />
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Informations personnelles">
            <form className="space-y-4" onSubmit={(e: FormEvent) => { e.preventDefault(); save.mutate(); }}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Prénom" required>{(id) => <Input id={id} value={f.firstName} onChange={up('firstName')} />}</Field>
                <Field label="Nom" required>{(id) => <Input id={id} value={f.lastName} onChange={up('lastName')} />}</Field>
                <Field label="Poste">{(id) => <Input id={id} value={f.jobTitle} onChange={up('jobTitle')} />}</Field>
                <Field label="Téléphone">{(id) => <Input id={id} value={f.phone} onChange={up('phone')} placeholder="+237 6…" />}</Field>
              </div>
              <Field label="Compétences" hint="Appuyez sur Entrée pour ajouter">
                {(id) => (
                  <div>
                    <Input id={id} value={skill} onChange={(e) => setSkill(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } }} placeholder="Ex. React, Gestion de projet…" />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {skills.map((s) => (
                        <span key={s} className="inline-flex items-center gap-1 rounded-md bg-brand-50 py-1 pl-2 pr-1 text-xs font-semibold text-brand-800">
                          {s}
                          <button type="button" onClick={() => setSkills(skills.filter((x) => x !== s))} className="rounded p-0.5 hover:bg-brand-100" aria-label={`Retirer ${s}`}><X className="h-3 w-3" /></button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Field>
              <div className="flex justify-end"><Button type="submit" loading={save.isPending}>Enregistrer le profil</Button></div>
            </form>
          </Panel>

          <Panel title="Mot de passe" description="Au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial.">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                setPwdError(null);
                if (pwd.newPassword !== pwd.confirm) return setPwdError('Les deux mots de passe ne correspondent pas.');
                changePwd.mutate();
              }}
            >
              {pwdError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{pwdError}</p>}
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Mot de passe actuel">{(id) => <Input id={id} type="password" autoComplete="current-password" value={pwd.currentPassword} onChange={(e) => setPwd({ ...pwd, currentPassword: e.target.value })} />}</Field>
                <Field label="Nouveau">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pwd.newPassword} onChange={(e) => setPwd({ ...pwd, newPassword: e.target.value })} />}</Field>
                <Field label="Confirmation">{(id) => <Input id={id} type="password" autoComplete="new-password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} />}</Field>
              </div>
              <div className="flex justify-end"><Button type="submit" variant="secondary" loading={changePwd.isPending}>Changer le mot de passe</Button></div>
            </form>
          </Panel>
        </div>
      </div>
    </>
  );
}
