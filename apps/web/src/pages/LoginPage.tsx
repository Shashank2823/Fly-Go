import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';
import { useLogin } from '../api/auth';
import { FormField } from '../components/form/FormField';
import { Alert } from '../components/ui/Alert';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { applyServerErrors } from '../features/auth/apply-server-errors';
import { AuthCard } from '../features/auth/AuthCard';

const schema = z.object({
  email: z.email('Enter a valid email address').trim(),
  password: z.string().min(1, 'Enter your password'),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const [params] = useSearchParams();
  const login = useLogin();
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      // GuestOnly performs the redirect once the session is visible.
    } catch (err) {
      setFormError(applyServerErrors(err, ['email', 'password'], setError));
    }
  });

  return (
    <AuthCard title="Welcome back" subtitle="Sign in to search, book and manage your trips.">
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-4">
        {formError && <Alert>{formError}</Alert>}
        <FormField label="Email address" error={errors.email?.message}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register('email')}
          />
        </FormField>
        <FormField label="Password" error={errors.password?.message}>
          <Input type="password" autoComplete="current-password" {...register('password')} />
        </FormField>
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        New to FlyGo?{' '}
        <Link
          to={`/register${params.get('next') ? `?next=${encodeURIComponent(params.get('next')!)}` : ''}`}
          className="font-semibold text-navy-700 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </AuthCard>
  );
}
