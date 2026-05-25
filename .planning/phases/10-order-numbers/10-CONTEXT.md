# Phase 10: Order Numbers - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Every Order gets a generated, human-readable `orderNumber` persisted in the database — replacing the bare cuid as the user-facing reference. Order numbers are unique per vårdenhet, stable across the full `Utkast → Skickad → Bekräftad → Levererad` lifecycle, and visible on every surface that renders an order today. Existing orders are backfilled by the migration so no row is left without a number.

**In scope (Phase 10 only — REQ-ID ORD-11):**

- **Schema migration.** New `Order.orderNumber` column (NOT NULL after backfill) + new `OrderNumberCounter(careUnitId, year, nextValue)` table that owns the monotonic-per-(careUnit, year) counter state. New unique constraint `@@unique([careUnitId, year, orderNumberCounter])` on Order — or equivalent over the formatted column (decision below favors the structured columns + a generated/derived `orderNumber` for display; see D-160).
- **Generator service.** `apps/api/src/services/order.service.ts:createDraftOrder` (and every test-fixture path that inserts Orders directly via Prisma) gets a `mintOrderNumber(careUnitId, now)` step inside the existing `$transaction`. The mint uses `UPDATE "OrderNumberCounter" SET "nextValue" = "nextValue" + 1 WHERE careUnitId = $1 AND year = $2 RETURNING "nextValue"` — same row-level write-lock primitive Phase 4 uses on `Medication` for stock (STK-02). Two concurrent inserts on the same (vårdenhet, year) serialize cleanly; neither sees the other's number.
- **Backfill.** Migration runs a single-pass CTE `WITH numbered AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY "careUnitId", EXTRACT(YEAR FROM "createdAt") ORDER BY "createdAt" ASC) AS rn, EXTRACT(YEAR FROM "createdAt")::int AS year FROM "Order") UPDATE "Order" o SET "orderNumberCounter" = n.rn, "orderNumberYear" = n.year FROM numbered n WHERE o.id = n.id`, then seeds the counter table via `INSERT INTO "OrderNumberCounter" (careUnitId, year, nextValue) SELECT careUnitId, year, MAX("orderNumberCounter") + 1 FROM "Order" GROUP BY careUnitId, year`. Deterministic across `docker compose up` re-runs — same input data produces same numbers.
- **Format & rendering.** Display format `ORD-YYYY-####` derived in shared code (single source of truth in `packages/shared/src/utils/orderNumber.ts:formatOrderNumber({year, counter}): string`). 4-digit zero-padded counter. Domain prefix `ORD-` (English code identifier, matches roadmap example verbatim).
- **API contract extension.** Every order envelope (`orderResponse`, `orderListItem`, dashboard `dashboardOrderRow`) gains `orderNumber: string` (the rendered string, not the raw counter — FE never has to know about counter/year split). Required in Zod (not optional) — the column is NOT NULL post-backfill, and existing tests get fixture updates in lockstep. Audit `after` JSON gains the new fields automatically via the Phase 5 `$extends` middleware (one AUDIT_ALLOWLIST.Order extension to include `orderNumber` + the counter/year columns).
- **FE display surfaces.**
  - **`OrdersTable.tsx` + `DraftsTable.tsx`** — new leftmost column `Best.nr` with `font-mono text-sm` rendering `ORD-2026-0042`. Pushes existing columns right. Card-list variants (`OrdersCardList.tsx`, `DraftsCardList.tsx`) surface the number as the card's heading text where today they show `formatRelative(timestamp)`.
  - **`ComposeOrderPage.tsx`** — new `<h1>Beställning ORD-2026-0042</h1>` page heading (today there is no explicit order-identifier heading — the OrderStatusPill + OrderActorTrail are the identity affordance). The H1 lives above the status pill.
  - **`DashboardOrdersCard.tsx`** — row primary text changes from "Beställning från {createdBy.name}" to `ORD-2026-0042`; `createdBy.name` demotes to the secondary line alongside the timestamp.
  - **`SubmitConfirmationBanner.tsx`** — copy gains the number ("Beställning ORD-2026-0042 är skickad.").
  - **`aria-label` updates** at every row site to reference `orderNumber` instead of `formatRelative(timestamp)`.
