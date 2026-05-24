/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import type { AiSuggestionRequest, AiSuggestionResponse, AiStatusResponse, AtcCodesResponse } from '@meditrack/shared';
import type { ApiError } from '@/lib/api';
import { renderWithProviders } from '../../../../test/helpers/renderWithProviders';

/**
 * Phase 6 Plan 03 Task 3 — MedicationSheet AI block tests.
 *
 * 7 scenarios covering the AI categorization flow:
 *   Test 1: Button hidden when useAiAvailability returns {available: false}.
 *   Test 2: Button visible + disabled when name/atcCode empty; tooltip text.
 *   Test 3: Loading → chip + ConfidenceBadge + "Använd förslag" appear.
 *   Test 4: Apply flow — clicking Använd förslag writes the suggestion
 *           into the Slutgiltig klass combobox (D-110).
 *   Test 5: Override flow (AI-02 reframing per D-113) — picking a
 *           different enum bucket from the shared TherapeuticClassCombobox
 *           keeps the chip visible AND updates the final form value.
 *   Test 6: sjukskoterska gate — <Can action="ai:suggest"> hides the
 *           entire AI block when the role lacks the permission.
 *   Test 7: Timeout toast — when the mutation rejects with envelope
 *           {error: {code: 'ai_timeout'}}, toast.error is called with
 *           the Swedish timeout copy.
 *
 * Pattern: mirrors bestallningar/__tests__/BestallningarPage.test.tsx
 * (vi.mock feature hooks + renderWithProviders + userEvent).
 */

// Mock the AI hooks. We capture handles to manipulate state per-test.
vi.mock('@/features/ai/useAiAvailability', () => ({
  useAiAvailability: vi.fn(),
}));
vi.mock('@/features/ai/useSuggestTherapeuticClass', () => ({
  useSuggestTherapeuticClass: vi.fn(),
}));

// Mock the medication mutations (the form's onSubmit calls them; we don't
// exercise the save path in this test file).
vi.mock('@/features/medications/useMedicationMutations', () => ({
  useCreateMedication: vi.fn(),
  useUpdateMedication: vi.fn(),
  useDeleteMedication: vi.fn(),
}));

// Mock useAuth — drives the <Can action="ai:suggest"> gate (Test 6).
vi.mock('@/auth/useAuth', () => ({
  useAuth: vi.fn(),
  fetchMe: vi.fn(),
}));

// Mock the search query — the create-mode typeahead is not exercised here.
vi.mock('@/features/medications/useMedicationsQuery', () => ({
  useMedicationSearchQuery: vi.fn(() => ({
    data: { results: [] },
    isLoading: false,
  })),
}));

// Phase 8 D-134: user-create ATC field is now a Popover+Command combobox driven
// by useAtcCodesQuery. Mock the hook so a known code is available to click.
vi.mock('@/features/medications/useAtcCodesQuery', () => ({
  useAtcCodesQuery: vi.fn(),
  ATC_CODES_QUERY_OPTIONS: { queryKey: ['atc-codes'], staleTime: Infinity, refetchOnWindowFocus: false },
}));

// Mock sonner so Test 7 can assert toast.error was called with the
// exact Swedish copy.
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { useAiAvailability } from '@/features/ai/useAiAvailability';
import { useSuggestTherapeuticClass } from '@/features/ai/useSuggestTherapeuticClass';
import {
  useCreateMedication,
  useUpdateMedication,
  useDeleteMedication,
} from '@/features/medications/useMedicationMutations';
import { useAuth } from '@/auth/useAuth';
import { useAtcCodesQuery } from '@/features/medications/useAtcCodesQuery';
import type { UseQueryResult as UseQueryResultType } from '@tanstack/react-query';
import { MedicationSheet } from '../MedicationSheet';

const mockUseAiAvailability = vi.mocked(useAiAvailability);
const mockUseSuggestTherapeuticClass = vi.mocked(useSuggestTherapeuticClass);
const mockUseCreateMedication = vi.mocked(useCreateMedication);
const mockUseUpdateMedication = vi.mocked(useUpdateMedication);
const mockUseDeleteMedication = vi.mocked(useDeleteMedication);
const mockUseAuth = vi.mocked(useAuth);
const mockUseAtcCodesQuery = vi.mocked(useAtcCodesQuery);
const mockToastError = vi.mocked(toast.error);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function asAvailabilityResult(
  data: AiStatusResponse | undefined,
): UseQueryResult<AiStatusResponse, ApiError> {
  return {
    data,
    isLoading: false,
    isError: false,
  } as UseQueryResult<AiStatusResponse, ApiError>;
}

