# Phase 2: Medication Catalog - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-20
**Phase:** 2-Medication Catalog
**Areas discussed:** MVP slice ordering, CRUD form UX (Sheet/Dialog/Page), Soft-delete schema future-proofing, Low-stock indicator + threshold UX

---

## MVP slice ordering

### Q1 — First thin vertical slice for Phase 2

| Option | Description | Selected |
|--------|-------------|----------|
| Read-only list first, then layer in | Slice 1 = schema + GET + list. Slice 2 = search/filter. Slice 3 = create. Slice 4 = edit/threshold. Slice 5 = soft-delete. Most defensible commit narrative; each slice independently demoable. | |
| Create-first vertical loop | Slice 1 = schema + POST + create form + list shows new row. Slice 2 = search/filter. Slice 3 = edit/threshold. Slice 4 = delete. Demonstrates full write path early. | |
| List + create together as Slice 1 | Slice 1 = schema + GET + POST + list + create form. Slice 2 = search/filter. Slice 3 = edit/threshold/indicator. Slice 4 = soft-delete. Fewer slices, each does more. | ✓ |

**User's choice:** List + create together as Slice 1
**Notes:** Trades atomicity for fewer total commits but each slice is end-to-end demoable from Slice 1 onwards.

### Q2 — Commit granularity within a slice

| Option | Description | Selected |
|--------|-------------|----------|
| One commit per plan (chunky, narrative) | Each plan ships as a single atomic commit. ~4 commits total. Cleanest story but each commit is large. | |
| Multi-commit per plan, one per logical task | Each plan's tasks commit separately. ~15-20 commits. Closer to how Phase 1 actually shipped; revertable in tiny steps. | ✓ |
| By layer (BE first, then FE) | Commit migration + BE for the whole phase, then FE for the whole phase. Breaks the vertical-slice story. | |

**User's choice:** Multi-commit per plan, one per logical task
**Notes:** Reviewer reads commits (brief §5). Phase 1 averaged 3-5 commits per plan; Phase 2 repeats that pattern.

### Q3 — Where do secondary features land in the slice order

| Option | Description | Selected |
|--------|-------------|----------|
| Slice 1 ships list+create with threshold field + indicator already wired | Threshold is part of the create form from day one; low-stock indicator renders on Slice 1's list immediately. Visual demo lands first. | ✓ |
| Defer threshold + indicator to a later slice | Slice 1 truly minimal; interview-friendly visual lands later. | |
| Threshold in Slice 1, but indicator deferred to Slice 3 | Splits threshold ownership across slices; loses Slice 1 visual punch. | |

