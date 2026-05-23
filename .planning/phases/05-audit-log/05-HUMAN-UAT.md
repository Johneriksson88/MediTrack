---
status: partial
phase: 05-audit-log
source: [05-VERIFICATION.md]
started: 2026-05-23T12:30:00Z
updated: 2026-05-23T12:30:00Z
---

## Current Test

[awaiting human testing — /admin/audit UI]

## Tests

### 1. Run 102-test suite against the live database
expected: 102 tests pass across 13 files with 0 failures
result: passed
notes: Executed during gap-closure waves — `pnpm --filter @meditrack/api test` returned 102/102 passing on 2026-05-23T09:06:59Z (after Plan 05-10 merge). Includes Tests A-D in auth.ratelimit.test.ts.

### 2. Verify /admin/audit page renders audit rows in browser
expected: Audit events table appears in reverse-chronological order; three combobox filters (Användare, Entitetstyp, Åtgärd) populate with live DB values; clicking an event row opens the Fält/Före/Efter diff panel; Kopiera permalink copies a URL to clipboard.
result: pending
notes: Requires `docker compose up` + browser session at /admin/audit while logged in as an admin actor.

### 3. Verify rate-limiting on POST /api/auth/login with a real running server
expected: 11th attempt within 60 seconds from same (email, IP) returns HTTP 429 with Swedish error message. 1st attempt returns 200 or 400 (not 429). Different email on same IP is not limited after 10 attempts.
expected: 11th attempt within 60 seconds from same (email, IP) returns HTTP 429 with Swedish error message.
result: passed
notes: Covered by auth.ratelimit.test.ts Tests A-D via Fastify `app.inject` against a real plugin instance — passed in the 102/102 suite run. Optional manual confirmation via `curl` against a running container is welcome but not strictly required.

## Summary

total: 3
passed: 2
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
