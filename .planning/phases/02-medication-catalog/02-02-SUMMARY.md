---
phase: 02-medication-catalog
plan: "02"
subsystem: medication-catalog
tags:
  - filter-ui
  - url-state
  - shadcn-select
  - combobox
  - debounce
dependency_graph:
  requires:
    - 02-01  # Slice 1: useMedicationsQuery + LakemedelPage URL state + API query params
  provides:
    - lakemedel-filter
    - atc-combobox
    - form-select
    - below-threshold-chip
    - filter-active-empty-state
  affects:
    - 02-03  # Plan 03: edit Sheet — inherits updated LakemedelPage filter state shape
    - 02-04  # Plan 04: delete — no change to filter surface
tech_stack:
  added:
    - "@radix-ui/react-select (^1.x) — shadcn Select primitive for Form dropdown"
    - "apps/web/src/components/ui/select.tsx — shadcn new-york Select component"
  patterns:
    - "Controlled filter component — props in, onChange patch out (LakemedelFilter is stateless re URL)"
    - "updateFilters() merges patch onto URL via setSearchParams (clean-URL policy: omit defaults)"
    - "200 ms debounce via useEffect+setTimeout+cleanup; initial render guard via useRef"
    - "useMemo(atcSuggestions) — distinct 5-char ATC prefixes from current page rows, no extra API"
    - "__ALL__ sentinel for shadcn Select (Select forbids value='')"
    - "hasActiveFilters ORs four filter values to distinguish filter-empty vs DB-empty state"
key_files:
  created:
    - apps/web/src/routes/lakemedel/LakemedelFilter.tsx
    - apps/web/src/components/ui/select.tsx
  modified:
    - apps/web/src/routes/lakemedel/LakemedelPage.tsx
    - apps/web/package.json
    - pnpm-lock.yaml
decisions:
  - "__ALL__ sentinel (not empty string) for Select cleared state — shadcn Select.Item value='' crashes Radix"
  - "atcSuggestions derived from current page rows (useMemo) — avoids a separate API call; combobox still accepts free text"
  - "LakemedelFilter is fully controlled (no useSearchParams inside it) — URL parsing stays in LakemedelPage"
  - "200 ms debounce uses useRef isFirstRender guard to prevent spurious onChange on mount"
  - "updateFilters() uses setSearchParams functional form to avoid stale closure on prev params"
metrics:
  duration_minutes: 20
  completed_date: "2026-05-21"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 3
---

# Phase 2 Plan 02: Medication Catalog — Slice 2 (LakemedelFilter) Summary

URL-bound filter row with 200 ms debounced search, ATC-kod prefix combobox (Popover+Command), Form select (TOP_MEDICATION_FORMS + Övriga), and below-threshold chip; all four combine AND-wise on the existing `useMedicationsQuery` and remain deep-linkable via URL params.

## Tasks Completed

| Task | Name | Commit | Key files |
|------|------|--------|-----------|
| 1 | Build LakemedelFilter component | 2f003da | LakemedelFilter.tsx, select.tsx, package.json |
| 2 | Wire LakemedelFilter into LakemedelPage | eba747b | LakemedelPage.tsx |

## Files Created (2)

**Frontend**
- `apps/web/src/routes/lakemedel/LakemedelFilter.tsx` — controlled filter row (CAT-02, CAT-03, CAT-04)
- `apps/web/src/components/ui/select.tsx` — shadcn new-york Select, backed by @radix-ui/react-select

## Files Modified (3)

- `apps/web/src/routes/lakemedel/LakemedelPage.tsx` — replaced standalone search Input + chip with `<LakemedelFilter>`; added `atc` + `form` URL params; `updateFilters()` merge function; `atcSuggestions` useMemo; `hasActiveFilters` spanning all four; filter-active empty state
- `apps/web/package.json` — added `@radix-ui/react-select`
- `pnpm-lock.yaml` — lockfile updated

## Deep-Link URL Examples

All four filters combine AND-wise. After seeding, these URLs reproduce the filtered view on any fresh load:

| URL | Expected behavior |
|-----|-------------------|
| `/lakemedel?q=paracet` | Shows ~dozen paracetamol-family drugs from 43 538 |
| `/lakemedel?atc=N02BE` | Shows all paracetamol-ATC medications |
| `/lakemedel?form=Tablett` | Shows only Tablett form |
| `/lakemedel?q=para&atc=N02&form=Tablett&belowThreshold=true` | All four predicates AND together — smallest result set |
| `/lakemedel?belowThreshold=true` | Only medications with currentStock < lowStockThreshold (~3483 rows) |

## Implementation Notes

**LakemedelFilter design:**
- Fully controlled component — receives URL-derived props from LakemedelPage, emits `onChange(patch)` with minimal diffs and `page: 1` reset on every change.
- No `useSearchParams` inside `LakemedelFilter` — all URL parsing stays in the page (single source of truth).
- ATC combobox: shadcn `<Popover>` + `<Command>` with prefix-match suggestions from `atcSuggestions` prop. Free-text entry also supported (typed value accepted on CommandItem select if not in suggestions list).
- Form select: shadcn `<Select>` with `__ALL__` sentinel because Radix/shadcn forbids `value=""` on SelectItem. `onValueChange` translates `__ALL__` back to `''` before calling `onChange`.

**LakemedelPage changes:**
- `atc` and `form` URL params added alongside existing `q`, `belowThreshold`, `page`.
- `updateFilters(patch)` uses `setSearchParams(prev => ...)` functional form to avoid stale closure on the four URL values.
- `hasActiveFilters = !!q || !!atc || !!form || belowThreshold` correctly covers all four.
- Two distinct empty states preserved: filter-empty ("Inga läkemedel matchade filtren.") vs DB-empty ("Inga läkemedel ännu").

## Deviations from Plan

None — plan executed exactly as written. All four controls ship per D-39, D-44, CAT-02..04.

## Threat Surface Scan

No new network endpoints. The filter row passes `q`, `atc`, `form`, `belowThreshold` as query params to the existing `GET /api/medications` endpoint. T-02-09 (URL injection) is mitigated by the BE Zod `medicationListQuery` schema already established in Plan 01. T-02-10 (high-frequency keystrokes) is mitigated by the 200 ms debounce in LakemedelFilter.

## Self-Check: PASSED

Files verified:
- `apps/web/src/routes/lakemedel/LakemedelFilter.tsx` FOUND
- `apps/web/src/components/ui/select.tsx` FOUND
- `apps/web/src/routes/lakemedel/LakemedelPage.tsx` FOUND (modified — no standalone search Input, has LakemedelFilter, has 'Inga läkemedel matchade filtren.')

Commits verified:
- 2f003da Task 1 (LakemedelFilter + select.tsx) FOUND
- eba747b Task 2 (LakemedelPage wiring) FOUND

Build: `pnpm --filter @meditrack/web build` exits 0.
Tests: 40/40 pass (no regressions).