- **Test surface (per the Phase 4+5+6 pattern of integration + component tests in lockstep):**
  - `apps/api/test/orders.orderNumber.integration.test.ts` (new): concurrent-insert race test — two simultaneous `POST /api/orders` against the same vårdenhet must produce distinct sequential numbers (`pg_locks` assertion mirroring Phase 4's STK-02 concurrency test); year-boundary test — insert across a synthetic year boundary, counter resets to 0001 in the new year; cross-vårdenhet isolation — two vårdenheter both start at 0001 independently; stability across lifecycle — orderNumber unchanged after submit/confirm/deliver; backfill SQL test — seed N orders, run migration, assert numbering matches createdAt ASC.
  - `packages/shared/src/utils/__tests__/orderNumber.test.ts` (new): `formatOrderNumber({year: 2026, counter: 42}) === 'ORD-2026-0042'`; padding edge cases (1 → '0001', 9999 → '9999').
  - Extend existing component tests for `OrdersTable.test.tsx`, `DraftsTable.test.tsx`, `BestallningarPage.test.tsx`, `ComposeOrderPage.test.tsx`, `DashboardOrdersCard.test.tsx` — each asserts `ORD-2026-…` appears in the rendered surface and the row aria-label.

**Out of scope (other phases / v2 / dropped):**

- **Search by order number** — `GET /api/orders?orderNumber=ORD-2026-0042` lookup. ROADMAP scopes Phase 10 as display-only. Lookups by URL stay cuid-based (`/bestallningar/:id` keeps :id as cuid — the stable DB key). v2.
- **Renaming `entityId` on audit events to `orderNumber`** — entityId is the stable DB identifier; orderNumber is the display label. Audit `after` JSON captures orderNumber automatically via `$extends`; the entityId column stays cuid. No churn to AuditDiffPanel needed beyond what the middleware already does.
- **Year-rollover counter migration logic** — the lazy `UPDATE...RETURNING` on (careUnitId, year) implicitly creates a counter row on first use of any new year via the seed-on-backfill pattern. The runtime mint path UPSERTs (`INSERT ... ON CONFLICT (careUnitId, year) DO UPDATE SET nextValue = nextValue + 1 RETURNING nextValue`) so the first order of a new year creates its counter row in the same statement that mints number 0001. No cron, no scheduled task.
- **Overflow handling at 9999/year** — well beyond demo volume (would require ~27 orders/day every day for a year); zero-padded display still works at 5 digits (`ORD-2026-10000`) so the format degrades gracefully without a migration. v2 problem.
- **Custom-formatted numbers per vårdenhet** — every unit uses the same `ORD-YYYY-####` format. No per-tenant overrides.
- **Order numbers in picker rows / suggestion blocks** (Phase 8 carryover deferred idea). Visual surface added in Phase 10 covers the rendering tables, detail header, dashboard rows, and submit banner — picker is an internal compose-time tool, not an order-rendering surface.
- **Renaming the URL slug to use order numbers (`/bestallningar/ORD-2026-0042`)** — keep cuid as the URL :id for the same stable-key reason. v2.
- **Promoting orderNumber to be the audit-event entity-id key** — audit identifies entities by DB id (cuid); orderNumber is decorative. Keeping these separate preserves the Phase 5 invariants (stable entityId, before/after as JSON).

</domain>

<decisions>
## Implementation Decisions

### Format & scope

- **D-157:** **Format `ORD-YYYY-####`.** English `ORD` domain prefix, 4-digit year segment, 4-digit zero-padded counter, single hyphen separators. Matches the ROADMAP §"Phase 10" SC#1 example verbatim. Rejected: `BST-YYYY-####` (Swedish prefix would diverge from the project's English-code-identifier rule per PROJECT.md Key Decisions; UI labels are Swedish but code-facing identifiers are English); `ORD-####` no-year (loses temporal grounding — a user can't read the number alone and know "this is a 2026 order"); `YYYY-####` no-prefix (typographically clean but mildly ambiguous in logs / screenshots — confusable with a date stamp).

- **D-158:** **Per-vårdenhet, year-resetting counter.** Each (careUnitId, year) pair has its own counter that restarts at 0001 on Jan 1. Avdelning 4 Karolinska's 2026 stream ends at e.g. `ORD-2026-0042`; Avdelning 5 Köping ends at e.g. `ORD-2026-0013`; both restart at `ORD-2027-0001` in 2027. Reads naturally for local users ("we placed 42 orders this year at our unit"). Matches the ROADMAP §"Phase 10" SC#1 literal example "per-vårdenhet sequence". Rejected: per-vårdenhet monotonic forever (year segment becomes decorative; user can't infer "orders this year" from the counter alone); global year-scoped (orders interleave across units — the gap between ORD-2026-0042 and ORD-2026-0043 at one unit means "another unit placed an order" — weakens the "your unit's history" affordance); global monotonic (worst of both — no year cue, no per-unit cue).

