import { cn as clsx } from '../../lib/cn';
import type { ReactNode } from 'react';

export function Panel({ title, description, actions, children, className, bodyClassName, id }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}) {
  return (
    <section id={id} className={clsx('rounded-xl border border-ink-200/80 bg-white shadow-card', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-100 px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-bold text-ink-900">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-ink-500">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={clsx('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Chiffre clé : grand nombre, libellé court, contexte optionnel. */
export function Stat({ label, value, context, tone = 'default', icon }: {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  tone?: 'default' | 'alert' | 'brand';
  icon?: ReactNode;
}) {
  return (
    <div className={clsx('rounded-xl border bg-white p-4 shadow-card', tone === 'alert' ? 'border-red-200' : 'border-ink-200/80')}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink-500">{label}</span>
        {icon && <span className={clsx(tone === 'alert' ? 'text-red-500' : 'text-brand-500')}>{icon}</span>}
      </div>
      <div className={clsx('mt-2 text-[28px] font-extrabold leading-none tabular-nums tracking-tight', tone === 'alert' ? 'text-red-700' : tone === 'brand' ? 'text-brand-700' : 'text-ink-900')}>
        {value}
      </div>
      {context && <div className="mt-2 text-xs text-ink-500">{context}</div>}
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-ink-100">
      {items.map((it) => (
        <div key={it.label} className="grid grid-cols-3 gap-3 py-2.5 text-sm">
          <dt className="text-ink-500">{it.label}</dt>
          <dd className="col-span-2 font-medium text-ink-900">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
