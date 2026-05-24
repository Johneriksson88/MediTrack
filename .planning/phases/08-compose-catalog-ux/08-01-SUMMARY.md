---
phase: 08-compose-catalog-ux
plan: 01
subsystem: medication-catalog
tags: [atc-combobox, shared-component, be-endpoint, tanstack-query, integration-tests, D-132, D-133, D-134]
dependency_graph:
  requires: []
  provides: [AtcCodeCombobox, useAtcCodesQuery, GET /api/medications/atc-codes, atcCodesResponse]
  affects: [LakemedelFilter, MedicationSheet, useMedicationMutations]
tech_stack:
  added:
    - packages/shared/src/contracts/medication.ts: atcCodesResponse Zod schema + AtcCodesResponse type
    - apps/api/src/routes/medications/atcCodes.ts: new Fastify route registrar (requireSession-only)
    - apps/api/src/services/medication.service.ts: listGlobalAtcCodes() with SELECT DISTINCT ORDER BY ASC
    - apps/web/src/features/medications/useAtcCodesQuery.ts: TanStack Query hook + ATC_CODES_QUERY_OPTIONS named export
    - apps/web/src/components/AtcCodeCombobox.tsx: shared Popover+Command combobox with free-text fallback
  patterns:
    - D-132: SELECT DISTINCT atcCode from global Medication catalog sorted ascending
    - D-133: staleTime Infinity + explicit invalidation on useCreateMedication.onSuccess
    - D-134: single shared combobox file consumed by two surfaces (LakemedelFilter + MedicationSheet)
    - TherapeuticClassCombobox shell structure mirrored verbatim (Phase 6 D-116 precedent)
    - ATC_CODES_QUERY_OPTIONS named export (mirrors LOW_STOCK_QUERY_OPTIONS from Phase 6)
key_files:
  created:
    - apps/api/src/routes/medications/atcCodes.ts
    - apps/api/src/services/medication.service.ts (listGlobalAtcCodes function)
    - apps/web/src/components/AtcCodeCombobox.tsx
    - apps/web/src/features/medications/useAtcCodesQuery.ts
    - apps/api/test/medications.atcCodes.integration.test.ts
    - apps/web/src/components/__tests__/AtcCodeCombobox.test.tsx
  modified:
    - packages/shared/src/contracts/medication.ts (atcCodesResponse + AtcCodesResponse)
    - packages/shared/src/index.ts (re-export atcCodesResponse + AtcCodesResponse)
    - apps/api/src/routes/medications/index.ts (register atcCodesRoute before :id routes)
    - apps/web/src/routes/lakemedel/LakemedelFilter.tsx (replace inline ATC block with AtcCodeCombobox; drop atcSuggestions prop)
    - apps/web/src/routes/lakemedel/LakemedelPage.tsx (remove atcSuggestions prop + useMemo computation)
    - apps/web/src/routes/lakemedel/MedicationSheet.tsx (replace Input with Controller-wrapped AtcCodeCombobox)
    - apps/web/src/features/medications/useMedicationMutations.ts (add atc-codes invalidation in useCreateMedication.onSuccess)
decisions:
  - D-132 implemented: SELECT DISTINCT atcCode FROM Medication WHERE atcCode IS NOT NULL ORDER BY atcCode ASC via prisma.$queryRaw
  - D-133 implemented: staleTime Infinity + refetchOnWindowFocus false + explicit invalidation on create
  - D-134 implemented: single AtcCodeCombobox file in src/components/ consumed by LakemedelFilter + MedicationSheet
  - atcCodesRoute registered BEFORE :id routes in medications barrel (D-65 precedent)
  - Inline LakemedelFilter ATC state (localAtc, atcOpen, useEffect, filteredSuggestions) fully removed
  - Unused Popover+Command imports removed from LakemedelFilter (now internal to AtcCodeCombobox)
  - useMemo removed from LakemedelPage (atcSuggestions computation eliminated)
  - 'as const' workaround for Infinity: full object const assertion used instead of Infinity as const (TS1355)
metrics:
  duration: 685s
  completed: "2026-05-24"
  tasks_completed: 3
  files_created: 6
  files_modified: 7
---

# Phase 8 Plan 01: ATC Code Combobox (CAT-09) Summary

**One-liner:** GET /api/medications/atc-codes + shared AtcCodeCombobox with free-text fallback wired into LakemedelFilter and MedicationSheet user-create form, backed by staleTime-Infinity TanStack cache with useCreateMedication invalidation.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Shared contract + BE endpoint + integration test for GET /api/medications/atc-codes | 27e1c4a | Done |
| 2 | Shared AtcCodeCombobox component + TanStack hook + component test | e9f361a | Done |
| 3 | Wire AtcCodeCombobox into MedicationSheet + LakemedelFilter + cache invalidation | 716bf23 | Done |

## Verification Results

### Automated Tests

**BE Integration Tests (3/3 pass):**
- Test A (shape + sort): GET /api/medications/atc-codes returns 200, Zod-parses through atcCodesResponse, length > 100, ascending sorted
- Test B (unauthenticated → 401): requireSession gate enforced, envelope code = 'unauthenticated' (T-08-01)
- Test C (distinct): `new Set(codes).size === codes.length` — DISTINCT clause verified

