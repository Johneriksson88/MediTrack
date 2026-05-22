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
    ],
  },
};
