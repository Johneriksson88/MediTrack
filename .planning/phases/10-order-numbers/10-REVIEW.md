---
phase: 10-order-numbers
status: advisory
findings_total: 15
findings_high: 5
findings_medium: 7
findings_low: 3
generated: 2026-05-25
---

# Phase 10 Code Review

Advisory output — does not block phase completion. Findings are ranked
most-severe first. Dispositions: TBD / fix-here / deferred / accepted.

## HIGH

### CR-01 — Migration locks Order under production traffic
**File:** `apps/api/prisma/migrations/20260525000000_0013_order_numbers/migration.sql:113`

`ALTER COLUMN … SET NOT NULL` runs without `ACCESS EXCLUSIVE LOCK` on
`"Order"` — production `prisma migrate deploy` does NOT block writes,
so a concurrent INSERT between Step 3 backfill and Step 5 `SET NOT NULL`
lands a row with NULL counter columns and fails the migration.

**Failure scenario:** Production deploys `prisma migrate deploy` while
the API serves traffic (zero-downtime convention). A nurse creates a
draft in the millisecond between Step 3 (backfill UPDATE on existing
rows) and Step 5 (SET NOT NULL). The new row has NULL counter/year.
Step 5 errors `column "orderNumberCounter" contains null values`, the
entire migration rolls back, deploy fails.

**Mitigation:** `LOCK TABLE "Order" IN ACCESS EXCLUSIVE MODE` at the
top of the migration, or document a maintenance-window requirement in
README.

### CR-02 — Timezone year drift between migrate and runtime
**File:** `apps/api/src/services/order.service.ts:1070`

`mintOrderNumber` derives year from `EXTRACT(YEAR FROM NOW())::int`
with no `AT TIME ZONE` pin — DB session timezone silently drives the
year segment. The migration backfill uses the same idiom on a
`timestamp(3)` (no TZ) `createdAt` column. The two can disagree at
year boundaries.

**Failure scenario:** Prod Postgres session.timezone='UTC'. A nurse
creates a draft at 2026-01-01 00:30 Europe/Stockholm
(= 2025-12-31 23:30 UTC). `EXTRACT(YEAR FROM NOW())` returns 2025
→ mints `ORD-2025-####` for what the calendar calls a 2026 order.
Worse, if migration ran under a different session TZ than runtime,
backfilled `orderNumberYear` disagrees with what a fresh mint would
produce, breaking the per-(careUnit, year) UNIQUE invariant under
year-boundary writes.

**Mitigation:** pin `AT TIME ZONE 'Europe/Stockholm'` (or commit
explicitly to UTC) in both the migration and the runtime mint.

### CR-03 — Seed mint runs outside its transaction (utkast/skickad/bekraftad branches)
**File:** `apps/api/prisma/seed.ts:430`

Seed advances `OrderNumberCounter.nextValue` via `$queryRaw` OUTSIDE
the `prisma.order.create` for utkast/skickad/bekraftad branches (only
the levererad branch is wrapped). The JSDoc claims it 'mirrors the
runtime mintOrderNumber' but lacks the surrounding `$transaction` —
partial failure leaves a permanent counter gap and diverges from
runtime semantics.

**Failure scenario:** If `prisma.order.create` rejects (constraint,
FK race during reseed, audit allowlist mismatch), the counter row's
`nextValue` has already been incremented. Next seed run consumes a
fresh counter, leaving a gap. The D-160 same-tx serialization
guarantee — the whole point — is not actually mirrored.

**Mitigation:** wrap mint + create in a single `prisma.$transaction`
for all four status branches.

### CR-04 — mintOrderNumber duplicated in seed.ts
**File:** `apps/api/src/services/order.service.ts:1062`

The two-step UPDATE/INSERT-ON-CONFLICT mint logic is copy-pasted
verbatim into `apps/api/prisma/seed.ts` (lines ~430–455). Any future
fix (TZ pin per CR-02, replacing xmax trick, sequence migration)
must be applied in TWO places or seed drifts from runtime silently.

