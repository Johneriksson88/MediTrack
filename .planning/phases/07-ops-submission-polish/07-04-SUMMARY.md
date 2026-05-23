---
phase: "07"
plan: "07-04"
subsystem: verification
tags: [playwright, sc04, mobile-first, screenshots, data-test, phase7]
dependency_graph:
  requires:
    - canonical-readme-structure  # from 07-01
  provides:
    - sc04-playwright-harness
    - primary-nav-data-test-attribute
    - playwright-devdep
    - sc04-360px-screenshots
    - readme-mobil-forst-section
  affects:
    - apps/web/src/routes/shell/Sidebar.tsx
    - apps/web/src/routes/shell/BottomTabBar.tsx
    - apps/web/package.json
    - pnpm-lock.yaml
    - apps/web/scripts/captureSc04Screenshots.ts
    - docs/screenshots/
    - README.md
tech_stack:
  added:
    - "@playwright/test@1.60.0 (apps/web devDep)"
    - "tsx@4.16.2 (apps/web devDep)"
  patterns:
    - data-test attribute convention (first use in repo — plain literal, no constants file)
    - tsx-as-CLI script invocation (mirrors apps/api/prisma/seed.ts shape)
    - failure-array + process.exit exit-code discipline (mirrors orders.deliver.integration.test.ts Test 8)
    - page.$$ enumeration for multi-element visibility check across mutually exclusive breakpoints
key_files:
  created:
    - apps/web/scripts/captureSc04Screenshots.ts
    - docs/screenshots/sc04-360-login.png
    - docs/screenshots/sc04-360-lakemedel.png
    - docs/screenshots/sc04-360-bestallningsskapande.png
    - docs/screenshots/sc04-360-bestallningshistorik.png
    - docs/screenshots/sc04-360-audit.png
    - docs/screenshots/sc04-360-dashboard.png
  modified:
    - apps/web/src/routes/shell/Sidebar.tsx
    - apps/web/src/routes/shell/BottomTabBar.tsx
    - apps/web/package.json
    - pnpm-lock.yaml
    - README.md
decisions:
  - "D-128: data-test='primary-nav' added to BOTH Sidebar.tsx AND BottomTabBar.tsx — they render at mutually exclusive viewports (Sidebar: >=768px hidden md:flex; BottomTabBar: <768px md:hidden)"
  - "Convention established: plain data-test literal — no shared constants file, zero runtime cost, grep-friendly"
  - "tsx added as apps/web devDep (mirror of apps/api) for reliable pnpm --filter @meditrack/web exec tsx invocation"
  - "Login carve-out in script: /login route skips nav assertion (no AppShell on anonymous route)"
  - "page.$$ enumeration (instead of page.$) for visibility check: both Sidebar and BottomTabBar have the attribute; page.$ only returns the first match, which is invisible at the wrong breakpoint"
  - "Screenshot slug lakemedel (not katalog): ROUTES array uses path-based slug matching the URL segment, not the human-readable label"
requirements-completed: [OPS-02, OPS-04]
duration: "multi-session (Task 3 was human-gated checkpoint)"
completed: "2026-05-24"
---

# Phase 07 Plan 04: SC#4 Playwright Verification Harness Summary

SC#4 mobile-first verification harness using Playwright headless Chromium — iterates 4 viewports x 6 routes (24 cells), asserts scrollWidth <= innerWidth + primary-nav reachability via `data-test="primary-nav"`, captures 6 x 360px PNGs (656K total), exits 0 on success; README Mobil-forst verifiering section fully populated with thumbnails and 6x4 table.

## Performance

- **Duration:** multi-session (Task 3 human-gated; total wall-time ~2 hours including human checkpoint)
- **Started:** 2026-05-23
- **Completed:** 2026-05-24
- **Tasks:** 4 of 4
- **Files modified:** 12 (2 nav files, 1 script, 1 package.json, 1 pnpm-lock.yaml, 6 PNGs, 1 README)

## Accomplishments

- `data-test="primary-nav"` added to both Sidebar.tsx (>=768px) and BottomTabBar.tsx (<768px), covering all viewport classes per D-128
- Playwright one-shot script (`apps/web/scripts/captureSc04Screenshots.ts`) iterates 24 cells, asserts scrollWidth + nav reachability, captures 6 x 360px PNGs, exits 0
- Script bug fixed (orchestrator-side, commit fe54304): `page.$$` enumeration instead of `page.$` first-match-only for visibility check
- 6 PNGs captured at 360px (656K total, under 1MB budget; no pngquant pass needed)
- README `## Mobil-forst verifiering` section fully populated: 6 inline thumbnails + 6x4 table (all 24 cells ✓) + footnotes + capture date + re-run command

