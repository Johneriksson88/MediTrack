import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUpdateOrderLineQuantity } from '@/features/orders/useOrderMutations';

/**
 * Phase 3 D-51 / D-52 / D-60 / UI-SPEC §6 — Quantity stepper widget.
 *
 * Layout: [ − ] [ <input type="number"> ] [ + ]
 * Touch targets: h-11 w-11 (44×44 px) per UI-SPEC §Spacing floor.
 *
 * D-60 interaction contract:
 *   - − / + buttons update local value immediately (optimistic).
 *   - Debounced PATCH fires 250 ms after the last change (D-51).
 *   - Commit also fires on blur if a debounce is in flight.
 *   - Long-press auto-repeats (250 ms initial delay, 100 ms repeat interval).
 *   - − is disabled when value === 1.
 *   - Typing 0 or below is silently coerced to 1 on blur.
 *   - Input min={1} blocks negative values at the browser level.
 *
 * D-52: Quantity updates are optimistic via useUpdateOrderLineQuantity.
 *   On error the hook rolls back the cache + fires a toast.
 *
 * isLocked prop: renders a static <span> of the same width — no buttons,
 *   no input, preserves table column width for Mode B read-only view.
 *
 * e.stopPropagation() on every event handler prevents parent row/card
 *   click handlers (table row click, card click) from firing.
 */

interface QuantityStepperProps {
  value: number;
  orderId: string;
  lineId: string;
  isLocked: boolean;
  min?: number;
}

export function QuantityStepper({
  value,
  orderId,
  lineId,
  isLocked,
  min = 1,
}: QuantityStepperProps) {
  const [localValue, setLocalValue] = useState(value);
  const mutation = useUpdateOrderLineQuantity();

  // Debounce timer ref
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Long-press timer refs
  const longPressInitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressRepeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Re-sync localValue when parent receives a new server-authoritative value.
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  // Cleanup timers on unmount.
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (longPressInitRef.current) clearTimeout(longPressInitRef.current);
      if (longPressRepeatRef.current) clearInterval(longPressRepeatRef.current);
    };
  }, []);

  const commit = useCallback(
    (next: number) => {
      const safe = Math.max(min, next);
      mutation.mutate({ orderId, lineId, quantity: safe });
    },
    [mutation, orderId, lineId, min],
  );

  function scheduledCommit(next: number) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      commit(next);
      debounceRef.current = null;
    }, 250);
  }

  function flushCommit(next: number) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    commit(next);
  }

  function handleDecrement(e: React.MouseEvent | React.PointerEvent) {
    e.stopPropagation();
    const next = Math.max(min, localValue - 1);
    setLocalValue(next);
    scheduledCommit(next);
  }

  function handleIncrement(e: React.MouseEvent | React.PointerEvent) {
    e.stopPropagation();
    const next = localValue + 1;
    setLocalValue(next);
    scheduledCommit(next);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    e.stopPropagation();
    const parsed = parseInt(e.target.value, 10);
    if (!isNaN(parsed)) {
      setLocalValue(parsed);
      scheduledCommit(parsed);
    }
  }

  function handleInputBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.stopPropagation();
    const clamped = Math.max(min, localValue);
    setLocalValue(clamped);
    flushCommit(clamped);
  }

  function startLongPress(step: 1 | -1) {
    longPressInitRef.current = setTimeout(() => {
      longPressRepeatRef.current = setInterval(() => {
        setLocalValue((prev) => {
          const next = step === 1 ? prev + 1 : Math.max(min, prev - 1);
          scheduledCommit(next);
          return next;
        });
      }, 100);
    }, 250);
  }

  function stopLongPress() {
    if (longPressInitRef.current) {
      clearTimeout(longPressInitRef.current);
      longPressInitRef.current = null;
    }
    if (longPressRepeatRef.current) {
      clearInterval(longPressRepeatRef.current);
      longPressRepeatRef.current = null;
      // WR-03: flush the held value on pointer-up so the trailing debounce
      // installed by the last scheduledCommit in the interval callback can't
      // fire against an unmounted component (mode-B transition, route nav).
      // Mirrors handleInputBlur's flushCommit pattern.
      flushCommit(localValue);
    }
  }

  // Locked mode: render a static span with the same width footprint.
  if (isLocked) {
    return (
      <span
        className="inline-flex h-11 w-[calc(4.5rem+2*2.75rem)] items-center justify-center text-sm font-semibold"
        aria-label="Antal"
      >
        {localValue}
      </span>
    );
  }

  return (
    <div
      className="inline-flex items-center"
      onKeyDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Decrement button */}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11 rounded-r-none border-r-0"
        aria-label="Minska antal"
        disabled={localValue <= min}
        onPointerDown={(e) => {
          e.stopPropagation();
          startLongPress(-1);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          stopLongPress();
        }}
        onPointerCancel={(e) => {
          e.stopPropagation();
          stopLongPress();
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          stopLongPress();
        }}
        onClick={handleDecrement}
      >
        −
      </Button>

      {/* Quantity input */}
      <Input
        type="number"
        inputMode="numeric"
        min={min}
        step={1}
        value={localValue}
        aria-label="Antal"
        className="h-11 w-16 rounded-none text-center text-sm font-semibold [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        onChange={handleInputChange}
        onBlur={handleInputBlur}
        onClick={(e) => e.stopPropagation()}
        onFocus={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation();
        }}
      />

      {/* Increment button */}
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11 rounded-l-none border-l-0"
        aria-label="Öka antal"
        onPointerDown={(e) => {
          e.stopPropagation();
          startLongPress(1);
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
          stopLongPress();
        }}
        onPointerCancel={(e) => {
          e.stopPropagation();
          stopLongPress();
        }}
        onPointerLeave={(e) => {
          e.stopPropagation();
          stopLongPress();
        }}
        onClick={handleIncrement}
      >
        +
      </Button>
    </div>
  );
}
