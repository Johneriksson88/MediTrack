---
quick_id: 260521-lc5
slug: fix-cr-02-add-a-follow-up-migration-that
date: 2026-05-21
status: complete
mode: quick
one_liner: Added a follow-up Prisma migration that drops the misaligned gin(lower(name)) trigram index on Medication.name and creates a gin(name) index aligned with Prismas ILIKE emit; planner now bitmap-scans instead of seq-scanning ~43k rows.
files_created:
  - apps/api/prisma/migrations/20260521130000_align_medication_name_gin_index_cr02/migration.sql
commits:
  - fix(db): align Medication.name trgm index with Prisma ILIKE (CR-02)
---

# Quick Task 260521-lc5 — Summary

## What Was Done

### Task 1 — New migration

Created `apps/api/prisma/migrations/20260521130000_align_medication_name_gin_index_cr02/migration.sql`:

```sql
DROP INDEX IF EXISTS "Medication_name_lower_trgm_idx";

CREATE INDEX "Medication_name_trgm_idx"
  ON "Medication" USING gin ("name" gin_trgm_ops);
```

The original migration's `Medication_name_lower_trgm_idx` (on `gin(lower("name"))`) is dropped; the new `Medication_name_trgm_idx` (on `gin("name")`) replaces it. The bare-column form is what pg_trgm's `gin_trgm_ops` operator class needs to support Prisma's emitted `"name" ILIKE '%q%'` (`name: { contains, mode: 'insensitive' }`).

Migration filename includes the CR-02 tag so a reviewer skimming `prisma/migrations/` can trace what changed and why.

### Task 2 — Apply + verify

**Applied:** `prisma migrate deploy` against the running `meditrack-postgres` dev container.

```
Applying migration `20260521130000_align_medication_name_gin_index_cr02`
The following migration(s) have been applied:
  └─ 20260521130000_align_medication_name_gin_index_cr02/
    └─ migration.sql
All migrations have been successfully applied.
```

**Confirmed indexes on `Medication`:**

```
"Medication_atcCode_idx" btree ("atcCode")
"Medication_name_trgm_idx" gin (name gin_trgm_ops)
```

Old `_lower_trgm_idx` is gone; new `_trgm_idx` is in place.

**EXPLAIN confirms the planner uses the new index:**

```
 Limit  (cost=30.22..45.39 rows=4 width=40)
   ->  Bitmap Heap Scan on "Medication"  (cost=30.22..45.39 rows=4 width=40)
         Recheck Cond: (name ~~* '%alved%'::text)
         ->  Bitmap Index Scan on "Medication_name_trgm_idx"  (cost=0.00..30.22 rows=4 width=0)
               Index Cond: (name ~~* '%alved%'::text)
```

Before this fix, the same query would have shown `Seq Scan on "Medication"` with cost ~ rows × per-row cost over 43k rows. After: bitmap index scan at cost 30-45, exactly the win the original migration intended but missed by one `lower()`.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Migration applies cleanly | `prisma migrate deploy` | 1 migration applied |
| Old index dropped | `\d+ "Medication"` | `Medication_name_lower_trgm_idx` absent |
| New index present | `\d+ "Medication"` | `Medication_name_trgm_idx gin (name gin_trgm_ops)` |
| Planner uses index | `EXPLAIN SELECT … WHERE name ILIKE '%alved%' LIMIT 20` | `Bitmap Index Scan on Medication_name_trgm_idx` |
| No schema drift | `prisma migrate deploy` re-run | "No pending migrations" (idempotent) |
| API build still passes | `pnpm --filter @meditrack/api build` | exit 0 |

## Resolves

- `02-REVIEW.md` CR-02.
- `02-VERIFICATION.md` anti-patterns row 3 (CR-02 WARNING).

## Why a Follow-Up Migration Instead of Editing the Original

Prisma migrate compares applied migrations by hash + name. Editing a committed migration after anyone has run it triggers a drift error on the next `migrate deploy` ("migration X has been modified since it was applied"). The safe pattern is always to add a new migration that supersedes the previous behavior. The original migration stays as-is and serves as a historical record of what we shipped first; the follow-up records the correction. A reviewer reading the migrations directory in order gets the full story.

The one-time downside: fresh installs apply both migrations, briefly creating the wrong index before dropping it. ~43k rows × trigram extraction is fast; the wasted second is acceptable for the integrity of migration history.

## Follow-ups

- The README's "Setup" section in Phase 7 should mention `prisma migrate deploy` after `docker compose up` for a first-time clone. (Already implied by the docker workflow — worth being explicit.)
- If we add a name-suggest endpoint that uses pg_trgm's `%` similarity operator, the same index already supports it — no further index work needed.
- The `Medication_atcCode_idx` btree handles `startsWith` filter cleanly; no parallel CR-02-style mismatch there.
