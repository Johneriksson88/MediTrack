-- Phase 5 — Named app role for audit-events append-only enforcement.
-- Addresses 05-REVIEWS.md HIGH #3 + the 05-01-SUMMARY "OWNER REVOKE was a no-op" finding.
--
-- SUPERSEDES 0008's CURRENT_USER GRANT/REVOKE
-- ==============================================
-- Migration 0008 (Plan 01) installed two things:
--   (a) A BEFORE UPDATE/DELETE/TRUNCATE trigger on "AuditEvent" that raises
--       SQLSTATE 42501 — this is Layer 2a of the append-only contract and it
--       binds the TABLE OWNER (the meditrack role). This trigger remains active
--       and continues to guard against any admin psql session, migration runner,
--       or seed script that runs as the meditrack owner.
--   (b) A no-op REVOKE FROM CURRENT_USER — when CURRENT_USER is also the
--       table OWNER, Postgres bypasses GRANT/REVOKE checks for owners
--       entirely. Plan 01's SUMMARY documents this finding explicitly.
--
-- This migration (0010) adds Layer 2b: a NAMED-role REVOKE that binds the
-- application's actual runtime role, not whichever role happened to run the
-- migration. The two layers compose:
--   - Queries from the table-owner role (meditrack) hit the trigger first.
--   - Queries from the named app role (meditrack_app) hit the GRANT check
--     first (before the trigger even fires).
-- Either layer alone is sufficient for its respective role; together they
-- are defense-in-depth (D-98 Layer 2, both sub-layers).
--
-- WHY A NAMED ROLE OVER CURRENT_USER (HIGH #3)
-- ==============================================
-- CURRENT_USER evaluates at migration runtime. If a future deployment runs
-- prisma migrate deploy as a different role, the REVOKE silently attaches to
-- THAT role — or, if that role owns the table, it remains a no-op again.
-- Binding the REVOKE to the name "meditrack_app" means:
--   - A future deployment swapping to a different role MUST consciously grant
--     UPDATE/DELETE/TRUNCATE back to that role — the architectural decision
--     surfaces instead of vanishing silently.
--   - The identity of the runtime role is captured in THREE independent
--     locations any future contributor would consult: this migration, the
--     docker-compose.yml DATABASE_URL, and README §"Database roles".
--
-- §6 INTERVIEW NARRATIVE (D-98 / Layer 2b)
-- ==========================================
-- "The REVOKE is bound to a name, not to a connection. The application
-- connects as meditrack_app. That role physically cannot issue UPDATE, DELETE,
-- or TRUNCATE against AuditEvent — the grant check fails before the trigger
-- fires. A future deployment using a different role would have to consciously
-- regrant those privileges; the architectural decision is surfaced by name,
-- not hidden in a migration timestamp."
--
-- NOTE: Migration 0008's SQL is intentionally left unmodified.
-- Editing any byte of an already-applied Prisma migration — including
-- comment-only changes — changes its SHA-256 checksum and causes
-- `prisma migrate status` to report drift. The cross-reference between
-- migrations (0008 → 0010) is documented HERE (in the new migration's
-- header) rather than by editing the applied 0008 SQL. README §"Database
-- roles" documents the full migration sequence.
--
-- IDEMPOTENT RE-RUN SAFETY
-- =========================
-- DO block + EXCEPTION WHEN duplicate_object: CREATE ROLE is idempotent.
-- GRANT is naturally idempotent (re-running grants the same privilege).
-- REVOKE is naturally idempotent (re-running on already-revoked privilege
-- is a no-op).
-- So prisma migrate deploy is safe to re-run against an existing database.
--
-- HARDCODED PASSWORD NOTE
-- =======================
-- The role password 'meditrack_app_dev' is chosen to be unmistakably
-- non-production. README §"Database roles" documents that production
-- deployments substitute this with a real secret via docker-compose
-- env_file or a secret manager. Out of scope for a one-week interview demo.

-- Create the named app role (idempotent via EXCEPTION handler).
-- If the role already exists, ALTER ROLE ensures the password is current.
DO $$
BEGIN
  CREATE ROLE meditrack_app WITH LOGIN PASSWORD 'meditrack_app_dev';
EXCEPTION
  WHEN duplicate_object THEN
    -- Role already exists; update password to keep it in sync.
    ALTER ROLE meditrack_app WITH LOGIN PASSWORD 'meditrack_app_dev';
END $$;

-- Minimum privileges required by the application for Phase 1-5 operation.
GRANT CONNECT ON DATABASE meditrack TO meditrack_app;
GRANT USAGE ON SCHEMA public TO meditrack_app;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON ALL TABLES IN SCHEMA public TO meditrack_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO meditrack_app;

-- DEFAULT PRIVILEGES ensure future tables (Phase 6/7) get the same grants
-- automatically without a separate migration. The AuditEvent table is the
-- documented exception — see the REVOKE below.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES ON TABLES TO meditrack_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO meditrack_app;

-- D-98 Layer 2b — the architectural append-only contract at the named-role layer.
-- After the broad GRANT above, remove the mutation privileges from AuditEvent
-- for meditrack_app. This is the entire point of this migration: the runtime role
-- physically cannot issue UPDATE, DELETE, or TRUNCATE against the audit table.
--
-- The trigger in migration 0008 (Layer 2a) guards the OWNER role (meditrack).
-- This REVOKE (Layer 2b) guards the APPLICATION role (meditrack_app).
-- Both are in effect simultaneously; removing either one still leaves the other.
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM meditrack_app;

-- FUTURE TABLE NOTE
-- =================
-- A future contributor adding a mutation-required table (e.g., an async-jobs
-- table in Phase 6/7) gets the DEFAULT PRIVILEGES grants automatically via
-- the ALTER DEFAULT PRIVILEGES statements above. The AuditEvent table is the
-- explicit documented exception because it carries the immutable forensics record.
-- Any future table that ALSO requires append-only enforcement must have its
-- own REVOKE statement added here or in a subsequent migration.
