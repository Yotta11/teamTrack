import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { PageLoader } from './components/ui';
import { useAuth } from './lib/auth';
import type { Role } from './lib/types';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage } from './pages/AuthPages';
import DashboardPage from './pages/DashboardPage';

const KanbanPage = lazy(() => import('./pages/KanbanPage'));
const TasksPage = lazy(() => import('./pages/TasksPage'));
const TaskDetailPage = lazy(() => import('./pages/TaskDetailPage'));
const SprintsPage = lazy(() => import('./pages/SprintsPage'));
const IssuesPage = lazy(() => import('./pages/IssuesPage'));
const IssueDetailPage = lazy(() => import('./pages/IssueDetailPage'));
const InternshipsPage = lazy(() => import('./pages/InternshipsPage'));
const InternshipDetailPage = lazy(() => import('./pages/InternshipDetailPage'));
const TeamsPage = lazy(() => import('./pages/TeamsPage'));
const TeamDetailPage = lazy(() => import('./pages/TeamDetailPage'));
const PersonPage = lazy(() => import('./pages/PersonPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ActivityPage = lazy(() => import('./pages/ActivityPage'));
const NotificationsPage = lazy(() => import('./pages/NotificationsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex h-screen items-center justify-center"><PageLoader /></div>;
  if (!user) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<GuestOnly><LoginPage /></GuestOnly>} />
      <Route path="/mot-de-passe-oublie" element={<GuestOnly><ForgotPasswordPage /></GuestOnly>} />
      <Route path="/reinitialiser" element={<ResetPasswordPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="kanban" element={<Lazy><KanbanPage /></Lazy>} />
        <Route path="taches" element={<Lazy><TasksPage /></Lazy>} />
        <Route path="taches/:id" element={<Lazy><TaskDetailPage /></Lazy>} />
        <Route path="sprints" element={<RequireAuth roles={['admin', 'tutor', 'employee']}><Lazy><SprintsPage /></Lazy></RequireAuth>} />
        <Route path="difficultes" element={<Lazy><IssuesPage /></Lazy>} />
        <Route path="difficultes/:id" element={<Lazy><IssueDetailPage /></Lazy>} />
        <Route path="stages" element={<Lazy><InternshipsPage /></Lazy>} />
        <Route path="stages/:id" element={<Lazy><InternshipDetailPage /></Lazy>} />
        <Route path="equipes" element={<Lazy><TeamsPage /></Lazy>} />
        <Route path="equipes/:id" element={<Lazy><TeamDetailPage /></Lazy>} />
        <Route path="personnes/:id" element={<Lazy><PersonPage /></Lazy>} />
        <Route path="activite" element={<RequireAuth roles={['admin', 'tutor']}><Lazy><ActivityPage /></Lazy></RequireAuth>} />
        <Route path="admin" element={<RequireAuth roles={['admin']}><Lazy><AdminPage /></Lazy></RequireAuth>} />
        <Route path="profil" element={<Lazy><ProfilePage /></Lazy>} />
        <Route path="notifications" element={<Lazy><NotificationsPage /></Lazy>} />
        <Route path="*" element={<Lazy><NotFoundPage /></Lazy>} />
      </Route>
    </Routes>
  );
}

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}
