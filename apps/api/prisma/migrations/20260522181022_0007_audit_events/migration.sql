-- Phase 5 AUD-01 / D-97 — create the append-only audit_events table.
--
-- WHAT THIS RECORDS
-- =================
-- Every successful mutation against Medication, CareUnitMedication, Order,
-- OrderLine, User, and Session writes exactly one row here (or 1+N sibling
-- rows for the order.deliver fan-out per D-94). Auth events (login,
-- logout, login_failed) are explicit writes from auth.service.ts (D-96)
-- and Session create/delete intercepts (D-92/D-93). The Prisma `$extends`
-- middleware in apps/api/src/db/auditExtension.ts is the centralized hook
-- (D-90); it runs INSIDE the same prisma.$transaction as the wrapping
-- mutation (D-91), so a rolled-back mutation leaves zero audit rows.
--
-- WHY NO FOREIGN KEY ON actorUserId
-- =================================
-- D-97 — keep the field loose. With a FK, deleting a User would either
-- cascade-corrupt the audit log (onDelete: Cascade — historically
-- catastrophic for forensics) or block the delete entirely
-- (onDelete: Restrict — but then a future user-purge job would have to
-- explicitly tombstone or transfer audit rows, adding complexity for no
-- forensic benefit). The audit log MUST survive User row deletion. The
-- denormalized careUnitId column plays the same role for tenant scoping
-- without coupling to CareUnit's lifecycle.
--
-- WHY 5 INDEXES
-- =============
-- (createdAt DESC, id)          — cursor pagination key (D-105 — the cursor
--                                  encodes {createdAt, id}; deterministic
--                                  tiebreak handles same-millisecond
--                                  inserts which happen routinely for the
--                                  1+N sibling-event fan-out per D-94).
-- (actorUserId, createdAt DESC) — admin actor filter (D-103, combobox A).
-- (entityType, createdAt DESC)  — admin entity-type filter (D-103, combobox B).
-- (action, createdAt DESC)      — admin action filter (D-103, combobox C).
-- (requestId)                   — sibling-event grouping (D-94 — a single
--                                  HTTP request can produce 1+N audit rows;
--                                  this index powers the requestId-group
--                                  chip in the AuditDiffPanel — D-104).
--
-- CONNECTION TO THE NEXT MIGRATION (0008)
-- =======================================
-- This migration creates the table and indexes; migration 0008 immediately
-- follows with `REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM
-- CURRENT_USER` (D-98 layer 2). Together with the ESLint rule banning
-- prisma.auditEvent.update*/delete*/upsert (D-99 layer 1) and the absence
-- of those calls in the codebase, this is the architectural append-only
-- contract. The two migrations MUST be applied together for the contract
-- to hold; both are idempotent so re-running prisma migrate is safe.
--
-- DROPPED INDEX RECREATION
-- ========================
-- `prisma migrate dev` flagged `Medication_name_trgm_idx` (created by
-- migration 0003 via raw SQL — outside Prisma's schema model) as drift
-- and emitted a DROP INDEX statement as the first step. That index is
-- NOT drift — it's a deliberate pg_trgm GIN index that the Phase 2
-- medication search depends on (without it, every ILIKE name search
-- seq-scans ~43k Medication rows). To preserve the original index
-- without introducing an orphaned 0007 → 0008-style ALIGN migration,
-- we drop and recreate the GIN index in this same migration. The
-- recreation matches migration 0003 verbatim.

-- Recreate the Phase 2 trigram GIN index that prisma migrate dev's drift
-- detector dropped above (see header). DROP IF EXISTS + CREATE keeps the
-- migration idempotent on re-run.
DROP INDEX IF EXISTS "Medication_name_trgm_idx";

CREATE INDEX "Medication_name_trgm_idx"
  ON "Medication" USING gin ("name" gin_trgm_ops);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "careUnitId" TEXT,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_id_idx" ON "AuditEvent"("createdAt" DESC, "id");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_createdAt_idx" ON "AuditEvent"("entityType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");
