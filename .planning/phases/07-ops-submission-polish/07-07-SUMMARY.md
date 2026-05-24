---
phase: 07
plan: 07-07
subsystem: docs
tags: [readme, factual-fix, cr-01, wr-02]
dependency_graph:
  requires: []
  provides: [factually-accurate-readme]
  affects: [README.md]
tech_stack:
  added: []
  patterns: []
key_files:
  created: []
  modified:
    - README.md
decisions:
  - "Combined single commit for CR-01 + WR-02 per planner's recommended default (tighter git log --oneline storytelling; both are README factual corrections from the same review pass)"
metrics:
  duration: ~5 minutes
  completed: "2026-05-24"
---

# Phase 07 Plan 07: readme-factual-fixes Summary

Two one-line factual corrections in `README.md`: Arkitekturval matrix UI-kit cell updated from `Tailwind CSS 4` to `Tailwind CSS 3` (CR-01 BLOCKER); audited-models list in the Prisma `$extends` paragraph corrected from `Session, AuditEvent` to `User, Session` (WR-02 WARNING).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix CR-01 — README Arkitekturval UI-kit cell (Tailwind CSS 4 → 3) | 94939c8 | README.md line 47 |
| 2 | Fix WR-02 — README audited-models list (Session, AuditEvent → User, Session) | 94939c8 | README.md line 79 |

## Exact README Diff

### CR-01 (Task 1) — Line 47

**Before:**
```
| **UI-kit** — shadcn/ui + Tailwind CSS 4 | MUI, Chakra, Mantine, Ant Design | ...
```

**After:**
```
| **UI-kit** — shadcn/ui + Tailwind CSS 3 | MUI, Chakra, Mantine, Ant Design | ...
```

Source of truth: `apps/web/package.json` devDependencies — `"tailwindcss": "^3.4.7"` (Tailwind v3, not v4).

### WR-02 (Task 2) — Line 79

**Before:**
```
`Order`, `OrderLine`, `Session`, `AuditEvent`). Service-koden är omedveten om
```

**After:**
```
`Order`, `OrderLine`, `User`, `Session`). Service-koden är omedveten om
```

Full audited-models list now reads: `Medication, CareUnitMedication, Order, OrderLine, User, Session` — which is the canonical Phase 5 list used verbatim in `## Hur audit-hooken fungerar` and `## Vad granskas?`. `AuditEvent` is the audit TABLE itself; auditing it would be circular and is not what the code does.

## Commit

Single combined commit `94939c8`: `docs(07-07): fix README factual errors (CR-01 Tailwind v3; WR-02 audited models list)`

**Deviation from recommended pattern:** None. The planner's default recommendation was one combined commit; that is what was used. The commit message cites both gap IDs verbatim (CR-01, WR-02) as required.

## Grep Assertion Results

All assertions from `<verify>` blocks pass:

### Task 1 Assertions

| Assertion | Result |
|-----------|--------|
| `grep -F 'Tailwind CSS 3' README.md \| wc -l` equals 1 | PASS (1) |
| `grep -F 'Tailwind CSS 4' README.md \| wc -l` equals 0 | PASS (0) |
| `grep -F '**UI-kit** — shadcn/ui + Tailwind CSS 3' README.md` returns the row | PASS |
| `grep -F 'shadcn ger kopierade komponenter i koden' README.md` returns the row | PASS |
| `apps/web/package.json` tailwindcss devDep contains `^3.4.7` | PASS |

### Task 2 Assertions

| Assertion | Result |
|-----------|--------|
| `` grep -F '`Order`, `OrderLine`, `User`, `Session`' README.md `` returns one line | PASS |
| `` grep -F '`Session`, `AuditEvent`' README.md \| wc -l `` equals 0 | PASS (0) |
| `grep -F 'för de sex granskade modellerna (D-90: `Medication`, `CareUnitMedication`' README.md` returns a line | PASS |
| `grep -F 'Hur audit-hooken fungerar' README.md` returns a line | PASS |
| `grep -F 'Vad granskas?' README.md` returns a line | PASS |
| `grep -c 'AuditEvent' README.md` >= 5 (other AuditEvent refs preserved) | PASS (13) |

## Deviations from Plan

None — plan executed exactly as written. Two one-line edits made, single combined commit used per planner's default recommendation, no other README content touched.

## Known Stubs

None — this plan is doc-only; no stubs apply.

## Threat Flags

None — doc-only edits; no new runtime surface introduced.

## Self-Check: PASSED

- README.md modified: confirmed (git diff HEAD~1 HEAD shows exactly 2 lines changed)
- Commit 94939c8 exists: confirmed
- No file deletions in commit: confirmed
- apps/web/package.json unchanged: confirmed (tailwindcss: ^3.4.7)
- All grep assertions pass: confirmed above