**User's choice:** Slice 1 ships list+create with threshold field + indicator already wired
**Notes:** Locks in the most-visible visual moment (success criterion #1) from the first demoable slice.

### Q4 — Sample medications for the seed script

| Option | Description | Selected |
|--------|-------------|----------|
| Ship in Phase 2 with ~8-12 realistic Swedish medications | Hand-rolled small seed. Demos meaningfully without manual entry. | |
| Ship 2-3 medications in Phase 2, expand in Phase 7 | Just enough to verify list+indicator. | |
| Empty catalog — demo by creating one live | No seed. Slice 1's create form IS the demo. | |
| Other (user-provided) | User provided `c:\Projekt\MediTrack\local\lakemedel.csv` — NPL CSV with 43 538 approved Swedish medications. Replaces all three options. | ✓ |

**User's choice:** Use the NPL CSV (`local/lakemedel.csv`).
**Notes:** Inspecting the CSV revealed 43 538 rows, 6 columns (`nplid;namn;atc_kod;form;form_kod;styrka`), 501 distinct `form` values. This forces (a) `form` cannot be a Prisma enum — must be String + curated filter list, (b) server-side pagination + indexed search are mandatory, not nice-to-haves. Three follow-up sub-questions surfaced (seed scope, CSV location, stock/threshold generation) — all answered below.

### Q5 — Seed scope (full vs subset)

| Option | Description | Selected |
|--------|-------------|----------|
| Seed ALL 43 538 rows | Real demo signal at realistic load. ~10-30s seed time on first `docker compose up`. | ✓ |
| Seed a curated subset (~200-500 rows) | Fast `docker compose up` but weaker search/filter demo. | |
| Seed full set in prod-like mode, small set by default | `SEED_FULL=1` knob. Best of both but adds a documented knob. | |

**User's choice:** Seed all 43 538 rows.

### Q6 — CSV location

| Option | Description | Selected |
|--------|-------------|----------|
| Commit to `apps/api/prisma/seed-data/lakemedel.csv` | One-command demo; 3.3 MB is fine; NPL is publicly redistributable. | ✓ |
| Keep in `local/`, gitignored, document download in README | Repo stays smaller; adds a failure mode in live demo. | |
| Commit a smaller curated sample, document full-CSV download separately | Hybrid; contradicts "seed all 43k" answer. | |

**User's choice:** Commit to `apps/api/prisma/seed-data/lakemedel.csv`.

### Q7 — Stock + threshold generation

| Option | Description | Selected |
|--------|-------------|----------|
| Deterministic PRNG seeded from `nplId`, ~8% below threshold | Reproducible across re-seeds; ~8% demonstrates the indicator without being noisy. | ✓ |
| Random (Math.random), ~10% below threshold | Non-deterministic; screenshots in README differ from live demo. | |
| All stock = 50, threshold = 10, force 5 specific rows below | Most controlled but "looks fake" because every row has identical stock. | |

**User's choice:** Deterministic PRNG, ~8% below threshold.

---

## CRUD form UX (Sheet/Dialog/Page)

### Q1 — Create + edit form rendering

| Option | Description | Selected |
|--------|-------------|----------|
| shadcn `<Sheet>` — right-slide desktop, bottom-sheet mobile | Adapts per breakpoint; best mobile ergonomics. URL doesn't change. | ✓ |
| Separate routes (`/lakemedel/ny`, `/lakemedel/:id/redigera`) | URL bookmarkable, deep-link friendly. More route boilerplate. | |
| shadcn `<Dialog>` — centered modal both sides | Classic modal. Loses URL state and some mobile feel. | |
| Mixed: Sheet for create, page for edit | Inconsistency cost. | |

**User's choice:** shadcn `<Sheet>` — right-slide desktop, bottom-sheet mobile.

### Q2 — Where the "Lägg till läkemedel" trigger lives

| Option | Description | Selected |
|--------|-------------|----------|
| Primary button top-right desktop, FAB bottom-right mobile | Native mobile pattern; FAB clears the bottom tab bar + safe-area inset. | ✓ |
| Always top-right button (no FAB) | Simpler, more consistent. Costs vertical space at 360px. | |
| Inline at top of list (sticky) | Mobile-friendly; desktop feels odd. | |

**User's choice:** Primary button top-right desktop, FAB bottom-right mobile.

### Q3 — Edit affordance on rows/cards

| Option | Description | Selected |
|--------|-------------|----------|
| Whole row/card click opens edit Sheet | Largest tap target; matches "peek into details" mental model. For `sjuksköterska`, opens in read-only mode. | ✓ |
| Explicit "Redigera" button + "Ta bort" kebab per row | More discoverable but clutters the row at 360px. | |
| Row click → detail view → Edit button | Two-step; cleaner separation but heavier for v1. | |

**User's choice:** Whole row/card click opens edit Sheet.

### Q4 — Delete control + confirmation

| Option | Description | Selected |
|--------|-------------|----------|
| Inside edit Sheet footer, left-aligned destructive + AlertDialog confirm | Keeps destructive actions out of the row; explicit edit-mode entry required. Cancel-focused default. | ✓ |
| Per-row kebab menu (⋮) with Ta bort + AlertDialog confirm | Faster for bulk cleanup but more accidents at 360px. | |
| No delete in v1 (Ta bort flag in DB, no UI) | Violates CAT-07. | |

**User's choice:** Inside edit Sheet footer, left-aligned destructive + AlertDialog confirm.

---

## Soft-delete schema future-proofing

### Q1 — Where do stock + threshold live? Medication table shape

| Option | Description | Selected |
|--------|-------------|----------|
| Global Medication + per-vårdenhet CareUnitMedication join | One Medication row per drug (~43k); per-vårdenhet stock/threshold on the join. Scales linearly to 50 vårdenheter. Brief §6 scaling answer is schema-level. | ✓ |
| Per-vårdenhet Medication (single table, careUnitId column) | Simpler but 2.2M rows at 50 vårdenheter; metadata duplication. Contradicts §6 prep stance. | |
| Global Medication only; stock+threshold as columns on Medication | Violates STK-03 ("threshold per vårdenhet"). Listed for completeness. | |

**User's choice:** Global Medication + per-vårdenhet CareUnitMedication join.
**Notes:** This is the chunky architectural decision of Phase 2. Forced by STK-03 + the 43k NPL row count + the brief §6 "scale to 50 vårdenheter" question.

### Q2 — Delete semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Delete = remove the CareUnitMedication row only (soft); global Medication stays | "This vårdenhet no longer stocks it." Cleanest implementation; satisfies CAT-07 by being stricter (always soft-delete). | ✓ |
| Hard-delete CareUnitMedication in Phase 2; add `deletedAt` in Phase 4 | Smaller Phase 2 surface; Phase 4 migration adds it. Defers cost. | |
| Soft-delete the global Medication too (cascade) | Over-engineered; global Medication is essentially read-only seed data. | |

**User's choice:** Soft-delete CareUnitMedication row only; global Medication stays.

### Q3 — Create semantics (typeahead vs new-Medication)

| Option | Description | Selected |
|--------|-------------|----------|
| Pick from existing Medication (typeahead) + set stock & threshold | Matches how real pharmacy stock systems work. Submit creates new CareUnitMedication pointing at chosen Medication. With secondary "Skapa nytt" path for drugs not in NPL. | ✓ |
| Two-step — "Add new medication" creates Medication + first CareUnitMedication | Drops typeahead; leads to duplicates. | |
| Phase 2 only lets you create CareUnitMedication rows; no new Medication path | Defer "drug not in NPL" to v2. Smallest surface; reviewer might note the gap. | |

**User's choice:** Pick from existing Medication (typeahead) + set stock & threshold.

### Q4 — Drug-not-in-NPL path

| Option | Description | Selected |
|--------|-------------|----------|
| Ship in Phase 2 — typeahead + "Skapa nytt läkemedel" secondary path | Covers the "what if a drug isn't in NPL?" question. Costs ~half a day. | ✓ |
| Defer to v2 — typeahead-only in Phase 2 | Smaller Phase 2; reviewer might note the gap. | |
| Defer to Phase 7 polish | Plays well with "what I'd do with more time" README. | |

**User's choice:** Ship in Phase 2 — typeahead + "Skapa nytt läkemedel" secondary path.

### Q5 — Edit scope for existing CareUnitMedication

| Option | Description | Selected |
|--------|-------------|----------|
| Stock + threshold only for NPL meds; full fields for user-created meds | Ownership-based. NPL is canonical; user-created Meds are owned. Clean separation. | ✓ |
| Everything editable, even NPL meds (changes propagate globally) | Bad answer to "why can a nurse rename the drug for everyone?" | |
| Per-vårdenhet override columns | Heavy for v1; defer to v2. | |

**User's choice:** Stock + threshold only for NPL meds; full fields for user-created meds.

---

## Low-stock indicator + threshold UX

### Q1 — Low-stock indicator rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Red pill on stock cell + warning icon | Local, readable on rows and cards. Matches Phase 1 `<RoleBadge>` pattern. | |
| Row/card tint (entire row gets soft red bg) | Dramatic but noisy with ~8% low-stock at full seed. | |
| Inline text only ("Lågt lager" suffix) | Most subdued; loses iconographic punch. | |
| Pill + icon AND a summary banner above the list | Per-row pill+icon + top banner. Overlaps Phase 6 NTF-01 (dashboard banner). | ✓ (with refinement) |

**User's choice:** Pill + icon AND a summary banner above the list.
**Notes:** Refined during the discussion to avoid overlap with Phase 6 NTF-01: Phase 2 banner is **count-only** ("⚠ N läkemedel under tröskel") + `[Visa endast under tröskel]` filter toggle. Phase 6 dashboard banner does the full enumeration on a different surface.

### Q2 — Default `lowStockThreshold` on create

| Option | Description | Selected |
|--------|-------------|----------|
| Required numeric field, no default — user must enter | Forces an intentional choice. | |
| Pre-fill with 10 (literal STK-03 reading) | Faster; biases everything to 10. | |
| Heuristic default by form | Pre-fill based on Medication's `form` value: 5 for injection/lösning, 20 for tablett/kapsel, 3 for salva/kräm, 10 fallback. Demonstrates domain awareness. | ✓ |

**User's choice:** Heuristic default by form.

### Q3 — Where threshold is editable after creation

| Option | Description | Selected |
|--------|-------------|----------|
| Inside the edit Sheet only | Consistent with all other edits; 3-tap minimum. | |
| Inline-editable on the card/row (no Sheet hop) | Fastest threshold-only adjustment; new UI pattern with one user. | |
| Both — inline-edit primary, Sheet covers the rest of the edit surface | Most flexible; two paths with clear scoping. | ✓ |

**User's choice:** Both — inline-edit primary, Sheet covers the rest.

### Q4 — TanStack Query mutation strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Optimistic update + rollback on error (for inline) | Pill flips colors instantly; matches "immediate update" wording. | ✓ |
| Pessimistic + invalidate (simpler) | Indicator updates after network round-trip. | |
| Mixed: optimistic for inline-edit, pessimistic for Sheet | Two patterns coexist with clear scoping. | |

**User's choice:** Optimistic update + rollback on error (with the mixed-strategy refinement: Sheet saves stay pessimistic).

---

## Claude's Discretion

Captured in CONTEXT.md `<decisions> ### Claude's Discretion`. Notable items:
- Exact PRNG choice for deterministic stock/threshold generation (any reproducible function keyed on `nplId`).
- Top-N list of most common `form` values (derive by frequency from CSV, locked in `packages/shared/src/constants/medicationForms.ts`).
- Debounce ms on search (200 ms) and typeahead (150 ms).
- Empty-state copy, focus management, keyboard shortcuts (shadcn/Radix defaults).
- Whether to add `@@index([careUnitId])` and `@@index([careUnitId, medicationId])` on CareUnitMedication.
- Toast library + Swedish copy (recommend shadcn `sonner` adapter).
- File layout under `apps/api/src/routes/medications/*` and `apps/api/src/services/medication.service.ts` (carry forward Phase 1 patterns).
- Re-add-after-soft-delete behavior: transparent restore (set `deletedAt = null`).
- Typeahead ranking (prefix > infix; pg_trgm similarity score for fuzzy).

## Deferred Ideas

Captured in CONTEXT.md `<deferred>`. Highlights:
- Per-vårdenhet name/form/strength overrides (v2)
- ATC therapeutic-class column (Phase 6 AI categorization)
- Trash-bin UI for deleted CareUnitMedication (Phase 7 polish or v2)
- Hard-delete admin path for orphaned user-created Medication (v2)
- Inline-edit stock (kept Sheet-only in v1 to preserve audit story)
- Bulk-onboarding new vårdenheter (v2 admin tools)
- Search ranking polish (Phase 7 or v2)
- CSV upload to bulk-add CareUnitMedication (v2)
- Audit-event writes on mutations (Phase 5 retrofits middleware)
- Rate limiting on mutation endpoints (Phase 7 README "with more time")
