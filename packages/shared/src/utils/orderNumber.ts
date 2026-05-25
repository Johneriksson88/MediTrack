/**
 * Phase 10 D-157 / D-165 — single source of truth for the rendered
 * order-number shape. Format: ORD-YYYY-#### (4-digit zero-padded counter).
 * Used by BE serialization (toOrderResponse, toOrderListItem,
 * toDashboardOrderRow) and FE display (OrdersTable, DraftsTable,
 * ComposeOrderPage H1, DashboardOrdersCard, SubmitConfirmationBanner).
 *
 * Counter widening past 9999 degrades gracefully to 5+ digits without
 * format breakage (D-159) — the padStart minimum is 4, not a cap.
 */
export function formatOrderNumber(input: {
  year: number;
  counter: number;
}): string {
  return `ORD-${input.year}-${String(input.counter).padStart(4, '0')}`;
}