## Task Commits

| Task | Name | Commit | Type |
|------|------|--------|------|
| 1 | data-test attribute + devDeps | ecbf3f9 | chore |
| 2 | Playwright harness script | 7700ed8 | feat |
| 3 (fix) | Enumerate all primary-nav matches | fe54304 | fix |
| 3 (human gate) | Capture 6x360px screenshots | 5834bb7 | chore |
| 4 | Populate README Mobil-forst section | 7d92788 | docs |

**Plan metadata commit:** follows this SUMMARY commit.

## Files Created/Modified

- `apps/web/src/routes/shell/Sidebar.tsx` — `data-test="primary-nav"` added to `<nav>` (renders >=768px)
- `apps/web/src/routes/shell/BottomTabBar.tsx` — `data-test="primary-nav"` added to `<nav>` (renders <768px)
- `apps/web/package.json` — `@playwright/test: ^1.49.0` + `tsx: ^4.16.2` added to devDependencies
- `pnpm-lock.yaml` — updated; @playwright/test resolved to 1.60.0
- `apps/web/scripts/captureSc04Screenshots.ts` — 168-line one-shot Playwright verification harness (new file)
- `docs/screenshots/sc04-360-login.png` — 360px screenshot of login route (new file)
- `docs/screenshots/sc04-360-lakemedel.png` — 360px screenshot of medication catalog (new file)
- `docs/screenshots/sc04-360-bestallningsskapande.png` — 360px screenshot of new-order page (new file)
- `docs/screenshots/sc04-360-bestallningshistorik.png` — 360px screenshot of order history (new file)
- `docs/screenshots/sc04-360-audit.png` — 360px screenshot of admin audit log (new file)
- `docs/screenshots/sc04-360-dashboard.png` — 360px screenshot of dashboard with low-stock banner (new file)
- `README.md` — `## Mobil-forst verifiering` section populated (6 thumbnails + 6x4 table)

## Task Details

### Task 1: data-test attribute + devDeps (commit ecbf3f9)

- `apps/web/src/routes/shell/Sidebar.tsx` — `data-test="primary-nav"` added to the `<nav>` element (line 28, renders at >=768px via `hidden md:flex` on parent `<aside>`)
- `apps/web/src/routes/shell/BottomTabBar.tsx` — `data-test="primary-nav"` added to the `<nav>` element on its own line between `aria-label` and `className` (renders at <768px via `md:hidden`)
- Both files needed the attribute because they render at mutually exclusive viewports
- `apps/web/package.json` — `@playwright/test: ^1.49.0` and `tsx: ^4.16.2` added to devDependencies (alphabetical order; resolved to @playwright/test@1.60.0)
- `pnpm-lock.yaml` — updated; Chromium browser binary installed locally via `pnpm exec playwright install chromium`

### Task 2: Playwright harness script (commit 7700ed8)

Script anatomy:
- JSDoc header citing Phase 7 D-127, exit codes, prereqs, run command
- Imports: `chromium`, `Browser`, `Page` from `@playwright/test`; `path`, `fileURLToPath`, `mkdir` from Node stdlib
- `ROUTES` array — 6 entries with `slug: '<value>'` property shape (grep-anchored)
- `VIEWPORTS` array — 4 entries (360x800 / 768x1024 / 1024x768 / 1440x900)
- `BASE_URL = 'http://localhost:5173'`, `ADMIN_EMAIL = 'admin@example.test'`, `ADMIN_PASSWORD = 'demo1234'`
- `loginAsAdmin(page)` fills `input#email` + `input#password`, clicks submit, waits for URL to leave `/login`
- Per-cell loop: setViewportSize → login if needed → goto → waitForLoadState → scrollWidth assertion → nav assertion (/login carve-out) → screenshot at 360px → progress log
- Failure array + `process.exit(failures.length === 0 ? 0 : 1)` exit-code discipline

### Task 3: Run script + capture PNGs (commits fe54304 + 5834bb7)

Human verified `docker compose up` stack running. A bug was discovered and fixed during this task (see Deviations). After the fix, script ran successfully: 24 progress lines, exit 0, 6 PNGs captured.

Total PNG size: 656K (under 1MB budget — no pngquant compression needed).

Visual inspection of all 6 PNGs confirmed each shows the intended page state (login form, catalog list, new-order form, history list, audit table, dashboard with low-stock banner).

