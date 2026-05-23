---
phase: 07
plan: 07-04
type: execute
wave: 2
depends_on: [07-01]
files_modified:
  - apps/web/package.json
  - apps/web/scripts/captureSc04Screenshots.ts
  - apps/web/src/routes/shell/Sidebar.tsx
  - apps/web/src/routes/shell/BottomTabBar.tsx
  - docs/screenshots/sc04-360-login.png
  - docs/screenshots/sc04-360-katalog.png
  - docs/screenshots/sc04-360-bestallningsskapande.png
  - docs/screenshots/sc04-360-bestallningshistorik.png
  - docs/screenshots/sc04-360-audit.png
  - docs/screenshots/sc04-360-dashboard.png
  - README.md
autonomous: false
requirements_addressed: [OPS-02, OPS-04]
must_haves:
  truths:
    - "Implements D-126 (6×360 PNGs inlined + 6×4 verification table), D-127 (Playwright one-shot script + scrollWidth + nav-reachability assertions across 24 cells + exit-code discipline), D-128 (`data-test=\"primary-nav\"` attribute — applied to BOTH Sidebar.tsx AND BottomTabBar.tsx per PATTERNS.md correction)"
    - "Running the Playwright script against a live `docker compose up` stack exits 0 (script mechanically verifies SC#4 across all 24 cells)"
    - "Six 360 px PNGs exist at `docs/screenshots/sc04-360-<slug>.png` and render inline in README"
    - "`data-test=\"primary-nav\"` exists on BOTH Sidebar.tsx AND BottomTabBar.tsx (per PATTERNS.md correction — the two render at mutually exclusive viewports)"
    - "README `## Mobil-först verifiering` contains the 6 inlined thumbnails + 6×4 verification table"
  artifacts:
    - path: apps/web/scripts/captureSc04Screenshots.ts
      provides: "One-shot Playwright verification harness for SC#4"
      contains:
        - "from '@playwright/test'"
        - "VIEWPORTS = [360, 768, 1024, 1440]"
        - "'[data-test=\"primary-nav\"]'"
        - "process.exit"
    - path: apps/web/package.json
      provides: "@playwright/test + tsx as devDeps"
      contains:
        - "@playwright/test"
        - "tsx"
    - path: apps/web/src/routes/shell/Sidebar.tsx
      provides: "data-test=primary-nav on the desktop nav element"
      contains: ['data-test="primary-nav"']
    - path: apps/web/src/routes/shell/BottomTabBar.tsx
      provides: "data-test=primary-nav on the mobile nav element"
      contains: ['data-test="primary-nav"']
    - path: README.md
      provides: "## Mobil-först verifiering section with 6 inline PNG thumbnails + 6×4 table"
      contains:
        - "## Mobil-först verifiering"
        - "docs/screenshots/sc04-360-login.png"
        - "| 360 px | 768 px | 1024 px | 1440 px |"
  key_links:
    - from: apps/web/scripts/captureSc04Screenshots.ts
      to: '[data-test="primary-nav"]'
      via: page.$ selector
      pattern: 'data-test="primary-nav"'
    - from: README.md ## Mobil-först verifiering
      to: docs/screenshots/sc04-360-*.png
      via: markdown image tags with width="240"
      pattern: 'docs/screenshots/sc04-360-.*\.png'
---

<objective>
Build the SC#4 mobile-first verification harness per D-126 + D-127 + D-128: a Playwright one-shot script that drives headless Chromium across 24 cells (4 viewports × 6 routes), captures 6 PNGs at 360 px, asserts `scrollWidth ≤ innerWidth` + primary-nav reachability on every cell, and exits 0 = SC#4 mechanically verified. Plus the README `## Mobil-först verifiering` section gets populated with the 6 inline thumbnails + 6×4 verification table.

⚠ **PATTERNS.md correction (D-128 + Pattern Map):** The CONTEXT.md names `AppShell.tsx` as the target for `data-test="primary-nav"`, but PATTERNS.md verified the actual nav rendering is split across **two** files at mutually exclusive viewports: `Sidebar.tsx` (`md:flex` = ≥ 768 px) and `BottomTabBar.tsx` (`md:hidden` = < 768 px). BOTH files need the attribute or the script's reachability assertion silently fails at one breakpoint. This plan modifies BOTH files.

