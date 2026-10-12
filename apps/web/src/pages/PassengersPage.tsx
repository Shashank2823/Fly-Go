import { zodResolver } from '@hookform/resolvers/zod';
import { Armchair, Baby, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Navigate, useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { ApiError } from '../api/api-error';
import { useCurrentUser } from '../api/auth';
import {
  type BookingDetail,
  type PassengerType,
  useBooking,
  useUpdatePassengers,
} from '../api/bookings';
import { useCountries } from '../api/reference';
import { FormField } from '../components/form/FormField';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { BookingFlowShell } from '../features/booking/BookingFlowShell';
import { localDate, todayIso } from '../lib/format';

const NAME = /^[\p{L}][\p{L}\p{M} .'-]*$/u;
const TYPE_LABEL: Record<PassengerType, string> = {
  ADULT: 'Adult',
  CHILD: 'Child (2–11)',
  INFANT: 'Infant (under 2)',
};

const schema = z.object({
  contact: z.object({
    email: z.email('Enter a valid email address').trim(),
    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{6,14}$/, 'Use international format, e.g. +919876543210'),
  }),
  passengers: z.array(
    z.object({
      ordinal: z.number(),
      type: z.enum(['ADULT', 'CHILD', 'INFANT']),
      firstName: z.string().trim().min(1, 'Required').max(60).regex(NAME, 'Letters only'),
      lastName: z.string().trim().min(1, 'Required').max(60).regex(NAME, 'Letters only'),
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a date of birth'),
      nationality: z.string().length(2, 'Select nationality'),
      seatLabel: z.string().optional(),
    }),
  ),
});
type FormValues = z.infer<typeof schema>;

function initialValues(
  b: BookingDetail,
  user?: { fullName: string; email: string; phone: string | null; nationality: string },
): FormValues {
  if (b.travellers.length) {
    return {
      contact: {
        email: b.contact.email ?? user?.email ?? '',
        phone: b.contact.phone ?? user?.phone ?? '',
      },
      passengers: b.travellers.map((t) => ({
        ordinal: t.ordinal,
        type: t.type,
        firstName: t.firstName,
        lastName: t.lastName,
        dateOfBirth: t.dateOfBirth,
        nationality: t.nationality ?? user?.nationality ?? 'IN',
        seatLabel: t.seatLabel ?? undefined,
      })),
    };
  }
  const types: PassengerType[] = [
    ...Array<PassengerType>(b.passengers.adults).fill('ADULT'),
    ...Array<PassengerType>(b.passengers.children).fill('CHILD'),
    ...Array<PassengerType>(b.passengers.infants).fill('INFANT'),
  ];
  const seats = b.seats.map((s) => s.label);
  let seatIndex = 0;
  const [first = '', ...rest] = (user?.fullName ?? '').split(' ');
  return {
    contact: { email: user?.email ?? '', phone: user?.phone ?? '' },
    passengers: types.map((type, i) => ({
      ordinal: i + 1,
      type,
      firstName: i === 0 ? first : '',
      lastName: i === 0 ? rest.join(' ') : '',
      dateOfBirth: '',
      nationality: user?.nationality ?? 'IN',
      seatLabel: type === 'INFANT' ? undefined : seats[seatIndex++],
    })),
  };
}

export function PassengersPage() {
  const { reference = '' } = useParams();
  const ref = reference.toUpperCase();
  const booking = useBooking(ref);
  const { data: user } = useCurrentUser();

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
  if (booking.data.status === 'PAYMENT_PENDING')
    return <Navigate to={`/book/${ref}/checkout`} replace />;
  if (booking.data.status !== 'PENDING' && booking.data.status !== 'EXPIRED')
    return <Navigate to={`/bookings/${ref}`} replace />;

  return (
    <BookingFlowShell booking={booking.data} receivedAt={booking.dataUpdatedAt} step="Passengers">
      <PassengerForm
        booking={booking.data}
        defaults={initialValues(booking.data, user ?? undefined)}
      />
    </BookingFlowShell>
  );
}

function PassengerForm({ booking, defaults }: { booking: BookingDetail; defaults: FormValues }) {
  const navigate = useNavigate();
  const save = useUpdatePassengers(booking.reference);
  const countries = useCountries();
  const [formError, setFormError] = useState<string | null>(null);
  const departureDate = localDate(booking.flight.departure.local);
  const seatOptions = useMemo(
    () => booking.seats.map((s) => ({ label: s.label, kind: s.kind })),
    [booking.seats],
  );
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults });
  const { fields } = useFieldArray({ control, name: 'passengers' });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await save.mutateAsync({
        contact: values.contact,
        passengers: values.passengers.map((p) => ({
          ...p,
          seatLabel: p.type === 'INFANT' ? undefined : p.seatLabel,
        })),
      });
      void navigate(`/book/${booking.reference}/checkout`);
    } catch (err) {
      if (!(err instanceof ApiError))
        return setFormError('Could not save passenger details. Please try again.');
      // Server field paths look like "passengers[1].dateOfBirth"; react-hook-form uses "passengers.1.dateOfBirth".
      let mapped = false;
      for (const e of err.errors) {
        const path = e.field.replace(/\[(\d+)\]/g, '.$1') as Parameters<typeof setError>[0];
        if (/^(contact|passengers)\./.test(path)) {
          setError(path, { type: 'server', message: e.message });
          mapped = true;
        }
      }
      setFormError(mapped ? 'Please fix the highlighted fields.' : err.message);
    }
  });

  return (
    <form
      onSubmit={(e) => void onSubmit(e)}
      noValidate
      className="grid gap-8 lg:grid-cols-[1fr_20rem]"
    >
      <div className="space-y-5">
        <div>
          <h2 className="text-xl font-bold">Who’s travelling?</h2>
          <p className="mt-1 text-sm text-muted">
            Enter names exactly as they appear on each passenger’s travel document.
          </p>
        </div>
        {formError && <Alert>{formError}</Alert>}

        {fields.map((field, i) => {
          const type = field.type;
          const err = errors.passengers?.[i];
          const Icon = type === 'INFANT' ? Baby : User;
          return (
            <Card key={field.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div>
                  <h3 className="font-bold">Passenger {i + 1}</h3>
                  <p className="text-xs text-muted">{TYPE_LABEL[type]}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="First name(s)" error={err?.firstName?.message}>
                  <Input
                    autoComplete={i === 0 ? 'given-name' : 'off'}
                    {...register(`passengers.${i}.firstName`)}
                  />
                </FormField>
                <FormField label="Last name" error={err?.lastName?.message}>
                  <Input
                    autoComplete={i === 0 ? 'family-name' : 'off'}
                    {...register(`passengers.${i}.lastName`)}
                  />
                </FormField>
                <FormField
                  label="Date of birth"
                  hint={`Age is checked on the travel date (${departureDate})`}
                  error={err?.dateOfBirth?.message}
                >
                  <Input
                    type="date"
                    max={todayIso()}
                    {...register(`passengers.${i}.dateOfBirth`)}
                  />
                </FormField>
                <FormField label="Nationality" error={err?.nationality?.message}>
                  <Select {...register(`passengers.${i}.nationality`)}>
                    {(countries.data ?? [{ code: field.nationality, name: field.nationality }]).map(
                      (c) => (
                        <option key={c.code} value={c.code}>
                          {c.name}
                        </option>
                      ),
                    )}
                  </Select>
                </FormField>
                {type === 'INFANT' ? (
                  <p className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2.5 text-sm text-muted sm:col-span-2">
                    <Baby className="size-4" aria-hidden /> Travels on an adult’s lap — no seat
                    needed.
                  </p>
                ) : (
                  <FormField label="Seat" error={err?.seatLabel?.message}>
                    <Select {...register(`passengers.${i}.seatLabel`)}>
                      {seatOptions.map((s) => (
                        <option key={s.label} value={s.label}>
                          {s.label}
                          {s.kind === 'EXTRA_LEGROOM'
                            ? ' · extra legroom'
                            : s.kind === 'EXIT_ROW'
                              ? ' · exit row'
                              : ''}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}
              </div>
            </Card>
          );
        })}

        <Card className="space-y-4">
          <div>
            <h3 className="font-bold">Contact details</h3>
            <p className="text-xs text-muted">
              We’ll send the booking confirmation and e-ticket here.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Email" error={errors.contact?.email?.message}>
              <Input type="email" autoComplete="email" {...register('contact.email')} />
            </FormField>
            <FormField label="Mobile number" error={errors.contact?.phone?.message}>
              <Input
                type="tel"
                autoComplete="tel"
                placeholder="+919876543210"
                {...register('contact.phone')}
              />
            </FormField>
          </div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="space-y-4">
          <h2 className="font-bold">Your seats</h2>
          <ul className="flex flex-wrap gap-2">
            {booking.seats.map((s) => (
              <li
                key={s.label}
                className="flex items-center gap-1.5 rounded-lg bg-navy-900 px-2.5 py-1 font-mono text-xs font-semibold text-white"
              >
                <Armchair className="size-3.5" aria-hidden /> {s.label}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Children can’t sit in exit rows. You can swap who sits where using the seat menus.
          </p>
          <Button type="submit" size="lg" className="w-full" disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Continue to checkout'}
          </Button>
        </Card>
      </aside>
    </form>
  );
}
