import { Armchair, Info } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { ApiError } from '../api/api-error';
import { useCurrentUser } from '../api/auth';
import { useCreateHold } from '../api/bookings';
import { type Seat, useFlight, useSeatMap } from '../api/flights';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton, Spinner } from '../components/ui/Skeleton';
import { FlightStrip } from '../features/booking/FlightStrip';
import { SeatLegend, SeatMap } from '../features/seat-map/SeatMap';
import { YourHoldBanner } from '../features/booking/YourHoldBanner';
import { addMoney, CABIN_LABELS, formatMoney, passengerSummary } from '../lib/format';

const KIND_LABEL: Record<string, string> = {
  STANDARD: 'Standard',
  EXTRA_LEGROOM: 'Extra legroom',
  EXIT_ROW: 'Exit row',
};

function intParam(p: URLSearchParams, key: string, fallback: number, min: number, max: number) {
  const n = Number(p.get(key));
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

export function SeatSelectionPage() {
  const { flightId } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();

  const adults = intParam(params, 'adults', 1, 1, 9);
  const children = intParam(params, 'children', 0, 0, 9 - adults);
  const infants = intParam(params, 'infants', 0, 0, adults);
  const cabin = params.get('cabin') === 'BUSINESS' ? 'BUSINESS' : 'ECONOMY';
  const required = adults + children;

  const flight = useFlight(flightId);
  const seatMap = useSeatMap(flightId);
  const hold = useCreateHold();

  const [selected, setSelected] = useState<string[]>(() =>
    (params.get('seats') ?? '')
      .split(',')
      .filter((s) => /^\d{1,3}[A-Z]$/.test(s))
      .slice(0, required),
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One idempotency key per distinct selection: retries of the same intent reuse it.
  const keys = useRef(new Map<string, string>());
  const holdBannerRef = useRef<HTMLDivElement>(null);
  const [highlightHold, setHighlightHold] = useState(false);

  // Drop selections that became unavailable on a refresh.
  useEffect(() => {
    if (!seatMap.data) return;
    const lost = selected.filter((l) => {
      const s = seatMap.data.seats.find((x) => x.label === l);
      return !s || s.state !== 'AVAILABLE' || s.cabin !== cabin;
    });
    if (lost.length) {
      setSelected((cur) => cur.filter((l) => !lost.includes(l)));
      setNotice(
        `Seat${lost.length > 1 ? 's' : ''} ${lost.join(', ')} ${lost.length > 1 ? 'are' : 'is'} no longer available.`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seatMap.data]);

  const seatsByLabel = useMemo(
    () => new Map(seatMap.data?.seats.map((s) => [s.label, s]) ?? []),
    [seatMap.data],
  );
  const offer = flight.data?.cabins.find((c) => c.cabin === cabin);
  const surchargeFor = (kind: string) =>
    seatMap.data?.seats.find((s) => s.kind === kind && s.cabin === cabin)?.surcharge;
  const chosen = selected.map((l) => seatsByLabel.get(l)).filter((s): s is Seat => !!s);
  const currency = offer?.pricePerAdult.currency ?? 'INR';
  const extras = addMoney(
    chosen.flatMap((s) => (s.surcharge ? [s.surcharge] : [])),
    currency,
  );

  const toggle = (seat: Seat) => {
    setNotice(null);
    setError(null);
    setSelected((cur) => {
      if (cur.includes(seat.label)) return cur.filter((l) => l !== seat.label);
      // At the limit, the newest pick replaces the oldest.
      return cur.length < required ? [...cur, seat.label] : [...cur.slice(1), seat.label];
    });
  };

  const continueToHold = async () => {
    if (!flightId) return;
    setError(null);
    if (!user) {
      const next = new URLSearchParams(params);
      next.set('seats', selected.join(','));
      void navigate(`/login?next=${encodeURIComponent(`${location.pathname}?${next.toString()}`)}`);
      return;
    }
    const signature = [
      flightId,
      cabin,
      adults,
      children,
      infants,
      [...selected].sort().join(','),
    ].join('|');
    if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID());
    try {
      const booking = await hold.mutateAsync({
        input: { flightId, cabin, passengers: { adults, children, infants }, seats: selected },
        idempotencyKey: keys.current.get(signature)!,
      });
      void navigate(`/book/${booking.reference}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SEATS_UNAVAILABLE') {
        const gone = (err.meta?.unavailable as string[] | undefined) ?? [];
        setSelected((cur) => cur.filter((l) => !gone.includes(l)));
        setError(
          `Sorry — ${gone.join(', ')} ${gone.length > 1 ? 'were' : 'was'} just taken by another traveller. Please pick again.`,
        );
        void seatMap.refetch();
      } else {
        setError(
          err instanceof ApiError ? err.message : 'Could not hold your seats. Please try again.',
        );
      }
    }
  };

  const onOwnHeldSeat = (seat: Seat) => {
    setNotice(
      `Seat ${seat.label} is already held for you. Continue with that booking, or release it to choose again.`,
    );
    setHighlightHold(true);
    holdBannerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    holdBannerRef.current?.querySelector<HTMLElement>('a, button')?.focus({ preventScroll: true });
  };

  if (flight.isError || seatMap.isError) {
    const err = flight.error ?? seatMap.error;
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Alert>
          {err instanceof ApiError && err.status === 404
            ? 'This flight could not be found.'
            : 'Could not load this flight. Please try again.'}
        </Alert>
      </div>
    );
  }

  const actionLabel = hold.isPending
    ? 'Holding seats…'
    : user
      ? 'Hold seats & continue'
      : 'Sign in to continue';
  const canContinue = selected.length === required && !hold.isPending;

  return (
    <div className="pb-28 lg:pb-16">
      {flight.data ? (
        <FlightStrip flight={flight.data}>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
            <p className="font-semibold">{CABIN_LABELS[cabin]}</p>
            <p className="text-navy-200">{passengerSummary({ adults, children, infants })}</p>
          </div>
        </FlightStrip>
      ) : (
        <div className="h-32 bg-navy-900" />
      )}

      <div className="mx-auto grid max-w-6xl gap-8 px-4 pt-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <div>
            <h2 className="text-xl font-bold">
              Choose {required === 1 ? 'your seat' : `${required} seats`}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Availability updates every few seconds and is confirmed when you continue.
              {infants > 0 && ' Infants travel on an adult’s lap and don’t need a seat.'}
            </p>
          </div>
          {seatMap.data?.yourHolds.map((h, i) => (
            <YourHoldBanner
              key={h.reference}
              ref={i === 0 ? holdBannerRef : undefined}
              hold={h}
              serverTime={seatMap.data.generatedAt}
              receivedAt={seatMap.dataUpdatedAt}
              highlighted={highlightHold}
              onReleased={() => {
                setNotice(null);
                setHighlightHold(false);
                void seatMap.refetch();
              }}
            />
          ))}
          <SeatLegend
            surcharges={{
              legroom: surchargeFor('EXTRA_LEGROOM')
                ? formatMoney(surchargeFor('EXTRA_LEGROOM')!)
                : undefined,
              exit: surchargeFor('EXIT_ROW') ? formatMoney(surchargeFor('EXIT_ROW')!) : undefined,
            }}
          />
          {notice && <Alert tone="info">{notice}</Alert>}
          <div className="overflow-x-auto pb-2">
            {seatMap.data ? (
              <SeatMap
                map={seatMap.data}
                cabin={cabin}
                selected={selected}
                onToggle={toggle}
                onOwnHeldSeat={onOwnHeldSeat}
              />
            ) : (
              <div className="mx-auto w-72 space-y-2 py-6">
                {Array.from({ length: 10 }, (_, i) => (
                  <Skeleton key={i} className="h-9" />
                ))}
              </div>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Your seats</h2>
              <span className="font-mono text-sm text-muted">
                {selected.length}/{required}
              </span>
            </div>

            {chosen.length === 0 ? (
              <p className="flex items-start gap-2 rounded-xl bg-canvas p-3 text-sm text-muted">
                <Armchair className="mt-0.5 size-4 shrink-0" aria-hidden /> Tap a teal seat on the
                map to choose it.
              </p>
            ) : (
              <ul className="space-y-2">
                {chosen.map((s) => (
                  <li
                    key={s.label}
                    className="flex items-center justify-between rounded-xl border border-line/70 px-3 py-2.5"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-t-lg rounded-b-md bg-saffron-600 font-mono text-xs font-semibold text-white">
                        {s.label}
                      </span>
                      <span className="text-sm">
                        <span className="block font-semibold">{KIND_LABEL[s.kind]}</span>
                        <span className="text-xs text-muted">
                          {[
                            s.features.includes('WINDOW') && 'Window',
                            s.features.includes('AISLE') && 'Aisle',
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Middle'}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm font-semibold">
                      {s.surcharge ? `+${formatMoney(s.surcharge)}` : 'Included'}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <dl className="space-y-2 border-t border-line pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Fare per adult</dt>
                <dd className="font-semibold">{offer ? formatMoney(offer.pricePerAdult) : '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Seat extras</dt>
                <dd className="font-semibold">{formatMoney(extras)}</dd>
              </div>
            </dl>
            <p className="flex gap-2 text-xs text-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Fares include taxes and fees. Your exact total is calculated once seats are held.
            </p>

            {error && <Alert>{error}</Alert>}

            <Button
              className="w-full"
              size="lg"
              disabled={selected.length !== required || hold.isPending}
              onClick={() => void continueToHold()}
            >
              {hold.isPending ? (
                <Spinner className="border-white/30 border-t-white" label="Holding seats" />
              ) : null}
              {hold.isPending
                ? 'Holding seats…'
                : user
                  ? 'Hold seats & continue'
                  : 'Sign in to continue'}
            </Button>
            {seatMap.data && (
              <p className="text-center text-xs text-muted">
                We’ll hold your seats for {Math.round(seatMap.data.holdTtlSeconds / 60)} minutes.
              </p>
            )}
          </Card>
        </aside>
      </div>

      {/* Phones: the seat map is long, so keep the action within reach. */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div className="min-w-0 text-sm">
            <p className="font-semibold">
              {selected.length ? selected.join(', ') : 'No seats yet'}{' '}
              <span className="font-mono text-muted">
                {selected.length}/{required}
              </span>
            </p>
            <p className="truncate text-xs text-muted">Extras {formatMoney(extras)}</p>
          </div>
          <Button
            size="md"
            disabled={!canContinue}
            onClick={() => void continueToHold()}
            className="shrink-0"
          >
            {actionLabel}
          </Button>
        </div>
        {error && (
          <p className="mx-auto mt-2 max-w-6xl text-xs text-danger" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
