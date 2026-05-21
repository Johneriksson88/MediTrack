# Phase 3: Draft Orders - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-21
**Phase:** 3-Draft Orders
**Areas discussed:** Order schema shape, Draft persistence model, Submit-lock + 409 contract, Line-item picker UX

---

## Order schema shape

### Q1: How should the `status` column be modeled in Prisma?

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres enum (`OrderStatus`) | Matches `Role` and `MedicationSource` precedent; DB-level integrity. | ✓ |
| String column + Zod parse | Cheaper to extend; loses DB-level integrity. | |
| Int column with TS enum mapping | Smallest footprint; unreadable in raw SQL. | |

**User's choice:** Postgres enum (`OrderStatus`)
**Notes:** Mirror `ORDER_STATUSES` const verbatim. Declare all 4 values in Phase 3 migration even though only 2 used here (Phase 4 wins zero schema work).

### Q2: What should an `OrderLine` reference?

| Option | Description | Selected |
|--------|-------------|----------|
| careUnitMedicationId only (lean) | FK + quantity only; snapshots deferred to Phase 4 deliver transition. | ✓ |
| careUnitMedicationId + immediate snapshot | Freeze name/atc/strength/form at line creation. | |
| Snapshot only at submit time | Branching logic in submit endpoint. | |

**User's choice:** careUnitMedicationId only (lean)
**Notes:** Snapshot columns become load-bearing at Phase 4 deliver time when stock decrements; until then read-through to live data is acceptable.

### Q3: Should drafts and submitted orders share one table?

| Option | Description | Selected |
|--------|-------------|----------|
| Single `Order` table, status column distinguishes | Submit is one UPDATE; Phase 4 transitions follow same pattern. | ✓ |
| Separate `OrderDraft` → `Order` promotion at submit | Cleaner segregation; doubles schema work; copy-on-submit step. | |

**User's choice:** Single `Order` table, status column distinguishes
**Notes:** Matches brief vocabulary (one entity progressing through statuses, not separate entities per status).

### Q4: What submit-time metadata should the transition stamp on `Order`?

| Option | Description | Selected |
|--------|-------------|----------|
| submittedAt + submittedByUserId | Two nullable columns; sets pattern for Phase 4 confirm/deliver pairs. | ✓ |
| submittedAt only | Smaller surface; Phase 5 audit middleware captures actor anyway. | |
| Nothing extra (status change is the only signal) | Most minimal; reviewer demo looks impoverished pre-Phase 5. | |

**User's choice:** submittedAt + submittedByUserId
**Notes:** Establishes the column-pair pattern (`{verb}At`, `{verb}ByUserId`) Phase 4 mirrors for `confirmedAt/By` and `deliveredAt/By`.

---

## Draft persistence model

### Q1: When should the `Order` row hit the DB?

| Option | Description | Selected |
|--------|-------------|----------|
| POST empty draft on compose-open | URL is shareable, refresh-safe, crash-recoverable. | ✓ |
| Accumulate locally, POST on first Save | No URL for in-progress drafts; refresh = lost work. | |
| Hybrid: stage in localStorage, POST on Save | Best UX on flaky connectivity; extra schema to maintain. | |

**User's choice:** POST empty draft on compose-open
**Notes:** Orphan-empty-draft cleanup is Phase 7 cron concern; "Kasta utkast" is the only Phase 3 cleanup path.

### Q2: How are line edits persisted after the draft exists?

| Option | Description | Selected |
|--------|-------------|----------|
| PATCH-as-you-go on each line operation | "Draft is always saved" model; mirrors Phase 2 D-42. | ✓ |
| Debounced bulk PATCH of the whole line array | Fewer requests; risk of losing the last edit on quick navigation. | |
| Explicit Save button only | Familiar pattern; conflicts with always-saved draft model. | |

**User's choice:** PATCH-as-you-go on each line operation
**Notes:** Quantity edits debounced 250 ms; add/remove fires immediately.

### Q3: Optimistic mutations for line edits?

