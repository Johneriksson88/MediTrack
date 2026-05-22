---
phase: 05-audit-log
plan: 02
subsystem: audit
tags: [audit, admin, ui, cursor-pagination, infinite-query, url-as-state, read-api]

requires:
  - phase: 05-audit-log
    plan: 01
    provides: AuditEvent table + Prisma $extends middleware + ALS request context + audit:read permission + shared Zod contracts (auditEventResponse, auditEventListQuery, auditEventListResponse, auditFiltersResponse) + Swedish label maps (AUDIT_ACTION_LABELS, AUDIT_ENTITY_TYPE_LABELS)
  - phase: 01-foundation-auth
    provides: D-12 RoleRoute admin gate already wrapping /admin/audit, D-15 PERMISSIONS map drift prevention, D-19 canonical error envelope, requireSession + requirePermission preHandlers, fetchJson + ApiError
  - phase: 02-medication-catalog
    provides: D-39/D-42 URL-as-state pattern, LakemedelFilter combobox precedent
  - phase: 03-draft-orders
    provides: D-65 file-per-endpoint pattern, D-69 TanStack query-key convention, OrderStatusPill chip primitive shape
  - phase: 04-confirm-deliver-stock
    provides: D-82 status-tab strip overflow-x-auto precedent (mobile filter strip), BestallningarPage OrdersTable/OrdersCardList responsive switch
provides:
  - GET /api/audit/events (cursor-paginated, admin-only) per AUD-02
  - GET /api/audit/filters (60s memoized combobox source, admin-only) per D-103 + T-05-10 mitigation
  - audit.service.ts with documented D-16 EXCEPTION header (cross-tenant admin read)
  - /admin/audit page replaces Phase 1 EmptyStateCard stub — three combobox filters, responsive table/card (md+ vs <md), expand-on-click row affordance, Fält/Före/Efter diff panel, requestId-group chip, Kopiera permalink button, cursor pagination via TanStack useInfiniteQuery (first in repo)
  - Reusable Audit chip primitives (AuditActionChip, AuditEntityTypeChip, RequestIdGroupChip)
  - auditDiffSummary helper (computeChangedKeys + diffSummary)
affects: [05-03-ui-and-tests, future-permalink-deep-link-with-expand-state, future-per-careunit-admin-view]

tech-stack:
  added:
    - "@tanstack/react-query useInfiniteQuery (first use in repo — D-105 cursor pagination)"
  patterns:
    - "Cursor pagination: base64-encoded {createdAt, id}; deterministic OR-pair where clause for same-millisecond tiebreak; take: limit+1 to detect hasMore"
    - "Module-scope memoization with TTL for read-only filter sources (60s) — pairs with TanStack staleTime on the FE for layered DoS mitigation"
    - "Diff at read time (D-95): full before/after snapshots stored at write time; UI intersects keys with JSON.stringify equality and renders only changes — survives schema drift"
    - "Documented D-16 exception header style: audit.service.ts mirrors auth.service.ts's documented-exception pattern for the no-careUnitId-first carve-out"

key-files:
  created:
    - "apps/api/src/services/audit.service.ts"
    - "apps/api/src/routes/audit/list.ts"
    - "apps/api/src/routes/audit/filters.ts"
    - "apps/api/src/routes/audit/index.ts"
    - "apps/web/src/components/AuditActionChip.tsx"
    - "apps/web/src/components/AuditEntityTypeChip.tsx"
    - "apps/web/src/components/RequestIdGroupChip.tsx"
    - "apps/web/src/routes/admin/AuditFilterBar.tsx"
    - "apps/web/src/routes/admin/AuditTable.tsx"
    - "apps/web/src/routes/admin/AuditCardList.tsx"
    - "apps/web/src/routes/admin/AuditEventCard.tsx"
    - "apps/web/src/routes/admin/AuditDiffPanel.tsx"
    - "apps/web/src/routes/admin/useAuditEventsQuery.ts"
    - "apps/web/src/routes/admin/useAuditFiltersQuery.ts"
    - "apps/web/src/routes/admin/auditDiffSummary.ts"
  modified:
    - "apps/api/src/app.ts (+ auditRoutes registration after orderRoutes)"
    - "apps/web/src/components/EmptyStateCard.tsx (widened with optional `body?: string` prop, defaults to Phase 1 stub copy)"
    - "apps/web/src/routes/admin/AuditPage.tsx (replaces EmptyStateCard stub with the real page)"

