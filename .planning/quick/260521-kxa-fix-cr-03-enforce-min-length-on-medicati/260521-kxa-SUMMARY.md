---
quick_id: 260521-kxa
slug: fix-cr-03-enforce-min-length-on-medicati
date: 2026-05-21
status: complete
mode: quick
one_liner: Added `.min(1)` to medicationSearchQuery.q so the API boundary rejects empty searches, closing the `ILIKE '%%'` table-scan amplifier without affecting the FE's intentional single-char typeahead UX.
files_modified:
  - packages/shared/src/contracts/medication.ts
files_created:
  - apps/api/test/contracts.medicationSearchQuery.test.ts
commits:
  - fix(shared): reject empty q on /search (CR-03)
---

# Quick Task 260521-kxa — Summary

## What Was Done

### Task 1 — `.min(1)` on medicationSearchQuery.q

```diff
- /**
-  * Query parameters for GET /api/medications/search (D-45).
-  * `q` is required (minimum 1 char enforced FE-side via `enabled` gate).
-  * `limit` defaults to 20, max 20.
-  */
+ /**
+  * Query parameters for GET /api/medications/search (D-45).
+  * `q` is required and must be ≥ 1 char — empty values reject at the API
+  * boundary with 400 validation_failed.
+  * `limit` defaults to 20, max 20.
+  *
+  * CR-03 fix: previously `q: z.string()` accepted '' as valid, which the
+  * service used in `name: { contains: '', mode: 'insensitive' }` — Prisma
+  * compiled this to `ILIKE '%%'` and scanned all ~43k Medication rows on
+  * every empty-string call. The FE already gates on `debouncedQ.length > 0`
+  * (UI-SPEC §6a typeahead), so single-char queries are intentional UX and
+  * we keep `.min(1)` rather than `.min(2)` — the goal is to close the
+  * empty-string hole for direct API callers, not to tighten FE UX.
+  */
  export const medicationSearchQuery = z.object({
-   q: z.string(),
+   q: z.string().min(1),
    limit: z.coerce.number().int().min(1).max(20).default(20),
  });
```

### Task 2 — Regression test

`apps/api/test/contracts.medicationSearchQuery.test.ts` (40 lines), 5 cases:

```
✓ accepts a single character (matches FE typeahead UX)
✓ accepts a longer query
✓ rejects an empty string (the CR-03 bug — was previously accepted)
✓ rejects a missing q
✓ keeps default limit=20 when only q is provided
```

Combined with the CR-01 file from quick task 260521-kek, both contract files run together:

```
✓ test/contracts.medicationListQuery.test.ts (6 tests) 2ms
✓ test/contracts.medicationSearchQuery.test.ts (5 tests) 2ms
Test Files  2 passed (2)
     Tests  11 passed (11)
```

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Shared rebuild | `pnpm --filter @meditrack/shared build` | exit 0 |
| API typecheck | `pnpm --filter @meditrack/api build` | exit 0 |
| Web typecheck + bundle | `pnpm --filter @meditrack/web build` | exit 0 |
| New CR-03 regression | `vitest run test/contracts.medicationSearchQuery.test.ts` | 5/5 pass |
| Both contract files | (combined run above) | 11/11 pass |

## Resolves

- `02-REVIEW.md` CR-03.
- `02-VERIFICATION.md` anti-patterns row 3 (CR-03 WARNING).

## Trade-off Recorded

The original CR-03 advisory in `02-VERIFICATION.md` said "Fix is `.min(2)`". We deliberately chose `.min(1)` instead. Rationale:

- The FE typeahead at `MedicationSheet.tsx:571` is gated on `debouncedQ.length > 0` (single char fires the search). UI-SPEC §6a calls this out as a deliberate UX choice.
- Bumping the API to `.min(2)` would 400 every single-char request and break the FE's typeahead immediately. The CR-03 concern is the empty-string DoS amplifier, not the UX.
- `.min(1)` closes the hole without touching FE UX or requiring a coordinated change.

If we ever want stricter UX, the change is a one-line bump on both sides (BE `.min(2)` + FE `debouncedQ.length >= 2`) — track in Phase 7 polish if relevant.

## Follow-ups

- Same idea would apply to other `?q=` endpoints if we add them in later phases — keep `.min(1)` as the project convention for query-string search fields.
- A rate-limit middleware on `/search` would harden DoS resistance further; out of scope for the one-week timebox but worth flagging in Phase 7.