**Failure scenario:** A future fix lands in order.service.ts. The
seed.ts copy keeps the old logic and emits orders with semantically-
wrong counters that downstream tests load and treat as canonical.
The §6 concurrency demo silently demonstrates inconsistent behavior.

**Mitigation:** extract `mintOrderNumber` to an exported helper that
both `seed.ts` and `order.service.ts` import.

### CR-05 — Test fixture mintTestOrderNumber + create not transactional
**File:** `apps/api/test/helpers/buildTestApp.ts:322`

`mintTestOrderNumber` runs its `$queryRaw` outside any transaction;
callers issue a separate `prisma.order.create` afterwards. Under
vitest's default file-parallel pool, two test files minting for the
same `careUnitId` can produce out-of-order counter consumption and
break the monotonicity assertion in `orders.orderNumber.integration`
Test 5.

**Failure scenario:** `dashboard.orders.integration.test.ts` and
`orders.list.integration.test.ts` both call
`mintTestOrderNumber(TEST_SJUKSKOTERSKA.careUnitId)`. File A mints
counter=N at t=0; File B mints N+1 at t=1; File B inserts its Order
at t=2 (counter=N+1); File A's create at t=3 (counter=N). Composite
UNIQUE accepts both, but `older createdAt → smaller counter`
invariant is violated.

**Mitigation:** wrap mint+create in a `$transaction` in the helper,
mirroring `createDraftOrder`.

## MEDIUM

### CR-06 — DashboardLowStockCard max-h over-reserves at md+ breakpoint
**File:** `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx:148`

`max-h-[calc(100vh-12rem)]` applies at every breakpoint, but
BottomTabBar is `md:hidden` and main padding resets to `md:pb-6`.
The 12rem reserve over-counts by ~96px on desktop. The DashboardPage
grid uses `items-stretch`, so the sibling DashboardOrdersCard
inherits the artificially short height.

**Mitigation:** scope to mobile only:
`max-md:max-h-[calc(100vh-12rem)]` or drop the cap at md+ entirely.

### CR-07 — SubmitConfirmationBanner lost "till apotekare" routing copy
**File:** `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx:62`

Locked-vocabulary banner copy `Beställningen är skickad till apotekare.`
was replaced by `Beställning ${orderNumber} är skickad.` — the
`till apotekare` (routing-destination) clause was dropped. Phase 3
D-70 explicitly locked this copy.

**Impact:** A sjuksköterska submitting a draft no longer learns *who*
will act on it next. Phase 4's anticipated 'parallel banners for
bekraftad/levererad' has no precedent for routing-destination copy
anymore.

### CR-08 — ComposeOrderPage document title lost lifecycle status
**File:** `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx:94`

Document title collapses from status-aware
(`Nytt utkast — MediTrack` / `Beställning · Skickad — MediTrack` /
Bekräftad / Levererad) to a single
`Beställning ORD-YYYY-#### — MediTrack` across every lifecycle stage.

**Impact:** User with three `/bestallningar/:id` tabs open (utkast,
skickad, levererad) can no longer distinguish them by tab title —
all read identically except for the counter suffix.

### CR-09 — OrdersCardList + DraftCard aria-label dropped temporal cue
**Files:** `apps/web/src/routes/bestallningar/OrdersCardList.tsx:89`,
`apps/web/src/routes/bestallningar/DraftCard.tsx:62`

Row aria-label changed from
`Öppna beställning från ${formatRelative(relevantAt)}` to
`Öppna beställning ${row.orderNumber}` — screen-reader users no
longer hear *when* the order was placed/transitioned in the
accessible name.

**Impact:** A VoiceOver user scanning Skickade orders to find 'the
one I sent before lunch' previously heard relative submission time;
now hears identical-looking identifiers. WCAG-friendly
identification regressed.

### CR-10 — Audit allowlist includes immutable post-create columns
**File:** `apps/api/src/db/auditAllowlist.ts:102`

`orderNumberCounter` / `orderNumberYear` added to Order audit
allowlist but they are immutable post-create per D-162 — every
submit/confirm/deliver writes an audit row with identical before/after
copies of these fields.

