# Phase 9: Dashboard Depth + Back-Nav - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Two FE-heavy improvements that surfaced from live use of the Phase 4/6/7 product. Both are pure surface polish on already-built data flows — no new schema, no migration, no AI dependency, no new audit actions.

1. **ORD-09 — Dashboard "Beställningar" card.** Add a sibling `<DashboardOrdersCard />` next to the existing `<DashboardLowStockCard />` at `/dashboard`. Content is role-scoped from the BE:
   - **`sjukskoterska`** sees `{egnaUtkast: {count, rows}, recentHistory: [...]}` — own drafts + the latest 5 non-utkast orders for the vårdenhet.
   - **`apotekare` / `admin`** sees `{skickadCount, skickadRows, bekraftadCount, bekraftadRows}` — Skickad-att-bekräfta + Bekräftad-att-leverera surfaces. Counts are the actionable signal; row previews (≤5) give context without forcing a tab navigation.
   Each row links to `/bestallningar/:id?from=<status>` (carrying the back-nav hint from ORD-10). Each count/section header links to `/bestallningar?status=<status>` to pre-select the matching tab.

2. **ORD-10 — Back-nav fix.** `Tillbaka till beställningar` on `ComposeOrderPage` currently always sends the user to the default `Utkast` tab (`<Link to="/bestallningar">` at lines 96, 124, 134, 161 of `ComposeOrderPage.tsx` + the `navigate('/bestallningar')` at line 413 after discard). Fix uses an `?from=<status>` URL search param on the detail route, validated against the `StatusTab` union, with a smart fallback to the order's own current status when the param is missing. Must work from tab clicks, deep links, AND the new dashboard card.

**In scope (Phase 9 only — REQ-IDs ORD-09, ORD-10):**

- **New `GET /api/dashboard/orders` endpoint.** Role-aware payload — service inspects `req.user!.role` and returns one of two response shapes (closed Zod discriminated union). Read-only, `requireSession` only (all three roles see the dashboard). Reuses `careUnitId`-first service pattern (D-16). Cache key on FE: `['dashboard', 'orders']`. Cache decoupled from `['orders', filters]` (the BestallningarPage cache).
- **New `apps/api/src/services/dashboard.service.ts:listDashboardOrdersForUser(careUnitId, userId, role)` function.** Branches on role:
  - `sjukskoterska` → returns `{egnaUtkast: {count, rows: top-5-own-drafts-DESC-by-createdAt}, recentHistory: top-5-non-utkast-DESC-by-createdAt}`.
  - `apotekare`/`admin` → returns `{skickad: {count, rows: top-5-DESC}, bekraftad: {count, rows: top-5-DESC}}`.
  - Both shapes carry minimal row fields: `id`, `status`, `lineCount`, `totalQuantity`, `createdBy.name`, `createdAt` (mirrors `OrderListItem` subset). No medication line details — drilldown via `/bestallningar/:id` provides them.
- **New `packages/shared/src/contracts/dashboard.ts` additions.** Extend the Phase 6 `dashboard.ts` module: add `dashboardOrdersResponse` as a Zod discriminated union on `role` field — `{role: 'sjukskoterska', egnaUtkast: {...}, recentHistory: [...]}` vs `{role: 'apotekare' | 'admin', skickad: {...}, bekraftad: {...}}`. Single source of truth.
- **New `apps/web/src/features/dashboard/useDashboardOrdersQuery.ts` hook.** `useQuery<DashboardOrdersResponse>` against `/api/dashboard/orders`, query key `['dashboard', 'orders']`. Three-layer refresh — `refetchOnWindowFocus: true`, `refetchInterval: 30_000`, plus sibling invalidations from existing order mutations (D-119 mirror). Export options as `DASHBOARD_ORDERS_QUERY_OPTIONS` for the same testable-without-mounting pattern Phase 6 established for `LOW_STOCK_QUERY_OPTIONS`.
- **New `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx`.** Discriminates on `data.role` and renders two distinct subviews:
  - Nurse: two stacked sections in one Card — "**Egna utkast**" header with count + 5 rows, "**Senaste beställningar**" header with 5 rows (own + others, any non-utkast status).
  - Pharmacist/Admin: two stacked sections in one Card — "**Väntar på bekräftelse**" with count + 5 rows linking to `?status=skickad`, "**Väntar på leverans**" with count + 5 rows linking to `?status=bekraftad`.
  - Mobile-first row layout matches `DashboardLowStockCard` (`min-h-[44px]`, `role="list"`/`listitem` semantics).
  - Section headers are clickable (`Link to="/bestallningar?status=…"`); individual rows link to `/bestallningar/:id?from=<status>`.
- **Dashboard layout change.** `DashboardPage.tsx` becomes a responsive 2-column grid: `<DashboardLowStockCard />` (left/top), `<DashboardOrdersCard />` (right/bottom). At `<md` they stack vertically, low-stock first. At `md+` they sit side-by-side via `grid grid-cols-1 md:grid-cols-2 gap-4`. Cards remain `max-w-2xl` individually so the grid caps at a sensible total width; container `max-w-5xl mx-auto p-4 md:p-6 lg:p-8`.
- **Celebratory empty states on the orders card** (role-specific):
  - Nurse (0 utkast + 0 history): `CheckCircle2` emerald + heading `Inga aktiva beställningar.` + sub: `Skapa en ny beställning när ni behöver fylla på.`
  - Apotekare/admin (0 skickad + 0 bekraftad): heading `Inga beställningar väntar på åtgärd.` + sub: `Allt hängt klart — inget att bekräfta eller leverera just nu.`
  - Same `<Card role="status">` pattern as the existing `DashboardLowStockCard` empty state (lines 84–104). Do NOT reuse `EmptyStateCard` — needs the emerald-600 icon color, not slate-400.
