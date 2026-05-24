---
phase: 07
slug: ops-submission-polish
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-24
---

# Phase 07 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
>
> Phase 07 ("ops-submission-polish") is a submission-readiness phase. The work is dominated by documentation (README restructure, arkitekturval, demo-rundtur, §6 answers, factual fixes), local-developer tooling (`pnpm verify`, Playwright SC#4 harness, redundant typecheck removal), and one small SQL-sort fix in the dashboard service. There is no new authenticated surface, no new external endpoint, and no new dependency that reaches production runtime. The register was authored at plan time across all 10 slices; this document consolidates and verifies it.

---

## Trust Boundaries

Consolidated from the 10 plan-time `<threat_model>` blocks. Each row identifies a boundary at which untrusted-side data could enter trusted code.

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| README.md → reviewer | Static rendered markdown viewed on GitHub or in a local editor. No code execution, no input handling. | Public-facing doc text only (slices 01, 02, 05, 07). |
| package.json scripts → developer's shell | Local toolchain invocations (`lint`, `typecheck`, `test`, `build`, `verify`). No remote endpoints. | None (local stdout / exit codes). |
| Playwright script → local web stack | `captureSc04Screenshots.ts` runs against `http://localhost:5173` with the developer's privileges, using the seeded demo password. | Seeded demo credentials + screenshots of seeded demo data. |
| Browser binaries → developer's machine | `playwright install chromium` downloads ~150 MB to `~/.cache/ms-playwright/`. NOT committed. | Vendor binary, audited via npm metadata. |
| dashboard.service → Postgres | Parameterised `$queryRaw`; slice 10 replaces a column reference with `LOWER(column)`. No new user input enters the query. | `careUnitId` scope key, unchanged. |
| Live demo walk → developer's machine | `docker compose up` brings up api + web at `localhost:3000` / `localhost:5173`. Same surface as existing dev workflow. | Seeded demo data only. |

---

## Threat Register

All 28 threat entries are derived from the per-slice `<threat_model>` registers in `07-01..07-10-*-PLAN.md`. Threat-ID collisions across slices are resolved by including the **Source Plan** column. All entries closed.

| Threat ID | Source Plan | Category | Component | Disposition | Mitigation / Rationale | Status |
|-----------|-------------|----------|-----------|-------------|------------------------|--------|
| T-07-01 | 07-01 | Information Disclosure | README content | accept | README is public-facing since Phase 1; demo password `demo1234` already documented in `## Demo-konton`. No new secrets. | closed |
| T-07-02 | 07-01 | Tampering | README content | accept | Edits tracked via git; commit chain is the audit trail per project convention "vi läser dina commits". | closed |
| T-07-03 | 07-01 | All other ASVS L1 | N/A | out-of-scope | Documentation-only edit — no inputs, no auth code, no DB access, no new attack surface. | closed |
| T-07-04 | 07-02 | Information Disclosure | README content | accept | Cited file paths, test names, and migration names already public in the repo. No internal-only details added. | closed |
| T-07-05 | 07-02 | All other ASVS L1 | N/A | out-of-scope | Documentation-only edit; no inputs, no auth, no DB. | closed |
| T-07-06 | 07-03 | Tampering | `pnpm verify` chain | accept | The chain composes existing audited scripts (`lint`, `typecheck`, `test`, `build`). No new install steps, no new dependencies. | closed |
| T-07-07 | 07-03 | Denial of Service | `pnpm verify` walltime | accept | ~5–6 min on first run; subsequent runs cached. Acceptable for one-shot verification. Not a production runtime concern. | closed |
| T-07-08 | 07-03 | All other ASVS L1 | N/A | out-of-scope | Tooling-only edit; no inputs, no auth, no DB. | closed |
| T-07-09 | 07-04 | Tampering | Playwright script + devDeps | accept | `@playwright/test` and `tsx` are widely used, audited packages. No production runtime impact (`apps/web/scripts/` not bundled). | closed |
| T-07-10 | 07-04 | Information Disclosure | Admin credentials in script | accept | Seeded demo password (`demo1234`) documented openly in `## Demo-konton`. Not real prod credentials. | closed |
| T-07-11 | 07-04 | Information Disclosure | Screenshot PNGs in repo | accept | PNGs show seeded demo data only — same data any reviewer cloning the repo would see. No PII; no real patient/medication data. | closed |
| T-07-12 | 07-04 | Denial of Service | Playwright script walltime | accept | ~30–60 s for 24-cell iteration. Run manually + once per release; not chained into CI. | closed |
| T-07-13 | 07-04 | All other ASVS L1 | N/A | out-of-scope | Verification harness against localhost only; no production endpoints, no real user data. | closed |
| T-07-14 | 07-05 | Information Disclosure | §6 supporting bullets | accept | All bullets cite files, tests, migrations, and decision IDs already public. The §6 "least proud" answer (Task 2 ans 5) honestly discloses the `$queryRaw` blind-spot — intentional engineering honesty per D-131. | closed |
| T-07-15 | 07-05 | Information Disclosure | Demo-rundtur instructions | accept | Demo-rundtur references demo credentials already documented in `## Demo-konton`. No real-world credentials disclosed. | closed |
| T-07-16 | 07-05 | All other ASVS L1 | N/A | out-of-scope | Documentation-only edit; no inputs, no auth, no DB. | closed |
| T-07-17 | 07-06 | All ASVS L1 | N/A | out-of-scope | No new code or doc edits in this slice — only human verification of slices 01–05. Threat surface assessed in each prior plan. | closed |
| T-07-09 | 07-07 | Information Disclosure | README factual claims | mitigate | Edits remove factually wrong claims (Tailwind v4, AuditEvent in audited-models) and replace with verified-correct strings (Tailwind v3 per `apps/web/package.json`; `User` per canonical Phase 5 list). Confirmed: commit `94939c8`; `grep -F "Tailwind CSS 3" README.md` returns 1 line, `grep -F "Tailwind CSS 4" README.md` returns 0 lines. | closed |
| T-07-10 | 07-07 | All other ASVS L1 | N/A | out-of-scope | Doc-only edit; no runtime impact, no attack surface, no dependencies added. | closed |
| T-07-11 | 07-08 | Repudiation | SC#4 verification harness | mitigate | Redirect-guard fix eliminates silent false-negative on `/login` at viewports 768/1024/1440. Confirmed: commit `f6ac835` (`fix(07-08): close WR-01 + IN-01`); harness now emits `(skipped: redirected from /login → /dashboard)` log lines. | closed |
| T-07-12 | 07-08 | Tampering | Playwright API surface | accept | Refactor moves from `page.$$()` (ElementHandle) to `page.locator()` (Locator). Both APIs are part of `@playwright/test`'s public surface. Semantics equivalent for OR-reduced `isVisible`. | closed |
| T-07-13 | 07-08 | All other ASVS L1 | N/A | out-of-scope | Local-dev tooling; no production exposure; no new dependencies. | closed |
| T-07-14 | 07-09 | Tampering | Build pipeline correctness | mitigate | Removal of redundant `tsc --noEmit` from `apps/web` `build` script is safe because the `pnpm verify` chain runs `pnpm -r typecheck` before `pnpm -r build` (D-129). Confirmed: chain ordering intact in root `package.json`; `apps/web/package.json` `scripts.build === "vite build"`. | closed |
| T-07-15 | 07-09 | Repudiation | Two-location invariant | mitigate | Single owner for `apps/web` typecheck is now `pnpm -r typecheck` invoking `scripts.typecheck`. No two-location ambiguity. Confirmed: commit `444e016`; `scripts.typecheck === "tsc --noEmit"`. | closed |
| T-07-16 | 07-09 | All other ASVS L1 | N/A | out-of-scope | Tooling-only edit; no inputs, no auth, no DB, no network. | closed |
| T-07-17 | 07-10 | Tampering | Sort determinism | mitigate | `LOWER(m."name")` is deterministic for any UTF-8 input Postgres accepts. Ties (same lowercased name) fall back to stable PK row order. Confirmed: commit `1e72484`; `grep -F 'LOWER(m."name") ASC' apps/api/src/services/dashboard.service.ts` returns 1 line; `dashboard.integration.test.ts` Test 1 (shape + sort) PASSES. | closed |
| T-07-18 | 07-10 | Information Disclosure | careUnitId tenant scope | accept | Unchanged — `WHERE` clause's `cum."careUnitId" = ${careUnitId}` still enforces T-06-01 / T-02-01 multi-tenant scoping. Sort-key change is orthogonal. | closed |
| T-07-19 | 07-10 | All other ASVS L1 | N/A | out-of-scope | Local sort-key change; no auth, no schema, no new attack surface. | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party) · out-of-scope (no surface introduced)*

