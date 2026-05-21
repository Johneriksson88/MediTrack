---
phase: 02-medication-catalog
reviewed: 2026-05-21T12:00:00Z
depth: standard
files_reviewed: 41
files_reviewed_list:
  - apps/api/prisma/migrations/20260521000000_medication_catalog/migration.sql
  - apps/api/prisma/schema.prisma
  - apps/api/prisma/seed.ts
  - apps/api/src/app.ts
  - apps/api/src/auth/permissions.ts
  - apps/api/src/plugins/errorHandler.ts
  - apps/api/src/routes/medications/create.ts
  - apps/api/src/routes/medications/delete.ts
  - apps/api/src/routes/medications/index.ts
  - apps/api/src/routes/medications/list.ts
  - apps/api/src/routes/medications/search.ts
  - apps/api/src/routes/medications/update.ts
  - apps/api/src/services/medication.service.ts
  - apps/web/package.json
  - apps/web/src/components/InlineEditThreshold.tsx
  - apps/web/src/components/LowStockBadge.tsx
  - apps/web/src/components/NplBadge.tsx
  - apps/web/src/components/ui/badge.tsx
  - apps/web/src/components/ui/select.tsx
  - apps/web/src/components/ui/sheet.tsx
  - apps/web/src/components/ui/sonner.tsx
  - apps/web/src/components/ui/table.tsx
  - apps/web/src/components/ui/tooltip.tsx
  - apps/web/src/features/medications/useMedicationMutations.ts
  - apps/web/src/features/medications/useMedicationsQuery.ts
  - apps/web/src/main.tsx
  - apps/web/src/routes/lakemedel/AddMedicationButton.tsx
  - apps/web/src/routes/lakemedel/DeleteMedicationDialog.tsx
  - apps/web/src/routes/lakemedel/LakemedelFilter.tsx
  - apps/web/src/routes/lakemedel/LakemedelPage.tsx
  - apps/web/src/routes/lakemedel/LowStockBanner.tsx
  - apps/web/src/routes/lakemedel/MedicationCard.tsx
  - apps/web/src/routes/lakemedel/MedicationCardList.tsx
  - apps/web/src/routes/lakemedel/MedicationSheet.tsx
  - apps/web/src/routes/lakemedel/MedicationTable.tsx
  - apps/web/src/routes/lakemedel/PaginationFooter.tsx
  - packages/shared/src/constants/medicationDefaults.ts
  - packages/shared/src/constants/medicationForms.ts
  - packages/shared/src/contracts/medication.ts
  - packages/shared/src/contracts/permissions.ts
  - packages/shared/src/index.ts
findings:
  critical: 4
  warning: 11
  info: 6
  total: 21
status: issues_found
---

# Phase 2: Code Review Report

**Reviewed:** 2026-05-21T12:00:00Z
**Depth:** standard
**Files Reviewed:** 41
**Status:** issues_found

## Summary

Phase 2 (medication catalog) implements list / search / create / update / soft-delete for `CareUnitMedication` with NPL-locked fields, RBAC at the route boundary, tenant scoping on every Prisma query, and a polished React shell (table / mobile cards / Sheet / optimistic inline edit). The architecture is solid and the security posture — careUnitId-first services, defense-in-depth NPL strip in `updateCareUnitMedication`, 404-collapsing on cross-tenant access — is exactly what the brief §6 interviewer is looking for.

That said, several defects materially undermine that posture and need to be fixed before this phase ships:

