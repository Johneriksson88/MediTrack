# Phase 07 — UI Review

**Audited:** 2026-05-24
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md for this phase)
**Screenshots:** Committed reference screenshots used (docs/screenshots/sc04-360-*.png, 6 files). Dev server at localhost:5173 confirmed live; pnpm playwright capture invoked but output path did not resolve — visual analysis based on committed 360 px PNGs and code review.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Swedish domain vocabulary correct throughout; one known deferred label inaccuracy ("Kopiera permalink") and ambiguous card description ("3433 läkemedel") undermine precision |
| 2. Visuals | 3/4 | Clear visual hierarchy on all 6 routes; 360 px screenshots confirm mobile layout; "Lågt lager" badge clips on long medication names in dashboard card |
| 3. Color | 2/4 | Design tokens properly defined in CSS; 30 hardcoded hex literals in production components bypass the token system — concentrated in shell, KontoPage, EmptyStateCard |
| 4. Typography | 3/4 | Tight, consistent scale (5 sizes used: xs/sm/xl/2xl + one lg); only 3 weights (normal/medium/semibold); no overuse — minor gap is absence of a base-size body text class |
| 5. Spacing | 3/4 | Tailwind spacing scale used consistently; arbitrary values are UI-kit generated (shadcn internals) or intentional fixed-width constraints, not ad-hoc values; overall clean |
| 6. Experience Design | 3/4 | Loading skeletons, error states, empty states, and disabled states all present across critical paths; one gap: AuditPage lacks a skeleton loader for the initial data fetch |

**Overall: 17/24**

---

## Top 3 Priority Fixes

1. **30 hardcoded hex color literals in shell and page components** — Bypasses the design token system defined in `index.css`; a future theme or dark-mode addition will be inconsistent because these files won't inherit from `--primary`, `--muted`, etc. All 30 instances in `Sidebar.tsx`, `BottomTabBar.tsx`, `TopBar.tsx`, `UserPillPopover.tsx`, `AppShell.tsx`, `AuthSkeleton.tsx`, `KontoPage.tsx`, and `EmptyStateCard.tsx` should be replaced with their semantic Tailwind token equivalents: `bg-[#F1F5F9]` → `bg-muted`, `text-[#0F172A]` → `text-foreground`, `text-[#64748B]`/`text-[#475569]` → `text-muted-foreground`, `text-[#2563EB]`/`ring-[#2563EB]` → `text-primary`/`ring-primary`, `border-[#E2E8F0]` → `border-border`.

