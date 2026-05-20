import { QueryClient } from '@tanstack/react-query';

/**
 * Pattern K — TanStack Query client.
 *
 * Defaults match the locked behavior from D-12 / D-13:
 *   - retry: 1            — one retry on transient failure
 *   - refetchOnWindowFocus: false   — interview demo doesn't need it
 *   - staleTime: 30_000   — keep `/me` cached for 30s so navigating
 *                           between authenticated routes doesn't refetch
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});
