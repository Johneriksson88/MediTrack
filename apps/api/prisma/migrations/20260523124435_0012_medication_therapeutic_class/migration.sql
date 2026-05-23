-- Phase 6 Plan 02 — Therapeutic Class schema (D-113 / D-114 / D-115 / D-117).
--
-- Creates the closed TherapeuticClass Postgres enum (the 14 WHO ATC level-1
-- anatomical groups), adds a nullable column on the global Medication table,
-- and adds a single-column index to power the new /lakemedel filter combobox
-- (AI-03 / D-116) and any future dashboard JOIN over the class column.
--
-- NOTE: this migration was generated via `prisma migrate diff --from-url
-- ... --to-schema-datamodel prisma/schema.prisma --script` because the
-- interactive `prisma migrate dev` could not run in the executor environment.
-- The generated diff included a spurious `DROP INDEX
-- "Medication_name_trgm_idx";` WITHOUT a corresponding recreate. That index
-- is owned by the raw-SQL migration `20260521130000_align_medication_name_
-- gin_index_cr02` (Phase 2 CR-02 follow-up) and is invisible to Prisma's
-- schema diffing — applying the unaltered diff would silently drop the
-- trigram GIN index and degrade `?q=` name search to a sequential scan over
-- ~43k Medication rows. The DROP has been removed by hand; the trigram GIN
-- index continues to power ILIKE %q% name search per CR-02. See the SUMMARY
-- for the verbatim lines that were stripped from the generated diff.

-- CreateEnum
CREATE TYPE "TherapeuticClass" AS ENUM ('A', 'B', 'C', 'D', 'G', 'H', 'J', 'L', 'M', 'N', 'P', 'R', 'S', 'V');

-- NOTE: Phase 6 Plan 02 — `prisma migrate diff` proposed dropping
-- `Medication_name_trgm_idx` because that index is owned by the
-- raw-SQL migration `20260521130000_align_medication_name_gin_index_cr02`
-- (Phase 2 CR-02 follow-up) and is invisible to Prisma's schema diffing.
-- The DROP has been removed; the trigram GIN index continues to power
-- ILIKE %q% name search per CR-02.

-- AlterTable
ALTER TABLE "Medication" ADD COLUMN     "therapeuticClass" "TherapeuticClass";

-- CreateIndex
CREATE INDEX "Medication_therapeuticClass_idx" ON "Medication"("therapeuticClass");
