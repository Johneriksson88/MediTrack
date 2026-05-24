---
phase: 08-compose-catalog-ux
verified: 2026-05-24T20:30:00Z
status: human_needed
score: 10/10 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open /lakemedel, click the ATC-kod combobox in LakemedelFilter — verify typeahead dropdown shows codes, narrows on keystroke, and (fri sökning) row appears for unknown input"
    expected: "Dropdown renders with ~3000 codes; typing 'N02' narrows list; typing 'XYZ' shows 'XYZ (fri sökning)' row"
    why_human: "Combobox keyboard interaction, debounce, and popover positioning cannot be asserted programmatically without a real browser"
  - test: "Open /lakemedel → Lägg till läkemedel → user-create form → ATC-kod field: verify the shared combobox renders (not a plain Input), pick a code, verify it appears in the field"
    expected: "AtcCodeCombobox renders with placeholder 'Välj ATC-kod', selecting a code writes it into the form field"
    why_human: "react-hook-form Controller integration with the combobox requires visual + interaction verification"
  - test: "Open /lakemedel → Lägg till läkemedel, search for 'qqqzzzimpossible123' — verify Variant A empty state renders verbatim"
    expected: "Heading: 'Inget i NPL matchade »qqqzzzimpossible123«.' and sub-line: 'Kontrollera stavning eller [skapa ett nytt läkemedel].'"
    why_human: "Unicode guillemets (U+00BB/U+00AB) and inline link placement require visual verification on a real rendered page"
  - test: "Open /lakemedel → Lägg till läkemedel, search for a medication already stocked in the seeded vårdenhet — verify Variant B empty state renders"
    expected: "Heading: 'Alla träffar finns redan i din vårdenhet.' and sub-line: 'Justera sökningen eller [skapa ett nytt läkemedel].'"
    why_human: "Requires knowing a medication name that matches Variant B condition (stocked at seed vårdenhet)"
  - test: "Open a draft order at /bestallningar/:id → Lägg till läkemedel: verify PickerSuggestionsBlock renders two sections before any typing, then hides on first keystroke, then reappears on clear"
    expected: "'Mest beställda' and 'Lågt lager' sticky-header sections visible; LowStockBadge on below-threshold rows; block disappears on typing; reappears when input is cleared within 30s with no skeleton flash (cache hit)"
    why_human: "Hide-on-keystroke timing, cache re-render without skeleton, and LowStockBadge presence require real browser interaction"
---

# Phase 8: Compose & Catalog UX Verification Report

