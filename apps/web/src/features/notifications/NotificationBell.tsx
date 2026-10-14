import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useMarkAllNotificationsRead, useNotifications } from '../../api/notifications';
import { NotificationItem } from './NotificationItem';

/** Header bell: unread badge (refreshed every 30 s) and the five most recent notifications. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const list = useNotifications(1, 5, { poll: true });
  const markAll = useMarkAllNotificationsRead();
  const unread = list.data?.unreadCount ?? 0;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex size-10 items-center justify-center rounded-full text-navy-900 hover:bg-navy-50"
      >
        <Bell className="size-5" aria-hidden />
        {unread > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-saffron-600 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          // Phones: a full-width panel under the header; larger screens: anchored to the bell.
          className="fixed inset-x-4 top-16 z-30 rounded-card border border-line bg-surface p-2 shadow-lift sm:absolute sm:inset-x-auto sm:top-auto sm:right-0 sm:mt-2 sm:w-[22rem]"
        >
          <div className="flex items-center justify-between px-2 py-1.5">
            <p className="text-sm font-bold">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => markAll.mutate()}
                className="text-xs font-semibold text-navy-700 hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          {list.data?.data.length ? (
            <div className="max-h-96 overflow-auto">
              {list.data.data.map((n) => (
                <NotificationItem key={n.id} n={n} compact onOpen={() => setOpen(false)} />
              ))}
            </div>
          ) : (
            <p className="px-3 py-8 text-center text-sm text-muted">You’re all caught up.</p>
          )}
          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="mt-1 block rounded-lg py-2 text-center text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            View all
          </Link>
        </div>
      )}
    </div>
  );
}
