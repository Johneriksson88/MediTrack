# Phase 4: Confirm, Deliver & Stock - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 4-Confirm, Deliver & Stock
**Areas discussed:** Transition error contract, Stock + snapshot semantics, History surface + pharmacist UX, Concurrency test approach

---

## Transition error contract

### Q1 — Canonical error code shape for invalid status jumps (ORD-06)

| Option | Description | Selected |
|--------|-------------|----------|
| Generalized `order_transition_invalid` | One code with `details: { from, to, expected }`. FE branches once on code, message stays generic. New transitions added later cost zero contract churn. | ✓ |
| Narrow per-status codes | `order_already_confirmed`, `order_already_delivered`, `order_not_yet_submitted`, etc. Phase 3 D-55 framed this option. | |
| Widen `order_locked` to cover all invalid transitions | Keep one code, change its semantics from "draft is locked" to "this status doesn't allow this transition." | |

**User's choice:** Generalized `order_transition_invalid`.
**Notes:** Keeps `order_locked` narrow to Phase 3's draft-edit-after-submit semantics; scales cleanly when future statuses arrive.

### Q2 — How to expose confirm/deliver via HTTP?

| Option | Description | Selected |
|--------|-------------|----------|
| Two narrow endpoints | `POST /api/orders/:id/confirm` + `POST /api/orders/:id/deliver`. Mirrors `submit` exactly. | ✓ |
| One generic transition endpoint | `POST /api/orders/:id/transition` with `body: { to: ... }`. | |
| PATCH /api/orders/:id with `status` field | RESTish but ties action+side-effect to a generic resource update. | |

**User's choice:** Two narrow endpoints.
**Notes:** RBAC binds cleanly to each route; side-effect (stock decrement on deliver) stays visible in the URL.

### Q3 — Reversibility

| Option | Description | Selected |
|--------|-------------|----------|
| Strictly linear, no reversal | Skickad→Bekräftad→Levererad forward-only. Mistakes handled by UX gate (AlertDialog), not API gate. | ✓ |
| Allow Bekräftad→Skickad | Apotekare can revert before delivery. Adds endpoint + matrix branch. | |
| Allow free movement between non-Levererad statuses | Most permissive. | |

**User's choice:** Strictly linear, no reversal.
**Notes:** Cleanest correctness story for the interview; brief never asks for reversal.

### Q4 — Edit-lock contract for line mutations

| Option | Description | Selected |
|--------|-------------|----------|
| Keep `order_locked` for line mutations (Phase 3 verbatim) | Line CRUD keeps Phase 3's contract; confirm/deliver use the new code. | ✓ |
| Replace `order_locked` with the new generalized code | Migrate Phase 3's errors too — touches Phase 3 tests + FE 409 handler. | |
| You decide | Defer to Claude during planning. | |

**User's choice:** Keep `order_locked` for line mutations (Phase 3 verbatim).
**Notes:** Zero Phase 3 churn; clean separation of "edit a draft" (locked) vs "advance status" (invalid transition).

---

## Stock + snapshot semantics

### Q1 — Replenishment vs consumption

| Option | Description | Selected |
|--------|-------------|----------|
| Replenishment — quantity ADDED to currentStock | Matches ROADMAP SC #2 verbatim and the brief's hospital-pharmacy workflow. | ✓ |
| Consumption — quantity SUBTRACTED on Levererad | Reverses the spec. | |
| Configurable per-line via `direction` enum | Out-of-scope flexibility. | |

**User's choice:** Replenishment — quantity is ADDED.
**Notes:** Confirmed against ROADMAP.md SC #2 verbatim.

### Q2 — Same-CUM-multiple-lines aggregation

| Option | Description | Selected |
|--------|-------------|----------|
| Group lines by careUnitMedicationId, sum, apply once per CUM (FOR UPDATE sorted-id order) | Minimizes lock count; clean deadlock story. | ✓ |
| Apply per-line with one UPDATE per OrderLine | Simpler control flow; more locks; harder to reason about deadlock. | |
| Pre-aggregate in a CTE / single SQL statement | Faster but harder to read; FOR UPDATE becomes implicit. | |