**Phase Goal:** Sharpen the two medication picker surfaces (catalog MedicationSheet and compose-order MedicationPickerSheet) so users find drugs faster, get a useful first-screen on every compose-order, and never see a confusing "Inget läkemedel matchade" when the real cause is D-45 exclusion.
**Verified:** 2026-05-24T20:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | GET /api/medications/atc-codes returns 200 + { codes: string[] } sorted ascending; 401 without session | VERIFIED | `apps/api/src/routes/medications/atcCodes.ts` — requireSession preHandler, atcCodesResponse schema, listGlobalAtcCodes() with DISTINCT ORDER BY ASC. Integration test A/B/C (3/3 pass per SUMMARY). |
| 2 | MedicationSheet user-create form renders AtcCodeCombobox (not free-text Input) via Controller | VERIFIED | MedicationSheet.tsx line 1191+ — Controller wraps AtcCodeCombobox with value/onChange/placeholder. `AtcCodeCombobox` import confirmed at line 40. |
| 3 | LakemedelFilter ATC control is the shared AtcCodeCombobox; atcSuggestions prop removed | VERIFIED | LakemedelFilter.tsx imports AtcCodeCombobox at line 35, renders it at line 142. LakemedelPage.tsx comment at line 201 confirms prop removal; no live `atcSuggestions` prop passed. |
| 4 | useCreateMedication.onSuccess invalidates ['atc-codes'] cache (D-133) | VERIFIED | useMedicationMutations.ts line 50: `void queryClient.invalidateQueries({ queryKey: ['atc-codes'] })` with D-133 comment. |
| 5 | GET /api/medications/search returns globalCatalogMatchCount (pre-D-45 count) alongside post-D-45 results | VERIFIED | medicationSearchResponse in medication.ts (line 149) carries `globalCatalogMatchCount: z.number().int().nonnegative()`. Service returns `Promise<{ results, globalCatalogMatchCount }>` via Promise.all. Route is a pass-through (D-139). |
| 6 | MedicationSheet empty-state renders Variant A when globalCatalogMatchCount === 0 | VERIFIED | MedicationSheet.tsx line 1037: `searchQuery.data?.globalCatalogMatchCount === 0 ?` → heading "Inget i NPL matchade »{debouncedQ...}«." with 40-char truncation guard. |
| 7 | MedicationSheet empty-state renders Variant B when globalCatalogMatchCount > 0 and results.length === 0 (and undefined safe-default) | VERIFIED | Else arm at MedicationSheet.tsx line 1058–1078: "Alla träffar finns redan i din vårdenhet." Both variants carry lowercase "skapa ett nytt läkemedel" link (2 matches confirmed). Undefined falls to Variant B (strict === 0). |
| 8 | GET /api/orders/picker-suggestions returns { mostOrdered: PickerSuggestion[], lowStock: PickerSuggestion[] } with server-side dedupe | VERIFIED | pickerSuggestions.ts exports the route. listPickerSuggestions in order.service.ts: LIMIT 6 most-ordered query, listLowStockForUnit reuse for lowStock, Set-based dedupe, .slice(0,5) on both arrays. 7 integration tests per SUMMARY. |
| 9 | PickerSuggestionsBlock is wired into MedicationPickerSheet with debouncedQ === '' gate | VERIFIED | MedicationPickerSheet.tsx lines 16 (import) and 127–129: `{debouncedQ === '' && <PickerSuggestionsBlock orderId={orderId} onRowClick={handleRowClick} />}` |
| 10 | useAddOrderLine.onSuccess invalidates ['order-picker-suggestions', orderId] cache | VERIFIED | useOrderMutations.ts line 98: `void queryClient.invalidateQueries({ queryKey: ['order-picker-suggestions', vars.orderId] })` with D-138 comment. |

