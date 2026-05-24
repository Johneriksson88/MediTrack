# Phase 8: Compose & Catalog UX - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Sharpen three pain points in the medication picker / catalog surfaces that became visible during the Phase 7 demo dress-rehearsal:

1. **ATC code input is free-text only** (`apps/web/src/routes/lakemedel/MedicationSheet.tsx` add-medication form) — users have no autocomplete from the 43,538-row NPL catalog. Mistypes are easy.
2. **Compose-order picker starts empty** (`apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx`) — every order draft begins with "type something to see anything", even though the user nearly always wants either a low-stock med or a recently-ordered one.
3. **Add-medication picker's empty-state is opaque** — when the global NPL search returns nothing, the message reads "Inget läkemedel matchade" regardless of whether (a) the NPL catalog genuinely has no match for the query, or (b) every match was excluded by D-45 (already actively stocked at this vårdenhet). The user can't tell why their search is empty.

Phase 8 fixes all three with minimal new surface: one new BE endpoint for ATC codes, one new BE endpoint for picker suggestions, one BE response shape extension for empty-state differentiation, and two FE component touches.

**In scope (Phase 8 only — REQ-IDs CAT-09, CAT-10, ORD-08):**

- **ATC combobox (CAT-09).** Replace the free-text ATC `<Input>` in `MedicationSheet`'s user-create form with a typeahead combobox. Component is a thin wrapper around the existing Popover+Command pattern used by `TherapeuticClassCombobox` and the LakemedelFilter ATC suggestion control. Data source: new `GET /api/medications/atc-codes` returning `{codes: string[]}` — distinct `atcCode` values from the global `Medication` table sorted asc (~3,000 unique 7-char codes for the seeded NPL catalog). User can type-filter inline; free-text fallback accepts codes not in the list (catalog grows when admin adds a brand-new med). Cache: `staleTime: Infinity`, `refetchOnWindowFocus: false`; explicit `queryClient.invalidateQueries(['atc-codes'])` inside `useCreateMedication.onSuccess` so a freshly-added new-code medication makes its code instantly available. **Reuse target:** also wire the same combobox into `LakemedelFilter`'s ATC control (today free-text + per-page suggestions only) so both surfaces share the autocomplete behavior — single source of truth.

- **Picker suggestions block (ORD-08).** When `MedicationPickerSheet`'s search input is empty (`q === ''`), render a suggestions block above where results would appear. **Two visually separated sections, deduplicated:**
  - **`### Mest beställda`** — top 5 most-ordered `CareUnitMedications` for the user's vårdenhet, all-time, sorted desc by `OrderLine` row count. Ties broken by `Medication.name` asc.
  - **`### Lågt lager`** — top 5 below-threshold rows from the existing `dashboard.service.listLowStockForUnit(careUnitId)` ranking (urgency = `currentStock / lowStockThreshold` asc).
  - **Dedupe:** if a medication appears in both, it shows only in Lågt lager; the most-ordered slot pulls the 6th-ranked. Total always 10 rows (or fewer if vårdenhet has < 10 active CareUnitMedications).
  - **Hide rule:** on any keystroke into the search input (debounced via the existing 150 ms `useDebounce`), the suggestions block hides and results take over. Clearing the input back to empty re-renders suggestions.
  - **Endpoint:** new `GET /api/orders/picker-suggestions` returning `{mostOrdered: PickerSuggestion[], lowStock: PickerSuggestion[]}` where each shape mirrors the existing picker row contract (`careUnitMedicationId`, `medicationId`, `name`, `atcCode`, `form`, `currentStock`, `lowStockThreshold`). Service-layer dedupe — endpoint guarantees no `careUnitMedicationId` appears in both arrays. RBAC: `requirePermission('order:create')` (same gate as the picker itself).
  - **Row-click behavior:** identical to existing picker rows — `useAddOrderLine.mutateAsync` then close-on-success.