- **`z.coerce.boolean()` is broken for the URL roundtrip** — every `?belowThreshold=false` query is silently coerced to `true`, mis-filtering the entire list. This affects shareable URLs and the LowStockBanner toggle.
- **The `pg_trgm` GIN index will not be used by Prisma's generated ILIKE query** — the index is on `lower(name)` while Prisma generates `WHERE "name" ILIKE '%q%'`. The 43k-row table-scan the migration was added to prevent will still happen on every keystroke. This is also the headline answer to the brief §5 "skalbarhet" question.
- **`PATCH /api/medications/:id` is not atomic** — `cumData` and `medData` writes happen as two separate Prisma calls outside any transaction. If the second write fails, the row is left half-updated. The brief §6 concurrency question will land here.
- **`searchGlobalMedications` accepts empty `q`** — Zod `q: z.string()` has no `.min(1)`, so any caller (curl, malformed FE, hostile client) can request `ILIKE '%%'` against the global 43k-row catalog. The FE's `enabled` gate is not a security boundary.

Additional concerns are documented below — Sheet PATCH path can ship invalid bodies to the BE because the NPL create form skips its Zod resolver, `Number(searchParams.get('page'))` can produce NaN, soft-delete and update have unprotected check-then-act windows, the `belowThreshold` raw SQL `params.slice(0, paramIdx - 1)` is fragile, and the Phase-2 contract documentation suggests `belowThresholdTotal` is filter-respecting when it actually is not. See WR-01 through WR-11.

## Critical Issues

### CR-01: `z.coerce.boolean()` silently treats every non-empty URL value as `true`

**File:** `packages/shared/src/contracts/medication.ts:56`
**Issue:** `belowThreshold: z.coerce.boolean().optional()` uses JavaScript's `Boolean()` coercion, not string parsing. `Boolean("false")` is `true`. As a result, every URL of the form `?belowThreshold=false` (e.g. a shared link, a back/forward navigation, or any FE roundtrip after the user toggles the chip off) parses as `belowThreshold: true` server-side and runs the expensive cross-column raw SQL path. The LakemedelPage's `applyPage`/`updateFilters` only writes `belowThreshold=true` to the URL (never `false`), so the FE happens to dodge the bug for now — but the contract is the BE's API and any direct API client (interview reviewer running curl, future mobile client) will hit it. This silently corrupts the most security-relevant filter in the catalog.

**Fix:**
```typescript
// packages/shared/src/contracts/medication.ts
belowThreshold: z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((v) => v === true || v === 'true' || v === '1')
  .optional(),
```
Add a unit test that asserts `medicationListQuery.parse({ belowThreshold: 'false' })` yields `{ belowThreshold: false }`.

---

### CR-02: GIN trigram index is not used by Prisma's ILIKE query — search remains a 43k-row table scan

**File:** `apps/api/prisma/migrations/20260521000000_medication_catalog/migration.sql:60`
**Issue:** The index is created as `USING gin (lower("name") gin_trgm_ops)` (a functional index on `lower(name)`), but Prisma's `name: { contains: q, mode: 'insensitive' }` generates `WHERE "Medication"."name" ILIKE '%q%'` — i.e., the LHS is `"name"`, not `lower("name")`. Postgres can only use a functional GIN index when the query expression matches the indexed expression exactly. The result: the index occupies ~50–100 MB on disk and is never read; every typeahead keystroke does a sequential scan on 43,538 rows. This is the entire purpose of the migration and it is a no-op. Worse: the inline comment "Without this index, ILIKE '%paracet%' would table-scan 43k rows on every keystroke" misleads any future engineer reading the file.

**Fix:**
```sql
-- Drop the functional index and recreate on the raw column.
-- pg_trgm's GIN supports ILIKE on the column directly when there is no LOWER() wrapper.
DROP INDEX IF EXISTS "Medication_name_lower_trgm_idx";
CREATE INDEX "Medication_name_trgm_idx" ON "Medication" USING gin ("name" gin_trgm_ops);
```
Verify with `EXPLAIN ANALYZE` on `SELECT … FROM "Medication" WHERE "name" ILIKE '%paracet%'` that the new index is selected (`Bitmap Index Scan on Medication_name_trgm_idx`). Alternative: keep the functional index and switch the Prisma query to a `$queryRaw` with `lower("name") ILIKE lower($1)` — but the column-index option is simpler and the comment intent matches.

