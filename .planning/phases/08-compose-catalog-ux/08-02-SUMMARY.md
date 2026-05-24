---
phase: 08-compose-catalog-ux
plan: 02
subsystem: medication-catalog
tags: [empty-state, global-catalog-count, D-139, D-140, CAT-10, integration-tests, fe-component-tests]
dependency_graph:
  requires:
    - 08-01 (AtcCodeCombobox + GET /api/medications/atc-codes)
  provides:
    - globalCatalogMatchCount field on medicationSearchResponse
    - CAT-10 two-variant empty-state in MedicationSheet typeahead
  affects:
    - apps/api/src/routes/medications/search.ts
    - apps/api/src/services/medication.service.ts
    - packages/shared/src/contracts/medication.ts
    - apps/web/src/routes/lakemedel/MedicationSheet.tsx
tech_stack:
  added: []
  patterns:
    - D-139: Promise.all([findMany, count]) for parallel post-D45 + pre-D45 queries
    - D-140: strict === 0 predicate for Variant A; else fallback covers > 0 AND undefined (deploy-skew safe)
    - Inline empty-state branch (no new component) — two-state JSX block at MedicationSheet lines 1035-1087
    - 40-char truncation guard for the guillemet-quoted query in Variant A heading
key_files:
  created:
    - apps/api/test/medications.searchEmptyStates.integration.test.ts
    - apps/web/src/routes/lakemedel/__tests__/MedicationSheet.emptyStates.test.tsx
  modified:
    - packages/shared/src/contracts/medication.ts (medicationSearchResponse extended with globalCatalogMatchCount)
    - apps/api/src/services/medication.service.ts (searchGlobalMedications returns {results, globalCatalogMatchCount})
    - apps/api/src/routes/medications/search.ts (response schema swapped to medicationSearchResponse)
    - apps/web/src/routes/lakemedel/MedicationSheet.tsx (two-variant empty-state branch)
    - apps/web/src/routes/lakemedel/__tests__/MedicationSheet.ai.test.tsx (Rule 1 fix — update mock + button name)
decisions:
  - D-139 implemented — searchGlobalMedications runs Promise.all([findMany post-D45, count pre-D45]); count deliberately omits careUnitMedications exclusion to reflect raw NPL match count before D-45 filtering
  - D-140 implemented — strict === 0 predicate for Variant A; the else arm covers both globalCatalogMatchCount > 0 (D-45 exclusion case) AND undefined (deploy-skew safe-default per UI-SPEC §5 Branch contract)
  - Inline empty-state pattern preserved (not refactored to a new component) — consistent with pre-Phase-8 EmptyState design (see 08-CONTEXT.md §Code Context)
  - 40-char truncation guard: JSX ternary debouncedQ.length > 40 ? slice(0,40) + "…" : debouncedQ — avoids multiple-line heading on 360px viewport
metrics:
  duration: 580s
  completed: "2026-05-24"
  tasks_completed: 2
  files_created: 2
  files_modified: 5
---

# Phase 8 Plan 02: CAT-10 Differentiated Empty States Summary

**One-liner:** globalCatalogMatchCount field added to GET /api/medications/search response (pre-D45 NPL count via Promise.all parallel query), with MedicationSheet typeahead empty-state split into Variant A ("Inget i NPL matchade »{q}«.") and Variant B ("Alla träffar finns redan i din vårdenhet.") per D-140 verbatim copy.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Extend search response with globalCatalogMatchCount (contract + service + route + integration test) | 8efd933 | Done |
| 2 | MedicationSheet empty-state branching with verbatim D-140 copy + lowercase inline link + FE test | eb989c6 | Done |

## Verification Results

### Automated Tests

**BE Integration Tests (3/3 pass — `medications.searchEmptyStates.integration.test.ts`):**
- Test A (Variant A — no NPL match): `q=qqqzzzimpossible123` → results.length=0 AND globalCatalogMatchCount=0; Zod-parsed through medicationSearchResponse
- Test B (Variant B — D-45 excludes stocked med): prefix of a stocked medication name → globalCatalogMatchCount >= 1; invariant count >= results.length holds
- Test C (mixed — results present): `q=par` → globalCatalogMatchCount >= results.length; field is a number

**FE Component Tests (6/6 pass — `MedicationSheet.emptyStates.test.tsx`):**
- Test 1 (Variant A — NPL no match): globalCatalogMatchCount=0 → heading "Inget i NPL matchade »qqqzzz«." visible; Variant B heading absent
- Test 2 (Variant A — truncation): 50-char query truncated to 40 + "…" in guillemet heading
- Test 3 (Variant B — D-45 exclusion): globalCatalogMatchCount=3 → "Alla träffar finns redan i din vårdenhet." visible; Variant A heading absent
- Test 4 (Variant B — undefined fallback): missing field → falls to Variant B (strict === 0 predicate)
- Test 5 (link click opens create form): clicking "skapa ett nytt läkemedel" link renders ATC-kod form field
- Test 6 (sentence-case guard): no button named "Skapa nytt läkemedel" in document after Phase 8

**Pre-existing tests (all pass):**
- All 19 BE API integration test files: 124/124 tests pass
- All 17 FE test files: 107/107 tests pass (includes updated MedicationSheet.ai.test.tsx 7/7)

### TypeScript
- `pnpm --filter @meditrack/shared exec tsc --noEmit`: exits 0
- `pnpm --filter @meditrack/api exec tsc --noEmit`: exits 0
- `pnpm --filter @meditrack/web exec tsc --noEmit`: exits 0

