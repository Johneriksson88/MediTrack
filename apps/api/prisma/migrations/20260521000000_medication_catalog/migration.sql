-- CreateEnum
CREATE TYPE "MedicationSource" AS ENUM ('npl', 'user');

-- AlterTable (CareUnit — add relation back-reference, no DDL change needed)
-- Prisma handles this via the relation definition; no column added to CareUnit.

-- CreateTable
CREATE TABLE "Medication" (
    "id" TEXT NOT NULL,
    "nplId" TEXT,
    "name" TEXT NOT NULL,
    "atcCode" TEXT NOT NULL,
    "form" TEXT NOT NULL,
    "strength" TEXT,
    "source" "MedicationSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Medication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareUnitMedication" (
    "id" TEXT NOT NULL,
    "careUnitId" TEXT NOT NULL,
    "medicationId" TEXT NOT NULL,
    "currentStock" INTEGER NOT NULL,
    "lowStockThreshold" INTEGER NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareUnitMedication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Medication_nplId_key" ON "Medication"("nplId");

-- CreateIndex
CREATE INDEX "Medication_atcCode_idx" ON "Medication"("atcCode");

-- CreateIndex
CREATE UNIQUE INDEX "CareUnitMedication_careUnitId_medicationId_key" ON "CareUnitMedication"("careUnitId", "medicationId");

-- CreateIndex
CREATE INDEX "CareUnitMedication_careUnitId_idx" ON "CareUnitMedication"("careUnitId");

-- CreateIndex
CREATE INDEX "CareUnitMedication_deletedAt_idx" ON "CareUnitMedication"("deletedAt");

-- AddForeignKey
ALTER TABLE "CareUnitMedication" ADD CONSTRAINT "CareUnitMedication_careUnitId_fkey" FOREIGN KEY ("careUnitId") REFERENCES "CareUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareUnitMedication" ADD CONSTRAINT "CareUnitMedication_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "Medication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase 2 D-26: enable pg_trgm + GIN index on lower(name) for fast ILIKE search at 43k rows.
-- Without this index, ILIKE '%paracet%' would table-scan 43k rows on every keystroke.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Medication_name_lower_trgm_idx" ON "Medication" USING gin (lower("name") gin_trgm_ops);