**User's choice:** Group + sum, apply once per CUM, FOR UPDATE in sorted-id order.
**Notes:** Gives the cleanest §6 concurrency story; sorted-id ordering eliminates cross-order deadlocks.

### Q3 — OrderLine snapshot strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Skip snapshots — live-join from CareUnitMedication × Medication | Zero schema churn; documented gap for user-created med rename. NPL meds locked from edits so demo path is safe. | ✓ |
| Snapshot on submit | Lines freeze at the moment they leave the nurse's hands. Higher schema cost. | |
| Snapshot on deliver | D-47's original framing; leaves Skickad/Bekräftad vulnerable to drift. | |

**User's choice:** Skip snapshots — live-join.
**Notes:** Acceptable v1 trade; explicit README known-gap line.

### Q4 — Soft-deleted CUM at deliver time

| Option | Description | Selected |
|--------|-------------|----------|
| Block delivery with 422 `validation_failed` + `reason: 'medication_removed'` | Same shape as Phase 3 submit 422s. Clear apotekare action. | ✓ |
| Auto-restore the CUM and proceed | Couples deliver with implicit catalog mutation. | |
| Allow delivery; stock update lands on the soft-deleted row | Hard to reason about; zero apotekare signal. | |

**User's choice:** Block with 422 `medication_removed`.
**Notes:** Fix path is Phase 2's transparent restore (one click in /lakemedel).

---

## History surface + pharmacist UX

### Q1 — History surface shape

| Option | Description | Selected |
|--------|-------------|----------|
| One page, status-tab filter at top of /bestallningar | `Utkast | Skickade | Bekräftade | Levererade | Alla`. URL deep-linkable. | ✓ |
| Separate /bestallningar/historik page | Two routes; apotekare navigates between them. | |
| Filter chips (no tabs) | More flexible but less obvious for status-driven workflow. | |

**User's choice:** Status-tab filter on /bestallningar.
**Notes:** Single screen for apotekare's "show me what needs my attention" workflow.

### Q2 — Apotekare action surface

| Option | Description | Selected |
|--------|-------------|----------|
| Inline buttons on order detail page (/bestallningar/:id) | Extend Mode B (Skickad) into Mode C/D/E with action buttons + AlertDialog on deliver. | ✓ |
| Bulk action from Skickade tab | Faster for high volume but bulk-deliver under one tx → deadlock risk. | |
| Dedicated apotekare queue page (/apoteket) | More screens; not asked for. | |

**User's choice:** Inline buttons on detail page.
**Notes:** Consistent with Phase 3 ComposeOrderPage; mobile sticky-footer pattern reused.

### Q3 — Actor column shape

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror D-49 verbatim: confirmedAt/By + deliveredAt/By columns | Zero pattern divergence from Phase 3; full trail rendered on history page. | ✓ |
| Single lastTransitionedAt/By pair | Overwrites on each transition; loses the trail. | |
| Defer to Phase 5 audit log entirely | ORD-07 must work standalone. | |

**User's choice:** Mirror D-49 — confirmedAt/By + deliveredAt/By.
**Notes:** Same FK pattern (onDelete: Restrict); named relations required by Prisma.

### Q4 — Demo seed shape

| Option | Description | Selected |
|--------|-------------|----------|
| One of each status: Utkast + Skickad + Bekräftad + Levererad | 30-second demo covers ORD-04/05/07 visually + history tab populated. | ✓ |
| Keep one Utkast + add one Skickad only | Smaller seed; history tab looks empty for Bekräftad/Levererad. | |
| Don't extend the seed | Demo proceeds live; loses history-tab demonstration. | |

**User's choice:** One of each status.
**Notes:** Idempotent per status via findFirst before each create.

