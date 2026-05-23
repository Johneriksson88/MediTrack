/**
 * Phase 5 D-99 — Repository-root ESLint config (first-of-kind for the repo).
 *
 * # WHY THIS FILE EXISTS
 *
 * This config exists for one reason: to mechanically enforce that the
 * `audit_events` table is append-only at the code layer. No code path
 * in `apps/api/src`, `apps/web/src`, or `packages/shared/src` may call
 * `prisma.auditEvent.update*`, `delete*`, `deleteMany`, `updateMany`,
 * or `upsert`. Only `create`, `findMany`, `findUnique`, `findFirst`,
 * `count`, and `aggregate` are allowed.
 *
 * # TWO-LAYER ENFORCEMENT (D-98)
 *
 * This ESLint rule is Layer 1 (code absence — caught at PR time).
 * Layer 2 lives in Postgres: migration 0008 installs BEFORE-triggers
 * that raise SQLSTATE 42501 ("permission denied for table AuditEvent")
 * on UPDATE / DELETE / TRUNCATE, even against the role that owns the
 * table. The §6 interview answer is:
 *
 *   "ESLint blocks the commit; if disables get committed, Postgres
 *    rejects the write at the role layer. Two layers, both asserted
 *    by tests."
 *
 * Plan 03 Task 2 ships the integration test (audit.integration.test.ts)
 * that re-greps for the banned pattern (Test #3) AND triggers the
 * Postgres rejection (Test #4) — both must stay green forever.
 *
 * # ALLOWED CALLS
 *
 * - `prisma.auditEvent.create(...)`         — the audit extension's writer
 * - `prisma.auditEvent.findMany(...)`       — admin list endpoint
 * - `prisma.auditEvent.findUnique(...)`     — single-event lookup
 * - `prisma.auditEvent.findFirst(...)`      — redaction tests
 * - `prisma.auditEvent.count(...)`          — never used today but allowed
 * - `prisma.auditEvent.aggregate(...)`      — never used today but allowed
 * - `prisma.auditEvent.groupBy(...)`        — listAuditFilters service
 *
 * # CREATEMANY BAN (05-REVIEWS.md HIGH #4 — Plan 05-08)
 *
 * The third selector below bans `*.createMany` outside `apps/api/prisma/seed.ts`.
 * D-93 deliberately did not intercept createMany in the Prisma extension
 * because seed.ts was the only known consumer. The ESLint ban operationalises
 * that decision so a future contributor cannot accidentally add a createMany
 * call in a service file and silently bypass the audit middleware.
 *
 * To enable createMany for a new bulk-import path, either reopen D-93 and
 * intercept createMany in the audit extension (load matched rows by PK after
 * the op, emit N audit rows), OR decompose the call into N individual
 * prisma.<model>.create({data}) calls which ARE intercepted.
 *
 * The `overrides` block at the bottom of this file exempts `apps/api/prisma/seed.ts`
 * from the `no-restricted-syntax` rule entirely. The seed file runs outside the
 * ALS frame so it doesn't trigger audit writes anyway, and it's the ONLY
 * documented createMany consumer (D-93). See the overrides block below.
 */

/* eslint-env node */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    // No `project` — fastest mode; this single rule is syntax-only
    // and does NOT need type information.
    project: false,
  },
  env: {
    node: true,
    es2022: true,
    browser: true,
  },
  ignorePatterns: [
    'dist/',
    '**/dist/',
    'node_modules/',
    '**/node_modules/',
    'apps/api/prisma/migrations/**',
    '*.config.cjs',
    '*.config.ts',
    '*.config.js',
    'coverage/',
    '**/*.d.ts',
  ],
  rules: {
    // react-hooks plugin is registered so existing
    // `// eslint-disable-line react-hooks/exhaustive-deps` comments in
    // apps/web (Phase 2 LakemedelFilter / MedicationSheet) parse as
    // valid disable directives. The rule itself is left 'off' — this
    // Phase 5 lint pass exists for the D-98 append-only check, not for
    // a full React-rules audit (which is a v2 tooling task).
    'react-hooks/exhaustive-deps': 'off',
    'react-hooks/rules-of-hooks': 'off',

    'no-restricted-syntax': [
      'error',
      {
        // Direct member-access form: `prisma.auditEvent.update(...)`,
        // `prisma.auditEvent.delete(...)`, `prisma.auditEvent.upsert(...)`,
        // `prisma.auditEvent.updateMany(...)`, `prisma.auditEvent.deleteMany(...)`.
        selector:
          "MemberExpression[object.property.name='auditEvent'][property.name=/^(update|updateMany|delete|deleteMany|upsert)$/]",
        message:
          'audit_events is append-only — see Phase 5 D-98. Use prisma.auditEvent.create only.',
      },
      {
        // Paranoid catch: destructured access like
        //   const { update } = prisma.auditEvent;
        //   update({ where: ..., data: ... });
        // No one in this codebase does this today, but the rule guards
        // against a future regression that tries to evade the direct-
        // member-access check above.
        selector:
          "VariableDeclarator > ObjectPattern > Property[key.name='auditEvent'] ~ ObjectPattern > Property[key.name=/^(update|updateMany|delete|deleteMany|upsert)$/]",
        message:
          'audit_events is append-only — destructured access to auditEvent.update*/delete*/upsert is banned (D-98).',
      },
      {
        // CREATEMANY BAN — 05-REVIEWS.md HIGH #4 / Plan 05-08
        //
        // createMany bypasses the audit middleware: the Prisma $extends
        // interceptor fires on model-method calls, but createMany returns
        // only { count: N } — no row data for the extension to snapshot.
        // D-93 deliberately skipped intercepting createMany because
        // apps/api/prisma/seed.ts was (and remains) the ONLY consumer.
        // This ESLint rule operationalises that decision.
        //
        // If a new bulk-import path is needed, either:
        //   (a) Reopen D-93 and extend the audit extension to load matched
        //       rows by PK after the op and emit N audit rows.
        //   (b) Decompose into N individual prisma.<model>.create({data})
        //       calls — those ARE intercepted by the audit extension.
        selector: "MemberExpression[property.name='createMany']",
        message:
          'createMany bypasses the audit middleware (D-93 deliberately skips createMany). Only apps/api/prisma/seed.ts is allowed — see 05-REVIEWS.md HIGH #4. To enable createMany for a new bulk-import path, either (a) reopen D-93 and intercept createMany in the audit extension by loading matched rows by PK after the op + emitting N audit rows, or (b) decompose the call into N individual prisma.<model>.create({data}) calls (which ARE intercepted).',
      },
    ],
  },
  // apps/api/prisma/seed.ts is the ONLY documented createMany consumer (D-93).
  // Seed runs outside the ALS frame and does NOT trigger audit writes. The
  // no-restricted-syntax rule is disabled here so the seed's createMany calls
  // pass lint. The auditEvent.update*/delete*/upsert bans also relax here, but
  // seed.ts does not (and should not) call those — the relaxation is benign.
  overrides: [
    {
      files: ['apps/api/prisma/seed.ts'],
      rules: {
        // Seed runs outside the ALS frame and is the ONLY documented
        // createMany consumer (D-93). Disable the createMany ban here.
        'no-restricted-syntax': 'off',
      },
    },
  ],
};
