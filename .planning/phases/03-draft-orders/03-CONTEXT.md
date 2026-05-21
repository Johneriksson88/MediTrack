# Phase 3: Draft Orders - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning

<domain>
## Phase Boundary

A nurse can compose a multi-line medication order, save it as a draft (`Utkast`), edit it freely (add/remove lines, change quantities), then submit it once — flipping the status to `Skickad` and locking the order against further edits. Mobile-first compose UI is a hard success criterion (line items stack, quantity inputs ≥44 px, totals visible above the submit button).

**In scope (Phase 3 only — REQ-IDs ORD-01, ORD-02, ORD-03):**
- `Order` + `OrderLine` Prisma models with migration (Postgres `OrderStatus` enum, careUnitId-scoped, soft-delete on `Order.deletedAt` for the Discard affordance)
- `POST /api/orders` — creates an empty draft `{ status: 'utkast', lines: [] }` scoped to `req.user.careUnitId`, returns the new Order with id (D-65); routes the UI to `/bestallningar/<id>` immediately (POST-empty-on-compose-open pattern, D-50)
- `GET /api/orders` — list filtered by `status` (defaults to `?status=utkast`), scoped to `req.user.careUnitId`, sorted `createdAt DESC`; rows include line count + total quantity (powers the Phase 3 drafts list, D-53)
- `GET /api/orders/:id` — full Order with embedded lines (each line carries `careUnitMedicationId`, `quantity`, denormalized `{ name, atcCode, form, strength, currentStock, lowStockThreshold }` for rendering — joined at read time, not snapshotted to columns)
- `POST /api/orders/:id/lines` — add a line `{ careUnitMedicationId, quantity }` to a draft (409 if status ≠ utkast)
- `PATCH /api/orders/:id/lines/:lineId` — change quantity on a draft line (409 if status ≠ utkast)
- `DELETE /api/orders/:id/lines/:lineId` — remove a line from a draft (409 if status ≠ utkast)
- `POST /api/orders/:id/submit` — validate non-empty + positive quantities (422 on fail), then atomic UPDATE `WHERE id = ? AND status = 'utkast'` to flip status to `skickad`, stamp `submittedAt` + `submittedByUserId`, return the full updated Order (409 if status ≠ utkast at UPDATE time)
- `DELETE /api/orders/:id` — soft-delete a draft (sets `Order.deletedAt`; 409 if status ≠ utkast); powers the "Kasta utkast" affordance
- Permission keys widened: `order:read` (all 3 roles), `order:create` / `order:update` / `order:submit` / `order:delete` (all 3 roles — REQUIREMENTS.md ORD-01..03 has no role restriction; Phase 4 will gate confirm/deliver to `apotekare` + `admin`)
- `/bestallningar` page replaces stub: top-level "Ny beställning" button (`<Can action="order:create">`), then a drafts list (your own utkast orders, scoped to your vårdenhet). Empty state: "Inga utkast ännu — skapa en ny beställning."
- `/bestallningar/<id>` route — full-page compose view (NOT a Sheet — the Sheet is reserved for the line-picker overlay). Renders line list (`<table>` ≥md / stacked cards <md), a sticky footer on mobile (line count + total quantity + Submit + Discard), a "Lägg till läkemedel" trigger button, and a "Tillbaka till beställningar" link in the header
- `MedicationPickerSheet` — pick-only variant of Phase 2's `<Sheet>` + typeahead, scoped to active CareUnitMedications of the user's vårdenhet, showing `{ name } · {atcCode} · {form} · Lager: {currentStock} {LowStockBadge?}`
- Tests: vitest BE integration covering create → add-line → patch-quantity → submit (happy path) + 409-after-submit + 422-empty-submit + careUnit scoping; vitest FE component tests for the compose view + picker

**Out of scope (other phases):**
- Order confirm/deliver transitions `Skickad → Bekräftad → Levererad` (ORD-04, ORD-05) → Phase 4
- Backend rejection of invalid status transitions (ORD-06) → Phase 4 (the `order_locked` code introduced here is the first instance; Phase 4 generalizes to all transitions)
- Stock decrement on delivery + `SELECT … FOR UPDATE` row lock (STK-01, STK-02) → Phase 4
- Per-vårdenhet order history view with filtering by status / actor / date (ORD-07) → Phase 4 (Phase 3 ships only a `status=utkast` drafts list for its own draft-resumption requirement)
- Audit log writes (AUD-01..03) → Phase 5 (audit middleware retrofits all Phase 3 mutations without touching Phase 3 code)
- AI categorization + dashboard low-stock banner (CAT/AI/NTF-01) → Phase 6
- Snapshotting medication fields onto OrderLine at submit/deliver time → Phase 4 (when stock is decremented, the snapshot becomes load-bearing)
- README + docker-compose + golden-path polish (OPS-01..04) → Phase 7