- **Differentiated empty-state copy (CAT-10).** Extend the `GET /api/medications/search` response with one new field: `globalCatalogMatchCount: number` — the unfiltered count of NPL `Medication` rows matching the query before D-45 exclusion. FE branches `MedicationSheet`'s no-results render into two states:
  - `globalCatalogMatchCount === 0` (NPL truly has no hit): **"Inget i NPL matchade »{q}«."** sub-line: "Kontrollera stavning eller skapa ett nytt läkemedel."
  - `globalCatalogMatchCount > 0 && results.length === 0` (D-45 excluded everything): **"Alla träffar finns redan i din vårdenhet."** sub-line: "Justera sökningen eller skapa ett nytt läkemedel."
  - The "skapa ett nytt läkemedel" link in both sub-lines is the existing `<Button variant="link">` that opens the user-create form (current behavior preserved — CAT-08 was dropped from scope at discussion time; the link stays only in the empty state, not promoted to an always-visible CTA).

**Out of scope (other phases / v2 / dropped):**

- **CAT-08 — always-visible "Skapa nytt" CTA.** Dropped at discussion time. The user reverted to the original Phase 2 D-58/D-70 stance: the picker is intentionally pick-only, and "Skapa nytt" stays as an in-empty-state link only. Documented in `<deferred>` so we don't silently lose the idea.
- **Per-user personalised suggestions** (e.g., "Senast beställda av dig") — not in ORD-08 scope. Could be a future refinement.
- **Time-windowed most-ordered** (last 30/90 days) — not in v1; demo dataset is small enough that all-time aggregation is fine.
- **Three-level hierarchical ATC select** (level-1 → level-2 → full code) — overkill for v1; the typeahead filter on the flat list does the same job.
- **Replacing `MedicationPickerSheet` with `MedicationSheet`** or vice-versa — both keep their distinct concerns (catalog add vs compose pick).
- **Renaming the `copyPermalink` handler** (carryover from Phase 7 F-01 fix scope) — out of phase.
- **Order numbers in picker suggestions** — Phase 10 adds order numbers; once shipped, picker rows can optionally surface the most-recent order number. Track as Phase 10 follow-on, not Phase 8.

</domain>

<decisions>
## Implementation Decisions

### CAT-09 — ATC combobox source

- **D-132:** **Distinct full-ATC-code list, typeahead combobox, free-text fallback.** New `GET /api/medications/atc-codes` returns `{codes: string[]}` — the `SELECT DISTINCT "atcCode" FROM "Medication" WHERE "atcCode" IS NOT NULL ORDER BY "atcCode" ASC` of the global catalog (~3,000 unique 7-char codes for the seeded NPL data). Component reuses the LakemedelFilter Popover+Command pattern: typing the input filters the visible list on every keystroke; pressing Enter on a free-text value not in the list still accepts it (so a brand-new-to-the-catalog code can be entered for a user-created medication). Two alternatives rejected: (a) level-2 groups only (~150 codes) loses the user's explicit "all unique codes" request and forces post-pick free-text input anyway; (b) three-level hierarchical select (group → subgroup → full) is more clicks for the same result the typeahead filter delivers.

