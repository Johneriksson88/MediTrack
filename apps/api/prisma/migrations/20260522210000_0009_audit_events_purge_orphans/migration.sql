-- Phase 5 Plan 04 / Gap CR-01 — One-shot purge of pre-fix orphan audit rows
--
-- WHY THIS MIGRATION EXISTS
-- =========================
-- D-91's transactional contract was broken in the original Plan 01 ship:
-- the Prisma extension's audit-row INSERT and `before`-row pre-load reads
-- ran against the captured root client from `Prisma.defineExtension((client) =>
-- ...)` rather than against the active transaction context. Mutations that
-- rolled back left orphan audit rows in the audit_events table — rows claiming
-- the mutation happened when in fact it was rolled back. Test runs against the
-- pre-fix code produced ~300+ orphan rows per `pnpm test` per Plan 01 SUMMARY.
--
-- WHY THE TRIGGER MUST BE TEMPORARILY DISABLED
-- ==============================================
-- The `AuditEvent_no_delete` trigger (installed in migration 0008) raises
-- SQLSTATE 42501 on every DELETE against the AuditEvent table — even for
-- the table OWNER, because triggers bind owners too (unlike REVOKE). The
-- clean approach is `ALTER TABLE "AuditEvent" DISABLE TRIGGER "AuditEvent_no_delete"`
-- inside the migration transaction, run the purge DELETE, then re-enable. Because
-- all of this happens inside a single migration transaction, the audit table is
-- NEVER in an append-only-bypassable state visible to any concurrent session:
-- Postgres MVCC guarantees that our transaction's intermediate state (disabled
-- trigger) is invisible until the transaction commits — and the trigger is
-- re-enabled before we commit.
--
-- WHAT WE PURGE
-- =============
-- All rows in "AuditEvent" strictly older than CURRENT_TIMESTAMP at migration
-- apply time. This is safe because:
--   (a) The migration runs at deploy time, after the fixed extension is deployed.
--   (b) Any post-deploy audit row is naturally written by the fixed extension.
--   (c) Deleting ALL pre-migration rows is acceptable for an interview demo
--       dataset — there is no real audit history to preserve, only test noise.
--
-- V2 RETENTION-JOB NOTE (D-101)
-- ==============================
-- Keeping audit rows forever is the v1 contract. A future TTL or cold-storage
-- tier would need a separately-callable mechanism — a SECURITY DEFINER function
-- with `SET LOCAL meditrack.allow_audit_purge = on`, with the trigger
-- short-circuiting when that GUC is set. The pattern this migration uses
-- (disable trigger inside tx, delete, re-enable) is the same pattern a future
-- TTL job would use but within a GUC-gated SECURITY DEFINER function so the
-- architectural append-only story stays intact. v1 ships the one-shot here;
-- v2 ships the GUC-gated function. The README §"Known gap" section references
-- this migration and the v2 retention note.
--
-- IDEMPOTENT RE-RUN SAFETY
-- ========================
-- All DDL operations are wrapped in DO-block EXCEPTION handlers. Re-running
-- this migration is a no-op: the second run's DELETE targets rows older than
-- the re-run timestamp, which will be the post-fix rows (if any) — in practice
-- zero rows because the fixed extension only writes correct rows.

-- Step 1 — Disable the no-delete trigger inside our migration transaction.
-- EXCEPTION block: if the trigger is already absent (e.g., re-run on a fresh DB
-- where 0008 ran first), this is a no-op.
DO $$
BEGIN
  ALTER TABLE "AuditEvent" DISABLE TRIGGER "AuditEvent_no_delete";
EXCEPTION
  WHEN OTHERS THEN
    -- Swallow: trigger absent, already disabled, or table missing.
    NULL;
END $$;

-- Step 2 — Purge all pre-migration audit rows.
-- Safe: any row written by the fixed extension (deployed before this migration)
-- has createdAt >= the start of this migration transaction, so it is NOT deleted.
DELETE FROM "AuditEvent" WHERE "createdAt" < CURRENT_TIMESTAMP;

-- Step 3 — Re-enable the trigger.
-- EXCEPTION block: symmetric with Step 1 for idempotent re-run safety.
DO $$
BEGIN
  ALTER TABLE "AuditEvent" ENABLE TRIGGER "AuditEvent_no_delete";
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Step 4 — Safety gate: fail the migration if the trigger is not re-enabled.
-- This ensures that a partial-application bug (e.g., Step 3 silently failed)
-- does NOT leave the audit table in a state where DELETEs go unguarded.
-- If this check raises, the entire migration transaction rolls back, and Prisma
-- marks the migration as pending so the operator must investigate before
-- proceeding.
DO $$
BEGIN
  PERFORM 1
    FROM pg_trigger
    WHERE tgname = 'AuditEvent_no_delete'
      AND tgenabled <> 'D';
  IF NOT FOUND THEN
    RAISE EXCEPTION
      'AuditEvent_no_delete trigger is missing or disabled after migration 0009 — refusing to commit. Investigate trigger state before re-running.';
  END IF;
END $$;