</domain>

<decisions>
## Implementation Decisions

### Schema (Order + OrderLine)

- **D-46:** **Status as Postgres enum `OrderStatus`.** Values mirror `ORDER_STATUSES` in `packages/shared/src/constants/orderStatus.ts` verbatim (`utkast`, `skickad`, `bekraftad`, `levererad`). Phase 1 D-15 / Phase 2 D-27 precedent: Postgres enums for closed value sets give DB-level integrity. The Phase 3 migration declares all four values even though Phase 3 only uses `utkast` and `skickad` — Phase 4 needs zero schema work to introduce `bekraftad` / `levererad`. Prisma enum decl matches the union exactly to keep `z.infer<typeof orderStatusEnum>` aligned with Prisma's generated TypeScript.

- **D-47:** **OrderLine references `careUnitMedicationId` only (no snapshot columns in Phase 3).** Columns: `id`, `orderId`, `careUnitMedicationId`, `quantity (Int)`, `createdAt`, `updatedAt`. No `nameSnapshot` / `strengthSnapshot` / `atcSnapshot` yet. Read endpoints (`GET /api/orders/:id`) join through CareUnitMedication → Medication at request time to render. Phase 4's deliver transition will be the natural place to introduce snapshot columns (when stock is decremented, the line truly freezes). For Phase 3, soft-delete of a referenced CareUnitMedication between draft creation and rendering shows up as a stale row — acceptable; the user can remove the line.

- **D-48:** **Single `Order` table — status column distinguishes draft from submitted.** No separate `OrderDraft` table. Submit is one `UPDATE Order SET status = 'skickad', submittedAt = now(), submittedByUserId = ? WHERE id = ? AND status = 'utkast'`. Phase 4's `confirm` / `deliver` transitions follow the same pattern, just with different precondition + stamped columns. Matches how the brief vocabulary models the lifecycle (one entity progressing through statuses, not separate entities per status).

- **D-49:** **`Order.submittedAt` (`DateTime?`) + `Order.submittedByUserId` (`String?`) are stamped by the submit transition.** Both nullable while in `utkast`. The pair gives the demo a real audit trail for the Skickad transition before Phase 5's audit middleware lands. Phase 4 follows the precedent: `confirmedAt/By`, `deliveredAt/By`. The `submittedByUserId` FK to `User.id` is `onDelete: Restrict` (don't allow deleting a user who has historical Skickad orders); user-cascade decisions live in Phase 5 / v2.

