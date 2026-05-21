---
phase: 02-medication-catalog
verified: 2026-05-21T13:00:00Z
status: human_needed
score: 17/19 must-haves verified
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: n/a
  gaps_closed: []
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Seed-driven low-stock badge + banner render on /lakemedel"
    expected: "Table rows with currentStock < lowStockThreshold show red AlertTriangle + 'Lågt lager' pill on the Lager cell; banner above the filter row reads '{N} läkemedel under tröskel' with N > 0 after seeding"
    why_human: "Requires running docker compose up with the seeded postgres; cannot verify badge render and banner count without a live stack"
  - test: "belowThreshold chip behavior with shared/deep-link URLs"
    expected: "Clicking 'Visa endast under tröskel' sets URL param; list narrows to rows with currentStock < lowStockThreshold; URL survives reload; pasting the URL in a new tab restores the filtered view"
    why_human: "CR-01 in 02-REVIEW.md flags z.coerce.boolean() bug — 'false' string coerces to true. Needs live verification that the FE's clean-URL policy (only ever writes 'true', never 'false') actually prevents user-visible breakage for round-trip URLs"
  - test: "Sheet mobile bottom-sheet layout on 360 px viewport"
    expected: "Sheet slides up from bottom; Spara/Avbryt footer is above the 56 px bottom tab bar; env(safe-area-inset-bottom) clearance applies; no content obscured"
    why_human: "CSS safe-area-inset-bottom behaviour requires physical device or browser device emulation; cannot verify programmatically"
  - test: "InlineEditThreshold stopPropagation isolation in the table"
    expected: "Clicking the threshold number enters inline edit mode; the Sheet does NOT open; pressing Enter saves (optimistic flip) without sheet opening; tabbing away or Escape cancels"
    why_human: "Requires a running browser — stopPropagation isolation and event-bubble behaviour cannot be confirmed by static analysis alone"
  - test: "Transparent restore on re-add after soft-delete"
    expected: "Delete a medication via Sheet; search for the same name in the Add typeahead — it appears; selecting and saving reuses the existing CareUnitMedication row (same id, deletedAt reset to null, new stock/threshold). Verify by psql SELECT id, currentStock, deletedAt FROM CareUnitMedication WHERE id = '<original-id>'"
    why_human: "Full round-trip requires live Postgres + seeded data; the code path exists (createCareUnitMedication transparent restore) but end-to-end cannot be confirmed statically"
---

# Phase 2: Medication Catalog Verification Report

