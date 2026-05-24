/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { DashboardOrdersResponse } from '@meditrack/shared';
import type { ApiError } from '@/lib/api';
import { renderWithProviders } from '../../../../test/helpers/renderWithProviders';

/**
 * Phase 9 Plan 03 Task 2 — DashboardOrdersCard component tests.
 *
 * Nine scenarios covering both role subviews + the four render states
 * + the refresh-policy contract:
 *
 *   Test 1 — Nurse subview rendering: Egna utkast + Senaste beställningar
 *     sections render with the locked Swedish headings, count CardDescription,
 *     and the expected number of row links.
 *   Test 2 — Pharmacist/Admin subview rendering (it.each ['apotekare','admin']):
 *     Väntar på bekräftelse + Väntar på leverans sections render identically
 *     for both roles.
 *   Test 3 — Nurse empty state: 'Inga aktiva beställningar.' heading +
 *     emerald CheckCircle2 + role="status" Card (NOT EmptyStateCard).
 *   Test 4 — Apotekare empty state: 'Inga beställningar väntar på åtgärd.'
 *     heading + sub.
 *   Test 5 — Row link carries ?from=<row.status>: a skickad row's anchor
 *     href ends `?from=skickad` so the Slice A back-link helper resolves
 *     back to the matching tab (D-150 #4).
 *   Test 6 — Section header links: nurse Egna utkast/Senaste beställningar
 *     and apotekare Väntar på bekräftelse/Väntar på leverans link to the
 *     correct /bestallningar?status=<tab> URLs (D-141 / specifics §334).
 *   Test 7 — Loading: at least 3 animate-pulse Skeleton bars; no row text.
 *   Test 8 — Error: role="alert" with the Swedish copy
 *     'Kunde inte hämta beställningar — försök igen om en stund.'
 *   Test 9 — Query config contract (D-148): DASHBOARD_ORDERS_QUERY_OPTIONS
 *     literals are asserted directly so a refactor that drops either flag
 *     also breaks the test.
 *
 * Pattern: mirrors DashboardLowStockCard.test.tsx (vi.mock the feature
 * hook + renderWithProviders) — `actual` preserve keeps the real named
 * const live for Test 9.
 */

vi.mock('@/features/dashboard/useDashboardOrdersQuery', async () => {
  // Preserve DASHBOARD_ORDERS_QUERY_OPTIONS (we assert against the real
  // const in Test 9) while stubbing the hook for Tests 1-8.
  const actual = await vi.importActual<
    typeof import('@/features/dashboard/useDashboardOrdersQuery')
  >('@/features/dashboard/useDashboardOrdersQuery');
  return {
    ...actual,
    useDashboardOrdersQuery: vi.fn(),
  };
});

import {
  useDashboardOrdersQuery,
  DASHBOARD_ORDERS_QUERY_OPTIONS,
} from '@/features/dashboard/useDashboardOrdersQuery';
import { DashboardOrdersCard } from '../DashboardOrdersCard';

const mockUseDashboardOrdersQuery = vi.mocked(useDashboardOrdersQuery);

/** Helper: mock useDashboardOrdersQuery with a specific query-state shape. */
function mockQuery(
  state: Partial<UseQueryResult<DashboardOrdersResponse, ApiError>>,
) {
  mockUseDashboardOrdersQuery.mockReturnValue(
    state as UseQueryResult<DashboardOrdersResponse, ApiError>,
  );
}

// --- Fixtures --------------------------------------------------------------

const NURSE_DATA: DashboardOrdersResponse = {
  role: 'sjukskoterska',
  egnaUtkast: {
    count: 2,
    rows: [
      {
        id: 'utk-1',
        status: 'utkast',
        lineCount: 2,
        totalQuantity: 6,
        createdBy: { id: 'u-nurse', name: 'Anna Nurse' },
        createdAt: '2026-05-20T08:00:00.000Z',
      },
      {
        id: 'utk-2',
        status: 'utkast',
        lineCount: 1,
        totalQuantity: 3,
        createdBy: { id: 'u-nurse', name: 'Anna Nurse' },
        createdAt: '2026-05-19T08:00:00.000Z',
      },
    ],
  },
  recentHistory: [
    {
      id: 'hist-1',
      status: 'skickad',
      lineCount: 3,
      totalQuantity: 12,
      createdBy: { id: 'u-other', name: 'Bertil Other' },
      createdAt: '2026-05-18T08:00:00.000Z',
    },
    {
      id: 'hist-2',
      status: 'bekraftad',
      lineCount: 1,
      totalQuantity: 4,
      createdBy: { id: 'u-other', name: 'Cecilia Other' },
      createdAt: '2026-05-17T08:00:00.000Z',
    },
    {
      id: 'hist-3',
      status: 'levererad',
      lineCount: 4,
      totalQuantity: 9,
      createdBy: { id: 'u-other', name: 'David Other' },
      createdAt: '2026-05-16T08:00:00.000Z',
    },
  ],
};

