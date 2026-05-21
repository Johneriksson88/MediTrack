---
phase: 02-medication-catalog
plan: "04"
subsystem: medication-catalog
tags: [delete, soft-delete, alert-dialog, rbac, wave-4]
dependency_graph:
  requires: [02-01, 02-03]
  provides: [soft-delete-route, delete-mutation-hook, delete-confirmation-dialog]
  affects: [medication-list, medication-search-typeahead]
tech_stack:
  added: []
  patterns:
    - "shadcn AlertDialog with e.preventDefault on confirm to block Radix auto-dismiss"
    - "useDeleteMedication with onClose callback for Sheet-dismiss cascade"
    - "<Can action='medication:delete'> defense-in-depth gate on Ta bort button"
key_files:
  created:
    - apps/api/src/routes/medications/delete.ts
    - apps/web/src/routes/lakemedel/DeleteMedicationDialog.tsx
  modified:
    - apps/api/src/routes/medications/index.ts
    - apps/web/src/features/medications/useMedicationMutations.ts
    - apps/web/src/routes/lakemedel/MedicationSheet.tsx
decisions:
  - "softDeleteCareUnitMedication was already fully implemented in Plan 01 service skeleton — Plan 04 only added the route + FE layer"
  - "AlertDialogAction destructive styling via className (not variant prop) — shadcn AlertDialog does not expose a variant prop on Action"
  - "Ta bort button wrapped in <Can action='medication:delete'> within edit mode — defense-in-depth per D-17; edit mode itself already gates sjukskoterska"
  - "EditSheet wrapped in React Fragment (<>) to render DeleteMedicationDialog outside SheetContent portal (correct z-index stacking)"
metrics:
  duration: "~25 minutes"
  completed: "2026-05-21"
  tasks: 2
  files: 5
---

# Phase 2 Plan 04: Delete Surface (Soft-Delete) Summary

**One-liner:** Slice 4 soft-delete via AlertDialog confirm — DELETE route, `useDeleteMedication` hook, `DeleteMedicationDialog` component, and `Ta bort` button wired in `EditSheet`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend service + add DELETE route + wire barrel | 8c1fd78 | delete.ts (new), index.ts (modified) |
| 2 | useDeleteMedication + DeleteMedicationDialog + MedicationSheet wire | ae3d0f5 | useMedicationMutations.ts, DeleteMedicationDialog.tsx (new), MedicationSheet.tsx |

## What Was Built

### Backend (Task 1)

**`apps/api/src/routes/medications/delete.ts`** — new file. `DELETE /api/medications/:careUnitMedicationId`:
- `preHandler: [requireSession, requirePermission('medication:delete')]` — requireSession first per D-15
- `204` on success; `404` for missing / already-soft-deleted / cross-tenant rows (D-19 / T-02-17)
- `403` for sjukskoterska (T-02-18)
- Delegates to `softDeleteCareUnitMedication(req.user!.careUnitId, ...)` — careUnitId first (D-16)

**`apps/api/src/services/medication.service.ts`** — `softDeleteCareUnitMedication` was already fully implemented in Plan 01. Plan 04 verified it passes acceptance criteria end-to-end:
- `SET deletedAt = new Date()` via `prisma.careUnitMedication.update` — never `delete` (D-33)
- Scoped reload + existence + idempotency check in one block (same 404 for all three cases — D-19)

**`apps/api/src/routes/medications/index.ts`** — barrel appended `deleteMedicationRoute` (list → search → create → update → delete).

### Frontend (Task 2)

**`apps/web/src/features/medications/useMedicationMutations.ts`** — added `useDeleteMedication()`:
- `useMutation<void, ApiError, { careUnitMedicationId, medicationName, careUnitName, onClose? }>`
- `mutationFn`: `fetchJson<void>(..., { method: 'DELETE' })` — 204 treated as void success (already handled in `api.ts` line 58)
- `onSuccess`: invalidates `['medications']` + `['medication-search']`, toasts `` `Borttaget från ${careUnitName}` ``, calls `onClose?.()`
- `onError`: toasts `'Kunde inte ta bort — försök igen.'`

**`apps/web/src/routes/lakemedel/DeleteMedicationDialog.tsx`** — new file. shadcn AlertDialog wrapper:
- Locked Swedish copy: title `` `Ta bort ${medicationName} från ${careUnitName}?` ``, body `Läkemedlet finns kvar i NPL-registret och kan läggas till igen.`
- `AlertDialogCancel` BEFORE `AlertDialogAction` — shadcn default focus lands on Cancel (safer default for destructive)
- Destructive styling via `className` (not `variant` — AlertDialogAction has no variant prop)
- `e.preventDefault()` on Action onClick — prevents Radix auto-dismiss before mutation resolves
- `isDeleting`: both buttons disabled + Loader2 spinner + `Tar bort…` on Confirm (T-02-20)

**`apps/web/src/routes/lakemedel/MedicationSheet.tsx`** — wired into `EditSheet`:
- Added imports: `DeleteMedicationDialog`, `useDeleteMedication`, `useAuth`, `Can`
- `const [isDeleteOpen, setIsDeleteOpen] = useState(false)` + `deleteMutation` + `user`
- `Ta bort` button: `onClick={() => setIsDeleteOpen(true)}` — stub TODO removed
- Button wrapped in `<Can action="medication:delete">` (defense-in-depth D-17 / T-02-18)
- `EditSheet` return changed to `<>...</>` fragment to render `DeleteMedicationDialog` alongside `<Sheet>`
- `onConfirm` cascade: `mutateAsync` → on success: hook fires toast + `onClose()` closes Sheet + `setIsDeleteOpen(false)` closes dialog; on error: both stay open, user can retry

