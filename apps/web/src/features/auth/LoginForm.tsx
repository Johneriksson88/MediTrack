import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { loginRequest, type LoginRequest } from '@meditrack/shared';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api';
import { useLogin } from './useLogin';

/**
 * Pattern M / D-08 / UI-SPEC §Login.
 *
 * react-hook-form + zodResolver(loginRequest) — schema is the same Zod
 * object the API validates against. On `invalid_credentials` we render a
 * shadcn destructive Alert above the submit button with the verbatim
 * Swedish string from UI-SPEC §Copy.
 *
 * The Alert is the only UI signal for invalid credentials — no toast,
 * no extra modal. Inputs retain their values; only the password could
 * reasonably be retyped, so we don't clear it either.
 */
export function LoginForm() {
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [serverError, setServerError] = useState<string | null>(null);
  const login = useLogin();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginRequest>({
    resolver: zodResolver(loginRequest),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: LoginRequest) {
    setServerError(null);
    try {
      await login.mutateAsync(values);
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.envelope.error.code === 'invalid_credentials') {
          // Verbatim string from UI-SPEC §Copy.
          setServerError('Fel e-post eller lösenord.');
          return;
        }
        setServerError(err.envelope.error.message);
        return;
      }
      setServerError('Ett oväntat fel inträffade.');
    }
  }

  const hasServerError = serverError !== null;
  const pending = isSubmitting || login.isPending;

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">E-post</Label>
        <Input
          id="email"
          type="email"
          autoComplete="username"
          placeholder="din@email.se"
          aria-invalid={errors.email !== undefined || hasServerError}
          aria-describedby={hasServerError ? 'form-error' : undefined}
          disabled={pending}
          {...register('email')}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Lösenord</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password !== undefined || hasServerError}
          aria-describedby={hasServerError ? 'form-error' : undefined}
          disabled={pending}
          {...register('password')}
        />
      </div>

      {hasServerError && (
        <Alert variant="destructive" role="alert" id="form-error">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? (
          <>
            <Loader2 className="animate-spin" aria-hidden="true" />
            <span>Loggar in…</span>
          </>
        ) : (
          'Logga in'
        )}
      </Button>
    </form>
  );
}