---

## Accepted Risks Log

The following risks were explicitly accepted at plan time. They are documented here so they do not resurface in future audit runs.

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-07-01 | T-07-01 (07-01), T-07-04 (07-02), T-07-14/15 (07-05) | README content discloses only pre-existing public artifacts: file paths, test IDs, migration names, decision IDs, and the seeded demo password `demo1234` already documented in `## Demo-konton`. No real-world secrets, no PII. | gsd-planner (per slice plans) | 2026-05-24 |
| AR-07-02 | T-07-02 (07-01) | Tampering with README content is detected via git history; commit chain is the audit trail per project convention "vi läser dina commits". | gsd-planner | 2026-05-24 |
| AR-07-03 | T-07-06 (07-03) | `pnpm verify` chain composes only pre-existing, audited scripts. No new install steps, no new dependencies introduced. | gsd-planner | 2026-05-24 |
| AR-07-04 | T-07-07 (07-03), T-07-12 (07-04) | Local-tool walltime (5–6 min for `pnpm verify`; 30–60 s for Playwright harness) is acceptable for one-shot verification. Neither runs in CI; not a production DoS concern. | gsd-planner | 2026-05-24 |
| AR-07-05 | T-07-09 (07-04) | `@playwright/test` and `tsx` are widely used, audited devDependencies. They do not enter the production bundle (`apps/web/scripts/` is not bundled by Vite). | gsd-planner | 2026-05-24 |
| AR-07-06 | T-07-10 (07-04) | Admin credentials hard-coded in `captureSc04Screenshots.ts` are the seeded demo password (`demo1234`), already documented in `## Demo-konton`. Not real production credentials. | gsd-planner | 2026-05-24 |
| AR-07-07 | T-07-11 (07-04) | Screenshot PNGs in `docs/screenshots/` depict seeded demo data only — equivalent to what any reviewer running `docker compose up` would see. No PII, no real patient/medication records. | gsd-planner | 2026-05-24 |
| AR-07-08 | T-07-12 (07-08) | Migration from `page.$$()` to `page.locator()` swaps two equivalent public APIs in `@playwright/test`. Removes a future deprecation warning. | gsd-planner | 2026-05-24 |
| AR-07-09 | T-07-18 (07-10) | The `careUnitId` tenant-scope `WHERE` clause in `dashboard.service.ts` is unchanged by the SQL-sort fix. T-06-01 / T-02-01 multi-tenant scoping invariant preserved. | gsd-planner | 2026-05-24 |

