# Phase 10: Order Numbers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 10-order-numbers
**Areas discussed:** Number format & scope, Generation strategy (§6 concurrency), Backfill ordering, Display placement & prominence

---

## Area Selection

| Area | Selected |
|------|----------|
| Number format & scope | ✓ |
| Generation strategy (§6 concurrency) | ✓ |
| Backfill ordering | ✓ |
| Display placement & prominence | ✓ |
| (API contract surface — Claude's discretion) | — covered by SC#2 |

**User's choice:** All four core gray areas selected. The fifth proposed (API contract) was rolled into Claude's discretion since SC#2 already locks the payload extension at a high level.

---

## Number format & scope — Sub-question 1: Visible format

| Option | Description | Selected |
|--------|-------------|----------|
| ORD-2026-0001 (recommended) | English `ORD` prefix, 4-digit year, 4-digit zero-padded counter — matches roadmap example verbatim. | ✓ |
| BST-2026-0001 | Swedish `BST` (beställning) prefix — closer to UI vocabulary, but project convention is English code identifiers. | |
| ORD-0001 (no year) | Counter only — simpler generator, but loses temporal grounding. | |
| 2026-0001 | Year + counter, no prefix — cleanest typography, mildly ambiguous in logs. | |

**User's choice:** `ORD-2026-0001` (recommended).
**Notes:** D-157 captures the choice. English prefix wins because project convention (PROJECT.md Key Decisions) is "Swedish UI labels, English code identifiers" — the order number is a code-facing artifact that happens to show in the UI; English wins on consistency.

---

## Number format & scope — Sub-question 2: Counter semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Per-vårdenhet, resets every year (recommended) | Each (careUnitId, year) pair has its own counter; restarts at 0001 on Jan 1. Matches roadmap "per-vårdenhet sequence" wording. | ✓ |
| Per-vårdenhet, monotonic forever | Per-unit counter, no year reset — year segment becomes decorative. | |
| Global, year-scoped | One counter across all units, resets per year — units share numbering. | |
| Global, monotonic forever | Single global counter, no reset — loses both per-unit and per-year cues. | |

**User's choice:** Per-vårdenhet, year-resetting (recommended).
**Notes:** D-158 captures the choice. ROADMAP SC#1's "UNIQUE per vårdenhet" is satisfied by any per-unit option; user picked the year-resetting variant for the natural local-history affordance ("we placed 42 orders this year").

**Width sub-decision (Claude's discretion, locked at write-context time):** 4-digit zero-padded counter (D-159). Matches roadmap example; overflow at 9999/year is well beyond demo volume and degrades gracefully to 5+ digits if it ever happens.

---

## Generation strategy (§6 concurrency) — Sub-question 1: Mint mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Counter table + UPDATE...RETURNING in same tx (recommended) | New `OrderNumberCounter(careUnitId, year, nextValue)` table; row-level write lock inside the existing `$transaction`. Same primitive as Phase 4 STK-02. | ✓ |
| Postgres SEQUENCE per (careUnitId, year) | Dynamically created sequences — proliferation issue + non-transactional value consumption (gaps). | |
| SELECT MAX(counter)+1 FOR UPDATE on Order itself | No new table, but `FOR UPDATE` on empty-result SELECT doesn't lock (first-ever order per pair is racy). | |
| DB trigger fills orderNumber on INSERT | Splits generation logic between SQL trigger and TS — Phase 5's trigger pattern was for invariants, not data generation. | |

**User's choice:** Counter table + UPDATE...RETURNING (recommended).
**Notes:** D-160 captures the choice. This is the §6 "two nurses ordering simultaneously" interview answer used twice — same primitive as Phase 4 STK-02. Counter row creation strategy was rolled into the backfill discussion (area 3) so the migration seeds rows for existing (careUnit, year) pairs; runtime UPSERTs only on the first order of a brand-new pair.

**Sub-decisions captured during this turn (Claude's discretion):**
- **D-161:** Year derived server-side at insert time from `now()` in Postgres (DB clock, not app clock) — avoids timezone/skew issues at year boundaries.
- **D-162:** Mint happens once on `createDraftOrder`; submit/confirm/deliver transitions never touch orderNumber. Stability across lifecycle per ROADMAP SC#5.

---

## Backfill ordering

| Option | Description | Selected |
|--------|-------------|----------|
| createdAt ASC per (careUnitId, year), seed counter (recommended) | Single-pass CTE with `ROW_NUMBER() OVER (PARTITION BY careUnitId, year ORDER BY createdAt)`; then seed counter table from `MAX(counter)+1` per pair. Deterministic, narrative ("oldest = 0001"). | ✓ |
| id ASC per (careUnitId, year), seed counter | Same shape but order by cuid — opaque to reviewer reading SQL. | |
| createdAt ASC, lazy counter (no pre-seed) | Skip pre-seed; runtime UPSERT on first new order — saves one migration statement at the cost of an always-on runtime branch. | |

**User's choice:** createdAt ASC + seeded counter (recommended).
**Notes:** D-163 captures the choice. The pre-seed pattern keeps the common runtime path a pure `UPDATE ... RETURNING` (D-164); only first-ever orders of brand-new (careUnit, year) pairs hit the UPSERT fallback.

**Storage shape sub-decision (Claude's discretion, captured during this turn):**
- **D-165:** Storage shape is two structured columns (`orderNumberCounter: Int`, `orderNumberYear: Int`) with a single shared utility `formatOrderNumber({year, counter}): string` deriving the display value. Avoids stale-string drift if format ever changes; unique constraint enforced over the structured columns.

---

## Display placement & prominence — Sub-question 1: Tables

| Option | Description | Selected |
|--------|-------------|----------|
| New leftmost column, mono font (recommended) | `Best.nr` column with `font-mono text-sm`, 4-5ch wide. Card-list variants surface number as card heading. | ✓ |
| Pill chip on existing first cell | Inline chip without column churn — less scannable. | |
| Replace the timestamp-as-identifier copy | aria-label-only swap — pure semantic improvement, no visual surface. | |

**User's choice:** New leftmost column (recommended).
**Notes:** D-166 captures the choice. Best scannability — the eye lands on the identifier first. DraftsCardList/OrdersCardList card heading shifts from `formatRelative(timestamp)` to `ORD-YYYY-####`.

---

## Display placement & prominence — Sub-question 2: Detail header + dashboard rows

| Option | Description | Selected |
|--------|-------------|----------|
| H1 on detail; replaces id-substring on dashboard rows (recommended) | ComposeOrderPage: `<h1>Beställning ORD-2026-0042</h1>`. DashboardOrdersCard: orderNumber is row primary text; createdBy.name demoted to secondary. SubmitConfirmationBanner gains the number. | ✓ |
| Subtitle on detail; appended on dashboard rows | Less prominent — orderNumber as reference detail rather than identity. | |
| Subtle chip on detail; small badge on dashboard rows | Decorative framing; loses "this is the order's name" framing. | |

**User's choice:** H1 + identity-first (recommended).
**Notes:** D-167, D-168, D-169 capture the decisions. Order number is treated as first-class identity affordance, not decoration.

---

## Claude's Discretion

Areas where the user accepted Claude's recommendation or deferred to plan-time:

- **Exact column header text** (`Best.nr` recommended over `Beställningsnr.` / `ORD`) — locked in CONTEXT.md unless objected to in planning.
- **Exact H1 copy** (`Beställning ORD-2026-0042` recommended over `#ORD-...` or number-only).
- **Audit allowlist additions** — extend AUDIT_ALLOWLIST.Order with `orderNumber`, `orderNumberCounter`, `orderNumberYear`; no new audit action key.
- **Optional vs required in Zod** — REQUIRED (NOT NULL post-migration; typecheck catches missed fixtures).
- **OrderActorTrail interaction** — no change (trail is actor-temporal; H1 carries identity).
- **AuditDiffPanel surfacing** — reads sensibly without UI changes; revisit only if reviewers flag.
- **Plan-slice ordering** — recommended 2-slice split: Slice 1 BE foundation + format utility; Slice 2 FE rendering surfaces.
- **Counter width** — 4 digits (matches roadmap example; degrades gracefully).
- **Year derivation** — server-side via `EXTRACT(YEAR FROM NOW())` (DB clock).
- **Mint timing** — once on `createDraftOrder`; stable across lifecycle.
- **Storage shape** — structured columns + shared format utility.
- **Runtime UPSERT pattern** — UPDATE-then-INSERT-fallback inside the existing $transaction.

---

## Deferred Ideas

Captured during discussion (and codified in CONTEXT.md `<deferred>`); do NOT act on in Phase 10:

- Search by order number — `GET /api/orders?orderNumber=ORD-2026-0042` lookup. v2.
- URL slugs by order number — `/bestallningar/ORD-2026-0042` aliasing. v2.
- Order numbers in picker rows / suggestion blocks (Phase 8 carryover). v2.
- Configurable per-vårdenhet format overrides. v2.
- Counter overflow handling at 9999/year. v2 — needs real signal first.
- Renaming audit entityId to use order numbers. v2-or-never; entityId stays cuid.
- Year derived from submittedAt instead of createdAt. v2 — needs UAT signal first.
- Surfacing orderNumber on AuditDiffPanel as a heading. v2 polish if reviewers ask.
- OrderActorTrail widened with order number. v2.