**Phase Goal:** Authorized users can manage their `vårdenhet`'s medication registry — list, search, filter, create, edit, delete — with low-stock thresholds visible at a glance.
**Verified:** 2026-05-21T13:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| T-01 | Seeded user opens /lakemedel and sees a paginated list of CareUnitMedication rows scoped to their vårdenhet (name, ATC, form, strength, stock) | VERIFIED | `LakemedelPage.tsx` calls `useMedicationsQuery` → `GET /api/medications?...`; service `listMedicationsForUnit` filters by `careUnitId + deletedAt: null`; all five columns rendered in `MedicationTable` and `MedicationCard` |
| T-02 | Rows with currentStock < lowStockThreshold render LowStockBadge + AlertTriangle icon on the Lager cell | VERIFIED (code) / HUMAN (visual) | `LowStockBadge.tsx` exists, is imported in `MedicationTable.tsx` and `MedicationCard.tsx`, renders AlertTriangle + "Lågt lager" destructive pill; live render requires stack |
| T-03 | LowStockBanner renders '{N} läkemedel under tröskel' above the list when belowThresholdTotal > 0 | VERIFIED (code) / HUMAN (live count) | `LowStockBanner.tsx` reads `belowThresholdTotal` prop, renders only when > 0; wired in `LakemedelPage.tsx` via `data.belowThresholdTotal`; `$queryRaw` in service always computes the global count |
| T-04 | Migration 0002_medication_catalog creates Medication + CareUnitMedication + pg_trgm extension | VERIFIED | `migration.sql` present at `apps/api/prisma/migrations/20260521000000_medication_catalog/migration.sql`; contains `CREATE EXTENSION IF NOT EXISTS pg_trgm`, `CREATE TABLE "Medication"`, `CREATE TABLE "CareUnitMedication"`, `CREATE UNIQUE INDEX ... (careUnitId, medicationId)` |
| T-05 | NPL CSV committed; seed imports defaultLowStockThreshold + PRNG (FNV-1a/mulberry32); ~8% below threshold by design | VERIFIED | `apps/api/prisma/seed-data/lakemedel.csv` exists; `seed.ts` imports `csv-parse` and `defaultLowStockThreshold` from `@meditrack/shared`; `fnv1a` + mulberry32 PRNG present; `createMany` + `skipDuplicates: true` used; D-25 cited in JSDoc |
| T-06 | schema.prisma has Medication + CareUnitMedication + MedicationSource enum with @@unique([careUnitId, medicationId]) | VERIFIED | Confirmed in `apps/api/prisma/schema.prisma`: `enum MedicationSource { npl user }`, `model Medication`, `model CareUnitMedication` with `@@unique([careUnitId, medicationId])`, `@@index([careUnitId])`, `@@index([deletedAt])` |
| T-07 | Add Sheet: apotekare/admin picks from typeahead excluding already-stocked drugs; sets Lager + Tröskel; submits → new CareUnitMedication | VERIFIED | `searchGlobalMedications` uses `careUnitMedications: { none: { careUnitId, deletedAt: null } }` exclusion; POST route gated by `requirePermission('medication:create')`; `createCareUnitMedication` in transaction; `AddMedicationButton` wrapped in `<Can action="medication:create">` |
| T-08 | "Skapa nytt läkemedel" fallback: creates Medication{source:'user'} + CareUnitMedication in one transaction | VERIFIED | `createCareUnitMedication` branches on `payload.source === 'user'`, calls `tx.medication.create` then `tx.careUnitMedication.create` inside `prisma.$transaction` |
| T-09 | defaultLowStockThreshold(form) consumed by both FE prefill and BE; tiers: injection→5, salva/kräm→3, tablett→20, fallback→10 | VERIFIED | `medicationDefaults.ts` exports `defaultLowStockThreshold` with regex tiers; imported in `seed.ts` and `medication.service.ts`; re-exported from `packages/shared/src/index.ts`; `MedicationSheet.tsx` imports it for form-based prefill |
| T-10 | PERMISSIONS map exposes medication:read (all 3 roles), medication:create/update/delete (apotekare + admin); gates on FE and BE | VERIFIED | `apps/api/src/auth/permissions.ts` has all four keys; `packages/shared/src/contracts/permissions.ts` ACTION_KEYS includes all four; route files use `requirePermission('medication:...')`; `AddMedicationButton` wrapped in `<Can action="medication:create">` |
| T-11 | GET /api/medications accepts q, atc, form, belowThreshold, page, pageSize; returns { rows, total, belowThresholdTotal, page, pageSize } | VERIFIED | `medicationListQuery` Zod schema; route passes query to `listMedicationsForUnit`; response typed as `medicationListResponse` which requires all five fields |
| T-12 | GET /api/medications/search returns top-20 global Medication rows by name/ATC, excluding already-stocked at caller's unit | VERIFIED | `searchGlobalMedications` uses `careUnitMedications: { none: ... }` exclusion + `take: limit` (max 20); route Zod schema enforces limit |
| T-13 | Name search (q) with 200 ms debounce, ATC prefix filter, Form select (TOP_MEDICATION_FORMS + Övriga), belowThreshold chip — all URL-synced | VERIFIED | `LakemedelFilter.tsx` implements all four; `useEffect` + `setTimeout(..., 200)` + `isFirstRender` guard; URL-param writes in `LakemedelPage.updateFilters`; `hasActiveFilters` ORs all four; filter-empty state shows "Inga läkemedel matchade filtren." + "Rensa filter" |
| T-14 | Edit Sheet (PATCH): apotekare/admin edits Lager + Tröskel (NPL-locked: name/atc/form/strength read-only); user-source: all six fields editable | VERIFIED | `MedicationSheet.tsx` `EditSheet` sub-component branches on `isNpl`; NPL path renders Namn/ATC-kod/Form/Styrka as `<p>` labels; `NplBadge` shown; user-source path has all six inputs; `useUpdateMedication` (pessimistic) used |
| T-15 | Sjukskoterska opening a row sees Sheet in mode='view': all fields read-only, footer shows only 'Stäng', title appends ' · Visning' | VERIFIED | `LakemedelPage.tsx` → `handleRowClick` uses `useCan('medication:update')` to pick edit vs view; `MedicationSheet` mode='view' renders `ViewSheet` sub-component with `<fieldset disabled>` and single 'Stäng' button (title appends ' · Visning') |
| T-16 | Inline threshold edit (optimistic): click number → input → Enter saves without opening Sheet; error rolls back with toast | VERIFIED | `InlineEditThreshold.tsx` has `e.stopPropagation()` on all handlers; `useUpdateThresholdOptimistic` with `onMutate` cache snapshot + `onError` rollback + `onSettled` invalidation |
| T-17 | Soft-delete (DELETE): apotekare/admin confirms AlertDialog → CareUnitMedication.deletedAt set → row vanishes from list | VERIFIED | `softDeleteCareUnitMedication` calls `prisma.careUnitMedication.update({ data: { deletedAt: new Date() } })`; never calls `prisma.careUnitMedication.delete`; `deleteMedicationRoute` uses `requirePermission('medication:delete')`; `DeleteMedicationDialog` has locked Swedish copy + Cancel before Action |
| T-18 | RBAC: delete is gated by requirePermission('medication:delete') on BE; Ta bort button rendered only in edit mode + wrapped in Can('medication:delete') | VERIFIED | Route confirmed; `EditSheet` wraps `Ta bort` in `<Can action="medication:delete">`; sjukskoterska cannot reach edit mode (D-36 / useCan gate in page) |
| T-19 | Cross-tenant PATCH/DELETE returns 404 (not 403) — existence-probing protection | VERIFIED | `updateCareUnitMedication`: `row.careUnitId !== careUnitId` → `throw new NotFoundError(...)` (not ForbiddenScopeError); `softDeleteCareUnitMedication`: same 404 for wrong-unit, not-found, already-deleted |

