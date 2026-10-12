import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

const STEPS = ['Seats', 'Passengers', 'Checkout', 'Confirmed'] as const;
export type BookingStep = (typeof STEPS)[number];

/** Progress through the booking flow. */
export function BookingSteps({ current }: { current: BookingStep }) {
  const index = STEPS.indexOf(current);
  return (
    <ol
      className="flex items-center gap-2 text-xs font-semibold sm:gap-3 sm:text-sm"
      aria-label="Booking progress"
    >
      {STEPS.map((step, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li
            key={step}
            className="flex items-center gap-2 sm:gap-3"
            aria-current={active ? 'step' : undefined}
          >
            <span
              className={cn(
                'flex size-6 shrink-0 items-center justify-center rounded-full text-[11px]',
                done && 'bg-teal-700 text-white',
                active && 'bg-saffron-600 text-white',
                !done && !active && 'bg-navy-100 text-navy-700',
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
            </span>
            <span className={cn('hidden sm:inline', active ? 'text-navy-900' : 'text-muted')}>
              {step}
            </span>
            {i < STEPS.length - 1 && <span className="h-px w-4 bg-line sm:w-8" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}
