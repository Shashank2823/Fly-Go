import { useNavigate } from 'react-router';
import { type AppNotification, useMarkNotificationRead } from '../../api/notifications';
import { cn } from '../../lib/cn';
import { NOTIFICATION_META, timeAgo } from './notification-meta';

/** One notification; opening it marks it read and goes to the related booking. */
export function NotificationItem({
  n,
  compact = false,
  onOpen,
}: {
  n: AppNotification;
  compact?: boolean;
  onOpen?: () => void;
}) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();
  const { icon: Icon, tone } = NOTIFICATION_META[n.type];
  const open = () => {
    if (!n.read) markRead.mutate(n.id);
    onOpen?.();
    if (n.bookingReference) void navigate(`/bookings/${n.bookingReference}`);
  };
  return (
    <button
      type="button"
      onClick={open}
      className={cn(
        'flex w-full items-start gap-3 rounded-xl text-left transition-colors hover:bg-canvas',
        compact ? 'p-2.5' : 'p-4',
      )}
    >
      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-xl', tone)}>
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className={cn('text-sm', n.read ? 'font-medium text-muted' : 'font-bold text-ink')}>
            {n.title}
          </span>
          {!n.read && (
            <span className="size-2 shrink-0 rounded-full bg-saffron-500" aria-label="Unread" />
          )}
        </span>
        <span className={cn('mt-0.5 block text-sm text-muted', compact && 'line-clamp-2')}>
          {n.message}
        </span>
        <span className="mt-1 block text-xs text-muted/80">{timeAgo(n.createdAt)}</span>
      </span>
    </button>
  );
}
