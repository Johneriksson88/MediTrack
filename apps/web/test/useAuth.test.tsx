import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeResponse } from '@meditrack/shared';

/**
 * AUTH-06 — useAuth hook (apps/web/src/auth/useAuth.ts)
 *
 * Behavioral requirements:
 * - Given a MeResponse with permissions: ['admin:ping'], can('admin:ping') === true.
 * - Given permissions: [], can('admin:ping') === false.
 * - user is null when query data is undefined (loading / unauthenticated).
 * - can() reads live from the query cache, so updating the cache updates can().
 *
 * Strategy: pre-seed the QueryClient cache with queryClient.setQueryData(['me'], ...)
 * so useAuth reads data synchronously without a real network request.
 * fetchMe is NOT called (no network needed — the cache already has data).
 */

// We use the real useAuth (no mock here — this IS the unit under test).
import { useAuth } from '@/auth/useAuth';

const adminMeResponse: MeResponse = {
  id: 'u-admin',
  email: 'admin@example.test',
  name: 'Admin Demo',
  role: 'admin',
  careUnit: { id: 'cu1', name: 'Avdelning 4, Karolinska' },
  permissions: ['admin:ping'],
};

const nurseMeResponse: MeResponse = {
  id: 'u-nurse',
  email: 'nurse@example.test',
  name: 'Sjuksköterska Svensson',
  role: 'sjukskoterska',
  careUnit: { id: 'cu1', name: 'Avdelning 4, Karolinska' },
  permissions: [],
};

function makeWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        // Prevent automatic network fetches in tests
        staleTime: Infinity,
        gcTime: Infinity,
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAuth()', () => {
  describe('with admin user in cache', () => {
    it('returns the user object from the cache', () => {
      const qc = makeQueryClient();
      qc.setQueryData(['me'], adminMeResponse);

      const { result } = renderHook(() => useAuth(), {
        wrapper: makeWrapper(qc),
      });

      expect(result.current.user).toEqual(adminMeResponse);
      expect(result.current.user?.role).toBe('admin');
      expect(result.current.isLoading).toBe(false);
    });

    it('can("admin:ping") returns true when permissions includes admin:ping', () => {
      const qc = makeQueryClient();
      qc.setQueryData(['me'], adminMeResponse);

      const { result } = renderHook(() => useAuth(), {
        wrapper: makeWrapper(qc),
      });

      expect(result.current.can('admin:ping')).toBe(true);
    });
  });

  describe('with non-admin user (sjukskoterska) in cache', () => {
    it('can("admin:ping") returns false when permissions is empty', () => {
      const qc = makeQueryClient();
      qc.setQueryData(['me'], nurseMeResponse);

      const { result } = renderHook(() => useAuth(), {
        wrapper: makeWrapper(qc),
      });

      expect(result.current.can('admin:ping')).toBe(false);
    });

    it('user.role is sjukskoterska', () => {
      const qc = makeQueryClient();
      qc.setQueryData(['me'], nurseMeResponse);

      const { result } = renderHook(() => useAuth(), {
        wrapper: makeWrapper(qc),
      });

      expect(result.current.user?.role).toBe('sjukskoterska');
    });
  });

  describe('with no cache entry (loading / unauthenticated)', () => {
    it('user is null when query data is undefined', () => {
      // Create a fresh client with no pre-seeded data.
      // We also mock fetchMe so it never resolves (simulates loading state
      // without hitting the network).
      const qc = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      });

      // Override the queryFn via the cache so it never settles
      // (we just want the initial undefined/loading state).
      vi.mock('@/auth/useAuth', async (importOriginal) => {
        // Re-export everything but replace fetchMe with a never-resolving fn.
        const mod = await importOriginal<typeof import('@/auth/useAuth')>();
        return {
          ...mod,
          fetchMe: () => new Promise(() => {/* intentionally never resolves */}),
        };
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: makeWrapper(qc),
      });

      // Before the query resolves, data is undefined → user must be null.
      expect(result.current.user).toBeNull();
    });

    it('can() returns false when there is no user (data undefined)', () => {
      const qc = new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
          },
        },
      });

      const { result } = renderHook(() => useAuth(), {
        wrapper: makeWrapper(qc),
      });

      // No data in cache → can must default to false (not throw).
      expect(result.current.can('admin:ping')).toBe(false);
    });
  });

  describe('cache invalidation', () => {
    it('can() reflects updated permissions when cache is updated', async () => {
      const qc = makeQueryClient();
      // Start with nurse (no permissions).
      qc.setQueryData(['me'], nurseMeResponse);

      const { result } = renderHook(() => useAuth(), {
        wrapper: makeWrapper(qc),
      });

      expect(result.current.can('admin:ping')).toBe(false);

      // Simulate a cache update (e.g. after role change).
      // Must be awaited so React processes the re-render triggered by TanStack Query.
      act(() => {
        qc.setQueryData(['me'], adminMeResponse);
      });

      // Use waitFor to let TanStack Query's subscriber push the new data
      // through React's render cycle before asserting.
      await waitFor(() => {
        expect(result.current.can('admin:ping')).toBe(true);
      });
    });
  });
});
