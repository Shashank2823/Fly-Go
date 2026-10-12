import { CreditCard, Loader2, Lock, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';
import { ApiError } from '../api/api-error';
import {
  type CheckoutQuote,
  useBooking,
  useCheckout,
  usePaymentStatus,
  useStartPayment,
} from '../api/bookings';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { BookingFlowShell } from '../features/booking/BookingFlowShell';
import { PriceBreakdown } from '../features/booking/PriceBreakdown';
import { cn } from '../lib/cn';
import { formatMoney } from '../lib/format';

type Method = 'card' | 'wallet';

export function CheckoutPage() {
  const { reference = '' } = useParams();
  const ref = reference.toUpperCase();
  const navigate = useNavigate();
  const booking = useBooking(ref, { pollWhilePaying: true });
  const checkout = useCheckout(ref);
  const startPayment = useStartPayment(ref);
  const [quote, setQuote] = useState<CheckoutQuote | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>('card');
  const payment = usePaymentStatus(ref, paymentId);
  // One idempotency key per payment attempt (per price version): double-clicks and network
  // retries never create two payments; a new attempt after a decline gets a new key.
  const keys = useRef(new Map<number, string>());
  const quoted = useRef(false);

  // Price the booking on arrival (server-side; the client never sends amounts).
  useEffect(() => {
    if (quoted.current || booking.data?.status !== 'PENDING') return;
    quoted.current = true;
    checkout.mutate(undefined, {
      onSuccess: setQuote,
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'PASSENGERS_INCOMPLETE')
          void navigate(`/book/${ref}/passengers`, { replace: true });
        else setError(err instanceof ApiError ? err.message : 'Could not price this booking.');
      },
    });
  }, [booking.data?.status, checkout, navigate, ref]);

  // Resume an in-flight payment after a page refresh — checked once, on first load only, so a
  // stale booking snapshot can never re-attach a payment that has already finished.
  const resumeChecked = useRef(false);
  const [outcomeSeen, setOutcomeSeen] = useState(false);
  useEffect(() => {
    if (resumeChecked.current || !booking.data) return;
    resumeChecked.current = true;
    if (booking.data.status === 'PAYMENT_PENDING' && booking.data.payment)
      setPaymentId(booking.data.payment.paymentId);
  }, [booking.data]);

  // React to the asynchronous outcome (once per payment).
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const s = payment.data?.status;
    const key = `${payment.data?.paymentId}:${s}`;
    if (!s || handled.current === key) return;
    if (s === 'SUCCEEDED' || s === 'FAILED' || s === 'CANCELLED') handled.current = key;
    if (s === 'SUCCEEDED') {
      void booking
        .refetch()
        .then(() => navigate(`/bookings/${ref}?confirmed=1`, { replace: true }));
    } else if (s === 'FAILED' || s === 'CANCELLED') {
      setOutcomeSeen(true);
      setPaymentId(null);
      // That attempt is over: a retry is a new payment request and needs a fresh key
      // (reusing it would just replay the declined attempt).
      keys.current.clear();
      setError(
        payment.data?.failureCode === 'card_declined'
          ? 'Your payment was declined. You have not been charged — please try again.'
          : 'The payment did not go through. You have not been charged — please try again.',
      );
      void booking.refetch();
    }
  }, [
    payment.data?.status,
    payment.data?.paymentId,
    payment.data?.failureCode,
    booking,
    navigate,
    ref,
  ]);

  if (booking.isPending) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-10">
        <Skeleton className="h-28" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  if (booking.isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Alert>We couldn’t load this booking.</Alert>
      </div>
    );
  }
  const b = booking.data;
  // Confirmed while on this page (the poll can beat the payment-status check): celebrate.
  if (b.status === 'CONFIRMED') return <Navigate to={`/bookings/${ref}?confirmed=1`} replace />;
  if (b.status !== 'PENDING' && b.status !== 'PAYMENT_PENDING' && b.status !== 'EXPIRED')
    return <Navigate to={`/bookings/${ref}`} replace />;

  const processing =
    !!paymentId || startPayment.isPending || (b.status === 'PAYMENT_PENDING' && !outcomeSeen);
  const price =
    quote ??
    (b.price
      ? { ...b.price, holdExpiresAt: b.holdExpiresAt ?? '', serverTime: b.serverTime }
      : null);
  const names = Object.fromEntries(
    b.travellers.map((t) => [t.ordinal, `${t.firstName} ${t.lastName}`]),
  );

  const pay = async () => {
    if (!price) return;
    setError(null);
    if (!keys.current.has(price.priceVersion))
      keys.current.set(price.priceVersion, crypto.randomUUID());
    try {
      setOutcomeSeen(false);
      const res = await startPayment.mutateAsync({
        priceVersion: price.priceVersion,
        idempotencyKey: keys.current.get(price.priceVersion)!,
      });
      setPaymentId(res.paymentId);
    } catch (err) {
      if (!(err instanceof ApiError))
        return setError('Could not start the payment. Please try again.');
      if (err.code === 'PAYMENT_IN_PROGRESS' && typeof err.meta?.paymentId === 'string')
        return setPaymentId(err.meta.paymentId);
      if (err.code === 'PRICE_CHANGED') {
        quoted.current = false;
        setQuote(null);
        checkout.mutate(undefined, { onSuccess: setQuote });
        return setError('The price was updated. Please review the new total before paying.');
      }
      setError(err.message);
    }
  };

  return (
    <BookingFlowShell booking={b} receivedAt={booking.dataUpdatedAt} step="Checkout">
      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          <h2 className="text-xl font-bold">Review and pay</h2>
          {error && <Alert>{error}</Alert>}

          <Card>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold">Travellers</h3>
              {!processing && (
                <Link
                  to={`/book/${ref}/passengers`}
                  className="text-sm font-semibold text-navy-700 hover:underline"
                >
                  Edit
                </Link>
              )}
            </div>
            <ul className="divide-y divide-line">
              {b.travellers.map((t) => (
                <li key={t.ordinal} className="flex items-center justify-between py-2.5 text-sm">
                  <span>
                    <span className="font-semibold">
                      {t.firstName} {t.lastName}
                    </span>
                    <span className="ml-2 text-xs text-muted">{t.type.toLowerCase()}</span>
                  </span>
                  <span className="rounded-md bg-navy-900 px-2 py-0.5 font-mono text-xs font-semibold text-white">
                    {t.seatLabel ?? 'Lap'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">
              Confirmation will be sent to{' '}
              <span className="font-semibold text-ink">{b.contact.email}</span>
            </p>
          </Card>

          <Card>
            <h3 className="font-bold">Payment method</h3>
            <p className="mt-1 mb-4 flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck className="size-3.5 text-teal-700" aria-hidden /> Demo checkout —
              payments are simulated and no card details are needed.
            </p>
            <div
              role="radiogroup"
              aria-label="Payment method"
              className="grid gap-2 sm:grid-cols-2"
            >
              {(
                [
                  { id: 'card', label: 'Credit or debit card', icon: CreditCard },
                  { id: 'wallet', label: 'UPI / wallet', icon: Smartphone },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={method === id}
                  disabled={processing}
                  onClick={() => setMethod(id)}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border p-3.5 text-left text-sm font-semibold',
                    method === id
                      ? 'border-navy-900 bg-navy-50'
                      : 'border-line hover:border-navy-200',
                  )}
                >
                  <span
                    className={cn(
                      'size-4 rounded-full border-2',
                      method === id ? 'border-[5px] border-navy-900' : 'border-line',
                    )}
                  />
                  <Icon className="size-4 text-navy-700" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            <div
              className="mt-4 grid gap-3 rounded-xl bg-canvas p-4 text-sm text-muted sm:grid-cols-2"
              aria-hidden
            >
              {method === 'card' ? (
                <>
                  <div className="rounded-lg border border-dashed border-line bg-surface px-3 py-2.5 font-mono sm:col-span-2">
                    •••• •••• •••• 4242
                  </div>
                  <div className="rounded-lg border border-dashed border-line bg-surface px-3 py-2.5 font-mono">
                    12 / 30
                  </div>
                  <div className="rounded-lg border border-dashed border-line bg-surface px-3 py-2.5 font-mono">
                    •••
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-line bg-surface px-3 py-2.5 font-mono sm:col-span-2">
                  traveller@demo-upi
                </div>
              )}
            </div>
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card className="space-y-5">
            <h2 className="font-bold">Price</h2>
            {price ? (
              <PriceBreakdown
                lines={price.lines}
                total={price.total}
                names={names}
                totalLabel="Total to pay"
              />
            ) : checkout.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Skeleton key={i} className="h-5" />
                ))}
              </div>
            ) : null}

            {processing ? (
              <div
                role="status"
                className="flex items-center gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-700"
              >
                <Loader2 className="size-5 animate-spin" aria-hidden />
                <div>
                  <p className="font-semibold">Processing your payment…</p>
                  <p className="text-xs">
                    This usually takes a few seconds. Please don’t close this page.
                  </p>
                </div>
              </div>
            ) : (
              <Button size="lg" className="w-full" disabled={!price} onClick={() => void pay()}>
                <Lock className="size-4" aria-hidden /> Complete payment
                {price ? ` · ${formatMoney(price.total)}` : ''}
              </Button>
            )}
            <p className="text-center text-xs text-muted">
              Prices are calculated by FlyGo’s servers and include all taxes and fees.
            </p>
          </Card>
        </aside>
      </div>
    </BookingFlowShell>
  );
}
