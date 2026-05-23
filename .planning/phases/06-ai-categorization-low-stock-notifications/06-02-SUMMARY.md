---
phase: 06-ai-categorization-low-stock-notifications
plan: 02
subsystem: schema-and-filter
tags: [prisma, postgres-enum, migration, zod, audit-allowlist, react, shadcn-combobox, ai-03, d-115, d-116, d-117]

requires:
  - phase: 01-foundation-auth
    provides: requireSession + careUnit-scoped req.user (D-15 / D-16)
  - phase: 02-medication-catalog
    provides: Medication + CareUnitMedication models, listMedicationsForUnit filter chain, LakemedelFilter Popover+Command recipe, URL-as-state pattern (D-39)
  - phase: 05-audit-log
    provides: Prisma $extends middleware (D-93), AUDIT_ALLOWLIST.Medication (D-97), diff-at-read (D-95)
  - plan: 06-01
    provides: dashboard contract with placeholder therapeuticClass — now upgraded to therapeuticClassEnum.nullable() in lockstep
provides:
  - Postgres TherapeuticClass enum (14 values: A B C D G H J L M N P R S V)
  - Medication.therapeuticClass nullable column + Medication_therapeuticClass_idx btree index
  - Shared THERAPEUTIC_CLASSES + THERAPEUTIC_CLASS_LABELS + therapeuticClassEnum + TherapeuticClass type (Swedish labels match 06-CONTEXT.md verbatim)
  - medicationListQuery / medicationListItem / medicationUpdateRequest / medicationCreateUserRequest / medicationCreateFromNplRequest all carry therapeuticClass
  - GET /api/medications?therapeuticClass=N returns only N-class rows (AI-03)
  - PATCH /api/medications/:id with { therapeuticClass } persists on user-source AND NPL-source meds (D-32 carve-out per D-115)
  - Phase 5 audit middleware writes medication.update events whose `after` JSON includes therapeuticClass (D-97 extension)
  - Shared apps/web/src/components/TherapeuticClassCombobox.tsx — consumed by LakemedelFilter (Plan 02) AND MedicationSheet (Plan 03)
  - LakemedelFilter shows the leftmost Terapeutisk-klass combobox (D-116) wired to ?class=N URL deep-link (D-39 carry-over)
affects: [06-03-ai-categorization]

tech-stack:
  added: []
  patterns:
    - "Closed-enum 3-layer integrity: Postgres enum + Prisma enum + shared Zod enum + TS string union (D-114)"
    - "Shared FE combobox extraction: one Popover+Command shell consumed by URL-state and react-hook-form callers via a generic value/onChange API"
    - "URL-param short name `?class=N` (single letter matching enum value) decoupled from in-FE prop name `therapeuticClass` for shareable deep-links (D-116)"
    - "Generated-migration hand-edit pattern: prisma migrate diff proposes a spurious DROP of a raw-SQL-owned trgm GIN index; the DROP is stripped by hand BEFORE apply with a verbatim comment block documenting why (CR-02 Phase 2 trgm preservation)"
    - "Audit allowlist EXTENSION (not replacement): appending 'therapeuticClass' to AUDIT_ALLOWLIST.Medication surfaces the new column in the existing $extends middleware automatically — zero new audit code (D-95 + D-97)"
    - "D-32 carve-out documentation pattern: classification metadata is editable on NPL-source meds even though identity fields (name/atc/form/strength) remain server-side stripped — the carve-out lives in the function header AND the contract comment AND a dedicated regression test"

key-files:
  created:
    - packages/shared/src/constants/therapeuticClass.ts
    - apps/api/test/contracts.therapeuticClass.test.ts
    - apps/api/prisma/migrations/20260523124435_0012_medication_therapeutic_class/migration.sql
    - apps/api/test/medications.therapeuticClass.integration.test.ts
    - apps/web/src/components/TherapeuticClassCombobox.tsx
  modified:
    - apps/api/prisma/schema.prisma
    - apps/api/src/db/auditAllowlist.ts
    - apps/api/src/services/medication.service.ts
    - packages/shared/src/contracts/medication.ts
    - packages/shared/src/contracts/dashboard.ts
    - packages/shared/src/index.ts
    - apps/web/src/routes/lakemedel/LakemedelFilter.tsx
    - apps/web/src/routes/lakemedel/LakemedelPage.tsx

