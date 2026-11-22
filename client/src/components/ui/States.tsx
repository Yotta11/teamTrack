import { AlertTriangle, Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { errorMessage } from '../../api/client';
import { Button } from './Button';

export const Spinner = ({ className = 'h-5 w-5' }: { className?: string }) => <Loader2 className={`${className} animate-spin text-brand-600`} aria-label="Chargement" />;

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Spinner className="h-6 w-6" />
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>}
      <p className="text-[15px] font-bold text-ink-900">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm text-ink-500">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-white px-6 py-10 text-center">
      <AlertTriangle className="mb-2 h-6 w-6 text-red-500" />
      <p className="text-sm font-semibold text-ink-900">{errorMessage(error, 'Impossible de charger ces données.')}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