key-decisions:
  - "FilterBar owns setSearchParams (Lakemedel pattern); page reads URL via useSearchParams + exposes onFiltersChanged callback that collapses expanded rows. The setSearchParams verification grep in the plan locked this split — the FilterBar is the URL-writer, the page is the URL-reader."
  - "AuditTable + AuditCardList compute siblingCount via O(N) scan of the loaded events array per render; acceptable for v1's page-size 50. A more sophisticated map cached at the parent level would be a v2 optimization if 50 ever rises."
  - "AuditEventCard restructured: <button> wraps only the summary header (chip row + actor + time + diff summary); the expanded AuditDiffPanel sits OUTSIDE the <button> inside the card <div> frame. Without this split the panel's internal <Link> (RequestIdGroupChip) and <Button> (Kopiera permalink) would be nested interactive elements (invalid HTML, weird focus behavior on mobile)."
  - "EmptyStateCard widened with optional `body?: string` (defaults to Phase 1 stub copy). Three existing call sites stay unchanged; Phase 5's AuditPage passes the bespoke 'Händelser visas här när någon ändrar något i systemet.' copy. Lower-risk than adding a parallel `AuditEmptyStateCard` and easier to grep-discover."
  - "ValidationFailedError ('invalid_quantity' reason) reused for malformed cursor decode failures. The 'invalid_quantity' reason label is slightly off-domain but the error envelope catalog is closed (D-19 — no new error codes in Phase 5 per the threat-model contract). Surfaces as HTTP 422 with the validation_failed code; the inner reason is opaque to the FE."

patterns-established:
  - "First use of TanStack useInfiniteQuery in the repo — establishes the pattern for any future cursor-paginated list (Phase 6 categorization predictions, Phase 7 retention listings if v2 lands)"
  - "Read-only service with documented D-16 exception header — template for any future cross-tenant admin endpoint"
  - "Module-scope memoized read source with explicit _resetCache test hook — pattern for any expensive groupBy-driven combobox source"
  - "Card-with-button-summary + outside-button-expanded-panel — the right shape for any future expand-on-tap card that contains interactive elements in the expanded slot"

requirements-completed: [AUD-02]

duration: ~13min
completed: 2026-05-22
---

# Phase 5 Plan 02: Read API + Admin UI Summary

**Admin browses `/admin/audit` in reverse-chrono order, filters by user/entity/action via three combobox dropdowns, expands a row to see the Fält/Före/Efter diff with requestId-group chip + permalink — full forensics surface consuming Plan 01's audit_events pipeline. Cursor pagination via TanStack `useInfiniteQuery` (first in repo) gives the §6 scaling answer ("offset shifts under concurrent inserts; cursor is stable") tangible proof.**

## Performance

- **Duration:** ~13 minutes
- **Started:** 2026-05-22T18:36:11Z
- **Completed:** 2026-05-22T18:49:00Z
- **Tasks:** 3 / 3
- **Files created:** 15
- **Files modified:** 3

## Accomplishments

- **`GET /api/audit/events` live** with cursor pagination, deterministic `createdAt DESC, id DESC` tiebreak on same-millisecond rows, single batched actor JOIN avoiding N+1, and `requirePermission('audit:read')` (admin-only) returning the canonical 403 envelope for sjuksköterska/apotekare.
- **`GET /api/audit/filters` live** with module-scope 60s memoization + parallel groupBy queries for actors/entityTypes/actions; Swedish-locale sort. FE staleTime: 60_000 pairs with the BE memo for the T-05-10 DoS mitigation contract.
- **audit.service.ts ships the documented D-16 EXCEPTION header verbatim** — mirrors auth.service.ts's documented-exception style so future contributors don't accidentally "fix" the missing careUnitId-first arg. The header explicitly cites AUD-02's verbatim "admin browses the audit log… in reverse-chronological order, filterable by user, entity type, and action" — no per-tenant scope, by design.
- **`/admin/audit` page replaces the Phase 1 EmptyStateCard stub** with the full forensics surface: heading (`Granskningslogg`), three Popover+Command comboboxes (Användare/Entitetstyp/Åtgärd), responsive table/card switch (`hidden md:block` / `block md:hidden`), expand-on-click rows with chevron rotation + ARIA controls, Fält/Före/Efter diff panel with requestId-group chip + Kopiera permalink button + sonner toast, cursor-paginated `Läs in fler` / `Läser in fler händelser...` / `Inga fler händelser att visa.` footer.
- **Three chip primitives** (`AuditActionChip` / `AuditEntityTypeChip` / `RequestIdGroupChip`) mirror Phase 1+3 chip discipline. ACTION_CLASS covers all 11 actions with the locked UI-SPEC §6 palette (creation emerald, lifecycle blue/amber/emerald, removal destructive-tint, auth slate + destructive for `auth.login_failed`). Defensive fallbacks render unknown future actions as neutral slate.
- **First `useInfiniteQuery` in repo** — `useAuditEventsQuery` with `initialPageParam: null`, `getNextPageParam: (lastPage) => lastPage.nextCursor`. The page consumes via `data.pages.flatMap((p) => p.events)`. Query key `['audit', 'events', filters]` per D-69.
- **Demo path works end-to-end:** Admin logs in → /admin/audit shows reverse-chrono list → clicking the seeded Plan 01 audit events expands the row → diff panel renders the Fält/Före/Efter triplet → clicking the requestId-group chip on the deliver event's panel filters the list to the 1+N sibling cohort → Kopiera permalink writes the URL to clipboard and fires the success toast → Rensa filter clears all URL params and re-runs the query.
- **Zero regressions:** API 81/81 vitest pass, web 82/82 pass, both packages clean on `tsc --noEmit`. All 14 Task 2 grep checks + 10 Task 3 grep checks satisfied.