- **D-159:** **4-digit zero-padded counter.** Roadmap example uses 4 digits. Demo volume sits at 10s per (vårdenhet, year). Overflow at 9999 degrades gracefully to 5+ digits without format breakage — `ORD-2026-10000` reads sensibly. Width is enforced in `formatOrderNumber` (`.padStart(4, '0')`); rendering never displays the raw integer. Rejected: 3 digits (overflow at 999 would happen within real-use timescales), 6 digits (visually heavy, optimizes for a scale this MVP won't see).

### Generation strategy (§6 concurrency)

- **D-160:** **Counter table + UPDATE...RETURNING in the same tx as the Order insert.** New `OrderNumberCounter(careUnitId, year, nextValue)` keyed table. The `createDraftOrder` service does `UPSERT` on (careUnitId, year) via `INSERT INTO "OrderNumberCounter" (careUnitId, year, nextValue) VALUES ($1, $2, 2) ON CONFLICT (careUnitId, year) DO UPDATE SET nextValue = "OrderNumberCounter".nextValue + 1 RETURNING (CASE WHEN xmax = 0 THEN 1 ELSE "OrderNumberCounter".nextValue END)` — wait, the simpler pattern: do a normal `UPDATE ... SET nextValue = nextValue + 1 RETURNING nextValue - 1 AS issued`, and if zero rows affected, fall through to `INSERT ... VALUES (..., 2) RETURNING 1 AS issued`. The migration seeds the counter row for every (careUnitId, year) pair that has existing orders, so the UPDATE-then-INSERT-fallback only fires the first time a brand-new (careUnitId, year) pair is touched (e.g. first order of a new year). Inside the same `$transaction` as the Order insert: Postgres takes a row-level write lock on the counter row for the duration of the tx. Two concurrent inserts on the same (vårdenhet, year) serialize — same primitive Phase 4 uses for stock (STK-02). This is the §6 "two nurses ordering simultaneously" answer used twice. Rejected:
  - **Postgres SEQUENCE per (careUnitId, year)** — proliferation (N units × N years = unbounded sequences); sequences don't transactionally roll back (values are consumed even if the order insert fails → reviewer-questionable gaps); needs lazy `CREATE SEQUENCE` on first use, which is awkward.
  - **`SELECT MAX(orderNumberCounter)+1 FROM "Order" WHERE careUnitId=$1 AND year=$2 FOR UPDATE`** — `FOR UPDATE` on a SELECT that matches no rows (first-ever order in a (careUnit, year) pair) doesn't lock anything Postgres can serialize against. Needs an extra advisory lock to be safe — same outcome as D-160 but more surface.
  - **DB BEFORE INSERT trigger fills orderNumber** — splits generation logic between SQL trigger and TS service that reads it back. Phase 5's BEFORE-trigger pattern was for invariants ('reject empty entity'), not for data generation. Avoid split-brain.

- **D-161:** **Year derived server-side at insert time from `now()` in Postgres (DB clock, not app clock).** The mint path computes `EXTRACT(YEAR FROM NOW())::int` inside the same statement that UPDATEs the counter. This guarantees no app-vs-DB clock skew at the year boundary — even if the API server and Postgres drift, the year stamped into the counter row matches the year used in `(careUnitId, year)` lookup. Single source of truth. Timezone: Postgres server is `Europe/Stockholm` per docker-compose; year boundary is the local midnight that nurses experience. Rejected: app-layer `new Date().getFullYear()` (introduces clock skew + timezone disagreement risk), passing year as a request parameter (race-prone, defeats the point of server-authoritative numbering).

- **D-162:** **Generation happens once, on `createDraftOrder` (Utkast creation), and is immutable thereafter.** The orderNumber is stamped when the row is first inserted at status `utkast`. Submit / confirm / deliver transitions never touch orderNumber. Stable identity across the full `Utkast → Skickad → Bekräftad → Levererad` lifecycle (ROADMAP §"Phase 10" SC#5). Rejected: stamping on submit (a number that "appears" mid-flow is confusing — users see a number in the table column before submit, even on drafts); regenerating on resubmit/restoration paths (no such paths exist in v1 — discard is hard-delete-soft via deletedAt, no order ever returns from deleted state).

### Backfill

- **D-163:** **`createdAt ASC` ordering per (careUnitId, year), seeded counter table.** Single-pass migration SQL: `WITH numbered AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY "careUnitId", EXTRACT(YEAR FROM "createdAt")) AS rn, EXTRACT(YEAR FROM "createdAt")::int AS year FROM "Order") UPDATE "Order" SET "orderNumberCounter" = numbered.rn, "orderNumberYear" = numbered.year FROM numbered WHERE "Order".id = numbered.id`, then `INSERT INTO "OrderNumberCounter" (careUnitId, year, nextValue) SELECT "careUnitId", "orderNumberYear", MAX("orderNumberCounter") + 1 FROM "Order" GROUP BY "careUnitId", "orderNumberYear"`. Natural narrative — first order ever placed at a unit in a given year gets 0001. Deterministic — same input data produces same numbers across `docker compose up` re-runs. Rejected: `id ASC` (cuid is roughly time-ordered but opaque to a reviewer reading the migration SQL); lazy counter (skips the pre-seed and forces an UPSERT branch at runtime — see D-164, the runtime UPSERT branch is still kept for new (careUnit, year) pairs that arise post-migration, but the seed makes the common path a pure UPDATE).

- **D-164:** **Runtime path uses UPSERT for the first-ever order of a (careUnit, year) pair.** After backfill, the common case (any vårdenhet that has previously placed an order this year) is a pure `UPDATE ... RETURNING`. The edge case — first order of a brand-new year, or first order at a freshly-created vårdenhet — triggers an `INSERT ... ON CONFLICT (careUnitId, year) DO UPDATE SET nextValue = "OrderNumberCounter".nextValue + 1 RETURNING ...` fallback so the counter row is materialized in the same statement. Implementation: try UPDATE; if `rowCount === 0`, run INSERT with `VALUES (careUnitId, year, 2) ON CONFLICT (careUnitId, year) DO UPDATE SET nextValue = "OrderNumberCounter".nextValue + 1 RETURNING nextValue - 1 AS issued`. Two-statement path is fine because both run inside the same Order-insert `$transaction` and the second one's `ON CONFLICT` makes it idempotent against a concurrent INSERT racing for the same new pair. Rejected: single-statement UPSERT for ALL cases (works but the `RETURNING (CASE WHEN xmax = 0 ...)` discriminator is harder to reason about and easier to mis-test than the two-step UPDATE-then-INSERT-fallback pattern).

- **D-165:** **Storage shape: separate `orderNumberCounter: Int` + `orderNumberYear: Int` columns; `orderNumber: String` is a derived display value computed in shared code, not stored.** Avoids stale-string drift if format ever changes (e.g. width bump from 4 to 5 digits). Unique constraint enforced over `@@unique([careUnitId, orderNumberYear, orderNumberCounter])` on the structured columns. `formatOrderNumber({year, counter}): string` in `packages/shared/src/utils/orderNumber.ts` is the single source of truth for the rendered shape; API responses serialize the formatted string into `orderNumber` so FE never has to know about the split. Rejected:
  - **Single stored `orderNumber: String` column with format embedded** — drift risk; reformatting requires a migration; harder to query "all orders for 2026".
  - **Postgres `GENERATED ALWAYS AS` computed column** — Postgres `generated` columns can't reference functions like `LPAD` portably (depending on Postgres version + Prisma support); adds DDL complexity for marginal benefit; computing in TS keeps the format human-readable in one file.

### Display placement

- **D-166:** **New leftmost column `Best.nr` in `OrdersTable` + `DraftsTable`.** Mono-font (`font-mono text-sm`), 4–5ch wide. Pushes existing columns right. The eye lands on the identifier first — best for scannability when reviewing a list of orders. Card-list variants (`OrdersCardList`, `DraftsCardList`) surface the number as the card's heading text, replacing today's `formatRelative(timestamp)` heading. Rejected: chip on existing cell (less scannable — orderNumber buried inline with timestamp); aria-label-only replacement (improves a11y but doesn't surface the number visually, which the user explicitly asked for).

- **D-167:** **`<h1>Beställning ORD-YYYY-####</h1>` on `ComposeOrderPage`.** Today there is no explicit order-identifier heading on the detail page — the `OrderStatusPill` + `OrderActorTrail` carry identity implicitly. Phase 10 promotes the order number to a first-class `<h1>` heading above the status pill. Improves screen-reader landmark structure (the page heading IS the order's name). Rejected: subtitle under the status pill (relegates the number to a reference detail instead of identity); chip beside the status pill (a chip implies decoration; this IS the order's name).

- **D-168:** **`DashboardOrdersCard` row primary text becomes `ORD-YYYY-####`; `createdBy.name` demotes to secondary line.** Today's row layout (Phase 9 D-144) surfaces `formatRelative(createdAt)` + line count + total quantity + "från {createdBy.name}" as composite text. Phase 10 promotes orderNumber to the row's heading slot; `createdBy.name` joins `createdAt` on the secondary line. Mirrors the column-shift in the lists (D-166). Rejected: append `· ORD-2026-0042` to existing layout (decoration framing again); chip prepend (mixes affordances on the row).

- **D-169:** **`SubmitConfirmationBanner` copy gains the number.** Today's copy reads "Beställning skickad." (per Phase 3 D-73). Phase 10 updates to "Beställning ORD-YYYY-#### är skickad." — same tone, identity-anchored. Rejected: keeping copy unchanged (user just gained a useful identifier; not surfacing it in the success banner is a missed affordance).

### Claude's Discretion

- **Exact column header text** in `OrdersTable.tsx` and `DraftsTable.tsx`. Recommended: `Best.nr` (short, fits 4-5ch column, Swedish-domain). Alternatives: `Beställningsnr.` (full Swedish), `ORD` (cryptic). Locked verbatim in the plan if user objects.
- **Exact H1 copy on ComposeOrderPage.** Recommended: `Beställning ORD-2026-0042`. Alternatives: `Beställning #ORD-2026-0042` (hash prefix is redundant given ORD- already disambiguates), `ORD-2026-0042` (number-only — weakens the "this is an order" framing).
- **Audit allowlist additions.** `AUDIT_ALLOWLIST.Order` gains `orderNumber`, `orderNumberCounter`, `orderNumberYear` as `after`-JSON-included fields. `before` is null on create; `after` shows the three new fields on every `order.create` event automatically. No new audit action key needed.
- **Optional vs required in Zod.** orderNumber is REQUIRED in all order envelopes (not optional) after Phase 10 lands — the column is NOT NULL post-migration, and every order row has one. This forces test-fixture updates in lockstep, which is fine (caught at typecheck time).
- **OrderActorTrail interaction.** No change — OrderActorTrail surfaces who/when, not what. The H1 carries the "what".
- **Audit diff panel.** Reads sensibly without UI changes — the create event's `after.orderNumber` displays as a normal field. Optionally surface it as a small heading on the diff card if it reads awkwardly in practice; defer that decision to plan-execute time.
- **Plan-slice ordering for Phase 10.** Recommended:
  1. **Slice 1 (BE foundation).** Migration (Order columns + OrderNumberCounter + UNIQUE constraint + backfill SQL) + Prisma schema update + `formatOrderNumber` shared utility + service-layer mintOrderNumber + `createDraftOrder` integration + shared contract additions (`orderResponse`/`orderListItem`/`dashboardOrderRow` get `orderNumber: string`) + concurrency integration test + backfill SQL test. Lands BE end-to-end; FE still shows id-substring.
  2. **Slice 2 (FE rendering surfaces).** OrdersTable + DraftsTable column + Card variants + ComposeOrderPage H1 + DashboardOrdersCard row layout + SubmitConfirmationBanner copy + aria-label updates + extended component tests.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 10 framing & scope

- `.planning/ROADMAP.md` §"Phase 10: Order Numbers" — Goal + 5 Success Criteria + Requirements (ORD-11). SC#1 dictates `ORD-2026-0001` format + UNIQUE per vårdenhet + NOT NULL after backfill; SC#2 dictates payload extension; SC#3 dictates backfill completeness; SC#4 dictates display surfaces (BestallningarPage tabs, order detail header, dashboard "Beställningar" card); SC#5 dictates stability across lifecycle transitions.
- `.planning/REQUIREMENTS.md` §"Order Flow" ORD-11 — single source of truth for the requirement text: "Every order has a generated, human-readable order number persisted in the database and displayed in every table that lists orders."
- `.planning/PROJECT.md` — Core Value loop, lightweight bias, mobile-first, Swedish UI labels verbatim + English code identifiers (drives D-157's `ORD-` prefix choice).
- `.planning/STATE.md` — current phase progress (Phase 9 complete, ready_to_plan for Phase 10).

### Phase 1–9 decisions inherited (carry forward, do NOT re-decide)

- `.planning/phases/01-foundation-auth/01-CONTEXT.md` — RBAC primitives (any order:* permission key reuse; no new permission needed for read of the new field).
- `.planning/phases/02-medication-catalog/02-CONTEXT.md` D-44 — URL-as-state convention (no impact here, but inherits the broader project pattern).
- `.planning/phases/03-draft-orders/03-CONTEXT.md` — D-46 (OrderStatus enum), D-48 (single Order table + status column), D-49 (`submittedAt` / `submittedBy` stamped atomically by submit transition), D-57 (every line-op endpoint returns full OrderResponse — Phase 10 widens that response to include orderNumber), D-73 (SubmitConfirmationBanner copy — Phase 10 D-169 updates), D-58/D-70 (picker is pick-only — Phase 10 does not change picker rows).
- `.planning/phases/04-confirm-deliver-stock/04-CONTEXT.md` D-79 (CUM-batch lock pattern — Phase 10 D-160 mirrors this primitive on OrderNumberCounter), D-82 (`?status=<tab>` URL-as-state — Phase 10 does not alter the BestallningarPage URL contract), D-84 (confirm/deliver actor trios — Phase 10 D-162 confirms orderNumber unchanged by these transitions).
- `.planning/phases/05-audit-log/05-CONTEXT.md` D-90 ($extends middleware — Phase 10 gets audit coverage of orderNumber for free), D-95 (diff-at-read pipeline — surfaces new orderNumber fields on create events automatically), D-97 + AUDIT_ALLOWLIST (Phase 10 extends AUDIT_ALLOWLIST.Order with the new fields), D-98 (BEFORE-trigger pattern — Phase 10's mint uses an UPSERT, NOT a trigger, per D-160 rejection rationale).
- `.planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md` — Plan-01-ships-before-Plan-02-lands forward-compatible contract pattern (no direct overlap; Phase 10 slices ship in dependency order — Slice 1 BE before Slice 2 FE).
- `.planning/phases/07-ops-submission-polish/07-CONTEXT.md` — SC#4 mobile-first verification harness; Phase 10 changes column count in OrdersTable/DraftsTable — the harness will need to be re-run (or visually verified) against `sc04-360-bestallningar.png` to ensure 360 px width is not regressed. Card-list mode at 360 px is the fallback; the new heading slot must not introduce horizontal scroll.
- `.planning/phases/08-compose-catalog-ux/08-CONTEXT.md` — No direct overlap (Phase 8 sharpened picker UX). The deferred "Order numbers in picker rows" idea is explicitly OUT of Phase 10 scope.
- `.planning/phases/09-dashboard-depth-back-nav/09-CONTEXT.md` D-144 (top-5 rows per section, minimal fields: id, status, lineCount, totalQuantity, createdBy.name, createdAt) — Phase 10 EXTENDS this row shape with orderNumber and demotes createdBy.name per D-168. D-149/D-150 (`?from=<status>` URL-as-state) — unchanged.

### Existing code referenced by Phase 10 deliverables (read carefully — these files will be edited)

- `apps/api/prisma/schema.prisma` — `model Order` at line 213 (Phase 10 adds `orderNumberCounter Int`, `orderNumberYear Int`, optionally a `@@unique([careUnitId, orderNumberYear, orderNumberCounter])`); new `model OrderNumberCounter` adjacent. NOT NULL on the two int columns AFTER backfill (initial migration uses a two-step approach: ADD NULLABLE → backfill → ALTER NOT NULL, all in one migration file via raw SQL).
- `apps/api/src/services/order.service.ts:createDraftOrder` — service path that inserts a new Order. Phase 10 adds the mintOrderNumber step inside the existing `$transaction`. Other transitions (`submitOrder`, `confirmOrder`, `deliverOrder`) do NOT touch orderNumber (D-162).
- `apps/api/src/services/dashboard.service.ts:listDashboardOrdersForUser` — Phase 9 service that returns dashboard rows. Phase 10 widens its `select` to include the new `orderNumberCounter` + `orderNumberYear` columns, formats them into `orderNumber: string`, and the contract widening flows through `dashboardOrderRow` (D-168).
- `apps/api/test/orders.*.integration.test.ts` — existing order tests will need `orderNumber` assertions on the responses they check. Plan should enumerate which existing test files need fixture/assertion updates.
- `apps/api/test/dashboard.orders.integration.test.ts` — Phase 9 test; Phase 10 extends its row-shape assertions to include orderNumber.
- `packages/shared/src/contracts/order.ts` lines 68–115 — `orderResponse` + `orderListItem` Zod schemas; Phase 10 adds `orderNumber: z.string()` as a required field.
- `packages/shared/src/contracts/dashboard.ts` lines 134–147 — `dashboardOrderRow` Zod schema; Phase 10 adds `orderNumber: z.string()`.
- `packages/shared/src/utils/` (new directory or existing — verify) — `orderNumber.ts` containing `formatOrderNumber({year: number, counter: number}): string` (single source of truth for the display shape per D-165).
- `apps/web/src/routes/bestallningar/OrdersTable.tsx` + `OrdersCardList.tsx` — new leftmost column / new card heading (D-166).
- `apps/web/src/routes/bestallningar/DraftsTable.tsx` + `DraftsCardList.tsx` — same shape changes as OrdersTable / OrdersCardList.
- `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` — new `<h1>` above the OrderStatusPill (D-167); aria-label updates.
- `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx` — row primary text changes per D-168.
- `apps/web/src/routes/bestallningar/SubmitConfirmationBanner.tsx` — copy update per D-169.
- `apps/web/src/routes/bestallningar/__tests__/*.test.tsx` — extend existing tests with orderNumber assertions; existing assertions about timestamp/createdBy.name copy will need updates where Phase 10 demotes those.
- `apps/api/src/audit/AUDIT_ALLOWLIST.ts` (or wherever the allowlist lives — verify path) — extend `Order` entry with the three new fields per Claude's discretion above.
- `apps/web/scripts/captureSc04Screenshots.ts` — Phase 7 SC#4 harness; the screenshots `sc04-360-bestallningar.png` + `sc04-360-dashboard.png` will look different after Phase 10. Re-run after the phase lands.

### Brief & tooling

- `local/intervju-testcase-1-1-.pdf` (Swedish brief — local only) §2.1 (order flow + history); §6 (concurrency interview question — Phase 10's D-160 doubles down on the §6 answer the project already gives for Phase 4 stock).
- `CLAUDE.md` — Swedish UI labels + English code identifiers; mobile-first constraint; lightweight bias (no new infrastructure for order numbering — single counter table + UPSERT mint, no Redis, no separate service).
- `.planning/config.json` — Workflow toggles unchanged; no Phase 10 changes to config.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Row-level write lock primitive** — Phase 4's STK-02 implementation in `order.service.ts:deliverOrder` uses `SELECT ... FOR UPDATE` on `Medication` to serialize concurrent stock decrements. Phase 10's `OrderNumberCounter` UPSERT inside the same `$transaction` reuses the exact same Postgres primitive (row-level write lock for the duration of the tx); the §6 "two nurses ordering simultaneously" interview answer is the SAME answer for both phases — only the locked row differs.
- **`$transaction` shape** — every Order-mutating service path (`createDraftOrder`, `submitOrder`, `confirmOrder`, `deliverOrder`) already wraps in `prisma.$transaction(async (tx) => { ... })`. Phase 10's mint step slots in as one extra statement inside the existing `createDraftOrder` tx — no new transaction surface.
- **Shared utility module pattern** — `packages/shared/src/constants/orderStatus.ts` is the canonical single-source-of-truth model. `packages/shared/src/utils/orderNumber.ts` (new) mirrors this: one file, one exported function, consumed by BE serialization and FE display alike.
- **Audit `$extends` pipeline** — Phase 5 + Phase 6 D-95 show that schema additions to audited models automatically surface in the audit log via the diff-at-read pipeline. Phase 10's three new columns get audit coverage by adding them to AUDIT_ALLOWLIST.Order — zero new audit code.
- **Zod `orderListItem` + `orderResponse` + `dashboardOrderRow` envelopes** — single-source-of-truth contracts that drive both BE serialization and FE type narrowing. One `orderNumber: z.string()` addition cascades to every order-rendering surface with TS-enforced compliance.
- **Mobile-first `Card` primitives** — `OrdersCardList.tsx` and `DraftsCardList.tsx` already use the `<Card><CardHeader><CardTitle>...</CardTitle></CardHeader>` pattern. The new heading slot for orderNumber goes into `<CardTitle>`.

### Established Patterns

- **Single migration file with phased ALTER** — Phase 4 / Phase 5 / Phase 6 migrations use the `ADD NULLABLE → backfill → ALTER NOT NULL` pattern when adding required columns to populated tables. Phase 10 follows verbatim (`orderNumberCounter` + `orderNumberYear` added nullable, backfilled in the same migration via the CTE, then `ALTER ... SET NOT NULL`).
- **Sequential prefix for migration filenames** — `apps/api/prisma/migrations/` uses zero-padded sequential numbers (`0012_*` is the latest). Phase 10's migration will be `0013_*`.
- **Audit allowlist add-only** — never remove from `AUDIT_ALLOWLIST`; only extend. Phase 10 extends `Order` with three new fields.
- **`createDraftOrder` is the only INSERT path for Order** — confirmed by Phase 3's narrow contract (D-58 picker is pick-only, no alternative draft-creation paths). Phase 10's mint logic only needs to live in one service function.
- **Test fixture updates in lockstep with schema changes** — Phase 6 Plan 02's `medications.therapeuticClass.integration.test.ts` is the canonical example. Phase 10 plan should enumerate the test files that need new `orderNumber` assertions; the typecheck wall catches any missed envelope.

### Integration Points

- **One new BE service helper** — `mintOrderNumber(careUnitId, tx)` likely a private function inside `order.service.ts` (or co-located in a new `apps/api/src/services/orderNumber.service.ts` if the file grows — defer to the planner).
- **One new BE table** — `OrderNumberCounter`, lives in `apps/api/prisma/schema.prisma`.
- **One new shared utility** — `packages/shared/src/utils/orderNumber.ts:formatOrderNumber`.
- **Three shared contract widenings** — `orderResponse`, `orderListItem`, `dashboardOrderRow` each gain `orderNumber: z.string()`.
- **Five+ FE display edits** — `OrdersTable` + `OrdersCardList` + `DraftsTable` + `DraftsCardList` + `ComposeOrderPage` + `DashboardOrdersCard` + `SubmitConfirmationBanner` (and the aria-label sites in each).
- **One audit allowlist edit** — extend `AUDIT_ALLOWLIST.Order` with the three new fields.
- **No new permissions, no new endpoints, no new BE routes** — orderNumber is a read-side field on existing endpoints. The mint happens server-side inside an existing endpoint (POST /api/orders) — no surface for the FE to call directly.
- **No new dev-deps, no new env vars, no Docker Compose changes.**

</code_context>

<specifics>
## Specific Ideas

### Migration shape (locked — gives the planner a concrete contract)

```sql
-- Step 1: add columns nullable
ALTER TABLE "Order"
  ADD COLUMN "orderNumberCounter" INT,
  ADD COLUMN "orderNumberYear" INT;

-- Step 2: create counter table
CREATE TABLE "OrderNumberCounter" (
  "careUnitId" TEXT NOT NULL,
  "year" INT NOT NULL,
  "nextValue" INT NOT NULL,
  PRIMARY KEY ("careUnitId", "year"),
  FOREIGN KEY ("careUnitId") REFERENCES "CareUnit" ("id") ON DELETE CASCADE
);

-- Step 3: backfill order columns
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "careUnitId", EXTRACT(YEAR FROM "createdAt")
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn,
         EXTRACT(YEAR FROM "createdAt")::int AS year
  FROM "Order"
)
UPDATE "Order" o
SET "orderNumberCounter" = numbered.rn,
    "orderNumberYear" = numbered.year
FROM numbered
WHERE o.id = numbered.id;

-- Step 4: seed counter table from backfilled orders
INSERT INTO "OrderNumberCounter" ("careUnitId", "year", "nextValue")
SELECT "careUnitId", "orderNumberYear", MAX("orderNumberCounter") + 1
FROM "Order"
GROUP BY "careUnitId", "orderNumberYear";

-- Step 5: enforce NOT NULL + uniqueness
ALTER TABLE "Order"
  ALTER COLUMN "orderNumberCounter" SET NOT NULL,
  ALTER COLUMN "orderNumberYear" SET NOT NULL,
  ADD CONSTRAINT "Order_careUnitId_orderNumberYear_orderNumberCounter_key"
    UNIQUE ("careUnitId", "orderNumberYear", "orderNumberCounter");
```

### Mint logic (locked — service layer)

```ts
// apps/api/src/services/order.service.ts (inside createDraftOrder $transaction)

async function mintOrderNumber(
  tx: Prisma.TransactionClient,
  careUnitId: string
): Promise<{ year: number; counter: number }> {
  // 1. Try UPDATE first (common case: counter row already exists)
  const updated = await tx.$queryRaw<{ year: number; counter: number }[]>`
    UPDATE "OrderNumberCounter"
    SET "nextValue" = "nextValue" + 1
    WHERE "careUnitId" = ${careUnitId}
      AND "year" = EXTRACT(YEAR FROM NOW())::int
    RETURNING "year", "nextValue" - 1 AS "counter"
  `;
  if (updated.length === 1) return updated[0];

  // 2. First order of the (careUnitId, year) pair — UPSERT to materialize
  //    the row, with ON CONFLICT handling for a racing concurrent insert.
  const inserted = await tx.$queryRaw<{ year: number; counter: number }[]>`
    INSERT INTO "OrderNumberCounter" ("careUnitId", "year", "nextValue")
    VALUES (${careUnitId}, EXTRACT(YEAR FROM NOW())::int, 2)
    ON CONFLICT ("careUnitId", "year")
    DO UPDATE SET "nextValue" = "OrderNumberCounter"."nextValue" + 1
    RETURNING "year",
              CASE WHEN xmax = 0 THEN 1
                   ELSE "OrderNumberCounter"."nextValue" - 1
              END AS "counter"
  `;
  return inserted[0];
}
```

### Shared utility (locked)

```ts
// packages/shared/src/utils/orderNumber.ts

export function formatOrderNumber(input: {
  year: number;
  counter: number;
}): string {
  return `ORD-${input.year}-${String(input.counter).padStart(4, '0')}`;
}
```

### Contract additions (locked)

```ts
// packages/shared/src/contracts/order.ts (additions)

export const orderResponse = z.object({
  // ... existing fields
  orderNumber: z.string(),       // formatted via formatOrderNumber
  orderNumberCounter: z.number().int().positive(),
  orderNumberYear: z.number().int().positive(),
  // ... rest
});

export const orderListItem = z.object({
  // ... existing fields
  orderNumber: z.string(),
  // counter + year not surfaced on list items (lean row shape, D-72)
});

// packages/shared/src/contracts/dashboard.ts (additions to dashboardOrderRow)

export const dashboardOrderRow = z.object({
  // ... existing fields (id, status, lineCount, totalQuantity, createdBy, createdAt)
  orderNumber: z.string(),
});
```

### Plan-slice ordering (recommended)

1. **Slice 1 — BE foundation + format utility.** Migration (0013) + Prisma schema + counter table + backfill SQL + `formatOrderNumber` shared utility + `mintOrderNumber` service helper + `createDraftOrder` integration + shared contract additions + AUDIT_ALLOWLIST extension + concurrency integration test + year-boundary test + cross-vårdenhet isolation test + backfill SQL test. Lands BE end-to-end and audit coverage. FE still shows id-substring.
2. **Slice 2 — FE rendering surfaces.** OrdersTable + DraftsTable column + Card variants + ComposeOrderPage H1 + DashboardOrdersCard row layout + SubmitConfirmationBanner copy + aria-label updates + extended component tests + sc04 re-capture.

### Commit message conventions (Phase 10)

- All commits use `chore(10-NN):` / `feat(10-NN):` / `test(10-NN):` / `docs(10-NN):` scopes per the existing project convention.
- Each slice ends with a `docs(10-NN): complete <slice name> plan` commit.
- Final phase commit: `docs(phase-10): complete phase execution` mirroring the Phase 8/9 closeout pattern.

</specifics>

<deferred>
## Deferred Ideas

(Captured during Phase 10 discussion; do NOT lose; do NOT act on in Phase 10.)

- **Search by order number (`GET /api/orders?orderNumber=ORD-2026-0042`).** ROADMAP scopes Phase 10 as display-only. Lookup-by-number is a v2 nice-to-have once users have an order number they want to share / reference.
- **URL slugs by order number (`/bestallningar/ORD-2026-0042`).** Cleaner shareable URLs. Keep cuid `/bestallningar/:id` as the canonical URL for v1; the order-number URL would be an alias. v2.
- **Order numbers in picker rows / suggestion blocks** (Phase 8 carryover). The picker is an internal compose-time tool. Could surface "most-recent order number per medication" in suggestion-row metadata. v2.
- **Configurable per-vårdenhet format overrides** (e.g. unit-specific prefixes). All units use ORD-YYYY-####. Configurability is reviewer-questionable scope creep for the interview demo. v2.
- **Counter overflow handling at 9999/year.** Format degrades gracefully to 5+ digits without migration; revisit if any unit ever hits 9999. v2.
- **Renaming audit `entityId` to use order numbers.** entityId stays cuid (stable DB identifier); orderNumber is decorative. Phase 5 invariants preserved. v2-or-never.
- **Year derived from `submittedAt` instead of `createdAt`.** Currently year is stamped at Utkast creation (D-162). If a draft is created Dec 31 2026 23:59 and submitted Jan 1 2027, the order number says 2026. Could matter for fiscal-year reporting. v2 — needs a UAT signal first.
- **Surfacing orderNumber on the AuditDiffPanel as a heading** (Phase 5 surface). The diff panel renders `orderNumber: null → 'ORD-2026-0042'` as a normal field today; an order-identity heading on each audit card would be a nice future polish if reviewers ask. v2.
- **`OrderActorTrail` widened with the order number.** Today the trail is purely actor-temporal. Identity is now H1 (D-167). Could revisit if the H1 lives outside the print region. v2.

</deferred>

---

*Phase: 10-Order Numbers*
*Context gathered: 2026-05-25*
*Discussion log: 10-DISCUSSION-LOG.md*