---

### CR-03: `searchGlobalMedications` accepts empty `q`, allowing unbounded scan of 43k-row global catalog

**File:** `packages/shared/src/contracts/medication.ts:87`, `apps/api/src/services/medication.service.ts:258`
**Issue:** `medicationSearchQuery.q` is `z.string()` with no `.min(1)`. A request like `GET /api/medications/search?q=` passes Zod, then `searchGlobalMedications` runs `name: { contains: '' }` (ILIKE '%%' — matches every row) plus `careUnitMedications.none` filter — Prisma compiles this to a full table scan + correlated NOT EXISTS over 43k rows, returning 20 rows after sorting all of them. Defense-in-depth: the FE's `enabled: debouncedQ.length > 0` gate is helpful UX but not a security boundary. Any authenticated user (including `sjukskoterska`) can trigger an expensive query repeatedly — a DoS amplifier given that the trigram index is also dead (CR-02). Combined attack surface: one sjukskoterska account can stall the API.

**Fix:**
```typescript
// packages/shared/src/contracts/medication.ts
export const medicationSearchQuery = z.object({
  q: z.string().trim().min(2).max(64),  // ≥2 chars, capped at 64
  limit: z.coerce.number().int().min(1).max(20).default(20),
});
```
Add a corresponding API test asserting that `?q=` and `?q=a` both return 400. The FE already debounces and only enables on `length > 0`; bump the FE gate to `length >= 2` for consistency.

---

### CR-04: `updateCareUnitMedication` performs two writes outside a transaction — half-updated row on partial failure

**File:** `apps/api/src/services/medication.service.ts:448-465`
**Issue:** When the payload contains both stock/threshold fields and Medication-table fields (for `source === 'user'` rows), the service does two sequential `prisma.update` calls without `$transaction`. If the second `prisma.medication.update` throws (FK constraint, DB hiccup, race with a concurrent delete), the first update has already committed: the CareUnitMedication row now reflects new stock but the Medication name/atc/form is stale. The service then throws, the FE shows "Kunde inte spara — försök igen", and a retry will re-apply the same stock change on top of the already-updated value (e.g., user typed 50→60 stock, sees error, retries 60, now stock=60 was applied once + retry overwrites with 60 — but if the user instead corrected the value, the original is silently lost). For the interview audience this is precisely the "two nurses updating concurrently" question; the answer here is "we corrupt the row on partial failure."

**Fix:**
```typescript
// medication.service.ts — wrap the two updates in a transaction
let updatedRow = row;
if (hasCumUpdate || hasMedUpdate) {
  updatedRow = await prisma.$transaction(async (tx) => {
    let next = row;
    if (hasCumUpdate) {
      next = await tx.careUnitMedication.update({
        where: { id: careUnitMedicationId },
        data: cumData,
        include: { medication: true },
      });
    }
    if (hasMedUpdate) {
      const updatedMed = await tx.medication.update({
        where: { id: row.medicationId },
        data: medData,
      });
      next = { ...next, medication: updatedMed };
    }
    return next;
  });
}
```
This also enables a future `SELECT ... FOR UPDATE` on the CareUnitMedication row inside the same transaction (Phase 4 STK-02 hook the schema comment already mentions).

## Warnings

### WR-01: `softDeleteCareUnitMedication` has a check-then-act race window

**File:** `apps/api/src/services/medication.service.ts:486-506`
**Issue:** `findUnique` then `update` is not atomic. Two concurrent `DELETE /api/medications/:id` requests both pass the existence check, both call `update({ data: { deletedAt: new Date() } })`. Both 204. Not corrupting per se (last-write-wins on `deletedAt`), but the audit story is wrong: an audit log built on this service would record two deletions of the same row. Also, the same race lets a `PATCH` interleave between `findUnique` and `update`, producing a row that's both deleted and freshly edited (`updatedAt` after `deletedAt`).
**Fix:** Use a single conditional update — `prisma.careUnitMedication.updateMany({ where: { id, careUnitId, deletedAt: null }, data: { deletedAt: new Date() } })` and treat `count === 0` as 404. This is a single SQL UPDATE with a WHERE that doubles as the existence + scope + idempotency check.