---

## Concurrency test approach

### Q1 — Test driver shape

| Option | Description | Selected |
|--------|-------------|----------|
| Two real prisma.$transaction calls in parallel against the test DB | Exercises the actual lock at the actual DB; clean §6 story. | ✓ |
| Two app.inject() calls in Promise.all | Single-event-loop; serializes at JS level, not DB. False-passes a sequential impl. | |
| Instrumented log assertion (FOR UPDATE was issued) | Proves SQL emitted, not that lock fired. | |

**User's choice:** Two real prisma.$transaction calls in parallel.
**Notes:** The defensible §6 answer; ~30-line test.

### Q2 — Test file layout

| Option | Description | Selected |
|--------|-------------|----------|
| One file, two `it` blocks: happy-path + concurrency | Colocates related assertions; grep-friendly for OPS-03. | ✓ |
| Extend existing orders.integration.test.ts | Existing file grows significantly; rationale-by-status diverges. | |
| Separate files (pipeline.integration.test.ts + concurrency.integration.test.ts) | Maximum separation; reads as fragmentation. | |

**User's choice:** One file, two `it` blocks (orders.deliver.integration.test.ts).
**Notes:** Mirrors Phase 3 D-73 file layout; imports existing test helpers unchanged.

### Q3 — Test sync strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Two-phase barrier via Promise wiring + advisory delay; verify with pg_locks | Reliable, fast (<500 ms), pg_locks assertion is the "we actually serialized" proof. | ✓ |
| Naive Promise.all without synchronization | Flaky; timing dependent. | |
| Skip the lock-blocking assertion; only assert end state | Simpler but weaker §6 story. | |

**User's choice:** Two-phase barrier with pg_locks proof.
**Notes:** Headline-grabbing test for the interview demo.

### Q4 — Race shape

| Option | Description | Selected |
|--------|-------------|----------|
| Same order, two concurrent deliver calls | Matches brief §6 directly ("two simultaneous nurses [→ apotekare]"). | ✓ |
| Two different orders on the same CUM | Tests per-CUM lock specifically; cross-tenant. | |
| Both cases as separate test scenarios | More coverage; not asked for. | |

**User's choice:** Same order, two concurrent deliver calls.
**Notes:** Cross-order / same-CUM deferred to Phase 7 README §6 polish if time allows.

---

## Claude's Discretion

- Exact Prisma migration name (recommend `0006_order_confirm_deliver`).
- Whether to seed Levererad's stock delta as a post-step UPDATE or pre-bake into the deterministic stock PRNG.
- Toast wording variants beyond the locked Swedish copy in CONTEXT.md §Specifics.
- shadcn `<Tabs>` styling (underlined recommended).
- Optional Skickade-tab badge count.
- preHandler ordering on confirm/deliver routes.
- Optional `/me` permissions-assertion test.
- Whether the Alla tab queries all four statuses or all-except-utkast (recommend: all four).
- Whether to parameterize DraftsTable/DraftsCardList for status-aware columns or fork into OrdersTable/OrdersCardList.
- Reuse of `assertOrderEditable` pattern for confirm/deliver preconditions vs inlining per service function.

## Deferred Ideas

- Bekräftad → Skickad reversal (v2).
- Bulk apotekare actions / multi-select confirm.
- Dedicated apotekare queue page (`/apoteket`).
- OrderLine snapshot columns (D-80 stays live-join indefinitely; v2 improvement).
- Cross-order / same-CUM concurrency test (Phase 7 README §6 polish candidate).
- Stock cap / integer overflow guard.
- Re-deliver / void-delivery flow.
- Email / push notification to nurse on delivery (v2).
- Inline "snabbåtgärd" Bekräfta button on Skickade tab rows.
- Apotekare's detail link from /lakemedel low-stock badge.
- Skickade-tab badge count for apotekare attention.
- Audit-event writes for confirm/deliver (Phase 5 retrofit).