## Task Commits

Each task was committed atomically:

1. **Task 1: BE audit.service + GET /api/audit/events + GET /api/audit/filters + wiring** — `f2f5473` (feat)
2. **Task 2: Admin audit page — filter bar + responsive table/card + cursor pagination** — `c3651a5` (feat)
3. **Task 3: AuditDiffPanel + wire row expansion + permalink copy** — `3b3de1a` (feat)

**Plan metadata commit:** (to follow this Summary write — `docs(05-02): complete plan`)

## Files Created/Modified

### Created (15)

- `apps/api/src/services/audit.service.ts` — `listAuditEvents` (cursor-paginated, no careUnitId arg per D-16 exception) + `listAuditFilters` (60s module-scope memo). Header carries the verbatim D-16 EXCEPTION block; exported `_resetAuditFiltersCache` for future Plan 03 integration tests.
- `apps/api/src/routes/audit/list.ts` — admin-only `GET /api/audit/events`; preHandler order LOCKED `[requireSession, requirePermission('audit:read')]`.
- `apps/api/src/routes/audit/filters.ts` — admin-only `GET /api/audit/filters`; no body, returns `auditFiltersResponse`.
- `apps/api/src/routes/audit/index.ts` — barrel registrar (no `:id` collision; order free).
- `apps/web/src/components/AuditActionChip.tsx` — 11-action ACTION_CLASS map + AUDIT_ACTION_LABELS-driven render + defensive fallback.
- `apps/web/src/components/AuditEntityTypeChip.tsx` — uniform slate palette; entity type as metadata not state.
- `apps/web/src/components/RequestIdGroupChip.tsx` — clickable `<Link>` to `/admin/audit?requestId=<uuid>`; `Link2` icon + `Del av begäran <last8> · X händelser` template.
- `apps/web/src/routes/admin/AuditFilterBar.tsx` — three Popover+Command comboboxes, ghost `Rensa filter` button (visible only when any filter active), dismissible active-requestId chip. Owns `setSearchParams` directly (Lakemedel pattern). Mobile (<md): `overflow-x-auto` strip (Phase 4 D-82 precedent).
- `apps/web/src/routes/admin/AuditTable.tsx` — 6 columns (Tid / Användare / Entitet / Åtgärd / Diff / chevron) with locked widths; `tabIndex={0}` + `role="button"` + `aria-expanded` + `aria-controls`; Enter/Space toggles expansion; Tid wrapped in `<Tooltip>` with full ISO timestamp; expanded row renders `<TableRow><TableCell colSpan={6} bg-muted/30 ...>` host with `<AuditDiffPanel>` inside.
- `apps/web/src/routes/admin/AuditCardList.tsx` — `<md` card stack; pre-computes per-page sibling counts; threads them to each `AuditEventCard`.
- `apps/web/src/routes/admin/AuditEventCard.tsx` — card with summary `<button>` + outside-button expanded `<AuditDiffPanel>` (no nested interactive elements; valid HTML).
- `apps/web/src/routes/admin/AuditDiffPanel.tsx` — Fält/Före/Efter triplet table with CREATE/DELETE/UPDATE branches, value-type-aware rendering (font-mono for primitives, italic muted for null, `<pre>` for object/array), header with `<RequestIdGroupChip>` (when siblingCount > 1) + ISO timestamp, footer with `Kopiera permalink` button writing to clipboard via `navigator.clipboard.writeText` and firing sonner toast.
- `apps/web/src/routes/admin/useAuditEventsQuery.ts` — TanStack `useInfiniteQuery` (first in repo); D-69 query key.
- `apps/web/src/routes/admin/useAuditFiltersQuery.ts` — TanStack `useQuery` with `staleTime: 60_000`.
- `apps/web/src/routes/admin/auditDiffSummary.ts` — `computeChangedKeys` + `diffSummary` helpers shared between Table/CardList/DiffPanel.