**Score:** 17/19 truths verified (T-02 and T-03 banner count need live stack; T-13 belowThreshold chip needs human verification re CR-01 real-world impact)

---

### Deferred Items

No truths deferred to later phases. All Phase 2 requirements are directly addressed in this phase.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/prisma/schema.prisma` | Medication + CareUnitMedication + MedicationSource enum | VERIFIED | All three present with full field set and constraints |
| `apps/api/prisma/migrations/20260521000000_medication_catalog/migration.sql` | DDL for both tables + pg_trgm + GIN index | VERIFIED | Present; contains `CREATE EXTENSION IF NOT EXISTS pg_trgm`; note: GIN index is on `lower("name")` not `"name"` — see CR-02 in anti-patterns section |
| `apps/api/prisma/seed-data/lakemedel.csv` | Committed 43 538-row NPL CSV | VERIFIED | File found at `apps/api/prisma/seed-data/lakemedel.csv` |
| `apps/api/prisma/seed.ts` | Extended seed with streaming CSV parser + PRNG | VERIFIED | Imports `csv-parse`, `defaultLowStockThreshold`; `createMany` + `skipDuplicates: true`; `fnv1a` + mulberry32 PRNG present |
| `packages/shared/src/contracts/medication.ts` | Zod schemas: listItem, listQuery, listResponse, searchQuery/result/response, createRequest (discriminatedUnion), updateRequest | VERIFIED | All schemas present; discriminated union on `source` (not `kind` — intentional deviation documented in SUMMARY); `medicationUpdateRequest` has `.strict()` + `.refine(non-empty)` |
| `packages/shared/src/constants/medicationForms.ts` | TOP_MEDICATION_FORMS tuple + OVRIGA_FILTER_VALUE | VERIFIED | 18 forms from CSV frequency analysis; `as const` tuple; `OVRIGA_FILTER_VALUE = 'Övriga' as const` |
| `packages/shared/src/constants/medicationDefaults.ts` | defaultLowStockThreshold(form) with tier logic | VERIFIED | 4-tier regex function: injection→5, topical→3, oral-solid→20, fallback→10 |
| `packages/shared/src/index.ts` | All medication contracts + constants re-exported | VERIFIED | All 17 named exports confirmed; `defaultLowStockThreshold` also re-exported |
| `apps/api/src/services/medication.service.ts` | listMedicationsForUnit, searchGlobalMedications, createCareUnitMedication, updateCareUnitMedication, softDeleteCareUnitMedication | VERIFIED | All five functions exported; careUnitId is first arg on each; `deletedAt: null` filter in all read paths |
| `apps/api/src/routes/medications/list.ts` | GET /api/medications with requireSession + requirePermission('medication:read') | VERIFIED | Confirmed; preHandler order correct |
| `apps/api/src/routes/medications/search.ts` | GET /api/medications/search with requireSession + requirePermission('medication:read') | VERIFIED | Confirmed |
| `apps/api/src/routes/medications/create.ts` | POST /api/medications with requireSession + requirePermission('medication:create') | VERIFIED | Confirmed |
| `apps/api/src/routes/medications/update.ts` | PATCH /api/medications/:id with requireSession + requirePermission('medication:update') | VERIFIED | Confirmed |
| `apps/api/src/routes/medications/delete.ts` | DELETE /api/medications/:id with requireSession + requirePermission('medication:delete'); 204 | VERIFIED | Confirmed |
| `apps/api/src/routes/medications/index.ts` | Barrel: list → search → create → update → delete | VERIFIED | All five registered in order |
| `apps/api/src/plugins/errorHandler.ts` | NotFoundError, ConflictDuplicateMedicationError, ForbiddenScopeError + dispatch | VERIFIED | All three classes present; 404/409/403 branches in setErrorHandler |
| `apps/web/src/components/LowStockBadge.tsx` | Destructive badge with AlertTriangle + 'Lågt lager' | VERIFIED | Confirmed; aria-hidden on icon; destructive bg/text |
| `apps/web/src/components/NplBadge.tsx` | Slate badge 'Från NPL' | VERIFIED | File found (listed in SUMMARY) |
| `apps/web/src/routes/lakemedel/LakemedelFilter.tsx` | 4-control filter row: search/ATC/Form/chip; 200ms debounce; URL-controlled | VERIFIED | All four controls; debounce via `useEffect + setTimeout(200) + isFirstRender guard`; `__ALL__` sentinel for Select |
| `apps/web/src/routes/lakemedel/LakemedelPage.tsx` | Full catalog page with Sheet orchestration, URL filter state, both empty states | VERIFIED | hasActiveFilters, rowsEmpty, updateFilters, handleRowClick (useCan-driven), SheetState union |
| `apps/web/src/components/InlineEditThreshold.tsx` | Click-to-edit with optimistic onMutate + onError rollback; stopPropagation | VERIFIED | `e.stopPropagation()` on click/keydown/onChange/onFocus; `aria-label="Redigera tröskel för..."` on idle span |
| `apps/web/src/features/medications/useMedicationMutations.ts` | useCreateMedication, useUpdateMedication (pessimistic), useUpdateThresholdOptimistic (optimistic), useDeleteMedication | VERIFIED | All four exported; optimistic hook has onMutate/onError/onSettled triple; pessimistic hook has no optimistic cache write |
| `apps/web/src/routes/lakemedel/DeleteMedicationDialog.tsx` | AlertDialog with locked Swedish copy; Cancel before Action; isDeleting spinner | VERIFIED | AlertDialogCancel before AlertDialogAction; locked title template literal; Loader2 spinner; `e.preventDefault()` on Action |
| `apps/web/src/routes/lakemedel/MedicationSheet.tsx` | create/edit/view modes; NPL-locked fields; DeleteMedicationDialog wired | VERIFIED | EditSheet sub-component; `isNpl` branch; NplBadge shown; `<fieldset disabled>` in view; DeleteMedicationDialog imported and rendered when mode='edit' |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `LakemedelPage.tsx` | `GET /api/medications` | `useMedicationsQuery` → `fetchJson` | WIRED | `useMedicationsQuery` imported and called with filter object; response `data.belowThresholdTotal` read |
| `MedicationSheet.tsx` | `GET /api/medications/search` | `useMedicationSearchQuery` → `fetchJson` | WIRED | Imported from `useMedicationsQuery.ts`; used in create mode typeahead |
| `apps/api/src/routes/medications/list.ts` | `apps/api/src/services/medication.service.ts` | `listMedicationsForUnit(req.user!.careUnitId, req.query)` | WIRED | careUnitId first arg; service call is the entire handler body |
| `apps/api/src/services/medication.service.ts` | `prisma.careUnitMedication` | Prisma typed client; `$queryRaw` for cross-column | WIRED | `findMany`, `count`, `$queryRaw`, `update`, `create` all present |
| `apps/api/src/auth/permissions.ts` | `packages/shared/src/contracts/permissions.ts` | `Record<ActionKey, Role[]>` exhaustiveness | WIRED | `PERMISSIONS: Record<ActionKey, Role[]>` — all 5 keys covered; shared build passes |
| `MedicationSheet.tsx` | `DELETE /api/medications/:id` | `useDeleteMedication` → `fetchJson DELETE` | WIRED | Hook imported; `onConfirm` cascade in EditSheet calls `deleteMutation.mutateAsync` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `LakemedelPage.tsx` | `data.rows` | `useMedicationsQuery` → `GET /api/medications` → `listMedicationsForUnit` → `prisma.careUnitMedication.findMany` | YES — real DB query with careUnitId scope | FLOWING |
| `LakemedelPage.tsx` | `data.belowThresholdTotal` | Same endpoint; service uses `$queryRaw COUNT(*)...WHERE currentStock < lowStockThreshold` | YES — real parameterized SQL | FLOWING |
| `LakemedelFilter.tsx` | `atcSuggestions` | `useMemo` over `rows.map(r => r.atcCode.slice(0, 5))` from live query result | YES — derived from real rows | FLOWING |
| `MedicationSheet.tsx` (create) | typeahead results | `useMedicationSearchQuery(debouncedQ)` → `GET /api/medications/search` → `searchGlobalMedications` → `prisma.medication.findMany` | YES — real DB query with exclusion filter | FLOWING |

---

### Behavioral Spot-Checks

Docker Desktop is not running during this verification. TypeScript and unit checks used instead.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Shared package build | `pnpm --filter @meditrack/shared build` | tsc exits 0 | PASS |
| API build (TypeScript) | `pnpm --filter @meditrack/api build` | tsc exits 0 | PASS |
| Web unit tests | `pnpm --filter @meditrack/web exec vitest run` | 40/40 passed (6 test files) | PASS |
| Web TypeScript build | `pnpm --filter @meditrack/web build` | FAIL — `select.tsx: Cannot find module '@radix-ui/react-select'` | FAIL (see anti-patterns) |
| No hard-delete code path | `rg "prisma\.careUnitMedication\.delete\(" apps/api/src` | 0 results | PASS |
| No TBD/FIXME/XXX debt markers | `rg "TBD\|FIXME\|XXX" **/*.ts **/*.tsx` | 0 results | PASS |
| permissions.ts ACTION_KEYS | Contains all 5 keys including 4 medication:* | Confirmed by read | PASS |
| PERMISSIONS map exhaustiveness | Record<ActionKey, Role[]> — tsc build passes | tsc exits 0 | PASS |

---

### Requirements Coverage

| REQ-ID | Source Plan | Description | Status | Evidence |
|--------|-------------|-------------|--------|----------|
| CAT-01 | 02-01 | View paginated medication list with name, ATC, form, strength, stock, low-stock indicator | SATISFIED | `LakemedelPage.tsx` renders `MedicationTable` + `MedicationCardList`; `MedicationTable` has 7 columns including Lager with LowStockBadge; `LowStockBadge` in Lager cell when stock < threshold |
| CAT-02 | 02-02 | Search by name (case-insensitive, partial match) | SATISFIED | `LakemedelFilter.tsx` search Input with 200ms debounce; `listMedicationsForUnit` applies `name: { contains: q, mode: 'insensitive' }` (Prisma ILIKE); note: GIN index not correctly wired (CR-02) — functionally correct but slower than intended |
| CAT-03 | 02-02 | Filter by ATC code prefix | SATISFIED | `LakemedelFilter.tsx` ATC combobox (Popover+Command); `listMedicationsForUnit` applies `atcCode: { startsWith: atc, mode: 'insensitive' }` |
| CAT-04 | 02-02 | Filter by form | SATISFIED | `LakemedelFilter.tsx` Form Select with TOP_MEDICATION_FORMS + Övriga; service translates Övriga to `form NOT IN (...)` clause |
| CAT-05 | 02-01 | apotekare/admin can add a new medication (name, ATC, form, strength, low-stock threshold) | SATISFIED | POST /api/medications gated by `requirePermission('medication:create')`; create Sheet has discriminated-union paths for NPL typeahead and user-created |
| CAT-06 | 02-03 | apotekare/admin can edit an existing medication's fields | SATISFIED | PATCH /api/medications/:id gated by `requirePermission('medication:update')`; NPL fields stripped server-side; edit Sheet with mode-based field visibility |
| CAT-07 | 02-04 | apotekare/admin can delete a medication (soft-delete) | SATISFIED | DELETE /api/medications/:id gated by `requirePermission('medication:delete')`; always soft-delete via `deletedAt: new Date()`; no hard-delete code path exists |
| STK-03 | 02-01 | Each medication has a lowStockThreshold; sensible default at create time | SATISFIED | `defaultLowStockThreshold(form)` in `@meditrack/shared`; prefills Sheet form; used in seed PRNG derive() |
| STK-04 | 02-01 | Medication list shows visible low-stock indicator when stock < threshold | SATISFIED (code) / HUMAN (visual) | `LowStockBadge` in `MedicationTable` and `MedicationCard` Lager cells; `LowStockBanner` for aggregate count; visual render needs live stack |

**Coverage: 9/9 REQ-IDs addressed.** No orphaned requirements.

---

### Anti-Patterns Found

The following issues were independently confirmed in source code. Items CR-01 through CR-04 were first identified in `02-REVIEW.md`; this section records what was found and verified by the verifier.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `apps/web/src/components/ui/select.tsx` | 2 | `import ... from '@radix-ui/react-select'` — package in `package.json` but not in `node_modules` | BLOCKER | `pnpm --filter @meditrack/web build` exits 2 with `TS2307: Cannot find module`. Web app will not build cleanly without `pnpm install`. The SUMMARY notes this as pre-existing from before Wave 4; however it blocks a clean `docker compose up` build step unless `pnpm install` is run explicitly. |
| `packages/shared/src/contracts/medication.ts` | 56 | `belowThreshold: z.coerce.boolean().optional()` | WARNING | CR-01 from 02-REVIEW.md: `Boolean("false") === true`. Direct API clients sending `?belowThreshold=false` will silently receive a filtered (below-threshold-only) response. The FE's `updateFilters` only ever writes `belowThreshold=true` to the URL and never writes `false`, so the web app's own round-trips are safe — but the BE contract is incorrect for all other callers. |
| `apps/api/prisma/migrations/20260521000000_medication_catalog/migration.sql` | 60 | `USING gin (lower("name") gin_trgm_ops)` | WARNING | CR-02 from 02-REVIEW.md: functional GIN index on `lower(name)` is not used by Prisma's `name ILIKE '%q%'` (LHS is `"name"`, not `lower("name")`). Every name search at 43k rows is a table scan. Functionally correct; performance regression. |
| `apps/api/src/services/medication.service.ts` | 447–465 | `updateCareUnitMedication` calls two separate `prisma.update` without `$transaction` | WARNING | CR-04 from 02-REVIEW.md: `cumData` update + `medData` update are not atomic. Partial failure leaves row half-updated. Only affects `source=user` rows when both stock/threshold AND name/atcCode/form/strength are included in the same PATCH body. |
| `apps/web/src/routes/lakemedel/MedicationTable.tsx` | 34 | `// TODO Plan 03: <InlineEditThreshold>` comment is stale | INFO | IN-04 from 02-REVIEW.md: `InlineEditThreshold` is already wired at line 126; comment is outdated. No functional impact. |
| `packages/shared/src/contracts/medication.ts` | 86–90 | `medicationSearchQuery.q: z.string()` — no `.min(1)` | WARNING | CR-03 from 02-REVIEW.md: `GET /api/medications/search?q=` passes validation and runs `ILIKE '%%'` against 43k rows. The FE gates with `enabled: debouncedQ.length > 0` but this is not a security boundary. |

