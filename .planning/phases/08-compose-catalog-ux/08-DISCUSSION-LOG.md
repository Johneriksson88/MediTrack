# Phase 8: Compose & Catalog UX — Discussion Log

**Discussed:** 2026-05-24
**Discuss mode:** discuss (default)
**Outcome:** 3 gray areas resolved → CONTEXT.md (D-132 through D-140); CAT-08 dropped from scope.

---

## Domain Boundary Presented

> Sharpen the two medication picker surfaces — `MedicationSheet` (add-to-catalog) and `MedicationPickerSheet` (add-to-order-draft) — plus the ATC input UX and the differentiated empty states. Targets: CAT-08, CAT-09, CAT-10, ORD-08.

## Carrying Forward From Prior Phases

- D-116 — single-source combobox component pattern (TherapeuticClassCombobox shared by LakemedelFilter + MedicationSheet) → applied to AtcCodeCombobox in D-134.
- D-39, D-44 — URL-deep-linkable filter conventions → noted; not applicable to the modal-scoped picker suggestions.
- D-117, D-119 — dashboard low-stock service is careUnit-scoped and urgency-sorted → reused by ORD-08 Lågt lager half (D-135).
- D-58 — MedicationPickerSheet intentionally pick-only → preserved; CAT-08 "Skapa nytt" change was about MedicationSheet (different dialog), not the picker.
- D-95, D-97 — Phase 5 audit middleware auto-captures Medication/Order field changes → no new audit code required for Phase 8.

## Area Selection

Multi-select prompt: "Which gray areas do you want to discuss for Phase 8?"

User selected (3 of 3 substantive options):
1. ATC combobox source
2. ORD-08 suggestions ranking
3. "Skapa nytt" CTA placement (CAT-08) + empty-state copy (CAT-10)

---

## Area 1 — ATC Combobox Source (CAT-09)

### Q1: ATC source granularity

**Options presented:**
- Full unique ATC codes (~3,000 7-char codes) (recommended)
- Level-2 groups only (~150 codes)
- Hierarchical select (level-1 → level-2 → full)

**User selected:** Full unique codes — with explicit refinement: *"user can type custom atc code but selectable auto complete suggestions from unique list pop up on every keystroke"*

**Captured as:** D-132. Free-text fallback retained for codes not yet in the catalog; typeahead pops the filtered list as user types.

### Q2: Cache aggressiveness

**Options presented:**
- Long staleTime, no auto-refetch (recommended)
- Standard 30 s staleTime
- Fetch once per session, no invalidation

**User selected:** Long staleTime, no auto-refetch.

**Captured as:** D-133. `staleTime: Infinity` + explicit invalidation inside `useCreateMedication.onSuccess`.

### Q3 (Claude discretion): Component reuse

Implementation-level decision Claude made without asking the user: extract a single shared `AtcCodeCombobox.tsx` consumed by both MedicationSheet (Phase 8 new wiring) AND LakemedelFilter (Phase 2 existing wiring, deprecating its per-page `atcSuggestions?` prop). Follows the D-116 Phase 6 "Warning-7 anti-duplication" pattern.

**Captured as:** D-134.

---

## Area 2 — ORD-08 Suggestions Ranking

### Q1: Composition & ranking

**Options presented:**
- Two sections, deduplicated: Mest beställda (5) + Lågt lager (5) (recommended)
- Single mixed list, weighted score
- Three sections of ~3 each (most-ordered, low-stock, recent)

**User selected:** Two sections, deduplicated.

**Captured as:** D-135. Dedupe rule: same `careUnitMedicationId` appears in Lågt lager only; most-ordered slot pulls the 6th-ranked.

### Q2: Lookback window for "most-ordered"

**Options presented:**
- All time (recommended)
- Last 30 days
- Last 90 days

**User selected:** All time.

**Captured as:** D-136. No date filter on the `OrderLine` count aggregation. `?since=` param noted as future addition.

### Q3: Hide rule

**Options presented:**
- Hide on first keystroke; reappear on clear (recommended)
- Always visible above search results

**User selected:** Hide on first keystroke; reappear on clear.

**Captured as:** D-137.

### Q4 (Claude discretion): Endpoint shape

Implementation-level decision: new `GET /api/orders/picker-suggestions` endpoint rather than a query-param extension of the existing picker-options endpoint. Avoids polymorphic response shape. Reuses `dashboard.service.listLowStockForUnit` for the Lågt lager half.

**Captured as:** D-138.

---

## Area 3 — "Skapa nytt" CTA Placement (CAT-08) + Empty-State Copy (CAT-10)

### Q1: Skapa nytt CTA placement

**Options presented:**
- Primary tile above search input (recommended)
- Secondary text-link in dialog header
- Fixed footer button alongside Spara/Avbryt

**User selected:** *"Skip this change. Original thought was pick only and let's keep it like that"*

**Captured as:** CAT-08 dropped from Phase 8 scope and from v1 REQUIREMENTS.md (this commit). Idea preserved in `<deferred>` section of CONTEXT.md and not silently lost. The existing in-empty-state "Skapa nytt läkemedel" link stays in place; behavior is unchanged from current.

**Scope adjustment:** Phase 8 narrows from 4 REQ-IDs (CAT-08/09/10, ORD-08) to 3 (CAT-09, CAT-10, ORD-08).

### Q2: Empty-state copy

**Options presented:**
- Use proposed strings (recommended) — (a) "Alla träffar finns redan i din vårdenhet." (b) "Inget i NPL matchade »{q}«."
- Use the strings but skip the sub-line
- Custom — user provides both

**User selected:** Use the strings I proposed (recommended).

**Captured as:** D-140. Both empty states include a sub-line with a "skapa ett nytt läkemedel" inline link (which already exists in current code — preserved per CAT-08 skip).

### Q3 (Claude discretion): How does the FE distinguish the two empty states?

Implementation-level decision: extend `GET /api/medications/search` response with a `globalCatalogMatchCount: number` field — the unfiltered count of NPL `Medication` rows matching `q` before the D-45 careUnit-exclusion is applied. One additional aggregate query in the service layer; FE branches the empty-state on the count.

**Captured as:** D-139.

---

## Scope Creep Flagged & Captured as Deferred

- **Per-user "Senast beställda av dig" suggestions** — proposed as third ORD-08 section, rejected during Q1 of Area 2; captured in `<deferred>`.
- **Time-windowed most-ordered** — rejected during Q2 of Area 2; captured as `?since=` future-add.
- **Hierarchical ATC select** — rejected during Q1 of Area 1; captured in `<deferred>`.
- **Order numbers in picker rows** — surfaced as a natural Phase 10 follow-on; captured in `<deferred>`.

---

*Logged: 2026-05-24*
