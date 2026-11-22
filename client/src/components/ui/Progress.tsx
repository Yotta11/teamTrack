import { cn as clsx } from '../../lib/cn';

export function ProgressBar({ value, className, size = 'md', showValue }: { value: number; className?: string; size?: 'sm' | 'md'; showValue?: boolean }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div
        className={clsx('relative flex-1 overflow-hidden rounded-full bg-ink-100', size === 'sm' ? 'h-1.5' : 'h-2')}
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={clsx('h-full rounded-full transition-[width] duration-500', v === 100 ? 'bg-brand-700' : 'bg-brand-500')} style={{ width: `${v}%` }} />
      </div>
      {showValue && <span className="w-9 text-right text-xs font-bold tabular-nums text-ink-700">{v} %</span>}
    </div>
  );
}

export interface RailSegment {
  key: string;
  label: string;
  value: number;
}

const railShades = ['bg-ink-300', 'bg-brand-300', 'bg-brand-500', 'bg-brand-800'];

/**
 * Rail de répartition : un seul bleu décliné en intensité, du plus clair (à faire)
 * au plus foncé (terminé). Signature visuelle de TeamTrack.
 */
export function StatusRail({ segments, className, legend = true }: { segments: RailSegment[]; className?: string; legend?: boolean }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className={className}>
      <div className="flex h-2.5 gap-[3px] overflow-hidden rounded-full bg-ink-100">
        {total > 0 &&
          segments.map((s, i) =>
            s.value > 0 ? (
              <div key={s.key} className={clsx('h-full first:rounded-l-full last:rounded-r-full', railShades[i % railShades.length])} style={{ flexGrow: s.value }} title={`${s.label} : ${s.value}`} />
            ) : null,
          )}
      </div>
      {legend && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {segments.map((s, i) => (
            <span key={s.key} className="inline-flex items-center gap-1.5 text-xs text-ink-600">
              <span className={clsx('h-2 w-2 rounded-full', railShades[i % railShades.length])} />
              {s.label}
              <span className="font-bold tabular-nums text-ink-900">{s.value}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ScoreDots({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <span className="inline-flex gap-1" aria-label={`${value} sur ${max}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={clsx('h-2 w-2 rounded-full', i < Math.round(value) ? 'bg-brand-600' : 'bg-ink-200')} />
      ))}
    </span>
  );
}
