---
phase: quick-260526-1px
plan: 01
subsystem: audit
tags: [audit, prisma, als, fastify, swedish-i18n, react]

# Dependency graph
requires:
  - phase: 05-audit-log
    provides: withActionOverride ALS helper + Prisma $extends audit middleware (D-94 pattern)
provides:
  - audit action 'medication.softDelete' (Swedish label "Borttagen")
  - destructive (red) chip styling for medication soft-delete events in admin audit log
affects: [admin audit log, medication CRUD]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "withActionOverride wrap on soft-delete update — mirrors order.service.ts:847 (D-94)"

key-files:
  created: []
  modified:
    - packages/shared/src/constants/auditAction.ts
    - apps/api/src/services/medication.service.ts
    - apps/web/src/components/AuditActionChip.tsx

key-decisions:
  - "medication.softDelete grouped with status-machine overrides (adjacent to order.softDelete) since it shares the withActionOverride mechanism, even though the surface area is CRUD not lifecycle."
  - "Swedish label is bare 'Borttagen' (no qualifier) — medication soft-delete is the canonical removal action for the registry; no draft-vs-sent duality to disambiguate."
  - "Chip styling reuses the identical 'bg-destructive/10 text-destructive' Tailwind class as order.softDelete and the generic delete action — visual signal 'this is a removal' must be consistent."

patterns-established:
  - "Pattern: any new domain-rich audit action requires three coordinated edits (shared constant + service wrap + FE chip class) that land atomically — Record<AuditAction, string> exhaustiveness in two FE maps + TS import resolution in API prevents half-broken intermediate commits."

requirements-completed: [QUICK-260526-1px]

# Metrics
duration: 5min
completed: 2026-05-26
---

# Quick Task 260526-1px Summary

**Medication soft-delete now writes audit row with action='medication.softDelete' (red "Borttagen" chip) instead of generic 'update', mirroring the Phase 5 D-94 order.softDelete pattern.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-26T01:17:55+02:00 (dispatch commit)
- **Completed:** 2026-05-26T01:23:03+02:00 (task commit)
- **Tasks:** 1/1
- **Files modified:** 3

## Accomplishments

- Soft-deleting a CareUnitMedication now emits a domain-rich audit action (`medication.softDelete`) consumable by the admin audit log filter and chip primitive.
- Audit log visually distinguishes medication removal from name/strength edits — destructive (red) chip styled identically to `order.softDelete` and the generic `delete`.
- Shared `AuditAction` literal union, FE `AUDIT_ACTION_LABELS` map, FE `ACTION_CLASS` map, and API service writer all updated atomically in one commit — no intermediate half-broken state.

## Task Commits

1. **Task 1: Emit medication.softDelete audit action — shared constant, service wrap, FE chip class** — `ffafa51` (feat)

## Files Created/Modified

- `packages/shared/src/constants/auditAction.ts` — added `'medication.softDelete'` to `AUDIT_ACTIONS` (in the status-machine-overrides group, adjacent to `'order.softDelete'`) and `'Borttagen'` to `AUDIT_ACTION_LABELS`. Inline comment cites D-94 / medication.service.ts. `auditActionEnum` picks up the new literal automatically via `z.enum(AUDIT_ACTIONS)`.
- `apps/api/src/services/medication.service.ts` — added `import { withActionOverride } from '../plugins/requestContext.js';` (placed between the errorHandler runtime import and the `@meditrack/shared` type import, matching the order.service.ts ordering convention). Wrapped the trailing `prisma.careUnitMedication.update` call in `softDeleteCareUnitMedication` with `withActionOverride('medication.softDelete', ...)`. Precheck `findUnique` / `NotFoundError` branches / `void` return signature unchanged. Comment cites Phase 5 D-94 and points to order.service.ts:847 as precedent.
- `apps/web/src/components/AuditActionChip.tsx` — added `'medication.softDelete': 'bg-destructive/10 text-destructive'` to `ACTION_CLASS` immediately after the existing `'order.softDelete'` entry. Identical Tailwind class string — destructive palette is the locked visual signal for "removal" per UI-SPEC §6. Component body and props interface untouched.

## Verification

