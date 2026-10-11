import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  PlaneTakeoff,
  SlidersHorizontal,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ApiError } from '../api/api-error';
import { useAirports, useFlightSearch } from '../api/flights';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { FlightCard, FlightCardSkeleton } from '../features/flights/FlightCard';
import { SearchForm } from '../features/search/SearchForm';
import { cn } from '../lib/cn';
import { CABIN_LABELS, formatDay, passengerSummary, shiftDate, todayIso } from '../lib/format';
import { type FlightSearch, parseSearch, type Sort, toSearchParams } from '../lib/search-params';

const SORT_LABELS: Record<Sort, string> = {
  departure: 'Earliest',
  price: 'Cheapest',
  duration: 'Fastest',
};

function seatPageUrl(flightId: string, s: FlightSearch) {
  const q = new URLSearchParams({
    cabin: s.cabin,
    adults: String(s.adults),
    children: String(s.children),
    infants: String(s.infants),
  });
  return `/flights/${flightId}/seats?${q.toString()}`;
}

export function FlightResultsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const search = parseSearch(params);
  const results = useFlightSearch(search);
  const airports = useAirports();
  const [editing, setEditing] = useState(false);

  if (!search) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Alert tone="info">This search link is incomplete. Start a new search below.</Alert>
        <div className="mt-6 rounded-card border border-line/70 bg-surface p-5 shadow-card">
          <SearchForm />
        </div>
      </div>
    );
  }

  const go = (patch: Partial<FlightSearch>) =>
    navigate(`/flights?${toSearchParams({ ...search, page: 1, ...patch }).toString()}`);
  const cityOf = (code: string) => airports.data?.find((a) => a.iata === code)?.city ?? code;
  const canGoBack = search.date > todayIso();
  const data = results.data;

  return (
    <div className="pb-16">
      <section className="bg-navy-900 text-white">
        <div className="mx-auto max-w-6xl px-4 py-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-extrabold tracking-tight">
                <span>{cityOf(search.from)}</span>
                <ArrowRight className="size-5 text-saffron-400" aria-hidden />
                <span>{cityOf(search.to)}</span>
              </h1>
              <p className="mt-1 text-sm text-navy-200">
                <span className="font-mono">
                  {search.from} → {search.to}
                </span>{' '}
                · {formatDay(search.date)} · {passengerSummary(search)} ·{' '}
                {CABIN_LABELS[search.cabin]}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing((e) => !e)}
              aria-expanded={editing}
              className="border-white/20 bg-white/10 text-white hover:border-white/40 hover:bg-white/15"
            >
              <SlidersHorizontal className="size-4" aria-hidden />{' '}
              {editing ? 'Close' : 'Modify search'}
            </Button>
          </div>
          {editing && (
            <div className="mt-5 rounded-card bg-surface p-4 text-ink">
              <SearchForm compact initial={search} onSubmitted={() => setEditing(false)} />
            </div>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 py-5">
          <div
            className="flex items-center gap-1 rounded-xl border border-line/70 bg-surface p-1 shadow-card"
            aria-label="Change date"
          >
            <button
              type="button"
              disabled={!canGoBack}
              onClick={() => void go({ date: shiftDate(search.date, -1) })}
              className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-35"
            >
              <ChevronLeft className="size-4" aria-hidden />{' '}
              <span className="hidden sm:inline">Previous day</span>
            </button>
            <span className="px-2 text-sm font-semibold">{formatDay(search.date)}</span>
            <button
              type="button"
              onClick={() => void go({ date: shiftDate(search.date, 1) })}
              className="flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm font-semibold text-navy-700 hover:bg-navy-50"
            >
              <span className="hidden sm:inline">Next day</span>{' '}
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>

          <div
            role="tablist"
            aria-label="Sort flights"
            className="flex items-center gap-1 rounded-xl border border-line/70 bg-surface p-1 shadow-card"
          >
            {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
              <button
                key={s}
                role="tab"
                type="button"
                aria-selected={search.sort === s}
                onClick={() => void go({ sort: s })}
                className={cn(
                  'h-9 rounded-lg px-3.5 text-sm font-semibold',
                  search.sort === s ? 'bg-navy-900 text-white' : 'text-muted hover:text-navy-900',
                )}
              >
                {SORT_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {data && (
          <p className="mb-3 text-sm text-muted" aria-live="polite">
            {data.page.totalItems} flight{data.page.totalItems === 1 ? '' : 's'} · prices in{' '}
            {data.market.currency}
          </p>
        )}

        {results.isError && (
          <Alert>
            {results.error instanceof ApiError ? results.error.message : 'Could not load flights.'}{' '}
            <button
              type="button"
              className="font-semibold underline"
              onClick={() => void results.refetch()}
            >
              Try again
            </button>
          </Alert>
        )}

        <div
          className={cn('space-y-4', results.isPlaceholderData && 'opacity-60 transition-opacity')}
          aria-busy={results.isFetching}
        >
          {results.isPending && Array.from({ length: 4 }, (_, i) => <FlightCardSkeleton key={i} />)}

          {data?.data.map((f) => (
            <FlightCard
              key={f.id}
              flight={f}
              onSelect={() => void navigate(seatPageUrl(f.id, search))}
            />
          ))}

          {data && data.data.length === 0 && (
            <div className="rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
              <PlaneTakeoff className="mx-auto size-10 text-navy-200" aria-hidden />
              <h2 className="mt-3 text-lg font-bold">No flights on {formatDay(search.date)}</h2>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted">
                Nothing matches this route, date and number of seats. Try a nearby date or fewer
                travellers.
              </p>
              <div className="mt-5 flex justify-center gap-2">
                {canGoBack && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void go({ date: shiftDate(search.date, -1) })}
                  >
                    Previous day
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void go({ date: shiftDate(search.date, 1) })}
                >
                  Next day
                </Button>
              </div>
            </div>
          )}
        </div>

        {data && data.page.totalPages > 1 && (
          <nav className="mt-8 flex items-center justify-center gap-3" aria-label="Pagination">
            <Button
              variant="outline"
              size="sm"
              disabled={search.page <= 1}
              onClick={() => void go({ page: search.page - 1 })}
            >
              <ChevronLeft className="size-4" aria-hidden /> Previous
            </Button>
            <span className="text-sm text-muted">
              Page {data.page.page} of {data.page.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={search.page >= data.page.totalPages}
              onClick={() => void go({ page: search.page + 1 })}
            >
              Next <ChevronRight className="size-4" aria-hidden />
            </Button>
          </nav>
        )}

        <p className="mt-10 text-center text-xs text-muted">
          Sample data for demonstration — not live airline schedules.{' '}
          <Link to="/" className="font-semibold text-navy-700 hover:underline">
            New search
          </Link>
        </p>
      </div>
    </div>
  );
}
