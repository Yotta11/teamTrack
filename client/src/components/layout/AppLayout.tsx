import clsx from 'clsx';
import {
  Activity,
  AlertCircle,
  ChevronDown,
  GraduationCap,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Plus,
  Repeat2,
  Settings2,
  ShieldCheck,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { ROLE_LABEL } from '../../lib/labels';
import { fullName } from '../../lib/format';
import type { Role } from '../../lib/types';
import { IssueFormModal, type IssueDefaults } from '../IssueFormModal';
import { TaskFormModal, type TaskDefaults } from '../TaskFormModal';
import { Avatar, Button } from '../ui';
import { Logo } from './Logo';
import { NotificationsMenu } from './NotificationsMenu';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
  end?: boolean;
}

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: 'Pilotage',
    items: [
      { to: '/', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
      { to: '/kanban', label: 'Tableau Kanban', icon: KanbanSquare },
      { to: '/taches', label: 'Tâches', icon: ListChecks },
      { to: '/sprints', label: 'Backlog et sprints', icon: Repeat2, roles: ['admin', 'tutor', 'employee'] },
    ],
  },
  {
    title: 'Suivi',
    items: [
      { to: '/difficultes', label: 'Difficultés', icon: AlertCircle },
      { to: '/stages', label: 'Stages', icon: GraduationCap, roles: ['admin', 'tutor', 'intern', 'employee'] },
      { to: '/equipes', label: 'Équipes', icon: Users },
      { to: '/activite', label: 'Historique', icon: Activity, roles: ['admin', 'tutor'] },
    ],
  },
  {
    title: 'Administration',
    items: [{ to: '/admin', label: 'Administration', icon: ShieldCheck, roles: ['admin'] }],
  },
];

interface QuickActions {
  openTask: (defaults?: TaskDefaults) => void;
  openIssue: (defaults?: IssueDefaults) => void;
}
const QuickActionsContext = createContext<QuickActions>({ openTask: () => undefined, openIssue: () => undefined });
export const useQuickActions = () => useContext(QuickActionsContext);

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  return (
    <nav className="flex h-full flex-col bg-brand-950 text-brand-100" aria-label="Navigation principale">
      <div className="flex h-16 items-center px-5">
        <Logo light />
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV.map((group) => {
          const items = group.items.filter((i) => !i.roles || (user && i.roles.includes(user.role)));
          if (!items.length) return null;
          return (
            <div key={group.title}>
              <p className="mb-1.5 px-3 text-2xs font-semibold text-brand-300/70">{group.title}</p>
              <ul className="space-y-0.5">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        clsx(
                          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                          isActive ? 'bg-white/10 text-white' : 'text-brand-200/80 hover:bg-white/5 hover:text-white',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r bg-brand-400" />}
                          <item.icon className={clsx('h-[18px] w-[18px]', isActive ? 'text-brand-300' : 'text-brand-300/60 group-hover:text-brand-200')} />
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {user && (
        <div className="border-t border-white/10 p-3">
          <NavLink to="/profil" onClick={onNavigate} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
            <Avatar user={user} size="sm" className="ring-brand-950" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{fullName(user)}</span>
              <span className="block truncate text-2xs text-brand-300/80">{ROLE_LABEL[user.role]}</span>
            </span>
          </NavLink>
        </div>
      )}
    </nav>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!user) return null;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-2 hover:bg-ink-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        aria-expanded={open}
        aria-label="Menu du compte"
      >
        <Avatar user={user} size="sm" />
        <ChevronDown className="hidden h-4 w-4 text-ink-500 sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-60 animate-pop-in overflow-hidden rounded-xl border border-ink-200 bg-white py-1 shadow-lift">
          <div className="border-b border-ink-100 px-4 py-3">
            <p className="truncate text-sm font-bold">{fullName(user)}</p>
            <p className="truncate text-xs text-ink-500">{user.email}</p>
          </div>
          <button className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-ink-50" onClick={() => { setOpen(false); navigate('/profil'); }}>
            <UserRound className="h-4 w-4 text-ink-500" /> Mon profil
          </button>
          {user.role === 'admin' && (
            <button className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-ink-50" onClick={() => { setOpen(false); navigate('/admin'); }}>
              <Settings2 className="h-4 w-4 text-ink-500" /> Paramètres
            </button>
          )}
          <button
            className="flex w-full items-center gap-2 border-t border-ink-100 px-4 py-2 text-sm text-ink-700 hover:bg-ink-50"
            onClick={async () => {
              await logout();
              navigate('/connexion');
            }}
          >
            <LogOut className="h-4 w-4 text-ink-500" /> Se déconnecter
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const [mobileNav, setMobileNav] = useState(false);
  const [taskModal, setTaskModal] = useState<{ open: boolean; defaults?: TaskDefaults }>({ open: false });
  const [issueModal, setIssueModal] = useState<{ open: boolean; defaults?: IssueDefaults }>({ open: false });
  const location = useLocation();
  useEffect(() => setMobileNav(false), [location.pathname]);

  const canCreateTask = user?.role !== 'intern';

  return (
    <QuickActionsContext.Provider
      value={{ openTask: (defaults) => setTaskModal({ open: true, defaults }), openIssue: (defaults) => setIssueModal({ open: true, defaults }) }}
    >
      <a href="#contenu" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lift">
        Aller au contenu
      </a>
      <div className="min-h-screen lg:pl-64">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
          <Sidebar />
        </aside>
        {mobileNav && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-brand-950/50" onClick={() => setMobileNav(false)} />
            <div className="absolute inset-y-0 left-0 w-72 animate-slide-in">
              <Sidebar onNavigate={() => setMobileNav(false)} />
              <button className="absolute right-3 top-4 rounded-lg p-1.5 text-white/80 hover:bg-white/10" onClick={() => setMobileNav(false)} aria-label="Fermer le menu">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}

        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-ink-200/80 bg-white/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileNav(true)} aria-label="Ouvrir le menu">
            <Menu className="h-5 w-5" />
          </Button>
          <div className="lg:hidden">
            <Logo />
          </div>
          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <Button variant="secondary" size="sm" icon={<AlertCircle className="h-4 w-4" />} onClick={() => setIssueModal({ open: true })} className="hidden sm:inline-flex">
              Signaler une difficulté
            </Button>
            {canCreateTask && (
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setTaskModal({ open: true })}>
                <span className="hidden sm:inline">Nouvelle tâche</span>
              </Button>
            )}
            <NotificationsMenu />
            <UserMenu />
          </div>
        </header>

        <main id="contenu" className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children ?? <Outlet />}
        </main>
      </div>

      <TaskFormModal open={taskModal.open} defaults={taskModal.defaults} onClose={() => setTaskModal({ open: false })} />
      <IssueFormModal open={issueModal.open} defaults={issueModal.defaults} onClose={() => setIssueModal({ open: false })} />
    </QuickActionsContext.Provider>
  );
}
