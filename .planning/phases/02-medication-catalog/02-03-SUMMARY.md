---
phase: 02-medication-catalog
plan: "03"
subsystem: medication-catalog
tags:
  - edit-sheet
  - inline-edit
  - optimistic-update
  - pessimistic-update
  - rbac
  - npl-field-lock
dependency_graph:
  requires:
    - 02-01  # Slice 1: service layer skeleton, MedicationSheet primitive, route barrel
    - 02-02  # Slice 2: LakemedelFilter + LakemedelPage URL state (touches same page)
  provides:
    - medication-edit-sheet
    - inline-edit-threshold
    - update-medication-route
    - update-medication-service
  affects:
    - 02-04  # Plan 04: delete confirm — extends MedicationSheet Ta bort stub + softDelete
tech_stack:
  added: []
  patterns:
    - "NPL field strip: source === 'user' branch accepts name/atcCode/form/strength; source === 'npl' silently drops them (D-32 defense-in-depth)"
    - "D-42 mixed mutation strategy: Sheet saves are pessimistic (useUpdateMedication); inline threshold edit is optimistic (useUpdateThresholdOptimistic)"
    - "Optimistic onMutate: cancelQueries + getQueriesData snapshot + setQueriesData with local belowThresholdTotal recompute; onError rollback from snapshot"
    - "RBAC-driven Sheet mode: useCan('medication:update') → 'edit' for apotekare/admin, 'view' for sjukskoterska (D-36)"
    - "404-not-403 on cross-tenant PATCH (T-02-13 posture: collapses existence-probing)"
    - "Ta bort button in edit Sheet footer is a visual stub — Plan 04 wires DeleteMedicationDialog"
key_files:
  created:
    - apps/api/src/routes/medications/update.ts
    - apps/web/src/components/InlineEditThreshold.tsx
  modified:
    - packages/shared/src/contracts/medication.ts
    - apps/api/src/services/medication.service.ts
    - apps/api/src/routes/medications/index.ts
    - apps/web/src/features/medications/useMedicationMutations.ts
    - apps/web/src/routes/lakemedel/MedicationSheet.tsx
    - apps/web/src/routes/lakemedel/MedicationTable.tsx
    - apps/web/src/routes/lakemedel/MedicationCard.tsx
    - apps/web/src/routes/lakemedel/LakemedelPage.tsx
decisions:
  - "Silent NPL field strip (not ForbiddenScopeError): the plan's D-32 requirement says 'silently stripped'; the Plan 01 service had incorrectly thrown ForbiddenScopeError — corrected to match the spec. The 200 + original-name response is the correct acceptance-test behavior."
  - "autoFocus instead of useRef for Sheet input focus: react-hook-form's register() spreads a ref prop that conflicts with an explicit ref= prop; autoFocus avoids the TS2783 duplicate-ref error while achieving the same UX intent."
  - "ViewSheet uses <fieldset disabled> wrapping <p> labels (not inputs) — read-only presentation without needing disabled inputs, which would apply browser grayout styling to static text."
metrics:
  duration_minutes: 11
  completed_date: "2026-05-21"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 8
---

# Phase 2 Plan 03: Medication Catalog — Slice 3 (Edit Surface) Summary

PATCH /api/medications/:id BE route with careUnitId-scope-safe 404 posture and silent NPL field strip; useUpdateMedication (pessimistic) + useUpdateThresholdOptimistic (optimistic onMutate/rollback) hooks; InlineEditThreshold click-to-edit component with stopPropagation isolation; MedicationSheet fully implements edit (NPL-locked variant + user-editable variant) and view (read-only fieldset) modes driven by useCan.

## Tasks Completed

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 | PATCH route, service update, shared contract | 0d89800 | update.ts, medication.service.ts, medication.ts, index.ts |
| 2 | useUpdateMedication + useUpdateThresholdOptimistic + InlineEditThreshold | b3a9634 | useMedicationMutations.ts, InlineEditThreshold.tsx |
| 3 | MedicationSheet edit+view modes; table+card wiring | 7c17dc3 | MedicationSheet.tsx, MedicationTable.tsx, MedicationCard.tsx, LakemedelPage.tsx |

