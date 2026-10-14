import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  RotateCcw,
  TimerOff,
  type LucideIcon,
} from 'lucide-react';
import type { AppNotification } from '../../api/notifications';

export const NOTIFICATION_META: Record<
  AppNotification['type'],
  { icon: LucideIcon; tone: string }
> = {
  BOOKING_CONFIRMED: { icon: CheckCircle2, tone: 'bg-teal-50 text-teal-700' },
  TICKET_READY: { icon: FileCheck2, tone: 'bg-navy-50 text-navy-700' },
  BOOKING_EXPIRED: { icon: TimerOff, tone: 'bg-canvas text-muted' },
  PAYMENT_FAILED: { icon: AlertTriangle, tone: 'bg-danger-50 text-danger' },
  PAYMENT_REFUNDED: { icon: RotateCcw, tone: 'bg-amber-50 text-amber-700' },
};

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/** "just now", "5 minutes ago", "yesterday"… */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
  return rtf.format(Math.round(seconds / 86_400), 'day');
}
