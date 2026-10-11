import { ArrowLeftRight, CalendarDays, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useAirports } from '../../api/flights';
import { Button } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import { todayIso } from '../../lib/format';
import { type FlightSearch, toSearchParams } from '../../lib/search-params';
import { AirportCombobox } from './AirportCombobox';
import { PassengerPicker, type Travellers } from './PassengerPicker';

interface Props {
  initial?: Partial<FlightSearch>;
  compact?: boolean;
  onSubmitted?: () => void;
}

export function SearchForm({ initial, compact = false, onSubmitted }: Props) {
  const navigate = useNavigate();
  const airports = useAirports();
  const [from, setFrom] = useState(initial?.from ?? 'DEL');
  const [to, setTo] = useState(initial?.to ?? '');
  const [date, setDate] = useState(initial?.date ?? todayIso(1));
  const [travellers, setTravellers] = useState<Travellers>({
    adults: initial?.adults ?? 1,
    children: initial?.children ?? 0,
    infants: initial?.infants ?? 0,
    cabin: initial?.cabin ?? 'ECONOMY',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!from) next.from = 'Choose where you fly from';
    if (!to) next.to = 'Choose a destination';
    if (from && to && from === to) next.to = 'Destination must differ from origin';
    if (!date || date < todayIso()) next.date = 'Choose today or a later date';
    setErrors(next);
    if (Object.keys(next).length) return;
    void navigate(`/flights?${toSearchParams({ from, to, date, ...travellers }).toString()}`);
    onSubmitted?.();
  };

  const list = airports.data ?? [];

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Search flights"
      className={cn(
        'grid gap-3',
        compact
          ? 'lg:grid-cols-[1fr_auto_1fr_10rem_15rem_auto]'
          : 'lg:grid-cols-[1fr_auto_1fr_11rem_16rem_auto]',
        'items-end',
      )}
    >
      <AirportCombobox
        label="From"
        airports={list}
        value={from}
        onChange={setFrom}
        exclude={to}
        error={errors.from}
      />
      <button
        type="button"
        onClick={() => {
          setFrom(to);
          setTo(from);
        }}
        aria-label="Swap origin and destination"
        className="mb-1 flex size-10 items-center justify-center self-end justify-self-center rounded-full border border-line bg-surface text-navy-700 hover:border-navy-700 lg:mb-1"
      >
        <ArrowLeftRight className="size-4" aria-hidden />
      </button>
      <AirportCombobox
        label="To"
        airports={list}
        value={to}
        onChange={setTo}
        exclude={from}
        error={errors.to}
      />
      <div>
        <label
          htmlFor="search-date"
          className="mb-1.5 block text-xs font-semibold tracking-wide text-muted uppercase"
        >
          Depart
        </label>
        <div className="relative">
          <CalendarDays
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            id="search-date"
            type="date"
            min={todayIso()}
            max={todayIso(365)}
            value={date}
            aria-invalid={!!errors.date}
            onChange={(e) => setDate(e.target.value)}
            className={cn(
              'h-12 w-full rounded-xl border bg-surface pr-3 pl-10 text-sm font-semibold focus:border-navy-700 focus:ring-4 focus:ring-navy-100 focus:outline-none',
              errors.date ? 'border-danger' : 'border-line',
            )}
          />
        </div>
        {errors.date && <p className="mt-1 text-xs text-danger">{errors.date}</p>}
      </div>
      <PassengerPicker value={travellers} onChange={setTravellers} />
      <Button type="submit" size="lg" className="h-12 w-full lg:w-auto">
        <Search className="size-4" aria-hidden />
        Search
      </Button>
    </form>
  );
}
