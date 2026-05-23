# Phase 6 — Deferred Items

Tracked items discovered during execution but **out of scope** for the current
slice. Per execute-plan.md SCOPE BOUNDARY: only auto-fix issues DIRECTLY caused
by the current task's changes; pre-existing failures and unrelated discoveries
go here.

---

## 1. dashboard.integration.test.ts Test 1 — pre-existing sort-tiebreak flake

**Discovered during:** Plan 02 Task 3 (running the full API suite after the
`therapeuticClass` filter + persistence service edits).

**Symptom:**

```
FAIL test/dashboard.integration.test.ts > GET /api/dashboard/low-stock >
Test 1 (shape + sort): returns { rows, total } with rows sorted by urgency
ratio then name
AssertionError: expected 1 to be less than or equal to 0
  ❯ expect(a.name.localeCompare(b.name)).toBeLessThanOrEqual(0);
```

**Why it is NOT a Plan 02 regression:**

Reproduced against `master` BEFORE any Plan 02 Task 3 edits landed
(`git stash` of `apps/api/src/services/medication.service.ts` → re-ran
`pnpm --filter @meditrack/api test -- dashboard` → same failure). The
breakage is independent of the `therapeuticClass` filter / persistence /
audit work in Plan 02 Slice B.

**Root cause hypothesis:**

`dashboard.service.ts` uses `ORDER BY (currentStock::float /
lowStockThreshold::float) ASC, m."name" ASC` — Postgres `ASC` on text
columns uses the database's default collation, which on the dev container
appears to differ from JS `String.prototype.localeCompare`'s default
(likely an `en-US` vs `C` collation mismatch). The two values where the
test fails compare in OPPOSITE order between the two collation engines.

**Disposition:** Tracked for follow-up — either tighten the test's
tiebreak comparison to byte order (matching Postgres) or pin the
Postgres ORDER BY to a deterministic collation (`COLLATE "C"` /
`COLLATE "ucs_basic"`). Not blocking Plan 02.

**Files involved:**
- `apps/api/test/dashboard.integration.test.ts:102`
- `apps/api/src/services/dashboard.service.ts:76-77`

---

## 2. OrderLine quantity_positive_check log noise in test runs

**Discovered during:** Plan 02 Task 3 full-suite run.

**Symptom:**

```
ConnectorError { code: "23514", message: "new row for relation \"OrderLine\"
violates check constraint \"OrderLine_quantity_positive_check\"", ... }
```

emitted to stderr during one of the orders integration tests. Test still
passes — the constraint violation is the EXPECTED behavior the test
asserts. The log line is leaking to stderr from Prisma's connector.

**Disposition:** Cosmetic only. The test correctly asserts the rejection
arrives via the error envelope. No fix required.