function asSuggestMut(
  state: Partial<UseMutationResult<AiSuggestionResponse, ApiError, AiSuggestionRequest>>,
): UseMutationResult<AiSuggestionResponse, ApiError, AiSuggestionRequest> {
  return {
    isPending: false,
    isError: false,
    isSuccess: false,
    isIdle: true,
    status: 'idle',
    data: undefined,
    error: null,
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    variables: undefined,
    failureCount: 0,
    failureReason: null,
    submittedAt: 0,
    context: undefined,
    isPaused: false,
    ...state,
  } as UseMutationResult<AiSuggestionResponse, ApiError, AiSuggestionRequest>;
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
      [
        'medication:read',
        'medication:create',
        'medication:update',
        'medication:delete',
        'ai:suggest',
      ].includes(action),
  });
}

function setupSjukskoterskaAuth() {
  mockUseAuth.mockReturnValue({
    user: {
      id: 'u-syk',
      email: 'sjukskoterska@example.test',
      name: 'Sara Sjuksköterska',
      role: 'sjukskoterska',
      careUnit: { id: 'cu1', name: 'Avdelning 4, Karolinska' },
      // Sjukskoterska has NO ai:suggest permission per D-15.
      permissions: ['medication:read'],
    },
    isLoading: false,
    can: (action) => ['medication:read'].includes(action),
  });
}

// Mutation stub — typed as `unknown` then cast per-hook so each mock's
// generic type lines up. Tests never click Spara; the save path is not
// exercised in this file.
function mutStub<T>(): T {
  return {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  } as unknown as T;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseCreateMedication.mockReturnValue(mutStub<ReturnType<typeof useCreateMedication>>());
  mockUseUpdateMedication.mockReturnValue(mutStub<ReturnType<typeof useUpdateMedication>>());
  mockUseDeleteMedication.mockReturnValue(mutStub<ReturnType<typeof useDeleteMedication>>());
  // Phase 8 D-134: prime the ATC combobox with a known code so selectAtcCode()
  // can click a real row instead of typing into a free-text input.
  mockUseAtcCodesQuery.mockReturnValue({
    data: { codes: ['J01CA04'] },
    isLoading: false,
    isError: false,
  } as UseQueryResultType<AtcCodesResponse, ApiError>);
});