## Files Created (2)

**Backend**
- `apps/api/src/routes/medications/update.ts` — PATCH /api/medications/:careUnitMedicationId with requireSession + requirePermission('medication:update')

**Frontend**
- `apps/web/src/components/InlineEditThreshold.tsx` — click-to-edit number input with optimistic onMutate + onError rollback; idle span has stopPropagation + role=button + aria-label

## Files Modified (8)

**Shared**
- `packages/shared/src/contracts/medication.ts` — medicationUpdateRequest: added .strict() + .refine(non-empty) + ATC code regex validation

**Backend**
- `apps/api/src/services/medication.service.ts` — updateCareUnitMedication rewritten: silent NPL field strip (D-32, T-02-12); 404-not-403 on cross-tenant (D-19, T-02-13); short-circuit on no-op
- `apps/api/src/routes/medications/index.ts` — registered updateMedicationRoute (list → search → create → update)

**Frontend**
- `apps/web/src/features/medications/useMedicationMutations.ts` — added useUpdateMedication (pessimistic) + useUpdateThresholdOptimistic (optimistic); see D-42 mixed strategy notes
- `apps/web/src/routes/lakemedel/MedicationSheet.tsx` — full edit+view modes replacing Plan 01 placeholder
- `apps/web/src/routes/lakemedel/MedicationTable.tsx` — replaced TODO placeholder with `<InlineEditThreshold>`
- `apps/web/src/routes/lakemedel/MedicationCard.tsx` — wrapped threshold in `<InlineEditThreshold>` with stopPropagation parent span
- `apps/web/src/routes/lakemedel/LakemedelPage.tsx` — useCan('medication:update') drives edit vs view Sheet mode in handleRowClick

## Manual Screen-Test Checklist

These behaviors require a running Docker stack (`docker compose up`) to verify:

1. **NPL row edit Sheet**: Click any NPL-sourced row → Sheet opens titled with medication name + NplBadge "Från NPL · namn / form / styrka är låsta" → Namn/ATC-kod/Form/Styrka render as `<p>` labels (not inputs) → Lager + Tröskel inputs are editable → Spara → PATCH fires → row updates in list → toast "Sparat" → Sheet closes.

2. **User-source row edit Sheet**: Click a user-created row → Sheet opens with ALL six fields editable (Namn, ATC-kod, Form select, Styrka, Lager, Tröskel) → Spara saves all fields.

3. **Sjukskoterska view Sheet**: Log in as sjukskoterska → click any row → Sheet opens titled "{name} · Visning" → all fields are read-only → footer has only "Stäng" button → Stäng closes Sheet.

4. **Inline threshold edit success**: Click the threshold number in a table row → input appears (Sheet does NOT open) → type a new value → Enter → number flips to new value INSTANTLY (optimistic update before network) → no toast on success.

5. **Inline threshold edit error rollback**: Force an error (e.g., `lowStockThreshold: 0` in the API — BE Zod min(1) rejects) → toast "Kunde inte spara — försök igen." → number reverts to original value (rollback from snapshot).

6. **Sheet error state**: Send a PATCH with negative stock from the edit Sheet → Sheet stays open → toast "Kunde inte spara — försök igen." → Spara button re-enables.

## Note for Plan 04

The `Ta bort` (destructive) button in the edit Sheet footer renders but has a stub `onClick` (`// TODO Plan 04: open DeleteMedicationDialog`). Plan 04 wires `<DeleteMedicationDialog>` for the soft-delete flow and removes this stub.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Silent NPL strip vs ForbiddenScopeError**
- **Found during:** Task 1 (reading existing service code)
- **Issue:** The Plan 01 service implementation of `updateCareUnitMedication` threw `ForbiddenScopeError` when NPL-locked fields were present in the request body. The plan spec (D-32, T-02-12 acceptance test) requires the service to SILENTLY STRIP those fields and return 200 with the original name unchanged. The acceptance test literally says "PATCH with body `{name:'Hacked'}` against NPL row returns 200 with ORIGINAL name unchanged."
- **Fix:** Rewrote the NPL path to build `medData` only for `source === 'user'` rows; NPL rows have the four fields omitted from the Prisma update object entirely.
- **Files modified:** `apps/api/src/services/medication.service.ts`
- **Commit:** 0d89800

