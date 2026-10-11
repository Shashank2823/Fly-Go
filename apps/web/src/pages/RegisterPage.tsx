import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useRegister } from '../api/auth';
import { useCountries } from '../api/reference';
import { FormField } from '../components/form/FormField';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { applyServerErrors } from '../features/auth/apply-server-errors';
import { AuthCard } from '../features/auth/AuthCard';

// Mirrors the server rules for fast feedback; the API re-validates everything.
const schema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your full name')
    .max(100, 'Name is too long')
    .regex(/^[\p{L}][\p{L}\p{M} .'-]*$/u, 'Use letters, spaces, apostrophes or hyphens'),
  email: z.email('Enter a valid email address').trim(),
  password: z.string().min(10, 'Use at least 10 characters').max(128, 'Use at most 128 characters'),
  phone: z
    .string()
    .trim()
    .regex(/^(\+[1-9]\d{6,14})?$/, 'Use international format, e.g. +919876543210')
    .optional(),
  nationality: z.string().length(2, 'Select your nationality'),
});
type FormValues = z.infer<typeof schema>;
const FIELDS = ['fullName', 'email', 'password', 'phone', 'nationality'] as const;
const DEFAULT_NATIONALITY = 'IN';

export function RegisterPage() {
  const [params] = useSearchParams();
  const registerUser = useRegister();
  const countries = useCountries();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { nationality: DEFAULT_NATIONALITY },
  });

  const onSubmit = handleSubmit(async ({ phone, ...values }) => {
    setFormError(null);
    try {
      await registerUser.mutateAsync({ ...values, ...(phone ? { phone } : {}) });
      // GuestOnly performs the redirect once the session is visible.
    } catch (err) {
      setFormError(applyServerErrors(err, FIELDS, setError));
    }
  });

  return (
    <AuthCard
      title="Create your account"
      subtitle="It takes a minute. Prices are shown for your nationality's market."
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <FormField
          label="Full name"
          hint="As on your travel documents"
          error={errors.fullName?.message}
        >
          <Input autoComplete="name" placeholder="Asha Verma" {...register('fullName')} />
        </FormField>
        <FormField label="Email address" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register('email')}
          />
        </FormField>
        <FormField
          label="Password"
          hint="At least 10 characters — a passphrase works well"
          error={errors.password?.message}
        >
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Phone (optional)" error={errors.phone?.message}>
            <Input
              type="tel"
              autoComplete="tel"
              placeholder="+919876543210"
              {...register('phone')}
            />
          </FormField>
          <FormField label="Nationality" error={errors.nationality?.message}>
            {countries.data ? (
              // Mounted once options exist; defaultValue sets the initial DOM selection.
              <Select
                autoComplete="country"
                defaultValue={DEFAULT_NATIONALITY}
                {...register('nationality')}
              >
                {countries.data.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            ) : (
              <Select disabled aria-busy="true">
                <option>{countries.isError ? 'Could not load countries' : 'Loading…'}</option>
              </Select>
            )}
          </FormField>
        </div>
        <Button type="submit" className="w-full" disabled={registerUser.isPending}>
          {registerUser.isPending ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Already have an account?{' '}
        <Link
          to={`/login${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}
          className="font-semibold text-navy-700 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