---

### WR-02: `nplForm` in `MedicationSheet` is unvalidated — invalid bodies reach the BE

**File:** `apps/web/src/routes/lakemedel/MedicationSheet.tsx:577-579`
**Issue:** `useForm<Pick<...>>(...)` is created without `resolver: zodResolver(...)`. The user can type `-5` as `currentStock` or `0` as `lowStockThreshold` and `nplForm.handleSubmit` will happily call `onSubmitNpl` with garbage. The BE catches it (Zod `medicationCreateFromNplRequest` rejects), but the FE shows a generic "Kunde inte spara — försök igen" toast instead of an inline field error. Compare to `userForm` (line 582-593) which does have `zodResolver(medicationCreateUserRequest)`. Inconsistency.
**Fix:**
```typescript
const nplForm = useForm<Pick<MedicationCreateFromNplRequest, 'currentStock' | 'lowStockThreshold'>>({
  resolver: zodResolver(
    medicationCreateFromNplRequest.pick({ currentStock: true, lowStockThreshold: true }),
  ),
  defaultValues: { currentStock: 0, lowStockThreshold: 10 },
});
```
Then render `nplForm.formState.errors.currentStock?.message` and `lowStockThreshold` errors next to the inputs (mirror the userForm pattern at lines 880-883).

---

### WR-03: `Number(searchParams.get('page') ?? '1')` produces `NaN` on tampered/manually-edited URLs

**File:** `apps/web/src/routes/lakemedel/LakemedelPage.tsx:45,73`
**Issue:** `?page=abc` → `Number('abc')` → `NaN`. That `NaN` flows into the filters object passed to `useMedicationsQuery`, becomes `page=NaN` in the querystring, and the BE Zod rejects it. The user sees a TanStack Query error, no rows, and an unhelpful state. `?page=0` is similar — Zod requires positive. `?page=-1` likewise. `?page=99999` past totalPages renders empty without a "page out of range" affordance.
**Fix:** Clamp the value at the page boundary:
```typescript
const rawPage = Number(searchParams.get('page') ?? '1');
const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
```
Apply the same defensive parse to `pageSize`. Even better: derive both via a `z.coerce.number()` parse in the page, so the shared schema is the only source of truth.

---

### WR-04: `belowThreshold` raw-SQL path `params.slice(0, paramIdx - 1)` is brittle when no filters are active

**File:** `apps/api/src/services/medication.service.ts:167`
**Issue:** When `belowThreshold` is the only active filter (no `q`/`atc`/`form`), `paramIdx` is still `2` after the initial `careUnitId`. `params.slice(0, paramIdx - 1)` is `params.slice(0, 1)` = `[careUnitId]` — correct in this case. But the off-by-one math (`paramIdx - 1`) only works because `paramIdx` is initialized to `2` before any user filter is pushed. The next engineer who adds a 5th filter and increments `paramIdx` differently will silently drop or duplicate params. Tighten by tracking `params.length` directly: `params.slice(0, params.length - 2)` (since `pageSize` + `skip` are always the last two pushes). Actually even better, build the count params explicitly.
**Fix:**
```typescript
// Build count params explicitly — don't slice from the LIMIT/OFFSET params.
const baseParams = [...params];  // params before LIMIT/OFFSET were pushed
// ... build the SELECT id query, then push pageSize/skip to a different array:
const matchingIds = await prisma.$queryRawUnsafe<...>(
  selectSql, ...baseParams, pageSize, skip,
);
const totalRows = await prisma.$queryRawUnsafe<...>(countSql, ...baseParams);
```
This removes the `slice(0, paramIdx - 1)` cleverness entirely.

---

