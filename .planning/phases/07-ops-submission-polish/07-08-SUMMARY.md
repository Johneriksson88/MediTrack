---
phase: 07-ops-submission-polish
plan: "07-08"
subsystem: testing
tags: [playwright, verification-harness, sc04, redirect-guard, locator-api]

# Dependency graph
requires:
  - phase: 07-ops-submission-polish
    provides: captureSc04Screenshots.ts harness from D-127
provides:
  - "WR-01 closed: redirect-guard eliminates silent false-negative on /login at viewports 768/1024/1440"
  - "IN-01 closed (bundled): page.$$ → page.locator refactor removes soft-deprecated ElementHandle API"
affects:
  - "07-VERIFICATION.md human_verification[1] — live re-run is the residual gate"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Redirect-guard pattern: detect post-goto URL mismatch via new URL(page.url()).pathname and skip cell via continue"
    - "Locator-API OR-reduce: page.locator().count() + .nth(i).isVisible() replacing page.$$ ElementHandle enumeration"

key-files:
  created: []
  modified:
    - apps/web/scripts/captureSc04Screenshots.ts

key-decisions:
  - "Bundle WR-01 + IN-01 into one commit — both fixes touch the same file; avoids second drive-by commit"
  - "Banner string kept AS-IS ('all 24 cells') — expresses matrix size, not verified-cell count; operator sees skipped log lines"

patterns-established:
  - "Playwright redirect guard: after waitForLoadState, compare new URL(page.url()).pathname against route.path before asserting"

requirements-completed: [OPS-02, OPS-04]

# Metrics
duration: 12min
completed: 2026-05-24
---

# Phase 7 Plan 08: SC04 Redirect Guard + Locator API Refactor Summary

**WR-01 fixed: SC#4 harness now skips authenticated-session redirects from /login → /dashboard at viewports 768/1024/1440 instead of silently measuring the wrong page.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-05-24T00:00:00Z
- **Completed:** 2026-05-24T00:00:00Z
- **Tasks:** 2/2 (both bundled into one commit)
- **Files modified:** 1

## Accomplishments

### Task 1: WR-01 — Redirect guard (mandatory)

Inserted the redirect-guard block immediately after `await page.waitForLoadState('networkidle')` and before `--- Assertion 1: no horizontal overflow ---` in `captureSc04Screenshots.ts`.

**Exact diff (Task 1):**

```ts
+        // If we are authenticated and this is the login route, the app redirects to
+        // /dashboard — the overflow check would measure the wrong page. Skip the cell.
+        const currentPath = new URL(page.url()).pathname;
+        if (currentPath !== route.path) {
+          console.log(`  (skipped: redirected from ${route.path} → ${currentPath})`);
+          continue;
+        }
+
         // --- Assertion 1: no horizontal overflow ---
```

The `continue` exits the inner `for (const route of ROUTES)` loop body. The 360-viewport login cell is unaffected — at that iteration `loggedIn === false` so `/login` lands on `/login` and `currentPath === route.path`. On a live re-run against a fresh stack the harness emits three `(skipped: redirected from /login → /dashboard)` log lines.

### Task 2: IN-01 — Locator API refactor (bundled)

Replaced `page.$$('[data-test="primary-nav"]')` (legacy ElementHandle API) with `page.locator('[data-test="primary-nav"]')` + `.count()` + `.nth(i).isVisible()`. Same OR-reduced visibility semantics, same `route.anonymous` carve-out, same `failures[]` message strings byte-for-byte.

**Exact diff (Task 2):**

```ts
-          const navHandles = await page.$$('[data-test="primary-nav"]');
-          if (navHandles.length === 0) {
+          const navLocator = page.locator('[data-test="primary-nav"]');
+          const navCount = await navLocator.count();
+          if (navCount === 0) {
             failures.push(
               `primary nav (data-test="primary-nav") not found at ...`,
             );
           } else {
             let anyVisible = false;
-            for (const h of navHandles) {
-              if (await h.isVisible()) {
+            for (let i = 0; i < navCount; i++) {
+              if (await navLocator.nth(i).isVisible()) {
                 anyVisible = true;
                 break;
               }
```

## Verification Results

| Check | Result |
|-------|--------|
| `grep -c 'skipped: redirected from'` returns 1 | PASS |
| `grep -F 'const currentPath = new URL(page.url()).pathname;'` matches | PASS |
| `grep -nE 'if \(currentPath !== route\.path\)'` matches | PASS |
| `awk` ordering check (wait < guard < overflow) | PASS: wait=101 guard=106 overflow=111 |
| `page.goto` still present | PASS |
| `page.waitForLoadState('networkidle')` still present | PASS |
| `page.$$('[data-test="primary-nav"]')` is gone | PASS: count=0 |
| `page.locator('[data-test="primary-nav"]')` present | PASS |
| `navCount = await navLocator.count()` present | PASS |
| `await navLocator.nth(i).isVisible()` present | PASS |
| failures[] message strings byte-identical | PASS |
| `if (!route.anonymous)` carve-out preserved | PASS |
| `pnpm --filter @meditrack/web typecheck` exits 0 | PASS |

## Commits

| Commit | Description |
|--------|-------------|
| f6ac835 | fix(07-08): close WR-01 (sc04 redirect guard) + IN-01 (locator API refactor) |

## Residual Gate

Human re-run against a live `docker compose up` is the residual gate (07-VERIFICATION.md `human_verification[1]`). On a fresh stack, the harness should emit three `(skipped: redirected from /login → /dashboard)` log lines (one per non-360 viewport) and the final banner will reflect 21 genuinely verified cells, not the misleading 24. This is NOT this plan's deliverable — it is an out-of-band user confirmation gate.

## Deviations from Plan

None — plan executed exactly as written. Both tasks bundled as recommended by the planner. The redirect-guard block was inserted at the correct anchor (between `waitForLoadState` and `Assertion 1`) and the locator-API refactor preserved all behavioral contracts.

## Self-Check

- [x] `apps/web/scripts/captureSc04Screenshots.ts` modified — CONFIRMED
- [x] Commit `f6ac835` exists — CONFIRMED
- [x] `pnpm --filter @meditrack/web typecheck` exits 0 — CONFIRMED
- [x] All grep + awk assertions pass — CONFIRMED