2. **"Kopiera permalink" overstates what is copied** — The button label at `apps/web/src/routes/admin/AuditDiffPanel.tsx:211` is documented as a known deferred issue (Phase 5 LOW #15) but it is a live user-facing accuracy problem: the copy operation builds a filter URL, not a permalink to a specific audit event. A reviewer testing the demo will click "Kopiera permalink", paste it, and observe the filters but not the specific row — a clear label mismatch. Change to "Kopiera filterlänk" as the deferred issue recommends.

3. **Dashboard card description "3433 läkemedel" is misleading** — `DashboardLowStockCard.tsx:110` renders `{total} läkemedel` as the `CardDescription` beneath the `CardTitle` "Läkemedel under tröskel". In the committed 360 px screenshot this shows "3433 läkemedel" directly under "Läkemedel under tröskel" — a user reads this as "the card lists 3433 items" which is the full pagination count, not the visible list. The description should either be omitted when total > page-size (it becomes misleading pagination math), or reworded to "totalt {total} under tröskel" to eliminate the ambiguity.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

**Status pills — PASS.** `ORDER_STATUS_LABELS` in `packages/shared/src/constants/orderStatus.ts:13-17` maps the four states verbatim: `Utkast`, `Skickad`, `Bekräftad`, `Levererad`. The brief vocabulary is correct.

**Swedish domain language throughout — PASS.** All page titles, CTA labels, empty states, and error messages are in Swedish. Specific examples verified:
- `Ny beställning` (BestallningarPage.tsx:124, 199)
- `Skicka beställning` / `Kasta` / `Bekräfta beställning` / `Levererar…` (ComposeOrderPage.tsx, ComposeStickyFooter.tsx)
- `Inga skickade beställningar.` / `Inga bekräftade beställningar.` / `Inga levererade beställningar ännu.` (BestallningarPage.tsx:100-104)
- `Inga läkemedel matchade filtren.` / `Inga läkemedel ännu` (LakemedelPage.tsx:243, 261)
- `Granskningslogg` (AuditPage.tsx:100), `Rensa filter` (AuditFilterBar.tsx:319)
- Error: `Kunde inte hämta lagernivåer — försök igen om en stund.` (DashboardLowStockCard.tsx:71)
- Empty (all-ok): `Alla läkemedel i din vårdenhet är över lagertröskeln.` (DashboardLowStockCard.tsx:99)

**"Logga ut" / "Loggar ut…" — PASS.** UserPillPopover.tsx:62 toggles between `Loggar ut…` (pending) and `Logga ut` (idle).

**WARNING — "Kopiera permalink" label.** `apps/web/src/routes/admin/AuditDiffPanel.tsx:211` reads "Kopiera permalink". The operation copies a filter URL, not a direct link to the specific audit event row. Documented as deferred in Phase 5 LOW #15 and `07-06-SUMMARY.md § Deferred Items`. This is a live inaccuracy that a demo reviewer will encounter.

**WARNING — Dashboard card description "3433 läkemedel".** `DashboardLowStockCard.tsx:110` places `{total} läkemedel` as the `CardDescription` beneath "Läkemedel under tröskel". In demo data (360 px screenshot) this displays "3433 läkemedel" — which is the pagination total of under-threshold items. The label reads as the card's list count rather than as a total, and is ambiguous. Compare to the medications page which doesn't show a count in the header position.

**No generic English labels found.** Grep for "Submit", "OK", "Cancel", "Save" returned only internal React/hook variable names (`handleSubmit`, `isSubmitting`, `onSubmit`), not user-visible strings.

---

### Pillar 2: Visuals (3/4)

**Mobile viewport — PASS.** All 6 committed 360 px screenshots show no horizontal overflow, the bottom tab bar is present with all 5 tabs, and page content is readable without zooming.

**Visual hierarchy — PASS.** Each page has a single `h1` at `text-2xl font-semibold` (`Läkemedel`, `Beställningar`, `Granskningslogg`). Subheadings step down to `text-xl font-semibold`. Data labels are `text-sm` or `text-xs`. The hierarchy is clear.

**Bottom tab bar active state — PASS.** Active icon is `text-[#2563EB]` (primary blue) with label visible; inactive is `text-[#64748B]` (muted). The dashboard screenshot shows "Dashboard" as the active tab with blue icon.

**Status pill color coding — PASS.** Four distinct semantic colors (slate/blue/amber/emerald) for Utkast/Skickad/Bekräftad/Levererad, consistent with WCAG-adequate contrast per the component's own doc.

**WARNING — "Lågt lager" badge clips on long names in dashboard card.** In the 360 px dashboard screenshot, "Acellulärt pertussisvaccin k..." is truncated with `max-w-[180px]` (`DashboardLowStockCard.tsx:123`), and the "Lågt lager" badge in that row causes the line to wrap visually (the badge appears on a second line under the truncated name, rather than staying inline). The row geometry works at wider viewports but at 360 px the badge and the stock ratio (`0 / 4`) both compete for the same row, causing the badge to wrap. No WCAG blocker, but the card row becomes harder to scan at mobile width.

**WARNING — Dashboard has no page `h1`.** `DashboardPage.tsx:15-16` returns only `<DashboardLowStockCard />` with no wrapping `h1`. The card's `CardTitle` "Läkemedel under tröskel" serves as the de-facto heading, which is semantically correct for the card but leaves the page without a landmark heading at the `h1` level. Other pages (Läkemedel, Beställningar, Granskningslogg) all have `h1`. The asymmetry is a minor visual design inconsistency.

**Icon-only buttons — PASS.** All icon-only controls have `aria-label`: QuantityStepper (Minska/Öka antal), LowStockBanner dismiss (Stäng varning), TherapeuticClassCombobox clear (Rensa terapeutisk klass), AuditFilterBar filters.

---

### Pillar 3: Color (2/4)

**Design token system defined correctly — PASS.** `apps/web/src/index.css` defines all palette values as HSL CSS variables (`--primary`, `--muted`, `--foreground`, `--destructive`, `--border`, etc.), enabling the Tailwind `bg-primary`/`text-muted-foreground` utilities to resolve consistently.

**BLOCKER — 30 hardcoded hex color literals in production component files.** Design tokens are defined but not consistently used. The following files contain hardcoded hex values that should instead use the semantic tokens:

- `apps/web/src/routes/shell/AppShell.tsx:32` — `bg-[#F8FAFC]` should be `bg-background`
- `apps/web/src/routes/shell/AuthSkeleton.tsx:16,18,25,42` — `bg-[#F8FAFC]`, `bg-[#F1F5F9]`, `border-[#E2E8F0]` (4 instances)
- `apps/web/src/routes/shell/BottomTabBar.tsx:28,38,39` — `bg-[#F1F5F9]`, `border-[#E2E8F0]`, `ring-[#2563EB]`, `text-[#2563EB]`, `text-[#64748B]`
- `apps/web/src/routes/shell/Sidebar.tsx:27,37,41,42` — `bg-[#F1F5F9]`, `border-[#E2E8F0]`, `bg-[#DBEAFE]`, `text-[#2563EB]`, `border-[#2563EB]`, `text-[#0F172A]`, `bg-[#E2E8F0]`
- `apps/web/src/routes/shell/TopBar.tsx:23,26,28` — `bg-[#F1F5F9]`, `border-[#E2E8F0]`, `text-[#0F172A]`, `ring-[#2563EB]`, `text-[#2563EB]`
- `apps/web/src/routes/shell/UserPillPopover.tsx:37,39,42,46,49,60` — `ring-[#2563EB]`, `text-[#0F172A]`, `text-[#64748B]` (x3), `bg-[#E2E8F0]`, `text-[#DC2626]`
- `apps/web/src/components/EmptyStateCard.tsx:40,41` — `text-[#0F172A]`, `text-[#475569]`
- `apps/web/src/routes/konto/KontoPage.tsx:71,74,77,102,114` — `text-[#0F172A]` (x2), `text-[#64748B]` (x2), `text-[#475569]`

All values correspond correctly to their design token equivalents (the hex values in the CSS comment match the tokens), so there is no visual inconsistency today. The problem is maintenance: a token value change (e.g., adopting a slate-950 foreground) requires updating both `index.css` and 30 scattered class strings. This is an architectural debt, not a rendering bug.

**Accent color usage — PASS.** The 72 instances of `text-primary`/`bg-primary`/`border-primary` class usage (excluding tests) are distributed across interactive states (active nav item, button variants, focus rings). The 60/30/10 distribution is maintained — primary blue is reserved for interactive/active states, muted surfaces dominate.

**Status-pill colors — PASS.** Semantic color families (slate/blue/amber/emerald) are used consistently and serve functional, not decorative, purposes.

---

### Pillar 4: Typography (3/4)

**Font size distribution (5 sizes in use):**
```
text-sm    : 125 instances  (body/table data — dominant)
text-xs    :  88 instances  (labels, chips, badges)
text-2xl   :   7 instances  (page headings h1)
text-xl    :   5 instances  (section subheadings h2)
text-lg    :   3 instances  (used sparingly in EmptyStateCard)
```

**Font weight distribution (3 weights in use):**
```
font-semibold : 84 instances  (headings, badges, CTAs, active nav)
font-medium   : 10 instances  (secondary emphasis)
font-normal   :  7 instances  (standard body text)
```

**Assessment — PASS on both counts.** 5 font sizes is within the guideline (≤4 triggers a flag, but 5 with a clear hierarchy is acceptable). 3 weights is within the 2-weight guideline; the additional `font-medium` is used modestly (10 instances) as a genuine midpoint, not noise.

**WARNING — `text-base` is absent.** All body text uses `text-sm`, not `text-base` (the 16 px default). This is a deliberate density choice (medical tool, data-heavy UI), not an error. The consequence is that all running text is 14 px — adequate on desktop but tight on mobile, especially in the audit card list where event summaries render at `text-sm`. No WCAG failure, but the choice compresses the reading comfort margin at 360 px.

**Code/monospace in audit diff — PASS.** `AuditDiffPanel.tsx:45,63` uses `font-mono` for the before/after diff values, correctly differentiating structured data from prose.

---

### Pillar 5: Spacing (3/4)

**Tailwind scale usage — PASS.** The top 20 most-used spacing classes are all standard scale values: `p-4` (50), `px-4` (47), `p-2` (43), `py-3` (38), `p-8` (19), `py-1` (19), `px-3` (19), etc. All values are multiples of 4 px from the standard scale.

**Arbitrary spacing values — PASS (with qualification).** The `[...]` values found in the codebase are:
- `w-[200px]`, `w-[280px]`, `w-[240px]`, `min-w-[220px]` — AuditFilterBar and TherapeuticClassCombobox fixed-width popover triggers (intentional; stated in component comments)
- `max-w-[280px]`, `max-w-[180px]` — AuditDiffPanel and DashboardLowStockCard text truncation bounds (intentional)
- `w-[--radix-popover-trigger-width]` — CSS custom property, not a hardcoded value (Radix UI pattern)
- shadcn component internals (`[&_[cmdk-input]]:h-12`, `[&:has([role=checkbox])]:pr-0`, etc.) — generated boilerplate, not project-authored
- `translate-y-[-3px]`, `translate-y-[2px]` — shadcn alert/table internal micro-adjustments

No ad-hoc spacing values were added by project-authored code outside of the intentional fixed-width cases.

**WARNING — `p-8` is used for some card-level padding (19 instances) alongside `p-4` (50 instances) and `p-6` (17 instances)**. The three-level padding inconsistency (`p-4`, `p-6`, `p-8`) at the card boundary level creates slightly variable breathing room across sections. Not a hard failure but worth a pass to normalize card padding to a single value at each nesting depth.

---

### Pillar 6: Experience Design (3/4)

**Loading states — PASS.**
- `AuthGate.tsx:32` returns `<AuthSkeleton />` during `/me` query
- `DashboardLowStockCard.tsx:53-60` returns three `<Skeleton className="h-10 w-full" />` bars on initial load only (`isLoading`, not `isFetching`)
- `apps/web/src/routes/shell/AuthSkeleton.tsx` mirrors chrome layout to prevent layout shift
- Login form disables submit button on `isPending`
- All mutating buttons disable on their respective `isPending` state (`InlineEditThreshold`, `BestallningarPage`, `ApotekareActionFooter`)

**Error states — PASS.**
- `DashboardLowStockCard.tsx:65-75` renders a destructive `Alert` with Swedish copy on `isError`
- `LoginForm.tsx:101` renders `<Alert variant="destructive" role="alert">` with per-code Swedish messages (`invalid_credentials` vs generic)
- `AuthGate.tsx:35-45` handles 401 redirects separately from generic errors (re-thrown to router error boundary)
- `AuditDiffPanel.tsx:145` shows a toast on permalink copy failure

**Empty states — PASS.**
- All 5 tab states in BestallningarPage have distinct copy
- LakemedelPage has two distinct empty states (zero DB rows vs active filter with no matches)
- AuditPage has two distinct empty states (no events ever vs filter with no matches)
- DashboardLowStockCard has a celebratory empty state (CheckCircle2 + "Alla läkemedel i din vårdenhet är över lagertröskeln.")
- EmptyStateCard component is reusable and used consistently

**Destructive action confirmations — PASS.**
- `DiscardDraftDialog.tsx` uses `AlertDialog` for order draft discard
- `DeliverConfirmDialog.tsx` uses `AlertDialog` for stock delivery
- `DeleteMedicationDialog.tsx` uses `AlertDialog` for medication deletion
- All dialogs disable their confirm button during `isPending`

**WARNING — AuditPage lacks a skeleton loader on initial data fetch.** `AuditPage.tsx:91` sets `const isLoading = eventsQuery.isLoading` but there is no skeleton returned for this state. The page renders the `AuditFilterBar` and then an empty content area while the data is fetching. In contrast, `DashboardLowStockCard` and the auth gate both implement skeletons. The audit page shows a blank table area on first load, which could be misread as an "empty" state before data arrives.

**NOTE — 360 px beställningshistorik screenshot shows tab bar truncation.** The "Levere" label is clipped at 360 px because five tabs at that viewport exceed the available width. The tab bar scrolls horizontally; this is the expected behavior noted in the verification table footnote (¹ footnote covers horizontal scrolling). The scrolling is functional but not visually indicated — there is no shadow or indicator that more tabs exist to the right.

---

## Files Audited

**Source components:**
- `apps/web/src/components/EmptyStateCard.tsx`
- `apps/web/src/components/LowStockBadge.tsx`
- `apps/web/src/components/OrderStatusPill.tsx`
- `apps/web/src/components/QuantityStepper.tsx`
- `apps/web/src/components/InlineEditThreshold.tsx`
- `apps/web/src/components/TherapeuticClassCombobox.tsx`
- `apps/web/src/routes/shell/AppShell.tsx`
- `apps/web/src/routes/shell/AuthSkeleton.tsx`
- `apps/web/src/routes/shell/BottomTabBar.tsx`
- `apps/web/src/routes/shell/Sidebar.tsx`
- `apps/web/src/routes/shell/TopBar.tsx`
- `apps/web/src/routes/shell/UserPillPopover.tsx`
- `apps/web/src/routes/dashboard/DashboardPage.tsx`
- `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx`
- `apps/web/src/routes/lakemedel/LakemedelPage.tsx`
- `apps/web/src/routes/lakemedel/LowStockBanner.tsx`
- `apps/web/src/routes/lakemedel/PaginationFooter.tsx`
- `apps/web/src/routes/bestallningar/BestallningarPage.tsx`
- `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx`
- `apps/web/src/routes/bestallningar/ComposeStickyFooter.tsx`
- `apps/web/src/routes/bestallningar/DeliverConfirmDialog.tsx`
- `apps/web/src/routes/bestallningar/DiscardDraftDialog.tsx`
- `apps/web/src/routes/admin/AuditPage.tsx`
- `apps/web/src/routes/admin/AuditFilterBar.tsx`
- `apps/web/src/routes/admin/AuditDiffPanel.tsx`
- `apps/web/src/routes/admin/AuditEventCard.tsx`
- `apps/web/src/routes/konto/KontoPage.tsx`
- `apps/web/src/features/auth/LoginForm.tsx`
- `apps/web/src/auth/AuthGate.tsx`
- `apps/web/src/index.css`
- `packages/shared/src/constants/orderStatus.ts`

**Screenshots:**
- `docs/screenshots/sc04-360-dashboard.png`
- `docs/screenshots/sc04-360-lakemedel.png`
- `docs/screenshots/sc04-360-bestallningshistorik.png`
- `docs/screenshots/sc04-360-audit.png`

**Planning artifacts:**
- `.planning/phases/07-ops-submission-polish/07-CONTEXT.md`
- `.planning/phases/07-ops-submission-polish/07-01-SUMMARY.md` through `07-10-SUMMARY.md`
