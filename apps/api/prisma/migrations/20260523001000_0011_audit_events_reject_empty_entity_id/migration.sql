-- Phase 5 — BEFORE INSERT trigger rejecting empty entityId on AuditEvent.
-- (05-REVIEWS.md LOW #12 — DB-layer backstop for the WR-07 sentinel-empty
-- class that Plan 05-05 closed at the application code layer.)
--
-- CONTEXT: WHY THIS TRIGGER EXISTS
-- ==================================
-- Plan 05-05 (WR-07) closed the sentinel-empty-string entityId path in the
-- application code. The unknown-email login-failure branch in auth.service.ts
-- previously wrote entityId = '' for audit rows with entityType = 'session'.
-- WR-07 fixed that: the unknown-email branch now writes entityType = 'auth_attempt'
-- with entityId = <attempted email> (never ''). The known-user-wrong-password
-- branch (CR-03) was unified to the same entityType/entityId convention.
--
-- This trigger is the DB-LAYER BACKSTOP: even if a future code path forgets
-- to set entityId, or reintroduces a sentinel-empty-string pattern, the DB
-- rejects the row with SQLSTATE 23514 before it can land. No orphan-empty
-- audit rows can persist regardless of which code path writes the INSERT.
--
-- DESIGN CHOICES
-- ==============
-- (a) BEFORE INSERT trigger, not a CHECK constraint: mirrors the existing
--     0008 pattern (BEFORE UPDATE/DELETE/TRUNCATE triggers that raise SQLSTATE
--     42501). Future contributors reading the migration history see a consistent
--     trigger-based enforcement idiom. The latency difference is unmeasurable on
--     an audit INSERT that is not on any hot path.
-- (b) SQLSTATE 23514 (check_violation): semantically correct — "row violates
--     a check constraint" is the canonical class for "column must be non-empty."
--     The trigger effectively enforces the equivalent of CHECK (entityId <> '').
-- (c) Also rejects NULL: entityId should ALWAYS be a meaningful non-empty
--     identifier. Rejecting NULL here is belt-and-suspenders alongside the
--     Prisma schema's non-optional entityId field.
--
-- IDEMPOTENT RE-RUN SAFETY
-- ========================
-- CREATE OR REPLACE FUNCTION is safe to re-run (replaces existing body).
-- DROP TRIGGER IF EXISTS + CREATE TRIGGER is safe to re-run (no-op if absent).
--
-- RELATIONSHIP TO 0008 (APPEND-ONLY TRIGGERS)
-- ============================================
-- Migration 0008 guards against UPDATE/DELETE/TRUNCATE on AuditEvent.
-- This migration (0011) guards against bad INSERT data (empty entityId).
-- Together they enforce two independent integrity contracts:
--   - 0008: once written, audit rows are immutable.
--   - 0011: audit rows must carry a meaningful entityId (never empty).
--
-- APPLICATION-CODE CONTRACT (PLAN 05-05 WR-07 — PRIMARY)
-- ========================================================
-- The application code is the primary contract. This trigger is a backstop.
-- auth.service.ts (Plan 05-05) sets entityId to the attempted email for all
-- auth.login_failed branches. No production code path writes entityId = '' today
-- (verified by: git grep -nE "entityId:\s*['\"]\\s*['\"]" apps/api/src/ packages/
-- returning ZERO matches at Plan 05-08 authorship time).

CREATE OR REPLACE FUNCTION "AuditEvent_reject_empty_entity_id"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."entityId" = '' OR NEW."entityId" IS NULL THEN
    RAISE EXCEPTION 'audit_events.entityId must be a non-empty string (Phase 5 LOW #12 backstop — WR-07 sentinel class)'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "AuditEvent_reject_empty_entity_id" ON "AuditEvent";
CREATE TRIGGER "AuditEvent_reject_empty_entity_id"
  BEFORE INSERT ON "AuditEvent"
  FOR EACH ROW
  EXECUTE FUNCTION "AuditEvent_reject_empty_entity_id"();

-- Footer: the application-code WR-07 fix (Plan 05-05, auth.service.ts) is the
-- PRIMARY contract. This trigger is the DB-layer backstop. The two layers compose:
--   - App layer: auth.service.ts never passes entityId = '' to auditEvent.create.
--   - DB layer: this trigger rejects any INSERT with entityId = '' or NULL,
--     regardless of code path — an unconditional DB-side guarantee.