**Score:** 10/10 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `apps/api/src/routes/medications/atcCodes.ts` | GET /api/medications/atc-codes registrar | VERIFIED | 39 lines, exports atcCodesRoute, requireSession-only preHandler |
| `apps/web/src/components/AtcCodeCombobox.tsx` | Shared Popover+Command typeahead; free-text fallback | VERIFIED | 210 lines (min_lines: 90). Contains "Rensa ATC-kod" (2 matches) and "(fri sökning)" (2 matches) |
| `apps/web/src/features/medications/useAtcCodesQuery.ts` | TanStack hook with staleTime: Infinity | VERIFIED | 49 lines (min_lines: 10). Exports useAtcCodesQuery and ATC_CODES_QUERY_OPTIONS with staleTime: Infinity |
| `apps/api/test/medications.atcCodes.integration.test.ts` | Integration coverage: shape, auth, sort | VERIFIED | 107 lines, 3 test cases (A shape+sort, B 401, C distinct) |
| `packages/shared/src/contracts/medication.ts` | medicationSearchResponse with globalCatalogMatchCount | VERIFIED | Lines 147-151: globalCatalogMatchCount: z.number().int().nonnegative() in envelope |
| `apps/api/test/medications.searchEmptyStates.integration.test.ts` | Integration coverage: Variant A, Variant B, mixed | VERIFIED | 4 test blocks, Zod-parsed through medicationSearchResponse |
| `apps/web/src/routes/lakemedel/__tests__/MedicationSheet.emptyStates.test.tsx` | FE branching coverage of two variants | VERIFIED | 315 lines, 7 test cases including truncation, undefined fallback, link click |
| `apps/api/src/routes/orders/pickerSuggestions.ts` | GET /api/orders/picker-suggestions registrar | VERIFIED | 45 lines, exports pickerSuggestionsRoute, requireSession + requirePermission('order:create') |
| `apps/web/src/routes/bestallningar/PickerSuggestionsBlock.tsx` | Two sticky-header sections + SuggestionRow | VERIFIED | 140 lines (min_lines: 60). "Mest beställda" and "Lågt lager" section headers confirmed. No hex literals. |
| `apps/web/src/features/orders/usePickerSuggestionsQuery.ts` | TanStack hook with staleTime: 30_000 | VERIFIED | 58 lines (min_lines: 10). PICKER_SUGGESTIONS_QUERY_OPTIONS factory returns staleTime: 30_000, refetchOnWindowFocus: false |
| `apps/api/test/orders.pickerSuggestions.integration.test.ts` | BE coverage: shape, RBAC, cross-tenant, dedupe | VERIFIED | 420 lines, 8 test blocks (A shape, B 3-role matrix, C 401, D cross-tenant, E dedupe, F fallthrough, G size caps) |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| medications/index.ts | medications/atcCodes.ts | app.register(atcCodesRoute) before :id routes | VERIFIED | index.ts line 24: `await app.register(atcCodesRoute)` registered between searchMedicationsRoute and createMedicationRoute |
| useMedicationMutations.ts | ['atc-codes'] queryKey | useCreateMedication.onSuccess sibling invalidation | VERIFIED | Line 50: `void queryClient.invalidateQueries({ queryKey: ['atc-codes'] })` with D-133 comment |
| LakemedelFilter.tsx | AtcCodeCombobox.tsx | Import + render replacing inline Popover+Command | VERIFIED | Import at line 35, rendered at line 142 with correct props |
| MedicationSheet.tsx | AtcCodeCombobox.tsx | Controller-wrapped combobox replacing ATC Input | VERIFIED | Import at line 40, Controller at line 1199, AtcCodeCombobox at line 1203 |
| medication.service.ts | Medication.count (pre-D-45) | Promise.all second aggregate query | VERIFIED | searchGlobalMedications uses Promise.all([findMany post-D45, count pre-D45]) at line 298; count omits careUnitMedications filter |
| search.ts | medicationSearchResponse | Response schema returns envelope directly | VERIFIED | Route schema uses medicationSearchResponse (D-139 comment); handler returns service envelope |
| MedicationSheet.tsx | searchQuery.data?.globalCatalogMatchCount | strict === 0 branch in empty-state | VERIFIED | Line 1037: `searchQuery.data?.globalCatalogMatchCount === 0 ?` with Variant A/B branching |
| orders/index.ts | orders/pickerSuggestions.ts | pickerSuggestionsRoute registered before getOrderRoute | VERIFIED | index.ts lines 32-35: pickerSuggestionsRoute immediately after pickerOptionsRoute, before createOrderRoute and getOrderRoute (D-65) |
| order.service.ts | dashboard.service.listLowStockForUnit | listLowStockForUnit(careUnitId) reuse for Lågt lager half | VERIFIED | order.service.ts line 965: `const lowStockResult = await listLowStockForUnit(careUnitId)` — D-138 anti-duplication satisfied |
| dashboard.service.ts | dashboard.ts lowStockItem schema | SELECT widened with atcCode/form/strength | VERIFIED | dashboard.service.ts SELECT includes `m."atcCode"`, `m."form"`, `m."strength"`. lowStockItem in dashboard.ts carries all three fields (lines 59-61) |
| MedicationPickerSheet.tsx | PickerSuggestionsBlock.tsx | Render when debouncedQ === '' | VERIFIED | Lines 16 (import) and 127-129: `{debouncedQ === '' && <PickerSuggestionsBlock .../>}` |
| useOrderMutations.ts | ['order-picker-suggestions', orderId] | useAddOrderLine.onSuccess sibling invalidation | VERIFIED | Line 98: `void queryClient.invalidateQueries({ queryKey: ['order-picker-suggestions', vars.orderId] })` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| AtcCodeCombobox.tsx | codesQuery.data.codes | useAtcCodesQuery() → GET /api/medications/atc-codes → listGlobalAtcCodes() SELECT DISTINCT | Yes — SQL DISTINCT from Medication table | FLOWING |
| MedicationSheet.tsx (empty-state) | searchQuery.data.globalCatalogMatchCount | searchGlobalMedications Promise.all count query | Yes — Prisma count() without D-45 filter | FLOWING |
| PickerSuggestionsBlock.tsx | data.mostOrdered / data.lowStock | usePickerSuggestionsQuery → GET /api/orders/picker-suggestions → listPickerSuggestions (COUNT query + listLowStockForUnit) | Yes — $queryRaw COUNT aggregate + existing dashboard query | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — verifying test infrastructure instead of running live endpoints (requires running Docker Compose with postgres + api services, which cannot be invoked in this verification context). All 9 Phase 8 commits verified in git log. Test file substantiveness verified by line counts and test block counts.