| Option | Description | Selected |
|--------|-------------|----------|
| Quantity = optimistic, add/remove = pessimistic | Mirrors Phase 2 D-42 inline/sheet split. | ✓ |
| All operations optimistic | Snappiest UX; rollback animations jarring on add-line. | |
| All operations pessimistic | Slower feel; harder to hide mobile latency. | |

**User's choice:** Quantity = optimistic, add/remove line = pessimistic
**Notes:** Phase 2 D-42 precedent extended consistently.

### Q4: How does the user find an in-progress draft again?

| Option | Description | Selected |
|--------|-------------|----------|
| Drafts section on `/bestallningar` (Phase 3 scope) | `GET /api/orders?status=utkast` scoped to careUnit; lightest possible list. | ✓ |
| URL-only: bookmark the draft | No list; fails mobile UX. | |
| Banner on /dashboard 'You have N drafts' | Spreads order surface across two routes. | |

**User's choice:** Drafts section on `/bestallningar` (Phase 3 scope)
**Notes:** Sort `createdAt DESC`; columns/cards show created-date + line count + total quantity + author. Phase 4 ORD-07 expands to full status-filtered history.

---

## Submit-lock + 409 contract

### Q1: Where should the 'no edits after submit' guard live?

| Option | Description | Selected |
|--------|-------------|----------|
| Service-layer check inside an atomic UPDATE | `WHERE id = ? AND status = 'utkast'` with affected-count inspection. Race-free. | ✓ |
| Route preHandler that loads the order first | TOCTOU window between read and write. | |
| Prisma extension / middleware | Hides the guard from route code; collides with Phase 5 audit middleware. | |

**User's choice:** Service-layer check inside an atomic UPDATE
**Notes:** Phase 4 ORD-06 generalizes this to `OrderTransitionError` covering all status preconditions.

### Q2: What `code` string goes into the 409 error envelope?

| Option | Description | Selected |
|--------|-------------|----------|
| `order_locked` | Domain-specific, clear, narrow to lifecycle-after-submit. | ✓ |
| `forbidden_status_transition` | Reused later by Phase 4 ORD-06; conflates edit-locked vs invalid-skip. | |
| `conflict_status` (generic) | Generic envelope code with details field. | |

**User's choice:** `order_locked`
**Notes:** Phase 4 introduces parallel narrow codes (`order_already_confirmed`, `order_already_delivered`) — one code per user-visible error.

### Q3: What server-side validation must the submit endpoint enforce?

| Option | Description | Selected |
|--------|-------------|----------|
| Non-empty lines + positive quantities | 422 `validation_failed` with `details.reason`. | ✓ |
| Non-empty + positive + no soft-deleted refs | Stricter; extra join in the submit transaction. | |
| Only the status precondition | Permits empty / zero-quantity submissions; demo hole. | |

**User's choice:** Non-empty lines + positive quantities
**Notes:** Soft-deleted CareUnitMedication references are a Phase 4 concern when stock is actually consumed.

### Q4: What's the response shape of the submit endpoint on success?

| Option | Description | Selected |
|--------|-------------|----------|
| Full updated `Order` with embedded lines + `submittedAt/By` | TanStack Query cache hydrated atomically; no second fetch. | ✓ |
| Slim `{ id, status, submittedAt }` | Smaller payload; extra round-trip on mobile. | |
| `204 No Content` | REST-purist; loses confirm of `submittedByUserId` snapshot in one shot. | |

**User's choice:** Full updated `Order` with embedded lines + `submittedAt/By`
**Notes:** Mirrors Phase 2's PATCH-returns-updated-row pattern. Also invalidates `['orders', { status: 'utkast' }]` so the submitted draft disappears from the list.

---

## Line-item picker UX

### Q1: How does the nurse pick a medication and add it as a line?

| Option | Description | Selected |
|--------|-------------|----------|
| 'Add line' triggers shadcn Sheet typeahead (reuse Phase 2) | Maximum reuse of D-30 / D-34 / D-45 patterns. | ✓ |
| Inline typeahead on a 'blank' final row | Faster bulk-entry; new component + tricky 44 px+ touch targets. | |
| Full-screen catalog page with 'Add to draft' buttons | Best for browsing; navigation away from the draft confusing. | |

