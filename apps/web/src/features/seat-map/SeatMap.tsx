import { Check, X } from 'lucide-react';
import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import type { Seat, SeatMap as SeatMapData } from '../../api/flights';
import { cn } from '../../lib/cn';
import { CABIN_LABELS } from '../../lib/format';
import { isSelectable, seatAriaLabel, seatVisual, type SeatVisual } from './seat-state';

interface Props {
  map: SeatMapData;
  cabin: string;
  selected: string[];
  onToggle: (seat: Seat) => void;
  /** Called when the viewer clicks a seat they already hold in another booking. */
  onOwnHeldSeat?: (seat: Seat) => void;
}

const VISUAL_CLASSES: Record<SeatVisual, string> = {
  selected: 'border-saffron-600 bg-saffron-600 text-white shadow-md',
  available: 'border-teal-600/60 bg-surface text-teal-700 hover:border-teal-700 hover:bg-teal-50',
  held: 'bg-stripes-amber border-amber-100 text-amber-700/70 cursor-not-allowed',
  mine: 'border-2 border-saffron-400 bg-saffron-50 text-saffron-700 hover:bg-saffron-100',
  booked: 'border-transparent bg-navy-100 text-navy-200 cursor-not-allowed',
  blocked: 'border-transparent bg-line text-muted/50 cursor-not-allowed',
  'other-cabin': 'border-line bg-canvas text-muted/60 opacity-50 cursor-not-allowed',
};

function SeatGlyph({ seat, visual }: { seat: Seat; visual: SeatVisual }) {
  if (visual === 'selected') return <Check className="size-4" strokeWidth={3} aria-hidden />;
  if (visual === 'booked' || visual === 'blocked') return <X className="size-3.5" aria-hidden />;
  return <span className="font-mono text-[10px] font-semibold">{seat.column}</span>;
}

/**
 * Aircraft seat map driven entirely by layout data from the API. Uses a roving tabindex:
 * one seat is tabbable, arrow keys move between seats, Enter/Space selects.
 */