key-decisions:
  - "Migration generated via `prisma migrate diff --from-url $DATABASE_URL --to-schema-datamodel prisma/schema.prisma --script` rather than `prisma migrate dev` because the executor environment cannot run `migrate dev` interactively. Output redirected to the migration directory; `prisma migrate resolve --applied 0012_medication_therapeutic_class` registered it in the _prisma_migrations table after manual `psql -f migration.sql` apply (verified by Task 2 checkpoint approval)."
  - "Trgm GIN index preservation (Blocker 2 mitigation): the generated diff included a spurious `DROP INDEX \"Medication_name_trgm_idx\";` WITHOUT a recreate. That index is owned exclusively by the raw-SQL migration 20260521130000_align_medication_name_gin_index_cr02 (Phase 2 CR-02 follow-up) and is invisible to Prisma's schema diffing. The DROP was removed by hand BEFORE apply — verbatim deletion of one line, replaced with a comment block. Post-apply `\\d \"Medication\"` confirms `Medication_name_trgm_idx gin (name gin_trgm_ops)` survived."
  - "Therapeutic-class write path UNCONDITIONAL on PATCH (D-32 carve-out per D-115): the update service writes payload.therapeuticClass OUTSIDE the `source === 'user'` branch where name/atcCode/form/strength are gated. The carve-out is documented in the function header AND the contract comment AND has a dedicated regression test (Test 3 — `phase6plan02_test3_npl` med PATCHed to class N succeeds while NPL-locked identity fields are preserved)."
  - "URL param name `class` (short) vs in-FE prop name `therapeuticClass` (clear) — deliberate split per D-116. The query-string param keeps deep-links short and shareable; the FE prop name spells out the field to keep the contract grep-discoverable. Mapping is one-shot in LakemedelPage's URL parse/write."
  - "updateFilters URL writer distinguishes `'therapeuticClass' in patch` (explicitly cleared) from absence-of-key (untouched) — needed because undefined alone is ambiguous in the patch object. Without this distinction, clicking the X on another control would silently preserve a stale class filter."
  - "Shared TherapeuticClassCombobox extracted as ONE file (Warning 7 — anti-duplication): consumed by Plan 02's LakemedelFilter (URL-state) AND Plan 03's MedicationSheet (react-hook-form). One file owns the 14-item options array, the Popover+Command shell, the Check icon, the clear-X affordance, and the aria-label. Two consumers wrap with their own state-shape glue."
  - "The 4 BE integration tests are colocated in apps/api/test/medications.therapeuticClass.integration.test.ts (new file) rather than extending an existing medications.integration.test.ts (which does not exist — apps/api/test currently has contracts.* unit tests and feature-scoped integration tests by route group). One file per feature aligns with the dashboard.integration.test.ts precedent shipped in Plan 01."
  - "Audit action assertion in Test 4 uses `action: 'update'` (the defaultAction from auditExtension.ts) rather than `medication.update` (no overrideAction is set for Medication PATCH route). Documented in the test inline so future readers don't waste time looking for the missing override."

patterns-established:
  - "Closed-enum vocabulary file matching orderStatus.ts shape (THERAPEUTIC_CLASSES + therapeuticClassEnum + THERAPEUTIC_CLASS_LABELS + TherapeuticClass type) is the template for any future closed-enum domain vocabulary in Phase 7+."
  - "$queryRaw enum-cast: `m.\"therapeuticClass\" = $N::\"TherapeuticClass\"` is the pattern for binding text params to Postgres enum columns inside parameterized raw SQL. The double-quoted Postgres enum type name MUST be quoted in the cast (PascalCase identifier preservation)."
  - "Shared combobox component pattern: when the same combobox is needed in multiple FE surfaces with different state-shape glue (URL-state vs react-hook-form), extract the shell (Popover + Command + options array + clear affordance) into a single component with a generic `value/onChange/triggerClassName` props API. Consumers wrap with their own state mapping in 5–8 lines."

requirements-completed: [AI-03]

duration: 35 min
completed: 2026-05-23
---