| Command | Result |
| --- | --- |
| `pnpm -r typecheck` (worktree, after `pnpm install --frozen-lockfile`, `pnpm --filter @meditrack/api prisma:generate`, `pnpm --filter @meditrack/shared build`) | PASS — all three workspaces (`packages/shared`, `apps/api`, `apps/web`) compile clean. Proves the new `AuditAction` literal is exhaustively handled in both `AUDIT_ACTION_LABELS` and `ACTION_CLASS`, and that the new `withActionOverride` import resolves. |
| `pnpm lint` | PASS — zero errors, zero warnings (eslint exited 0 with no diagnostics). |
| `pnpm --filter @meditrack/api test -- audit.integration` | PASS — 17/17 tests (existing audit pipeline unaffected; the test that expects `42501 permission denied` on raw UPDATE against AuditEvent still passes — that's the Phase 5 D-98 append-only enforcement and the `prisma:error` line in stdout is the *expected* failure mode being asserted, not a regression). |
| `grep -n "medication.softDelete" packages/shared/src/constants/auditAction.ts \| grep -v '^[[:space:]]*//' \| wc -l` | 2 (AUDIT_ACTIONS entry on line 33 + AUDIT_ACTION_LABELS entry on line 69 — expected 2) |
| `grep -nc "withActionOverride('medication.softDelete'" apps/api/src/services/medication.service.ts` | 1 (line 615 — expected 1) |
| `grep -nc "'medication.softDelete': 'bg-destructive/10 text-destructive'" apps/web/src/components/AuditActionChip.tsx` | 1 (line 29 — expected 1) |

**Confirmation:** no other audit-action literals were touched. Diff is strictly additive in each file (no reorders, no removals). `git diff --diff-filter=D HEAD~1 HEAD` reports no deletions.

## Decisions Made

None — plan executed exactly as specified. The three edits, their placement, the Swedish label choice, and the chip class were all prescribed verbatim in the plan; no judgment calls were required at execution time.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

**Cross-filesystem absolute-path issue (recovered cleanly, no committed mistake).** The first round of `Edit` calls targeted the main repo absolute path (`C:/Projekt/MediTrack/...`) instead of the worktree path (`C:/Projekt/MediTrack/.claude/worktrees/agent-a181d0138e778cdeb/...`). This was caught by the post-edit `git rev-parse --show-toplevel` check showing the wrong toplevel. Reverted the main-repo working-tree changes for the three task files with `git checkout -- <file>` (leaving the pre-existing `README.md` modification and untracked `.claude/` alone), then re-applied the same three edits using the full worktree absolute paths. No bad commit ever landed; the recovery is invisible in the final history.

**Worktree was missing dependencies.** The worktree had no `node_modules` and no generated Prisma client. Ran `pnpm install --frozen-lockfile`, `pnpm --filter @meditrack/api prisma:generate`, and `pnpm --filter @meditrack/shared build` (the latter so `apps/api` and `apps/web` could resolve `@meditrack/shared`'s `dist/` exports during typecheck). Standard bootstrap, expected for a fresh worktree.

## User Setup Required

None — no external service configuration required.

## Browser UAT Step (for the user)

Pharmacist soft-deletes a medication; admin loads `/admin/audit`; the corresponding row should render a **red "Borttagen" chip** (the `bg-destructive/10 text-destructive` palette) rather than a slate "Uppdaterad" chip. The action filter combobox does not yet surface `medication.softDelete` as a selectable option — that's an intentionally-out-of-scope follow-up (the plan only required the chip to render correctly when the action is encountered; combobox population is a separate UI-SPEC concern).

## Next Phase Readiness

This is a quick task — no phase advancement. The change is forward-compatible with Phase 7 (Ops & Submission Polish) and any future audit-log filtering work.

## Self-Check: PASSED

- File `packages/shared/src/constants/auditAction.ts`: FOUND (committed in `ffafa51`).
- File `apps/api/src/services/medication.service.ts`: FOUND (committed in `ffafa51`).
- File `apps/web/src/components/AuditActionChip.tsx`: FOUND (committed in `ffafa51`).
- Commit `ffafa51`: FOUND on branch `worktree-agent-a181d0138e778cdeb` (`git log --oneline -1` → `ffafa51 feat(quick-260526-1px-01): emit medication.softDelete audit action`).
- No unintended deletions (`git diff --diff-filter=D HEAD~1 HEAD` returned empty).

---
*Quick task: 260526-1px-make-medication-soft-delete-write-audit-*
*Completed: 2026-05-26*
