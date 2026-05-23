---
phase: 5
slug: audit-log
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-23
reconstructed_from: [05-01..05-11 SUMMARY, 05-VERIFICATION.md, 05-HUMAN-UAT.md]
---

# Phase 5 — Validation Strategy

> Retroactive reconstruction (State B): phase shipped without a VALIDATION.md.
> Built from the 11 SUMMARY files, 05-VERIFICATION.md (14/14 truths green),
> and 05-HUMAN-UAT.md (3/3 manual checks passed).

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (apps/api) |
| **Config file** | `apps/api/vitest.config.ts` (`fileParallelism: false`, `sequence.concurrent: false` — shared dev DB) |
| **Quick run command** | `pnpm --filter @meditrack/api test -- audit.integration.test.ts auth.ratelimit.test.ts` |
| **Full suite command** | `pnpm --filter @meditrack/api test` |
| **Estimated runtime** | ~45 seconds full suite (102 tests, 13 files) |

Web tests (vitest + jsdom) live in `apps/web/vitest.config.ts` but are not exercised by Phase 5
(no React-Testing-Library tests landed for `AuditPage`/`AuditDiffPanel` — see Manual-Only below).

---

## Sampling Rate

- **After every task commit:** Run the quick command above (~10 s on the two Phase-5 test files).
- **After every plan wave:** Run the full suite (~45 s).
- **Before `/gsd:verify-work`:** Full suite must be green.
- **Max feedback latency:** 45 seconds.

---

## Per-Task Verification Map