### WR-05: `belowThresholdTotal` is filter-independent, but the contract docs say it tracks the filter set

**File:** `apps/api/src/services/medication.service.ts:170-177,214-221`; `packages/shared/src/contracts/medication.ts:65-67`
**Issue:** The contract comment in `medication.ts` says `belowThresholdTotal` is "required, never optional; powers the LowStockBanner count even when the active filter set yields zero matching rows". The service implementation does NOT join with `q`/`atc`/`form` — both raw queries hardcode only `careUnitId` + `deletedAt: null` + `currentStock < lowStockThreshold`. So the field is a global count regardless of the filter set. The `optimisticThresholdUpdate` hook in `useMedicationMutations.ts:140-143` then recomputes a filter-LOCAL belowThresholdTotal from `old.rows`, contradicting the server semantics. The two are inconsistent in opposite directions; whichever the LowStockBanner believes at any moment determines what the user sees.
**Fix:** Pick one contract and document it explicitly. Recommendation: keep server-side filter-independent (current behavior, matches what the LowStockBanner intent seems to be — "X medications are below threshold across your unit"), update the optimistic hook to NOT recompute belowThresholdTotal locally (let `onSettled` invalidation refresh the value from the server), and rewrite the contract comment to read "global count of below-threshold rows for the caller's vårdenhet, independent of the q/atc/form/belowThreshold filters."

---

### WR-06: Sheet save path swallows non-conflict errors silently after toast

**File:** `apps/web/src/routes/lakemedel/MedicationSheet.tsx:642-650, 661-669`
**Issue:** `onSubmitNpl` and `onSubmitUser` catch all exceptions via `try { ... } catch (err) { if (...conflict...) setConflictError(...); }`. For any other error (network, 500, 403 from a stale session, Zod validation_failed if `nplForm` skips its resolver per WR-02), the `catch` arm does NOTHING — no state update, no surfaced error. The hook's `onError` did fire a toast, but the Sheet remains open with the user's form data and no inline feedback. Acceptable as a fallback, but loses information for the 400 validation case. Specifically: when the BE rejects a body that the FE thought was valid, the user can't tell what went wrong.
**Fix:** Render the Zod issues from `err.envelope.error.details` (which is what the errorHandler attaches for `validation_failed`) under the relevant fields, or at minimum surface the `error.message` near the submit button. Mirror the `conflictError` pattern with a `submitError` state for the catch-all.

---

### WR-07: `useUpdateThresholdOptimistic` race: cancel only cancels `['medications']`, leaves `['medication-search']` racing

**File:** `apps/web/src/features/medications/useMedicationMutations.ts:123,164`
**Issue:** `onMutate` calls `cancelQueries({ queryKey: ['medications'] })` but the Sheet's typeahead query is `['medication-search', q]`. If the user has the create Sheet open with a typeahead request in flight while another tab/window is doing the threshold edit, the in-flight search response can overwrite cache that the optimistic update modified — though in practice the search cache is a different key. Closer issue: `onSettled` invalidates only `['medications']`, not `['medication-search']`. The search cache can still hold a result the user just stocked (because they deleted-and-re-added, see D-30 transparent restore) — the search dropdown would still show it as available. The pessimistic `useCreateMedication.onSuccess` invalidates both, so the create flow is fine; only the threshold optimistic hook is inconsistent.
**Fix:** In `useUpdateThresholdOptimistic.onSettled`, additionally `invalidateQueries({ queryKey: ['medication-search'] })`. Threshold edits don't strictly affect search results, but the inconsistency cost of NOT invalidating both consistently is harder to reason about than the trivial extra fetch.

---

### WR-08: `pageSize` is round-tripped through URL but the page always sends `DEFAULT_PAGE_SIZE`

