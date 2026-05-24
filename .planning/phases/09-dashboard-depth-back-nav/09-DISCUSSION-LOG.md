# Phase 9: Dashboard Depth + Back-Nav - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `09-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 09-dashboard-depth-back-nav
**Areas discussed:** Orders card data shape & endpoint, Orders card layout & empty states, Back-nav state preservation mechanism, Back-nav fallback when no prior tab is known

---

## Orders card data shape & endpoint

### Q1 — Endpoint design

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated endpoint | `GET /api/dashboard/orders` with own cache key `['dashboard', 'orders']`. Mirrors Phase 6 D-120 pattern. | ✓ |
| Reuse existing `/api/orders` | FE calls `?status=skickad`, `?status=bekraftad`, etc. 2–3 round-trips per dashboard load. | |
| Extend `/api/dashboard` with unified payload | One endpoint returns both lowStock and orders. Fattens unrelated cache. | |

**User's choice:** New dedicated endpoint (Recommended).
**Notes:** Locked as D-141. Decouples dashboard refresh from BestallningarPage cache.

### Q2 — Payload shape

| Option | Description | Selected |
|--------|-------------|----------|
| Role-aware on BE | Discriminated union on `role`; smaller payload, less FE branching. | ✓ |
| One-size superset payload | All four fields for all roles; FE picks per role. Wastes a query or two. | |
| Two separate endpoints | `/nurse` and `/apotekare`. Doubles route surface. | |

**User's choice:** Role-aware on BE (Recommended).
**Notes:** Locked as D-142.

### Q3 — Recent history scope (nurse half)

| Option | Description | Selected |
|--------|-------------|----------|
| Vårdenhet-wide | Recent orders for the whole unit, any status. Matches existing tab semantics. | ✓ |
| Own only (createdByUserId = me) | Personal-focused but narrow; often empty for nurses who don't compose often. | |
| Mix: own utkast + vårdenhet history | Two subsections. More surface. | |

**User's choice:** Vårdenhet-wide (Recommended).
**Notes:** Locked as D-143.

### Q4 — Row count + status filter

| Option | Description | Selected |
|--------|-------------|----------|
| Top 5, all statuses except utkast | Drafts live in Egna Utkast section. Sorted createdAt DESC. | ✓ |
| Top 5, all statuses including utkast | Includes other nurses' drafts. Noisy. | |
| Top 3 | Compact but few rows; needs a "View all" affordance. | |
| Top 10 | Pushes low-stock card down at 360px. | |

**User's choice:** Top 5, all statuses except utkast (Recommended).
**Notes:** Locked as D-144.

---

## Orders card layout & empty states

### Q1 — Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Stacked vertically | Both cards full-width up to max-w-2xl, stacked. Mobile-first, no responsive grid. | |
| Side-by-side at md+, stacked below | Grid with 2 cols on tablet+. More desktop density. | ✓ |
| Orders card on top, low-stock below | Swaps priority. Repositions established placement. | |

**User's choice:** Side-by-side at md+, stacked below md.
**Notes:** User chose the denser desktop layout over the simpler vertical stack — locked as D-145. Container becomes `grid grid-cols-1 md:grid-cols-2 gap-4` with `max-w-5xl` outer + `max-w-2xl` per card.

### Q2 — Card order

| Option | Description | Selected |
|--------|-------------|----------|
| Läkemedel under tröskel first | Preserves today's primary signal placement. | ✓ |
| Beställningar first | Foregrounds time-sensitive action items. Repositions established placement. | |

**User's choice:** Läkemedel under tröskel first, Beställningar second (Recommended).
**Notes:** Locked as D-146.

### Q3 — Empty state

| Option | Description | Selected |
|--------|-------------|----------|
| Celebratory empty state, role-specific copy | Mirrors low-stock card's emerald CheckCircle2 + role-specific Swedish copy. | ✓ |
| Compact "no items" line | Single line, no icon. Tighter footprint. | |
| Hide the card entirely when empty | Honest but loses the "I checked, you're clear" signal. | |

**User's choice:** Celebratory empty state, role-specific copy (Recommended).
**Notes:** Locked as D-147. Two distinct copy variants per role.

### Q4 — Refresh cadence

| Option | Description | Selected |
|--------|-------------|----------|
| Three-layer mirror of low-stock | Mutation invalidation + refetchOnWindowFocus + 30s poll. | ✓ |
| Two-layer: mutation + window focus only | No 30s poll. Background tabs stay stale. | |
| One-layer: mutation only | Cheapest; same staleness problem. | |

**User's choice:** Three-layer mirror of low-stock (Recommended).
**Notes:** Locked as D-148. 5 sibling invalidation sites alongside existing `['dashboard', 'low-stock']` lines.

---

## Back-nav state preservation mechanism

### Q1 — Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| URL search param `?from=skickad` on detail route | Survives refresh, deep-linkable, shareable. Consistent with Phase 2/4 URL-as-state. | ✓ |
| React Router `location.state` | Stays out of URL. Lost on refresh; fails SC#4 "works whether deep link or dashboard card". | |
| `navigate(-1)` on back-click | Brittle; fails for deep links and dashboard card path. | |
| sessionStorage with key 'lastOrderListTab' | Survives refresh but leaks across orders + cross-tab. | |

**User's choice:** URL search param `?from=skickad` (Recommended).
**Notes:** Locked as D-149.

### Q2 — Callers