`autonomous: false` — Task 3 (run the Playwright script + commit PNGs) is a `checkpoint:human-verify` because:
- The script requires a live `docker compose up` stack running.
- A human must confirm the stack is up + database seeded before triggering the script.
- A human must visually inspect the resulting PNGs (do they actually show the intended page state? — animation glitches, loading spinners, font-not-loaded states are real risks).

Output: 1 new Playwright script, 1 root `docs/screenshots/` directory with 6 PNGs, 2 nav files gain `data-test` attribute, `apps/web/package.json` gains `@playwright/test` + `tsx` devDeps, README gets the `## Mobil-först verifiering` section populated.
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-ops-submission-polish/07-CONTEXT.md
@.planning/phases/07-ops-submission-polish/07-PATTERNS.md
@apps/web/src/routes/shell/Sidebar.tsx
@apps/web/src/routes/shell/BottomTabBar.tsx
@apps/web/src/routes/shell/nav.ts
@apps/api/test/orders.deliver.integration.test.ts
@apps/api/prisma/seed.ts
@apps/web/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add `data-test="primary-nav"` to BOTH Sidebar.tsx AND BottomTabBar.tsx; install Playwright devDep</name>
  <files>apps/web/src/routes/shell/Sidebar.tsx, apps/web/src/routes/shell/BottomTabBar.tsx, apps/web/package.json</files>
  <read_first>
    - apps/web/src/routes/shell/Sidebar.tsx (lines 27–28 — current `<nav className="flex flex-col" aria-label="Primary">` element per PATTERNS.md)
    - apps/web/src/routes/shell/BottomTabBar.tsx (lines 24–28 — current `<nav aria-label="Primary" className="md:hidden ...">` element per PATTERNS.md)
    - apps/web/package.json (current devDependencies lines 40–53 per PATTERNS.md — alphabetical sort convention)
    - .planning/phases/07-ops-submission-polish/07-PATTERNS.md (`apps/web/src/routes/shell/Sidebar.tsx AND BottomTabBar.tsx — add data-test="primary-nav"` section — explains the both-files requirement + line numbers + minimum-surface convention)
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (D-128)
  </read_first>
  <action>
    **(1) Edit `apps/web/src/routes/shell/Sidebar.tsx`** — locate the `<nav>` element on line 28 (currently `<nav className="flex flex-col" aria-label="Primary">`). Add the attribute `data-test="primary-nav"` to that element. Final form: `<nav className="flex flex-col" aria-label="Primary" data-test="primary-nav">`. No other edits to this file.

    **(2) Edit `apps/web/src/routes/shell/BottomTabBar.tsx`** — locate the `<nav>` element on lines 24–28. Add `data-test="primary-nav"` to that element. Place the attribute on its own line between `aria-label="Primary"` and `className="..."` per the existing multi-line attribute formatting in that file. No other edits.

    **(3) Edit `apps/web/package.json`** — add to `devDependencies` (alphabetical sort within the block):
      - `"@playwright/test": "^1.49.0"` (pin to stable major; executor picks latest patch at write-time per PATTERNS.md)
      - `"tsx": "^4.16.2"` (mirror `apps/api` line 39 — needed so `pnpm --filter @meditrack/web exec tsx ...` resolves predictably; per PATTERNS.md `apps/web/package.json` row)

    Then run `pnpm install` from the repo root so the new deps land in `node_modules` and `pnpm-lock.yaml` updates.

    Then run `pnpm --filter @meditrack/web exec playwright install chromium` to download the Chromium binary. (Browser binaries are ~150 MB and live in the developer's machine — NOT committed; documented in README under Tester / Mobil-först verifiering.)

    Establish the convention inline (plain `data-test="primary-nav"` literal — no shared constants file). Per PATTERNS.md: only used once per location, cross-language searchability, zero runtime cost. If a future functional E2E suite emerges, factor into `apps/web/src/test-locators.ts`; not now.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. Attribute present in BOTH files:
      grep -F 'data-test="primary-nav"' apps/web/src/routes/shell/Sidebar.tsx
      grep -F 'data-test="primary-nav"' apps/web/src/routes/shell/BottomTabBar.tsx
      # 2. Total count across apps/web/src is at least 2 (could be more if executor added elsewhere; just must not be 0 or 1):
      test $(grep -r 'data-test="primary-nav"' apps/web/src | wc -l) -ge 2
      # 3. devDeps land:
      node -e "const j=require('./apps/web/package.json'); if (!j.devDependencies['@playwright/test']) {console.error('@playwright/test missing'); process.exit(1)}"
      node -e "const j=require('./apps/web/package.json'); if (!j.devDependencies['tsx']) {console.error('tsx missing in apps/web devDeps'); process.exit(1)}"
      # 4. pnpm-lock updated and pnpm-store has the binaries:
      grep -F '@playwright/test' pnpm-lock.yaml
      # 5. existing aria-label is preserved:
      grep -F 'aria-label="Primary"' apps/web/src/routes/shell/Sidebar.tsx
      grep -F 'aria-label="Primary"' apps/web/src/routes/shell/BottomTabBar.tsx
      # 6. apps/web typecheck still passes (no TS regression from attribute add):
      pnpm --filter @meditrack/web typecheck
    </automated>
  </verify>
  <done>
    `data-test="primary-nav"` present on both Sidebar.tsx and BottomTabBar.tsx nav elements; `@playwright/test` + `tsx` in apps/web devDependencies; `pnpm-lock.yaml` updated; apps/web typecheck still exits 0.
  </done>
</task>

<task type="auto">
  <name>Task 2: Write `apps/web/scripts/captureSc04Screenshots.ts` Playwright harness</name>
  <files>apps/web/scripts/captureSc04Screenshots.ts</files>
  <read_first>
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (D-127 — full spec of the script; `<specifics>` — primary-nav assertion target, capture-only-at-360 rule, 6 route slugs)
    - .planning/phases/07-ops-submission-polish/07-PATTERNS.md (`apps/web/scripts/captureSc04Screenshots.ts` section — complete script anatomy with `ROUTES` array, `VIEWPORTS` array, login flow pattern, assertion + exit-code discipline, doc-comment header template — verbatim)
    - apps/api/test/orders.deliver.integration.test.ts (lines 22–37 doc-comment header pattern; lines 384–489 Test 8 assertion + poll discipline — structural cousin per PATTERNS.md)
    - apps/api/prisma/seed.ts (lines 1–45 doc-comment header pattern; lines 47–75 admin credentials `admin@example.test` / `demo1234`)
    - apps/web/src/routes/login/LoginPage.tsx (verify form field selectors — input names / placeholders for `page.fill`)
    - apps/web/src/routes/shell/nav.ts (route paths for the 6 primary routes)
  </read_first>
  <action>
    Create new file `apps/web/scripts/captureSc04Screenshots.ts`. The `apps/web/scripts/` directory does NOT exist yet (verified by PATTERNS.md) — create it cleanly. No `.gitignore` carve-out needed.

    Script anatomy follows PATTERNS.md verbatim. Required structure:

    **Doc-comment header** — JSDoc block at top of file using the exact template in PATTERNS.md `apps/web/scripts/captureSc04Screenshots.ts` section under "Doc-comment header pattern". Header must cite: "Phase 7 D-127", purpose, exit codes (0 = verified, non-zero = failure with diagnostic to stderr), prereq (`docker compose up` running), first-time setup (`pnpm exec playwright install chromium`), run command (`pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts`).

    **Imports** — per PATTERNS.md "Imports pattern to model":
      - `chromium`, `type Browser`, `type Page` from `@playwright/test`
      - `path` from `node:path`
      - `fileURLToPath` from `node:url`
      - `mkdir`, `writeFile` from `node:fs/promises` as needed

    **Constants** — verbatim from PATTERNS.md "Route iteration" section. The `ROUTES` array MUST use the literal `slug: '<value>'` shape (single-quoted property assignment, NOT shorthand or bare strings) so the verify block's `grep -F "slug: '<value>'"` anchors on the ROUTES-array context unambiguously:
      - `ROUTES` array (6 entries, each `{ slug: '<value>', path: '<path>', anonymous: <boolean> }` — slugs: login / lakemedel / bestallningsskapande / bestallningshistorik / audit / dashboard)
      - `VIEWPORTS` array (4 entries: 360×800 / 768×1024 / 1024×768 / 1440×900)
      - `BASE_URL` = `'http://localhost:5173'` (web dev server)
      - `ADMIN_EMAIL` = `'admin@example.test'`, `ADMIN_PASSWORD` = `'demo1234'` (from apps/api/prisma/seed.ts lines 47–75)
      - `SCREENSHOTS_DIR` = `path.resolve(__dirname, '../../../docs/screenshots')` per PATTERNS.md "Resolve PNG output paths"

    **Login helper function** — `async function loginAsAdmin(page: Page)`. Implementation: navigate to `${BASE_URL}/login`, fill the email + password inputs (verify input selectors from apps/web/src/routes/login/LoginPage.tsx / LoginForm.tsx during execution), click the submit button, wait for navigation to a post-login route. Form field selectors must be confirmed against the actual LoginForm component at execution time.

    **Failure-array discipline** — declare `const failures: string[] = []` at the top of `main()`. Each assertion that fails pushes a string into `failures` (DOES NOT throw). After all 24 cells are iterated, if `failures.length > 0`: print all failures to stderr + `process.exit(1)`. Else `process.exit(0)`. This matches PATTERNS.md "Assertion + exit-code discipline pattern".

    **Per-cell loop** — for each `viewport` × `route` cell:
      1. `await page.setViewportSize(viewport)`.
      2. If `route.anonymous === false` and not already logged in for this browser context: call `loginAsAdmin(page)`.
      3. `await page.goto(BASE_URL + route.path)`.
      4. `await page.waitForLoadState('networkidle')` (or a route-specific wait — first-page network settle).
      5. Assert `scrollWidth ≤ innerWidth` via `page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)`. If overflow: push to `failures` with viewport + route diagnostic.
      6. Assert `[data-test="primary-nav"]` is present + visible (per PATTERNS.md "Primary-nav reachability assertion target" code block — use `page.$('[data-test="primary-nav"]')` then `isVisible()`). On `/login` (anonymous), the nav is NOT rendered (no AppShell on /login) — SKIP the nav assertion for the `/login` route specifically. Add a one-line comment explaining the carve-out.
      7. If `viewport.width === 360`: `await mkdir(SCREENSHOTS_DIR, { recursive: true })`, then `await page.screenshot({ path: path.join(SCREENSHOTS_DIR, \`sc04-360-${route.slug}.png\`), fullPage: true })`.
      8. Log progress to stdout: `console.log(\`✓ \${viewport.width}x\${viewport.height} \${route.path}\`)`.

    **Browser lifecycle** — `const browser = await chromium.launch({ headless: true })`. Use `await browser.newContext()` so each route iteration can re-use the same context (the login session persists across navigations). Use `await context.newPage()` once per cell or once per browser context — executor decides which is more reliable; the simpler shape is one page per cell so stale-state from a previous route doesn't leak. Always `await browser.close()` in a `finally` block.

    **No external test runner** — this is a standalone `tsx`-invoked Node script, NOT a Vitest test. PATTERNS.md "tsx-as-CLI invocation pattern" — `tsx` is already in apps/api devDeps and (after Task 1) in apps/web devDeps. Pure ESM. `import.meta.url` + `fileURLToPath` for resolving `__dirname`.

    Do NOT add the script to any `pnpm` test invocation. It is intentionally NOT chained into `pnpm verify` per D-129. It is run manually with `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts`.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. File exists:
      test -f apps/web/scripts/captureSc04Screenshots.ts
      # 2. Doc-comment header references Phase 7 D-127:
      grep -F "D-127" apps/web/scripts/captureSc04Screenshots.ts
      # 3. All 4 viewports referenced:
      for w in 360 768 1024 1440; do grep -F "$w" apps/web/scripts/captureSc04Screenshots.ts >/dev/null || (echo "missing viewport $w"; exit 1); done
      # 4. All 6 route slugs referenced via the literal `slug: '<value>'` property-assignment shape.
      #    The `slug: '` prefix anchors on the ROUTES-array context, not on incidental occurrences of the slug elsewhere.
      for s in login lakemedel bestallningsskapande bestallningshistorik audit dashboard; do
        grep -F "slug: '$s'" apps/web/scripts/captureSc04Screenshots.ts >/dev/null || (echo "missing slug: '$s' in ROUTES array"; exit 1)
      done
      # 5. Selector target and demo creds:
      grep -F 'data-test="primary-nav"' apps/web/scripts/captureSc04Screenshots.ts
      grep -F "admin@example.test" apps/web/scripts/captureSc04Screenshots.ts
      # 6. Exit-code discipline present:
      grep -F "process.exit" apps/web/scripts/captureSc04Screenshots.ts
      # 7. tsx-as-CLI shape:
      grep -F "import.meta.url" apps/web/scripts/captureSc04Screenshots.ts
      # 8. Playwright API in use:
      grep -F "from '@playwright/test'" apps/web/scripts/captureSc04Screenshots.ts
      # 9. apps/web typecheck still passes including the new file:
      pnpm --filter @meditrack/web typecheck
    </automated>
  </verify>
  <done>
    `apps/web/scripts/captureSc04Screenshots.ts` exists with the documented anatomy; references all 4 viewports + 6 slugs (via `slug: '<value>'` property assignment) + `data-test="primary-nav"` selector + `admin@example.test` credentials + `process.exit` discipline; typecheck still passes.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Run the Playwright script against a live stack and commit the 6 PNGs</name>
  <files>docs/screenshots/sc04-360-login.png, docs/screenshots/sc04-360-katalog.png, docs/screenshots/sc04-360-bestallningsskapande.png, docs/screenshots/sc04-360-bestallningshistorik.png, docs/screenshots/sc04-360-audit.png, docs/screenshots/sc04-360-dashboard.png</files>
  <what-built>
    Tasks 1 + 2 added the `data-test="primary-nav"` attribute to both nav files, installed Playwright + tsx as apps/web devDeps, and wrote the SC#4 verification script. Task 3 is the human-gated run of the script against a live `docker compose up` stack.
  </what-built>
  <how-to-verify>
    1. From a fresh terminal at repo root: `docker compose down -v && docker compose up --build` (rebuild from scratch — confirms the seed lands fresh).
    2. Wait until all three services are healthy (postgres healthcheck green; api and web ready). This typically takes 1–2 minutes on a warm cache.
    3. Open `http://localhost:5173` in a browser; verify `admin@example.test` / `demo1234` logs in successfully and lands on the dashboard with the low-stock banner rendering. (This pre-check confirms the script's login flow will succeed.)
    4. In a second terminal, run: `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts`
    5. Expected console output: 24 progress lines (one per cell), zero failure lines, exit 0.
    6. List the screenshot directory: `ls -la docs/screenshots/`. Expected: 6 PNG files matching `sc04-360-<slug>.png` for the 6 slugs.
    7. Total PNG size: `du -sh docs/screenshots/` — expected < 1 MB total per "Claude's Discretion" rule. If > 1 MB: run `pngquant --quality=70-90 docs/screenshots/*.png --ext .png --force` once and re-measure.
    8. Visually open each PNG and confirm:
       - `sc04-360-login.png` shows the login form (not a loading spinner, not a 404).
       - `sc04-360-katalog.png` shows the medication catalog list/cards at 360 px width.
       - `sc04-360-bestallningsskapande.png` shows the new-order compose page.
       - `sc04-360-bestallningshistorik.png` shows the orders history list with status tabs.
       - `sc04-360-audit.png` shows the admin audit table or cards.
       - `sc04-360-dashboard.png` shows the dashboard with the low-stock banner.
    9. If any PNG shows a loading state, animation glitch, or missing-asset rendering: re-run the script after a wait, or document the artifact in `## Kända luckor` (Slice 1's section) if it's a known intermittent.
    10. If the script exits non-zero: read stderr diagnostics, fix the underlying issue (likely either a missing `data-test` attribute, a route that returns 4xx, or a viewport-specific overflow), re-run.
  </how-to-verify>
  <acceptance_criteria>
    - 6 PNG files exist at `docs/screenshots/sc04-360-<slug>.png` for the 6 slugs.
    - Total directory size of `docs/screenshots/` is ≤ 1 MB.
    - The script ran to completion with exit 0.
    - Each PNG visually shows the intended page state (not a spinner / not a 404 / not a partial render).
    - The PNGs are staged for commit (git status shows them as new files).
  </acceptance_criteria>
  <resume-signal>Type "approved" once all 6 PNGs are committed and the script exited 0, or describe the failure mode and the corrective action taken.</resume-signal>
</task>

<task type="auto">
  <name>Task 4: Populate README `## Mobil-först verifiering` section with thumbnails + 6×4 table</name>
  <files>README.md</files>
  <read_first>
    - README.md (current state after Slice 1 + the placeholder `<!-- Populated by Slice 4 -->` under `## Mobil-först verifiering`)
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (D-126 — hybrid deliverable spec; `<specifics>` "Verification table (Mobil-först verifiering — 6×4)" — table is pre-drafted with footnotes; D-127 — script invocation command)
    - .planning/phases/07-ops-submission-polish/07-PATTERNS.md (Pattern C — Swedish prose conventions; `docs/screenshots/sc04-360-*.png` row — naming conventions)
    - docs/screenshots/ (verify 6 PNGs exist with the expected slugs from Task 3)
  </read_first>
  <action>
    Replace the `<!-- Populated by Slice 4 -->` placeholder line under `## Mobil-först verifiering` in README.md with full content. Sub-structure:

    **(1) Opening Swedish paragraph** — 2–3 sentences framing: 360 px screenshots are the brief's most-prescribed breakpoint ("mobil-först"), the full 4-breakpoint matrix is in the table below, the script that captures + verifies is `apps/web/scripts/captureSc04Screenshots.ts`.

    **(2) 6 inlined thumbnails** — markdown image tags per D-126:
      ```
      <img src="docs/screenshots/sc04-360-login.png" alt="Login vid 360 px" width="240">
      <img src="docs/screenshots/sc04-360-katalog.png" alt="Katalog vid 360 px" width="240">
      <img src="docs/screenshots/sc04-360-bestallningsskapande.png" alt="Beställningsskapande vid 360 px" width="240">
      <img src="docs/screenshots/sc04-360-bestallningshistorik.png" alt="Beställningshistorik vid 360 px" width="240">
      <img src="docs/screenshots/sc04-360-audit.png" alt="Audit vid 360 px" width="240">
      <img src="docs/screenshots/sc04-360-dashboard.png" alt="Dashboard vid 360 px" width="240">
      ```
      (HTML `<img>` tags rather than markdown `![]()` because GitHub markdown ignores width on bare image syntax.)

    **(3) 6×4 verification table** — copy verbatim from `07-CONTEXT.md <specifics>` "Verification table (Mobil-först verifiering — 6×4)". Table header: `| Skärm | 360 px | 768 px | 1024 px | 1440 px |`. 6 rows: Login / Katalog (/lakemedel) / Beställningsskapande (/bestallningar/ny) / Beställningshistorik (/bestallningar) / Audit (/admin/audit) / Dashboard (/dashboard). Cells: `✓` or `✓¹` etc. Below the table: the 4 footnotes pre-drafted in `<specifics>` (¹ Filterlist scrollar horisontellt … etc.). Executor MAY adjust footnotes if Task 3's visual verification surfaced different observations — keep them accurate.

    **(4) Legend** — below the table, two lines:
      - Capture date: today's date in `YYYY-MM-DD` format.
      - Command: `Kör om suiten: \`pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts\` (kräver \`docker compose up\` igång).`
      - First-time setup pointer: `Förstegångsinstallation av Chromium: \`pnpm --filter @meditrack/web exec playwright install chromium\``.

    Apply Pattern C throughout — Swedish prose; file paths + commands in code-fences; UI strings irrelevant here; technical names (`Playwright`, `Chromium`) raw in code-fences.

    Do NOT touch any other section. The edit is one self-contained section replacement.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. Section placeholder removed:
      ! grep -F "<!-- Populated by Slice 4 -->" README.md
      # 2. Section heading present:
      grep -F "## Mobil-först verifiering" README.md
      # 3. All 6 PNG thumbnails referenced:
      for s in login katalog bestallningsskapande bestallningshistorik audit dashboard; do grep -F "docs/screenshots/sc04-360-$s.png" README.md >/dev/null || (echo "missing PNG ref: $s"; exit 1); done
      # 4. Width attribute on thumbnails (240 px):
      grep -F 'width="240"' README.md
      # 5. 6×4 table header present:
      grep -F "| Skärm | 360 px | 768 px | 1024 px | 1440 px |" README.md
      # 6. All 6 row labels in the table:
      for row in "Login" "Katalog" "Beställningsskapande" "Beställningshistorik" "Audit" "Dashboard"; do
        awk '/^## Mobil-först verifiering$/,/^## /' README.md | grep -F "$row" >/dev/null || (echo "missing row: $row"; exit 1)
      done
      # 7. Re-run command documented:
      grep -F "pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts" README.md
      grep -F "playwright install chromium" README.md
    </automated>
  </verify>
  <done>
    README `## Mobil-först verifiering` populated with 6 inline thumbnails + 6×4 verification table with footnotes + capture-date + re-run command + first-time setup pointer. Placeholder gone. All grep assertions pass.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Playwright script → local web stack | Script executes against `http://localhost:5173` (api + web running locally via Docker Compose). Reads admin credentials (`admin@example.test` / `demo1234`) from the seeded demo password — same surface as the existing dev workflow. |
| Browser binaries → developer's machine | `playwright install chromium` downloads ~150 MB of binaries to the developer's `~/.cache/ms-playwright/`. NOT committed. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-09 | Tampering | Playwright script + dev deps | accept | New devDeps (`@playwright/test`, `tsx`) are widely used, popular, audited packages. No production runtime impact (`apps/web/scripts/` not bundled into the web build). |
| T-07-10 | Information Disclosure | Admin credentials in script | accept | Credentials are the seeded demo password documented openly in `## Demo-konton`. Not real prod credentials. Script reads them as constants; no env-var lookup needed. |
| T-07-11 | Information Disclosure | Screenshot PNGs in repo | accept | PNGs show seeded demo data only (the same data any reviewer cloning the repo would see when running `docker compose up`). No PII; no real-world patient/medication data. |
| T-07-12 | Denial of Service | Playwright script walltime | accept | Walltime ~30–60 sec for 24-cell iteration. Run manually + once per release; not chained into CI. |
| T-07-13 | All other ASVS L1 categories | N/A | out-of-scope | The script is a verification harness against localhost only. No production endpoints touched, no real user data, no auth code paths added — only the existing demo login flow is exercised. |
</threat_model>

<verification>
- `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts` exits 0 when run against a healthy `docker compose up` stack (Task 3 acceptance).
- Re-running the script regenerates the same 6 PNGs (deterministic for the same seed).
- The 6 PNGs render inline as 240 px thumbnails in the README when viewed on GitHub.
- The 6×4 verification table covers all 24 SC#4 cells (4 viewports × 6 routes).
- `data-test="primary-nav"` is grep-findable on both nav files; removing it from either breaks the script at one viewport class.
</verification>

<success_criteria>
- 11 files modified: 2 nav files, 1 new Playwright script, 1 apps/web/package.json, 6 new PNGs in docs/screenshots/, 1 README.md.
- Script exits 0 against the live stack (Task 3).
- All grep-able assertions in `<verify>` blocks pass.
- Commit chain follows Pattern B: `chore(07-04): ...` for nav-attribute + devDeps; `feat(07-04): add SC#4 Playwright verification harness` for the script; `chore(07-04): capture 6×360 px screenshots for SC#4` for the PNGs; `docs(07-04): populate Mobil-först verifiering section` for the README.
</success_criteria>

<output>
Create `.planning/phases/07-ops-submission-polish/07-04-SUMMARY.md` when done, listing: the Playwright + tsx versions installed, both file paths where `data-test` was added, the script exit-code observed during Task 3, total PNG size, any pngquant compression applied, any footnotes adjusted from the pre-drafted table.
</output>