**File:** `apps/web/src/routes/lakemedel/LakemedelPage.tsx:74-77,98`
**Issue:** `updateFilters` reads/writes `pageSize` from/to the URL, but `filters.pageSize` at line 98 is hardcoded to `DEFAULT_PAGE_SIZE`. The URL state for `pageSize` is dead code — no UI surface emits a pageSize change. If the URL has `?pageSize=50` (manually shared link, future page-size selector), it is persisted but ignored. Either remove the dead persistence or pipe it into `filters` (`pageSize: Number(searchParams.get('pageSize') ?? DEFAULT_PAGE_SIZE)`).
**Fix:** Pick one — either delete the `pageSize` write paths from `updateFilters` and the URL handling, or read it back in `filters` so it actually controls the query.

---

### WR-09: `MedicationSheet` `useEffect` dependency lint suppressed for `editForm.reset` — stale closure risk

**File:** `apps/web/src/routes/lakemedel/MedicationSheet.tsx:159-174, 596-614`
**Issue:** Two `useEffect` blocks have `eslint-disable-next-line react-hooks/exhaustive-deps`. The first (EditSheet line 174) excludes `editForm` and `isNpl` derivatives; the second (MedicationSheet line 614) excludes `nplForm`, `userForm`. `react-hook-form` 7+ has stable references for `reset`, so the suppressions are harmless TODAY, but they hide the dependency relationship from readers and from React's compiler. A future change that wraps `nplForm`/`userForm` in a `useMemo` with a dependency could silently regress without lint noise.
**Fix:** Either add `editForm`, `nplForm`, `userForm` to the dependency arrays (they are stable so this is a no-op at runtime), or pull the form-reset logic into a custom hook with explicit dependencies.

---

### WR-10: `seedMedications` `Promise.all(insertPromises)` is fire-and-forget — backpressure can OOM the parser

**File:** `apps/api/prisma/seed.ts:175,213`
**Issue:** The CSV parser is `readable`-driven and pushes `prisma.medication.createMany(...)` calls into `insertPromises` without awaiting them. With a 43k-row CSV at chunk size 1000, ~44 insert promises run concurrently against Postgres. Two consequences: (1) Node may queue ~44 Prisma operations against the connection pool (default 10) — Prisma serializes internally, but the parser keeps pulling rows into memory; (2) one slow insert can stack memory pressure indefinitely. On the seeded `compose up` budget (30s target) the parser will outrun the inserter and buffer multiple thousand rows in memory.
**Fix:** Apply backpressure — pause the parser when an insert is in-flight, or use a worker-pool/promise-throttle. Simplest:
```typescript
parser.on('readable', async () => {
  parser.pause();
  let row: CsvRow | null;
  while ((row = parser.read() as CsvRow | null) !== null) {
    // ... push to chunk ...
    if (chunk.length >= CHUNK_SIZE) {
      await flushChunk();  // await, not push to array
    }
  }
  parser.resume();
});
```
Or use `stream.pipeline` + `Readable.from` with `for await`.

---

### WR-11: `requireSession` does TWO DB roundtrips per request (session lookup + user lookup); `req.user.role` not snapshotted on session

**File:** `apps/api/src/auth/requireSession.ts:35-52`
**Issue:** Phase 1's session model snapshots `careUnitId` on the Session row (D-16) — but NOT `role`. Every request now hits `findSessionById` then `findUnique({ where: { id: session.userId } })` to fetch role + name + email. On the per-keystroke search endpoint, that's 2 queries before the actual search executes. Either snapshot role on Session too (matching the careUnitId pattern — what happens to role if it changes mid-session is the same question as careUnit changing mid-session, which D-16 already answers: snapshot) or `include: { user: { include: { careUnit: { select: { id, name } } } } }` on `findSessionById` to collapse to one query.
**Fix:** Add `role: Role` to the Session model in a new migration, populate at session-creation time, and read `session.role` instead of doing a second query. This also unblocks audit (Phase 4) — every action knows the user's role at session-grant time without a join.

## Info

### IN-01: `as any` cast on `baseWhere` undermines type safety in the most security-critical query

