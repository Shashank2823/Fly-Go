import { Timer } from 'lucide-react';
import { cn } from '../../lib/cn';

export function HoldCountdown({ seconds, total }: { seconds: number; total: number }) {
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const urgent = seconds <= 120;
  const pct = Math.max(0, Math.min(1, seconds / total));
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl px-4 py-3',
        urgent ? 'bg-danger-50 text-danger' : 'bg-white/10 text-white',
      )}
    >
      <svg viewBox="0 0 64 64" className="size-14 -rotate-90" aria-hidden>
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="5"
        />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={urgent ? 'currentColor' : '#F2884B'}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-1000 ease-linear"
        />
      </svg>
      <div>
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase opacity-80">
          <Timer className="size-3.5" aria-hidden /> Seats held for
        </p>
        <p
          className="font-mono text-2xl font-semibold"
          role="timer"
          aria-live={urgent ? 'polite' : 'off'}
          aria-label={`${mm} minutes ${ss} seconds remaining`}
        >
          {mm}:{ss}
        </p>
      </div>
    </div>
  );
}