- **D-62:** **`Order` columns total:** `id (cuid)`, `careUnitId`, `createdByUserId` (the draft's author; FK to `User.id`, `onDelete: Restrict`), `status (OrderStatus, default: utkast)`, `submittedAt (DateTime?)`, `submittedByUserId (String?)`, `deletedAt (DateTime?)` (Discard, mirrors Phase 2 D-33 soft-delete pattern), `createdAt (DateTime, default: now())`, `updatedAt (DateTime, @updatedAt)`. Indexes: `@@index([careUnitId, status])` (powers `GET /api/orders?status=utkast` per-vårdenhet), `@@index([careUnitId, createdAt])` (sort), `@@index([createdByUserId])` (future "my drafts" filter). No `@@unique` constraints — a vårdenhet can have many concurrent drafts.

- **D-63:** **`OrderLine` columns total:** `id (cuid)`, `orderId (FK, onDelete: Cascade)`, `careUnitMedicationId (FK, onDelete: Restrict — preserve order history if a med is removed from the catalog)`, `quantity (Int)` with Zod-level `int().positive()` validation, `createdAt`, `updatedAt`. Indexes: `@@index([orderId])` (load all lines for an Order), `@@index([careUnitMedicationId])` (Phase 4 will reuse this when locking stock rows). No `@@unique([orderId, careUnitMedicationId])` — letting the same med appear on two lines is fine for v1 (a future "merge duplicates" UI is v2; documented as a Phase 7 README note candidate).

### Draft Persistence Model

- **D-50:** **POST empty draft on compose-open.** Clicking "Ny beställning" on `/bestallningar` immediately POSTs an empty `Order { status: 'utkast', lines: [] }` and routes to `/bestallningar/<id>`. URL is shareable, refresh-safe, and crash-recoverable from the moment of intent. Orphan-draft cleanup (drafts with 0 lines older than N days) is a Phase 7 cron candidate; for v1, "Kasta utkast" (D-67) is the only cleanup path.

- **D-51:** **PATCH-as-you-go on each line operation.** Add-line / remove-line / quantity-change each hit the API immediately, with debounce **250 ms** on quantity edits (recommended; mirrors Phase 2 D-42 inline-threshold). The mental model is "the draft is always saved"; the URL always reflects truth; refresh never loses anything.

- **D-52:** **Quantity = optimistic; add-line / remove-line = pessimistic** (mirrors Phase 2 D-42 inline/sheet split). Quantity changes update the TanStack Query cache via `useMutation.onMutate` with rollback in `onError`; toast on rollback in Swedish ("Kunde inte uppdatera — försök igen"). Add-line and remove-line wait for the server response before re-rendering so the line list always matches the DB — cleaner than rollback animations on the line array.

- **D-53:** **Drafts surfaced in the `/bestallningar` page list.** Phase 3 ships the lightest possible "My drafts" list: `GET /api/orders?status=utkast` scoped to `req.user.careUnitId`, optionally further filtered to `createdByUserId === req.user.id` for "mine" (toggle deferred — for v1, all unit drafts are visible since a nurse may need to pick up a colleague's half-finished order). Each row links to `/bestallningar/<id>`. Sort: `createdAt DESC`. Columns/cards show: created-date, line count, total quantity, "Öppna" link. Phase 4 ORD-07 will expand this into a full status-filtered history with the other statuses + apotekare/admin actions.

### Submit-lock + 409 Contract

- **D-54:** **Service-layer atomic UPDATE with status precondition.** Every mutating service function (`addLineToOrder`, `updateOrderLine`, `removeOrderLine`, `submitOrder`, `softDeleteOrder`) issues Prisma `updateMany` (or `update` inside a `$transaction` for line ops) with `where: { id, status: 'utkast', deletedAt: null }` and inspects the affected `count`. If `count === 0`, throw `OrderLockedError` → mapped to HTTP 409 with the canonical envelope (D-19) using `code: 'order_locked'`. Race-free even under concurrent submit + edit from two tabs — TOCTOU window is zero. Phase 4's ORD-06 generalizes this to a `OrderTransitionError` that wraps `order_locked` + future `order_already_confirmed` / `order_already_delivered`.

- **D-55:** **Error envelope code = `'order_locked'`.** Body: `{ error: { code: 'order_locked', message: 'Beställningen kan inte ändras efter att den skickats.', details?: { status: 'skickad' } } }`. HTTP status 409. FE catches the code and surfaces a destructive toast with the message. Phase 4 introduces parallel narrow codes (`order_already_confirmed`, `order_already_delivered`) for those transitions; do NOT widen `order_locked` to cover them — keep one code per user-visible error.

- **D-56:** **Submit endpoint validates non-empty lines + positive quantities server-side.** `POST /api/orders/:id/submit` returns `422 validation_failed` with `code: 'validation_failed'` and `details: { reason: 'empty_order' | 'invalid_quantity', lineId?: string }` if `lines.length === 0` or any `line.quantity <= 0`. Validation happens before the atomic UPDATE so we don't burn a TX on a doomed submit. FE also disables the Submit button under the same predicate (defense-in-depth, Phase 1 D-15 / D-17 pattern); the BE is the security boundary, FE is UX. Soft-deleted CareUnitMedication references are NOT gated at Phase 3 submit — that's a Phase 4 concern when stock is actually consumed.

- **D-57:** **Submit response = full updated `Order` with embedded lines + `submittedAt` + `submittedByUserId`.** Mirrors Phase 2's "PATCH returns the updated row" pattern. FE's TanStack Query cache (`['order', id]`) updates atomically from the response with no second fetch; the post-submit screen shows the now-Skickad order with everything it needs offline. Also invalidates `['orders', { status: 'utkast' }]` (the drafts list) so the just-submitted draft disappears from the list view.

### Line-item Picker UX

- **D-58:** **Reuse Phase 2 `<Sheet>` + typeahead pattern for line picking.** A "Lägg till läkemedel" button at the bottom of the line list (or in a sticky footer toolbar on mobile) opens a `<Sheet>` (right-slide ≥md, bottom-sheet <md) hosting the typeahead. New component: `MedicationPickerSheet` in `apps/web/src/routes/bestallningar/`, copied from Phase 2's `MedicationSheet` pattern but stripped to pick-only mode (no create form, no "Skapa nytt"). Selecting a med closes the Sheet and POSTs the line with `quantity = 1`. Reuses Phase 2's typeahead BE endpoint logic indirectly — the picker calls a new `GET /api/orders/picker-options` endpoint (D-66).

- **D-59:** **Picker scope = per-vårdenhet `CareUnitMedication` only** (active, `deletedAt: null`). The picker endpoint `GET /api/orders/picker-options?q=&limit=20` searches `CareUnitMedication` joined to `Medication`, filtered to `careUnitId = req.user.careUnitId` and `deletedAt: null`, using `ILIKE` on `Medication.name` and `Medication.atcCode` (reuses pg_trgm + GIN index Phase 2 added). Returns up to 20 rows of `{ careUnitMedicationId, name, atcCode, form, strength, currentStock, lowStockThreshold }`. You can only order what your unit stocks; expanding to NPL fallback is deferred (a Phase 7 README note candidate).

- **D-60:** **Quantity input = number input with −/+ stepper buttons.** Layout: `[ − ] [ <input type="number"> ] [ + ]`. Stepper buttons are 44 × 44 px (≥md and <md alike) per UI-SPEC touch-target floor. Long-press on the stepper auto-repeats (250 ms initial delay, 100 ms repeat); accessible label `Öka antal` / `Minska antal`. Input enforces `min=1`, `step=1`; iOS surfaces the number keyboard via `inputMode="numeric"`. PATCH on blur or after the 250 ms debounce (D-51) — whichever fires first.

- **D-61:** **Picker rows show currentStock + `<LowStockBadge>` inline.** Each typeahead result row renders: `{ name }` · `{ atcCode }` · `{ form }` · `Lager: {currentStock}` `[LowStockBadge if currentStock < lowStockThreshold]`. Reuses Phase 2's `<LowStockBadge>` component verbatim. No default filter — nurse can browse anything; the badge surfaces the demo-relevant signal without railroading the use case.

### Claude's Discretion

- **D-64:** Permission keys widening. Append to `packages/shared/src/contracts/permissions.ts` `ACTION_KEYS`: `'order:read'` (all 3 roles), `'order:create'`, `'order:update'`, `'order:submit'`, `'order:delete'` (all 3 roles per REQUIREMENTS.md ORD-01..03 which has no role restriction). `PERMISSIONS` map in `apps/api/src/auth/permissions.ts` extends accordingly. Phase 4 will add `'order:confirm'` and `'order:deliver'` restricted to `apotekare` + `admin`. The TS `Record<ActionKey, Role[]>` enforces drift-prevention (D-15).
- **D-65:** API route layout — `apps/api/src/routes/orders/{index.ts, create.ts, list.ts, get.ts, lines.ts, submit.ts, delete.ts, pickerOptions.ts}` mirrors the Phase 2 `medications/` directory structure. `lines.ts` registers `POST/PATCH/DELETE /api/orders/:id/lines[/:lineId]` because they share preHandlers + the order-lock guard.
- **D-66:** Service file `apps/api/src/services/order.service.ts` with every exported function taking `careUnitId` as the first arg (D-16 pattern). Internal helper `assertOrderEditable(careUnitId, orderId)` runs the atomic UPDATE precondition for line mutations.
- **D-67:** "Kasta utkast" affordance — destructive button (left-aligned in the compose-view footer, `variant="destructive"`) opens an `<AlertDialog>` ("Kasta detta utkast?" / "Utkastet tas bort permanent."), then `DELETE /api/orders/:id` soft-deletes via `deletedAt` (mirrors Phase 2 D-33). Lists filter `deletedAt: null`. No "trash bin" UI in Phase 3 (Phase 7 polish candidate, like Phase 2's restore).
- **D-68:** Submit landing UX — stay on `/bestallningar/<id>`; the page re-renders with a `<StatusPill status="skickad">` (badge component re-uses the `<RoleBadge>` primitive pattern but in `<OrderStatusPill>`) and a banner "Beställningen är skickad till apotekare." plus a "Tillbaka till beställningar" link. No auto-redirect — gives the user time to confirm what shipped.
- **D-69:** TanStack Query keys — `['orders', { status: 'utkast' }]` for the drafts list, `['order', id]` for single-order detail, `['order-picker', q]` for the typeahead. Submit response uses `queryClient.setQueryData(['order', id], response)` for cache hydration + invalidates `['orders', ...]` lists.
- **D-70:** Empty-state copy strings (Swedish, locked):
  - `/bestallningar` empty state heading: `Inga utkast ännu`
  - `/bestallningar` empty state body: `Skapa en ny beställning för att komma igång.`
  - `/bestallningar` new-order button: `Ny beställning`
  - `/bestallningar/<id>` empty-lines body: `Lägg till läkemedel för att börja.`
  - Picker empty result: `Inget läkemedel matchade.` (no "Skapa nytt" — that lives in Phase 2's medication add flow)
  - Submit button: `Skicka beställning`
  - Discard button: `Kasta`
  - Discard confirm title: `Kasta detta utkast?`
  - Discard confirm body: `Utkastet tas bort permanent.`
  - Cancel button (in dialogs): `Avbryt`
  - Submit confirmation banner: `Beställningen är skickad till apotekare.`
  - Toast on save success (line ops): `Sparat`
  - Toast on save error (line ops): `Kunde inte spara — försök igen.`
  - 409 toast: `Beställningen kan inte ändras efter att den skickats.`
- **D-71:** Mobile layout for `/bestallningar/<id>` compose view — sticky footer (positioned above the bottom tab bar via `env(safe-area-inset-bottom)` + the 56 px tab-bar offset from UI-SPEC) containing line count, total quantity, "Lägg till läkemedel", and "Skicka beställning". Lines stack vertically as cards; each card has a 44 px+ touch target on the trash icon. On ≥md, lines render as `<table>` rows, footer becomes a right-aligned summary bar above the action buttons.
- **D-72:** Drafts list (`/bestallningar`) layout — same `<table>` (≥md) / cards (<md) split as Phase 2 D-10/D-34. Columns: "Skapad" (`formatRelative(createdAt)`), "Rader" (count), "Total" (sum of quantities), "Skapad av" (`User.name`), "Öppna" link. Card variant stacks the same fields with the link as the whole card affordance.
- **D-73:** Tests — vitest BE integration suite `apps/api/test/orders.integration.test.ts` covers: (1) create empty → add-line → patch-quantity → submit happy path, asserting status `utkast → skickad`, `submittedAt` is set, response is full Order; (2) 409 on edit-after-submit (every line endpoint + submit again); (3) 422 on submit with empty lines or `quantity <= 0`; (4) careUnit scoping (user from CareUnit A cannot read/edit an order in CareUnit B → 404, not 403, to avoid leaking existence); (5) draft list returns only `status: utkast`, scoped to careUnit. FE component tests in `apps/web/src/routes/bestallningar/__tests__/`: drafts-list rendering + empty state, compose view + line add/remove/quantity edit, submit button predicate (disabled when lines empty), `MedicationPickerSheet` typeahead behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project framing & scope
- `.planning/PROJECT.md` — Locked stack + Key Decisions table (TS+React+Vite+TanStack Query+Tailwind+shadcn, Node+TS+Fastify, Postgres+Prisma, Vitest, Docker Compose). **The Key Decisions table is binding** — do not relitigate.
- `.planning/REQUIREMENTS.md` §"Order Flow" — REQ-IDs ORD-01, ORD-02, ORD-03 with full acceptance language. **The reviewable acceptance criteria for this phase.**
- `.planning/ROADMAP.md` §"Phase 3: Draft Orders" — Goal (user-story form), the 4 success criteria, mode (mvp), Requirements list.

### Phase 1 decisions inherited (carry forward, do not re-decide)
- `.planning/phases/01-foundation-auth/01-CONTEXT.md` D-01..D-19 — **all locked**. Especially:
  - **D-08:** Zod schemas in `packages/shared/src/contracts/*.ts` are the FE↔BE contract. `order.ts` joins `me.ts`, `login.ts`, `medication.ts`.
  - **D-15:** `PERMISSIONS: Record<ActionKey, Role[]>` map + Fastify `preHandler` factory. Phase 3 extends with `order:read/create/update/submit/delete` (D-64).
  - **D-16:** Service-layer Prisma access; `careUnitId` is the FIRST argument on every service function. Locks all `order.service.ts` signatures.
  - **D-17:** `useAuth()` + `<Can action="…">` + `useCan(action)` on the FE. New-order button, line ops, submit, discard all gated.
  - **D-19:** Canonical error envelope `{ error: { code, message, details? } }`. Phase 3 introduces code: `order_locked` (409, D-55). Reuses: `unauthenticated`, `forbidden`, `not_found`, `validation_failed`.
- `.planning/phases/01-foundation-auth/01-UI-SPEC.md` — Design system (shadcn `new-york` + slate), spacing scale (4 px base + `p-3` / `p-5` extensions), typography, touch targets (≥44 px — D-60 stepper buttons enforce this), bottom-tab-bar dimensions (56 px + safe-area-inset — D-71 sticky-footer must clear it).

### Phase 2 decisions inherited (carry forward, do not re-decide)
- `.planning/phases/02-medication-catalog/02-CONTEXT.md` D-20..D-45 — **all locked**. Especially:
  - **D-27 / D-28:** `Medication` (global NPL) + `CareUnitMedication` (per-vårdenhet stock+threshold+soft-delete) data model. OrderLine FK targets CareUnitMedication (D-47).
  - **D-30:** Soft-deleted CareUnitMedications transparently restore on re-add — informs the Phase 3 picker filter (`deletedAt: null`).
  - **D-33:** Always-soft-delete pattern. Phase 3 mirrors on `Order.deletedAt` for the Discard affordance (D-67).
  - **D-34:** shadcn `<Sheet>` for create/edit forms; right-slide ≥md, bottom-sheet <md. Phase 3 reuses for the `MedicationPickerSheet` (D-58).
  - **D-39:** `<LowStockBadge>` component shape — reused inside the picker rows (D-61).
  - **D-42:** Mixed optimistic/pessimistic split — Phase 3 mirrors: quantity edits optimistic, line add/remove pessimistic (D-52).
  - **D-44 / D-45:** `pg_trgm` + GIN index on `lower(Medication.name)`. Phase 3 picker endpoint reuses this index (D-59).

### Existing code patterns (Phase 1+2 lay the foundation Phase 3 builds on)
- `apps/api/prisma/schema.prisma` — Existing models: `CareUnit`, `User`, `Session`, `Medication`, `CareUnitMedication`. Phase 3 adds `Order`, `OrderLine`, enum `OrderStatus`.
- `apps/api/src/services/medication.service.ts` — Service-layer pattern (D-16): `careUnitId` first arg, `prisma` from `../db/client.js`. Mirror for `order.service.ts`.
- `apps/api/src/routes/medications/{list,get,create,update,delete,search}.ts` — Route patterns with `withTypeProvider<ZodTypeProvider>()`, preHandler chain, response schemas. Mirror for `routes/orders/*.ts`.
- `apps/api/src/auth/permissions.ts` — `PERMISSIONS` map. Extend with `order:*` entries (D-64).
- `apps/api/src/auth/requireSession.ts` and `requirePermission.ts` — preHandlers reused as-is on all order routes.
- `packages/shared/src/contracts/permissions.ts` — `ACTION_KEYS` literal tuple. Append the five order keys; `actionKey` Zod enum auto-updates.
- `packages/shared/src/contracts/medication.ts`, `me.ts`, `login.ts`, `error.ts` — Zod schema patterns. Mirror in `order.ts`.
- `packages/shared/src/constants/orderStatus.ts` — Already exists. **Reuse the `ORDER_STATUSES` tuple + `orderStatusEnum` Zod schema verbatim** as the single source of truth for the Prisma enum and contract validation.
- `apps/web/src/routes/bestallningar/BestallningarPage.tsx` — Stub `<EmptyStateCard icon={ClipboardList} heading="Beställningar" />`. Replaces with the drafts-list page in Slice 2.
- `apps/web/src/components/{EmptyStateCard,RoleBadge,NplBadge,LowStockBadge,InlineEditThreshold}.tsx` — Reuse where applicable (`EmptyStateCard` for empty drafts list; `LowStockBadge` in the picker per D-61; `RoleBadge` pattern for the new `<OrderStatusPill>`).
- `apps/web/src/auth/*` — `useAuth`, `<Can>`, `useCan` — reuse for RBAC gating on every order mutation surface.
- `apps/api/src/routes/medications/search.ts` — Reference for the picker endpoint's pg_trgm + careUnitId filtering pattern.

### Brief (interview source-of-truth — local only, not in repo CI)
- `local/intervju-testcase-1-1-.pdf` §2.1 (mandatory features: multi-line order, status machine), §3 (deliverables), §5 (evaluation weights — code quality + data model ★★★★★/★★★★), §6 (live-interview questions; Phase 3 doesn't ship the §6 concurrency answer — that's Phase 4 STK-02 — but must not block it; D-47/D-63 keep that path clean). **Local-only PDF; PROJECT.md + REQUIREMENTS.md are the committed mirror.**

### Tooling / harness
- `CLAUDE.md` — Tooling rules, GSD workflow expectations, stack constraints.
- `.planning/STATE.md` — Current phase progress.
- `.planning/config.json` — Workflow toggles (sequential, plan-check on, verifier on, per-phase research disabled).

No external ADRs or SPEC.md exist for Phase 3 — implementation decisions captured above (D-46..D-73) are the canonical record.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Phase 1 + 2 shipped a working monorepo with auth, RBAC, medication catalog, and a low-stock pattern. Phase 3 extends, doesn't rebuild:

- **Prisma client + db helpers** (`apps/api/src/db/client.ts`) — wired. Phase 3 only adds models, a migration, and a new enum.
- **Auth middleware chain** (`apps/api/src/auth/requireSession.ts`, `requirePermission.ts`) — composable preHandlers; Phase 3 routes declare `preHandler: [requireSession, requirePermission('order:create')]`.
- **Zod type provider** (`fastify-type-provider-zod`) — configured; Phase 3 routes use `r.post<...>(...)` with `schema: { body, response }`.
- **`packages/shared` build chain** — set up; add `contracts/order.ts` (Zod schemas) and reuse `constants/orderStatus.ts` verbatim.
- **`<EmptyStateCard>`** — reuse for the empty drafts list ("Inga utkast ännu") and the empty-lines compose-view state ("Lägg till läkemedel för att börja.").
- **`<LowStockBadge>`** — reuse inside `MedicationPickerSheet` picker rows (D-61).
- **`<RoleBadge>` pattern** — mirror for a new `<OrderStatusPill>` component (don't reuse `<RoleBadge>` directly).
- **`useAuth` / `<Can>` / `useCan`** — RBAC source of truth; Phase 3 wires the new `order:*` keys through them.
- **TanStack Query setup** — `QueryClient` at app root; Phase 3 adds `['orders', filters]`, `['order', id]`, `['order-picker', q]` query keys (D-69).
- **React Router v7 data mode** — register a child route `bestallningar/:id` under the existing `/bestallningar` layout; the `BestallningarPage` becomes the index route.
- **App shell with `/bestallningar` already in the tab bar / sidebar nav** — no nav changes needed in Phase 3.
- **`fastify-type-provider-zod` + Zod-as-contract precedent** — Phase 2 `medication.ts` is the closest template for `order.ts`.

### Established Patterns (Phase 1+2 → Phase 3 inheritance)

- **Service-layer Prisma access, `careUnitId` first arg** (D-16). Every Phase 3 service function: `function getOrder(careUnitId: string, orderId: string)`, `function addLineToOrder(careUnitId: string, orderId: string, line: {...})`. Routes call services; routes never touch Prisma directly.
- **Zod schemas in shared, inferred TS types** (D-08). `orderCreateRequest`, `orderResponse`, `orderListItem`, `addLineRequest`, `updateLineRequest`, `submitResponse`. FE consumes via `z.infer<typeof ...>`.
- **Canonical error envelope** (D-19). Phase 3 introduces `order_locked` (409, D-55). Reuses: `unauthenticated` (401), `forbidden` (403), `not_found` (404 — also for cross-careUnit access per D-73 to avoid existence leaks), `validation_failed` (422).
- **Permission map drift-prevention** (D-15). `Record<ActionKey, Role[]>` type-completeness forces an entry for every key — adding `order:submit` in `packages/shared` without updating the BE map is a compile error.
- **AuthGate + Can/useCan pair** (D-13, D-17). All Phase 3 routes live under `<AuthGate>`; mutations gate via `<Can>` (UI hide/disable) + `requirePermission` (BE 403). Defense in depth.
- **Mobile-first responsive switching** (D-10, UI-SPEC). Drafts list page + compose view: `<table>` at `≥md`, mapped `<div>` cards `<md`. Same data, same shape, two layouts.
- **Mixed optimistic/pessimistic mutation pattern** (D-42). Phase 3 mirrors: quantity = optimistic, add/remove line = pessimistic (D-52).
- **Soft-delete on a status-bearing entity** (D-33, Phase 2 CareUnitMedication). Phase 3 mirrors on `Order.deletedAt` (D-62 / D-67).

### Integration Points

- **`/me` response widens** — `permissions: ActionKey[]` includes the new `order:*` keys (D-64). Existing `useAuth().can(action)` works without changes.
- **Bottom tab bar / sidebar nav** — `<NavItem to="/bestallningar" icon={ClipboardList} label="Beställningar" />` already wired in Phase 1 shell; no changes.
- **`prisma migrate dev`** — Phase 3 ships migration `0004_order_flow_drafts` (timestamped name) adding `OrderStatus` enum + `Order` + `OrderLine` models. Phase 2's migrations are the starting point.
- **Seed script** (`apps/api/prisma/seed.ts`) — currently seeds 3 users + 1 vårdenhet + 43 538 Medications + CareUnitMedications. Phase 3 extends to seed **one in-flight draft order** for `sjukskoterska@example.test` (3-line, all on low-stock items) so the demo opens with a realistic state. Idempotent via existence check on `(careUnitId, createdByUserId, status='utkast', deletedAt=null)`. (OPS-01 — "at least one in-flight order" — is Phase 7, but Phase 3 ships the seed for the in-flight-draft case as a nice-to-have.)
- **Docker Compose** (`docker-compose.yml`) — no service changes; api still runs migrations + seed on start.
- **Phase 4 hook:** `OrderLine.careUnitMedicationId` index is sized to let Phase 4 add `SELECT … FOR UPDATE` on the per-CareUnitMedication lock path (STK-02) without a fresh index. The `submittedAt` / `submittedByUserId` columns establish the `confirmedAt/By` / `deliveredAt/By` column-pair pattern Phase 4 mirrors.
- **Phase 5 hook:** Service-layer mutation pattern (one function per mutation, taking `careUnitId` + actor info via service args) means Phase 5's audit middleware can wrap services without touching Phase 3 code.

</code_context>

<specifics>
## Specific Ideas

- **Swedish UI vocabulary** (continued from Phase 1 D-13 / Phase 2 D-70, locked here):
  - Page heading (`/bestallningar`): `Beställningar`
  - Page heading (`/bestallningar/<id>` while utkast): `Nytt utkast` (no id-ish title — drafts don't have an order number yet)
  - Page heading (`/bestallningar/<id>` while skickad): `Beställning · Skickad`
  - New-order button: `Ny beställning`
  - "Add line" button: `Lägg till läkemedel`
  - Submit button: `Skicka beställning`
  - Discard button: `Kasta`
  - Picker placeholder: `Sök läkemedel…`
  - Footer summary (mobile): `{N} rader · totalt {sum}`
  - Status pill text uses `ORDER_STATUS_LABELS` from `packages/shared/src/constants/orderStatus.ts` verbatim.
  - See D-70 for the full empty-state + toast + confirm-dialog copy block.
- **Picker affordance from low-stock context.** Each picker row showing `Lager: 3` with a `<LowStockBadge>` is the most demo-relevant moment in the phase — surfaces the "stock awareness during ordering" loop directly. Resist the urge to also filter by below-threshold default (we rejected that in D-61); let the badge do the work.
- **`docker compose up` is still the golden command.** Phase 3 must not break it; new migrations are additive and the seed extension (one draft) is < 100 ms additional cost.
- **§6 prep notes:**
  - "Two nurses ordering simultaneously" — Phase 3 doesn't decrement stock yet (that's Phase 4 STK-01/02). But the OrderLine FK shape (D-47, D-63) keeps the `SELECT … FOR UPDATE` lock path clean: Phase 4 will `SELECT ... FOR UPDATE` on `CareUnitMedication` rows referenced by the order, decrement, and commit. The index on `OrderLine.careUnitMedicationId` (D-63) is the join Phase 4 walks.
  - "Scale to 50 vårdenheter" — Order is `careUnitId`-scoped from day 1 (D-62 indexes include `[careUnitId, status]`); a new vårdenhet adds zero schema work and inherits ordering on its first onboard.
  - "Retrofitting auth" — Phase 3 inherits all of Phase 1's RBAC + service-layer scoping. No retrofit needed; the new `order:*` keys plug into the existing infrastructure.
- **Demo path on first `docker compose up`** — seeded draft for `sjukskoterska@example.test` is visible on `/bestallningar` immediately; the user can open it, edit a quantity (optimistic), submit (status flips to Skickad in real time), then try to edit again → toast surfaces `order_locked`. Demonstrates ORD-01, ORD-02, ORD-03 + the 409 contract in 30 seconds.

</specifics>

<deferred>
## Deferred Ideas

- **OrderLine snapshot columns** (`nameSnapshot`, `strengthSnapshot`, etc.) — Phase 4 introduces these at the deliver-transition point when stock is decremented and the line truly freezes. Phase 3 reads through to live CareUnitMedication + Medication data.
- **Per-user "mine vs all unit drafts" toggle** on `/bestallningar` — Phase 3 ships unit-wide visibility (nurses may pick up a colleague's half-finished draft). A toggle/dropdown is a Phase 4 polish candidate once the full status history view lands.
- **Orphan draft cleanup cron** — drafts with 0 lines + age > N days. Phase 7 cron candidate.
- **"Tidigare utkast" / trash-bin restore UI** for soft-deleted drafts — Phase 7 polish (parallel to Phase 2's "restore deleted medication" deferral).
- **Multi-tab edit conflict UX** — if two browser tabs of the same nurse edit the same draft, the second's PATCH may succeed or 409 depending on submit timing. v2 idea (real-time refetch / WebSocket).
- **Bulk-edit line quantities** — keyboard shortcuts, mass-multiplier, etc. Power-user features for v2.
- **Order notes / freetext field on `Order`** — not in REQUIREMENTS.md ORD-01..03. v2 candidate.
- **NPL fallback in the picker** — typeahead expand to global NPL when zero CareUnitMedication hits. Phase 7 polish candidate.
- **Order numbers / display IDs** — Phase 3 uses cuid for `Order.id`. A human-readable `displayId` (e.g., `BST-2026-00042`) for the post-submit screen is v2; for v1 the URL-ish cuid is acceptable.
- **Email / push notification on submit** — out-of-scope per PROJECT.md (in-app banner already deferred to Phase 6 NTF).
- **Audit-event writes on Phase 3 mutations** — Phase 5's audit middleware retrofits all mutations (including Phase 3's) without touching Phase 3 code. Phase 3 ships nothing audit-related; service-layer pattern (D-66) keeps the middleware retrofit clean.
- **Rate limiting on `/api/orders` mutation endpoints** — same deferred posture as Phase 1 `/auth/login` (Phase 7 "with more time" README note).
- **OPS-01 "at least one in-flight order" seed for each downstream status (Skickad, Bekräftad, Levererad)** — Phase 4 extends the seed once those statuses exist. Phase 3 only seeds the Utkast representative.

</deferred>

---

*Phase: 3-Draft Orders*
*Context gathered: 2026-05-21*
