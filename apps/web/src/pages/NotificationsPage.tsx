import { Bell, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useMarkAllNotificationsRead, useNotifications } from '../api/notifications';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { NotificationItem } from '../features/notifications/NotificationItem';

export function NotificationsPage() {
  const [page, setPage] = useState(1);
  const list = useNotifications(page, 15);
  const markAll = useMarkAllNotificationsRead();
  const data = list.data;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold">Notifications</h1>
          <p className="text-sm text-muted">
            {data ? `${data.unreadCount} unread` : 'Updates about your bookings'}
          </p>
        </div>
        {!!data?.unreadCount && (
          <Button
            variant="outline"
            size="sm"
            disabled={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all as read
          </Button>
        )}
      </div>
      {list.isError && <Alert>Could not load notifications.</Alert>}
      <Card className="divide-y divide-line p-2">
        {list.isPending &&
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="m-2 h-16" />)}
        {data?.data.map((n) => (
          <NotificationItem key={n.id} n={n} />
        ))}
        {data && data.data.length === 0 && (
          <div className="px-6 py-14 text-center">
            <Bell className="mx-auto size-10 text-navy-200" aria-hidden />
            <p className="mt-3 font-bold">No notifications yet</p>
            <p className="mt-1 text-sm text-muted">
              Booking confirmations and e-ticket updates will appear here.
            </p>
          </div>
        )}
      </Card>
      {data && data.page.totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3" aria-label="Pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft className="size-4" aria-hidden /> Newer
          </Button>
          <span className="text-sm text-muted">
            Page {page} of {data.page.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.page.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Older <ChevronRight className="size-4" aria-hidden />
          </Button>
        </nav>
      )}
    </div>
  );
}
