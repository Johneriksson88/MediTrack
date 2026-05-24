---
phase: 09-dashboard-depth-back-nav
reviewed: 2026-05-25T00:00:00Z
depth: standard
files_reviewed: 18
files_reviewed_list:
  - apps/api/src/routes/dashboard/index.ts
  - apps/api/src/routes/dashboard/orders.ts
  - apps/api/src/services/dashboard.service.ts
  - apps/api/test/dashboard.orders.integration.test.ts
  - apps/web/src/features/dashboard/useDashboardOrdersQuery.ts
  - apps/web/src/features/orders/__tests__/useBestallningarBackLink.test.tsx
  - apps/web/src/features/orders/useBestallningarBackLink.ts
  - apps/web/src/features/orders/useOrderMutations.ts
  - apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx
  - apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx
  - apps/web/src/routes/bestallningar/BestallningarPage.tsx
  - apps/web/src/routes/bestallningar/ComposeOrderPage.tsx
  - apps/web/src/routes/bestallningar/OrdersCardList.tsx
  - apps/web/src/routes/bestallningar/OrdersTable.tsx
  - apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx
  - apps/web/src/routes/dashboard/DashboardOrdersCard.tsx
  - apps/web/src/routes/dashboard/DashboardPage.tsx
  - packages/shared/src/contracts/dashboard.ts
findings:
  critical: 0
  warning: 7
  info: 2
  total: 9
status: issues_found
---

# Phase 9: Code Review Report

**Reviewed:** 2026-05-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 18
**Status:** issues_found

## Summary

Reviewed the Phase 9 "Dashboard depth + back navigation" deliverable: a new role-discriminated `GET /api/dashboard/orders` endpoint, the corresponding `DashboardOrdersCard`, the new `useBestallningarBackLink` hook that powers `?from=<status>` propagation through ComposeOrderPage, and the five mutation-side `['dashboard', 'orders']` invalidations.

No correctness-blocking or security defects found. The route is correctly gated by `requireSession` (mirrors the Phase 6 low-stock precedent), the service uses parameterised Prisma queries throughout, and every query is scoped by `careUnitId` to preserve T-09-04 cross-tenant isolation.

Findings are concentrated in three areas:

1. **Contract drift** — the new `dashboardOrderRow.createdAt` is `z.string()` while `orderListItem.createdAt` is `z.string().datetime()` (WR-01).
2. **A11y / ARIA semantics** — `<Link role="listitem">` and `<p role="list">` are non-idiomatic (WR-02, WR-03).
3. **Test robustness** — Test 5's seed-outside-try and Test 3's cleanup omissions can leak fixtures on partial failure (WR-04, WR-05).

Plus two small consistency observations around the count-vs-rows race window and a misleading inline comment.

## Warnings

### WR-01: `dashboardOrderRow.createdAt` is a loose `z.string()` while the sibling `orderListItem` enforces ISO-8601 datetime

**File:** `packages/shared/src/contracts/dashboard.ts:144`
**Issue:** `dashboardOrderRow` declares `createdAt: z.string()` with no `.datetime()` refinement. The closely-related `orderListItem` schema (`packages/shared/src/contracts/order.ts:103`) declares `createdAt: z.string().datetime()`. The dashboard service emits `order.createdAt.toISOString()` so the value is always ISO-8601 at runtime, but the schema does not enforce that on the wire. A future BE change that accidentally emits e.g. `2026-05-20T08:00:00` (no `Z`) or `1716192000000` (epoch ms) would silently pass Zod validation on both sides and break `formatRelative(row.createdAt)` (it calls `new Date(input)` which would return `Invalid Date`).
**Fix:**
```ts
// packages/shared/src/contracts/dashboard.ts:138-145
export const dashboardOrderRow = z.object({
  id: z.string(),
  status: orderStatusEnum,
  lineCount: z.number().int().nonnegative(),
  totalQuantity: z.number().int().nonnegative(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.string().datetime(), // tighten to match orderListItem
});
```

