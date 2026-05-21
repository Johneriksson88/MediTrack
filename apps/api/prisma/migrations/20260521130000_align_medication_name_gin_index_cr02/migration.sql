-- CR-02 fix: align the trigram GIN index on Medication.name with the
-- query path Prisma actually emits.
--
-- The original Phase 2 migration (20260521000000_medication_catalog) created
--   CREATE INDEX "Medication_name_lower_trgm_idx"
--     ON "Medication" USING gin (lower("name") gin_trgm_ops);
--
-- But Prisma's `{ name: { contains: q, mode: 'insensitive' } }` (in
-- medication.service.ts listMedicationsForUnit / searchGlobalMedications)
-- emits
--   WHERE "name" ILIKE '%q%'
-- with the bare column on the LHS — not lower("name"). The planner won't
-- pick a functional index on lower("name") for that predicate, so every
-- name search degrades to a sequential scan over ~43k Medication rows.
--
-- pg_trgm's gin_trgm_ops operator class supports ILIKE natively (the
-- trigram matching is case-insensitive against the indexed column), so
-- the right index for Prisma's emitted SQL is a plain-column GIN trgm
-- index — no lower() wrapper. Renaming alongside the change so future
-- diffs make the alignment explicit.

DROP INDEX IF EXISTS "Medication_name_lower_trgm_idx";

CREATE INDEX "Medication_name_trgm_idx"
  ON "Medication" USING gin ("name" gin_trgm_ops);