**User's choice:** 'Add line' triggers shadcn Sheet typeahead (reuse Phase 2)
**Notes:** New component `MedicationPickerSheet` in `apps/web/src/routes/bestallningar/`, stripped to pick-only (no create / "Skapa nytt"). Picking closes Sheet and POSTs the line with `quantity = 1`.

### Q2: What does the picker typeahead search over?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-vårdenhet `CareUnitMedication` only | Active rows scoped to user's vårdenhet. | ✓ |
| Global Medication, auto-add CUM if missing | Spans Phase 2/3 boundaries; "ordering = first-time stocking". | |
| Per-vårdenhet with empty-result fallback to NPL | Best UX; extra component state. | |

**User's choice:** Per-vårdenhet `CareUnitMedication` only
**Notes:** New endpoint `GET /api/orders/picker-options?q=&limit=20`; reuses pg_trgm GIN index Phase 2 added on `Medication.name`. NPL-fallback is a Phase 7 README candidate.

### Q3: What's the quantity input on each line on mobile?

| Option | Description | Selected |
|--------|-------------|----------|
| Number input + −/+ stepper buttons | 44 × 44 px stepper buttons; long-press auto-repeats. | ✓ |
| Plain number input, no steppers | Relies on OS-native number keyboards; harder to hit 44 px target. | |
| Slider | Bad for precision in clinical context. | |

**User's choice:** Number input + −/+ stepper buttons
**Notes:** Layout `[ − ] [ <input> ] [ + ]`; `inputMode="numeric"` surfaces number keyboard on iOS; PATCH on blur or after 250 ms debounce, whichever fires first.

### Q4: How should the picker surface low-stock context?

| Option | Description | Selected |
|--------|-------------|----------|
| Show current stock + `<LowStockBadge>` per row, no default filter | Reuses Phase 2 D-39; surfaces signal without railroading. | ✓ |
| Default-filter to below-threshold items, toggle to expand | Blocks the legitimate "top up a healthy med" use case. | |
| No stock context in picker | Loses the most demo-relevant signal of the phase. | |

**User's choice:** Show current stock + `<LowStockBadge>` per row, no default filter
**Notes:** Row layout: `{ name } · { atcCode } · { form } · Lager: {currentStock} {LowStockBadge?}`.

---

## Claude's Discretion

The user deferred these to Claude's judgment (captured in CONTEXT.md D-64..D-73):

- Permission keys widening (`order:read/create/update/submit/delete` mapped to roles)
- API route layout under `apps/api/src/routes/orders/`
- Service file layout (`order.service.ts` with `assertOrderEditable` helper)
- "Kasta utkast" affordance shape (destructive button + AlertDialog, soft-delete via `Order.deletedAt`)
- Submit landing UX (stay on `/bestallningar/<id>` with status pill + banner + back link)
- TanStack Query keys
- Empty-state copy strings (Swedish, locked verbatim)
- Mobile sticky footer layout for the compose view
- Drafts list layout (table ≥md / cards <md)
- Test scope (vitest BE integration + FE component; Playwright deferred to Phase 7)

## Deferred Ideas

Captured during discussion for future phases (full list in CONTEXT.md `<deferred>` section):

- OrderLine snapshot columns (Phase 4 deliver transition)
- Per-user "mine vs all unit drafts" toggle (Phase 4 polish)
- Orphan draft cleanup cron (Phase 7)
- "Tidigare utkast" / trash-bin restore UI (Phase 7)
- Multi-tab edit conflict UX (v2)
- Bulk-edit line quantities, keyboard shortcuts (v2)
- Order notes / freetext field on `Order` (v2)
- NPL fallback in the picker (Phase 7)
- Order display IDs / human-readable numbers (v2)
- Email / push notification on submit (out of scope per PROJECT.md)
- Audit-event writes on Phase 3 mutations (Phase 5 middleware retrofit)
- Rate limiting on `/api/orders` (Phase 7 README "with more time")
- Extending seed to one in-flight order per status (Phase 4 onwards)