### WR-02: `<Link>` element given `role="listitem"` — anchor's implicit `link` role is silently overridden

**File:** `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx:207-214`
**Issue:** The row markup is `<Link role="listitem" ...>`. React-Router's `<Link>` renders an `<a>`, whose implicit role is `link`. Putting `role="listitem"` on it ARIA-overrides the link role for AT consumers, so screen-reader users lose the "link" announcement and instead hear "list item" (often without an actionable affordance hint). Standard ARIA guidance for navigable lists is to wrap the link inside a real `<li>` (`<li role="listitem"><Link>…</Link></li>`) so both semantics survive. The tests at `DashboardOrdersCard.test.tsx:299-313` lock the wrong behavior in by asserting `role="listitem"` and `getAttribute('href')` on the same element — a fix to the markup must update those assertions too.
**Fix:**
```tsx
// DashboardOrdersCard.tsx — wrap the Link instead of overriding its role
<ul role="list" aria-label={title} className="...">
  {rows.map((row) => (
    <li key={row.id}>
      <Link
        to={`/bestallningar/${row.id}?from=${row.status}`}
        className="..."
      >
        {/* ... */}
      </Link>
    </li>
  ))}
</ul>
```
…and update `DashboardOrdersCard.test.tsx` Tests 1, 2, 5 to look up `getAllByRole('listitem')` and then read the `<a>` href via `within(li).getByRole('link').getAttribute('href')`.

### WR-03: Empty-section branch renders a `<p>` with `role="list"` — paragraph cannot semantically be a list container

**File:** `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx:196-203`
**Issue:** When a section has rows.length === 0 (e.g., nurse has 1 own draft and 0 recent history rows, so `EmptyState` does NOT trigger but the second section IS empty), the code renders:
```tsx
<p role="list" aria-label={title}>Inga rader.</p>
```
A `<p>` is a phrasing-content element; it cannot legally contain flow-level list semantics, and assigning `role="list"` to it produces a list with zero listitems plus a free-floating text node — invalid per ARIA 1.2 (`list` requires `listitem` children). Screen readers may say "Egna utkast, list, empty" or skip the text entirely depending on engine. The test in `DashboardOrdersCard.test.tsx` only exercises the rows.length > 0 path for Sections (Tests 1/2 supply ≥1 row in each), so this branch is uncovered.
**Fix:** Drop the bogus role and use a plain paragraph (or render no list role at all when empty):
```tsx
{rows.length === 0 ? (
  <p className="text-xs text-muted-foreground px-2 py-2">Inga rader.</p>
) : (
  <ul role="list" aria-label={title}>
    {/* … */}
  </ul>
)}
```

### WR-04: Test 5 seeds three orders OUTSIDE the try/finally — partial failure leaks orphan rows

