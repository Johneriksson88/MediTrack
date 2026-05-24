---
phase: 07
plan: 07-10
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/src/services/dashboard.service.ts
autonomous: true
gap_closure: true
requirements_addressed: [NTF-01]
must_haves:
  truths:
    - "Closes the post-merge gate failure surfaced by Wave 1 (Phase 07): `apps/api/test/dashboard.integration.test.ts` Test 1 `(shape + sort)` flips from FAILED → PASSED on `pnpm verify`"
    - "Postgres-vs-JS collation disagreement is resolved at the source: `apps/api/src/services/dashboard.service.ts:77` ORDER BY uses `LOWER(m.\"name\")` so the sort matches what JS `localeCompare()` produces (case-insensitive name ordering)"
    - "Dashboard UI rendering improves for the user: ALL-CAPS rows like `AVONEX®` no longer leap to the top of the low-stock list (above lowercase `Abseamed`); the displayed order matches user expectation"
    - "No test code is modified — the test's assertion semantics (`localeCompare ≤ 0`) is the user-visible contract; the production code is the wrong artifact"
    - "Single-file edit scoped to `apps/api/src/services/dashboard.service.ts`; no schema migration, no Prisma changes, no index changes; no new dependency"
    - "Atomic commit scope `fix(07-10)` continues the Phase 7 per-slice narrative (mirrors `fix(07-08)`)"
  artifacts:
    - path: apps/api/src/services/dashboard.service.ts
      provides: "Case-insensitive secondary sort that matches JS localeCompare"
      contains:
        - "LOWER(m.\"name\") ASC"
  key_links:
    - from: dashboard.service.ts:77 ORDER BY clause
      to: dashboard.integration.test.ts:102 localeCompare assertion
      via: "case-insensitive name comparison agrees between Postgres and JS"
      pattern: "LOWER\\(m\\.\\\"name\\\"\\) ASC"
---

<objective>
Close a Phase 07 Wave 1 post-merge gate failure surfaced by `pnpm verify`:

```
test/dashboard.integration.test.ts > GET /api/dashboard/low-stock > Test 1 (shape + sort)
AssertionError: expected 1 to be less than or equal to 0
  at expect(a.name.localeCompare(b.name)).toBeLessThanOrEqual(0)
```

**Root cause (verified against running DB):** The endpoint sorts via Postgres `ORDER BY m."name" ASC`, which uses the database's default C/POSIX collation (ASCII byte order — `'V'` 0x56 sorts before `'b'` 0x62). The test asserts via JS `String.prototype.localeCompare()` with no explicit locale, which uses a locale-aware case-insensitive compare (alphabetically `b` sorts before `V`, ignoring case). On rows where the seed data mixes ALL-CAPS names (`AVONEX®`) with regular Title-case names (`Abseamed`, `Acellulärt …`), the two sort orders diverge — the first row out of Postgres is `AVONEX®` but the test expects the alphabetical leader to be `Abseamed`.

**The fix (one line, one file):** Change `apps/api/src/services/dashboard.service.ts:77` ORDER BY secondary key from `m."name" ASC` to `LOWER(m."name") ASC`. This makes Postgres do case-insensitive ASCII compare (the same compare JS `localeCompare` produces for ASCII-only names) and the two sides agree.

**Why this is also the right user-facing fix:** the dashboard renders this list to a nurse reading the screen. A human expects `Abseamed` before `AVONEX®` (alphabetical), not the ASCII byte order where uppercase letters jump to the top. Fixing the SQL (vs widening the test) is the correct direction.

**Why this is scoped here and not deferred:** the post-merge gate from Phase 07 Wave 1 currently fails on `pnpm verify`. With this one-line fix in, the gate flips green and the phase verifier can run cleanly. The bug pre-existed Wave 1 but was uncovered by running the gate to its conclusion.

**Wave assignment:** Wave 1 (gap-closure follow-on), `depends_on: []`. Independent of all earlier 07-07/07-08/07-09 plans (different file).

**Out of scope:**
- No changes to `apps/api/test/dashboard.integration.test.ts` — the test contract `localeCompare ≤ 0` is the user-visible spec.
- No new Postgres functional index on `LOWER(name)` — the under-threshold result set is small (8% of CUM rows per vårdenhet, typically <50 rows); the planner runs a seq-scan-then-sort anyway. An index can be added later if profiling shows it matters.
- No changes to other ORDER BY clauses in the codebase — only the dashboard low-stock endpoint is in scope.
- No new `## Kända luckor` bullet — this is a fix, not a documented gap.

