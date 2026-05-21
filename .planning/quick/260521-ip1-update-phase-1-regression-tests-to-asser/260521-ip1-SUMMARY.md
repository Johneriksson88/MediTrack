---
phase: quick-260521-ip1
plan: 01
subsystem: api/auth-tests
tags: [test, regression, rbac, permissions, phase-1-backstop]
dependency_graph:
  requires:
    - apps/api/src/auth/permissions.ts (post-Phase-2 PERMISSIONS map)
  provides:
    - apps/api/test/admin.ping.test.ts (updated /me permissions[] regression block)
    - apps/api/test/auth.flow.smoke.test.ts (updated ROLE_MATRIX.expectedPermissions x3)
    - apps/api/test/auth.me.test.ts (updated admin meResponse-shape assertion)
  affects:
    - CI green-gate for the API workspace (Phase 1 regression backstop)
tech_stack:
  added: []
  patterns:
    - declaration-order coupling between PERMISSIONS map and actionsForRole(role) output
key_files:
  created: []
  modified:
    - apps/api/test/admin.ping.test.ts
    - apps/api/test/auth.flow.smoke.test.ts
    - apps/api/test/auth.me.test.ts
decisions:
  - Updated assertions only — no production code touched; PERMISSIONS map remains the single source of truth.
  - Kept the three `it(...)` blocks in admin.ping.test.ts; only the titles and the toEqual literals were updated to stay self-documenting.
metrics:
  duration: ~3 min
  completed: 2026-05-21
requirements:
  - AUTH-04
  - AUTH-05
  - AUTH-06
  - MED-01
---

# Quick Task 260521-ip1: Align Phase 1 permissions[] regressions with post-Phase-2 map

## One-liner

Updated three Phase 1 regression tests to assert the post-Phase-2 `permissions[]` arrays emitted by `actionsForRole(role)`, restoring the API vitest suite from 11/18 to 18/18 green against the live Docker stack.

## Problem

Phase 2 (commit `33deb19`) widened `apps/api/src/auth/permissions.ts` with four `medication:*` actions. `/me` now returns those for every role via `actionsForRole(role)`. The Phase 2 verification only re-ran the **web** vitest suite, so the three Phase 1 **API** regression tests that hardcode the `permissions[]` shape were left asserting the pre-Phase-2 arrays. Pre-run state: 7 failures / 11 passes / 18 total.

## Canonical arrays used (from `actionsForRole(role)` — declaration order of `PERMISSIONS`)

| Role            | `permissions[]` emitted by `/me`                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------- |
| `apotekare`     | `['medication:read', 'medication:create', 'medication:update', 'medication:delete']`                        |
| `sjukskoterska` | `['medication:read']`                                                                                       |
| `admin`         | `['admin:ping', 'medication:read', 'medication:create', 'medication:update', 'medication:delete']`          |

Declaration order in `PERMISSIONS`: `admin:ping`, `medication:read`, `medication:create`, `medication:update`, `medication:delete` — `actionsForRole` iterates `Object.entries(PERMISSIONS)` and filters by membership, so the array order above is canonical and stable.

## Changes

### apps/api/test/admin.ping.test.ts

Updated all three `it(...)` blocks inside `describe('GET /api/me — permissions[] regression (D-18)', ...)`:

- Admin: title + assertion updated to the 5-element admin array.
- Sjuksköterska: title changed from `permissions: []` to `permissions: ['medication:read']`; assertion changed to `['medication:read']`.
- Apotekare: title changed from `permissions: []` to the 4-element medication array; assertion changed to match.

### apps/api/test/auth.flow.smoke.test.ts

Updated three `expectedPermissions` fields in `ROLE_MATRIX`:

- `apotekare`: `[]` → `['medication:read', 'medication:create', 'medication:update', 'medication:delete']`
- `sjukskoterska`: `[]` → `['medication:read']`
- `admin`: `['admin:ping']` → `['admin:ping', 'medication:read', 'medication:create', 'medication:update', 'medication:delete']`

No structural change — `label`, `user`, `expectedRole`, `adminPingStatus`, the `as const` on the array literal, and the iteration logic in the `for (const row of ROLE_MATRIX)` block are untouched.

### apps/api/test/auth.me.test.ts

In the `meResponse`-shape assertion for the admin happy path: updated the `permissions` literal and trailing comment.

- Was: `permissions: ['admin:ping'], // Plan 03 — admin role has admin:ping per PERMISSIONS map`
- Now: `permissions: ['admin:ping', 'medication:read', 'medication:create', 'medication:update', 'medication:delete'], // Phase 2 D-43 — admin gains medication:* via PERMISSIONS map`

Unauthenticated / tampered-cookie cases and the `not.toHaveProperty('passwordHash')` negative check are unchanged.

## Verification

### `pnpm --filter @meditrack/api exec vitest run` (post-commit, live Docker Postgres at localhost:5432)

```
 ✓ test/auth.flow.smoke.test.ts  (4 tests)  654ms
 ✓ test/admin.ping.test.ts       (7 tests)  634ms
 ✓ test/auth.login.test.ts       (4 tests)  348ms
 ✓ test/auth.me.test.ts          (3 tests)  297ms

 Test Files  4 passed (4)
      Tests  18 passed (18)
   Duration  3.56s
```

Result: **18 / 18 passing** (was 11/18 before).

### Negative check — scope discipline

```
$ git diff --name-only HEAD~1 HEAD
apps/api/test/admin.ping.test.ts
apps/api/test/auth.flow.smoke.test.ts
apps/api/test/auth.me.test.ts
```

Exactly the three test files. `apps/api/src/auth/permissions.ts`, the `/me` route, and `userService` are byte-identical to their pre-plan state.

## Commit

| Hash      | Subject                                                                  | Files                                   |
| --------- | ------------------------------------------------------------------------ | --------------------------------------- |
| `f9cfc28` | `test(api): align Phase 1 permissions[] regressions with post-Phase-2 map` | 3 test files; 10 insertions, 10 deletions |

Single atomic commit. No production code in the commit. No `git add -A`. No amend. No `--no-verify`.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- File present: apps/api/test/admin.ping.test.ts — FOUND.
- File present: apps/api/test/auth.flow.smoke.test.ts — FOUND.
- File present: apps/api/test/auth.me.test.ts — FOUND.
- Commit present: f9cfc28 — FOUND in `git log`.
- Vitest tally: 18/18 passing against the live Docker stack — CONFIRMED.