**File:** `apps/api/src/services/medication.service.ts:110`
**Issue:** `} as any;` on the `baseWhere` literal silences Prisma's `CareUnitMedicationWhereInput` type check. The `careUnitId` and `deletedAt` constraints are critical security invariants — losing static checks here means a future refactor that adds `medication: { careUnitId: someOtherId }` (impossible today but conceivable when ordering joins arrive) wouldn't surface as a compile error.
**Fix:** Spread the medication clauses with the correct Prisma type — `Prisma.CareUnitMedicationWhereInput` — instead of `Record<string, unknown>` + `any` cast.

### IN-02: Hardcoded `SHARED_PASSWORD = 'demo1234'` and `console.log` of plaintext password in seed

**File:** `apps/api/prisma/seed.ts:42,305-307`
**Issue:** Dev convenience artifact, documented as such, but committed plaintext password + `console.log(... password=${SHARED_PASSWORD} ...)` is a code smell. If the seed ever runs in a non-dev environment (CI, accidental compose-up on staging, demo VM), the password is in the process log. Defended only by comment.
**Fix:** Guard the seed with `if (env.NODE_ENV === 'production') throw new Error('Refusing to run seed in production');` at the top of `main()`. Optionally also strip the password from the log message — credentials should be in the README, not in stdout.

### IN-03: `MedicationCard.tsx` has an extra `<p>` wrapping `<InlineEditThreshold>` — invalid HTML when threshold is in editing mode

**File:** `apps/web/src/routes/lakemedel/MedicationCard.tsx:49-58`
**Issue:** `<p>` cannot contain an `<input>` element per the HTML spec — when `InlineEditThreshold` switches to edit mode it renders `<Input type="number">`, producing `<p>...<input>...</p>` which browsers will auto-correct (closing the `<p>` early) and shift layout. The `<span onClick>` wrapper around `<InlineEditThreshold>` is also a non-standard event-stopper that duplicates work already done inside the component.
**Fix:** Change the outer `<p>` to a `<div>` (keep the same Tailwind classes). Also drop the `<span onClick={e => e.stopPropagation()}>` wrapper — `InlineEditThreshold` already calls `stopPropagation()` on its own handlers per its file comment.

### IN-04: `MedicationTable.tsx` outdated `// TODO Plan 03` comment in shipped code

**File:** `apps/web/src/routes/lakemedel/MedicationTable.tsx:34`
**Issue:** The comment "Tröskel cell: number display. // TODO Plan 03: <InlineEditThreshold>" is stale — `InlineEditThreshold` is already wired below (line 126). Misleads readers.
**Fix:** Update the comment to describe current behavior, or delete it.

### IN-05: `LowStockBanner` reads `sessionStorage` in a `useState` initializer without try/catch

**File:** `apps/web/src/routes/lakemedel/LowStockBanner.tsx:22-24`
**Issue:** `sessionStorage.getItem` can throw `SecurityError` in Safari private mode or when third-party storage is blocked. The lazy initializer pattern would crash the component on mount in those environments, breaking the entire page.
**Fix:**
```typescript
const [dismissed, setDismissed] = useState<boolean>(() => {
  try {
    return sessionStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
});
```
Apply the same guard around `sessionStorage.setItem` in `handleDismiss`.

### IN-06: `medicationListQuery` is not `.strict()` — unknown query params are silently dropped

**File:** `packages/shared/src/contracts/medication.ts:52-59`
**Issue:** Unlike `medicationUpdateRequest` (which uses `.strict()` at line 184), `medicationListQuery` accepts any extra keys without rejection. A typo (`?bellowThreshold=true`) is silently ignored — the UI shows unfiltered data instead of an error. Consistent strictness across query schemas is a smaller surface area for future drift.
**Fix:** Add `.strict()` to `medicationListQuery` and `medicationSearchQuery`. Add tests that assert `{ unknownKey: 'x' }` is rejected with 400.

---

_Reviewed: 2026-05-21T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
