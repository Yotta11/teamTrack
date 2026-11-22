import { cn as clsx } from '../../lib/cn';
import { fullName, initials } from '../../lib/format';
import type { UserBrief } from '../../lib/types';

const sizes = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-16 w-16 text-xl' };

export function Avatar({ user, size = 'sm', className }: { user?: Pick<UserBrief, 'firstName' | 'lastName' | 'avatarUrl'> | null; size?: keyof typeof sizes; className?: string }) {
  if (!user) return <span className={clsx('inline-block rounded-full bg-ink-200', sizes[size], className)} />;
  return user.avatarUrl ? (
    <img src={user.avatarUrl} alt={fullName(user)} className={clsx('inline-block shrink-0 rounded-full object-cover ring-2 ring-white', sizes[size], className)} />
  ) : (
    <span
      title={fullName(user)}
      className={clsx('inline-flex shrink-0 select-none items-center justify-center rounded-full bg-brand-100 font-bold text-brand-800 ring-2 ring-white', sizes[size], className)}
    >
      {initials(user)}
    </span>
  );
}

export function AvatarStack({ users, max = 3, size = 'xs' }: { users: UserBrief[]; max?: number; size?: keyof typeof sizes }) {
  if (users.length === 0) return <span className="text-xs italic text-ink-400">Non affectée</span>;
  return (
    <span className="flex -space-x-1.5" aria-label={users.map(fullName).join(', ')}>
      {users.slice(0, max).map((u) => (
        <Avatar key={u.id} user={u} size={size} />
      ))}
      {users.length > max && (
        <span className={clsx('inline-flex items-center justify-center rounded-full bg-ink-100 font-bold text-ink-600 ring-2 ring-white', sizes[size])}>
          +{users.length - max}
        </span>
      )}
    </span>
  );
}