function pharmacistData(
  role: 'apotekare' | 'admin',
): DashboardOrdersResponse {
  return {
    role,
    skickad: {
      count: 3,
      rows: [
        {
          id: 'sk-1',
          status: 'skickad',
          lineCount: 2,
          totalQuantity: 5,
          createdBy: { id: 'u-nurse', name: 'Anna Nurse' },
          createdAt: '2026-05-20T09:00:00.000Z',
        },
        {
          id: 'sk-2',
          status: 'skickad',
          lineCount: 1,
          totalQuantity: 1,
          createdBy: { id: 'u-nurse', name: 'Anna Nurse' },
          createdAt: '2026-05-19T09:00:00.000Z',
        },
        {
          id: 'sk-3',
          status: 'skickad',
          lineCount: 4,
          totalQuantity: 11,
          createdBy: { id: 'u-other', name: 'Bertil Other' },
          createdAt: '2026-05-18T09:00:00.000Z',
        },
      ],
    },
    bekraftad: {
      count: 1,
      rows: [
        {
          id: 'bk-1',
          status: 'bekraftad',
          lineCount: 5,
          totalQuantity: 17,
          createdBy: { id: 'u-other', name: 'Cecilia Other' },
          createdAt: '2026-05-17T09:00:00.000Z',
        },
      ],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DashboardOrdersCard', () => {
  it('Test 1 (nurse subview): renders Egna utkast + Senaste beställningar with counts and rows', () => {
    mockQuery({ data: NURSE_DATA, isLoading: false, isError: false });

    renderWithProviders(<DashboardOrdersCard />);

    // Section headings
    expect(screen.getByText('Egna utkast')).toBeInTheDocument();
    expect(screen.getByText('Senaste beställningar')).toBeInTheDocument();

    // CardDescription on the counted section
    expect(screen.getByText('totalt 2')).toBeInTheDocument();

    // List semantics — 2 lists (Egna utkast + Senaste beställningar)
    const egnaList = screen.getByRole('list', { name: 'Egna utkast' });
    expect(within(egnaList).getAllByRole('listitem')).toHaveLength(2);

    const recentList = screen.getByRole('list', {
      name: 'Senaste beställningar',
    });
    expect(within(recentList).getAllByRole('listitem')).toHaveLength(3);
  });

  it.each(['apotekare', 'admin'] as const)(
    'Test 2 (%s subview): renders Väntar på bekräftelse + Väntar på leverans',
    (role) => {
      mockQuery({
        data: pharmacistData(role),
        isLoading: false,
        isError: false,
      });

      renderWithProviders(<DashboardOrdersCard />);

      expect(screen.getByText('Väntar på bekräftelse')).toBeInTheDocument();
      expect(screen.getByText('Väntar på leverans')).toBeInTheDocument();
      expect(screen.getByText('totalt 3')).toBeInTheDocument();
      expect(screen.getByText('totalt 1')).toBeInTheDocument();

      const skickadList = screen.getByRole('list', {
        name: 'Väntar på bekräftelse',
      });
      expect(within(skickadList).getAllByRole('listitem')).toHaveLength(3);

      const bekraftadList = screen.getByRole('list', {
        name: 'Väntar på leverans',
      });
      expect(within(bekraftadList).getAllByRole('listitem')).toHaveLength(1);
    },
  );

  it('Test 3 (nurse empty state): renders celebratory copy + emerald CheckCircle2', () => {
    mockQuery({
      data: {
        role: 'sjukskoterska',
        egnaUtkast: { count: 0, rows: [] },
        recentHistory: [],
      },
      isLoading: false,
      isError: false,
    });

    const { container } = renderWithProviders(<DashboardOrdersCard />);

    expect(
      screen.getByText('Inga aktiva beställningar.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Skapa en ny beställning när ni behöver fylla på.',
      ),
    ).toBeInTheDocument();

    // CheckCircle2 has text-emerald-600 per the celebratory variant.
    const emeraldIcon = container.querySelector('[class*="text-emerald-600"]');
    expect(emeraldIcon).not.toBeNull();

    // role="status" so screen readers announce the empty state.
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('Test 4 (apotekare empty state): renders celebratory copy', () => {
    mockQuery({
      data: {
        role: 'apotekare',
        skickad: { count: 0, rows: [] },
        bekraftad: { count: 0, rows: [] },
      },
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DashboardOrdersCard />);

    expect(
      screen.getByText('Inga beställningar väntar på åtgärd.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Allt hängt klart — inget att bekräfta eller leverera just nu.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('Test 5 (row link): row anchor href ends ?from=<row.status>', () => {
    // Use pharmacist data so we have rows whose status is not 'utkast' —
    // proves ?from= reflects the row's own status, not a constant.
    mockQuery({
      data: pharmacistData('apotekare'),
      isLoading: false,
      isError: false,
    });

    renderWithProviders(<DashboardOrdersCard />);

    // Every row in skickad section links to /bestallningar/<id>?from=skickad.
    const skickadList = screen.getByRole('list', {
      name: 'Väntar på bekräftelse',
    });
    const skickadRows = within(skickadList).getAllByRole('listitem');
    for (const row of skickadRows) {
      const href = (row as HTMLAnchorElement).getAttribute('href') ?? '';
      expect(href).toMatch(/^\/bestallningar\/[^?]+\?from=skickad$/);
    }

    // The bekraftad row links to /bestallningar/<id>?from=bekraftad.
    const bekraftadList = screen.getByRole('list', {
      name: 'Väntar på leverans',
    });
    const bekraftadRows = within(bekraftadList).getAllByRole('listitem');
    for (const row of bekraftadRows) {
      const href = (row as HTMLAnchorElement).getAttribute('href') ?? '';
      expect(href).toMatch(/^\/bestallningar\/[^?]+\?from=bekraftad$/);
    }
  });

  it('Test 6 (section header links): href matches the role-specific tab map', () => {
    // Nurse: Egna utkast -> ?status=utkast; Senaste beställningar -> ?status=alla.
    mockQuery({ data: NURSE_DATA, isLoading: false, isError: false });
    const { rerender, unmount } = renderWithProviders(<DashboardOrdersCard />);

    {
      const egnaHeader = screen.getByRole('link', { name: 'Egna utkast' });
      expect(egnaHeader.getAttribute('href')).toBe(
        '/bestallningar?status=utkast',
      );
      const recentHeader = screen.getByRole('link', {
        name: 'Senaste beställningar',
      });
      expect(recentHeader.getAttribute('href')).toBe(
        '/bestallningar?status=alla',
      );
    }

    // Re-mount with pharmacist data: Väntar på bekräftelse -> ?status=skickad;
    // Väntar på leverans -> ?status=bekraftad.
    unmount();
    mockQuery({
      data: pharmacistData('apotekare'),
      isLoading: false,
      isError: false,
    });
    rerender(<DashboardOrdersCard />);

    const skickadHeader = screen.getByRole('link', {
      name: 'Väntar på bekräftelse',
    });
    expect(skickadHeader.getAttribute('href')).toBe(
      '/bestallningar?status=skickad',
    );
    const bekraftadHeader = screen.getByRole('link', {
      name: 'Väntar på leverans',
    });
    expect(bekraftadHeader.getAttribute('href')).toBe(
      '/bestallningar?status=bekraftad',
    );
  });

  it('Test 7 (loading): renders at least 3 Skeleton bars and no section content', () => {
    mockQuery({ data: undefined, isLoading: true, isError: false });

    const { container } = renderWithProviders(<DashboardOrdersCard />);

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);

    // No section content rendered while loading.
    expect(screen.queryByText('Egna utkast')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Väntar på bekräftelse'),
    ).not.toBeInTheDocument();
  });

  it('Test 8 (error): renders destructive Alert with the Swedish copy', () => {
    mockQuery({
      data: undefined,
      isLoading: false,
      isError: true,
      error: {
        envelope: { error: { code: 'internal_error', message: 'boom' } },
      } as unknown as ApiError,
    });

    renderWithProviders(<DashboardOrdersCard />);

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(
      'Kunde inte hämta beställningar — försök igen om en stund.',
    );
  });

  it('Test 9 (query config contract): DASHBOARD_ORDERS_QUERY_OPTIONS exposes the D-148 three-layer refresh literals', () => {
    expect(DASHBOARD_ORDERS_QUERY_OPTIONS.refetchOnWindowFocus).toBe(true);
    expect(DASHBOARD_ORDERS_QUERY_OPTIONS.refetchInterval).toBe(30_000);
    expect(DASHBOARD_ORDERS_QUERY_OPTIONS.queryKey).toEqual([
      'dashboard',
      'orders',
    ]);
  });
});