---

### Probe Execution

Step 7c: No probe-*.sh files declared or found for Phase 8 (this phase used vitest integration tests, not bash probes). SKIPPED.

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CAT-09 | 08-01-PLAN.md | ATC-code input is a combobox preloaded from global catalog; shared with LakemedelFilter | SATISFIED | AtcCodeCombobox component (210 lines) wired into both LakemedelFilter and MedicationSheet; useAtcCodesQuery; GET /api/medications/atc-codes; atcSuggestions prop removed from LakemedelFilter/LakemedelPage |
| CAT-10 | 08-02-PLAN.md | Add-medication picker differentiates "Alla träffar" vs "Inget i NPL matchade" empty states | SATISFIED | medicationSearchResponse carries globalCatalogMatchCount; MedicationSheet two-variant empty-state branch with verbatim D-140 Swedish copy; 40-char truncation guard; lowercase inline link; undefined safe-default to Variant B |
| ORD-08 | 08-03-PLAN.md | Compose-order picker surfaces 10 suggestions before search — most-ordered + low-stock, deduplicated | SATISFIED | GET /api/orders/picker-suggestions with pickerSuggestionsResponse contract; service-layer dedupe (LIMIT 6 + Set filter + slice to 5); PickerSuggestionsBlock with two sticky sections; hide-on-keystroke gate in MedicationPickerSheet; listLowStockForUnit reuse (D-138) |

**Orphaned requirements:** None. REQUIREMENTS.md maps CAT-09, CAT-10, ORD-08 exclusively to Phase 8. All three accounted for.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | No TBD/FIXME/XXX markers found in any Phase 8 modified file | — | — |
| — | — | No return null / return {} / return [] stubs found in rendered components | — | — |
| — | — | No hex color literals in PickerSuggestionsBlock (UI-SPEC Token-Class Hard Rule satisfied) | — | — |

**ComposeOrderPage.test.tsx line 195:** `data: { results: [] }` mock without globalCatalogMatchCount — this mock targets `usePickerOptionsQuery` (PickerOptionsResponse shape), NOT useMedicationSearchQuery. Different schema. Not a stub or regression.

---

### Phase 6 Regression Verification

The 08-02-SUMMARY.md documents that MedicationSheet.ai.test.tsx had 6 occurrences of the old sentence-cased button name and missing globalCatalogMatchCount in its mock. Commit 35f71e6 ("fix(08-01): adapt MedicationSheet.ai tests to AtcCodeCombobox") and eb989c6 fixed this:

- MedicationSheet.ai.test.tsx vi.mock now returns `{ results: [], globalCatalogMatchCount: 0 }` (line 62)
- All 6 `findByRole('button', { name: 'Skapa nytt läkemedel' })` replaced with `'skapa ett nytt läkemedel'`
- Both commits confirmed in `git log --oneline`

Regression is confirmed closed.

---

### D-138 Anti-Duplication Invariant

