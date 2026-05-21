---
quick_id: 260521-kxa
slug: fix-cr-03-enforce-min-length-on-medicati
date: 2026-05-21
mode: quick
description: Add `.min(1)` to medicationSearchQuery.q so empty q rejects at the API boundary, closing the `ILIKE '%%'` table-scan amplifier (CR-03).
---

# Quick Task 260521-kxa — Fix CR-03

## Objective

Close CR-03 from `02-REVIEW.md` and `02-VERIFICATION.md` anti-patterns row 3: `q: z.string()` on `medicationSearchQuery` accepted '', which the service compiled to Prisma `name: { contains: '', mode: 'insensitive' }` → `ILIKE '%%'` over ~43k Medication rows on every empty call. DoS amplifier for direct API callers.

## Tasks

### Task 1: Add `.min(1)` to medicationSearchQuery.q

- **File:** `packages/shared/src/contracts/medication.ts` (lines 86-90)
- **Before:** `q: z.string(),`
- **After:** `q: z.string().min(1),`
- **JSDoc update:** Replace the misleading "minimum 1 char enforced FE-side via `enabled` gate" line with the new BE-enforced contract plus a CR-03 reference.

**`.min(1)` not `.min(2)`:** The FE intentionally fires the typeahead on a single character (`debouncedQ.length > 0` at `MedicationSheet.tsx:571`). Tightening to `.min(2)` would 400 every single-char typeahead request — a real FE regression. CR-03's actual concern is the empty-string DoS hole, which `.min(1)` solves.

### Task 2: Regression test

- **File:** `apps/api/test/contracts.medicationSearchQuery.test.ts` (new)
- **Coverage:**
  - single char `'a'` → accepted (matches FE typeahead UX)
  - longer `'alvedon'` → accepted
  - empty `''` → rejected (the CR-03 bug)
  - missing → rejected
  - default `limit: 20` still applied when only `q` provided

## Must Haves

- `medicationSearchQuery.parse({ q: '' })` throws.
- `medicationSearchQuery.parse({ q: 'a' })` succeeds.
- `pnpm --filter @meditrack/api exec vitest run` for both contract test files → 11/11 pass.
- `pnpm --filter @meditrack/api build` exit 0.
- `pnpm --filter @meditrack/web build` exit 0.
- `pnpm --filter @meditrack/web exec vitest run` 40/40 still pass.

## Out of Scope

- CR-02, CR-04 fixes — separate quick tasks (#4, #5 in TaskList).
- Stricter `.min(2)` UX change — would require a parallel FE change to the `enabled` gate; defer unless product wants it.
- Rate-limit middleware on `/search` — broader DoS mitigation belongs to Phase 7 ops polish.
