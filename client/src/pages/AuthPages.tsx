import { useMutation } from '@tanstack/react-query';
import { ArrowLeft, Eye, EyeOff, MailCheck } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorCode, errorMessage } from '../api/client';
import { Logo } from '../components/layout/Logo';
import { Button, Field, Input } from '../components/ui';
import { useAuth } from '../lib/auth';

const SHOW_DEMO = import.meta.env.VITE_SHOW_DEMO !== 'false';
const DEMO = [
  { email: 'admin@teamtrack.app', role: 'Administratrice RH' },
  { email: 'samuel.ndjock@teamtrack.app', role: 'Tuteur, chef d’équipe' },
  { email: 'nadia.kamdem@teamtrack.app', role: 'Employée' },
  { email: 'kevin.mballa@teamtrack.app', role: 'Stagiaire' },
];

/** Illustration : un tableau Kanban miniature dont les cartes se rangent au chargement. */
function BoardIllustration() {
  const cols = [
    { label: 'À faire', cards: [62, 44] },
    { label: 'En cours', cards: [78, 52, 36] },
    { label: 'En revue', cards: [58] },
    { label: 'Terminé', cards: [70, 48, 64] },
  ];
  return (
    <div className="grid grid-cols-4 gap-3" aria-hidden>
      {cols.map((c, ci) => (
        <div key={c.label} className="rounded-xl bg-white/[0.06] p-2.5">
          <div className="mb-2.5 flex items-center justify-between px-0.5">
            <span className="text-[11px] font-semibold text-brand-200">{c.label}</span>
            <span className="text-[10px] font-bold tabular-nums text-brand-300/70">{c.cards.length}</span>
          </div>
          <div className="space-y-2">
            {c.cards.map((w, i) => (
              <div
                key={i}
                className="animate-pop-in rounded-lg bg-white/[0.94] p-2.5 shadow-lg shadow-brand-950/30"
                style={{ animationDelay: `${120 + ci * 90 + i * 70}ms`, animationFillMode: 'backwards' }}
              >
                <div className="h-1.5 rounded-full bg-ink-200" style={{ width: `${w}%` }} />
                <div className="mt-1.5 h-1.5 w-1/2 rounded-full bg-ink-100" />
                <div className="mt-3 flex items-center justify-between">
                  <span className={`h-4 w-4 rounded-full ${ci === 3 ? 'bg-brand-700' : 'bg-brand-200'}`} />
                  <span className="h-1 w-8 overflow-hidden rounded-full bg-ink-100">
                    <span className="block h-full bg-brand-500" style={{ width: `${ci === 3 ? 100 : ci * 30 + 20}%` }} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-brand-950 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '44px 44px' }}
        />
        <Logo light />
        <div className="relative">
          <h1 className="max-w-md text-[40px] font-extrabold leading-[1.08] tracking-tight text-white">
            Chaque tâche a un responsable, chaque blocage une réponse.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-brand-200/90">
            Déléguez le travail, suivez l’avancement de vos équipes et de vos stagiaires, et traitez les difficultés avant qu’elles ne deviennent des retards.
          </p>
          <div className="mt-10 max-w-xl">
            <BoardIllustration />
          </div>
        </div>
        <p className="relative text-xs text-brand-300/70">TeamTrack v1.0 · Gestion du personnel et des stagiaires</p>
      </div>
      <div className="flex items-center justify-center bg-white px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Logo />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<{ message: string; locked: boolean } | null>(null);

  const mutation = useMutation({
    mutationFn: () => login(email.trim(), password),
    onSuccess: () => navigate((location.state as { from?: string })?.from ?? '/', { replace: true }),
    onError: (e) => setError({ message: errorMessage(e, 'Connexion impossible.'), locked: errorCode(e) === 'LOCKED' }),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) return setError({ message: 'Saisissez votre e-mail et votre mot de passe.', locked: false });
    mutation.mutate();
  };

  return (
    <AuthShell>
      <h2 className="text-2xl font-extrabold tracking-tight">Connexion</h2>
      <p className="mt-1 text-sm text-ink-500">Accédez à votre espace TeamTrack.</p>
      <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
        {error && (
          <div className={`rounded-lg px-3 py-2.5 text-sm font-medium ${error.locked ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-700'}`} role="alert">
            {error.message}
          </div>
        )}
        <Field label="Adresse e-mail">
          {(id) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom.nom@entreprise.com" autoFocus />}
        </Field>
        <Field label="Mot de passe">
          {(id) => (
            <div className="relative">
              <Input id={id} type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-ink-400 hover:text-ink-700" aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          )}
        </Field>
        <div className="flex justify-end">
          <Link to="/mot-de-passe-oublie" className="text-[13px] font-semibold text-brand-700 hover:underline">Mot de passe oublié ?</Link>
        </div>
        <Button type="submit" className="w-full justify-center" loading={mutation.isPending}>Se connecter</Button>
      </form>

      {SHOW_DEMO && (
        <div className="mt-10 border-t border-ink-100 pt-6">
          <p className="text-[13px] font-semibold text-ink-700">Comptes de démonstration</p>
          <p className="mt-0.5 text-xs text-ink-500">Mot de passe : <code className="rounded bg-ink-100 px-1 font-semibold">TeamTrack@2026</code></p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => { setEmail(d.email); setPassword('TeamTrack@2026'); setError(null); }}
                className="rounded-lg px-3 py-2 text-left ring-1 ring-inset ring-ink-200 transition hover:bg-brand-50 hover:ring-brand-300"
              >
                <span className="block text-xs font-bold text-ink-800">{d.role}</span>
                <span className="block truncate text-2xs text-ink-500">{d.email}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.post('/auth/forgot-password', { email }),
    onSuccess: () => setSent(true),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <AuthShell>
      <Link to="/connexion" className="mb-6 inline-flex items-center gap-1 text-[13px] font-semibold text-ink-500 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> Retour à la connexion
      </Link>
      {sent ? (
        <div>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><MailCheck className="h-5 w-5" /></div>
          <h2 className="text-2xl font-extrabold tracking-tight">Vérifiez votre messagerie</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Si un compte correspond à <strong>{email}</strong>, vous allez recevoir un lien pour choisir un nouveau mot de passe. Il est valable 30 minutes.
          </p>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-extrabold tracking-tight">Mot de passe oublié</h2>
          <p className="mt-1 text-sm text-ink-500">Indiquez votre adresse e-mail professionnelle pour recevoir un lien de réinitialisation.</p>
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              mutation.mutate();
            }}
          >
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">{error}</p>}
            <Field label="Adresse e-mail">
              {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />}
            </Field>
            <Button type="submit" className="w-full justify-center" loading={mutation.isPending}>Envoyer le lien</Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: () => api.post('/auth/reset-password', { token: params.get('token'), password }),
    onSuccess: () => navigate('/connexion', { replace: true }),
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <AuthShell>
      <h2 className="text-2xl font-extrabold tracking-tight">Nouveau mot de passe</h2>
      <p className="mt-1 text-sm text-ink-500">Au moins 8 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial.</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (password !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
          mutation.mutate();
        }}
      >
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">{error}</p>}
        <Field label="Nouveau mot de passe">{(id) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}</Field>
        <Field label="Confirmation">{(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />}</Field>
        <Button type="submit" className="w-full justify-center" loading={mutation.isPending}>Enregistrer le mot de passe</Button>
      </form>
    </AuthShell>
  );
}