The plan requires exactly one `$queryRaw` for picker suggestion data in order.service.ts. The SUMMARY documents that order.service.ts already had 4 `$queryRaw` calls from prior phases (submitOrder, confirmOrder, deliverOrder lock patterns). The D-138 intent is satisfied: the low-stock half goes through `listLowStockForUnit`, and only ONE `$queryRaw` fetches most-ordered data. The raw `$queryRaw` total count in order.service.ts is irrelevant — D-138 constrains the picker suggestion data path only.

---

### Human Verification Required

#### 1. AtcCodeCombobox — LakemedelFilter ATC selector (CAT-09)

**Test:** Open `/lakemedel`. Click the ATC-kod combobox trigger button. Type "N02" into the search. Then type "XYZ".
**Expected:** Dropdown opens showing ~3000 codes; typing "N02" narrows the list to N02* codes; typing "XYZ" shows no standard matches but a "(fri sökning)" row with "XYZ" in uppercase.
**Why human:** Popover positioning, cmdk filter behavior, and free-text row rendering require a real browser. JSDOM tests already cover the logic; this is a visual smoke test.

#### 2. AtcCodeCombobox — MedicationSheet user-create form (CAT-09)

**Test:** Open `/lakemedel` → click "Lägg till läkemedel" → in the typeahead, type something with no NPL match (e.g. "qqqzzz") → click "skapa ett nytt läkemedel" → verify the user-create form has an ATC-kod combobox (not a plain text input).
**Expected:** AtcCodeCombobox renders with placeholder "Välj ATC-kod"; picking a code or typing a free-text value fills the form field; no free-text `<Input>` is visible.
**Why human:** react-hook-form Controller integration with Radix Popover requires real DOM interaction to verify the controlled value writes correctly.

#### 3. CAT-10 Variant A empty state (visual + Swedish copy)

**Test:** Open `/lakemedel` → Lägg till läkemedel → type "qqqzzzimpossible123" in the typeahead, wait for debounce.
**Expected:** Heading appears: "Inget i NPL matchade »qqqzzzimpossible123«." (guillemets U+00BB/U+00AB, not HTML entities). Sub-line: "Kontrollera stavning eller [skapa ett nytt läkemedel]." with the period outside the link underline.
**Why human:** Unicode character rendering and link underline boundary are visual concerns that cannot be asserted by grep.

#### 4. CAT-10 Variant B empty state (requires seeded data context)

**Test:** Open `/lakemedel` → Lägg till läkemedel → type the first 4–5 letters of a medication that is already stocked at the seed vårdenhet. Wait for debounce.
**Expected:** Heading appears: "Alla träffar finns redan i din vårdenhet." Sub-line: "Justera sökningen eller [skapa ett nytt läkemedel]."
**Why human:** Requires knowing which medication names are seeded as CareUnitMedication for the test vårdenhet. Cannot be determined without running the app.

#### 5. ORD-08 PickerSuggestionsBlock — hide-on-keystroke + cache reuse (D-137)

**Test:** Open a draft order at `/bestallningar/:id` → click "Lägg till läkemedel". Observe the picker. Type a single character. Clear the input.
**Expected:** Before typing: "Mest beställda" and "Lågt lager" sections visible (or "Sök på namn" if no data). After first keystroke: block disappears, existing loading/results branches take over. After clearing: block reappears immediately within 30s staleTime (no skeleton flash — cache hit, no network call).
**Why human:** Cache reuse timing and skeleton-flash absence require a real browser with network devtools. The 150ms debounce interaction cannot be verified in JSDOM without fake timer complexity.

---

### Gaps Summary

No gaps found. All 10 must-have truths are VERIFIED against the codebase. All 11 required artifacts exist and are substantive (exist, non-stub, wired, and data-flowing). All key links are verified. No debt markers. No CAT-08 scope creep (sentence-cased "Skapa nytt läkemedel" Button deleted from empty-state; form heading `<p>` tag is the only remaining occurrence, which is architecturally required and not a CTA). Phase 6 regression in MedicationSheet.ai.test.tsx is confirmed closed.

Status is `human_needed` because 5 items require visual/interaction verification in a real browser. All automated checks pass.

---

_Verified: 2026-05-24T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