### Modified (3)

- `apps/api/src/app.ts` — adds `auditRoutes` import + `await app.register(auditRoutes)` after `orderRoutes` per CONTEXT.md ordering. Inline comment: "Phase 5 — audit log read endpoints (admin-only)".
- `apps/web/src/components/EmptyStateCard.tsx` — widens with `body?: string` optional prop (defaults to Phase 1 stub copy `Den här vyn fylls i nästa fas.`). All three existing call sites unchanged; Phase 5 passes the bespoke `Händelser visas här när någon ändrar något i systemet.`.
- `apps/web/src/routes/admin/AuditPage.tsx` — REPLACES the Phase 1 stub (`<EmptyStateCard icon={ShieldCheck} heading="Admin" />`) with the full page orchestrator: URL-as-state read via `useSearchParams`, queries via `useAuditEventsQuery` + `useAuditFiltersQuery`, owns `expandedIds: Set<string>` threaded into Table/CardList, two distinct empty states ("Inga händelser ännu" via EmptyStateCard with `body`, vs. inline "Inga händelser matchade filtren."), pagination footer with `Läs in fler` button or end-of-list paragraph.

## Decisions Made

- **FilterBar owns `setSearchParams`; page exposes `onFiltersChanged` callback that resets expanded rows.** The plan's verification grep (`grep -q "setSearchParams" apps/web/src/routes/admin/AuditFilterBar.tsx`) locked this. The Lakemedel-style split keeps URL writes co-located with the controls that produce them; the page is the URL reader. The callback exists so the page can reset its expanded-rows set when filters change (a row the admin expanded might not be in the new result set).
- **`siblingCount` computed via O(N) scan of loaded events at the parent (Table/CardList) level.** For page-size 50, O(N²) worst case is 2,500 ops per render — sub-microsecond. A Map<requestId, count> cached at parent level is the natural shape; the children consume the lookup per render. A more memoized approach (useMemo across renders) is a v2 perf optimization if page-size ever rises.
- **`AuditEventCard` restructured to split `<button>` (summary) from outside-button expanded panel (`<AuditDiffPanel>`).** Without this split the expanded panel's `<Link>` (RequestIdGroupChip) and `<Button>` (Kopiera permalink) would be nested interactive elements — invalid HTML per the WHATWG spec, and React DevTools + screen readers + mobile Safari produce inconsistent focus + click behavior. The card frame `<div>` (with `bg-card border rounded-lg shadow-sm overflow-hidden`) hosts both the button and the panel; the button has `focus-visible:ring-inset` so the focus ring matches the card edge.
- **EmptyStateCard widened with optional `body?: string` prop instead of a parallel `AuditEmptyStateCard`.** Three existing callers (dashboard / lakemedel / bestallningar stubs and ComposeOrderPage) keep working unchanged because the parameter is optional with the original stub copy as default. Phase 5 AuditPage passes the bespoke body. Lower-risk than creating a sibling primitive (which would invite drift); easier to grep-discover ("EmptyStateCard" surfaces all empty-state usages including Phase 5's).
- **`ValidationFailedError` with `reason: 'invalid_quantity'` reused for malformed cursor decode failures.** D-19 is closed — no new error codes in Phase 5 per the threat-model contract. The 'invalid_quantity' reason label is slightly off-domain for a cursor parse failure but the BE catalog is a closed set and the FE catches on the outer `code` (`validation_failed`) — the inner reason is opaque to the consumer. The error surfaces as HTTP 422.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] `navigator.clipboard.writeText` was split across two lines by Prettier-style formatting, breaking the literal-string verification grep**

- **Found during:** Task 3 (verify step)
- **Issue:** The original implementation was:
  ```typescript
  navigator.clipboard
    .writeText(url)
    .then(...)
  ```
  Which produced 0 matches for `grep -q "navigator.clipboard.writeText"` — the literal substring spans a line break. The plan's verify block explicitly grep-checks this exact substring.
