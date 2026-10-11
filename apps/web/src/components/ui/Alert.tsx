import { AlertCircle, CheckCircle2, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'danger' | 'success' | 'info';

const styles: Record<Tone, string> = {
  danger: 'border-danger/20 bg-danger-50 text-danger',
  success: 'border-teal-100 bg-teal-50 text-teal-700',
  info: 'border-navy-100 bg-navy-50 text-navy-800',
};
const icons = { danger: AlertCircle, success: CheckCircle2, info: Info };

export function Alert({
  tone = 'danger',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  const Icon = icons[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm',
        styles[tone],
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
