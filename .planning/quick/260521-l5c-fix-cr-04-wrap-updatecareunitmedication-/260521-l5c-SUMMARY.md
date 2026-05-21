---
quick_id: 260521-l5c
slug: fix-cr-04-wrap-updatecareunitmedication-
date: 2026-05-21
status: complete
mode: quick
one_liner: Wrapped the two prisma.update calls in updateCareUnitMedication in a single prisma.$transaction callback so partial failure on combined-field PATCH bodies can't leave user-source rows half-updated.
files_modified:
  - apps/api/src/services/medication.service.ts
commits:
  - fix(api): make updateCareUnitMedication atomic (CR-04)
---

# Quick Task 260521-l5c — Summary

## What Was Done

### Task 1 — Wrap the two updates in $transaction

```diff
- // Step 4 — Apply the update.
- let updatedRow = row;
- if (hasCumUpdate) {
-   updatedRow = await prisma.careUnitMedication.update({
-     where: { id: careUnitMedicationId },
-     data: cumData,
-     include: { medication: true },
-   });
- }
- if (hasMedUpdate) {
-   await prisma.medication.update({
-     where: { id: row.medicationId },
-     data: medData,
-   });
-   // Merge updated med fields into the return object.
-   updatedRow = {
-     ...updatedRow,
-     medication: { ...updatedRow.medication, ...medData },
-   };
- }
+ // Step 4 — Apply the update atomically (CR-04).
+ // Both writes run inside a single $transaction so a partial failure on
+ // user-source rows (where stock/threshold AND name/atc/form/strength are
+ // included in the same PATCH body) can't leave the row half-updated.
+ // Matches the $transaction style used by createCareUnitMedication above.
+ const updatedRow = await prisma.$transaction(async (tx) => {
+   let next = row;
+   if (hasCumUpdate) {
+     next = await tx.careUnitMedication.update({
+       where: { id: careUnitMedicationId },
+       data: cumData,
+       include: { medication: true },
+     });
+   }
+   if (hasMedUpdate) {
+     await tx.medication.update({
+       where: { id: row.medicationId },
+       data: medData,
+     });
+     // Merge updated med fields into the return object.
+     next = {
+       ...next,
+       medication: { ...next.medication, ...medData },
+     };
+   }
+   return next;
+ });
```

Style matches `createCareUnitMedication` (same file, line 312): callback-form `prisma.$transaction(async (tx) => {...})`. Both updates run through `tx`, so partial failure rolls back the first write.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| API typecheck | `pnpm --filter @meditrack/api build` | exit 0 |
| Contract tests (no regression) | `vitest run test/contracts.*.test.ts` | 11/11 pass |
| Web typecheck (shared types unaffected) | `pnpm --filter @meditrack/web build` | exit 0 |

## Resolves

- `02-REVIEW.md` CR-04.
- `02-VERIFICATION.md` anti-patterns row 4 (CR-04 WARNING).

## Why No Regression Test

Asserting transactional rollback would require either:

1. Injecting a mid-transaction failure (mock-heavy, brittle, doesn't really exercise Prisma's transaction machinery).
2. Running against real Postgres via `buildTestApp` with a manufactured constraint violation between the two writes — non-trivial to engineer reliably.

Both approaches test mechanism rather than behavior. The actual behavior change is mechanical and small (24 lines, replicating an existing style in the same file). For a one-week interview submission, typecheck + style-match against the proven `createCareUnitMedication` $transaction usage is sufficient verification. A real atomicity bug would surface in the existing integration tests (when Docker is running) as inconsistent state across runs — not as a unit assertion failure.

If we ever need this guarantee tested, the natural place is a "concurrent updates from two nurses" integration test, which is also exactly the §6 interview question this fix sets up a good answer for.

## Interview Talking Point

This is now a clean answer for brief §6 question "What happens when two nurses ordering simultaneously?" — the same `$transaction` discipline used in `createCareUnitMedication` and now `updateCareUnitMedication` will extend to the order-flow service in Phase 3-4, and pairs with the planned row-level `SELECT ... FOR UPDATE` in the delivery path. Worth surfacing in the README's architecture section once Phase 4 lands.

## Follow-ups

- Consider extracting a small helper if a third $transaction emerges (e.g., `withMedicationTx(...)`) — premature for two callers but watch as Phase 3-4 land.
- The "Tenancy invariant violated" defensive check at line 468 still runs *after* the transaction commits. Acceptable (the transaction protects atomicity of writes; the invariant is sanity-checking the loaded `row`), but worth re-reading if any future change moves the careUnit scope check inside the transaction.
