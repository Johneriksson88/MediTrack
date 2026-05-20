import { defineConfig } from 'vitest/config';

/**
 * Pattern O — Vitest config for the API package.
 *
 * `fileParallelism: false` is required because every test file in this
 * package shares the same Postgres database (the dev DB at `localhost:5432`).
 * Running files in parallel creates Session-row contention between
 * `auth.login.test.ts` (counts sessions) and `auth.me.test.ts`
 * (creates / clears sessions). Phase 1 has 2 test files, so the
 * serialization cost is negligible (~200ms); when the suite grows
 * (Plan 03 / Phase 2+), switch to per-file schemas
 * (`DATABASE_URL=…?schema=test_<random>`) instead of broadening this knob.
 */
export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    // Keep individual test cases inside a file running serially as well —
    // they share the same shared `beforeEach(resetSessions)` invariant.
    sequence: { concurrent: false },
  },
});