**File:** `apps/api/test/dashboard.orders.integration.test.ts:285-315` (seed) vs `317-346` (try/finally)
**Issue:** The three `prisma.order.create({...})` calls that allocate `oldestId`, `middleId`, `newestId` happen between lines 286 and 315 — outside the `try` block that starts at line 317. The `finally` block (line 342) only runs if execution enters `try`. If `prisma.order.create` for `oldestId` succeeds but the second `create` for `middleId` throws (DB hiccup, schema drift, connection drop), the `oldestId` order is left in the test DB. The next run of Test 5 then sees four "far-future" orders in `egnaUtkast`, and `top3.map(r => r.id).toEqual([newestId, middleId, oldestId])` fails non-deterministically because there's now a stranger sitting at position 0 with an even older `createdAt + ε` than the new run's seeds. (The new seeds use `Date.now() + 1 year`, which advances per run, so the leak from a previous run would actually sort BELOW the current run's seeds — but the assertion `body.egnaUtkast.count` would still be off, and the leak compounds over CI runs.)
**Fix:** Move the seeds inside the `try` block, or collect IDs into an array as you create:
```ts
const seededIds: string[] = [];
try {
  for (const offsetHours of [0, 1, 2]) {
    const o = await prisma.order.create({
      data: {
        careUnitId,
        createdByUserId: nurseUser.id,
        status: 'utkast',
        createdAt: new Date(baseMs + offsetHours * 60 * 60 * 1000),
      },
    });
    seededIds.push(o.id);
  }
  const [oldestId, middleId, newestId] = seededIds;
  // ... assertions
} finally {
  if (seededIds.length > 0) {
    await prisma.order.deleteMany({ where: { id: { in: seededIds } } });
  }
}
```

### WR-05: Test 3 cross-vårdenhet cleanup omits `careUnitMedication` and is non-atomic on partial failure

**File:** `apps/api/test/dashboard.orders.integration.test.ts:131-232`
**Issue:** Two robustness gaps in the cross-vårdenhet isolation test:

1. The pre-test "stale cleanup" at lines 164-170 deletes only `Order` and `CareUnit`. If a previous interrupted run created `CareUnitMedication` rows for that care unit (none today, but Phase 8/10 features may add seed paths), `careUnit.delete()` will throw on the FK constraint and the entire test bails. Defensively delete `careUnitMedication.deleteMany({ where: { careUnitId: staleCu.id } })` before the careUnit delete.

2. The seeds (lines 172-192) are outside the `try` block at line 194. Same failure mode as WR-04: if `prisma.user.create` succeeds but `prisma.order.create` throws, the `otherUser` and `otherCareUnit` rows are left behind because the `finally` block (line 224) only runs after the try is entered.

**Fix:** Wrap all `prisma.*.create` calls inside the try block, and add `careUnitMedication.deleteMany` to both the pre-test cleanup and the post-test `finally`:
```ts
// pre-test cleanup (line ~169)
if (staleCu) {
  await prisma.order.deleteMany({ where: { careUnitId: staleCu.id } });
  await prisma.careUnitMedication.deleteMany({ where: { careUnitId: staleCu.id } });
  await prisma.careUnit.delete({ where: { id: staleCu.id } });
}
// move all creates inside try { ... }; same deleteMany additions in finally.
```

### WR-06: `listDashboardOrdersForUser` issues count + rows as separate queries inside `Promise.all` — UI may show "totalt N" alongside fewer than N rows on rapid mutation

**File:** `apps/api/src/services/dashboard.service.ts:198-230` (nurse branch) and `244-264` (pharmacist branch)
**Issue:** Each section issues `prisma.order.findMany` and `prisma.order.count` as siblings under `Promise.all`. These two queries run in separate connections / transactions, so a write that lands between them (e.g., another tab submits an order) can produce a payload where `egnaUtkast.count === 6` but `egnaUtkast.rows.length === 5` reflects a snapshot from before the write — or vice versa. The UI's "Egna utkast — totalt 6" label is then off-by-one relative to the rows the user sees underneath. The 30s refetch interval and window-focus refetch (D-148) will repair this on the next tick, so it's a transient cosmetic glitch, not a data integrity bug.

If you want strict consistency, wrap each section's findMany+count pair in `prisma.$transaction([...])` (uses the same read snapshot in Postgres' default `READ COMMITTED` per-statement, but `$transaction` with `isolationLevel: 'RepeatableRead'` would guarantee it). For Phase 9's "polish" scope, an acknowledgment-only comment is probably enough.
**Fix:** Either (a) annotate the trade-off in the comment block above the function and accept the transient inconsistency, or (b) wrap the pair:
```ts
const [egnaUtkastRows, egnaUtkastCount, recentHistoryRows] = await prisma.$transaction([
  prisma.order.findMany({ /* ... */ }),
  prisma.order.count({ /* ... */ }),
  prisma.order.findMany({ /* ... */ }),
]);
```

