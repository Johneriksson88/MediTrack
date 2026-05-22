-- Phase 4 D-84 — Add confirm/deliver actor columns to Order.
-- Migration: 0006_order_confirm_deliver
-- All four columns default to NULL (additive, no backfill needed for existing rows).

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "confirmedAt" TIMESTAMP(3),
ADD COLUMN "confirmedByUserId" TEXT,
ADD COLUMN "deliveredAt" TIMESTAMP(3),
ADD COLUMN "deliveredByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_confirmedByUserId_fkey" FOREIGN KEY ("confirmedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveredByUserId_fkey" FOREIGN KEY ("deliveredByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
