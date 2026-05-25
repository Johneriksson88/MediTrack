---
phase: 09-dashboard-depth-back-nav
reviewed: 2026-05-25T00:00:00Z
depth: standard
files_reviewed: 20
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
  - apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx
  - apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx
  - apps/web/src/routes/dashboard/DashboardLowStockCard.tsx
  - apps/web/src/routes/dashboard/DashboardOrdersCard.tsx
  - apps/web/src/routes/dashboard/DashboardPage.tsx
  - packages/shared/src/contracts/dashboard.ts
findings:
  critical: 0
  warning: 8
  info: 4
  total: 12
status: issues_found
---

# Phase 9: Code Review Report (end-of-phase)

**Reviewed:** 2026-05-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 20
**Status:** issues_found

## Summary

End-of-phase adversarial re-review covering the full Phase 9 scope — the wave 1+2 surface (role-discriminated `GET /api/dashboard/orders`, the `DashboardOrdersCard`, the new `useBestallningarBackLink` hook + `?from=<status>` propagation through 4 navigation sites, and the 5 mutation-side `['dashboard', 'orders']` invalidations) plus the just-merged Plan 09-04 gap-closure (Tailwind sizing amendments on `DashboardPage` + both dashboard cards, two new `data-testid` hooks, and the Test 6 / Test 10 wide-screen sizing invariants).

No correctness-blocking or security defects found. The route is correctly gated by `requireSession` (mirrors the Phase 6 low-stock precedent), the service uses parameterised Prisma queries throughout, and every query is scoped by `careUnitId` to preserve T-09-04 cross-tenant isolation.

Status vs. the prior review:
- **Re-confirmed (still open):** WR-01..WR-07 + IN-01..IN-02 — none were addressed by Plan 09-04. Plan 09-04 was purely cosmetic (className amendments + `data-testid` hooks + invariant tests); it deliberately did not touch any of the code locations the prior warnings pointed at.
- **New findings (Plan 09-04 + DashboardLowStockCard pass):** WR-08 (DashboardLowStockCard empty-state Card lacks the `h-full flex flex-col` stretch that Plan 09-04 added to the data branch, leaving an asymmetric tall-orders-card / centered-empty-low-stock layout still leaking whitespace on wide screens), IN-03 (data-testid hook collision between nurse and pharmacist branches in `DashboardOrdersCard`), IN-04 (Test 6 / Test 10 assertion redundancy — `.toContain('flex')` after `.toContain('flex-col')` adds no information).

Findings are concentrated in five areas:

1. **Wire-contract drift** — `dashboardOrderRow.createdAt` is `z.string()` while the sibling `orderListItem.createdAt` is `z.string().datetime()` (WR-01).
2. **A11y / ARIA semantics** — `<Link role="listitem">` and `<p role="list">` are non-idiomatic (WR-02, WR-03).
3. **Test robustness** — Test 5's seed-outside-try and Test 3's cleanup omissions can leak fixtures on partial failure (WR-04, WR-05).
4. **Service / hook polish** — count-vs-rows race window (WR-06), pagination-unaware back-link (WR-07), Plan 09-04 sizing asymmetry on the empty-low-stock branch (WR-08).
5. **Style / consistency** — duplicate StatusTab union (IN-01), misleading comment in `useSubmitOrder` (IN-02), test-hook name collision (IN-03), redundant Tailwind className assertion (IN-04).

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

**File:** `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx:231-238`
**Issue:** The row markup is `<Link role="listitem" ...>`. React-Router's `<Link>` renders an `<a>`, whose implicit role is `link`. Putting `role="listitem"` on it ARIA-overrides the link role for AT consumers, so screen-reader users lose the "link" announcement and instead hear "list item" (often without an actionable affordance hint). Standard ARIA guidance for navigable lists is to wrap the link inside a real `<li>` (`<li role="listitem"><Link>…</Link></li>`) so both semantics survive. The tests at `DashboardOrdersCard.test.tsx:309-324` lock the wrong behavior in by asserting `role="listitem"` and `getAttribute('href')` on the same element — a fix to the markup must update those assertions too. Plan 09-04 left this finding untouched.
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