| Option | Description | Selected |
|--------|-------------|----------|
| All four navigators | Drafts rowClick, Orders rowClick, Ny beställning, Dashboard cards. Each passes the active tab as `?from=`. | ✓ |
| Only the table/card-list rowClicks | Ny beställning + dashboard cards omit `?from=` and rely on fallback. | |
| Tab-driven only — dashboard cards skip | Splits behavior between cards and tabs. | |

**User's choice:** All four navigators (Recommended).
**Notes:** Locked as D-150. Uniform mechanism — no caller is "special".

### Q3 — Code structure

| Option | Description | Selected |
|--------|-------------|----------|
| Small helper hook `useBestallningarBackLink()` | One hook reads + validates + returns `{to, label}`. Reused by 4 back-link sites. | ✓ |
| Inline in ComposeOrderPage | 4× duplication of validation + URL-building. | |
| Push computation into shared lib | apps/web/src/lib/orderBackLink.ts pure helper. Premature — no non-React caller. | |

**User's choice:** Small helper hook (Recommended).
**Notes:** Locked as D-151. Lives at `apps/web/src/features/orders/useBestallningarBackLink.ts`.

### Q4 — Persistence across mutations

| Option | Description | Selected |
|--------|-------------|----------|
| `?from=` persists across in-page state changes | After submit/confirm/deliver/discard, URL keeps param. Back-nav still returns where user came from. | ✓ |
| Update `?from=` to match new status after transition | "Intelligent" but surprising. | |
| Strip `?from=` after any transition | Loses entry context for no gain. | |

**User's choice:** Yes, `?from=` persists (Recommended).
**Notes:** Locked as D-152. Simplest behavior — nothing strips the param.

---

## Back-nav fallback when no prior tab is known

### Q1 — Fallback strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Use order's own current status as the tab | Predictable: deep-link to Bekräftad order back-navs to Bekräftade tab. | ✓ |
| Default to Utkast tab (current bug behavior) | Loses information; same pattern the phase is trying to fix. | |
| No tab preselect (bare `/bestallningar`) | Equivalent to Utkast given today's defaults. | |
| Use 'Alla' tab as safe catch-all | Changes user's last-seen tab on next normal visit. | |

**User's choice:** Use order's own current status (Recommended).
**Notes:** Locked as D-153.

### Q2 — Status churn

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — recompute on every render, follow current status | After confirm, back-link points to Bekräftade tab. Live status. | |
| No — snapshot order.status on first mount | Stays at status when page loaded. Surprising after confirm. | |
| Recompute, but only when `?from=` is absent | `?from=` always wins if present; fall through to live order.status otherwise. | ✓ |

**User's choice:** Recompute, but only when `?from=` is absent.
**Notes:** Locked as D-154. Makes the precedence (param > order.status) explicit.

### Q3 — Loading + 404 states

| Option | Description | Selected |
|--------|-------------|----------|
| Use `?from=` if present, else `/bestallningar` (no preselect) | Hook honors `?from=` even in loading/404; bare URL otherwise. | ✓ |
| Always plain `/bestallningar` in loading + 404 | Ignores `?from=` when present. | |
| Show only the icon, no link, during loading | Hides the back-link. Bad on cold cache. | |

**User's choice:** Use `?from=` if present, else `/bestallningar` (Recommended).
**Notes:** Locked as D-155.

### Q4 — Validation of malformed `?from=` values

| Option | Description | Selected |
|--------|-------------|----------|
| Treat invalid as missing — fall through to fallback | Defensive + quiet. No toast, no warning. | ✓ |
| Sanitize + log to console.warn for dev visibility | Helpful while developing, harmless in prod. Slight noise. | |
| Throw — surface as a 400-style error | Overkill for a decorative param. | |

**User's choice:** Treat invalid as missing (Recommended).
**Notes:** Locked as D-156.

---

## Claude's Discretion

Items where the user accepted Claude's recommended approach without further drill-down. Captured in CONTEXT.md under `### Claude's Discretion`:

- Exact CardTitle / section header copy on the orders card.
- Click-target affordances (section header link vs row link; no separate count target).
- Decision to NOT render a "Visa alla" affordance below rows.
- Loading skeleton shape mirrors low-stock card.
- Dashboard grid stays at `md:grid-cols-2`; no `lg:grid-cols-3` (would imply a third card that doesn't exist).
- `?from=alla` propagated when user clicked the "Alla" tab.
- `Ny beställning` button always passes `?from=utkast` regardless of current tab.
- Plan-slice ordering (A: ORD-10 back-nav, B: ORD-09 BE, C: ORD-09 FE).

## Deferred Ideas

Captured during discussion (not acted on in Phase 9):

- Order numbers (ORD-11) in dashboard rows — Phase 10 follow-on.
- "Mina/alla" toggle on /bestallningar list page itself — v2.
- Push notifications / SSE for dashboard updates — v2.
- Badge/dot in AppShell nav when counts > 0 — v2.
- Restore scroll position on destination tab after back-nav — v2.
- Shared `<DashboardSection>` abstraction — premature.
- CSV/PDF export from dashboard card — v2 (EXP-01/EXP-02 deferred).
- AI-driven prioritization of which orders to surface first — v2.
- `/bestallningar` last-tab persistence in localStorage — scope creep (URL is the source of truth).
- `Kopiera filterlänk` rename (Phase 5 LOW #15 carryover) — UX-polish bucket.