- **Sibling invalidation wiring** for `['dashboard', 'orders']` cache key — additions to existing mutation hooks (one line each, paired alongside the existing `['dashboard', 'low-stock']` invalidations from D-119):
  - `useCreateDraftOrder.onSuccess` — new draft appears in Egna utkast (nurse).
  - `useSubmitOrder.onSuccess` — draft leaves Utkast, joins Skickad-att-bekräfta (apotekare).
  - `useConfirmOrder.onSuccess` — order moves from Skickad to Bekräftad.
  - `useDeliverOrder.onSuccess` — order leaves Bekräftad (already invalidates `['dashboard', 'low-stock']`).
  - `useDiscardOrder.onSuccess` — draft disappears from Egna utkast.
- **Back-nav helper hook.** `apps/web/src/features/orders/useBestallningarBackLink.ts` (new):
  - Reads `?from=` from `useSearchParams`.
  - Validates against the `StatusTab` union (`'utkast' | 'skickad' | 'bekraftad' | 'levererad' | 'alla'`) — invalid values silently treated as missing.
  - Accepts an optional `fallbackStatus?: StatusTab` arg (the caller passes `order.status` when available).
  - Returns `{to: '/bestallningar?status=<resolved>', label: 'Tillbaka till beställningar'}`.
  - Resolution priority: valid `?from=` → caller's `fallbackStatus` → bare `/bestallningar` (no query string).
