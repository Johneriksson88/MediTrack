/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, act, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { UseQueryResult } from '@tanstack/react-query';
import type { AtcCodesResponse, MedicationSearchResponse } from '@meditrack/shared';
import type { ApiError } from '@/lib/api';
import { renderWithProviders } from '../../../../test/helpers/renderWithProviders';

/**
 * Phase 8 Plan 02 Task 2 — MedicationSheet CAT-10 empty-state branching tests.
 *
 * D-140: MedicationSheet's typeahead empty state branches on
 * `searchQuery.data?.globalCatalogMatchCount`:
 *
 *   Variant A (`globalCatalogMatchCount === 0`): NPL has no match.
 *     Heading: "Inget i NPL matchade »{q}«."
 *     Sub-line: "Kontrollera stavning eller skapa ett nytt läkemedel."
 *
 *   Variant B (else — covers `> 0` AND `undefined` fallback):
 *     D-45 excluded everything (or field not present on legacy BE response).
 *     Heading: "Alla träffar finns redan i din vårdenhet."
 *     Sub-line: "Justera sökningen eller skapa ett nytt läkemedel."
 *
 * 6 tests:
 *   1. Variant A — NPL no match (count=0): verbatim heading with »query« appears.
 *   2. Variant A — truncation: 50-char query truncated to 40 + "…" in heading.
 *   3. Variant B — D-45 exclusion (count=3): "Alla träffar…" heading appears.
 *   4. Variant B — undefined fallback: missing field falls to Variant B (strict === 0).
 *   5. Link click opens create form: clicking the link shows the user-create form.
 *   6. Sentence-case guard: "Skapa nytt läkemedel" (the old button copy) is gone.
 */

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/features/medications/useMedicationMutations', () => ({
  useCreateMedication: vi.fn(),
  useUpdateMedication: vi.fn(),
  useDeleteMedication: vi.fn(),
}));

vi.mock('@/auth/useAuth', () => ({
  useAuth: vi.fn(),
  fetchMe: vi.fn(),
}));

// Phase 8 D-139: the search query now returns { results, globalCatalogMatchCount }.
// We re-mock per test via mockSearchQuery() below.
vi.mock('@/features/medications/useMedicationsQuery', () => ({
  useMedicationSearchQuery: vi.fn(),
}));

// Phase 8 D-134: user-create ATC field is a Popover+Command combobox.
vi.mock('@/features/medications/useAtcCodesQuery', () => ({
  useAtcCodesQuery: vi.fn(),
  ATC_CODES_QUERY_OPTIONS: {
    queryKey: ['atc-codes'],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  },
}));

// AI hooks — not exercised in these tests; stub to idle state.
vi.mock('@/features/ai/useAiAvailability', () => ({
  useAiAvailability: vi.fn(() => ({ data: { available: false }, isLoading: false })),
}));
vi.mock('@/features/ai/useSuggestTherapeuticClass', () => ({
  useSuggestTherapeuticClass: vi.fn(() => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: 'idle',
    data: undefined,
    error: null,
    reset: vi.fn(),
    variables: undefined,
    failureCount: 0,
    failureReason: null,
    submittedAt: 0,
    context: undefined,
    isPaused: false,
  })),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { useMedicationSearchQuery } from '@/features/medications/useMedicationsQuery';
import { useCreateMedication, useUpdateMedication, useDeleteMedication } from '@/features/medications/useMedicationMutations';
import { useAuth } from '@/auth/useAuth';
import { useAtcCodesQuery } from '@/features/medications/useAtcCodesQuery';
import type { UseQueryResult as UseQueryResultType } from '@tanstack/react-query';
import { MedicationSheet } from '../MedicationSheet';

const mockUseMedicationSearchQuery = vi.mocked(useMedicationSearchQuery);
const mockUseCreateMedication = vi.mocked(useCreateMedication);
const mockUseUpdateMedication = vi.mocked(useUpdateMedication);
const mockUseDeleteMedication = vi.mocked(useDeleteMedication);
const mockUseAuth = vi.mocked(useAuth);
const mockUseAtcCodesQuery = vi.mocked(useAtcCodesQuery);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mutStub<T>(): T {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  } as unknown as T;
}

function mockSearchQuery(data: Partial<MedicationSearchResponse> & { isLoading?: boolean }) {
  const { isLoading = false, ...rest } = data;
  mockUseMedicationSearchQuery.mockReturnValue({
    data: Object.keys(rest).length > 0 ? { results: [], ...rest } : undefined,
    isLoading,
    isError: false,
  } as UseQueryResult<MedicationSearchResponse, ApiError>);
}

function setupApotekareAuth() {
  mockUseAuth.mockReturnValue({
    user: {
      id: 'u-apo',
      email: 'apotekare@example.test',
      name: 'Anna Apotekare',
      role: 'apotekare',
      careUnit: { id: 'cu1', name: 'Avdelning 4, Karolinska' },
      permissions: [
        'medication:read',
        'medication:create',
        'medication:update',
        'medication:delete',
        'ai:suggest',
      ],
    },
    isLoading: false,
    can: (action) =>
      ['medication:read', 'medication:create', 'medication:update', 'medication:delete', 'ai:suggest'].includes(action),
  });
}

/**
 * Type a query into the typeahead and advance the debounce so debouncedQ
 * is non-empty and the results panel becomes visible.
 * `fireEvent.change` sets the value; `vi.advanceTimersByTime(200)` runs past
 * the 150 ms `useDebounce` timeout inside MedicationSheet.
 */
