import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from './auth';
import { apiRequest } from './client';

export interface AppNotification {
  id: string;
  type:
    | 'BOOKING_CONFIRMED'
    | 'TICKET_READY'
    | 'BOOKING_EXPIRED'
    | 'PAYMENT_FAILED'
    | 'PAYMENT_REFUNDED';
  title: string;
  message: string;
  bookingReference: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationList {
  data: AppNotification[];
  page: { page: number; pageSize: number; totalItems: number; totalPages: number };
  unreadCount: number;
}

const KEY = ['notifications'] as const;

/** Notifications for the signed-in user. The bell polls gently; the page loads on demand. */
export function useNotifications(page = 1, pageSize = 10, opts: { poll?: boolean } = {}) {
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: [...KEY, page, pageSize],
    enabled: !!user,
    queryFn: () => apiRequest<NotificationList>(`/notifications?page=${page}&pageSize=${pageSize}`),
    refetchInterval: opts.poll ? 30_000 : false,
    placeholderData: keepPreviousData,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<void>('/notifications/read-all', { method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}