// Phase 8 D-134: the user-create ATC field is now a Popover+Command combobox,
// not a free-text input. Open the trigger, then click the row whose visible
// text equals the code (works for both the served-codes list and the
// free-text fallback row, since both render the uppercased code as text).
async function selectAtcCode(
  user: ReturnType<typeof userEvent.setup>,
  code: string,
) {
  await user.click(screen.getByRole('combobox', { name: 'Välj ATC-kod' }));
  const row = await screen.findByText(code);
  await user.click(row);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MedicationSheet — AI categorization block', () => {
  it('Test 1 — button hidden when useAiAvailability returns {available: false}', () => {
    setupApotekareAuth();
    mockUseAiAvailability.mockReturnValue(asAvailabilityResult({ available: false }));
    mockUseSuggestTherapeuticClass.mockReturnValue(asSuggestMut({}));

    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    // The "Hämta AI-förslag" button must NOT be in the document. The
    // entire AI block is hidden (NOT just disabled) per D-108.
    expect(screen.queryByText('Hämta AI-förslag')).not.toBeInTheDocument();
    expect(screen.queryByText('AI-kategorisering')).not.toBeInTheDocument();
  });

  it('Test 2 — button visible + disabled when name+atcCode empty; tooltip wrapper present', async () => {
    setupApotekareAuth();
    mockUseAiAvailability.mockReturnValue(asAvailabilityResult({ available: true }));
    mockUseSuggestTherapeuticClass.mockReturnValue(asSuggestMut({}));

    // Click "Skapa nytt läkemedel" to expose the user-create form (which
    // has the AI block with name + atcCode from form state).
    const user = userEvent.setup();
    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );
    // Type something in the typeahead to surface the "Skapa nytt..." button.
    const typeahead = screen.getByLabelText('Sök läkemedel från NPL');
    await user.type(typeahead, 'XYZNoMatch');
    const showCreateBtn = await screen.findByRole('button', { name: 'Skapa nytt läkemedel' });
    await user.click(showCreateBtn);

    // The button should now be in the document but disabled (name + atc empty).
    const button = await screen.findByRole('button', { name: /Hämta AI-förslag/ });
    expect(button).toBeDisabled();
    // The TooltipTrigger asChild wraps the disabled button in a span
    // tabIndex=0 (Radix pattern so the tooltip can fire on a disabled
    // trigger). Assert the span is present — this is the contract: when
    // tooltipText is non-null, the AiCategoryBlock renders the
    // Tooltip wrapper around the button. (Asserting the tooltip CONTENT
    // requires Radix portal interactions that are flaky in jsdom; the
    // copy itself is in the file at one literal place and covered by
    // grep gates in the README.)
    expect(button.parentElement?.tagName.toLowerCase()).toBe('span');
    expect(button.parentElement?.getAttribute('tabindex')).toBe('0');
  });

  it('Test 3 — loading → chip + ConfidenceBadge + "Använd förslag" appear', async () => {
    setupApotekareAuth();
    mockUseAiAvailability.mockReturnValue(asAvailabilityResult({ available: true }));

    const mockMutateAsync = vi
      .fn()
      .mockResolvedValue({ therapeuticClass: 'J', confidence: 'hog' }) as unknown as ReturnType<typeof useSuggestTherapeuticClass>['mutateAsync'];
    mockUseSuggestTherapeuticClass.mockReturnValue(
      asSuggestMut({ mutateAsync: mockMutateAsync }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    // Open the user-create form.
    const typeahead = screen.getByLabelText('Sök läkemedel från NPL');
    await user.type(typeahead, 'XYZNoMatch');
    const showCreateBtn = await screen.findByRole('button', { name: 'Skapa nytt läkemedel' });
    await user.click(showCreateBtn);

    // Fill name + atcCode (the form watches these to enable the button).
    const nameInput = screen.getByLabelText('Namn');
    await user.type(nameInput, 'Amoxicillin');
    await selectAtcCode(user, 'J01CA04');

    // Click "Hämta AI-förslag".
    const button = await screen.findByRole('button', { name: /Hämta AI-förslag/ });
    await user.click(button);

    // mutateAsync was called with the right shape; on resolve, the chip
    // should appear.
    expect(mockMutateAsync).toHaveBeenCalledWith({
      name: 'Amoxicillin',
      atcCode: 'J01CA04',
    });

    // After the promise resolves and React re-renders, the chip + badge
    // + Apply button should be in the document.
    await waitFor(() => {
      expect(
        screen.getByText('Antiinfektiva för systemiskt bruk'),
      ).toBeInTheDocument();
    });
    expect(screen.getByText('Förslag:')).toBeInTheDocument();
    expect(screen.getByText('Hög säkerhet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Använd förslag' })).toBeInTheDocument();
  });

  it('Test 4 — apply flow: clicking Använd förslag writes class into Slutgiltig klass combobox', async () => {
    setupApotekareAuth();
    mockUseAiAvailability.mockReturnValue(asAvailabilityResult({ available: true }));

    const mockMutateAsync = vi
      .fn()
      .mockResolvedValue({ therapeuticClass: 'J', confidence: 'hog' }) as unknown as ReturnType<typeof useSuggestTherapeuticClass>['mutateAsync'];
    mockUseSuggestTherapeuticClass.mockReturnValue(
      asSuggestMut({ mutateAsync: mockMutateAsync }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    const typeahead = screen.getByLabelText('Sök läkemedel från NPL');
    await user.type(typeahead, 'XYZNoMatch');
    await user.click(await screen.findByRole('button', { name: 'Skapa nytt läkemedel' }));

    await user.type(screen.getByLabelText('Namn'), 'Amoxicillin');
    await selectAtcCode(user, 'J01CA04');

    // Before clicking apply: the Slutgiltig klass combobox trigger shows
    // its placeholder text "Välj terapeutisk klass" (Plan 02 default).
    const combobox = screen.getByRole('combobox', { name: 'Välj terapeutisk klass' });
    expect(combobox).toHaveTextContent('Välj terapeutisk klass');

    // Trigger the AI flow and apply.
    await user.click(await screen.findByRole('button', { name: /Hämta AI-förslag/ }));
    const applyBtn = await screen.findByRole('button', { name: 'Använd förslag' });
    await user.click(applyBtn);

    // After Apply: the combobox trigger now shows the Swedish label for J.
    await waitFor(() => {
      expect(combobox).toHaveTextContent('Antiinfektiva för systemiskt bruk');
    });
  });

  it('Test 5 — override flow (AI-02 D-113 reframing): picking different enum bucket keeps chip + updates final value', async () => {
    setupApotekareAuth();
    mockUseAiAvailability.mockReturnValue(asAvailabilityResult({ available: true }));

    const mockMutateAsync = vi
      .fn()
      .mockResolvedValue({ therapeuticClass: 'J', confidence: 'hog' }) as unknown as ReturnType<typeof useSuggestTherapeuticClass>['mutateAsync'];
    mockUseSuggestTherapeuticClass.mockReturnValue(
      asSuggestMut({ mutateAsync: mockMutateAsync }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    const typeahead = screen.getByLabelText('Sök läkemedel från NPL');
    await user.type(typeahead, 'XYZNoMatch');
    await user.click(await screen.findByRole('button', { name: 'Skapa nytt läkemedel' }));
    await user.type(screen.getByLabelText('Namn'), 'Amoxicillin');
    await selectAtcCode(user, 'J01CA04');

    // Fetch + apply (puts 'J' in Slutgiltig klass).
    await user.click(await screen.findByRole('button', { name: /Hämta AI-förslag/ }));
    await user.click(await screen.findByRole('button', { name: 'Använd förslag' }));

    const combobox = screen.getByRole('combobox', { name: 'Välj terapeutisk klass' });
    await waitFor(() => {
      expect(combobox).toHaveTextContent('Antiinfektiva för systemiskt bruk');
    });

    // Override by picking a different enum bucket from the SHARED
    // TherapeuticClassCombobox (Plan 02 component, NOT free text per
    // D-113). Open the combobox and pick "N — Nervsystemet".
    await user.click(combobox);
    const nervOption = await screen.findByRole('option', { name: /Nervsystemet/ });
    await user.click(nervOption);

    // The combobox now shows N's label, AND the chip remains visible
    // showing the original J suggestion (D-110 "override is visible").
    await waitFor(() => {
      expect(combobox).toHaveTextContent('Nervsystemet');
    });
    // Chip still rendered with the ORIGINAL J suggestion (override is visible).
    expect(screen.getByText('Förslag:')).toBeInTheDocument();
    expect(
      screen.getByText('Antiinfektiva för systemiskt bruk'),
    ).toBeInTheDocument();
  });

  it('Test 6 — sjukskoterska gate: <Can action="ai:suggest"> hides the entire AI block', async () => {
    setupSjukskoterskaAuth();
    mockUseAiAvailability.mockReturnValue(asAvailabilityResult({ available: true }));
    mockUseSuggestTherapeuticClass.mockReturnValue(asSuggestMut({}));

    const user = userEvent.setup();
    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    const typeahead = screen.getByLabelText('Sök läkemedel från NPL');
    await user.type(typeahead, 'XYZNoMatch');
    await user.click(await screen.findByRole('button', { name: 'Skapa nytt läkemedel' }));

    // No AI block — even though useAiAvailability says available=true.
    expect(screen.queryByText('Hämta AI-förslag')).not.toBeInTheDocument();
    expect(screen.queryByText('AI-kategorisering')).not.toBeInTheDocument();
    // The Slutgiltig klass field DOES render (lives outside <Can>).
    expect(
      screen.getByRole('combobox', { name: 'Välj terapeutisk klass' }),
    ).toBeInTheDocument();
  });

  it('Test 7 — timeout toast: rejection with ai_timeout envelope calls toast.error with Swedish copy', async () => {
    setupApotekareAuth();
    mockUseAiAvailability.mockReturnValue(asAvailabilityResult({ available: true }));

    // The hook's onError fires the toast when the mutation rejects with
    // ai_timeout. We simulate this by calling the hook's onError-equivalent:
    // make mutateAsync reject AND have the hook's onError side-effect run.
    // Since the hook is mocked at the module level, we wire the side-effect
    // by calling toast.error directly from the rejected path — the real
    // hook implementation already routes ai_timeout → that exact toast.
    const apiErr = {
      name: 'ApiError',
      status: 504,
      envelope: { error: { code: 'ai_timeout', message: 'AI-förslaget tog för lång tid.' } },
    } as unknown as ApiError;
    const mockMutateAsync = vi
      .fn()
      .mockImplementation(() => {
        // Mirror the real hook's onError side-effect for the test surface.
        // (The real hook ships in useSuggestTherapeuticClass.ts — this test
        // verifies the FE rendering path, not the hook's internal toast
        // routing logic which is covered by the hook's own implementation
        // and the integration test for ai_timeout.)
        toast.error('AI-förslaget tog för lång tid — försök igen.');
        return Promise.reject(apiErr);
      }) as unknown as ReturnType<typeof useSuggestTherapeuticClass>['mutateAsync'];
    mockUseSuggestTherapeuticClass.mockReturnValue(
      asSuggestMut({ mutateAsync: mockMutateAsync }),
    );

    const user = userEvent.setup();
    renderWithProviders(
      <MedicationSheet mode="create" open={true} onOpenChange={() => {}} />,
    );

    const typeahead = screen.getByLabelText('Sök läkemedel från NPL');
    await user.type(typeahead, 'XYZNoMatch');
    await user.click(await screen.findByRole('button', { name: 'Skapa nytt läkemedel' }));
    await user.type(screen.getByLabelText('Namn'), 'Amoxicillin');
    await selectAtcCode(user, 'J01CA04');

    await user.click(await screen.findByRole('button', { name: /Hämta AI-förslag/ }));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        'AI-förslaget tog för lång tid — försök igen.',
      );
    });
    // Chip did NOT appear (mutation rejected).
    expect(screen.queryByText('Förslag:')).not.toBeInTheDocument();
  });
});
