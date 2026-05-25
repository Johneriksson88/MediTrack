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

## D-10-03: DashboardLowStockCard renders all rows unbounded

**Surface:** `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx`

**Symptom:** With seed data growing to 3433 low-stock medications, the
DashboardPage scrollHeight at 360px viewport is now **158,406 pixels**
(file size **9.4 MB** when captured fullPage). The card renders every
row in the response, no pagination, no virtualization, no top-N limit.

**Pre-existing:** Wave 2 of Phase 10 only modified DashboardOrdersCard,
not DashboardLowStockCard. The earlier committed dashboard.png (Phase 7,
commit 5834bb7) was 360x800 = 31 KB because the seed had ~handful of
low-stock medications at that time. The data has grown over Phases 8–9.

**Discovered:** Plan 10-02 checkpoint review (re-running sc04 harness
produced an unreadable 9.4 MB dashboard.png).

**Why deferred:** the LowStockCard sizing fix (top-N + “Visa fler”, or
virtualization, or pagination) is its own UI/UX decision and is out of
Plan 10-02 scope (which is strictly identity-level ORD-#### promotion
on order-rendering surfaces).

**Workaround applied in Plan 10-02:** the regenerated dashboard.png is
**not** committed in this plan; the dashboard orderNumber promotion is
verified via DashboardOrdersCard component tests + an element-scoped
visual capture (saved to `.planning/phases/10-order-numbers/` as proof
during the checkpoint, not committed to docs/screenshots).

**Recommended follow-up phase:** dashboard "ovan vikningen" pass — cap
LowStockCard at top-5 with “Visa fler” affordance, or virtualize the
list, so the dashboard remains usable + readable at all data volumes.

## D-10-04: docker compose web image is stale-by-design

**Surface:** `docker-compose.yml` `web` service.

**Symptom:** Wave 2 commits live on the worktree branch. The running
docker `meditrack-web` container was built from main BEFORE Wave 2 was
merged, so a `sc04` harness pointed at port 5173 captured the OLD UI
(no ORD-#### column, no Compose H1) — falsely suggesting Wave 2 was
incomplete.

**Pre-existing:** the `web` service has no source-mount; the Dockerfile
COPYs source at build time. `docker compose up --build` is required
after every commit that touches `apps/web/` for the container image to
match HEAD.

**Workaround in Plan 10-02:** the checkpoint screenshot capture was
done against a Vite dev server started directly from the worktree
(`VITE_API_HOST=localhost pnpm --filter @meditrack/web dev`), bypassing
the docker container. The docker `meditrack-web` was restarted unchanged
after capture; it remains stale until the next `docker compose up --build`.

**Action:** the README should call out that `docker compose up --build`
(not just `up`) is required after FE source changes. Out of scope for
Plan 10-02.
