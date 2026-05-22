-- Phase 3 WR-01 fix: DB-level CHECK constraint on OrderLine.quantity.
--
-- The orderLineResponse Zod contract declares quantity: z.number().int().positive().
-- The original migration (0004) deliberately omitted a DB check, deferring the
-- guarantee to the Zod boundary at the submit endpoint. WR-01 shows this is
-- insufficient: any path that writes the OrderLine row directly (a future
-- maintenance script, a Phase 4 cron, a Prisma update bypassing the route
-- layer, or the test suite's own quantity=0 poisoning trick) can put the row
-- into a state where GET /api/orders/:id fails its response serializer with
-- a 500 — because the response schema asserts positive() and the loaded row
-- is 0. Adding the check at the DB makes the contract drift-proof.
--
-- A CHECK constraint matches the contract's intent exactly (quantity > 0),
-- giving us DB-level integrity without loosening the Zod schema. Phase 4
-- may legitimately need to represent a cancelled line (quantity = 0) — at
-- that point this constraint will be relaxed alongside the contract.

ALTER TABLE "OrderLine"
  ADD CONSTRAINT "OrderLine_quantity_positive_check"
  CHECK ("quantity" > 0);