- **`?from=` param construction** at all 4 navigators:
  - `apps/web/src/routes/bestallningar/DraftsTable.tsx` + `DraftsCardList.tsx`: `navigate('/bestallningar/' + row.id + '?from=utkast')` — only used on the Utkast tab today.
  - `apps/web/src/routes/bestallningar/OrdersTable.tsx` + `OrdersCardList.tsx`: `navigate('/bestallningar/' + row.id + '?from=' + tab)` where `tab` is the active status tab (already passed as a prop — see OrdersTable.tsx line 25's `tab` use).
  - `BestallningarPage.tsx:handleNyBestallning` (line 79–82): include `?from=utkast` (a new draft always lives in Utkast).
  - `DashboardOrdersCard.tsx` row links (Phase 9 new): include `?from=<row.status>` for each row.
- **`ComposeOrderPage.tsx` back-link wiring.** Replace the 3 inline `<Link to="/bestallningar">` sites (lines 96, 124, 134, 161) and the `navigate('/bestallningar')` after discard (line 413) with `useBestallningarBackLink({fallbackStatus: order?.status ?? undefined})`. Loading + 404 states (where `order` is undefined) get the no-fallback resolution path — they pass `undefined` and the hook returns valid `?from=` or bare `/bestallningar`.
- **Permission keys** — no new keys. `order:read` already grants the dashboard read access (every role has it per Phase 3). Reusing `requireSession` on the new endpoint mirrors Phase 6's `GET /api/dashboard/low-stock`.
- **Audit allowlist** — no changes. New endpoint is read-only; existing mutation coverage already audits the underlying state changes.
- **Test surface** (per the Phase 4+5+6 pattern of integration + component tests in lockstep):
  - `apps/api/test/dashboard.orders.integration.test.ts` (new): role-aware payload shape (sjukskoterska vs apotekare), cross-vårdenhet isolation, top-5 limits respected, ordering DESC by createdAt, recent-history excludes utkast for nurse, count fields match actual row counts.
  - `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx` (new): renders nurse subview when `data.role === 'sjukskoterska'`, renders pharmacist subview when `data.role === 'apotekare'`, empty states fire correctly per role, row links include `?from=<status>`, section headers link to `/bestallningar?status=<status>`.
  - `apps/web/src/features/orders/__tests__/useBestallningarBackLink.test.tsx` (new): valid `?from=` wins; invalid `?from=` treated as missing; missing `?from=` uses `fallbackStatus`; both missing falls back to bare `/bestallningar`; status churn (fallback changes when caller's order.status changes); validation against StatusTab union (utkast/skickad/bekraftad/levererad/alla all accepted).
  - `apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx` (extend existing): all 4 back-link sites (loading, 404, header, post-discard) honor `?from=` and `order.status` fallback. Existing `'Tillbaka till beställningar'` assertion at line 236 still passes.
  - `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx` (extend existing): clicking a row in Skickade tab navigates to `/bestallningar/<id>?from=skickad`. Ny beställning button navigates to `/bestallningar/<new-id>?from=utkast`.

**Out of scope (other phases / v2 / dropped):**

- **Per-user filtering on /bestallningar list itself** — the Egna utkast count comes from the dashboard service; the list page tabs continue to show all vårdenhet orders. A "mina/alla" toggle on the list page is a v2 idea.
- **Notifications when count crosses a threshold** — no toast, no badge in the AppShell nav. The dashboard card + 30s poll is the v1 affordance.
- **Push notifications / SSE for dashboard updates** — same lightweight-bias rationale as Phase 6 D-119. v2.
- **Order numbers (ORD-11) in the dashboard rows** — Phase 10 ships order numbers; once landed, rows can show `ORD-…` instead of `id` substring or "Beställning från {createdBy.name}". Track as Phase 10 follow-on.
- **`/bestallningar` historical-tab persistence in localStorage** (remember last tab across sessions) — the URL is already the source of truth via `?status=`. Persisting beyond the URL is scope creep.
- **CSV/PDF export from the dashboard card** — v2 (EXP-01/EXP-02 are already deferred).
- **A "View all" link on each dashboard section that goes beyond top-5** — the section headers already link to the relevant tab; that IS the "view all" affordance.
- **AI-driven prioritization of which orders to surface first** — sort is plain DESC createdAt; no LLM. v2 idea.
- **Restoring scroll position on the destination tab after back-nav** — `?status=` preserves the tab; restoring scroll is a separate concern with its own brittleness (history API). v2.
- **Splitting `DashboardLowStockCard` and `DashboardOrdersCard` into a shared `<DashboardSection>` abstraction** — two cards is not yet a pattern; premature abstraction. Direct sibling components.
- **Renaming today's `'Tillbaka till beställningar'` link copy** — kept verbatim (3 sites in ComposeOrderPage). No UI string churn beyond the destination URL.

</domain>

<decisions>
## Implementation Decisions

### ORD-09 — Dashboard "Beställningar" card

- **D-141:** **New dedicated endpoint `GET /api/dashboard/orders` with own cache key `['dashboard', 'orders']`.** Mirrors the Phase 6 D-120 dedicated-endpoint precedent. Decouples dashboard refresh from the BestallningarPage `['orders', filters]` cache so a count update on the dashboard doesn't perturb a user's open list-page filter state and vice versa. Rejected: (a) reusing `GET /api/orders?status=...` with 2–3 round-trips per dashboard load (wasteful, couples caches); (b) extending the existing `GET /api/dashboard/low-stock` into a unified payload (breaks dedicated-endpoint pattern, fattens an unrelated cache).

- **D-142:** **Role-aware payload as a Zod discriminated union on `role`.** BE service inspects `req.user!.role` and returns one of two response shapes: nurses get `{role: 'sjukskoterska', egnaUtkast: {count, rows}, recentHistory: [...]}`; pharmacists/admins get `{role: 'apotekare' | 'admin', skickad: {count, rows}, bekraftad: {count, rows}}`. FE discriminates on `data.role` and renders the matching subview. Smaller payload + less FE branching than a uniform-superset shape. Rejected: (a) one-size superset (wastes a query or two per request, ships fields the user can't act on); (b) two separate endpoints (doubles route surface + forces FE to do a role check before fetching).

- **D-143:** **Recent history (nurse half) is vårdenhet-wide, not own-only.** The 5 most-recent rows include orders by any user in the unit, excluding utkast (drafts live in their own Egna Utkast section above). Matches the existing `/bestallningar` tab semantics — there is no nurse-vs-pharmacist split today; every user sees the same vårdenhet history. Surfaces "what's happening in my unit" rather than the narrower "what I personally created". Rejected: own-only (narrow, often empty for nurses who don't compose often) and mixed (more surface for marginal gain).

- **D-144:** **Top-5 rows per section, sorted DESC by createdAt.** Tight enough to stay readable at 360px mobile; broad enough to give context beyond a bare number. Excludes utkast from the recent-history (nurse) half since those live in the Egna utkast section. Rejected: top-3 (too few to feel useful), top-10 (pushes the low-stock card down at 360px). Each row carries minimal fields — `id`, `status`, `lineCount`, `totalQuantity`, `createdBy.name`, `createdAt` — drilldown via `/bestallningar/:id` provides line details.

### ORD-09 — Layout & empty states

- **D-145:** **Side-by-side at `md+`, stacked below.** `DashboardPage.tsx` becomes a responsive 2-column grid: `grid grid-cols-1 md:grid-cols-2 gap-4` with each card retaining `max-w-2xl` and the container at `max-w-5xl mx-auto`. At `<md` the cards stack vertically; at `md+` they sit side-by-side. Rejected: vertical-only single-column (wastes desktop real estate now that there are two cards). Same mobile-first rule as the rest of the app — base styles target 360px.

- **D-146:** **Order: Läkemedel under tröskel first (left/top), Beställningar second (right/bottom).** Preserves the established placement so reviewers who saw earlier Phase 6/7 screenshots aren't disoriented. Low-stock is the originating Core Value loop trigger (nurse sees low stock → composes order); Beställningar is the downstream consequence side. Rejected: swapping the order (foregrounds time-sensitive actions but breaks the existing reviewer mental model of the dashboard).

- **D-147:** **Celebratory empty states, role-specific copy.** Mirrors the `DashboardLowStockCard` pattern (lines 84–104) — `<Card role="status">` with `CheckCircle2` in emerald-600. Two distinct messages by role:
  - Nurse (0 utkast + 0 history): heading `Inga aktiva beställningar.` + sub `Skapa en ny beställning när ni behöver fylla på.`
  - Apotekare/admin (0 skickad + 0 bekraftad): heading `Inga beställningar väntar på åtgärd.` + sub `Allt hängt klart — inget att bekräfta eller leverera just nu.`
  Rejected: compact 'no items' line (loses the affirmative "you're clear" signal that matches the low-stock empty state), hide-when-empty (asymmetric with the low-stock card, which always renders).

- **D-148:** **Three-layer refresh mirroring Phase 6 D-119.** `useDashboardOrdersQuery` ships with `refetchOnWindowFocus: true`, `refetchInterval: 30_000`, plus sibling invalidations from `useCreateDraftOrder` + `useSubmitOrder` + `useConfirmOrder` + `useDeliverOrder` + `useDiscardOrder`. Each addition is one line next to the existing `['dashboard', 'low-stock']` invalidation. Apotekare on duty sees the Skickad count drop seconds after a colleague confirms. Rejected: two-layer (no 30s poll — background-tab dashboards stay stale), one-layer (mutation-only — same staleness problem).

### ORD-10 — Back-nav state preservation

- **D-149:** **URL search param `?from=<status>` on `/bestallningar/:id`.** Survives refresh, deep-linkable, shareable, debuggable. Consistent with the existing Phase 2 D-44 + Phase 4 D-82 URL-as-state convention (filter chips and tab choice both already live in the URL). Rejected:
  - React Router `location.state` — lost on refresh, lost on copy-paste, fails SC#4's "works whether deep link or dashboard card";
  - `navigate(-1)` — fails for deep links, fails for the dashboard card path;
  - `sessionStorage` — leaks across orders, confuses cross-tab use.

- **D-150:** **All four navigators construct `?from=<status>`.** (1) DraftsTable/DraftsCardList rowClick passes `?from=utkast`; (2) OrdersTable/OrdersCardList rowClick passes `?from=<tab>` (the tab prop already exists on those components); (3) `BestallningarPage:handleNyBestallning` passes `?from=utkast` (a new draft always belongs in Utkast); (4) DashboardOrdersCard row links (Phase 9 new) pass `?from=<row.status>`. Single uniform mechanism — no caller is "special". Rejected: partial coverage (tab-driven only) — splits behavior so "from a card" feels different than "from a tab".

- **D-151:** **Helper hook `useBestallningarBackLink({fallbackStatus?})` lives at `apps/web/src/features/orders/useBestallningarBackLink.ts`.** Reads `?from=`, validates against the StatusTab union, accepts an optional `fallbackStatus` arg, returns `{to, label}`. Reused by all 4 back-link sites in ComposeOrderPage (3 inline Link + 1 navigate-after-discard) so the validation + URL-building logic exists in exactly one file with its own test surface. Rejected: inline computation at each of the 4 sites (4× duplication of validation + URL construction), pure-lib helper (premature — no non-React caller today).

- **D-152:** **`?from=` persists across in-page state changes (submit/confirm/deliver/discard).** After any mutation the URL keeps the `?from=` param; back-nav still returns to the same tab the user arrived from. Simplest behavior — nothing strips the param. Rejected: updating `?from=` to the new status (assumes user wants to see the order in its new tab — surprising), stripping `?from=` after any transition (loses entry context for no gain).

### ORD-10 — Back-nav fallback

- **D-153:** **Fallback: use the order's own current status as the tab when `?from=` is absent.** Detail page calls `useBestallningarBackLink({fallbackStatus: order.status})`. A deep-link to a Bekräftad order back-navs to the Bekräftade tab — same context the user would see if they navigated to that tab manually. Predictable and useful. Rejected:
  - Default to utkast (current bug pattern, loses information);
  - No preselect (equivalent to utkast given today's defaults);
  - Use 'alla' as catch-all (changes the user's last-seen tab on next normal visit).

- **D-154:** **Fallback recomputes on every render** — when `?from=` is absent and `order.status` changes mid-session (e.g., user confirms a Skickad order → it becomes Bekräftad), the back-link follows the live status. User finds the order in the Bekräftade tab where it now lives. Trivial to implement: hook reads `order.status` on each render via the prop. When `?from=` IS present, it always wins regardless of `order.status` changes (D-152). Rejected: snapshotting `order.status` on first mount (surprising — back-nav lands on the tab where the order no longer is).

- **D-155:** **Loading + 404 states get the no-fallback resolution path.** When `order` is undefined (loading or 404), the hook receives `fallbackStatus: undefined` and returns `?from=`-if-valid OR bare `/bestallningar` (no `?status=` query string). 404 typically lacks `?from=` anyway since the user arrived from outside; landing on the default Utkast tab is fine for an error state. When `?from=` IS present even during loading (user clicked Bekräftade row, hit a transient 404), the hook still honors it — back-nav preserves the tab. Rejected: always plain `/bestallningar` in loading + 404 (ignores `?from=` when present), hiding the back-link until load (loading can be slow on cold cache; tappable affordance must be there from the first paint).

- **D-156:** **Invalid `?from=` values silently treated as missing.** Hook validates against the StatusTab union (utkast/skickad/bekraftad/levererad/alla). Unknown values are silently dropped — same path as "no param". No error toast, no warning. Defensive + quiet. `?from=` is decorative, not security-critical. Rejected: console.warn in dev mode (slight noise overhead for marginal benefit), throwing/showing an error (overkill UX for a tampered decorative param).

### Claude's Discretion

- **Exact CardTitle / section header copy on the orders card.** Recommended:
  - Nurse subview: top section header `Egna utkast` (CardTitle), second section header `Senaste beställningar`.
  - Pharmacist/admin subview: top section header `Väntar på bekräftelse`, second section header `Väntar på leverans`.
  - Counts rendered as the second line of each section header in `text-sm text-muted-foreground`, e.g., "totalt 3" — mirrors the low-stock card's CardDescription pattern.
- **Click-target on count vs section header vs entire row.** Recommended: the section header text (`Väntar på bekräftelse`, etc.) is a `<Link>` to `/bestallningar?status=<status>`. Each row is also a `<Link>` to `/bestallningar/:id?from=<status>`. The numeric count is part of the section header link (not a separate target) — one target per section, one per row. Avoids accidentally giving the same affordance two clickable surfaces.
- **Whether to render a "Visa alla" or "→" affordance at the end of each section** — recommended: NO. The section header itself is the link to the full tab. Adding a "Visa alla" CTA below the rows would be redundant and clutter the card on 360px.
- **Loading skeleton shape for the orders card.** Recommended: two stacked sections each with a header skeleton + 3 row skeletons (matching the steady-state structure). Same `<Skeleton>` primitive the low-stock card uses.
- **Whether the dashboard grid container has its own breakpoint above `md`** — recommended: NO. `md:grid-cols-2` is enough; `lg:grid-cols-3` would imply a third dashboard card that doesn't exist. Keep the breakpoint set minimal.
- **Exact tab value for `?from=` when the user clicked the "Alla" tab.** Recommended: pass `?from=alla` and let the back-link resolve to `/bestallningar?status=alla`. The StatusTab union already includes `'alla'`; the BestallningarPage tab strip already accepts it.
- **Whether to add the `?from=` param on the BestallningarPage `Ny beställning` redirect when called from a non-Utkast tab.** Recommended: ALWAYS use `?from=utkast` regardless of which tab the user is on when clicking the button. A new draft lives in Utkast; back-nav should land where the new draft IS.
- **Plan-slice ordering for Phase 9.** Recommended:
  1. **Slice A — ORD-10 back-nav fix.** Smallest, independent of ORD-09. Lands the helper hook + `?from=` propagation at the 4 existing navigators + the 4 back-link sites in ComposeOrderPage. Demoable end-to-end on its own. Lets reviewer see the back-nav narrative even if Phase 9 ships partial.
  2. **Slice B — ORD-09 BE endpoint + service + contracts.** Pure backend: new endpoint, new service function, new Zod discriminated union. Integration test in lockstep. No FE change yet.
  3. **Slice C — ORD-09 FE card + layout grid + invalidations.** Builds on Slice A (uses the back-link mechanism for row links) and Slice B (consumes the endpoint). DashboardOrdersCard + responsive grid + the 5 mutation invalidation additions + component tests.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 9 framing & scope

- `.planning/ROADMAP.md` §"Phase 9" — Goal + 4 Success Criteria + Mode (mvp) + Requirements (ORD-09, ORD-10). SC #1 dictates the role-scoped split; SC #2 dictates the tab pre-select on click-through; SC #3 dictates the back-nav preservation behavior; SC #4 dictates that the fix works from tab clicks, deep links, AND the new dashboard card.
- `.planning/REQUIREMENTS.md` §"Order Flow" ORD-09 + ORD-10 — single source of truth for the requirement text. ORD-09: "Dashboard shows a role-scoped 'Beställningar' card surfacing orders that need the user's attention …". ORD-10: "Order detail 'Tillbaka till beställningar' returns the user to the previously-active status tab, not the default Utkast tab".
- `.planning/PROJECT.md` — Core Value loop (the dashboard surfaces the upstream of that loop), Constraints (lightweight bias, no real-time push, mobile-first, Swedish UI verbatim), Out of Scope (no email notifications — the dashboard card IS the in-app surface for "needs attention").
- `.planning/STATE.md` — current phase progress (Phase 8 complete, ready_to_plan for Phase 9). Phase 9's git_commit step updates this.

### Phase 1–8 decisions inherited (carry forward, do NOT re-decide)

- `.planning/phases/01-foundation-auth/01-CONTEXT.md` D-15..D-19 — RBAC primitives (PERMISSIONS map, requirePermission, useAuth, useCan, Can) reused for the dashboard endpoint's `requireSession` gate and role-aware payload branching. D-17 (`useAuth().user.role` is the source of truth for the FE role read).
- `.planning/phases/02-medication-catalog/02-CONTEXT.md` D-44 — URL-as-state convention for filters (`?atc=`, `?form=`, `?belowThreshold=`). D-149's `?from=` follows the same pattern.
- `.planning/phases/03-draft-orders/03-CONTEXT.md` D-16 — careUnitId-first service signatures. D-149/D-150 navigators are pure FE; D-141's service follows this rule.
- `.planning/phases/04-confirm-deliver-stock/04-CONTEXT.md` D-82 — `?status=<tab>` URL-as-state on BestallningarPage. The back-link's destination format `/bestallningar?status=<resolved>` reuses this contract verbatim. The five-tab union `utkast/skickad/bekraftad/levererad/alla` is the StatusTab type the helper hook validates against.
- `.planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md` D-117 (server-side urgency sort — not relevant here, but D-118/D-119/D-120 are):
  - **D-118** — `DashboardPage.tsx` body is a single component composition; no `<h1>`, no AppShell chrome change. Phase 9 widens this to a sibling grid of two components — same principle (no chrome change beyond the route body).
  - **D-119** — three-layer refresh pattern (mutation invalidation + window focus + 30s poll). D-148 mirrors this verbatim for the new orders cache key. The 5 sibling invalidation sites are next to the existing `['dashboard', 'low-stock']` lines.
  - **D-120** — dedicated endpoint + own cache key (`['dashboard', 'low-stock']`). D-141 mirrors this for `['dashboard', 'orders']`. Wire shapes stay narrow on purpose — drilldown via `/bestallningar/:id` provides line details.
- `.planning/phases/07-ops-submission-polish/07-CONTEXT.md` D-126/D-127 — SC#4 mobile-first verification (six routes × four viewports). Phase 9 changes `/dashboard` layout; the `apps/web/scripts/captureSc04Screenshots.ts` harness will need to re-run after Phase 9 lands to refresh `docs/screenshots/sc04-360-dashboard.png`. Not a Phase 9 task per se, but the new dashboard must not regress on `scrollWidth <= innerWidth` at 360px.
- `.planning/phases/08-compose-catalog-ux/08-CONTEXT.md` D-132..D-140 — no direct overlap; Phase 8 sharpened picker surfaces, Phase 9 sharpens dashboard + back-nav. Independent.

### Existing code referenced by Phase 9 deliverables (read carefully — these files will be edited)

- `apps/web/src/routes/dashboard/DashboardPage.tsx` — Body becomes the responsive 2-column grid (currently a single `<DashboardLowStockCard />`).
- `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx` — Reference for the celebratory empty state pattern (lines 84–104) and the row layout. Phase 9 does NOT edit this file; `DashboardOrdersCard` mirrors its shape.
- `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx` — Reference for the test shape Phase 9's new component test mirrors. NOT edited.
- `apps/web/src/features/dashboard/useLowStockQuery.ts` — Reference for the `LOW_STOCK_QUERY_OPTIONS` named export pattern and the three-layer refresh config. The new `useDashboardOrdersQuery` mirrors this structure. NOT edited.
- `apps/web/src/features/orders/useOrderMutations.ts` — 5 hooks extended with one-line additions to also invalidate `['dashboard', 'orders']`. The existing `['dashboard', 'low-stock']` lines stay; the new key is added alongside.
- `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` — 4 sites get the back-link rewire (lines 96, 124, 134, 161 for the Link sites; line 413 for the post-discard `navigate`). See the file's existing `Tillbaka till beställningar` copy — kept verbatim.
- `apps/web/src/routes/bestallningar/BestallningarPage.tsx` — `handleNyBestallning` (line 79–82) updated to include `?from=utkast`. Rowclick paths through DraftsTable/DraftsCardList/OrdersTable/OrdersCardList (lines 225, 230) updated to include `?from=<tab>`.
- `apps/web/src/routes/bestallningar/DraftsTable.tsx`, `DraftsCardList.tsx` — accept the navigation through their `onRowClick`/`onCardClick` callbacks (already do); the calling page (BestallningarPage) is the one that builds the `?from=` URL.
- `apps/web/src/routes/bestallningar/OrdersTable.tsx`, `OrdersCardList.tsx` — same pattern. The `tab` prop they receive (see OrdersTable.tsx line 25, 135, 139) is the value to thread into `?from=<tab>`.
- `apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx` — extended (not rewritten); existing 'Tillbaka till beställningar' assertion at line 236 still passes.
- `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx` — extended with `?from=` assertions for tab clicks + Ny beställning.
- `apps/api/src/services/dashboard.service.ts` — Phase 6's `listLowStockForUnit` is the structural sibling; Phase 9 adds `listDashboardOrdersForUser(careUnitId, userId, role)`. Same file.
- `apps/api/src/routes/dashboard/lowStock.ts` — Sibling to the new `apps/api/src/routes/dashboard/orders.ts`. Same directory, same registration pattern via `apps/api/src/routes/dashboard/index.ts`.
- `apps/api/src/services/order.service.ts` — Reference for `OrderListItem` shape (the dashboard rows are a subset of this). NOT edited.
- `packages/shared/src/contracts/dashboard.ts` — Phase 6 module; Phase 9 adds `dashboardOrdersResponse` (Zod discriminated union) and `dashboardOrderRow` (subset of OrderListItem). Existing `lowStockListResponse` stays.
- `packages/shared/src/constants/roles.ts` — `ROLES` and `roleEnum` (apotekare/sjukskoterska/admin). The discriminator value for the Zod union.
- `packages/shared/src/contracts/permissions.ts` — Reference only; no new ActionKey added in Phase 9 (`order:read` is the existing gate; the new endpoint uses `requireSession` only — same as the Phase 6 low-stock endpoint).

### Brief & tooling

- `local/intervju-testcase-1-1-.pdf` (Swedish brief — local only) §2.1 (mandatory order flow lives in /bestallningar; Phase 9 makes the dashboard the action-priorities surface for it), §5 (UI/UX ★★★ — the dashboard is reviewer's first impression after login).
- `CLAUDE.md` — Swedish UI vocabulary verbatim (the new card uses `Utkast / Skickad / Bekräftad / Levererad`); mobile-first constraint; lightweight bias (no real-time push, no notifications infra).
- `.planning/config.json` — Workflow toggles (sequential, plan-check on, verifier on, per-phase research disabled). No Phase 9 changes to config.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Dashboard card pattern** — `DashboardLowStockCard.tsx` is the canonical implementation. `DashboardOrdersCard` mirrors its structure: Card + CardHeader + CardContent, loading skeleton bars, error Alert, celebratory empty state via `<Card role="status">` with emerald-600 CheckCircle2 (NOT `EmptyStateCard` — wrong icon color).
- **Three-layer refresh** — `useLowStockQuery.ts` shows the pattern. Named export `LOW_STOCK_QUERY_OPTIONS` allows tests to assert refresh-policy contract without mounting a QueryClient. `useDashboardOrdersQuery` follows the same convention with `DASHBOARD_ORDERS_QUERY_OPTIONS`.
- **Sibling mutation invalidation** — `useOrderMutations.ts` already invalidates `['orders']` + `['order', id]` on the five mutations. Phase 9 adds `['dashboard', 'orders']` next to each — one-line additions; no behavior change to existing invalidations.
- **URL-as-state via `useSearchParams`** — BestallningarPage uses `searchParams.get('status')` + `setSearchParams(prev => …)` (lines 60–95). The back-link hook uses the same `useSearchParams` to read `?from=`.
- **StatusTab union** — Already defined inline in BestallningarPage.tsx (line 45–48) as `'utkast' | 'skickad' | 'bekraftad' | 'levererad' | 'alla'` + a `VALID_STATUSES` array + `isValidStatus` type predicate. The new helper hook reuses this validation; consider extracting to a shared module under `apps/web/src/features/orders/` if both the hook and BestallningarPage want to import it, or keep the predicate inline in BestallningarPage and duplicate it in the hook (smaller surface, no cross-file coupling).
- **Card layout + max-w-2xl** — Existing low-stock card uses `Card className="w-full max-w-2xl"`. The grid container caps the outer width while each child keeps its own max-w-2xl — symmetric and avoids stretching either card unnaturally on wide viewports.
- **shadcn primitives reused** — Card, CardHeader, CardTitle, CardDescription, CardContent, Skeleton, Alert, AlertDescription, Link (from react-router-dom). No new shadcn components needed.
- **`order:read` permission already granted to all 3 roles** — Phase 3 D-64; reusing `requireSession` on the new endpoint matches the Phase 6 D-120 precedent (same as low-stock).
- **`useAuth().user.role`** — already the FE source of truth. `DashboardOrdersCard` could either branch on the server-returned `data.role` (preferred — matches the discriminated union) or read `useAuth().user.role` directly. The server-returned value is the safer source (it's what the BE used to compute the payload).

### Established Patterns

- **No new audit actions** — read-only endpoint, no audit. The 5 mutation invalidations are on existing audited mutations; no allowlist additions.
- **Mobile-first** — base styles target 360px; `md:` adds the side-by-side grid. The card row layout follows the existing 44px touch-target minimum.
- **No CSV/PDF export, no SSE, no email** — out of scope per PROJECT.md.
- **`'use client'` / SSR concerns** — not applicable; this is a Vite SPA. No directives.
- **Hook tests** — pattern from `useLowStockQuery` exports allow asserting config without mount. `useBestallningarBackLink` can be tested via React Testing Library `renderHook` with a `MemoryRouter` wrapper to mock `useSearchParams`.

### Integration Points

- **One new BE endpoint** — `GET /api/dashboard/orders` registered under `apps/api/src/routes/dashboard/index.ts` next to the existing low-stock route.
- **One new BE service function** — `listDashboardOrdersForUser` added to `apps/api/src/services/dashboard.service.ts`. Same file as `listLowStockForUnit`.
- **One new shared contract** — `dashboardOrdersResponse` (discriminated union) + `dashboardOrderRow` added to `packages/shared/src/contracts/dashboard.ts`.
- **One new FE query hook** — `useDashboardOrdersQuery.ts` under `apps/web/src/features/dashboard/`.
- **One new FE component** — `DashboardOrdersCard.tsx` under `apps/web/src/routes/dashboard/`.
- **One new FE helper hook** — `useBestallningarBackLink.ts` under `apps/web/src/features/orders/`.
- **Five edits to existing mutation hooks** — `useCreateDraftOrder` / `useSubmitOrder` / `useConfirmOrder` / `useDeliverOrder` / `useDiscardOrder` in `useOrderMutations.ts` each gain a one-line `['dashboard', 'orders']` invalidation.
- **One edit to `DashboardPage.tsx`** — wraps the two cards in a responsive grid.
- **Four edits to `ComposeOrderPage.tsx`** — back-link sites rewired to use the helper hook.
- **Four edits to navigation sites** — `BestallningarPage.handleNyBestallning` + DraftsTable/DraftsCardList rowClicks + OrdersTable/OrdersCardList rowClicks all gain `?from=<status>`. Some of these may already pass via `onRowClick` callbacks defined on the parent; the parent owns the URL composition.
- **No new dev-deps.** All primitives (TanStack Query, shadcn Card, React Router, Lucide icons) already in use.
- **No new env vars, no migration, no Prisma changes, no AI calls.**

</code_context>

<specifics>
## Specific Ideas

### Endpoint payload (locked shape — gives the planner a concrete contract)

```ts
// packages/shared/src/contracts/dashboard.ts (additions to Phase 6 module)

export const dashboardOrderRow = z.object({
  id: z.string(),
  status: orderStatusEnum,           // 'utkast' | 'skickad' | 'bekraftad' | 'levererad'
  lineCount: z.number().int().nonnegative(),
  totalQuantity: z.number().int().nonnegative(),
  createdBy: z.object({ id: z.string(), name: z.string() }),
  createdAt: z.string(),             // ISO-8601
});
export type DashboardOrderRow = z.infer<typeof dashboardOrderRow>;

const nurseSubview = z.object({
  role: z.literal('sjukskoterska'),
  egnaUtkast: z.object({
    count: z.number().int().nonnegative(),
    rows: z.array(dashboardOrderRow).max(5),
  }),
  recentHistory: z.array(dashboardOrderRow).max(5),
});

const pharmacistSubview = z.object({
  role: z.enum(['apotekare', 'admin']),
  skickad: z.object({
    count: z.number().int().nonnegative(),
    rows: z.array(dashboardOrderRow).max(5),
  }),
  bekraftad: z.object({
    count: z.number().int().nonnegative(),
    rows: z.array(dashboardOrderRow).max(5),
  }),
});

export const dashboardOrdersResponse = z.discriminatedUnion('role', [nurseSubview, pharmacistSubview]);
export type DashboardOrdersResponse = z.infer<typeof dashboardOrdersResponse>;
```

### Back-link hook signature (locked)

```ts
// apps/web/src/features/orders/useBestallningarBackLink.ts

import { useSearchParams } from 'react-router-dom';

type StatusTab = 'utkast' | 'skickad' | 'bekraftad' | 'levererad' | 'alla';
const VALID_STATUSES = ['utkast', 'skickad', 'bekraftad', 'levererad', 'alla'] as const;

function isValidStatus(s: string): s is StatusTab {
  return (VALID_STATUSES as readonly string[]).includes(s);
}

export interface BackLink {
  to: string;
  label: string;
}

export function useBestallningarBackLink(opts?: { fallbackStatus?: StatusTab }): BackLink {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('from');
  const fromValid: StatusTab | null = raw && isValidStatus(raw) ? raw : null;
  const resolved: StatusTab | null = fromValid ?? opts?.fallbackStatus ?? null;
  const to = resolved ? `/bestallningar?status=${resolved}` : '/bestallningar';
  return { to, label: 'Tillbaka till beställningar' };
}
```

### Dashboard grid (DashboardPage.tsx — recommended final shape)

```tsx
import { DashboardLowStockCard } from './DashboardLowStockCard';
import { DashboardOrdersCard } from './DashboardOrdersCard';

export function DashboardPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
      <DashboardLowStockCard />
      <DashboardOrdersCard />
    </div>
  );
}
```

### Section headers + click affordances

| Role | Section 1 header (link) | Section 2 header (link) | Row link target |
|---|---|---|---|
| sjukskoterska | "Egna utkast" → `/bestallningar?status=utkast` | "Senaste beställningar" → `/bestallningar?status=alla` | `/bestallningar/:id?from=<row.status>` |
| apotekare/admin | "Väntar på bekräftelse" → `/bestallningar?status=skickad` | "Väntar på leverans" → `/bestallningar?status=bekraftad` | `/bestallningar/:id?from=<section.status>` |

### Plan-slice ordering (recommended)

1. **Slice A — ORD-10 back-nav fix.** Helper hook + `?from=` propagation at all 4 navigators + 4 back-link sites in ComposeOrderPage. Independent, smallest, demoable end-to-end on its own. Test files: `useBestallningarBackLink.test.tsx`, extend `BestallningarPage.test.tsx`, extend `ComposeOrderPage.test.tsx`.
2. **Slice B — ORD-09 BE.** New endpoint + service function + Zod discriminated union + integration test (`dashboard.orders.integration.test.ts`). No FE change.
3. **Slice C — ORD-09 FE.** DashboardOrdersCard + DashboardPage grid + useDashboardOrdersQuery + 5 mutation invalidations + component tests (`DashboardOrdersCard.test.tsx`). Depends on Slice A (uses the back-link's `?from=` mechanism on row links) and Slice B (consumes the endpoint).

### Commit message conventions (Phase 9)

- All commits use `chore(09-NN):` / `feat(09-NN):` / `test(09-NN):` / `docs(09-NN):` scopes per the existing project convention.
- Each slice ends with a `docs(09-NN): complete <slice name> plan` commit.
- Final phase commit: `docs(phase-09): complete phase execution` mirroring the Phase 8 closeout pattern.

### Mobil-först re-capture (post-Phase-9 chore)

Phase 9 changes `/dashboard` layout. After the phase lands, re-run `apps/web/scripts/captureSc04Screenshots.ts` to refresh `docs/screenshots/sc04-360-dashboard.png`. Not a Phase 9 commit in itself, but a follow-on in the same plan or as a wrap-up chore. The new layout must pass the SC#4 harness's `scrollWidth <= innerWidth` assertion at 360px.

</specifics>

<deferred>
## Deferred Ideas

(Captured during Phase 9 discussion; do NOT lose; do NOT act on in Phase 9.)

- **Order numbers (ORD-11) in dashboard rows.** Phase 10 ships order numbers; once landed, dashboard rows can show `ORD-2026-0042` instead of a substring of `id`. Track as Phase 10 follow-on.
- **"Mina/alla" toggle on the /bestallningar list page itself.** Phase 9 surfaces the per-user split on the dashboard only; a list-page toggle would let nurses filter their own orders directly. v2 — adds query-param surface + a new BE param.
- **Push notifications / SSE for dashboard updates** — same lightweight-bias rationale as Phase 6 D-119. v2.
- **A badge/dot in the AppShell nav when counts > 0.** Surfaces "stuff to do" without opening the dashboard. v2 — adds nav cross-cutting concern.
- **Restore scroll position on the destination tab after back-nav.** `?status=` preserves the tab; restoring scroll requires history API integration. v2.
- **Shared `<DashboardSection>` abstraction** between LowStockCard and OrdersCard. Two cards is not yet a pattern; premature. Revisit when a third dashboard card is added.
- **CSV/PDF export from the dashboard card.** v2 (EXP-01/EXP-02 already deferred).
- **AI-driven prioritization of which orders to surface first.** v2 idea aligned with broader AI-first positioning.
- **`/bestallningar` last-tab persistence in localStorage** (remembers across browser sessions). The URL `?status=` is already the source of truth; persisting beyond the URL is scope creep.
- **`Kopiera filterlänk` rename** (Phase 5 LOW #15 carryover). Bucket: UX-polish. Lift into README "Med mer tid" at submission time.

</deferred>

---

*Phase: 9-Dashboard Depth + Back-Nav*
*Context gathered: 2026-05-24*
*Discussion log: 09-DISCUSSION-LOG.md*
