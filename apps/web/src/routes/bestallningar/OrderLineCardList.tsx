import type { OrderLineResponse } from '@meditrack/shared';
import { OrderLineCard } from './OrderLineCard';

/**
 * Phase 3 UI-SPEC §7 — Thin barrel wrapping OrderLineCard for the mobile view (<md).
 *
 * Rendered alongside OrderLineTable:
 *   <OrderLineTable  className="hidden md:block" … />
 *   <OrderLineCardList className="block md:hidden" … />
 *
 * Empty state: single centered paragraph with D-70 copy.
 * isLocked prop: passed through to each OrderLineCard for Mode B read-only.
 */

interface OrderLineCardListProps {
  items: OrderLineResponse[];
  orderId: string;
  isLocked: boolean;
  className?: string;
}

export function OrderLineCardList({ items, orderId, isLocked, className }: OrderLineCardListProps) {
  if (items.length === 0) {
    return (
      <div className={`py-8 text-sm text-muted-foreground text-center ${className ?? ''}`}>
        Lägg till läkemedel för att börja.
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${className ?? ''}`}>
      {items.map((line) => (
        <OrderLineCard key={line.id} line={line} orderId={orderId} isLocked={isLocked} />
      ))}
    </div>
  );
}