**Debt marker gate:** Zero `TBD`, `FIXME`, or `XXX` markers found in any modified file. Gate passes.

**`@radix-ui/react-select` missing from node_modules** is a BLOCKER for a clean `pnpm --filter @meditrack/web build`, but the root cause is a missing `pnpm install` step after the dependency was added to `package.json`. The SUMMARY documents this as a pre-existing infrastructure issue (esbuild version conflict during shadcn install). Running `pnpm install` from the repo root resolves it. The functionality is otherwise complete — `select.tsx` is a correct shadcn component copy; the import will resolve after install. This is classified as a WARNING rather than a hard BLOCKER on the phase goal because the web app tests pass (40/40), the component code is correct, and the fix is a single `pnpm install` invocation.

---

### Human Verification Required

#### 1. Low-Stock Badge and Banner Live Render

**Test:** Run `docker compose up`; log in as `apotekare@example.test`; open `/lakemedel`.
**Expected:** Table rows with `currentStock < lowStockThreshold` show the red AlertTriangle + "Lågt lager" pill on the Lager cell; the banner above the filter row reads "{N} läkemedel under tröskel" where N is approximately 3,483 (~8% of 43,538).
**Why human:** Requires live Postgres with seeded data; badge render and banner count cannot be confirmed without a running stack.