# Phase 6 Plan 02: Therapeutic Class Schema + Filter Combobox Summary

Slice B — Therapeutic Class schema + filter combobox end-to-end. Adds the
`therapeuticClass` Postgres enum + nullable column to the global `Medication`
table; exposes the column via shared contracts, the medication service
(list filter + create/update persistence), the audit allowlist (D-97
extension surfaces it automatically via D-95 diff-at-read), and a new fourth
filter combobox on `/lakemedel` (leftmost per D-116). No LLM dependency.
Sets up the column Slice C (Plan 03) will write into via the AI suggest
endpoint.

Three tasks landed in 7 atomic commits over Plan 02 (1a / 1b / 1c / 2 / 3a /
3b / 3c). The blocking [Task 2] human-verify checkpoint between Task 1c
(schema edit, no apply) and Task 3 (service + FE wiring) allowed the
reviewer to confirm the migration applied cleanly, the column landed, the
trgm GIN index survived the hand-edit, and `tsc --noEmit` exited 0 — BEFORE
any downstream code referenced the new column.

## Task-by-Task Outcome

| Task | Commit | Subject | Done |
| ---- | ------ | ------- | ---- |
| 1a | c15b124 | shared therapeuticClass constants + Nyquist unit test | 4/4 Nyquist enum assertions pass |
| 1b | 7275300 | extend medication + dashboard contracts with therapeuticClass | medicationListItem/Query/UpdateRequest/Create*Request all carry the field; dashboard contract upgraded from z.string().nullable() placeholder to therapeuticClassEnum.nullable() |
| 1c | 59808a7 | add therapeuticClass column to Medication schema + audit allowlist | schema.prisma + AUDIT_ALLOWLIST.Medication extended; no migration apply yet |
| 2  | 914fec3 | apply migration 0012 — TherapeuticClass enum + Medication column (preserve CR-02 trgm) | migration applied; user-approved human-verify checkpoint |
| 3a | edb4a6c | therapeuticClass filter + persistence in medication service | 4 BE integration tests pass |
| 3b | 326218f | shared TherapeuticClassCombobox component | new file; tsc + lint exit 0 |
| 3c | 63c80d0 | wire LakemedelFilter + LakemedelPage to therapeuticClass URL param | 4th-combobox slotted leftmost; ?class=N URL round-trip wired |

## Migration 0012 — Schema Diff Applied

**Filename:** `apps/api/prisma/migrations/20260523124435_0012_medication_therapeutic_class/migration.sql`
**Timestamp:** `20260523124435` (2026-05-23 12:44:35 UTC)
**Applied as registered in `_prisma_migrations`:** confirmed Task 2.

**Generated DDL (additive, in order):**

```sql
-- CreateEnum
CREATE TYPE "TherapeuticClass" AS ENUM ('A', 'B', 'C', 'D', 'G', 'H', 'J', 'L', 'M', 'N', 'P', 'R', 'S', 'V');

-- AlterTable
ALTER TABLE "Medication" ADD COLUMN     "therapeuticClass" "TherapeuticClass";

-- CreateIndex
CREATE INDEX "Medication_therapeuticClass_idx" ON "Medication"("therapeuticClass");
```

## Hand-Edit: Removed Spurious DROP of `Medication_name_trgm_idx`

**Verbatim line stripped from the generated diff:**

```sql
DROP INDEX "Medication_name_trgm_idx";
```

**Replaced with this comment block (in-file, immediately after the `CREATE TYPE`
statement at the place the DROP would have appeared):**

```sql
-- NOTE: Phase 6 Plan 02 — `prisma migrate diff` proposed dropping
-- `Medication_name_trgm_idx` because that index is owned by the
-- raw-SQL migration `20260521130000_align_medication_name_gin_index_cr02`
-- (Phase 2 CR-02 follow-up) and is invisible to Prisma's schema diffing.
-- The DROP has been removed; the trigram GIN index continues to power
-- ILIKE %q% name search per CR-02.
```

**Why the DROP was unsafe:** `schema.prisma` does NOT declare the trgm GIN
index (verified by grep — zero occurrences of `Gin` / `trgm` / `name_trgm`
in schema.prisma). The index lives in the raw-SQL migration above (Phase 2
CR-02 follow-up); Prisma's schema diff sees it on the live DB but not in
schema.prisma → emits a DROP with no recreate. Applying the unaltered diff
would silently degrade `?q=` name search to a sequential scan over ~43k
Medication rows.

