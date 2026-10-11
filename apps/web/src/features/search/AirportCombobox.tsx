import { MapPin } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';
import type { Airport } from '../../api/flights';
import { cn } from '../../lib/cn';

interface Props {
  label: string;
  airports: Airport[];
  value: string;
  onChange: (iata: string) => void;
  exclude?: string;
  error?: string;
  placeholder?: string;
}

const describe = (a: Airport) => `${a.city} (${a.iata})`;

function rank(a: Airport, q: string): number {
  const query = q.toLowerCase();
  if (a.iata.toLowerCase() === query) return 0;
  if (a.city.toLowerCase().startsWith(query)) return 1;
  if (a.iata.toLowerCase().startsWith(query)) return 2;
  if (a.name.toLowerCase().includes(query) || a.city.toLowerCase().includes(query)) return 3;
  return -1;
}

/** WAI-ARIA combobox (list autocomplete) over the airport reference list. */
export function AirportCombobox({
  label,
  airports,
  value,
  onChange,
  exclude,
  error,
  placeholder,
}: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const selected = airports.find((a) => a.iata === value);
  const [query, setQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => {
    const q = (query ?? '').trim();
    const pool = airports.filter((a) => a.iata !== exclude);
    if (!q) return pool.slice(0, 8);
    return pool
      .map((a) => ({ a, r: rank(a, q) }))
      .filter((x) => x.r >= 0)
      .sort((x, y) => x.r - y.r || x.a.city.localeCompare(y.a.city))
      .slice(0, 8)
      .map((x) => x.a);
  }, [airports, exclude, query]);

  const choose = (a: Airport) => {
    onChange(a.iata);
    setQuery(null);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase"
      >
        {label}
      </label>
      <div className="relative">
        <MapPin
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && options[active] ? `${listId}-${options[active].iata}` : undefined
          }
          aria-invalid={!!error}
          autoComplete="off"
          placeholder={placeholder ?? 'City or airport'}
          value={query ?? (selected ? describe(selected) : '')}
          onFocus={(e) => {
            e.target.select();
            setOpen(true);
            setActive(0);
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onBlur={() => {
            // Defer so option clicks register first.
            setTimeout(() => {
              setOpen(false);
              setQuery(null);
            }, 120);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setActive((i) => Math.min(i + 1, options.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter' && open && options[active]) {
              e.preventDefault();
              choose(options[active]);
            } else if (e.key === 'Escape') {
              setOpen(false);
              setQuery(null);
            }
          }}
          className={cn(
            'h-12 w-full rounded-xl border bg-surface pr-3 pl-10 text-sm font-semibold text-ink placeholder:font-normal placeholder:text-muted/70',
            'focus:border-navy-700 focus:ring-4 focus:ring-navy-100 focus:outline-none',
            error ? 'border-danger' : 'border-line',
          )}
        />
      </div>
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute z-30 mt-2 max-h-80 w-full min-w-72 overflow-auto rounded-xl border border-line bg-surface p-1.5 shadow-lift"
        >
          {options.length === 0 && (
            <li className="px-3 py-2.5 text-sm text-muted">No airports match “{query}”</li>
          )}
          {options.map((a, i) => (
            <li
              key={a.iata}
              id={`${listId}-${a.iata}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(a)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5',
                i === active ? 'bg-navy-50' : '',
              )}
            >
              <span className="w-11 shrink-0 rounded-md bg-navy-900 py-1 text-center font-mono text-xs font-semibold text-white">
                {a.iata}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{a.city}</span>
                <span className="block truncate text-xs text-muted">{a.name}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
