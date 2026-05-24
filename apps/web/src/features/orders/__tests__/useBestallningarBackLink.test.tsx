/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useBestallningarBackLink } from '../useBestallningarBackLink';

/**
 * Phase 9 ORD-10 / D-149 / D-151 / D-153 / D-154 / D-156 —
 * useBestallningarBackLink hook tests.
 *
 * Scenarios (per 09-CONTEXT.md `<test surface>` and 09-PATTERNS.md
 * `useBestallningarBackLink.test.tsx` entry):
 *
 *   1. Valid `?from=skickad` wins over no fallback → `?status=skickad`.
 *   2. Invalid `?from=garbage` silently treated as missing (D-156).
 *   3. Missing `?from=` uses `fallbackStatus: 'bekraftad'` → `?status=bekraftad`.
 *   4. Neither present → bare `/bestallningar` (no query string).
 *   5. Recompute on rerender (D-154) — fallback follows live order.status.
 *   6. Every StatusTab member accepted as `?from=` (utkast/skickad/
 *      bekraftad/levererad/alla).
 *   7. label is always the verbatim Swedish copy
 *      `'Tillbaka till beställningar'` (preserves the existing
 *      ComposeOrderPage assertion at line 236 of its test file).
 *
 * Pattern: renderHook + MemoryRouter wrapper. No QueryClient — the
 * hook only depends on `useSearchParams`. Mirrors the renderHook
 * wrapper shape in `apps/web/test/useAuth.test.tsx` lines 41–49 and
 * the MemoryRouter precedent in `apps/web/test/helpers/renderWithProviders.tsx`.
 */

function makeWrapper(initialPath: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>;
  };
}

describe('useBestallningarBackLink', () => {
  describe('(1) valid ?from= wins (no fallback supplied)', () => {
    it('returns /bestallningar?status=skickad when ?from=skickad', () => {
      const { result } = renderHook(() => useBestallningarBackLink(), {
        wrapper: makeWrapper('/?from=skickad'),
      });
      expect(result.current.to).toBe('/bestallningar?status=skickad');
      expect(result.current.label).toBe('Tillbaka till beställningar');
    });
  });

  describe('(2) invalid ?from= treated as missing (D-156 silent drop)', () => {
    it('returns bare /bestallningar when ?from=garbage and no fallback', () => {
      const { result } = renderHook(() => useBestallningarBackLink(), {
        wrapper: makeWrapper('/?from=GARBAGE'),
      });
      expect(result.current.to).toBe('/bestallningar');
      expect(result.current.label).toBe('Tillbaka till beställningar');
    });

    it('falls through to fallback when ?from= is invalid AND fallback is supplied', () => {
      const { result } = renderHook(
        () => useBestallningarBackLink({ fallbackStatus: 'bekraftad' }),
        { wrapper: makeWrapper('/?from=not-a-status') },
      );
      expect(result.current.to).toBe('/bestallningar?status=bekraftad');
    });
  });

  describe('(3) fallback used when ?from= absent (D-153)', () => {
    it('returns /bestallningar?status=bekraftad when fallbackStatus=bekraftad', () => {
      const { result } = renderHook(
        () => useBestallningarBackLink({ fallbackStatus: 'bekraftad' }),
        { wrapper: makeWrapper('/') },
      );
      expect(result.current.to).toBe('/bestallningar?status=bekraftad');
      expect(result.current.label).toBe('Tillbaka till beställningar');
    });
  });

  describe('(4) neither ?from= nor fallback → bare /bestallningar (D-155)', () => {
    it('returns /bestallningar with no query string', () => {
      const { result } = renderHook(() => useBestallningarBackLink(), {
        wrapper: makeWrapper('/'),
      });
      expect(result.current.to).toBe('/bestallningar');
      expect(result.current.label).toBe('Tillbaka till beställningar');
    });
  });

  describe('(5) recompute on rerender (D-154)', () => {
    it('updates `to` when fallbackStatus changes between renders', () => {
      type StatusTab = 'utkast' | 'skickad' | 'bekraftad' | 'levererad' | 'alla';
      type Props = { fallbackStatus?: StatusTab };
      const initialProps: Props = { fallbackStatus: 'skickad' };
      const { result, rerender } = renderHook(
        ({ fallbackStatus }: Props) => useBestallningarBackLink({ fallbackStatus }),
        {
          wrapper: makeWrapper('/'),
          initialProps,
        },
      );
      expect(result.current.to).toBe('/bestallningar?status=skickad');

      rerender({ fallbackStatus: 'bekraftad' });
      expect(result.current.to).toBe('/bestallningar?status=bekraftad');

      rerender({ fallbackStatus: 'levererad' });
      expect(result.current.to).toBe('/bestallningar?status=levererad');
    });

    it('valid ?from= still wins over fallback when both are present', () => {
      const { result } = renderHook(
        () => useBestallningarBackLink({ fallbackStatus: 'bekraftad' }),
        { wrapper: makeWrapper('/?from=alla') },
      );
      expect(result.current.to).toBe('/bestallningar?status=alla');
    });
  });

  describe('(6) each StatusTab member accepted as ?from=', () => {
    const cases = ['utkast', 'skickad', 'bekraftad', 'levererad', 'alla'] as const;
    for (const status of cases) {
      it(`accepts ?from=${status} → /bestallningar?status=${status}`, () => {
        const { result } = renderHook(() => useBestallningarBackLink(), {
          wrapper: makeWrapper(`/?from=${status}`),
        });
        expect(result.current.to).toBe(`/bestallningar?status=${status}`);
        expect(result.current.label).toBe('Tillbaka till beställningar');
      });
    }
  });
});