**FE Component Tests (7/7 pass):**
- Test 1: Placeholder visible at idle, click opens dropdown showing loaded codes
- Test 1b: Loading state shows Laddar ATC-koder… with Loader2 spinner
- Test 2: Clicking a list code calls onChange with that code
- Test 3: Typing unknown query shows (fri sökning) fallback row
- Test 4: Free-text value is uppercased on select (abc → ABC)
- Test 5: Clear × calls onChange('') without opening popover (stopPropagation verified)
- Test 6: ATC_CODES_QUERY_OPTIONS.staleTime === Infinity, refetchOnWindowFocus === false (D-133 cache contract)

### TypeScript
- `pnpm --filter @meditrack/shared exec tsc --noEmit`: exits 0
- `pnpm --filter @meditrack/web exec tsc --noEmit` (via npx): exits 0

### Done Criteria Checks
- `grep -n "atcCodesRoute" apps/api/src/routes/medications/index.ts`: returns register line at line 24
- `grep -F "Rensa ATC-kod" apps/web/src/components/AtcCodeCombobox.tsx`: 2 matches
- `grep -F "(fri sökning)" apps/web/src/components/AtcCodeCombobox.tsx`: 2 matches
- `grep -F "atcSuggestions" apps/web/src/routes/lakemedel/LakemedelFilter.tsx`: 0 code matches
- `grep -F "AtcCodeCombobox" apps/web/src/routes/lakemedel/LakemedelFilter.tsx`: ≥ 1 match
- `grep -F "AtcCodeCombobox" apps/web/src/routes/lakemedel/MedicationSheet.tsx`: ≥ 1 match
- `grep -F "['atc-codes']" apps/web/src/features/medications/useMedicationMutations.ts`: exactly 1 match

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript TS1355 — Infinity cannot be used with `as const` on its own**
- **Found during:** Task 3 typecheck
- **Issue:** `staleTime: Infinity as const` fails with TS1355 "A 'const' assertions can only be applied to references to enum members, or string, number, boolean, array, or object literals." Infinity is a global numeric constant, not a literal.
- **Fix:** Changed to `} as const` on the whole object instead — TypeScript infers the const type correctly for the whole ATC_CODES_QUERY_OPTIONS object. The test assertion `ATC_CODES_QUERY_OPTIONS.staleTime === Infinity` still passes correctly.
- **Files modified:** apps/web/src/features/medications/useAtcCodesQuery.ts
- **Commit:** 716bf23 (included in Task 3 commit)

**2. [Rule 2 - Missing functionality] Shared package not built for integration test runner**
- **Found during:** Task 1 integration test run
- **Issue:** Node.js module resolution couldn't find `atcCodesResponse` export because packages/shared/dist was out of date — the package needed a `pnpm build` after adding the new export.
- **Fix:** Ran `pnpm --filter @meditrack/shared build` before running integration tests. This is the standard workflow for this monorepo.
- **Files modified:** packages/shared/dist/* (generated, not committed)
- **Commit:** n/a (build is a runtime step)

**3. [Rule 1 - Minor] Component test count exceeds plan minimum (7 vs 6)**
- **Found during:** Task 2 test writing
- **Issue:** Added an extra Test 1b for the loading state (Laddar ATC-koder… text), since the loading branch existed in the component and deserved coverage.
- **Fix:** Kept the extra test; it strengthens coverage without changing semantics.
- **Files modified:** apps/web/src/components/__tests__/AtcCodeCombobox.test.tsx
- **Commit:** e9f361a

### Structural Decisions

- **Unused imports removed from LakemedelFilter:** The Popover/PopoverContent/PopoverTrigger/Command/CommandEmpty/CommandGroup/CommandInput/CommandItem/CommandList imports were removed since they are now internal to AtcCodeCombobox. TherapeuticClassCombobox uses them internally too, so LakemedelFilter no longer needed them.
- **useMemo removed from LakemedelPage:** The `atcSuggestions` useMemo computation was dead code once the prop was removed, so the import was cleaned up too.
- **Test approach:** Used vi.mock for useAtcCodesQuery (same pattern as DashboardLowStockCard tests mocking useLowStockQuery) rather than vi.spyOn(global, 'fetch') as suggested in the plan. This is cleaner, more reliable, and consistent with the existing test codebase conventions.

## Known Stubs

None. All Plan 01 surfaces are wired to real data:
- GET /api/medications/atc-codes returns live data from the Medication table
- AtcCodeCombobox renders real codes from useAtcCodesQuery
- LakemedelFilter's ATC control reads the global catalog
- MedicationSheet's user-create ATC field writes to the form state

## Threat Flags

No new threat surfaces beyond those in the plan's threat model:
- GET /api/medications/atc-codes guarded by requireSession (T-08-01 mitigated)
- User-create ATC code path guarded by existing medicationCreateUserRequest Zod validation (T-08-05 accepted)
- No new write paths; no new packages installed

## Self-Check: PASSED

Files created:
- [FOUND] apps/api/src/routes/medications/atcCodes.ts
- [FOUND] apps/web/src/components/AtcCodeCombobox.tsx
- [FOUND] apps/web/src/features/medications/useAtcCodesQuery.ts
- [FOUND] apps/api/test/medications.atcCodes.integration.test.ts
- [FOUND] apps/web/src/components/__tests__/AtcCodeCombobox.test.tsx

Commits:
- [FOUND] 27e1c4a — feat(08-01): shared contract + BE endpoint + integration test
- [FOUND] e9f361a — feat(08-01): shared AtcCodeCombobox component + TanStack hook + 7 component tests
- [FOUND] 716bf23 — feat(08-01): wire AtcCodeCombobox into MedicationSheet + LakemedelFilter + cache invalidation
