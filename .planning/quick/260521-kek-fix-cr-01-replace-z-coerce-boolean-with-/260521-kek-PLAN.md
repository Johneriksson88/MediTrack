---
quick_id: 260521-kek
slug: fix-cr-01-replace-z-coerce-boolean-with-
date: 2026-05-21
mode: quick
description: Replace z.coerce.boolean() on medicationListQuery.belowThreshold with an explicit string-literal parser, add a regression test, and delete a stale TODO comment.
---

# Quick Task 260521-kek — Fix CR-01 + Stale TODO

## Objective

Close CR-01 from `02-REVIEW.md` (and the matching anti-patterns row in `02-VERIFICATION.md`): `belowThreshold: z.coerce.boolean().optional()` on `medicationListQuery` treats the literal string `'false'` as `true`, because `z.coerce.boolean()` is `Boolean(value)` and `Boolean("false") === true`. Direct API callers hitting `GET /api/medications?belowThreshold=false` silently receive a below-threshold-filtered list.

Bundle the IN-04 stale-comment cleanup (same area, MedicationTable.tsx) since it's a one-line edit and the table renders the threshold inline now.

## Tasks

### Task 1: Replace the coercion in medicationListQuery

- **File:** `packages/shared/src/contracts/medication.ts` (line 56)
- **Before:** `belowThreshold: z.coerce.boolean().optional()`
- **After:** `belowThreshold: z.enum(['true', 'false']).transform((v) => v === 'true').optional()`
- **Why:** `z.enum` only accepts the two literal strings; `.transform` maps to a clean boolean; `.optional()` keeps absence as `undefined` so the existing service check `if (belowThreshold)` continues to skip the filter on both `false` and `undefined`.
- **JSDoc update:** Replace the now-misleading comment "`belowThreshold` coerced from string 'true'/'false'/'1'/'0'" with the new contract (only 'true'/'false' accepted; anything else → 400) and a one-line CR-01 reference.

### Task 2: Add a regression test

- **File:** `apps/api/test/contracts.medicationListQuery.test.ts` (new)
- **Coverage:**
  - `'true'` → `true`
  - `'false'` → `false` (the bug — used to be `true`)
  - absent → `undefined`
  - `'1'`, `'yes'`, `''` → rejected (`safeParse({...}).success === false`)
- **Why API package, not shared:** The shared package has no vitest setup (and adding one is scope creep). The api package already runs vitest and imports `@meditrack/shared`. Pure schema test → no DB needed → fast.

### Task 3: Delete stale TODO in MedicationTable.tsx

- **File:** `apps/web/src/routes/lakemedel/MedicationTable.tsx` (line 34)
- **Before:** `* Tröskel cell: number display. // TODO Plan 03: <InlineEditThreshold>`
- **After:** `* Tröskel cell: <InlineEditThreshold> with click-to-edit + optimistic update.`
- **Why:** `InlineEditThreshold` was wired in Plan 02-03 (Wave 4 of Phase 2). The TODO is stale and the JSDoc still claims "number display" — both misleading to readers.

## Must Haves

- `pnpm --filter @meditrack/api exec vitest run test/contracts.medicationListQuery.test.ts` → all 6 tests pass.
- `pnpm --filter @meditrack/api build` → exit 0.
- `pnpm --filter @meditrack/web build` → exit 0.
- `pnpm --filter @meditrack/web exec vitest run` → 40/40 web tests still pass (no regression).
- `packages/shared/dist/index.js` rebuilt (the api package imports from the compiled dist).

## Out of Scope

- CR-02, CR-03, CR-04 fixes — separate quick tasks (#3..#5 in TaskList).
- Adding vitest infrastructure to the `@meditrack/shared` package — defer unless multiple downstream tests accumulate.
- Documenting CR-01 in the README — Phase 7 (Ops & Submission Polish) territory.

## Caller-Safety Check

The FE's `LakemedelPage.tsx` URL-state code only ever writes `?belowThreshold=true` (never `false`) and `useMedicationsQuery.ts` only sets the URL param when the filter object's value is not `undefined`. Combined with `LakemedelPage.tsx:96` (`belowThreshold: belowThreshold || undefined`), the FE never sends `?belowThreshold=false` or `?belowThreshold=0/1/yes`. So this fix is forward-compatible with the FE — it only changes behavior for direct API callers, which are exactly the callers the bug affected.
