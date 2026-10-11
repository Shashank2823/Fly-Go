import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'success' | 'danger' | 'navy' | 'saffron' | 'amber';

const tones: Record<Tone, string> = {
  neutral: 'bg-canvas text-muted',
  success: 'bg-teal-50 text-teal-700',
  danger: 'bg-danger-50 text-danger',
  navy: 'bg-navy-50 text-navy-700',
  saffron: 'bg-saffron-50 text-saffron-700',
  amber: 'bg-amber-50 text-amber-700',
};

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
