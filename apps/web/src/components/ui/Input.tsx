import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const inputClass =
  'h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 ' +
  'transition-colors focus:border-navy-700 focus:outline-none focus:ring-4 focus:ring-navy-100 ' +
  'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:ring-danger-50 disabled:bg-canvas';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClass, className)} {...props} />;
  },
);