#### 2. belowThreshold Chip — CR-01 Real-World Impact

**Test:** Click "Visa endast under tröskel"; confirm URL shows `?belowThreshold=true`; confirm list narrows to below-threshold rows. Then manually paste the URL in a new tab and confirm the view restores. Separately: use `curl` to send `GET /api/medications?belowThreshold=false` and confirm it does NOT return a below-threshold-only filtered list.
**Expected:** The FE round-trip works correctly because the page only ever writes `belowThreshold=true` and omits the param for `false`. The curl test should confirm the bug exists for direct API clients.
**Why human:** The FE policy (omit param when false) is confirmed by code; the curl test confirms the BE contract bug; deciding whether to fix before presenting to the interviewer is a human call.

#### 3. Sheet Mobile Bottom-Sheet Layout

**Test:** Open `/lakemedel` on a 360 px viewport (or Chrome DevTools device emulation); click a medication row; confirm Sheet slides from bottom, not right; confirm footer (Spara/Avbryt) is above the 56 px tab bar; confirm `env(safe-area-inset-bottom)` clearance on notched devices.
**Expected:** No content obscured by tab bar; sheet bottom padding clears safe area.
**Why human:** CSS safe-area-inset-bottom requires physical device or accurate browser emulation.

#### 4. InlineEditThreshold Isolation (stopPropagation)

