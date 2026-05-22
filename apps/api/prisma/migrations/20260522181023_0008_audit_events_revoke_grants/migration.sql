-- Phase 5 D-98 — Enforce append-only on "AuditEvent" at the DB layer.
--
-- WHY (D-98 LAYER 2 / DEFENSE IN DEPTH)
-- =====================================
-- Append-only audit_events is enforced at TWO layers:
--   Layer 1 — code absence + ESLint `no-restricted-syntax` (D-99, Plan 03):
--     The ESLint rule blocks `prisma.auditEvent.update/updateMany/delete/
--     deleteMany/upsert` at lint time, and a git-grep integration test
--     (Plan 03 test #2) asserts zero matches in apps/ + packages/.
--   Layer 2 — DB-layer enforcement (this migration):
--     Even if the ESLint suppressions are committed accidentally, Postgres
--     physically rejects any UPDATE/DELETE/TRUNCATE against this table
--     with `permission denied for table "AuditEvent"` (SQLSTATE 42501).
--     The §6 interview answer is: "Postgres rejects the write at the role
--     layer."
--
-- WHY A TRIGGER, NOT JUST REVOKE
-- ==============================
-- The original D-98 plan called for `REVOKE UPDATE, DELETE, TRUNCATE
-- FROM CURRENT_USER`. This is ineffective when CURRENT_USER is also the
-- table OWNER (which is our case — `meditrack` owns the schema). Postgres
-- bypasses GRANT/REVOKE checks for owners. The only DB-layer mechanisms
-- that bind table OWNERS are:
--   (a) Row-Level Security with `FORCE ROW LEVEL SECURITY` on the table
--       (raises `row violates RLS policy` — wrong error message for D-98).
--   (b) A BEFORE UPDATE/DELETE/TRUNCATE trigger that RAISEs an exception
--       with SQLSTATE 42501 = `insufficient_privilege` = "permission
--       denied" — matches D-98's error contract verbatim.
-- We chose (b) so the §6 story remains "Postgres returns permission
-- denied" with the exact error class that D-100 test #3 asserts.
--
-- We ALSO keep the explicit REVOKE so a future contributor who switches
-- the runtime role to a non-owner role automatically gets the second
-- layer of defense for free. The REVOKE is harmless on the owner;
-- the trigger is the binding layer today.
--
-- §6 INTERVIEW STORY
-- ==================
-- "Append-only is enforced by Postgres, not by the application.
--  If a future contributor writes prisma.auditEvent.delete(...), ESLint
--  blocks the commit. If the ESLint disables get committed, the DB
--  rejects the query with permission denied. Two layers, asserted by
--  tests."
--
-- IDEMPOTENT RE-RUN SAFETY
-- ========================
-- All DDL is wrapped in DROP-IF-EXISTS / CREATE-OR-REPLACE / DO-block
-- EXCEPTION patterns so the migration is safe to re-run.
--
-- V2 RETENTION-JOB NOTE (D-101)
-- =============================
-- Keeping forever is the v1 contract. A future TTL or cold-storage tier
-- would need a separately-callable mechanism (a SECURITY DEFINER function
-- with `SET LOCAL meditrack.allow_audit_purge = on`, with the trigger
-- short-circuiting when that GUC is set) — the architectural append-only
-- story stays intact even when retention is added.

-- The explicit REVOKE keeps a future non-owner role guarded automatically.
-- It is a no-op against the current owning role; harmless to leave.
DO $$
BEGIN
  REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM CURRENT_USER;
EXCEPTION
  WHEN OTHERS THEN
    -- Idempotent re-run: swallow any error (table missing, privilege absent,
    -- role missing). The migration's value is asserting the END STATE; if
    -- the state is already correct, the re-run is a no-op.
    NULL;
END $$;

-- The binding layer for table OWNERS: a trigger that raises
-- insufficient_privilege (SQLSTATE 42501) on any UPDATE / DELETE / TRUNCATE.
-- D-100 test #3 asserts that `prisma.$executeRawUnsafe("UPDATE ...")`
-- rejects with /permission denied/, which is the canonical message for
-- SQLSTATE 42501.
CREATE OR REPLACE FUNCTION "AuditEvent_append_only_guard"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'permission denied for table "AuditEvent": append-only contract (Phase 5 D-98)'
    USING ERRCODE = '42501';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS "AuditEvent_no_update" ON "AuditEvent";
CREATE TRIGGER "AuditEvent_no_update"
  BEFORE UPDATE ON "AuditEvent"
  FOR EACH ROW
  EXECUTE FUNCTION "AuditEvent_append_only_guard"();

DROP TRIGGER IF EXISTS "AuditEvent_no_delete" ON "AuditEvent";
CREATE TRIGGER "AuditEvent_no_delete"
  BEFORE DELETE ON "AuditEvent"
  FOR EACH ROW
  EXECUTE FUNCTION "AuditEvent_append_only_guard"();

DROP TRIGGER IF EXISTS "AuditEvent_no_truncate" ON "AuditEvent";
CREATE TRIGGER "AuditEvent_no_truncate"
  BEFORE TRUNCATE ON "AuditEvent"
  FOR EACH STATEMENT
  EXECUTE FUNCTION "AuditEvent_append_only_guard"();