**2. [Rule 3 - Blocker] TypeScript TS2783 duplicate ref on Input**
- **Found during:** Task 3 (web build)
- **Issue:** `react-hook-form`'s `register()` spreads a `ref` prop onto the Input; supplying an additional explicit `ref={stockInputRef}` triggers TS2783 "ref is specified more than once."
- **Fix:** Replaced explicit `ref=` + `useEffect` focus pattern with `autoFocus` prop directly on the Input element. Achieves the same UX intent (first input receives focus on Sheet open) without ref conflict.
- **Files modified:** `apps/web/src/routes/lakemedel/MedicationSheet.tsx`
- **Commit:** 7c17dc3

**3. [Rule 1 - Bug] Missing .strict() + .refine() on medicationUpdateRequest (Plan 01)**
- **Found during:** Task 1 (reading shared contracts)
- **Issue:** The Plan 01 `medicationUpdateRequest` schema was missing `.strict()` (so extra keys passed through Zod silently) and `.refine(non-empty)` (so an empty PATCH body would succeed as a no-op 200 instead of returning 400 `validation_failed`). Both are required by the plan spec.
- **Fix:** Chained `.strict()` and `.refine((d) => Object.keys(d).length > 0, ...)` on the schema. Also added the ATC code regex validation per the plan's exact schema spec.
- **Files modified:** `packages/shared/src/contracts/medication.ts`
- **Commit:** 0d89800

## Threat Surface Scan

New network endpoint: `PATCH /api/medications/:careUnitMedicationId` — already in the plan's `<threat_model>` as T-02-12 (NPL strip) and T-02-13 (cross-tenant 404). All STRIDE mitigations implemented:

| Threat ID | Mitigation Status |
|-----------|------------------|
| T-02-12 | Implemented: `source === 'user'` branch gates medData writes; NPL rows skip medData update entirely |
| T-02-13 | Implemented: `row.careUnitId !== careUnitId` → `new NotFoundError('Läkemedlet hittades inte.')` (same branch as not-found + deleted) |
| T-02-14 | Implemented: `requirePermission('medication:update')` preHandler returns 403 before service is called |
| T-02-15 | Implemented: `mutation.isPending` disables InlineEditThreshold input; onMutate snapshot ensures full rollback |
| T-02-16 | Accepted per plan: rate limiting deferred to Phase 7 |

No new threat surface beyond what the plan modeled.

## Known Stubs

| Stub | File | Line | Reason |
|------|------|------|--------|
| `Ta bort` button onClick no-op | `MedicationSheet.tsx` | ~372 | Plan 04 wires `<DeleteMedicationDialog>` for soft-delete flow |

This stub does NOT prevent Plan 03's goal (edit + view Sheet + inline threshold edit). The button renders visually so the Sheet layout is complete; only the delete action is deferred.

## Self-Check: PASSED

Files verified:
- `apps/api/src/routes/medications/update.ts` FOUND
- `apps/web/src/components/InlineEditThreshold.tsx` FOUND
- `apps/api/src/services/medication.service.ts` contains `updateCareUnitMedication` FOUND
- `apps/web/src/features/medications/useMedicationMutations.ts` exports `useUpdateMedication` + `useUpdateThresholdOptimistic` FOUND
- `apps/web/src/routes/lakemedel/MedicationSheet.tsx` has edit/view mode branching FOUND
- `apps/web/src/routes/lakemedel/MedicationTable.tsx` uses `<InlineEditThreshold>` FOUND
- `apps/web/src/routes/lakemedel/LakemedelPage.tsx` uses `useCan('medication:update')` FOUND

Commits verified:
- 0d89800 Task 1 (PATCH route + service + contract) FOUND
- b3a9634 Task 2 (hooks + InlineEditThreshold) FOUND
- 7c17dc3 Task 3 (Sheet edit+view + table+card wiring) FOUND

Build: `pnpm --filter @meditrack/web build` exits 0 (tsc --noEmit + vite build).
Tests: 40/40 web tests pass. 18/18 API tests skip (no DB) — same as prior plans.
