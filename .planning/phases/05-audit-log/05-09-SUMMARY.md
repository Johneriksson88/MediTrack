---
phase: 05-audit-log
plan: 09
subsystem: api/auth
tags: [audit, rate-limit, fastify-rate-limit, login, dos-prevention, auth-login-failed, tx-isolation, invariant-test]
dependency_graph:
  requires: [05-08]
  provides: [rate-limit-on-login, auth-login-failed-tx-isolation-test]
  affects: [apps/api/src/routes/auth.ts, apps/api/src/app.ts, apps/api/src/plugins/errorHandler.ts, apps/api/test/auth.ratelimit.test.ts, apps/api/test/audit.integration.test.ts]
tech_stack:
  added: ["@fastify/rate-limit@8.1.1 (Fastify 4 compatible; v9 requires Fastify 5)"]
  patterns: [per-route opt-in rate-limit via config.rateLimit, preHandler hook for body-available keyGenerator, Error-object errorResponseBuilder pattern, tx-isolation invariant test]
key_files:
  created:
    - apps/api/test/auth.ratelimit.test.ts
  modified:
    - apps/api/package.json
    - pnpm-lock.yaml
    - apps/api/src/app.ts
    - apps/api/src/routes/auth.ts
    - apps/api/src/plugins/errorHandler.ts
    - apps/api/src/services/auth.service.ts
    - apps/api/test/audit.integration.test.ts
    - apps/api/test/helpers/buildTestApp.ts
    - docker-compose.yml
    - README.md
decisions:
  - "@fastify/rate-limit v8.x chosen over v9 because Fastify is pinned at ^4.28.1 (v9 requires Fastify 5)"
  - "hook: 'preHandler' required in route config.rateLimit so req.body is available for per-email keyGenerator (default 'onRequest' fires before body parsing)"
  - "errorResponseBuilder must return Error object with statusCode: 429 (not a plain object) because @fastify/rate-limit THROWS the return value via Fastify's error pipeline — a plain object has no statusCode and falls through to 500"
  - "global: false on plugin registration so only routes with explicit config.rateLimit are rate-limited; medications/orders/audit routes are unaffected"
  - "Test 17 placed in AUD-01 failed-login taxonomy describe block (contextually closer than AUD-01 full pipeline)"
metrics:
  duration_minutes: 110
  completed_date: "2026-05-23"
  tasks_completed: 5
  files_changed: 10
---

# Phase 05 Plan 09: Login Rate-Limit + Tx-Isolation Invariant Test Summary

Closed three findings from 05-REVIEWS.md: @fastify/rate-limit on POST /api/auth/login (MEDIUM #8), INVARIANT comment verification at auth.login_failed write sites (MEDIUM #7), and Test 17 codifying the tx-isolation invariant (LOW #19).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install @fastify/rate-limit + register in app.ts | 85fea50 | apps/api/package.json, apps/api/src/app.ts, pnpm-lock.yaml |
| 2 | Per-email rate-limit on POST /api/auth/login + verify INVARIANT comments | 24acd26 | apps/api/src/routes/auth.ts, apps/api/src/services/auth.service.ts |
| 3 | Create auth.ratelimit.test.ts (Tests A-D) + Rule 1 bug fixes | e10edd9 | apps/api/test/auth.ratelimit.test.ts, apps/api/src/app.ts, apps/api/src/plugins/errorHandler.ts, apps/api/src/routes/auth.ts, apps/api/test/helpers/buildTestApp.ts |
| 4 | Add Test 17 tx-isolation invariant to audit.integration.test.ts | 87278c3 | apps/api/test/audit.integration.test.ts |
| 5 | docker-compose.yml env vars + README login rate-limiting section | 93db774 | docker-compose.yml, README.md |

## What Was Built

- **@fastify/rate-limit v8.1.1** registered in app.ts with `global: false` (opt-in per route). Global per-IP guard: 30 req/min (env: `RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE`).
- **Per-email rate-limit on POST /api/auth/login**: 10 req/min per (email, IP) combined key (env: `RATE_LIMIT_LOGIN_PER_EMAIL_PER_MINUTE`). Uses `hook: 'preHandler'` so `req.body` is available for the email keyGenerator.
- **HTTP 429 canonical envelope**: `{error: {code: 'rate_limited', message: 'För många inloggningsförsök...'}}`. Handled at the top of errorHandlerPlugin's setErrorHandler by checking `err.statusCode === 429`.
- **INVARIANT comments** at both auth.login_failed write sites in auth.service.ts (verified present from Plan 05-06; references updated to cite Test 17).
- **Test 17** in audit.integration.test.ts: wraps prisma.auditEvent.create (outer singleton) inside a $transaction callback, forces rollback, asserts the audit row persists — proving the write committed independently of the surrounding tx.
- **4-test auth.ratelimit.test.ts**: Test A (11th attempt → 429), Test B (rate-limited → no audit row), Test C (per-email bucket isolation), Test D (legitimate first login unaffected).
- **docker-compose.yml**: `RATE_LIMIT_LOGIN_PER_EMAIL_PER_MINUTE: "10"` and `RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE: "30"` added to api service env.
- **README.md**: New `### Login rate-limiting` subsection with two-bucket explanation, env-var docs, §6 interview phrasing.

## Test Results

102 tests pass across 13 test files (0 failures). Added 5 new tests (4 in auth.ratelimit.test.ts, 1 Test 17 in audit.integration.test.ts).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] errorResponseBuilder must return Error object, not plain object**
- **Found during:** Task 3 (writing rate-limit tests — Tests B/C/D failed immediately with 429 on first request)
- **Issue:** @fastify/rate-limit THROWS the return value of `errorResponseBuilder` through Fastify's error pipeline (`throw params.errorResponseBuilder(req, respCtx)`). The plan's sample code showed returning a plain object `{error: {code, message}}`. A plain object has no `statusCode` property, so Fastify's error handler fell through to the `internal_error` (500) branch.
- **Fix:** Changed both `errorResponseBuilder` callbacks (in app.ts and routes/auth.ts) to return `new Error(...) as Error & { statusCode: number }` with `err.statusCode = 429`. Added 429 interceptor at the top of errorHandlerPlugin.setErrorHandler.
- **Files modified:** apps/api/src/app.ts, apps/api/src/plugins/errorHandler.ts, apps/api/src/routes/auth.ts
- **Commit:** e10edd9

