---
phase: quick-260526-2fr
plan: 01
subsystem: web/lakemedel
tags: [ui, responsive, tailwind, sheetfooter, ai-categorization]
requires: []
provides:
  - Desktop SheetFooter padding parity with content height in MedicationSheet
affects:
  - apps/web/src/routes/lakemedel/MedicationSheet.tsx
tech_stack_added: []
patterns_used:
  - Tailwind responsive override (`md:pb-4`) layered after a mobile-only arbitrary-value utility
key_files_created: []
key_files_modified:
  - apps/web/src/routes/lakemedel/MedicationSheet.tsx
decisions:
  - "Single-utility fix (`md:pb-4`) preferred over removing the arbitrary-value mobile padding — keeps the explicit safe-area hack (Android nav + iOS keyboard inset) intact and lets the breakpoint pick the right value at render time."
  - "Applied symmetrically to all three SheetFooter sites (EditSheet/ViewSheet/create-mode) so view/edit/create share the same desktop chrome. Asymmetric fix would risk a regression appearing only in one mode."
metrics:
  duration_minutes: ~10
  tasks_completed: 1
  files_modified: 1
  commits: 1
  completed_date: "2026-05-26"
requirements_completed:
  - QUICK-260526-2fr
---

# Quick Task 260526-2fr: Reduce SheetFooter Bottom Padding on Desktop — Summary

One-liner: Appended `md:pb-4` to three SheetFooter classNames in `MedicationSheet.tsx` so the AI suggestion block's expanded combobox stays inside the desktop viewport, while preserving the mobile safe-area padding verbatim.

## What Changed

Three className edits in `apps/web/src/routes/lakemedel/MedicationSheet.tsx`, each appending ` md:pb-4` to an existing `pb-[calc(1rem+56px+env(safe-area-inset-bottom))]`:

| Line | Site         | Before (className tail)                                               | After (className tail)                                                          |
| ---- | ------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 616  | EditSheet    | `… justify-between gap-2 pb-[calc(1rem+56px+env(safe-area-inset-bottom))]` | `… justify-between gap-2 pb-[calc(1rem+56px+env(safe-area-inset-bottom))] md:pb-4` |
| 776  | ViewSheet    | `… justify-end gap-2 pb-[calc(1rem+56px+env(safe-area-inset-bottom))]`     | `… justify-end gap-2 pb-[calc(1rem+56px+env(safe-area-inset-bottom))] md:pb-4`     |
| 1299 | create-mode  | `… justify-end gap-2 pb-[calc(1rem+56px+env(safe-area-inset-bottom))]`     | `… justify-end gap-2 pb-[calc(1rem+56px+env(safe-area-inset-bottom))] md:pb-4`     |

The two `justify-end` footers (776, 1299) are textually identical at the className level; Edits were anchored on the preceding `</fieldset>` and `</div>` lines respectively to disambiguate.

## Why

The `pb-[calc(1rem+56px+env(safe-area-inset-bottom))]` is a mobile safe-area hack (Android nav bar + iOS keyboard inset) that adds ~72px of dead space at the bottom of the sheet. On desktop, that dead space ate the room the dynamically-expanding AI suggestion block needs, pushing the `Slutgiltig klass` combobox in EditSheet/create-mode below the visible viewport. A single responsive `md:pb-4` (Tailwind's default `md:` breakpoint = 768px, matching the file's existing `matchMedia('(min-width: 768px)')` `isDesktop` boundary) collapses the desktop footer back to standard 16px padding without touching the mobile contract.

## Verification

- **grep:** `md:pb-4` appears exactly 3 times in the file, each on a SheetFooter className.
- **Typecheck:** `pnpm typecheck` in `apps/web` — clean.
- **Lint:** `pnpm -w lint` (eslint, `--max-warnings=0`) — clean.
- **Tests:** `pnpm exec vitest run src/routes/lakemedel/__tests__/MedicationSheet` — 13/13 pass (`MedicationSheet.ai.test.tsx` 7/7 + `MedicationSheet.emptyStates.test.tsx` 6/6). No regressions.
- **Human UAT:** Deferred to UAT step after orchestrator merge. See `<human-check>` block in PLAN.md task 1 for the five-step checklist (desktop EditSheet AI expansion, desktop ViewSheet, desktop create-mode, mobile <768px safe-area parity).

## Deviations from Plan

None — plan executed exactly as written. Three Edit calls, one commit, all verification gates green.

## Commits

- `03cc716` — fix(260526-2fr): collapse SheetFooter desktop padding so AI block fits viewport

## Self-Check: PASSED

- FOUND: `apps/web/src/routes/lakemedel/MedicationSheet.tsx` (modified, 3 className additions of ` md:pb-4`)
- FOUND commit: `03cc716` on branch `worktree-agent-a90d51ffb1a1bbf1d`
- grep verified: exactly 3 occurrences of `md:pb-4`, each on a `SheetFooter` className (lines 616, 776, 1299)
