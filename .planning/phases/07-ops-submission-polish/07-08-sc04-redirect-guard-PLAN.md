---
phase: 07
plan: 07-08
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/captureSc04Screenshots.ts
autonomous: true
requirements_addressed: [OPS-02, OPS-04]
must_haves:
  truths:
    - "Closes 07-VERIFICATION.md WR-01: after `await page.goto(BASE_URL + route.path)` the harness compares the resulting pathname against `route.path` and, if they differ (post-login redirect from `/login` → `/dashboard` at viewports 768/1024/1440), logs `(skipped: redirected from <expected> → <actual>)` and `continue`s the inner loop"
    - "On a live re-run against `docker compose up`, the harness emits three (skipped: redirected from /login → /dashboard) log lines (one per non-360 viewport) and the success banner reflects the genuine pass count — the silent false-negative pattern is gone"
    - "Bundles 07-VERIFICATION.md IN-01 (optional): replaces the legacy `page.$$('[data-test=\"primary-nav\"]')` ElementHandle enumeration with the `page.locator(...)` API; equivalent OR-reduced isVisible() semantics; same exit-code discipline; same failures[] message strings"
    - "No assertion logic is removed or weakened — the overflow check and primary-nav reachability check still run on every cell where the harness successfully navigates to the intended route; the redirect guard ONLY suppresses the false-negative case"
    - "Single-file edit scoped to `apps/web/scripts/captureSc04Screenshots.ts`; no other phase-7 file touched; no new dependency added"
    - "Atomic commit scope `fix(07-08)` continues the Phase 7 per-slice narrative (commit subject cites WR-01; commit body cites IN-01 if bundled)"
  artifacts:
    - path: apps/web/scripts/captureSc04Screenshots.ts
      provides: "Redirect-guard branch (WR-01 fix) + locator-API refactor (IN-01 fix, bundled)"
      contains:
        - "skipped: redirected from"
        - "new URL(page.url()).pathname"
        - "continue"
  key_links:
    - from: captureSc04Screenshots.ts redirect-guard branch
      to: 07-REVIEW.md WR-01 fix snippet
      via: literal `const currentPath = new URL(page.url()).pathname` + `if (currentPath !== route.path) { console.log(...); continue; }` pair
      pattern: "currentPath !== route\\.path"
    - from: captureSc04Screenshots.ts primary-nav assertion block
      to: 07-REVIEW.md IN-01 fix snippet
      via: `page.locator('[data-test="primary-nav"]')` + `.count()` + `.nth(i).isVisible()` (if bundled)
      pattern: "page\\.locator\\(\\[data-test=\"primary-nav\"\\]\\)|page\\.locator\\('\\[data-test=\"primary-nav\"\\]'\\)"
---

<objective>
Close two harness-correctness gaps in `apps/web/scripts/captureSc04Screenshots.ts` flagged by 07-VERIFICATION.md and 07-REVIEW.md — both in the same file, both bundled in this single plan to avoid a second drive-by commit on the same file.

