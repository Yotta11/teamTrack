import { cn as clsx } from '../../lib/cn';
import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  INTERNSHIP_STATUS_LABEL,
  ISSUE_STATUS_LABEL,
  PRIORITY_LABEL,
  ROLE_LABEL,
  SEVERITY_LABEL,
  SPRINT_STATUS_LABEL,
  STATUS_LABEL,
} from '../../lib/labels';
import type { InternshipStatus, IssueStatus, Priority, Role, Severity, SprintStatus, TaskStatus } from '../../lib/types';

type Tone = 'neutral' | 'brand' | 'solid' | 'outline' | 'danger' | 'warning' | 'muted';

const tones: Record<Tone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  muted: 'bg-ink-50 text-ink-500 ring-1 ring-inset ring-ink-200',
  brand: 'bg-brand-50 text-brand-700',
  solid: 'bg-brand-600 text-white',
  outline: 'bg-white text-brand-700 ring-1 ring-inset ring-brand-200',
  danger: 'bg-red-50 text-red-700',
  warning: 'bg-amber-50 text-amber-800',
};

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-semibold', tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const statusTone: Record<TaskStatus, Tone> = { backlog: 'muted', todo: 'neutral', in_progress: 'brand', review: 'outline', done: 'solid' };
export const StatusBadge = ({ status }: { status: TaskStatus }) => (
  <Badge tone={statusTone[status]} icon={status === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : undefined}>
    {STATUS_LABEL[status]}
  </Badge>
);

/** Priorité : un repère visuel discret (barres) plutôt qu'une couleur par niveau. */
export function PriorityBadge({ priority, compact }: { priority: Priority; compact?: boolean }) {
  const level = { low: 1, normal: 2, high: 3, urgent: 4 }[priority];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-semibold', priority === 'urgent' ? 'text-red-700' : 'text-ink-600')} title={`Priorité ${PRIORITY_LABEL[priority].toLowerCase()}`}>
      <span className="flex h-3 items-end gap-[2px]" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={clsx('w-[3px] rounded-sm', i <= level ? (priority === 'urgent' ? 'bg-red-600' : 'bg-brand-600') : 'bg-ink-200')}
            style={{ height: `${4 + i * 2}px` }}
          />
        ))}
      </span>
      {!compact && PRIORITY_LABEL[priority]}
    </span>
  );
}

const sevTone: Record<Severity, Tone> = { low: 'neutral', medium: 'warning', critical: 'danger' };
export const SeverityBadge = ({ severity }: { severity: Severity }) => <Badge tone={sevTone[severity]}>{SEVERITY_LABEL[severity]}</Badge>;

const issueTone: Record<IssueStatus, Tone> = { open: 'outline', analysis: 'brand', in_progress: 'brand', resolved: 'solid', escalated: 'danger' };
export const IssueStatusBadge = ({ status }: { status: IssueStatus }) => <Badge tone={issueTone[status]}>{ISSUE_STATUS_LABEL[status]}</Badge>;

const intTone: Record<InternshipStatus, Tone> = { upcoming: 'outline', active: 'brand', suspended: 'warning', completed: 'neutral', evaluated: 'solid' };
export const InternshipBadge = ({ status }: { status: InternshipStatus }) => <Badge tone={intTone[status]}>{INTERNSHIP_STATUS_LABEL[status]}</Badge>;

const sprintTone: Record<SprintStatus, Tone> = { planned: 'outline', active: 'brand', closed: 'neutral' };
export const SprintBadge = ({ status }: { status: SprintStatus }) => <Badge tone={sprintTone[status]}>{SPRINT_STATUS_LABEL[status]}</Badge>;

export const RoleBadge = ({ role }: { role: Role }) => <Badge tone={role === 'admin' ? 'solid' : role === 'tutor' ? 'brand' : 'neutral'}>{ROLE_LABEL[role]}</Badge>;

export const Label = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center rounded border border-ink-200 bg-white px-1.5 text-2xs font-semibold text-ink-600">#{children}</span>
);