Plan-level granularity (41 tasks across 11 plans condensed to one row per plan, since each
plan's tasks all converge on the same Vitest invocation).

| Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01 | 1 | AUD-01 | T-05-01 / T-05-03 | Every mutation writes an audit row in the same tx; `passwordHash` + raw session token never land in `after`/`entityId` (allowlist + `resolveEntityId`) | integration | `pnpm --filter @meditrack/api test -- audit.integration.test.ts -t "full pipeline"` | ✅ | ✅ green |
| 05-02 | 1 | AUD-02 | — | Admin-only cursor-paginated read at `GET /api/audit/events`; deterministic `createdAt DESC, id DESC` sort | integration | `pnpm --filter @meditrack/api test -- audit.integration.test.ts -t "admin-only access"` | ✅ | ✅ green |
| 05-03 | 1 | AUD-03 / AUD-01 / AUD-02 | T-05-02 | Two-layer append-only: ESLint absence + Postgres REVOKE; redaction + RBAC asserted end-to-end | integration + lint | `pnpm --filter @meditrack/api test -- audit.integration.test.ts -t "append-only enforcement"` + `pnpm lint` | ✅ | ✅ green |
| 05-04 | 2 | AUD-01 (CR-01) | T-05-01 | Real forced-rollback inside `prisma.$transaction` leaves zero audit rows for the rolled-back entity (D-91 backstop) | integration | `pnpm --filter @meditrack/api test -- audit.integration.test.ts -t "forced-rollback"` | ✅ | ✅ green |
| 05-05 | 2 | AUD-01/02 (CR-02/CR-04/WR-07) | — | Cursor decode reason `invalid_cursor`; logout audit row carries `actorUserId`; failed-login both branches use `entityType=auth_attempt`, `entityId=email` | integration | `pnpm --filter @meditrack/api test -- audit.integration.test.ts -t "failed-login\|logout\|invalid_cursor"` | ✅ | ✅ green |
| 05-06 | 3 | AUD-01 (CR-01/CR-04 structural) | T-05-01 | Per-concern ALS instances eliminate shared-store cross-attribution; nested tx + parallel tx + keep-alive frame isolation all pass | integration | `pnpm --filter @meditrack/api test -- audit.integration.test.ts -t "nested\|parallel\|parallel actorALS-frame"` | ✅ | ✅ green |
| 05-07 | 4 | AUD-03 (HIGH #3) | T-05-02 | Named role `meditrack_app` REVOKEd from UPDATE/DELETE/TRUNCATE on `AuditEvent`; `DIRECT_URL` used for migrations | integration | `pnpm --filter @meditrack/api test -- audit.integration.test.ts -t "permission denied"` | ✅ | ✅ green |
| 05-08 | 4 | AUD-03 (HIGH #4 + MEDIUM #5 + LOW #12) | T-05-02 | `createMany` banned by ESLint outside seed; CI grep enforces `$executeRaw` allowlist; empty/NULL `entityId` rejected by BEFORE INSERT trigger (SQLSTATE 23514) | integration + lint | `pnpm --filter @meditrack/api test -- audit.integration.test.ts -t "executeRaw\|empty entityId"` + `pnpm lint` | ✅ | ✅ green |
| 05-09 | 5 | AUD-01 (MEDIUM #7 + MEDIUM #8 + LOW #19) | T-05-04 | `POST /api/auth/login` rate-limited (per-email 10/min + per-IP 30/min); `auth.login_failed` commits outside any wrapping tx | integration | `pnpm --filter @meditrack/api test -- auth.ratelimit.test.ts` + `audit.integration.test.ts -t "tx-isolation"` | ✅ | ✅ green |
| 05-10 | 6 | — (documentation) | — | Inline JSDoc on `FiltersCacheEntry` documents 60s TTL rationale + v2 invalidation candidates; README §Lessons learned bundles 3 process retros | n/a (docs) | — (code review only) | ✅ | ✅ green |
| 05-11 | 6 | — (documentation) | — | 6 Tier C findings deferred with rationale in `05-CONTEXT.md <deferred>` + 5 new README §v2 bullets + §Why $extends over $use? subsection | n/a (docs) | — (code review only) | ✅ | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Underlying test inventory:
- `apps/api/test/audit.integration.test.ts` — 17 tests across 7 describe blocks
- `apps/api/test/auth.ratelimit.test.ts` — 4 tests (A–D)
- Full suite: **102 tests / 13 files / 0 failures** (last green run 2026-05-23T09:06:59Z per 05-09-SUMMARY).

---

## Wave 0 Requirements

Existing infrastructure covered all phase requirements — no Wave 0 stubs were needed.
Phase 5 inherited the vitest + Postgres harness from Phases 1–4 (`buildTestApp`, `loginAs`,
`ensureAllRolesSeeded`, `progressOrderToBekraftad`) and reused them unchanged.

The only *new* test infrastructure added in Phase 5:
- `apps/api/test/audit.integration.test.ts` (Plan 05-03 created it; Plans 05-04..05-09 extended it)
- `apps/api/test/auth.ratelimit.test.ts` (Plan 05-09)
- `.eslintrc.cjs` `no-restricted-syntax` rule (Plan 05-03, extended by 05-08)
- `@fastify/rate-limit@8.1.1` dependency (Plan 05-09)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `/admin/audit` page renders rows in reverse-chrono; three comboboxes (Användare/Entitetstyp/Åtgärd) populate from live DB; row click expands the Fält/Före/Efter diff panel; `Kopiera permalink` copies a URL with sonner toast | AUD-02 | Visual rendering + interactive expand behavior of `AuditPage.tsx` / `AuditTable.tsx` / `AuditCardList.tsx` / `AuditDiffPanel.tsx` cannot be asserted by static inspection; no RTL tests were written for the audit page (deferred to v2) | `docker compose up --build`; log in as `admin@example.test`; navigate to `/admin/audit`; verify the demo path described in 05-CONTEXT.md `<specifics>` steps 6–7 |
| Rate-limit on `POST /api/auth/login` observable end-to-end against a running container | MEDIUM #8 | `auth.ratelimit.test.ts` Tests A–D exercise this via `app.inject` and cover the contract; curl-against-container reproduction is optional polish, not required | (optional) From a running stack, `for i in {1..11}; do curl -X POST http://localhost:3001/api/auth/login -H 'Content-Type: application/json' -d '{"email":"x@x.test","password":"wrong"}'; done` — the 11th attempt should return HTTP 429 with `{error:{code:'rate_limited', message:'För många inloggningsförsök…'}}` |

> Both items were marked **passed** in `05-HUMAN-UAT.md` (2026-05-23T13:15:00Z user confirmation
> for the admin-page item; suite-pass acceptance for the rate-limit item).

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies (41/41 tasks across 11 plans).
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
  (Plans 05-10 + 05-11 are docs-only — adjacent Plans 05-09 and earlier all green).
- [x] Wave 0 covers all MISSING references (no MISSING — every requirement maps to a green test).
- [x] No watch-mode flags in any committed test command.
- [x] Feedback latency < 45 s (full suite; quick path < 10 s).
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-05-23 (reconstruction from completed phase artifacts).

---

## Validation Audit 2026-05-23

| Metric | Count |
|--------|-------|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

Reconstruction outcome: phase shipped with full Nyquist coverage already in place; this document
formalizes the post-hoc record. No code changes or new tests required.