**Gap source:** 07-VERIFICATION.md Anti-Patterns Found rows for WR-01 (lines 88–112: silent false-negative) and IN-01 (line 122: legacy `page.$$` API). Plus 07-VERIFICATION.md human_verification[1] (SC#4 harness login-route cells at viewports 768/1024/1440 — the live re-run will be the user's gate to confirm this fix lands).

**The two fixes:**

1. **WR-01 (WARNING) — redirect-guard branch.** The harness sets `loggedIn = true` after the first non-anonymous route at viewport 360. On subsequent viewports (768, 1024, 1440), when the inner loop reaches the `login` route (`anonymous: true`), `page.goto('/login')` succeeds — but the SPA immediately redirects the authenticated session to `/dashboard`. The overflow + nav assertions then measure `/dashboard`, but the success log line and failures[] messages claim `/login` passed. Result: 3 of the 24 reported "success" cells (`768x1024 /login`, `1024x768 /login`, `1440x900 /login`) measure the wrong page.

   The fix is the literal pair from 07-REVIEW.md WR-01 snippet, inserted IMMEDIATELY after `await page.waitForLoadState('networkidle')` (current line ~101) and BEFORE the existing `--- Assertion 1: no horizontal overflow ---` block (current line ~103):

   ```ts
   // If we are authenticated and this is the login route, the app redirects to
   // /dashboard — the overflow check would measure the wrong page. Skip the cell.
   const currentPath = new URL(page.url()).pathname;
   if (currentPath !== route.path) {
     console.log(`  (skipped: redirected from ${route.path} → ${currentPath})`);
     continue;
   }
   ```

   The `continue` exits the inner `for (const route of ROUTES)` body, advancing to the next route at the current viewport. The 360-viewport login cell is unaffected — at that iteration `loggedIn === false`, the harness has not yet visited a protected route, so `page.goto('/login')` lands on `/login` and `currentPath === route.path`. The screenshot capture (`if (viewport.width === 360)`) is unreachable when `continue` fires, which is the correct behavior — there is no point capturing a screenshot of `/dashboard` to `sc04-360-login.png` (a separate concern from WR-01 but it's the same root cause and the same fix closes it cleanly).

   After the fix lands, a live re-run on a fresh stack produces three (skipped: redirected …) log lines and the final banner reports the 21 cells the harness actually verified — not 24.

2. **IN-01 (INFO, bundled per planning_context recommendation) — locator-API refactor.** Current code at line ~122–140 uses `await page.$$('[data-test="primary-nav"]')` (legacy ElementHandle API; soft-deprecated; produces deprecation notices in future Playwright versions). Replace with the `page.locator(...)` API per the literal 07-REVIEW.md IN-01 fix snippet — same behavior (OR-reduce `isVisible()` over all matches), same failures[] message strings, same `route.anonymous` carve-out. Since both fixes touch the same file, bundling them into one commit avoids a second drive-by commit on the same script.

**Wave assignment:** Wave 1, `depends_on: []`. Independent of plans 07-07 (different file) and 07-09 (different file). Plans 07-07, 07-08, 07-09 can be scheduled in parallel.

**Commit scope:** `fix(07-08)` — this is shipped code (a verification harness), not documentation, so the per-slice scope is `fix` (per 07-CONTEXT.md "Commit message conventions" — `fix(07-NN):` is the convention for code-bearing fixes). Commit subject cites WR-01; commit body cites IN-01 if bundled. If the executor decides at run-time to split (planner discretion below), the WR-01 commit is `fix(07-08)` and the IN-01 commit is `chore(07-08)` (refactor, no behavior change).

**Out of scope:** No edits to `Sidebar.tsx` or `BottomTabBar.tsx` (their `data-test="primary-nav"` attributes are verified VERIFIED). No changes to login credentials, base URL, viewport list, route list, screenshot output directory, or PNG file paths. No new `## Kända luckor` bullet (WR-01 is being FIXED, not documented as a known gap, per the planning_context exclusion list).

Output: 1 file modified (`apps/web/scripts/captureSc04Screenshots.ts`); ~6 new lines for the redirect guard; ~10 lines refactored for the locator API (if IN-01 is bundled per recommendation).
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-ops-submission-polish/07-VERIFICATION.md
@.planning/phases/07-ops-submission-polish/07-REVIEW.md
@.planning/phases/07-ops-submission-polish/07-CONTEXT.md
@.planning/phases/07-ops-submission-polish/07-PATTERNS.md
@apps/web/scripts/captureSc04Screenshots.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Insert WR-01 redirect guard after page.goto / waitForLoadState</name>
  <files>apps/web/scripts/captureSc04Screenshots.ts</files>
  <read_first>
    - apps/web/scripts/captureSc04Screenshots.ts (full file; lines 88–155 are the main loop; lines 100–101 are the goto+waitForLoadState pair; lines 103–112 are the overflow assertion; line 122 is the page.$$ call IN-01 references)
    - 07-VERIFICATION.md Anti-Patterns Found row for WR-01 (lines 88–112 reference)
    - 07-REVIEW.md `## Warnings ### WR-01` (the literal fix snippet — `currentPath` + `if … continue`)
    - 07-VERIFICATION.md human_verification[1] (the live re-run is the user's confirmation gate after this plan executes — informs expected behavior but is NOT this plan's deliverable)
  </read_first>
  <action>
    Single Edit operation on `apps/web/scripts/captureSc04Screenshots.ts`.

    Locate the existing pair (line ~100–101):

    ```ts
            // Navigate to the route
            await page.goto(BASE_URL + route.path);
            await page.waitForLoadState('networkidle');

            // --- Assertion 1: no horizontal overflow ---
    ```

    Insert the redirect-guard block BETWEEN `waitForLoadState('networkidle');` and the `// --- Assertion 1: …` comment. The inserted block, verbatim from 07-REVIEW.md WR-01 snippet (with project-consistent indentation matching the surrounding code — 8 spaces inside the inner `for` body):

    ```ts
            // If we are authenticated and this is the login route, the app redirects to
            // /dashboard — the overflow check would measure the wrong page. Skip the cell.
            const currentPath = new URL(page.url()).pathname;
            if (currentPath !== route.path) {
              console.log(`  (skipped: redirected from ${route.path} → ${currentPath})`);
              continue;
            }
    ```

    Indentation MUST match the surrounding code (the `await page.goto(...)` line uses 8 leading spaces — same indent level). Use back-tick template literal (NOT escaped string concat — match the existing log style on line 153).

    The `continue` exits the inner `for (const route of ROUTES)` loop iteration. The subsequent assertions (overflow, primary-nav, screenshot capture, progress log) are SKIPPED for the redirected cell — which is the intended behavior. The outer `for (const viewport of VIEWPORTS)` loop is unaffected.

    Do NOT change:
    - The `loginAsAdmin(page)` call on the first non-anonymous route at viewport 360 (lines 93–97).
    - The `await page.goto(BASE_URL + route.path)` call itself (the guard runs AFTER goto + waitForLoadState).
    - The overflow assertion logic.
    - The screenshot capture block (`if (viewport.width === 360) { … }`).
    - The final progress log on line 153 (`console.log(\`✓ ${viewport.width}x${viewport.height} ${route.path}\`)`).
    - The final success-banner / exit-code logic at lines 165–173.

    The success banner at line 172 currently reads `all 24 cells (${VIEWPORTS.length} viewports x ${ROUTES.length} routes) OK.` — keep this string AS-IS. The arithmetic still computes 4×6=24; the banner expresses the matrix size, not the verified-cell count. Cells that were skipped are visible in the per-cell log lines (the new `(skipped: …)` lines and the existing `✓ …` lines); the operator can count if they care. (A future iteration could surface a `<verified>/<skipped>/<total>` count in the banner, but that's a separate concern from WR-01 and not in scope here.)
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. The new diagnostic log line exists exactly once:
      test "$(grep -c 'skipped: redirected from' apps/web/scripts/captureSc04Screenshots.ts)" -eq 1
      # 2. The pathname comparison exists:
      grep -F 'const currentPath = new URL(page.url()).pathname;' apps/web/scripts/captureSc04Screenshots.ts
      # 3. The guard uses `continue` to skip the redirected cell:
      grep -nE 'if \(currentPath !== route\.path\)' apps/web/scripts/captureSc04Screenshots.ts
      # 4. The guard is placed AFTER waitForLoadState and BEFORE the overflow assertion:
      awk '
        /await page\.waitForLoadState/ { saw_wait = NR }
        /currentPath !== route\.path/  { saw_guard = NR }
        /Assertion 1: no horizontal overflow/ { saw_overflow = NR }
        END {
          if (!saw_wait || !saw_guard || !saw_overflow) { print "MISSING anchor"; exit 1 }
          if (!(saw_wait < saw_guard && saw_guard < saw_overflow)) { print "WRONG order: wait=" saw_wait " guard=" saw_guard " overflow=" saw_overflow; exit 1 }
          print "OK: wait=" saw_wait " guard=" saw_guard " overflow=" saw_overflow
        }
      ' apps/web/scripts/captureSc04Screenshots.ts
      # 5. page.goto + waitForLoadState are still present (we did not accidentally remove them):
      grep -F 'await page.goto(BASE_URL + route.path);' apps/web/scripts/captureSc04Screenshots.ts
      grep -F "await page.waitForLoadState('networkidle');" apps/web/scripts/captureSc04Screenshots.ts
      # 6. TypeScript still compiles (no type errors introduced):
      pnpm --filter @meditrack/web typecheck
    </automated>
  </verify>
  <done>
    `apps/web/scripts/captureSc04Screenshots.ts` contains the redirect-guard block between `waitForLoadState` and `--- Assertion 1` (verified by `awk` ordering check). `pnpm --filter @meditrack/web typecheck` exits 0. All other harness logic (login, overflow assertion, primary-nav assertion, screenshot capture, progress log, exit-code banner) is byte-identical to pre-change state.
  </done>
</task>

<task type="auto">
  <name>Task 2 [optional bundle]: Refactor IN-01 — page.$$() → page.locator() API for primary-nav assertion</name>
  <files>apps/web/scripts/captureSc04Screenshots.ts</files>
  <read_first>
    - apps/web/scripts/captureSc04Screenshots.ts lines 114–141 (the primary-nav assertion block — `if (!route.anonymous) { const navHandles = await page.$$(...); … }`)
    - 07-VERIFICATION.md Anti-Patterns Found row for IN-01 (line 122 reference)
    - 07-REVIEW.md `## Info ### IN-01` (the literal before/after fix snippet — `navHandles`/`navLocator` swap)
  </read_first>
  <action>
    This task is recommended-bundle per planning_context ("adding the locator refactor inside the same plan avoids a second drive-by commit on the same file"). Executor discretion: skip this task if you prefer two thin commits inside the same slice — both options are acceptable. If bundled, the slice ships one commit `fix(07-08): close WR-01 (sc04 redirect guard) + IN-01 (locator API refactor)`; if split, ship two commits within the same plan execution: `fix(07-08): close WR-01 (sc04 redirect guard)` then `chore(07-08): close IN-01 (sc04 page.$$ → page.locator)`. Default: BUNDLE.

    Single Edit operation on `apps/web/scripts/captureSc04Screenshots.ts`. Locate the block at lines ~121–141:

    ```ts
            if (!route.anonymous) {
              const navHandles = await page.$$('[data-test="primary-nav"]');
              if (navHandles.length === 0) {
                failures.push(
                  `primary nav (data-test="primary-nav") not found at ${viewport.width}x${viewport.height} on ${route.path}`,
                );
              } else {
                let anyVisible = false;
                for (const h of navHandles) {
                  if (await h.isVisible()) {
                    anyVisible = true;
                    break;
                  }
                }
                if (!anyVisible) {
                  failures.push(
                    `primary nav not visible at ${viewport.width}x${viewport.height} on ${route.path}`,
                  );
                }
              }
            }
    ```

    Replace with the locator-API equivalent (per 07-REVIEW.md IN-01 fix snippet — preserves the same OR-reduced visibility semantics, the same failures[] message strings byte-for-byte, the same `route.anonymous` carve-out, the same 8-space indentation):

    ```ts
            if (!route.anonymous) {
              const navLocator = page.locator('[data-test="primary-nav"]');
              const navCount = await navLocator.count();
              if (navCount === 0) {
                failures.push(
                  `primary nav (data-test="primary-nav") not found at ${viewport.width}x${viewport.height} on ${route.path}`,
                );
              } else {
                let anyVisible = false;
                for (let i = 0; i < navCount; i++) {
                  if (await navLocator.nth(i).isVisible()) {
                    anyVisible = true;
                    break;
                  }
                }
                if (!anyVisible) {
                  failures.push(
                    `primary nav not visible at ${viewport.width}x${viewport.height} on ${route.path}`,
                  );
                }
              }
            }
    ```

    The two failures[] message strings (`primary nav (data-test="primary-nav") not found …` and `primary nav not visible …`) MUST remain byte-identical — they are the contract for what shows up in failures-mode stderr output.

    Do NOT change the surrounding carve-out (`if (!route.anonymous) { … }`) — the `/login` route still must not trigger the assertion (login page renders no AppShell, hence no primary nav).

    Do NOT touch the imports block (line 19: `import { chromium, type Browser, type Page } from '@playwright/test';`). The `Locator` type is implied through `page.locator(...)` return-type inference and does not need a top-level import.

    If you SKIP this task (split-commit option), the file retains `page.$$('[data-test="primary-nav"]')`. The harness still works; the deprecation is soft. IN-01 is INFO, not WARNING.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # The following assertions apply ONLY if Task 2 was executed (bundled per recommendation).
      # If the executor chose to skip Task 2, this verify block is also skipped — record the choice
      # in the SUMMARY.md and run only Task 1's verify block above.
      #
      # 1. Legacy page.$$ call for [data-test="primary-nav"] is gone:
      test "$(grep -F 'page.$$(\047[data-test=\"primary-nav\"]\047)' apps/web/scripts/captureSc04Screenshots.ts | wc -l)" -eq 0
      # 2. New locator API is in use:
      grep -F "page.locator('[data-test=\"primary-nav\"]')" apps/web/scripts/captureSc04Screenshots.ts
      # 3. navCount is computed via .count():
      grep -F 'const navCount = await navLocator.count();' apps/web/scripts/captureSc04Screenshots.ts
      # 4. The OR-reduce loop iterates by index using .nth(i).isVisible():
      grep -F 'await navLocator.nth(i).isVisible()' apps/web/scripts/captureSc04Screenshots.ts
      # 5. The failures[] message strings are byte-identical to pre-change:
      grep -F 'primary nav (data-test="primary-nav") not found at ' apps/web/scripts/captureSc04Screenshots.ts
      grep -F 'primary nav not visible at ' apps/web/scripts/captureSc04Screenshots.ts
      # 6. The `if (!route.anonymous)` carve-out is preserved:
      grep -F 'if (!route.anonymous)' apps/web/scripts/captureSc04Screenshots.ts
      # 7. TypeScript still compiles:
      pnpm --filter @meditrack/web typecheck
    </automated>
  </verify>
  <done>
    `apps/web/scripts/captureSc04Screenshots.ts` no longer contains the legacy `page.$$('[data-test="primary-nav"]')` call (if Task 2 executed). The primary-nav assertion uses `page.locator(...)` + `.count()` + `.nth(i).isVisible()` with the same failures[] message strings as before. `pnpm --filter @meditrack/web typecheck` exits 0. If Task 2 was skipped, this is recorded in `07-08-SUMMARY.md` as `IN-01: deferred`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| captureSc04Screenshots.ts → developer's shell + headless Chromium | The script runs locally with the developer's privileges against `http://localhost:5173`. No remote endpoints, no production data, no secrets read. The redirect-guard fix is a pure control-flow change; the locator-API refactor swaps two equivalent Playwright APIs. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-11 | Repudiation | SC#4 verification harness | mitigate | The WR-01 fix removes a silent false-negative that previously caused 3 of 24 cells to report passing when they had actually measured the wrong page. Post-fix, the per-cell log is honest: skipped cells are explicit, passed cells are real. The harness's exit code now reflects what was actually verified. |
| T-07-12 | Tampering | Playwright API surface | accept | The IN-01 refactor moves from `page.$$()` (ElementHandle) to `page.locator()` (Locator). Both APIs are part of `@playwright/test`'s public surface. Semantics are equivalent for the assertion we use (OR-reduced isVisible). The migration removes a future deprecation warning. |
| T-07-13 | All other ASVS L1 categories | N/A | out-of-scope | Local-development tooling; no production exposure; no new dependencies; no new attack surface. |
</threat_model>

<verification>
- `grep -c "skipped: redirected" apps/web/scripts/captureSc04Screenshots.ts` returns 1 (Task 1).
- `grep -F "new URL(page.url()).pathname" apps/web/scripts/captureSc04Screenshots.ts` matches (Task 1).
- The `awk` ordering check confirms the guard is BETWEEN `waitForLoadState` and `--- Assertion 1: no horizontal overflow ---`.
- If Task 2 bundled: legacy `page.$$('[data-test="primary-nav"]')` call is gone; `page.locator('[data-test="primary-nav"]')` is present with `.count()` and `.nth(i).isVisible()`.
- `pnpm --filter @meditrack/web typecheck` exits 0 — no TypeScript regressions.
- The two failures[] message strings (`primary nav (data-test="primary-nav") not found at ${…}` and `primary nav not visible at ${…}`) are byte-identical to pre-change state.
- On the user's live re-run against a fresh `docker compose up`, the harness emits three `(skipped: redirected from /login → /dashboard)` log lines and the final banner reflects the genuine pass count — this is the human_verification[1] gate from 07-VERIFICATION.md, addressed out-of-band by the user.
</verification>

<success_criteria>
- 1 file modified: `apps/web/scripts/captureSc04Screenshots.ts`.
- Task 1 (WR-01) is mandatory; Task 2 (IN-01) is recommended-bundle but skippable per planner discretion.
- All grep + awk assertions in `<verify>` blocks pass.
- `pnpm --filter @meditrack/web typecheck` exits 0.
- Commit message follows Pattern B: scoped `fix(07-08)` (Task 1); if Task 2 bundled, the subject also cites IN-01 (`fix(07-08): close WR-01 (sc04 redirect guard) + IN-01 (locator API refactor)`). Commit body cites both gap IDs verbatim so the verifier can grep-trace gap → plan → commit.
- After this plan + 07-07 + 07-09 land, re-running gsd-verifier on Phase 7 reports WR-01 + IN-01 (if bundled) as resolved.
</success_criteria>

<output>
Create `.planning/phases/07-ops-submission-polish/07-08-SUMMARY.md` when done, listing:
- The exact diff for the redirect-guard insertion (Task 1).
- The exact diff for the locator-API refactor (Task 2), OR `IN-01: deferred — file retains page.$$ pending future cleanup`.
- The commit SHA(s) — one if bundled, two if split per planner discretion.
- Confirmation that `pnpm --filter @meditrack/web typecheck` exited 0.
- Confirmation that the `awk` ordering check passed (guard placement is correct).
- Note that human re-run against live `docker compose up` is the residual gate (07-VERIFICATION.md human_verification[1]) — NOT this plan's deliverable.
</output>