## Post-Apply Live DB Inventory

**`\d "Medication"` (excerpt):**

```
Indexes:
    "Medication_pkey" PRIMARY KEY, btree (id)
    "Medication_atcCode_idx" btree ("atcCode")
    "Medication_name_trgm_idx" gin (name gin_trgm_ops)        ← CR-02 PRESERVED
    "Medication_nplId_key" UNIQUE, btree ("nplId")
    "Medication_therapeuticClass_idx" btree ("therapeuticClass") ← NEW (D-117)
```

Both indexes coexist: the trgm GIN powers `?q=` ILIKE search; the new
btree powers the `?class=N` filter combobox + any future dashboard JOIN
over the class column.

**Column:** `therapeuticClass | "TherapeuticClass" | nullable=YES`.
**Enum values (`\dT+ "TherapeuticClass"`):** `A, B, C, D, G, H, J, L, M, N, P, R, S, V` (exactly 14, no missing, no extra).

## BE Integration Tests (4 new in `apps/api/test/medications.therapeuticClass.integration.test.ts`)

| # | Name | Outcome |
| - | ---- | ------- |
| 1 | `Test 1 (list filter, AI-03): GET /api/medications?therapeuticClass=N returns only N-class rows` | PASS — seeded two user-source meds with classes 'N' and 'J'; assertion confirms the 'N' row appears and 'J' does not |
| 2 | `Test 2 (user-source persistence): PATCH therapeuticClass=J on a user-source med persists` | PASS — response 200; toListItem mapping returns therapeuticClass:'J'; reloaded Medication row also carries 'J' |
| 3 | `Test 3 (D-32 carve-out, D-115): PATCH therapeuticClass=N on an NPL-source med succeeds` | PASS — response 200; the four NPL-locked identity fields (name/atcCode/form/strength) are unchanged after the PATCH; source remains 'npl' |
| 4 | `Test 4 (audit, D-95 + D-97 extension): medication.update event surfaces therapeuticClass in after JSON` | PASS — `audit_events` row with entityType='medication', entityId=med.id, action='update' contains `after.therapeuticClass === 'J'` |

**Full apps/api test suite after Plan 02:** 112/113 tests pass. The one
failure is a pre-existing dashboard.integration.test.ts Test 1 sort-tiebreak
flake reproduced against `master` BEFORE any Plan 02 Task 3 edits landed —
tracked in `.planning/phases/06-ai-categorization-low-stock-notifications/deferred-items.md`
(Postgres `ORDER BY name ASC` collation vs JS `localeCompare` mismatch on
the same-ratio tiebreak case; NOT a Plan 02 regression).

## Plan 01 Tests After Slice A Contract Upgrade

The Slice A→B dashboard contract upgrade swap (`z.string().nullable()` →
`therapeuticClassEnum.nullable()`) is the only Plan 01 file Plan 02 touches.
Verified non-regression:

- `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx` — **5/5 PASS** after the upgrade. The contract widening is forward-compatible (the wire shape `<nullable string>` is unchanged); the type narrows to the closed enum which all the seed data satisfies (all rows currently carry `null`).
- `apps/api/test/dashboard.integration.test.ts` Tests 2 + 3 — **PASS**. Test 2 (cross-careUnit isolation) and Test 3 (post-deliver refetch) both pass against the upgraded contract. (Test 1 pre-existing flake — see above.)

## Verification Commands

```bash
# Migration applied + clean
pnpm --filter @meditrack/api exec prisma migrate status              # 0012 applied
docker compose exec postgres psql -U meditrack_app -d meditrack -c '\dT "TherapeuticClass"'  # 14 values
docker compose exec postgres psql -U meditrack_app -d meditrack -c '\d "Medication"'         # column + both indexes

# Typecheck + tests
pnpm --filter @meditrack/api exec tsc --noEmit -p .                  # exit 0
pnpm --filter @meditrack/web exec tsc --noEmit -p .                  # exit 0
pnpm --filter @meditrack/api test -- medications.therapeuticClass   # 4/4 PASS
pnpm --filter @meditrack/web test -- DashboardLowStockCard          # 5/5 PASS (Plan 01 non-regression)
pnpm lint                                                            # exit 0
pnpm --filter @meditrack/web build                                   # exit 0
```

