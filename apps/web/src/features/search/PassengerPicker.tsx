import { Minus, Plus, Users } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { CABIN_LABELS, passengerSummary } from '../../lib/format';
import { CABINS } from '../../lib/search-params';
import { cn } from '../../lib/cn';

export interface Travellers {
  adults: number;
  children: number;
  infants: number;
  cabin: (typeof CABINS)[number];
}

function Stepper({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const btn =
    'flex size-9 items-center justify-center rounded-full border border-line text-navy-900 hover:border-navy-700 disabled:opacity-35 disabled:hover:border-line';
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={btn}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          aria-label={`Fewer ${label.toLowerCase()}`}
        >
          <Minus className="size-4" aria-hidden />
        </button>
        <span
          className="w-5 text-center font-mono text-sm font-semibold"
          aria-live="polite"
          aria-label={`${value} ${label}`}
        >
          {value}
        </span>
        <button
          type="button"
          className={btn}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          aria-label={`More ${label.toLowerCase()}`}
        >
          <Plus className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function PassengerPicker({
  value,
  onChange,
}: {
  value: Travellers;
  onChange: (v: Travellers) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const seated = value.adults + value.children;

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
      <span
        id={`${id}-label`}
        className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase"
      >
        Travellers & cabin
      </span>
      <button
        type="button"
        aria-labelledby={`${id}-label`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-line bg-surface px-3.5 text-left text-sm font-semibold hover:border-navy-200 focus:border-navy-700 focus:ring-4 focus:ring-navy-100 focus:outline-none"
      >
        <Users className="size-4 shrink-0 text-muted" aria-hidden />
        <span className="truncate">
          {passengerSummary(value)} · {CABIN_LABELS[value.cabin]}
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Travellers and cabin"
          className="absolute right-0 z-30 mt-2 w-full min-w-80 rounded-xl border border-line bg-surface p-4 shadow-lift"
        >
          <div className="divide-y divide-line">
            <Stepper
              label="Adults"
              hint="12+ years"
              value={value.adults}
              min={1}
              max={9 - value.children}
              onChange={(adults) =>
                onChange({ ...value, adults, infants: Math.min(value.infants, adults) })
              }
            />
            <Stepper
              label="Children"
              hint="2–11 years, own seat"
              value={value.children}
              min={0}
              max={9 - value.adults}
              onChange={(children) => onChange({ ...value, children })}
            />
            <Stepper
              label="Infants"
              hint="Under 2, on lap"
              value={value.infants}
              min={0}
              max={value.adults}
              onChange={(infants) => onChange({ ...value, infants })}
            />
          </div>
          <p className="mt-2 text-xs text-muted">{seated} of 9 seats · one infant per adult</p>
          <div className="mt-4 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Cabin">
            {CABINS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={value.cabin === c}
                onClick={() => onChange({ ...value, cabin: c })}
                className={cn(
                  'h-10 rounded-lg border text-sm font-semibold',
                  value.cabin === c
                    ? 'border-navy-900 bg-navy-900 text-white'
                    : 'border-line hover:border-navy-200',
                )}
              >
                {CABIN_LABELS[c]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="mt-4 w-full rounded-lg py-2 text-sm font-semibold text-navy-700 hover:bg-navy-50"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
