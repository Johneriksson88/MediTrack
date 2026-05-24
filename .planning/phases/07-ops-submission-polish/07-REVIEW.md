---
phase: 07-ops-submission-polish
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - README.md
  - apps/api/package.json
  - apps/web/package.json
  - apps/web/scripts/captureSc04Screenshots.ts
  - apps/web/src/routes/shell/BottomTabBar.tsx
  - apps/web/src/routes/shell/Sidebar.tsx
  - package.json
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-05-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Seven files reviewed across the ops/submission-polish phase: the README restructure and Swedish translation, both shell nav components, the SC#4 Playwright verification harness, and the three package.json files. The nav components (`BottomTabBar`, `Sidebar`) and package manifests are clean. The SC#4 harness has one correctness bug in how it handles the login route at non-first viewports. The README has one factual error (Tailwind version), one internal inconsistency (audited-models list), and one mildly misleading description of the verify command's build step.

## Critical Issues

### CR-01: README claims Tailwind CSS 4 but package installs Tailwind CSS 3

**File:** `apps/web/package.json:51`, `README.md:47`
**Issue:** The architecture table in the README states the UI kit is "shadcn/ui + Tailwind CSS 4". The installed version is `"tailwindcss": "^3.4.7"` — Tailwind v3. This is a factual error that an interviewer reading the README alongside the package manifest will immediately catch. Tailwind v4 has a completely different configuration model (no `tailwind.config.js`, CSS-first configuration); the presence of `tailwind.config.js` (implied by the v3 dev-dependencies `autoprefixer`, `postcss`) confirms the stack is v3.
**Fix:** Change the README architecture table cell from:
```
shadcn/ui + Tailwind CSS 4
```
to:
```
shadcn/ui + Tailwind CSS 3
```

## Warnings

### WR-01: SC#4 harness measures the wrong page for the login route at viewports 768, 1024, 1440

**File:** `apps/web/scripts/captureSc04Screenshots.ts:88-112`
**Issue:** The `loggedIn` flag is set after the first non-anonymous route at viewport 360. For all subsequent viewports (768, 1024, 1440), when the inner loop reaches the `login` route (`anonymous: true`), the code calls `page.goto('/login')` without checking whether the user is already authenticated. If the SPA redirects authenticated users away from `/login` (standard behaviour), the page ends up on `/dashboard` while `route.path` in the diagnostic message and the test logic still reads `/login`. The overflow assertion then measures the dashboard page, not the login page, producing a silent false-negative (it passes because the dashboard has no horizontal overflow, not because the login page does). The route is also silently counted as verified in the success message.

No screenshot is captured for non-360 viewports, so there is no visible artifact revealing the wrong measurement. The success banner `"all 24 cells … OK"` is therefore misleading for the three login-at-non-360 cells.

**Fix:** Before calling `page.goto` for the login route at later viewports, either (a) log out to force a clean login-page render, or (b) skip the overflow check for anonymous routes when already logged in, or (c) move login to a dedicated setup step before the outer viewport loop and skip the login route from the matrix check entirely. Simplest option:

```ts
// Navigate to the route, handling authenticated redirect for /login
await page.goto(BASE_URL + route.path);
await page.waitForLoadState('networkidle');

// If we are authenticated and this is the login route, the app redirects to
// /dashboard — the overflow check would measure the wrong page. Skip it.
const currentPath = new URL(page.url()).pathname;
if (currentPath !== route.path) {
  console.log(`  (skipped: redirected from ${route.path} → ${currentPath})`);
  continue;
}
```

### WR-02: README internal inconsistency — audited model list includes `AuditEvent` instead of `User`

**File:** `README.md:78-79`
**Issue:** The "Prisma $extends typed extensions" section lists the six audited models as `Medication`, `CareUnitMedication`, `Order`, `OrderLine`, `Session`, `AuditEvent`. The "Hur audit-hooken fungerar" section (line 534-536) and the "Vad granskas?" table (line 617ff) both correctly list them as `Medication`, `CareUnitMedication`, `Order`, `OrderLine`, `User`, `Session`. The line-79 list replaces `User` with `AuditEvent`. Auditing the audit table itself would be circular and is not what the code does. An interviewer reading the architecture description will see a contradiction between the summary and the deep-dive.
**Fix:** Change line 79 from:
```
`Order`, `OrderLine`, `Session`, `AuditEvent`
```
to:
```
`Order`, `OrderLine`, `User`, `Session`
```

### WR-03: `pnpm -r build` in `verify` will double-typecheck `apps/web` (redundant `tsc --noEmit`)

**File:** `apps/web/package.json:8`, `package.json:14`
**Issue:** `pnpm verify` runs `pnpm -r typecheck` (which runs `tsc --noEmit` in every workspace) and then `pnpm -r build`. The `apps/web` build script is `"build": "tsc --noEmit && vite build"` — it re-runs `tsc --noEmit` a second time before the Vite build. On a cold run this adds ~5-10 seconds of redundant typechecking and is confusing to contributors who expect `build` to produce artefacts, not re-typecheck.

This is not a correctness bug (`verify` produces the correct overall outcome), but it creates a misleading failure mode: if a type error is introduced, `pnpm -r typecheck` catches it and aborts `verify`, but if somehow it were skipped, `vite build` would succeed (Vite ignores TS errors by default) while `tsc --noEmit` inside `build` would also catch it — two different places asserting the same invariant with no clear owner.
**Fix:** Change `apps/web/package.json` build to not redundantly typecheck:
```json
"build": "vite build"
```
TypeChecking is already guaranteed by `pnpm -r typecheck` running first in the `verify` sequence.

## Info

### IN-01: `page.$$` is a legacy Playwright API; locator-based query preferred

**File:** `apps/web/scripts/captureSc04Screenshots.ts:122`
**Issue:** `page.$$('[data-test="primary-nav"]')` uses the `ElementHandle` API which Playwright has soft-deprecated in favour of the `Locator` API. The current code works but will produce a deprecation notice in future Playwright versions. The `Locator` API also provides better auto-waiting behaviour.
**Fix:**
```ts
// Replace:
const navHandles = await page.$$('[data-test="primary-nav"]');
if (navHandles.length === 0) {
  failures.push(...);
} else {
  let anyVisible = false;
  for (const h of navHandles) {
    if (await h.isVisible()) { anyVisible = true; break; }
  }
  ...
}

// With:
const navLocator = page.locator('[data-test="primary-nav"]');
const count = await navLocator.count();
if (count === 0) {
  failures.push(...);
} else {
  let anyVisible = false;
  for (let i = 0; i < count; i++) {
    if (await navLocator.nth(i).isVisible()) { anyVisible = true; break; }
  }
  ...
}
```

---

_Reviewed: 2026-05-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
