---
phase: 07-ops-submission-polish
verified: 2026-05-24T00:00:00Z
status: gaps_found
score: 11/12 must-haves verified
overrides_applied: 0
gaps:
  - truth: "README.md is factually accurate in all stack version claims"
    status: failed
    reason: "README.md line 47 in the Arkitekturval matrix states 'Tailwind CSS 4' but apps/web/package.json:51 installs tailwindcss ^3.4.7 (Tailwind v3). Factual mismatch that an interviewer reading both files will immediately catch — directly undermines the OPS-02 deliverable of an accurate stack rationale."
    artifacts:
      - path: "README.md"
        issue: "Line 47: '| **UI-kit** — shadcn/ui + Tailwind CSS 4 |' — wrong major version"
      - path: "apps/web/package.json"
        issue: "Line 51: '\"tailwindcss\": \"^3.4.7\"' — actual installed version is v3"
    missing:
      - "Change README.md Arkitekturval matrix row for UI-kit from 'Tailwind CSS 4' to 'Tailwind CSS 3'"
human_verification:
  - test: "Walk demo-rundtur step 7 (AI-förslag) end-to-end on a live stack"
    expected: "Clicking 'Hämta AI-förslag' returns a structured recommendation with confidence band; saving persists therapeuticClass"
    why_human: "Requires ANTHROPIC_API_KEY set in the running environment; cannot verify AI integration programmatically without a live stack"
  - test: "Confirm SC#4 harness login-route cells at viewports 768/1024/1440 are not silently measuring /dashboard"
    expected: "Either (a) the 3 login-at-non-360 cells are explicitly skipped with a log line, or (b) the user is logged out before each login-route visit, or (c) the redirect is detected and the cell skipped programmatically (per WR-01 in 07-REVIEW.md)"
    why_human: "WR-01: the loggedIn flag means authenticated users are redirected from /login to /dashboard on viewports after the first; the script reports success for cells it did not actually measure. Fix requires code change + re-run against live stack."
  - test: "Verify 07-06 OPS-01 seed counts (medications and in-flight orders) with actual values"
    expected: ">= 10 seeded medications visible at /lakemedel; >= 1 order in pre-Levererad status at /bestallningar"
    why_human: "07-06-SUMMARY.md records a blanket user approval without supplying the specific medication count or order ID — the acceptance criteria required those values. Cannot verify count without running docker compose up."
---

# Phase 7: Ops & Submission Polish — Verification Report