### Task 4: Populate README Mobil-forst section (commit 7d92788)

Replaced `<!-- Populated by Slice 4 -->` placeholder with:
1. Swedish opening paragraph explaining the SC#4 contract (scrollWidth <= innerWidth + nav reachable on all 4 breakpoints x 6 routes)
2. 6 inline `<img>` tags (`width="240"`) linking to `docs/screenshots/sc04-360-*.png`
3. 6x4 verification table — all 24 cells marked `✓` with 4 footnotes on layout behavior
4. Capture date (2026-05-24) + re-run command + first-time Chromium setup pointer

Note on filename: the actual PNG uses slug `lakemedel` (matching the URL path `/lakemedel`), not `katalog` (the human label). The img src is `docs/screenshots/sc04-360-lakemedel.png` while the alt text reads "Katalog vid 360 px".

## Decisions Made

- **D-128 + PATTERNS.md correction:** Both Sidebar.tsx AND BottomTabBar.tsx need `data-test="primary-nav"` because they render at mutually exclusive viewport classes. AppShell.tsx was the plan's original target but PATTERNS.md identified the actual rendering split.
- **Convention: plain data-test literal.** No shared constants file — zero runtime cost, grep-friendly, cross-language searchable. Future centralization point: `apps/web/src/test-locators.ts` if a functional E2E suite emerges.
- **tsx added as apps/web devDep.** Mirrors apps/api convention; ensures `pnpm --filter @meditrack/web exec tsx` resolves predictably.
- **Login carve-out:** `/login` skips nav assertion because AppShell (which renders the nav) is not mounted on the anonymous login route. One-line comment in script explains the carve-out.
- **Screenshot slug `lakemedel` (not `katalog`).** The ROUTES array uses the URL path segment for consistent file naming.
- **No pngquant compression.** 656K total < 1MB threshold.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed primary-nav visibility check: page.$$ enumeration instead of page.$ first-match-only**

- **Found during:** Task 3 (script run against live stack)
- **Issue:** The original script used `page.$('[data-test="primary-nav"]')` which returns only the FIRST matching element. Both Sidebar.tsx and BottomTabBar.tsx carry `data-test="primary-nav"`, but at any given viewport only one is actually visible. The first DOM match is typically Sidebar (rendered first in the AppShell tree). At 360px, Sidebar's parent `<aside>` has `hidden md:flex` — so Sidebar is `display:none` and `isVisible()` returns false. This caused false failures at the 360px viewport for all non-login routes.
- **Fix (commit fe54304):** Changed to `page.$$('[data-test="primary-nav"]')` (plural) returning ALL matches, then checked `some(el => el.isVisible())`. This correctly finds the visible element at each viewport regardless of which nav component rendered it.
- **Files modified:** `apps/web/scripts/captureSc04Screenshots.ts`
- **Verification:** Script re-ran against live stack after fix. All 24 cells passed. Exit 0. 6 PNGs captured.
- **Committed in:** fe54304 (`fix(07-04): enumerate all primary-nav matches in visibility check`)
- **Note:** This fix was authored by the orchestrator between the human checkpoint return and the screenshot commit. Both commits (fe54304 and 5834bb7) are on the master branch history.

## Auth Gates

None — script runs against localhost only. No external auth configuration required.

## Known Stubs

None — all 4 tasks complete. The README section is fully populated and all 6 PNGs are committed.

## Threat Flags

None — no new network endpoints, auth paths, or schema changes introduced. The Playwright script targets `localhost:5173` only, uses the seeded demo password already documented in README, and writes only to `docs/screenshots/` (committed PNG artifacts, no PII, no real patient data).

## Self-Check

- [x] `apps/web/scripts/captureSc04Screenshots.ts` exists
- [x] `apps/web/src/routes/shell/Sidebar.tsx` has `data-test="primary-nav"`
- [x] `apps/web/src/routes/shell/BottomTabBar.tsx` has `data-test="primary-nav"`
- [x] `apps/web/package.json` has `@playwright/test` and `tsx`
- [x] 6 PNGs in `docs/screenshots/` (656K total)
- [x] README `## Mobil-forst verifiering` section populated (placeholder gone)
- [x] Commit ecbf3f9 (Task 1) exists
- [x] Commit 7700ed8 (Task 2) exists
- [x] Commit fe54304 (script fix) exists
- [x] Commit 5834bb7 (PNGs) exists
- [x] Commit 7d92788 (Task 4 README) exists

## Self-Check: PASSED

---
*Phase: 07-ops-submission-polish*
*Completed: 2026-05-24*