### WR-07: `useBestallningarBackLink` does not preserve other URL search params on the destination

**File:** `apps/web/src/features/orders/useBestallningarBackLink.ts:86`
**Issue:** The hook returns `to = \`/bestallningar?status=${resolved}\``, which is an absolute path with only the `status` query param. If the user navigates to `/bestallningar?status=skickad&page=2` (Phase 7+ pagination), opens an order via row-click, the row link adds `?from=skickad` — fine, that loses `page=2` on the detail page which is expected. But on back-nav, the back-link returns to `/bestallningar?status=skickad`, dropping `page=2` even though the user had explicitly paged into the list. Same applies to any future deep-link filter on `/bestallningar`. Today there is no `page` param so this is theoretical, but Phase 7's planned pagination will tickle it.

For Phase 9 the right call is probably to **acknowledge** this rather than fix it — preserving arbitrary params requires the rowClick navigation to also stash the full incoming search string (e.g., `?from=skickad&return=<encoded>`), not just `?from=`. Flagging so it's not a surprise when Phase 7 lands.
**Fix:** Add a comment in the hook noting that only `status=` is preserved, and that future per-tab state (page, filters) requires a richer `?return=` param. No code change needed in Phase 9 scope.

## Info

### IN-01: `StatusTab` union + `isValidStatus` predicate are duplicated across `useBestallningarBackLink.ts` and `BestallningarPage.tsx`

**File:** `apps/web/src/features/orders/useBestallningarBackLink.ts:68-74` and `apps/web/src/routes/bestallningar/BestallningarPage.tsx:45-52`
**Issue:** Both files declare:
```ts
type StatusTab = 'utkast' | 'skickad' | 'bekraftad' | 'levererad' | 'alla';
const VALID_STATUSES = [...] as const;
function isValidStatus(s: string): s is StatusTab { ... }
```
The hook's docstring explicitly acknowledges the duplication and motivates it as "smaller surface, no cross-file coupling". Both modules test the same union, so drift would break both. That's a defensible call for now, but the canonical pattern in this repo would be to lift `StatusTab` + `isValidStatus` to `@meditrack/shared` (next to `orderStatusEnum`) so a future tab addition (e.g., `'arkiverad'`) is a one-file edit. Flagging as INFO because the author made a deliberate choice; the duplication is well-commented.
**Fix:** Optionally, when adding a sixth tab, extract to `packages/shared/src/constants/orderStatusTabs.ts`:
```ts
export const ORDER_STATUS_TABS = ['utkast', 'skickad', 'bekraftad', 'levererad', 'alla'] as const;
export type OrderStatusTab = (typeof ORDER_STATUS_TABS)[number];
export function isOrderStatusTab(s: string): s is OrderStatusTab {
  return (ORDER_STATUS_TABS as readonly string[]).includes(s);
}
```

### IN-02: Misleading inline comment in `useSubmitOrder.onError` — comment says "422 validation_failed" but no 422 branch exists

**File:** `apps/web/src/features/orders/useOrderMutations.ts:272-273`
**Issue:** The error handler reads:
```ts
// 422 validation_failed (belt-and-suspenders — the disabled predicate normally catches this).
toast.error('Kunde inte spara — försök igen.');
```
The comment promises a 422 carve-out but the code just falls through to the generic toast for every non-`order_locked` error (including 422, 500, network failures). Either the comment should be removed/clarified, or a 422-specific branch should be added (e.g., to show "Beställningen har inga rader." for the empty-lines validation). As written, the comment suggests intent that the code doesn't realise.
**Fix:**
```ts
onError: (err, vars) => {
  if (err.envelope.error.code === 'order_locked') { /* ... */ return; }
  // All other errors (422 validation_failed, 500, network) — generic toast.
  // The disabled-predicate normally prevents 422 from reaching here.
  toast.error('Kunde inte spara — försök igen.');
},
```

---

_Reviewed: 2026-05-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