- **D-133:** **Cache: `staleTime: Infinity` + explicit invalidation on `useCreateMedication.onSuccess`.** ATC codes are essentially static (new entries only appear when an admin user-creates a med with a fresh code, which is rare). `refetchOnWindowFocus: false`. The `useCreateMedication` hook gets one new line: `queryClient.invalidateQueries(['atc-codes'])` in its `onSuccess` next to the existing `['medications']` and `['dashboard', 'low-stock']` invalidations. Rejected: standard 30 s `staleTime` (wasteful for data that almost never changes) and fetch-once-per-session-no-invalidation (a newly-added code wouldn't appear until reload — mildly confusing for the user who just created it).

- **D-134:** **Wire the same combobox into BOTH MedicationSheet AND LakemedelFilter — single shared component.** Extract a reusable `AtcCodeCombobox.tsx` in `apps/web/src/components/` (mirroring the `TherapeuticClassCombobox.tsx` precedent from Phase 6 D-116). LakemedelFilter today drives its ATC control with the per-page `atcSuggestions?: string[]` prop and free-text input; Phase 8 deprecates that prop usage in favor of the global list. Filter behavior on LakemedelFilter is unchanged contract-side (URL param `?atc=` still accepts free text), but the UI gets the same typeahead. Anti-duplication pattern locked in by Phase 6 Warning-7 (one combobox file consumed by both URL-state and form-state callers).

### ORD-08 — Picker suggestions

- **D-135:** **Two-section deduplicated layout: "Mest beställda" (5) + "Lågt lager" (5).** Picker renders two visually separated headers with their respective top-5 rows. If the same `careUnitMedicationId` would appear in both, it shows in Lågt lager only and the most-ordered slot pulls the 6th-ranked entry. Total target: 10 rows; falls back to fewer when the vårdenhet has < 10 active CareUnitMedications. Rejected: single mixed list with weighted score (loses the "why is this here?" affordance — users benefit from seeing the reason a med is suggested) and three-section split with "Senast beställda av dig" (personalised slice is scope creep for v1; demo dataset is too small to validate).

- **D-136:** **All-time most-ordered window.** `SELECT cum.id, COUNT(ol.id) AS order_count FROM "CareUnitMedication" cum LEFT JOIN "OrderLine" ol ON ol."careUnitMedicationId" = cum.id JOIN "Order" o ON o.id = ol."orderId" WHERE cum."careUnitId" = $1 AND cum."deletedAt" IS NULL GROUP BY cum.id ORDER BY order_count DESC, ... LIMIT 5`. No date filter — demo dataset is small (≤ 4 seeded orders per vårdenhet today) and windowing adds complexity for no payoff. A future `?since=YYYY-MM-DD` query param is easy to add when production data warrants it.

- **D-137:** **Hide on first keystroke; reappear on input clear.** Suggestions block renders only when `searchQuery === ''`. Any keystroke (debounced by the existing 150 ms `useDebounce`) flips to results-view; clearing the input back to empty string flips back to suggestions. Matches the spirit of "suggestions live in the empty state" from the user's spec — the search-and-suggestions surface stays uncluttered.

- **D-138:** **New `GET /api/orders/picker-suggestions` endpoint, NOT a query-param extension of `/api/orders/picker-options`.** The existing picker-options endpoint returns the full list of stockable CareUnitMedications for the order's vårdenhet, used by the typeahead. Mixing the two response shapes (`{rows: [...]}` for typeahead vs `{mostOrdered: [...], lowStock: [...]}` for suggestions) into one endpoint would be a needless polymorphism. Separate endpoint, separate cache key `['order-picker-suggestions', orderId]`, same RBAC gate `requirePermission('order:create')`. Reuses `dashboard.service.listLowStockForUnit` for the Lågt lager half — no duplicate query logic.

### CAT-10 — Differentiated empty-state copy

- **D-139:** **Extend `GET /api/medications/search` response with `globalCatalogMatchCount: number`.** The endpoint today returns `{results: MedicationSearchResult[]}`. Phase 8 adds the new field — the count of NPL `Medication` rows matching `q` (name CONTAINS or atcCode STARTS WITH) BEFORE the D-45 careUnit-exclusion filter is applied. This is one additional aggregate query in the service, cached at request scope. FE branches the empty-state on `globalCatalogMatchCount === 0` vs `> 0`. Alternative rejected: running two FE queries (with/without D-45) — doubles request count and loses transactional consistency. Alternative also rejected: client-side count via separate `?countOnly=true` param — adds a special-case branch to an otherwise clean endpoint.

- **D-140:** **Empty-state copy locked verbatim.**
  - **`globalCatalogMatchCount === 0` (NPL no match):**
    - Heading: `Inget i NPL matchade »{q}«.`
    - Sub-line: `Kontrollera stavning eller skapa ett nytt läkemedel.`
  - **`globalCatalogMatchCount > 0 && results.length === 0` (D-45 exclusion):**
    - Heading: `Alla träffar finns redan i din vårdenhet.`
    - Sub-line: `Justera sökningen eller skapa ett nytt läkemedel.`
  - In both sub-lines, "skapa ett nytt läkemedel" is the existing `<Button variant="link">` that opens the user-create form. Renders inline within the sub-line text (matches current pattern, lines 1031-1040 of `MedicationSheet.tsx`).
  - The Swedish guillemets `»{q}«` quote the user's query for clarity. Stays close to existing audit-log message conventions.

</decisions>

<canonical_refs>
## Canonical Refs

- `.planning/ROADMAP.md` — Phase 8 row + Success Criteria; the source of truth for what must be true at phase end.
- `.planning/REQUIREMENTS.md` — REQ-ID definitions for CAT-09, CAT-10, ORD-08 (single source of truth for the requirement text). CAT-08 was dropped from Phase 8 scope at discussion time — remove from v1 in this commit.
- `.planning/PROJECT.md` — Core Value loop; the §6 interview questions the architecture must continue to answer.
- `.planning/phases/02-medication-catalog/02-CONTEXT.md` — Phase 2 D-44 (filters AND-wise), D-45 (D-45 careUnit-exclusion in search), D-58/D-70 (pick-only picker — preserved verbatim), defaultLowStockThreshold heuristic.
- `.planning/phases/03-draft-orders/03-CONTEXT.md` — Phase 3 D-58 (no Skapa nytt in MedicationPickerSheet), D-61 (picker row layout `min-h-[56px]`), D-44 precedent for 150 ms debounce.
- `.planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md` — Phase 6 D-115 (NPL meds keep their NPL identity), D-116 (combobox left of ATC + URL-as-state + single-file shared component), D-117 (server-side urgency sort), D-119 (three-layer dashboard refresh — the cache invalidation pattern we mirror), D-120 (dedicated endpoint with its own cache key).
- `apps/web/src/components/TherapeuticClassCombobox.tsx` — the canonical pattern for a Popover+Command typeahead reused across two callers; D-134 mirrors this structure for AtcCodeCombobox.
- `apps/web/src/routes/lakemedel/LakemedelFilter.tsx` — existing ATC control to update for D-134 reuse.
- `apps/web/src/routes/lakemedel/MedicationSheet.tsx` — Add-medication Sheet; CAT-09 ATC combobox swap + CAT-10 empty-state branch land here.
- `apps/web/src/routes/bestallningar/MedicationPickerSheet.tsx` — Compose-order picker; ORD-08 suggestions block lands here.
- `apps/api/src/routes/medications/search.ts` + `apps/api/src/services/medication.service.ts:searchGlobalMedications` — CAT-10 `globalCatalogMatchCount` extension lands here.
- `apps/api/src/services/dashboard.service.ts:listLowStockForUnit` — Reused by ORD-08's Lågt lager half. Do not duplicate the urgency-sort query.
- `apps/api/src/routes/orders/pickerOptions.ts` — Sibling endpoint to the new ORD-08 endpoint; keep them in the same directory.

</canonical_refs>

<code_context>
## Reusable Assets

- **Popover + Command typeahead pattern.** `TherapeuticClassCombobox.tsx` is the canonical implementation. AtcCodeCombobox (D-134) is the second instance; both share the shadcn primitives (`Popover`, `Command`, `CommandInput`, `CommandList`, `CommandItem`, `CommandEmpty`) and the URL-state-or-form-state agnostic `value` / `onChange` interface.
- **TanStack Query patterns.** Long-staleTime reference: the Phase 6 `useLowStockQuery` shows the three-layer refresh pattern; for D-133 we want the inverse — single-layer + explicit invalidation, no time-based refetch. Hook lives in `apps/web/src/features/medications/useAtcCodesQuery.ts` (new); query key `['atc-codes']`.
- **Mutation onSuccess invalidation list.** `useCreateMedication.onSuccess` in `apps/web/src/features/medications/useMedicationMutations.ts` already invalidates `['medications']` and `['dashboard', 'low-stock']`. D-133 adds one more line: `queryClient.invalidateQueries({ queryKey: ['atc-codes'] })`.
- **150 ms debounce.** `useDebounce` is inlined in `MedicationPickerSheet.tsx` (per D-58's "inline to avoid an extra shared file" note from Phase 3). Reused for the suggestions hide-on-keystroke gate (D-137).
- **Picker row layout (`min-h-[56px]` + UI-SPEC §9).** Reused verbatim for both Mest beställda and Lågt lager rows. Same `<LowStockBadge>` on the second row.
- **Server-side urgency sort.** `dashboard.service.listLowStockForUnit` already sorts by `(currentStock / lowStockThreshold) ASC` then `name ASC` (D-117 + 07-10's `LOWER(m."name") ASC` collation fix). ORD-08's Lågt lager half consumes that ordering as-is — no duplicate `$queryRaw`.
- **Audit-log auto-coverage.** New AtcCode endpoint is read-only (no audit). New picker-suggestions endpoint is read-only (no audit). MedicationSheet's create/update paths are already audit-covered by the Phase 5 `$extends` middleware — no new audit code needed.
- **EmptyState pattern.** Today's `MedicationSheet.tsx` lines 1031-1040 render the empty state inline (not via `<EmptyStateCard>`). CAT-10 keeps the inline pattern but branches the headline + sub-line text on `globalCatalogMatchCount`. Two-state component refactor would be unnecessary surface area.

## Patterns to Avoid

- **No new picker SHEET component.** Both surfaces extend their existing Sheet (MedicationSheet, MedicationPickerSheet). New components are limited to AtcCodeCombobox.tsx and the inline suggestions block markup inside MedicationPickerSheet.
- **No URL-as-state for picker suggestions.** The picker is modal-scoped; suggestions are derived from BE, not from URL parameters. Don't push `?suggestions=` or similar.
- **No new audit actions.** Read-only endpoints don't produce audit events. The existing middleware coverage of `Medication.update` / `Order.update` / `OrderLine.create|delete|update` continues unchanged.
- **No premature performance optimisation on the ATC codes query.** `SELECT DISTINCT atcCode FROM Medication ORDER BY atcCode` on a 43k-row table runs in milliseconds. No materialized view, no Redis cache, no scheduled refresh.

</code_context>

<deferred>
## Deferred Ideas

- **CAT-08 — always-visible "Skapa nytt läkemedel" CTA.** Dropped at discussion time. The picker stays pick-only with "Skapa nytt" surfacing in the CAT-10 empty-state link only. If reviewer feedback flags this in the interview, the reversal is one component change in `MedicationSheet.tsx` (promote the existing `<Button variant="link">` to an always-rendered primary tile above the search input). Capture as Phase 8 deferred so the requirement isn't silently lost from v1 documentation.
- **Per-user "Senast beställda av dig" suggestions section.** Possible third section for ORD-08; needs `Order.createdByUserId` filter + last-N aggregation. Out of v1 scope.
- **Time-windowed most-ordered (`?since=` query param).** Easy add when production data accumulates. v2 candidate.
- **ATC level-1 / level-2 grouping in the combobox.** Nice for hierarchical narrowing if the flat 3,000-code list becomes unwieldy. Today the typeahead filter handles it; revisit at scale.
- **Suggestions analytics.** Track which suggestion-row clicks vs which search-result clicks to inform future ranking. Out of v1 scope; needs the deferred analytics infra (no event bus today).
- **Order number in picker rows.** Once Phase 10 (ORD-11) ships, picker rows could surface the most-recent order number per medication. Track as Phase 10 follow-on, not Phase 8.

</deferred>

---

*Discussed: 2026-05-24*
*Discussion log: 08-DISCUSSION-LOG.md*