## Deviations from Plan

None of substance — Tasks 1–3 executed verbatim against the plan's `<action>`
blocks. Two minor execution-time clarifications worth recording:

- **Migration generation method.** The plan's Task 2 `<how-to-verify>` step 1
  calls for `prisma migrate dev --create-only`. The executor environment
  cannot run interactive prisma commands; the equivalent non-interactive
  path used was `prisma migrate diff --from-url $DATABASE_URL
  --to-schema-datamodel prisma/schema.prisma --script` → file output → hand
  edit → `psql -f migration.sql` → `prisma migrate resolve --applied
  0012_medication_therapeutic_class`. End state is identical to what
  `migrate dev` would have produced; the human-verify checkpoint covered
  the spurious-DROP detection and trgm preservation gate. No behavior
  difference.

- **Test 4 audit action.** The plan's `<behavior>` text says "Phase 5 audit
  middleware writes a `medication.update` event". The defaultAction in
  `auditExtension.ts` for an intercepted `update` is the bare string
  `'update'` (not `'medication.update'` — there's no overrideAction call
  on the medication PATCH route). The test queries with `action: 'update'`
  and an inline comment documents the discovery. Same row, same diff
  surfaced.

## Known Stubs

None.

## Threat Flags

Plan 02's threat model (`<threat_model>` T-06-06 .. T-06-11 + T-06-21) was
addressed verbatim by the design + the test surface:

- **T-06-06 / T-06-07 (tampering, query + body):** `therapeuticClassEnum` Zod boundary rejects out-of-list strings before the service runs (verified indirectly — the listMedicationsForUnit and updateCareUnitMedication paths both type the field as `TherapeuticClass`, not `string`, so Zod is the only entry point).
- **T-06-08 (audit info-disclosure):** allowlist EXTENSION (not write-through) — therapeuticClass is non-sensitive metadata; visible only to admin via /admin/audit per Phase 5 D-103. **disposition: accept.**
- **T-06-09 (DoS, index overhead):** btree on the 14-value enum is < 1 MB on 43k rows; write overhead negligible. **disposition: accept.**
- **T-06-10 (privilege escalation, sjukskoterska PATCH):** PATCH /api/medications/:id remains gated by Phase 2 D-32's `requirePermission('medication:update')` (apotekare + admin only). No new permission needed. **disposition: mitigate (existing).**
- **T-06-11 (cross-tenant filter leak):** `listMedicationsForUnit(careUnitId, filters)` retains careUnitId-first signature; the WHERE clause filters by `CareUnitMedication.careUnitId` first. The new therapeuticClass predicate joins via the global Medication table — careUnitId scope is unchanged. **disposition: mitigate (existing query shape).**
- **T-06-21 (silent trgm DROP):** mitigated by Task 2's explicit `--create-only` (or equivalent diff-and-inspect) workflow + verbatim documentation of the hand-edit in this SUMMARY. Post-apply inventory above confirms the trgm GIN survived.

No new threat surface NOT in the plan's threat register was introduced.

## Self-Check: PASSED

- File checks:
  - `apps/api/prisma/migrations/20260523124435_0012_medication_therapeutic_class/migration.sql` — FOUND
  - `apps/api/test/medications.therapeuticClass.integration.test.ts` — FOUND
  - `apps/web/src/components/TherapeuticClassCombobox.tsx` — FOUND
  - `packages/shared/src/constants/therapeuticClass.ts` — FOUND
  - `apps/api/test/contracts.therapeuticClass.test.ts` — FOUND (Nyquist suite — colocated with the existing apps/api contract tests because @meditrack/shared has no vitest runner; see file header comment in contracts.therapeuticClass.test.ts for the rationale)
- Commit checks:
  - c15b124 — FOUND
  - 7275300 — FOUND
  - 59808a7 — FOUND
  - 914fec3 — FOUND
  - edb4a6c — FOUND
  - 326218f — FOUND
  - 63c80d0 — FOUND
