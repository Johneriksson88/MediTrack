import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { MeResponse } from '@meditrack/shared';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { LoginForm } from '@/features/auth/LoginForm';

/**
 * UI-SPEC §Login / AUTH-01.
 *
 * Full-viewport centered shadcn Card on the dominant `#F8FAFC` surface
 * (here via `bg-background` since the CSS-variable palette already
 * resolves to that hex). Heading `Logga in` is `text-2xl font-semibold`
 * per UI-SPEC §Typography.
 *
 * If the `['me']` query is already in the cache (e.g. a user typed
 * /login while authenticated), redirect to /dashboard so the back
 * button doesn't loop them through login again.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const cached = queryClient.getQueryData<MeResponse>(['me']);
    if (cached) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate, queryClient]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-background">
      <Card className="w-full max-w-[28rem] p-6 sm:p-8 shadow-sm">
        <CardHeader className="p-0 pb-6">
          {/* UI-SPEC §Typography — page title is text-2xl semibold. */}
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">
            Logga in
          </h1>
        </CardHeader>
        <CardContent className="p-0">
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