- **Fix:** Rewrote the call to keep `navigator.clipboard.writeText` on a single line by hoisting the promise to a local `const p`, then chaining `.then().catch()` on the next line.
- **Files modified:** `apps/web/src/routes/admin/AuditDiffPanel.tsx`
- **Verification:** `grep -c "navigator.clipboard.writeText" apps/web/src/routes/admin/AuditDiffPanel.tsx` returns `1`.
- **Committed in:** `3b3de1a` (Task 3)

**2. [Rule 2 — Missing Critical] AuditEventCard expanded panel rendered nested interactive elements inside a `<button>`**

- **Found during:** Task 3 (writing the panel-rendering wire-up before testing)
- **Issue:** Task 2's AuditEventCard structure wrapped the entire card (summary + expansion slot) in a `<button>`. When Task 3 rendered `<AuditDiffPanel>` inside the expansion slot, the panel's internal `<Link>` (RequestIdGroupChip → react-router-dom Link) and `<Button>` (Kopiera permalink) became nested interactive elements — invalid HTML per WHATWG and inconsistent across browsers (mobile Safari + screen readers produce surprising focus + click behavior).
- **Fix:** Restructured AuditEventCard so the `<button>` wraps ONLY the summary header (chip row, actor, time, diff summary); the expanded `<AuditDiffPanel>` sits outside the `<button>` inside a sibling `<div>` (still within the card frame). The card frame is now a plain `<div className="bg-card border rounded-lg shadow-sm overflow-hidden">`, and the button has `focus-visible:ring-inset` so the focus ring matches the card edge.
- **Files modified:** `apps/web/src/routes/admin/AuditEventCard.tsx`
- **Verification:** 82/82 web tests pass; no React DevTools warnings; the diff panel's internal Link + Button are now valid HTML.
- **Committed in:** `3b3de1a` (Task 3)

**3. [Rule 3 — Blocking] EmptyStateCard hardcoded the body text — Phase 5's "Inga händelser ännu" needed a bespoke body string**

- **Found during:** Task 2 (writing the AuditPage no-events-ever empty state)
- **Issue:** `EmptyStateCard` accepted only `{icon, heading}` with the body string hardcoded to `'Den här vyn fylls i nästa fas.'` (Phase 1 stub copy). UI-SPEC §1 locks Phase 5's "no events ever" body to `'Händelser visas här när någon ändrar något i systemet.'`. Without widening, AuditPage would either (a) display the wrong stub copy on a real empty-state surface or (b) render an inline card duplicate that drifts from the EmptyStateCard component over time.
- **Fix:** Added optional `body?: string` prop to `EmptyStateCardProps`; defaults to the Phase 1 stub copy so the three existing call sites (DashboardPage, ComposeOrderPage, BestallningarPage, plus the AuditPage stub before it was replaced) stay unchanged. The plan explicitly anticipated this — "the existing EmptyStateCard may need a `body?: string` prop added — if so, widen the component (one-line change)".
- **Files modified:** `apps/web/src/components/EmptyStateCard.tsx`
- **Verification:** All 82 web tests pass (no test exercises the hardcoded body text; the existing call sites use the default value).
- **Committed in:** `c3651a5` (Task 2)

---

**Total deviations:** 3 auto-fixed (1 bug, 1 missing critical, 1 blocking)
**Impact on plan:** All deviations are local to single files; none widen scope or alter the contracts established in Plan 01. The EmptyStateCard widening is purely additive (optional prop with default) and the AuditEventCard restructuring fixes a latent HTML-validity issue Task 2's structure introduced. The literal-substring fix is cosmetic — both formattings produce identical runtime behavior.

## Known Stubs

None — every component in this plan is wired end-to-end:
- Audit list endpoint serves real data from the Plan 01 audit_events table.
- Filter source endpoint returns real distinct actors/entityTypes/actions.
- Filter bar, table, cards, diff panel, requestId chip, and permalink button all consume / produce real data with no placeholder strings.
- The single "empty future-feature" location was the Phase 1 EmptyStateCard stub at /admin/audit, which this plan replaces with the real page.

## Threat Flags

None — Phase 5 Plan 02's threat model (`<threat_model>` T-05-04 cont. + T-05-08 + T-05-09 + T-05-10 + T-05-11 + T-05-SC) is unchanged. No new network endpoints beyond the two enumerated in the plan, no new auth paths, no new packages (T-05-SC: N/A), no schema changes outside what Plan 01 already shipped.

## Issues Encountered