## Verification Results

### TypeScript / Build

```
API build: pnpm --filter @meditrack/api build → exit 0
Web TypeScript: tsc --noEmit (excluding pre-existing select.tsx issue) → 0 errors from our files
Web tests: pnpm --filter @meditrack/web test → 40/40 passed
```

**Note on pre-existing web build failure:** `apps/web/src/components/ui/select.tsx` errors on `@radix-ui/react-select` being missing from `node_modules` — this is a pre-existing issue present in the base commit (`c9b427f`) before Wave 4 started. All 40 web tests pass; our new files introduce zero TypeScript errors.

### Hard-Delete Grep Gate

```
rg "prisma\.careUnitMedication\.delete\(" apps/api/src → 0 results
```

PASS — no hard-delete code path in `apps/api/src/`.

### Acceptance Criteria Check

| Criterion | Result |
|-----------|--------|
| `softDeleteCareUnitMedication` exported from service | PASS |
| Service uses `deletedAt: new Date()` and throws `NotFoundError` | PASS |
| Service uses `prisma.careUnitMedication.update` NOT `delete` | PASS |
| `delete.ts` exists with `preHandler: [requireSession, requirePermission('medication:delete')]` | PASS |
| `delete.ts` uses `reply.status(204)` | PASS |
| Barrel registers `deleteMedicationRoute` | PASS |
| `useMedicationMutations.ts` exports `useDeleteMedication` | PASS |
| Hook's `onSuccess` invalidates `['medications']` AND `['medication-search']` | PASS |
| Hook's `onSuccess` toast uses `` `Borttaget från ${careUnitName}` `` | PASS |
| `DeleteMedicationDialog.tsx` exists | PASS |
| Dialog title `` `Ta bort ${medicationName} från ${careUnitName}?` `` | PASS |
| Dialog body `'Läkemedlet finns kvar i NPL-registret och kan läggas till igen.'` | PASS |
| `AlertDialogCancel` before `AlertDialogAction` | PASS |
| `MedicationSheet.tsx` imports `DeleteMedicationDialog` + `useDeleteMedication` | PASS |
| `MedicationSheet.tsx` renders dialog only in `mode='edit'` | PASS |
| `Ta bort` button onClick is `setIsDeleteOpen(true)` — no TODO stub | PASS |
| Hard-delete grep gate: 0 occurrences | PASS |

## Deviations from Plan

### Pre-existing Issue (Out of Scope)

`apps/web/src/components/ui/select.tsx` references `@radix-ui/react-select` which is in `package.json` but not installed in `node_modules`. This error existed before Wave 4 (confirmed by testing the base commit `c9b427f`). Not touched or introduced by Plan 04. Logged to `deferred-items.md` scope — run `pnpm install` from repo root to resolve.

### Auto-observation (no fix needed)

`softDeleteCareUnitMedication` was fully implemented in Plan 01 (service skeleton task) as verified in Wave 1's SUMMARY. Plan 04 added only the route handler and FE layer — no service changes required.

## Phase 2 Final Status

Wave 4 completes the CRUD trio for Phase 2:
- Slice 1: Add (POST + typeahead + transparent restore)
- Slice 2: Filter/search (GET with combined filters + pagination)
- Slice 3: Edit (PATCH + RBAC-aware Sheet + optimistic inline threshold)
- Slice 4: Delete (DELETE + AlertDialog confirm + soft-delete)

**REQ-IDs satisfied (Phase 2 complete):**

| REQ-ID | Description | Status |
|--------|-------------|--------|
| CAT-01 | View medication catalog (list with name, ATC, form, strength, stock) | Observed — Wave 1 |
| CAT-02 | Search by name (partial, case-insensitive) | Observed — Wave 2 |
| CAT-03 | Filter by ATC prefix, form | Observed — Wave 2 |
| CAT-04 | Add medication from NPL typeahead | Observed — Wave 1 |
| CAT-05 | Create new medication (not in NPL) | Observed — Wave 1 |
| CAT-06 | Edit stock + threshold; user-source meds allow full field edit | Observed — Wave 3 |
| CAT-07 | Soft-delete CareUnitMedication (always, per D-33) | Observed — Wave 4 (this plan) |
| STK-03 | Default threshold heuristic at create time (D-40) | Observed — Wave 1 |
| STK-04 | Low-stock indicator + count banner | Observed — Wave 1 |

Ready for `/gsd:verify-phase 02` or the phase checker.

## Self-Check

### Files exist:

- `apps/api/src/routes/medications/delete.ts` — FOUND (confirmed by git status)
- `apps/web/src/routes/lakemedel/DeleteMedicationDialog.tsx` — FOUND (confirmed by git status)

### Commits exist:

- `8c1fd78` feat(02-04): DELETE /api/medications/:id — soft-delete route + barrel wire — FOUND
- `ae3d0f5` feat(02-04): delete flow — useDeleteMedication + DeleteMedicationDialog + Sheet wire — FOUND

## Self-Check: PASSED
