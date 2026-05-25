-- Phase 10 ORD-11 / D-160 / D-163 / D-165 — order numbers.
--
-- WHAT THIS DOES
-- ==============
-- Adds per-(careUnit, year) monotonic order numbers to the Order table.
-- New persisted columns (orderNumberCounter, orderNumberYear) carry the
-- structured identity; the human-facing display string `ORD-YYYY-####`
-- is derived in shared TS code (packages/shared/src/utils/orderNumber.ts)
-- and is NOT stored — see D-165.
--
-- Every existing Order row is backfilled by a single-pass ROW_NUMBER()
-- CTE partitioned by (careUnitId, EXTRACT(YEAR FROM createdAt)) and
-- ordered by (createdAt ASC, id ASC) so re-running on the same input
-- produces the same numbering (D-163, T-10-07 mitigation). A counter
-- table seeded to MAX(orderNumberCounter)+1 per (careUnit, year) lets
-- the runtime mint path stay a pure UPDATE in the common case.
--
-- WHY STRUCTURED COLUMNS + DERIVED DISPLAY
-- ========================================
-- D-165 — separating storage (Int + Int) from rendering (`ORD-YYYY-####`
-- in shared TS) lets a future format change (e.g. width bump past 9999
-- to 5+ digits per D-159) be a one-file edit in @meditrack/shared, NOT
-- a migration. The composite @@unique([careUnitId, orderNumberYear,
-- orderNumberCounter]) enforces uniqueness over the structured columns,
-- which is equivalent semantics to a single formatted-string UNIQUE.
--
-- WHY UPSERT-WITH-ON-CONFLICT FOR RUNTIME MINT
-- ============================================
-- D-160 / D-164 — the createDraftOrder service issues `UPDATE
-- "OrderNumberCounter" SET nextValue = nextValue + 1 ... RETURNING ...`
-- first (common case, counter row pre-seeded by this migration), then
-- falls back to `INSERT ... ON CONFLICT (careUnitId, year) DO UPDATE
-- ... RETURNING ...` for the first-ever order of a brand-new (careUnit,
-- year) pair. Both run inside the same $transaction as the Order insert,
-- so Postgres takes a row-level write lock on the counter row for the
-- duration of the tx — exactly the same primitive Phase 4 uses for
-- stock (STK-02, D-79). Two concurrent inserts on the same (careUnit,
-- year) serialize: neither sees the other's number; no duplicates,
-- no gaps. This is the §6 "two nurses ordering simultaneously" answer,
-- reused.
--
-- WHY BACKFILL ORDERED BY createdAt ASC
-- =====================================
-- D-163 / T-10-07 — natural narrative ("first order ever placed at a
-- unit in a given year gets 0001") and deterministic on re-run. id ASC
-- is the secondary key to tiebreak same-millisecond rows.
--
-- WHY NO BEGIN/COMMIT WRAPPER
-- ===========================
-- Prisma migrate runs each migration.sql as a single transaction; an
-- explicit BEGIN/COMMIT would double-wrap and break prisma migrate dev.

-- Step 1: add columns nullable so existing rows survive the ALTER.
ALTER TABLE "Order" ADD COLUMN "orderNumberCounter" INT;
ALTER TABLE "Order" ADD COLUMN "orderNumberYear" INT;

-- Step 2: create the counter table that owns the monotonic state.
CREATE TABLE "OrderNumberCounter" (
  "careUnitId" TEXT NOT NULL,
  "year" INT NOT NULL,
  "nextValue" INT NOT NULL,
  PRIMARY KEY ("careUnitId", "year"),
  FOREIGN KEY ("careUnitId") REFERENCES "CareUnit" ("id") ON DELETE CASCADE
);

-- Step 3: backfill every existing Order row with a per-(careUnit, year)
-- ROW_NUMBER, ordered by createdAt ASC with id ASC as deterministic
-- tiebreaker.
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "careUnitId", EXTRACT(YEAR FROM "createdAt")
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn,
         EXTRACT(YEAR FROM "createdAt")::int AS year
  FROM "Order"
)
UPDATE "Order" o
SET "orderNumberCounter" = numbered.rn,
    "orderNumberYear" = numbered.year
FROM numbered
WHERE o.id = numbered.id;

-- Step 4: seed the counter table from the backfilled orders. The seeded
-- nextValue is MAX(orderNumberCounter) + 1 so the next mint via UPDATE
-- consumes that value and increments by one.
INSERT INTO "OrderNumberCounter" ("careUnitId", "year", "nextValue")
SELECT "careUnitId", "orderNumberYear", MAX("orderNumberCounter") + 1
FROM "Order"
GROUP BY "careUnitId", "orderNumberYear";

-- Step 5: enforce NOT NULL on both columns (backfill is complete) plus
-- the composite UNIQUE constraint over (careUnitId, orderNumberYear,
-- orderNumberCounter) that gives the structured columns the same
-- semantics a single formatted-string UNIQUE would carry.
ALTER TABLE "Order"
  ALTER COLUMN "orderNumberCounter" SET NOT NULL,
  ALTER COLUMN "orderNumberYear" SET NOT NULL,
  ADD CONSTRAINT "Order_careUnitId_orderNumberYear_orderNumberCounter_key"
    UNIQUE ("careUnitId", "orderNumberYear", "orderNumberCounter");
