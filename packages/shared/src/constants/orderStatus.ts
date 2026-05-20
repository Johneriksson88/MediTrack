import { z } from 'zod';

/**
 * UI-SPEC §Copy — order status vocabulary locked Phase 1, rendered Phase 3+.
 * Strings live here so all later phases (and shared TS types) import from one place.
 */
export const ORDER_STATUSES = ['utkast', 'skickad', 'bekraftad', 'levererad'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusEnum = z.enum(ORDER_STATUSES);

/** Swedish display labels — used by status chip primitive in Phase 3+. */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  utkast: 'Utkast',
  skickad: 'Skickad',
  bekraftad: 'Bekräftad',
  levererad: 'Levererad',
};
