import { Link } from 'react-router';
import { cn } from '../lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0A1F44" />
      <path
        d="M7 21c5-1 10-5 13-11"
        stroke="#F2884B"
        strokeWidth="2.4"
        strokeLinecap="round"
        fill="none"
        strokeDasharray="0.1 4.2"
      />
      <path
        fill="#fff"
        d="M25.6 7.2 19 10.4l-4.6-1.6-1.5.9 3.4 2.6-3.1 2-2-.6-1 .7 2.1 1.6.6 2.6 1-.6.1-2.1 3.3-1.8.1 4.3 1.6-.9.9-4.8 5.2-4.3c.7-.6.2-1.8-1.5-1.2z"
      />
    </svg>
  );
}

export function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="FlyGo home">
      <LogoMark />
      <span
        className={cn(
          'text-lg font-extrabold tracking-tight',
          inverted ? 'text-white' : 'text-navy-900',
        )}
      >
        Fly<span className="text-saffron-500">Go</span>
      </span>
    </Link>
  );
}