export function SeatMap({ map, cabin, selected, onToggle, onOwnHeldSeat }: Props) {
  const byLabel = useMemo(() => new Map(map.seats.map((s) => [s.label, s])), [map.seats]);
  const rows = useMemo(() => {
    const r = new Map<number, Map<string, Seat>>();
    for (const s of map.seats) {
      if (!r.has(s.row)) r.set(s.row, new Map());
      r.get(s.row)!.set(s.column, s);
    }
    return r;
  }, [map.seats]);
  const orderedRows = useMemo(() => [...rows.keys()].sort((a, b) => a - b), [rows]);

  const firstSelectable =
    map.seats.find((s) => isSelectable(s, cabin))?.label ?? map.seats[0]?.label;
  const [focused, setFocused] = useState<string | undefined>(selected[0] ?? firstSelectable);
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const columnsFor = (row: number) =>
    map.cabins
      .find((c) => row >= c.firstRow && row <= c.lastRow)
      ?.columns.filter((c): c is string => !!c) ?? [];

  const move = (from: Seat, dRow: number, dCol: number): Seat | undefined => {
    if (dCol) {
      const cols = columnsFor(from.row);
      for (let i = cols.indexOf(from.column) + dCol; i >= 0 && i < cols.length; i += dCol) {
        const s = rows.get(from.row)?.get(cols[i]!);
        if (s) return s;
      }
      return undefined;
    }
    for (
      let i = orderedRows.indexOf(from.row) + dRow;
      i >= 0 && i < orderedRows.length;
      i += dRow
    ) {
      const r = rows.get(orderedRows[i]!)!;
      const same = r.get(from.column);
      if (same) return same;
      // Different cabin width: land on the nearest column by position.
      const cols = columnsFor(orderedRows[i]!);
      const fromCols = columnsFor(from.row);
      const ratio = fromCols.length > 1 ? fromCols.indexOf(from.column) / (fromCols.length - 1) : 0;
      const s = r.get(cols[Math.round(ratio * (cols.length - 1))]!);
      if (s) return s;
    }
    return undefined;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, seat: Seat) => {
    const deltas: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    const d = deltas[e.key];
    if (!d) return;
    e.preventDefault();
    const next = move(seat, d[0], d[1]);
    if (next) {
      setFocused(next.label);
      refs.current.get(next.label)?.focus();
    }
  };

  return (
    <div className="mx-auto w-fit">
      {/* Fuselage: rounded nose at the top. */}
      <div className="rounded-t-[7rem] rounded-b-3xl border border-line bg-surface px-5 pt-16 pb-8 shadow-card sm:px-8">
        <p className="mb-6 text-center font-mono text-[10px] tracking-[0.25em] text-muted uppercase">
          Front
        </p>
        {map.cabins.map((c) => {
          const isBusiness = c.cabin === 'BUSINESS' || c.cabin === 'FIRST';
          // Literal class names so Tailwind can see them at build time.
          const seatSize = isBusiness ? 'size-11' : 'size-9';
          const colWidth = isBusiness ? 'w-11' : 'w-9';
          const cabinRows = orderedRows.filter((r) => r >= c.firstRow && r <= c.lastRow);
          const firstAisle = c.columns.indexOf(null);
          return (
            <section
              key={c.cabin}
              aria-label={`${CABIN_LABELS[c.cabin] ?? c.cabin} cabin`}
              className="mb-6 last:mb-0"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="h-px flex-1 bg-line" />
                <span
                  className={cn(
                    'text-xs font-bold tracking-wide uppercase',
                    c.cabin === cabin ? 'text-navy-900' : 'text-muted',
                  )}
                >
                  {CABIN_LABELS[c.cabin] ?? c.cabin}
                </span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <div
                role="grid"
                aria-label={`${CABIN_LABELS[c.cabin]} seats`}
                className="space-y-1.5"
              >
                <div role="row" className="flex items-center justify-center gap-1.5" aria-hidden>
                  {c.columns.map((col, i) => (
                    <span
                      key={i}
                      className={cn(
                        'text-center font-mono text-[10px] font-semibold text-muted',
                        col ? colWidth : 'w-7',
                      )}
                    >
                      {col}
                    </span>
                  ))}
                </div>
                {cabinRows.map((row) => {
                  const rowSeats = rows.get(row)!;
                  const exit = [...rowSeats.values()].some((s) => s.kind === 'EXIT_ROW');
                  return (
                    <div
                      key={row}
                      role="row"
                      className="relative flex items-center justify-center gap-1.5"
                    >
                      {exit && (
                        <>
                          <span
                            className="absolute -left-5 font-mono text-[9px] font-bold text-danger sm:-left-7"
                            aria-hidden
                          >
                            EXIT
                          </span>
                          <span
                            className="absolute -right-5 font-mono text-[9px] font-bold text-danger sm:-right-7"
                            aria-hidden
                          >
                            EXIT
                          </span>
                        </>
                      )}
                      {c.columns.map((col, i) => {
                        if (!col) {
                          return (
                            <span
                              key={`aisle-${i}`}
                              className="w-7 text-center font-mono text-[10px] text-muted"
                              aria-hidden
                            >
                              {i === firstAisle ? row : ''}
                            </span>
                          );
                        }
                        const seat = rowSeats.get(col);
                        if (!seat) return <span key={col} className={seatSize} aria-hidden />;
                        const isSelected = selected.includes(seat.label);
                        const visual = seatVisual(seat, isSelected, cabin);
                        const interactive = isSelected || isSelectable(seat, cabin);
                        return (
                          <span key={col} role="gridcell" className="relative">
                            <button
                              ref={(el) => {
                                if (el) refs.current.set(seat.label, el);
                                else refs.current.delete(seat.label);
                              }}
                              type="button"
                              tabIndex={focused === seat.label ? 0 : -1}
                              aria-label={seatAriaLabel(seat, visual)}
                              aria-pressed={isSelected}
                              aria-disabled={!interactive && visual !== 'mine'}
                              onFocus={() => setFocused(seat.label)}
                              onKeyDown={(e) => onKeyDown(e, seat)}
                              onClick={() => {
                                if (interactive) onToggle(seat);
                                else if (visual === 'mine') onOwnHeldSeat?.(seat);
                              }}
                              className={cn(
                                'flex items-center justify-center rounded-t-lg rounded-b-md border transition-colors',
                                seatSize,
                                VISUAL_CLASSES[visual],
                              )}
                            >
                              <SeatGlyph seat={seat} visual={visual} />
                            </button>
                            {seat.kind === 'EXTRA_LEGROOM' && seat.cabin === cabin && (
                              <span
                                className="pointer-events-none absolute -top-1 left-1/2 h-1 w-4 -translate-x-1/2 rounded-full bg-navy-700"
                                aria-hidden
                              />
                            )}
                          </span>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
        <p className="mt-6 text-center font-mono text-[10px] tracking-[0.25em] text-muted uppercase">
          Rear
        </p>
      </div>
      {byLabel.size === 0 && (
        <p className="text-center text-sm text-muted">No seat data for this flight.</p>
      )}
    </div>
  );
}

export function SeatLegend({ surcharges }: { surcharges: { legroom?: string; exit?: string } }) {
  const item = (cls: string, label: string, extra?: React.ReactNode) => (
    <li className="flex items-center gap-2">
      <span
        className={cn('relative size-5 shrink-0 rounded-t-md rounded-b-sm border', cls)}
        aria-hidden
      >
        {extra}
      </span>
      <span>{label}</span>
    </li>
  );
  return (
    <ul
      className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted sm:grid-cols-3"
      aria-label="Seat legend"
    >
      {item('border-teal-600/60 bg-surface', 'Available')}
      {item('border-saffron-600 bg-saffron-600', 'Your selection')}
      {item('border-2 border-saffron-400 bg-saffron-50', 'Held by you')}
      {item('bg-stripes-amber border-amber-100', 'Held by others')}
      {item('border-transparent bg-navy-100', 'Booked')}
      {item(
        'border-teal-600/60 bg-surface',
        `Extra legroom${surcharges.legroom ? ` · +${surcharges.legroom}` : ''}`,
        <span className="absolute -top-1 left-1/2 h-1 w-3 -translate-x-1/2 rounded-full bg-navy-700" />,
      )}
      <li className="flex items-center gap-2">
        <span
          className="w-5 shrink-0 text-center font-mono text-[8px] font-bold text-danger"
          aria-hidden
        >
          EXIT
        </span>
        <span>Exit row{surcharges.exit ? ` · +${surcharges.exit}` : ''}</span>
      </li>
    </ul>
  );
}