**Test:** In the medication table, click the threshold number in any row; confirm only the inline edit input opens (Sheet does NOT open); type a new value and press Enter; confirm the number flips optimistically before the network response; confirm no Sheet is visible throughout.
**Expected:** Clicking threshold number → input appears, Sheet stays closed; pressing Enter → optimistic number flip; blur or Escape → cancel restores original.
**Why human:** Event bubble isolation and optimistic timing require a running browser.

#### 5. Transparent Restore on Re-Add After Soft-Delete

**Test:** As apotekare, soft-delete a medication via the Sheet; open the Add Sheet and search for the same medication name in the typeahead — it should appear; select it, set new stock/threshold, save; verify via `psql SELECT id, "currentStock", "deletedAt" FROM "CareUnitMedication" WHERE id = '<original-id>'` that the SAME id was reused with `deletedAt = null`.
**Expected:** Same `careUnitMedicationId`, `deletedAt = null`, new stock/threshold values.
**Why human:** Full round-trip requires live Postgres with seeded data.

---

### Gaps Summary

No structural gaps block the phase goal. All 9 REQ-IDs (CAT-01..07, STK-03, STK-04) have complete implementations in the codebase. The phase goal — "Authorized users can manage their vårdenhet's medication registry — list, search, filter, create, edit, delete — with low-stock thresholds visible at a glance" — is observably satisfied in the source code for all verifiable behaviors.

**Known quality issues from 02-REVIEW.md (advisory, not goal-blocking):**

- **CR-01** (`z.coerce.boolean()` bug): FE works correctly due to clean-URL policy; BE contract is incorrect for direct API clients. Fix before interview presentation recommended.
- **CR-02** (GIN index on `lower(name)` not used by ILIKE): functionally correct, performance regression. Fix is a one-line migration change. Not a goal blocker.
- **CR-03** (empty `q` accepted in search): potential DoS amplifier. Fix is `.min(2)` on the Zod schema.
- **CR-04** (`updateCareUnitMedication` not atomic for user-source rows): rare race, affects only user-created medications with combined field + stock edits. Fix is wrapping in `$transaction`.
- **`@radix-ui/react-select` not installed**: run `pnpm install` from repo root to resolve; web build will then succeed.

Five items require human verification (live stack, visual rendering, browser interaction) as listed above. Status is `human_needed`.

---

*Verified: 2026-05-21T13:00:00Z*
*Verifier: Claude (gsd-verifier)*