**2. [Rule 1 - Bug] `hook: 'preHandler'` required for body-aware keyGenerator**
- **Found during:** Task 3 (Tests B/C/D failed — every request used key `login:unknown|ip` regardless of submitted email)
- **Issue:** @fastify/rate-limit's default hook is `'onRequest'`, which fires BEFORE Fastify parses the JSON body. `req.body` is `undefined` in `onRequest`, so the keyGenerator's `(req.body ?? {}).email` always evaluated to `undefined`, falling back to the string `'unknown'`. All requests shared the single key `login:unknown|127.0.0.1`. After Test A's 11 requests exhausted that shared bucket, Tests B/C/D's very first request immediately got 429.
- **Fix:** Added `hook: 'preHandler'` to the route's `config.rateLimit` block. `preHandler` fires after body parsing, so `req.body` is populated and the per-email key works correctly.
- **Files modified:** apps/api/src/routes/auth.ts
- **Commit:** e10edd9

**3. [Rule 2 - Missing critical functionality] buildTestApp.ts stub protection for shared test instances**
- **Found during:** Task 3 (existing integration tests failing with 500/429 after rate-limit registration)
- **Issue:** The shared test app instance (used by all integration tests) uses the same fixed credentials (TEST_APOTEKARE, TEST_SJUKSKOTERSKA, TEST_ADMIN). After 10 login calls with the same email, that email's bucket was exhausted, causing the 11th loginAs() call to get 429 instead of 200.
- **Fix:** Added conditional `vi.stubEnv` stubs in buildTestApp.ts (only if the vars aren't already set) to set `RATE_LIMIT_LOGIN_PER_EMAIL_PER_MINUTE=10000` and `RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE=10000` for the shared test instance. The auth.ratelimit.test.ts file overrides these to realistic values (10/30) in its own `beforeAll` via `vi.stubEnv` before building its own fresh app instance.
- **Files modified:** apps/api/test/helpers/buildTestApp.ts
- **Commit:** e10edd9

## Threat Flags

None — no new trust boundaries introduced. The rate-limit sits in front of an existing endpoint; the errorResponseBuilder closes the 500→429 surface.

## Self-Check: PASSED

- `apps/api/test/auth.ratelimit.test.ts`: FOUND
- `apps/api/test/audit.integration.test.ts` (Test 17): FOUND (`grep "tx-isolation" apps/api/test/audit.integration.test.ts`)
- `apps/api/src/app.ts` (fastifyRateLimit): FOUND
- `apps/api/src/routes/auth.ts` (hook: preHandler): FOUND
- Commits 85fea50, 24acd26, e10edd9, 87278c3, 93db774: all present in git log
- 102 tests passing: CONFIRMED
