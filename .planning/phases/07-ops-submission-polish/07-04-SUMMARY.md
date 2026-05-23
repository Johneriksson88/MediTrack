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
  affects:
    - apps/web/src/routes/shell/Sidebar.tsx
    - apps/web/src/routes/shell/BottomTabBar.tsx
    - apps/web/package.json
    - pnpm-lock.yaml
    - apps/web/scripts/captureSc04Screenshots.ts
    - README.md  (Task 4 — pending)
    - docs/screenshots/  (Task 3 — pending human gate)
tech_stack:
  added:
    - "@playwright/test@1.60.0 (apps/web devDep)"
    - "tsx@4.16.2 (apps/web devDep)"
  patterns:
    - data-test attribute convention (first use in repo — plain literal, no constants file)
    - tsx-as-CLI script invocation (mirrors apps/api/prisma/seed.ts shape)
    - failure-array + process.exit exit-code discipline (mirrors orders.deliver.integration.test.ts Test 8)
key_files:
  created:
    - apps/web/scripts/captureSc04Screenshots.ts
  modified:
    - apps/web/src/routes/shell/Sidebar.tsx
    - apps/web/src/routes/shell/BottomTabBar.tsx
    - apps/web/package.json
    - pnpm-lock.yaml
decisions:
  - "D-128: data-test='primary-nav' added to BOTH Sidebar.tsx AND BottomTabBar.tsx — they render at mutually exclusive viewports (Sidebar: >=768px hidden md:flex; BottomTabBar: <768px md:hidden)"
  - "Convention established: plain data-test literal — no shared constants file, zero runtime cost, grep-friendly"
  - "tsx added as apps/web devDep (mirror of apps/api) for reliable pnpm --filter @meditrack/web exec tsx invocation"
  - "Login carve-out in script: /login route skips nav assertion (no AppShell on anonymous route)"
metrics:
  duration: "ongoing (checkpoint at Task 3)"
  completed: "2026-05-24"
  tasks_completed: 2
  tasks_total: 4
  files_modified: 5
---

# Phase 07 Plan 04: SC#4 Playwright Verification Harness Summary

SC#4 mobile-first verification harness using Playwright headless Chromium — iterates 4 viewports x 6 routes (24 cells), asserts scrollWidth <= innerWidth + primary-nav reachability via `data-test="primary-nav"`, captures 6 x 360px PNGs, exits 0 on success.

## Status: Checkpoint at Task 3

Tasks 1 and 2 are committed. Task 3 (run script + capture PNGs) is a `checkpoint:human-verify` — requires a live `docker compose up` stack. Task 4 (README section) follows after the PNGs exist.

## What Was Built (Tasks 1-2)

### Task 1: data-test attribute + devDeps (commit ecbf3f9)

- `apps/web/src/routes/shell/Sidebar.tsx` — `data-test="primary-nav"` added to the `<nav>` element (line 28, renders at >=768px via `hidden md:flex` on parent `<aside>`)
- `apps/web/src/routes/shell/BottomTabBar.tsx` — `data-test="primary-nav"` added to the `<nav>` element on its own line between `aria-label` and `className` (renders at <768px via `md:hidden`)
- Both files needed the attribute because they render at mutually exclusive viewports — missing either breaks the script's nav-reachability assertion at one breakpoint class
- `apps/web/package.json` — `@playwright/test: ^1.49.0` and `tsx: ^4.16.2` added to devDependencies (alphabetical order; resolved to @playwright/test@1.60.0)
- `pnpm-lock.yaml` — updated; Chromium browser binary installed locally via `playwright install chromium`

### Task 2: Playwright harness script (commit 7700ed8)

- `apps/web/scripts/` directory created (first scripts/ directory in apps/web)
- `apps/web/scripts/captureSc04Screenshots.ts` — 168-line one-shot verification script

Script anatomy:
- JSDoc header citing Phase 7 D-127, exit codes, prereqs, run command
- Imports: `chromium`, `Browser`, `Page` from `@playwright/test`; `path`, `fileURLToPath`, `mkdir` from Node stdlib
- `ROUTES` array — 6 entries with `slug: '<value>'` property shape (grep-anchored)
- `VIEWPORTS` array — 4 entries (360x800 / 768x1024 / 1024x768 / 1440x900)
- `BASE_URL = 'http://localhost:5173'`
- `ADMIN_EMAIL = 'admin@example.test'` / `ADMIN_PASSWORD = 'demo1234'`
- `SCREENSHOTS_DIR = path.resolve(__dirname, '../../../docs/screenshots')`
- `loginAsAdmin(page)` — fills `input#email` + `input#password`, clicks `button[type="submit"]`, waits for URL to leave `/login`
- Per-cell loop: setViewportSize → [login if needed] → goto → waitForLoadState → scrollWidth assertion → nav assertion (with /login carve-out) → screenshot at 360px → console.log progress
- Failure array + `process.exit(failures.length === 0 ? 0 : 1)` exit-code discipline

### Installer notes

- `@playwright/test@1.49.0` pinned in package.json; resolved to 1.60.0 at install time
- Chromium binary downloaded to `%LOCALAPPDATA%\ms-playwright\chromium-1223` (not committed)
- `pnpm --filter @meditrack/web exec playwright install chromium` documented as first-time setup

## What Remains (Tasks 3-4)

### Task 3 (human gate — blocking)
Run `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts` against a live `docker compose up` stack. Expected: 24 progress lines, exit 0, 6 PNGs in `docs/screenshots/`. Human must visually verify PNG content.

### Task 4 (auto — after Task 3)
Populate README `## Mobil-först verifiering` with 6 inline thumbnails (width="240") + 6x4 verification table + footnotes + capture date + re-run command.

## Deviations from Plan

None — plan executed exactly as written for Tasks 1 and 2.

## Known Stubs

- `docs/screenshots/sc04-360-*.png` — 6 PNG files not yet captured (pending Task 3 human gate)
- `README.md ## Mobil-först verifiering` — still contains `<!-- Populated by Slice 4 -->` placeholder (pending Task 4)

## Threat Flags

None — no new network endpoints, auth paths, or schema changes. The Playwright script targets `localhost:5173` only and uses the seeded demo password already documented in README.

## Self-Check

- [x] `apps/web/scripts/captureSc04Screenshots.ts` exists: confirmed
- [x] `apps/web/src/routes/shell/Sidebar.tsx` has `data-test="primary-nav"`: confirmed
- [x] `apps/web/src/routes/shell/BottomTabBar.tsx` has `data-test="primary-nav"`: confirmed
- [x] `apps/web/package.json` has `@playwright/test` and `tsx`: confirmed
- [x] Commit `ecbf3f9` exists: confirmed
- [x] Commit `7700ed8` exists: confirmed
- [x] `apps/web typecheck` passes including new script: confirmed

## Self-Check: PASSED (partial — Tasks 1-2 only; Tasks 3-4 pending checkpoint)