**Impact:** Every Order.update (4 lifecycle transitions × N orders)
writes redundant before/after pairs. Storage grows for no forensic
value; audit consumers must filter the no-op diff manually.

**Mitigation:** remove from the allowlist (the create event already
captures the mint via create.after snapshot) or gate them to
create-time only via an allowlist API widening.

### CR-11 — Dashboard count/rows skew without isolationLevel (pre-existing)
**File:** `apps/api/src/services/dashboard.service.ts:144`

`listDashboardOrdersForUser` fires findMany + count under `Promise.all`
with no transaction / isolationLevel. Phase 10's new draft-create path
widens the skew window. Pre-existing structural issue; flagged because
the §6 'two nurses simultaneously' narrative is exactly the concern
Phase 10 was meant to harden.

**Impact:** A concurrent nurse creating a draft mid-load produces
`egnaUtkast.count=N` but `egnaUtkast.rows.length=N-1` — the card
renders 'totalt N' with N-1 rows visible. Cosmetic skew.

### CR-12 — Wire schema has no upper bound on counter
**File:** `packages/shared/src/contracts/order.ts:76`

`orderNumberCounter` / `orderNumberYear` are `z.number().int().positive()`
with no upper bound. D-159 promises 'graceful degradation past 9999'
but a corrupted BE could emit `Number.MAX_SAFE_INTEGER` and the wire
schema would accept it.

**Mitigation:** Cap with `.max(99_999)` (5-digit budget per D-159).

## LOW

### CR-13 — OrdersTable Best.nr column + DraftCard top row may overflow at 5+ digit counter
**Files:** `apps/web/src/routes/bestallningar/OrdersTable.tsx:104`,
`apps/web/src/routes/bestallningar/DraftCard.tsx:78`

Best.nr column hard-coded `w-[120px]` in font-mono with no truncate.
DraftCard top row is `flex items-center justify-between gap-2` with no
`min-w-0` / `truncate` on the orderNumber span.

**Impact:** Counter=10000 → `ORD-YYYY-10000` (13 chars in mono ≈ 117px
text + 32px padding ≈ 149px) overflows a 120px cell. On 360px
DraftCard, the overflow pushes the chevron off-screen and triggers
horizontal page scroll. The D-159 'no format breakage' promise breaks
once the year passes its 9999th order.

### CR-14 — Brittle Test 3 magic number + leaky Test 1
**File:** `apps/api/test/orders.orderNumber.integration.test.ts:230`

`expect(a1.orderNumberCounter).toBeGreaterThanOrEqual(5)` hard-codes
knowledge of demo seed (4 orders → nextValue starts at 5). Test 1 has
no try/finally — its two leaked utkast orders persist across the
suite. The assertion is satisfied by leakage, not by what it claims
to test.

### CR-15 — captureSc04Screenshots silent-404 fallback
**File:** `apps/web/scripts/captureSc04Screenshots.ts:119`

When `GET /api/orders?status=utkast` returns no draft, the harness
logs a warning and silently falls back to `/bestallningar/ny` (which
the router renders as `:id='ny'` → 404 placeholder).
`composePathResolved=true` is set unconditionally; no retry on
subsequent viewports. The 24-cell SC#4 check still PASSES.

**Mitigation:** push a failure to the `failures` array when no draft
id is resolved.

## Disposition

All 15 findings are **deferred** to the post-phase backlog or a
follow-up phase. Phase 10 ships its core goal (ORD-#### identity
promotion BE+FE) intact; these findings are interview-prep hardening,
defense-in-depth, and accessibility-regression awareness.

Recommended order for follow-up if time permits:
1. **CR-02** (TZ pin) — single most concrete reviewer probe
2. **CR-04** (extract mintOrderNumber helper) — eliminates CR-03 and CR-05 in one shot
3. **CR-09** (aria-label temporal cue) — accessibility commitment
4. **CR-07** (banner copy "till apotekare") — locked-vocab compliance
5. Remaining HIGH/MED at reviewer's discretion
