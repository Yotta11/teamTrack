import clsx from 'clsx';
import { AlertCircle, CalendarClock, MessageSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { dueLabel, fmtShort } from '../lib/format';
import type { Task } from '../lib/types';
import { AvatarStack, PriorityBadge, ProgressBar, StatusBadge } from './ui';

export function DueChip({ task }: { task: Pick<Task, 'dueDate' | 'isOverdue' | 'isDueSoon' | 'status'> }) {
  if (!task.dueDate) return <span className="text-xs text-ink-400">Sans échéance</span>;
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 text-xs font-semibold tabular-nums',
        task.isOverdue ? 'text-red-700' : task.isDueSoon ? 'text-amber-700' : task.status === 'done' ? 'text-ink-400' : 'text-ink-600',
      )}
    >
      <CalendarClock className="h-3.5 w-3.5" />
      {task.status === 'done' ? fmtShort(task.dueDate) : dueLabel(task.dueDate)}
    </span>
  );
}

/** Ligne de tâche compacte pour les listes (tableau de bord, fiches). */
export function TaskRow({ task, showTeam }: { task: Task; showTeam?: boolean }) {
  return (
    <Link to={`/taches/${task.id}`} className="group flex items-center gap-4 px-5 py-3 transition-colors hover:bg-ink-50">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink-900 group-hover:text-brand-700">{task.title}</p>
          {task.openIssueCount > 0 && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" aria-label="Difficulté ouverte" />}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} compact />
          <DueChip task={task} />
          {showTeam && <span className="text-xs text-ink-500">{task.teamName}</span>}
          {task.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-ink-500"><MessageSquare className="h-3.5 w-3.5" />{task.commentCount}</span>
          )}
        </div>
      </div>
      <ProgressBar value={task.progress} size="sm" showValue className="hidden w-32 sm:flex" />
      <AvatarStack users={task.assignees} />
    </Link>
  );
}