function typeAndDebounce(query: string) {
  const input = screen.getByLabelText('Sök läkemedel från NPL');
  act(() => {
    fireEvent.change(input, { target: { value: query } });
  });
  act(() => {
    vi.advanceTimersByTime(200);
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();

  setupApotekareAuth();

  // Stub mutations (save path is not exercised here)
  mockUseCreateMedication.mockReturnValue(mutStub<ReturnType<typeof useCreateMedication>>());
  mockUseUpdateMedication.mockReturnValue(mutStub<ReturnType<typeof useUpdateMedication>>());
  mockUseDeleteMedication.mockReturnValue(mutStub<ReturnType<typeof useDeleteMedication>>());

  // ATC combobox data — not exercised in empty-state tests
  mockUseAtcCodesQuery.mockReturnValue({
    data: { codes: [] as string[] },
    isLoading: false,
    isError: false,
  } as UseQueryResultType<AtcCodesResponse, ApiError>);
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MedicationSheet — CAT-10 empty-state branching (D-140)', () => {
  it('Test 1 (Variant A — NPL no match): renders heading with guillemet-quoted query when globalCatalogMatchCount === 0', () => {
    mockSearchQuery({ results: [], globalCatalogMatchCount: 0 });

    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    typeAndDebounce('qqqzzz');

    // Variant A heading with the user's query quoted in guillemets
    expect(screen.getByText(/Inget i NPL matchade »qqqzzz«\./)).toBeInTheDocument();
    // Variant A inline link (lowercase)
    expect(screen.getByRole('button', { name: 'skapa ett nytt läkemedel' })).toBeInTheDocument();
    // Variant B heading must NOT appear
    expect(screen.queryByText('Alla träffar finns redan i din vårdenhet.')).not.toBeInTheDocument();
  });

  it('Test 2 (Variant A — truncation): a 50-char query is truncated to 40 chars + ellipsis in the heading', () => {
    mockSearchQuery({ results: [], globalCatalogMatchCount: 0 });

    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    const fiftyChars = 'a'.repeat(50);
    typeAndDebounce(fiftyChars);

    // The heading should contain the first 40 chars + "…" and NOT the full 50 chars
    const truncated = 'a'.repeat(40) + '…';
    expect(screen.getByText(new RegExp(`»${truncated}«`))).toBeInTheDocument();
    // The full 50-char string must NOT appear (it was truncated)
    expect(screen.queryByText(new RegExp(`»${'a'.repeat(50)}«`))).not.toBeInTheDocument();
  });

  it('Test 3 (Variant B — D-45 exclusion): renders "Alla träffar…" heading when globalCatalogMatchCount > 0', () => {
    mockSearchQuery({ results: [], globalCatalogMatchCount: 3 });

    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    typeAndDebounce('para');

    expect(screen.getByText('Alla träffar finns redan i din vårdenhet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'skapa ett nytt läkemedel' })).toBeInTheDocument();
    // Variant A heading must NOT appear
    expect(screen.queryByText(/Inget i NPL matchade/)).not.toBeInTheDocument();
  });

  it('Test 4 (Variant B — undefined fallback): renders "Alla träffar…" when globalCatalogMatchCount is absent (deploy-skew safe-default)', () => {
    // Simulate an older BE response that does not include the new field.
    // The strict `=== 0` predicate means undefined falls to the else arm (Variant B).
    // We cast through `unknown` because at runtime a legacy BE response genuinely
    // omits globalCatalogMatchCount — the TypeScript type won't allow us to express
    // this directly since the field is now required.
    mockUseMedicationSearchQuery.mockReturnValue({
      data: { results: [] } as unknown as MedicationSearchResponse,
      isLoading: false,
      isError: false,
    } as UseQueryResult<MedicationSearchResponse, ApiError>);

    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    typeAndDebounce('anyprefix');

    // The undefined case should render Variant B ("Alla träffar…")
    expect(screen.getByText('Alla träffar finns redan i din vårdenhet.')).toBeInTheDocument();
    // Variant A heading must NOT appear (undefined !== 0)
    expect(screen.queryByText(/Inget i NPL matchade/)).not.toBeInTheDocument();
  });

  it('Test 5 (link click opens create form): clicking "skapa ett nytt läkemedel" renders the user-create form', () => {
    mockSearchQuery({ results: [], globalCatalogMatchCount: 0 });

    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    typeAndDebounce('qqqzzz');

    // The link should be in the document synchronously after debounce
    const link = screen.getByRole('button', { name: 'skapa ett nytt läkemedel' });
    expect(link).toBeInTheDocument();

    // Click the link to open the user-create form
    act(() => {
      fireEvent.click(link);
    });

    // The user-create form heading "Skapa nytt läkemedel" (form title <p>) and
    // the ATC-kod label should now be visible
    expect(screen.getByText('Skapa nytt läkemedel')).toBeInTheDocument();
    expect(screen.getByText('ATC-kod')).toBeInTheDocument();
  });

  it('Test 6 (sentence-case guard): the old sentence-cased "Skapa nytt läkemedel" button no longer appears as an inline link in the empty state', () => {
    mockSearchQuery({ results: [], globalCatalogMatchCount: 0 });

    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    typeAndDebounce('qqqzzz');

    // The old sentence-cased copy was: button with name "Skapa nytt läkemedel"
    // Post-Phase-8 that button is deleted from the empty-state branch (CAT-08 guard).
    // The form title <p> "Skapa nytt läkemedel" is NOT rendered in the create flow
    // until the user clicks the link — before clicking it should not be visible.
    // We assert no BUTTON with that exact name exists (it's now lowercase).
    expect(
      screen.queryByRole('button', { name: 'Skapa nytt läkemedel' }),
    ).not.toBeInTheDocument();
  });
});
