# Phase 10 Deferred Items

Out-of-scope discoveries from Plan 10-01 execution (per scope-boundary rule —
issues not caused by current task changes are deferred).

## D-10-01: audit.integration.test Test for meditrack_app role mismatch

**File:** `apps/api/test/audit.integration.test.ts:545`

**Symptom:** Test expects `current_user === 'meditrack_app'` but local dev DB
connects as `meditrack` (the migration-owner role per docker-compose.yml).

**Pre-existing:** Failure reproduces on the commit immediately prior to
Plan 10-01 (verified by git stash → re-run). Has nothing to do with Phase 10's
schema additions, the mintOrderNumber service, or the AUDIT_ALLOWLIST extension.

**Root cause hypothesis:** the test is configured for the migration-time role
created in `0010_audit_events_named_app_role` but the local non-Docker DB the
worktree connects to was provisioned before that migration's role-creation step.
Re-running `prisma migrate reset` with the docker-compose API user (which sets
DATABASE_URL=meditrack_app) likely fixes it. Out of scope for Plan 10-01.

**Action:** none from Plan 10-01. Surface in code-review or capture as a quick
task if it persists in the wave-2 verifier run.

## D-10-02: Edit tool sporadically dropping content with non-ASCII characters

**Symptom:** Multiple Edit calls during Plan 10-01 returned success ("file is
current in your context") but left the file unchanged on disk. Failed edits
contained smart quotes / em-dashes / arrow chars (`→`). Re-submitting with
ASCII-only payload landed correctly.

**Workaround:** stick to ASCII glyphs (`->`, `--`, `'`, `"`) in Edit payloads;
verify on-disk content with `grep` after every Edit that touches schema /
allowlist / contract files where silent drop would corrupt the build.

**Files affected during this plan:** apps/api/prisma/schema.prisma (first
attempt lost the CareUnit + Order edits — recovered by re-Editing with
identical-looking but ASCII-only content), apps/api/prisma/seed.ts (first
attempt lost the seed mint logic — recovered same way), apps/api/src/db/
auditAllowlist.ts (first attempt lost the orderNumberCounter/Year additions —
recovered same way).
