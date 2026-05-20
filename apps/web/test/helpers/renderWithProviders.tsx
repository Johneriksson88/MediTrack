import { type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * Render helper wrapping the component under test with the providers that
 * the MediTrack web client depends on:
 *   - QueryClientProvider  (TanStack Query — useAuth / useLogout / etc.)
 *   - MemoryRouter         (React Router — NavLink, Navigate, Outlet)
 *
 * Each call creates a fresh QueryClient so tests are isolated.
 */
export interface RenderOptions {
  /** Initial URL for the MemoryRouter (default: '/') */
  initialPath?: string;
  /** Pre-seeded query data — inject before render so useQuery reads it synchronously */
  queryData?: Array<{ queryKey: unknown[]; data: unknown }>;
}

export function renderWithProviders(
  ui: ReactNode,
  { initialPath = '/', queryData = [] }: RenderOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Disable retries in tests so failures are immediate
        retry: false,
        // Prevent background refetches from interfering with assertions
        refetchOnWindowFocus: false,
        staleTime: Infinity,
      },
    },
  });

  // Pre-seed query cache synchronously so hooks that call useQuery(['me'])
  // read the injected data without making a real network request.
  for (const { queryKey, data } of queryData) {
    queryClient.setQueryData(queryKey, data);
  }

  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );

  return { ...result, queryClient };
}