*Accepted risks do not resurface in future audit runs.*

---

## Verified Mitigations

The 5 `mitigate`-disposition threats have implementation evidence recorded at audit time:

| Threat | Plan | Mitigation Commit | Evidence |
|--------|------|-------------------|----------|
| T-07-09 (Information Disclosure — README factual claims) | 07-07 | `94939c8` | `grep -F "Tailwind CSS 3" README.md` returns 1; `grep -F "Tailwind CSS 4" README.md` returns 0; `apps/web/package.json` `tailwindcss === "^3.4.7"`. |
| T-07-11 (Repudiation — SC#4 harness silent false-negative) | 07-08 | `f6ac835` | Redirect guard inserted between `waitForLoadState` and Assertion 1 in `apps/web/scripts/captureSc04Screenshots.ts`; harness emits `(skipped: redirected from /login → /dashboard)` log lines on viewports 768/1024/1440. |
| T-07-14 (Tampering — Build pipeline correctness) | 07-09 | `444e016` | Root `package.json` `scripts.verify` runs `pnpm -r typecheck` before `pnpm -r build`; `apps/web/package.json` `scripts.build === "vite build"` (redundant typecheck removed). |
| T-07-15 (Repudiation — two-location invariant) | 07-09 | `444e016` | Single owner: `apps/web/package.json` `scripts.typecheck === "tsc --noEmit"`; `build` no longer typechecks. |
| T-07-17 (Tampering — Sort determinism) | 07-10 | `1e72484` | `grep -F 'LOWER(m."name") ASC' apps/api/src/services/dashboard.service.ts` returns 1; `apps/api/test/dashboard.integration.test.ts` Test 1 (shape + sort) PASSES. |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-24 | 28 | 28 | 0 | /gsd:secure-phase 07 (short-circuit: register authored at plan time, all dispositions resolved) |

**Method:** `register_authored_at_plan_time: true` (10/10 plans contain `<threat_model>`). All 28 entries have a plan-time disposition (`mitigate` / `accept` / `out-of-scope`). The 5 `mitigate`-disposition threats have implementation evidence verified against the live code at the commits cited above. Per the workflow short-circuit rule, no separate retroactive-STRIDE pass was required.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / out-of-scope)
- [x] Accepted risks documented in Accepted Risks Log (AR-07-01 through AR-07-09)
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-24