**Phase Goal:** Submission polish — restructure README to brief-aligned Swedish canonical layout; populate `## Arkitekturval`, `## Mobil-först verifiering`, `## Demo-rundtur`, `## §6-svar`; wire `pnpm verify` for one-command repo health; capture SC#4 mobile-first screenshots via Playwright harness; close with live demo-path human gate.
**Verified:** 2026-05-24T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | README.md has canonical brief-aligned Swedish section ordering (12 top-level headings in D-121 order) | VERIFIED | `grep -E "^## "` confirms all 14 headings present in correct order: Vad är det här? → Arkitekturval → Snabbstart → Demo-konton → Demo-rundtur → Lokal utveckling → Tester → Mobil-först verifiering → Kända luckor → Med mer tid → §6-svar → Vad ligger var? → Feature deep dives. Stale `## Status` absent. |
| 2 | `## Arkitekturval` contains 9-row matrix + 3 prose paragraphs + `### Vad vi medvetet avstått från` with 6-7 bullets | VERIFIED | Matrix rows Frontend/Backend/Database/ORM/Server-state/UI-kit/Tester/Monorepo/Container confirmed at README lines 40-50. Three `###` subsections at lines 52, 72, 92. `### Vad vi medvetet avstått från` with 7 bullets at lines 115-123. |
| 3 | README.md is factually accurate in all stack version claims | FAILED | README.md line 47 states "shadcn/ui + Tailwind CSS 4" in the Arkitekturval matrix. `apps/web/package.json:51` installs `"tailwindcss": "^3.4.7"` (Tailwind v3). This factual mismatch is CR-01 in 07-REVIEW.md. |
| 4 | `pnpm verify` wired as `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` at repo root | VERIFIED | `package.json:14`: `"verify": "pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build"` — exact chain confirmed. `apps/api/package.json:10`: `"typecheck": "tsc --noEmit -p ."` added. |
| 5 | `apps/web/scripts/captureSc04Screenshots.ts` Playwright harness exits 0 on a live stack | VERIFIED | Script exists at correct path (168 lines), references all 4 viewports (360/768/1024/1440), all 6 slugs via `slug: '<value>'` shape, `data-test="primary-nav"` selector, `admin@example.test` credentials, `process.exit` discipline, `import.meta.url`. Script was human-gated and approved in plan 07-04 Task 3. |
| 6 | Six 360px PNGs exist at `docs/screenshots/sc04-360-<slug>.png` for 6 routes | VERIFIED | Six files confirmed: `sc04-360-login.png`, `sc04-360-lakemedel.png`, `sc04-360-bestallningsskapande.png`, `sc04-360-bestallningshistorik.png`, `sc04-360-audit.png`, `sc04-360-dashboard.png`. Total 656K (< 1MB). |
| 7 | `data-test="primary-nav"` present on BOTH Sidebar.tsx AND BottomTabBar.tsx | VERIFIED | `Sidebar.tsx:28`: `<nav className="flex flex-col" aria-label="Primary" data-test="primary-nav">`. `BottomTabBar.tsx:27`: `data-test="primary-nav"` on its own line in multi-line `<nav>` element. |
| 8 | README `## Mobil-först verifiering` populated with 6 inline thumbnails + 6x4 table | VERIFIED | All 6 `<img src="docs/screenshots/sc04-360-*.png" ... width="240">` tags present at lines 275-280. 6x4 table at lines 282-289 with header `| Skärm | 360 px | 768 px | 1024 px | 1440 px |`. Capture date, re-run command, Chromium setup pointer all present. |
| 9 | `## Demo-rundtur (5 minuter)` populated with 8+ numbered Swedish steps covering all 3 demo roles | VERIFIED | 8 numbered steps at README lines 185-200. All 3 demo users (`sjukskoterska@example.test`, `apotekare@example.test`, `admin@example.test`) present. Status machine `Utkast → Skickad → Bekräftad → Levererad` in-line. 16 distinct REQ-IDs cited per 07-05-SUMMARY.md. |
| 10 | `## §6-svar (intervjudiskussion)` populated with all 7 Swedish `###` subsections (each ≤4 sentences, 6/7 end with `[Läs mer]` deep-links) | VERIFIED | All 7 headings confirmed at README lines 347-385. Each answer is 2-4 sentences. `[Läs mer]` links at answers 1-5 and 7. Required citations grep-verified: `orders.deliver.integration.test.ts`, `0010_audit_events_named_app_role`, `0008_audit_events_revoke_grants`, `queryRaw`, `claude-haiku-4-5`, `OpenTelemetry`. |
| 11 | `## Kända luckor` has 5 specific honest bullets and `## Med mer tid` has 5 themed buckets | VERIFIED | 5 bullets at README lines 302-306. 5 themed buckets (`### Audit & efterlevnad`, `### AI & klassificering`, `### Drift & skalning`, `### UX-polish`, `### Säkerhet`) at lines 310-341. |
| 12 | Demo-path human gate passed (OPS-01 deliverables confirmed + `pnpm verify` exits 0 + SC#4 harness exits 0) | VERIFIED | 07-06-SUMMARY.md records user blanket approval of both gates ("both approved") per plan 07-06. Phase-closing commit `chore(phase-07): demo-path verified by user on fresh docker compose up` (commit 9f054ae) is in git log. |

**Score:** 11/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `README.md` | Brief-aligned Swedish canonical layout with all sections | PARTIAL | All 12 canonical headings present; all sections substantively populated; one factual error (CR-01: Tailwind CSS 4 vs 3) in Arkitekturval matrix row 6 |
| `package.json` | `scripts.verify` and `scripts.typecheck` | VERIFIED | Line 14: `"verify": "pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build"`, Line 13: `"typecheck": "pnpm -r typecheck"` |
| `apps/api/package.json` | `scripts.typecheck` | VERIFIED | Line 10: `"typecheck": "tsc --noEmit -p ."` |
| `apps/web/scripts/captureSc04Screenshots.ts` | Playwright SC#4 harness | VERIFIED | 168-line file with all required elements (D-127 header, 4 viewports, 6 slugs, selector, exit-code discipline) |
| `apps/web/src/routes/shell/Sidebar.tsx` | `data-test="primary-nav"` on nav element | VERIFIED | Attribute present at line 28 |
| `apps/web/src/routes/shell/BottomTabBar.tsx` | `data-test="primary-nav"` on nav element | VERIFIED | Attribute present at line 27 |
| `docs/screenshots/sc04-360-*.png` | 6 PNG files (360px screenshots) | VERIFIED | All 6 slugs present, 656K total |
| `.planning/phases/07-ops-submission-polish/07-06-SUMMARY.md` | Demo-path verification record | VERIFIED | File exists with all 7 required sections (OPS-01 checklist, SC#1-SC#4, slice roll-up) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `package.json scripts.verify` | per-workspace lint/typecheck/test/build | `&&` chain | VERIFIED | Exact chain: `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` |
| `apps/web/scripts/captureSc04Screenshots.ts` | `[data-test="primary-nav"]` selector | `page.$$` | VERIFIED | Selector used at line 122; `page.$$` enumeration with `some(isVisible())` OR-reduce |
| `README.md ## Mobil-först verifiering` | `docs/screenshots/sc04-360-*.png` | `<img>` tags with `width="240"` | VERIFIED | All 6 PNG references confirmed with correct paths and width attribute |
| `README.md §6-svar answers 1-5,7` | `## Feature deep dives` subsections | `[Läs mer]` markdown anchor links | VERIFIED | Links present at answers 1-5 and 7; anchor targets (`#hur-audit-hooken-fungerar`, `#vad-granskas`, `#lager-2--db-rollbehörigheter--before-trigger`, `#6-supporting-bullets`) match existing `####` headings in Feature deep dives |
| `Sidebar.tsx data-test="primary-nav"` | SC#4 harness selector | `page.$$` | VERIFIED | Attribute at line 28; renders at >=768px viewport |
| `BottomTabBar.tsx data-test="primary-nav"` | SC#4 harness selector | `page.$$` | VERIFIED | Attribute at line 27; renders at <768px viewport (md:hidden) |

### Data-Flow Trace (Level 4)

Not applicable to this phase — all deliverables are documentation artifacts (README.md), tooling scripts (package.json, Playwright harness), and committed binary assets (PNG screenshots). No dynamic data rendering components were introduced.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Root `package.json` has `scripts.verify` with correct chain | `node -e "const j=require('./package.json'); console.log(j.scripts.verify)"` | `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` | PASS |
| `apps/api/package.json` has `scripts.typecheck` | File read confirmed | `"typecheck": "tsc --noEmit -p ."` at line 10 | PASS |
| Playwright script has all 4 viewports + 6 slugs | File read confirmed | 360/768/1024/1440 × login/lakemedel/bestallningsskapande/bestallningshistorik/audit/dashboard | PASS |
| 6 PNG files exist at correct paths | Glob confirmed | All 6 files present | PASS |
| README `## Status` section absent | Grep confirmed | No match for `^## Status` in README.md | PASS |
| README `pnpm verify` documentation present | Grep confirmed | `## Tester` section has `pnpm verify` + full chain + walltime + SC#4 cross-reference | PASS |

### Probe Execution

Step 7c: SKIPPED — the SC#4 Playwright harness and `pnpm verify` require a live `docker compose up` stack. Human-gated execution was completed and approved in plan 07-06 Task 1. Running either against a cold machine without Docker would produce false failures, not evidence.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|---------------|-------------|--------|----------|
| OPS-01 | 07-06 | `docker compose up` starts postgres+api+web with seed data (users, vårdenhet, medications, in-flight order) | VERIFIED (human-gated) | User approved in 07-06-SUMMARY.md; blanket approval with no specific counts documented |
| OPS-02 | 07-01, 07-02, 07-04, 07-05 | README includes purpose, stack rationale, run instructions, known gaps, "with more time", §6 answers | PARTIAL | All sections present and substantively populated. One factual error (CR-01) in the stack rationale table undermines the deliverable quality. |
| OPS-04 | 07-01 through 07-06 | Git history follows conventional-commits; every commit atomic, well-messaged, narrative | VERIFIED | Git log shows `docs(07-01)` through `chore(phase-07)` scope; closing commit `chore(phase-07): demo-path verified by user on fresh docker compose up` (9f054ae) is most-recent commit before the review commit. User approved narrative in 07-06 Task 2. |

**Orphaned requirements check:** REQUIREMENTS.md maps OPS-01, OPS-02, OPS-04 to Phase 7 — all claimed in plans. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `README.md` | 47 | `Tailwind CSS 4` in matrix — factually wrong (actual: v3) | BLOCKER | Interviewer reading README alongside package.json sees an immediate discrepancy in the core stack rationale deliverable (OPS-02) |
| `README.md` | 79 | `AuditEvent` listed as one of six audited models — should be `User` | WARNING | Internal inconsistency: Arkitekturval prose says `Session, AuditEvent`; `## Hur audit-hooken fungerar` and `## Vad granskas?` correctly list `User, Session`. Auditing the audit table itself is circular. |
| `apps/web/package.json` | 8 | `"build": "tsc --noEmit && vite build"` — redundant typecheck inside build script | WARNING | `pnpm verify` runs `pnpm -r typecheck` before `pnpm -r build`; the `tsc --noEmit` inside `apps/web build` is a second, redundant check adding ~5-10s. Not a correctness bug but creates ambiguous type-error ownership. |
| `apps/web/scripts/captureSc04Screenshots.ts` | 88-112 | `loggedIn` flag not reset for anonymous routes at later viewports — authenticated redirect to /dashboard is silently measured instead of /login at viewports 768/1024/1440 | WARNING | 3 of 24 cells (login at non-360 viewports) measure /dashboard instead of /login. Script exits 0 but success banner "all 24 cells OK" is misleading for those 3 cells. |
| `apps/web/scripts/captureSc04Screenshots.ts` | 122 | `page.$$()` is legacy Playwright ElementHandle API; locator-based query preferred | INFO | Soft-deprecated; works correctly today but will produce deprecation notices in future Playwright versions. |

**Debt marker gate:** No `TBD`, `FIXME`, or `XXX` markers found in phase-modified files.

### Human Verification Required

#### 1. AI-förslag flow verification

**Test:** On a live stack with `ANTHROPIC_API_KEY` set, walk Demo-rundtur step 7: navigate to `/lakemedel`, create a new medication, click `Hämta AI-förslag`, observe structured recommendation with confidence band (`Hög säkerhet` / `Medel säkerhet` / `Låg säkerhet`), accept or override in `Slutgiltig klass` dropdown, save.
**Expected:** AI suggestion returned; `therapeuticClass` persists to the medication record; override-by-enum-bucket works.
**Why human:** Requires a live Anthropic API key in the Docker Compose environment. Cannot be verified programmatically without a running stack and valid key.

#### 2. SC#4 harness WR-01 login-route cells

**Test:** Re-run `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts` against a fresh stack. Inspect the console output for the three cells `768x1024 /login`, `1024x768 /login`, `1440x900 /login`. Confirm whether the actual URL being measured is `/login` or `/dashboard`.
**Expected:** Either (a) cells correctly measure the login page (authenticated redirect handled), or (b) cells are explicitly skipped with a diagnostic log line explaining the redirect, or (c) WR-01 is accepted as a known limitation and documented in `## Kända luckor`.
**Why human:** WR-01 in 07-REVIEW.md identifies a false-negative pattern where the `loggedIn` flag causes authenticated users to be redirected from `/login` to `/dashboard`, but the overflow check proceeds against the dashboard. Confirming whether this is a real issue requires running the script against a live stack and reading per-cell output.

#### 3. OPS-01 seed count confirmation

**Test:** On a fresh `docker compose down -v && docker compose up --build`, navigate to `/lakemedel` and count seeded medications; navigate to `/bestallningar` and confirm at least one order in pre-`Levererad` status. Record the exact count and order ID.
**Expected:** >= 10 medications visible; >= 1 order with status Utkast, Skickad, or Bekräftad.
**Why human:** 07-06-SUMMARY.md records a blanket user approval without the specific medication count or order ID required by the acceptance criteria. The values are not in any artifact.

### Gaps Summary

One BLOCKER prevents the phase from being marked `passed`:

**CR-01 (BLOCKER) — README Tailwind version mismatch:** The `## Arkitekturval` matrix row for UI-kit claims "shadcn/ui + Tailwind CSS 4" (README.md:47) but the actual installed version in `apps/web/package.json:51` is `tailwindcss: ^3.4.7` (Tailwind v3). This is the one-line fix: change `Tailwind CSS 4` to `Tailwind CSS 3` in the matrix table cell.

This is a factual accuracy failure in the primary phase deliverable (OPS-02: accurate stack rationale). A reviewer reading both files — which is explicitly the evaluation scenario — immediately sees the contradiction. Tailwind v3 and v4 have entirely different configuration models (v4 removed `tailwind.config.js`; the presence of `autoprefixer` and `postcss` in devDependencies confirms v3). The error was introduced in plan 07-02 where the matrix was populated verbatim from `07-CONTEXT.md <specifics>` — the locked matrix content in CONTEXT.md contained the wrong version.

**Three WARNINGs from the code review** (WR-01, WR-02, WR-03) are carry-forward items addressable in a gap-closure phase:
- WR-01: SC#4 harness silent false-negative on 3 login-route cells at non-360 viewports
- WR-02: Arkitekturval section lists `AuditEvent` instead of `User` in the six audited models
- WR-03: Redundant `tsc --noEmit` in `apps/web` build script inside `pnpm verify`

All three are one-line fixes requiring a `docs(07-fix)` / `chore(07-fix)` / `fix(07-fix)` commit each.

---

_Verified: 2026-05-24T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