Output: 1 file modified (`apps/api/src/services/dashboard.service.ts`); 1 single-line edit; net +7 characters.
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-ops-submission-polish/07-VERIFICATION.md
@apps/api/src/services/dashboard.service.ts
@apps/api/test/dashboard.integration.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Change ORDER BY secondary key to LOWER(m."name") ASC</name>
  <files>apps/api/src/services/dashboard.service.ts</files>
  <read_first>
    - apps/api/src/services/dashboard.service.ts lines 60–84 (the $queryRaw block; the target is the ORDER BY clause on lines 76–77)
    - apps/api/test/dashboard.integration.test.ts lines 87–104 (the sort assertion; line 102 is the localeCompare check the fix satisfies)
  </read_first>
  <action>
    Single Edit operation on `apps/api/src/services/dashboard.service.ts`.

    Locate the ORDER BY clause on lines 76–77:

    ```ts
        ORDER BY (cum."currentStock"::float / cum."lowStockThreshold"::float) ASC,
                 m."name" ASC
    ```

    Change the secondary key from `m."name" ASC` to `LOWER(m."name") ASC`:

    ```ts
        ORDER BY (cum."currentStock"::float / cum."lowStockThreshold"::float) ASC,
                 LOWER(m."name") ASC
    ```

    The primary sort key (urgency ratio) is unchanged. The trailing backtick that closes the template literal on line 78 is unchanged. The function signature, return shape, and JSDoc comments are unchanged.

    Update the JSDoc inline ORDER BY narration on line 76 only if it would otherwise drift — looking at the file, the existing JSDoc block (lines 4–37, 39–48) describes the sort as "(currentStock / lowStockThreshold) ASC, then name ASC" in prose. That prose is correct at the semantic level (we still sort by name); no JSDoc edit required.

    Do NOT touch:
    - The WHERE clause (the careUnitId tenant scope, the deletedAt null check, the under-threshold predicate).
    - The SELECT list (every field stays; therapeuticClass select is unchanged).
    - The function signature or return type.
    - Any other file in apps/api/src/.
    - The test file.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. The new clause is in place:
      grep -F 'LOWER(m."name") ASC' apps/api/src/services/dashboard.service.ts
      # 2. The old clause is gone (no bare `m."name" ASC` in this file):
      test "$(grep -c 'm\."name" ASC' apps/api/src/services/dashboard.service.ts)" -eq 0
      # 3. The primary sort key (urgency ratio) is preserved:
      grep -F '(cum."currentStock"::float / cum."lowStockThreshold"::float) ASC' apps/api/src/services/dashboard.service.ts
      # 4. TypeScript still compiles:
      pnpm --filter @meditrack/api typecheck
      # 5. The failing test now passes:
      cd apps/api && pnpm exec vitest run test/dashboard.integration.test.ts && cd ../..
      # 6. The full verify chain passes:
      pnpm verify
    </automated>
  </verify>
  <done>
    `apps/api/src/services/dashboard.service.ts:77` reads `LOWER(m."name") ASC` (replacing `m."name" ASC`). All three dashboard integration tests pass. `pnpm verify` exits 0 end-to-end.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| dashboard.service → Postgres | Parameterised $queryRaw; the change replaces a column reference with `LOWER(column)`, no new user input enters the query. No injection surface. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-17 | Tampering | Sort determinism | mitigate | `LOWER(m."name")` is deterministic for any UTF-8 input Postgres accepts. The result set is sorted by a stable lowercased key; ties (same lowercased name) fall back to row order, which is identical between calls because the row identity is `careUnitMedicationId` (PK, ordered by insertion). |
| T-07-18 | Information Disclosure | careUnitId tenant scope | accept | Unchanged — the WHERE clause's `cum."careUnitId" = ${careUnitId}` still enforces T-06-01 / T-02-01. Sort key change is orthogonal to scope. |
| T-07-19 | All other ASVS L1 categories | N/A | out-of-scope | Local sort key change; no auth, no DB schema, no new attack surface. |
</threat_model>

<verification>
- `grep -F 'LOWER(m."name") ASC' apps/api/src/services/dashboard.service.ts` returns one line.
- `apps/api/test/dashboard.integration.test.ts Test 1 (shape + sort)` PASSES.
- `pnpm --filter @meditrack/api typecheck` exits 0.
- `pnpm verify` exits 0 end-to-end (lint + typecheck + test + build all green).
- No other file modified.
</verification>

<success_criteria>
- 1 file modified: `apps/api/src/services/dashboard.service.ts` — exactly one single-line edit.
- All grep + typecheck + test assertions in `<verify>` block pass.
- `pnpm verify` exits 0.
- Commit message scoped `fix(07-10)`; cites the Wave 1 post-merge gate failure verbatim so a reviewer can grep-trace gate → plan → commit.
</success_criteria>

<output>
Create `.planning/phases/07-ops-submission-polish/07-10-SUMMARY.md` when done, listing:
- The exact one-line diff for the ORDER BY change.
- The commit SHA (single commit).
- Confirmation that `pnpm exec vitest run test/dashboard.integration.test.ts` exits 0 (all 3 tests pass).
- Confirmation that `pnpm verify` exits 0 end-to-end.
- A one-line note on why this slice was added mid-phase (post-merge gate failure, unrelated to 07-07/07-08/07-09 but blocking the verifier).
</output>