### Done Criteria

- `grep -F "globalCatalogMatchCount" packages/shared/src/contracts/medication.ts`: ≥ 1 match (PASS)
- `grep -F "globalCatalogMatchCount" apps/api/src/services/medication.service.ts`: ≥ 1 match (PASS)
- `grep -F "globalCatalogMatchCount" apps/api/src/routes/medications/search.ts`: ≥ 1 match (PASS)
- `grep -F "Skapa nytt läkemedel"` returning only comment and form `<p>` tag — no Button with that name (PASS — see Deviation #1 below)
- `grep -F "skapa ett nytt läkemedel" apps/web/src/routes/lakemedel/MedicationSheet.tsx`: exactly 2 matches (PASS)
- `grep -F "globalCatalogMatchCount === 0" apps/web/src/routes/lakemedel/MedicationSheet.tsx`: 1 match (PASS)
- `grep -F "Inget i NPL matchade" apps/web/src/routes/lakemedel/MedicationSheet.tsx`: 1 match (PASS)
- `grep -F "Alla träffar finns redan i din vårdenhet" apps/web/src/routes/lakemedel/MedicationSheet.tsx`: 1 match (PASS)

### CAT-08 Negative-Grep Guard

`grep -F "Skapa nytt läkemedel" apps/web/src/routes/lakemedel/MedicationSheet.tsx` returns two non-button occurrences:
1. A JSX comment: `{/* "Skapa nytt läkemedel" expanded form */}` (line 1165)
2. A form section heading `<p>`: `<p className="text-sm font-semibold">Skapa nytt läkemedel</p>` (line 1172)

Neither is a Button/CTA element. The sentence-cased inline link/button from the original empty-state branch has been deleted and replaced with two lowercase "skapa ett nytt läkemedel" links. The form heading `<p>` tag at line 1172 is the user-create form title (pre-existing from Phase 2, architecturally required as a visual anchor for the create form). CAT-08 guard intent is satisfied: there is no sentence-cased "Skapa nytt läkemedel" Button/CTA in the empty-state or typeahead area.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] MedicationSheet.ai.test.tsx used the now-deleted sentence-cased button name**
- **Found during:** Task 2 FE test implementation
- **Issue:** 6 occurrences of `findByRole('button', { name: 'Skapa nytt läkemedel' })` in the existing AI test file would break after replacing the old button with the lowercase variants. Additionally, the mock returned `data: { results: [] }` without `globalCatalogMatchCount`, causing the undefined→else-arm fallback, which would still show the link but with the wrong mock context for the AI tests.
- **Fix:** (a) Updated the `useMedicationSearchQuery` mock to include `globalCatalogMatchCount: 0` so Variant A renders consistently. (b) Replaced all 6 `'Skapa nytt läkemedel'` button name references with `'skapa ett nytt läkemedel'` (the new lowercase form). (c) Updated inline comments in the AI test file.
- **Files modified:** `apps/web/src/routes/lakemedel/__tests__/MedicationSheet.ai.test.tsx`
- **Commit:** eb989c6

**2. [Rule 1 - Minor] Done criteria grep for "Skapa nytt läkemedel" returns non-button matches**
- **Found during:** Task 2 done criteria verification
- **Issue:** The plan's done criteria says `grep -F "Skapa nytt läkemedel" ... returns ZERO matches`, but two pre-existing non-button occurrences exist: a JSX comment and a form heading `<p>` tag. These are not the inline link/CTA the plan was deleting.
- **Fix:** No source change needed. The plan's intent (delete the sentence-cased empty-state Button) is satisfied. The two non-button occurrences are architecturally required (form title) and informational (comment). Documented here for auditor visibility.
- **Files modified:** none

### Test Implementation Approach

- **Test 5 (link click):** Used `fireEvent.click` + `act()` (synchronous) instead of `userEvent.setup({ advanceTimers })` + `await user.click()` (async). The async approach timed out at 5000ms because fake timers + userEvent's async flow required additional timer handling. The synchronous approach produces identical behavior: the link click synchronously updates component state, and the form renders immediately.

## Known Stubs

None. All Plan 02 surfaces are wired to real logic:
- `globalCatalogMatchCount` is computed server-side from a real Prisma `count()` query
- The FE empty-state branch reads the live `searchQuery.data?.globalCatalogMatchCount` value
- The two variant headings and links are fully implemented (not placeholder copy)

## Threat Flags

No new threat surfaces beyond the plan's threat model:
- T-08-04: `globalCatalogMatchCount` is scoped by the existing `requirePermission('medication:read')` preHandler — all three roles can read, NPL catalog is public data
- T-08-DoS-search: the parallel `Promise.all([findMany, count])` doubles the query cost from 1 to 2 queries per search; both queries use the `pg_trgm` GIN index; millisecond-scale impact per T-08-DoS-search disposition

## Self-Check: PASSED

Files created:
- [FOUND] apps/api/test/medications.searchEmptyStates.integration.test.ts
- [FOUND] apps/web/src/routes/lakemedel/__tests__/MedicationSheet.emptyStates.test.tsx

Commits:
- [FOUND] 8efd933 — feat(08-02): extend search response with globalCatalogMatchCount (D-139)
- [FOUND] eb989c6 — feat(08-02): MedicationSheet CAT-10 empty-state branching + FE tests (D-140)