**File:** `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx:220-227`
**Issue:** When a section has `rows.length === 0` (e.g., nurse has 1 own draft and 0 recent history rows, so `EmptyState` does NOT trigger but the second section IS empty), the code renders:
```tsx
<p role="list" aria-label={title}>Inga rader.</p>
```
A `<p>` is a phrasing-content element; it cannot legally contain flow-level list semantics, and assigning `role="list"` to it produces a list with zero `listitem` children plus a free-floating text node — invalid per ARIA 1.2 (`list` requires `listitem` children). Screen readers may say "Egna utkast, list, empty" or skip the text entirely depending on engine. The test in `DashboardOrdersCard.test.tsx` only exercises the `rows.length > 0` path for Sections (Tests 1/2 supply ≥1 row in each), so this branch is uncovered.
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
**Issue:** The three `prisma.order.create({...})` calls that allocate `oldestId`, `middleId`, `newestId` happen between lines 286 and 315 — outside the `try` block that starts at line 317. The `finally` block (line 342) only runs if execution enters `try`. If `prisma.order.create` for `oldestId` succeeds but the second `create` for `middleId` throws (DB hiccup, schema drift, connection drop), the `oldestId` order is left in the test DB. The next run of Test 5 then sees four "far-future" orders in `egnaUtkast`, and `top3.map(r => r.id).toEqual([newestId, middleId, oldestId])` fails non-deterministically. The leak compounds over CI runs.
**Fix:** Move the seeds inside the `try` block, collecting IDs as you create:
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
**Issue:** Each section issues `prisma.order.findMany` and `prisma.order.count` as siblings under `Promise.all`. These two queries run in separate connections / transactions, so a write that lands between them (e.g., another tab submits an order) can produce a payload where `egnaUtkast.count === 6` but `egnaUtkast.rows.length === 5` reflects a snapshot from before the write — or vice versa. The UI's "Egna utkast — totalt 6" label is then off-by-one relative to the rows the user sees underneath. The 30 s refetch interval and window-focus refetch (D-148) will repair this on the next tick, so it's a transient cosmetic glitch, not a data integrity bug — but the interviewer will likely ask about it (the §6 "two nurses ordering simultaneously" question).
**Fix:** Either (a) annotate the trade-off in the comment block above the function and accept the transient inconsistency, or (b) wrap each pair in a Prisma interactive transaction with `isolationLevel: 'RepeatableRead'`:
```ts
const [egnaUtkastRows, egnaUtkastCount, recentHistoryRows] = await prisma.$transaction([
  prisma.order.findMany({ /* ... */ }),
  prisma.order.count({ /* ... */ }),
  prisma.order.findMany({ /* ... */ }),
]);
```

### WR-07: `useBestallningarBackLink` does not preserve other URL search params on the destination

**File:** `apps/web/src/features/orders/useBestallningarBackLink.ts:86`
**Issue:** The hook returns `to = \`/bestallningar?status=${resolved}\``, an absolute path with only the `status` query param. `BestallningarPage` (lines 92-96) already takes pains to preserve other params on tab change via `setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set('status', value); return next; })`. The back-link is asymmetric with that policy — it strips every other param. Today there is no `page` param so this is theoretical, but Phase 7's planned pagination will tickle it, and any future deep-link filter (`?q=…&sort=…`) loses on back-nav.

For Phase 9 the right call is probably to **acknowledge** this rather than fix it — preserving arbitrary params requires the rowClick navigation to also stash the full incoming search string (e.g., `?from=skickad&return=<encoded>`), not just `?from=`. Flagging so it's not a surprise when Phase 7 lands.
**Fix:** Add a comment in the hook noting that only `status=` is preserved, and that future per-tab state (page, filters) requires a richer `?return=` param. No code change needed in Phase 9 scope.

### WR-08: `DashboardLowStockCard` empty/loading/error branches were not given the `h-full flex flex-col` stretch — Plan 09-04 closes the wide-screen whitespace ONLY when the low-stock card has data

**File:** `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx:66-117` (loading/error/empty branches) and `DashboardPage.tsx:51`
**Issue:** Plan 09-04 added `items-stretch` to the dashboard grid and `h-full flex flex-col` to the data branch of `DashboardLowStockCard` (line 121) and both data branches of `DashboardOrdersCard` (lines 132, 166). However, the **other three branches** of `DashboardLowStockCard` were left untouched:

- **Loading** (lines 66-76): `<Card className="w-full max-w-2xl">` — no `h-full`.
- **Error** (lines 78-90): `<Card className="w-full max-w-2xl">` — no `h-full`.
- **Empty / celebratory** (lines 97-117): `<div className="flex items-center justify-center flex-1 p-8"><Card className="max-w-md w-full p-8 text-center shadow-sm" role="status">` — the outer wrapper uses `flex-1` (which only stretches in a flex container — the parent is a `grid`, not a `flex`, so `flex-1` is a no-op), and the inner Card has no `h-full`.

The Plan 09-04 PLAN/CONTEXT documents this as "the dominant case: low-stock card has rows" — but the symptom (whitespace below the shorter card on wide screens) reappears whenever **the orders card has data and the low-stock card is empty/loading/error**. For a nurse on a unit with no under-threshold meds and a normal queue, that's the steady state, and the dashboard layout reverts to the pre-fix asymmetry. The Test 10 wide-screen invariant only exercises the data branch (`mockQuery({ data: …, isLoading: false, isError: false })`), so this regression is not test-protected.

