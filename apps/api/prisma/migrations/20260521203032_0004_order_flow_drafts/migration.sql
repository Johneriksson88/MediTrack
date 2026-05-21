-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('utkast', 'skickad', 'bekraftad', 'levererad');

-- NOTE: Prisma auto-generated a DropIndex for "Medication_name_trgm_idx" because
-- the GIN trigram index was created outside of Prisma's managed schema (via custom
-- SQL in 20260521130000_align_medication_name_gin_index_cr02). We retain the DROP
-- so Prisma's migration history is consistent, but immediately recreate the index
-- below so the picker typeahead endpoint (D-59) continues to benefit from it.
-- This mirrors the CR-02 fix intent and keeps the index alive across migrations.

-- DropIndex
DROP INDEX "Medication_name_trgm_idx";

-- RecreateIndex (preserve trgm GIN for picker typeahead D-59, CR-02 fix)
CREATE INDEX "Medication_name_trgm_idx"
  ON "Medication" USING gin ("name" gin_trgm_ops);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "careUnitId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'utkast',
    "submittedAt" TIMESTAMP(3),
    "submittedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "careUnitMedicationId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Order_careUnitId_status_idx" ON "Order"("careUnitId", "status");

-- CreateIndex
CREATE INDEX "Order_careUnitId_createdAt_idx" ON "Order"("careUnitId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_createdByUserId_idx" ON "Order"("createdByUserId");

-- CreateIndex
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

-- CreateIndex
CREATE INDEX "OrderLine_careUnitMedicationId_idx" ON "OrderLine"("careUnitMedicationId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_careUnitId_fkey" FOREIGN KEY ("careUnitId") REFERENCES "CareUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_careUnitMedicationId_fkey" FOREIGN KEY ("careUnitMedicationId") REFERENCES "CareUnitMedication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