- **Prettier line-break split breaking literal-string verification grep.** Took ~30 seconds to diagnose (`grep -c` showed 0 matches even though the code worked correctly). The fix was trivial — restructure the .writeText call onto a single line. The lesson: literal-substring greps in verification blocks should either match a substring tolerant of whitespace or be moved to AST-based assertions (a v2 tooling improvement).
- **Card-with-nested-interactive-elements caught during Task 3 review.** Not a runtime crash, but invalid HTML. The cleaner alternative (split button + outside-button panel) is straightforward; the Task 2 output was structurally fine until Task 3 added panel children, at which point the issue became visible. A v2 lint rule would catch this at write time.
- **Audit table's `data.pages.flatMap(...)` triggers a fresh array reference each render.** This means the page's `events` memo doesn't help React's reconciliation across pagination — but for page-size 50 with shallow row diffs, this hasn't materialized as a perf issue. A v2 optimization would memoize the flat-mapped events array more aggressively.

## User Setup Required

None — no external services or credentials introduced. The /admin/audit page works out of the box on `docker compose up` once Plan 01's seed audit-rows have populated the table.

## Self-Check

- **Created files verified on disk:**
  - `apps/api/src/services/audit.service.ts` — FOUND
  - `apps/api/src/routes/audit/list.ts` — FOUND
  - `apps/api/src/routes/audit/filters.ts` — FOUND
  - `apps/api/src/routes/audit/index.ts` — FOUND
  - `apps/web/src/components/AuditActionChip.tsx` — FOUND
  - `apps/web/src/components/AuditEntityTypeChip.tsx` — FOUND
  - `apps/web/src/components/RequestIdGroupChip.tsx` — FOUND
  - `apps/web/src/routes/admin/AuditFilterBar.tsx` — FOUND
  - `apps/web/src/routes/admin/AuditTable.tsx` — FOUND
  - `apps/web/src/routes/admin/AuditCardList.tsx` — FOUND
  - `apps/web/src/routes/admin/AuditEventCard.tsx` — FOUND
  - `apps/web/src/routes/admin/AuditDiffPanel.tsx` — FOUND
  - `apps/web/src/routes/admin/useAuditEventsQuery.ts` — FOUND
  - `apps/web/src/routes/admin/useAuditFiltersQuery.ts` — FOUND
  - `apps/web/src/routes/admin/auditDiffSummary.ts` — FOUND
- **Commits in git log:**
  - `f2f5473` (Task 1) — FOUND
  - `c3651a5` (Task 2) — FOUND
  - `3b3de1a` (Task 3) — FOUND

## Self-Check: PASSED

## Next Phase Readiness

- **Plan 03 (integration tests + ESLint rule + final hardening)** can now exercise the live BE+FE pipeline end-to-end. Specifically:
  - `audit.integration.test.ts` test #1 (end-to-end coverage) imports `progressOrderToBekraftad` from `orders.deliver.integration.test.ts` and asserts the 1+N sibling shape via `prisma.auditEvent.findMany({})`.
  - test #2 (grep): `git grep -nE 'prisma\.auditEvent\.(update|delete|deleteMany|updateMany|upsert)\b'` runs against the whole codebase including this plan's outputs — zero matches expected.
  - test #3 (DB-layer): `prisma.$executeRawUnsafe("UPDATE audit_events SET action='hacked' WHERE id=$1", id)` rejects with `permission denied for table "AuditEvent"` (SQLSTATE 42501 from Plan 01's BEFORE-trigger).
  - test #4 (redaction): login → assert `auth.login` audit row's `after` contains no `passwordHash` and no raw session id (resolveEntityId + AUDIT_ALLOWLIST in lockstep).
  - test #5 (RBAC): GET /api/audit/events as sjuksköterska (403), apotekare (403), admin (200) — exactly the path Plan 02 exercises.
  - ESLint `no-restricted-syntax` rule D-99: this plan introduces no `prisma.auditEvent.update*` / `delete*` / `upsert` calls — the rule will install cleanly on the existing codebase with zero violations.
  - A `_resetAuditFiltersCache()` helper is already exported from `audit.service.ts` so Plan 03 integration tests can flush the 60s memo without waiting.
- **No blockers carried forward.** API typecheck clean; 81/81 vitest pass. Web typecheck clean; 82/82 vitest pass. The /admin/audit page is feature-complete; the only remaining surface is Plan 03's test suite + the ESLint rule install.

---
*Phase: 05-audit-log*
*Plan: 02*
*Completed: 2026-05-22*