For a one-week interview submission, the visible asymmetry on the "no low-stock" steady state (which is exactly the celebratory state nurses spend most time in) is the most-noticed wide-screen polish gap. The matching symmetric empty-branch in `DashboardOrdersCard` (line 269-285) has the same issue but is less likely to be the steady state for pharmacists.
**Fix:** Apply `h-full flex flex-col` to all four card frames in `DashboardLowStockCard`, and rework the empty branch so the centered emerald-tick layout grows with `flex-1` inside the Card:
```tsx
// loading
<Card className="w-full max-w-2xl h-full flex flex-col">
  <CardContent className="p-4 space-y-2 flex-1">
    {/* 3 skeletons */}
  </CardContent>
</Card>

// error
<Card className="w-full max-w-2xl h-full flex flex-col">
  <CardContent className="p-4 flex-1">
    <Alert variant="destructive"> … </Alert>
  </CardContent>
</Card>

// empty — drop the outer wrapper, let the Card own h-full directly
<Card
  className="w-full max-w-2xl h-full flex flex-col items-center justify-center text-center p-8 shadow-sm"
  role="status"
>
  <CheckCircle2 className="h-12 w-12 text-emerald-600 mb-4" aria-hidden="true" />
  <h2 className="text-xl font-semibold mb-2">Alla läkemedel är över tröskel.</h2>
  <p className="text-sm text-muted-foreground">Alla läkemedel i din vårdenhet är över lagertröskeln.</p>
</Card>
```
…and add a Test 7 to `DashboardLowStockCard.test.tsx` mirroring Test 10 in `DashboardOrdersCard.test.tsx` — assert the empty-branch card carries `h-full` (use a new `data-testid="dashboard-low-stock-card-empty"`). Without test coverage on the empty branch, this regression will recur.

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

### IN-03: `data-testid` hook names collide between the nurse and pharmacist branches in `DashboardOrdersCard`

**File:** `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx:133-137` (nurse branch) and `167-171` (pharmacist branch)
**Issue:** Both branches set the same two `data-testid` values:
```tsx
data-testid="dashboard-orders-card-data"
data-testid="dashboard-orders-card-content"
```
Only one branch renders per session (the role discriminator picks exactly one), so `screen.getByTestId(...)` in Test 10 still resolves uniquely at runtime — but the testid is a contract identifier, and reusing the same string across two non-equivalent code paths is a code smell that bites later. Concretely:

1. A future change that conditionally renders both branches (e.g., admin sees both subviews) would silently break Test 10 with a `Found multiple elements` error rather than a meaningful test failure.
2. Visual-regression tooling (Playwright, Percy) keyed on `data-testid` cannot tell apart the two layouts.
3. The doc comment at lines 67-73 explicitly justifies this with "same values across nurse and pharmacist/admin branches because only one branch renders per session", which is true today but couples two unrelated code paths to an invariant that has nothing to do with them.

Use branch-specific suffixes (`-nurse` / `-pharmacist`) and update Test 10's `it.each` to look up the right testid per role.
**Fix:**
```tsx
// nurse branch
data-testid="dashboard-orders-card-data-nurse"
data-testid="dashboard-orders-card-content-nurse"
// pharmacist branch
data-testid="dashboard-orders-card-data-pharmacist"
data-testid="dashboard-orders-card-content-pharmacist"
```
…and in Test 10:
```ts
const testidSuffix = _label === 'nurse' ? 'nurse' : 'pharmacist';
const card = screen.getByTestId(`dashboard-orders-card-data-${testidSuffix}`);
```

### IN-04: Test 6 / Test 10 redundant Tailwind className assertions — `.toContain('flex')` is implied by `.toContain('flex-col')`

**File:** `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx:237-239` and `DashboardOrdersCard.test.tsx:423-425`
**Issue:** Both invariant tests assert:
```ts
expect(cardClassName).toContain('h-full');
expect(cardClassName).toContain('flex');
expect(cardClassName).toContain('flex-col');
```
The middle assertion (`.toContain('flex')`) is a substring match, so it passes if either the bare `flex` utility OR the `flex-col` utility (which has `flex-` as its prefix) is present. Even if a refactor dropped the bare `flex` utility but kept `flex-col`, the middle assertion would still pass — `.toContain('flex')` matches `flex-col` as a substring. The assertion is non-discriminating; it gives a false sense of coverage.

If the intent is "the Card declares display:flex via the `flex` utility", use a word-boundary or split-and-include check:
```ts
const classes = cardClassName.split(/\s+/);
expect(classes).toContain('h-full');
expect(classes).toContain('flex');     // strict — matches the bare utility, not flex-col
expect(classes).toContain('flex-col');
```
This is INFO-level because Plan 09-04 always ships `flex` and `flex-col` together by convention, so the test is correctly catching the intended invariant in practice — but a future refactor that swaps `flex flex-col` for `grid grid-cols-1` (also a valid stretch container) would pass the middle assertion silently.
**Fix:** Use `.split(/\s+/)` + `toContain` instead of substring matching for individual utility classes, in both `DashboardLowStockCard.test.tsx` Test 6 and `DashboardOrdersCard.test.tsx` Test 10.

---

_Reviewed: 2026-05-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
