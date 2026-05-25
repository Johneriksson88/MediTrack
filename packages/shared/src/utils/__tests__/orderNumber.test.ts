import { describe, it, expect } from 'vitest';
import { formatOrderNumber } from '../orderNumber.js';

/**
 * Phase 10 D-157 / D-159 / D-165 — single source of truth for the rendered
 * order-number shape. Format: ORD-YYYY-#### (4-digit zero-padded counter).
 * Padding degrades gracefully past 9999 to 5+ digits without format breakage.
 */
describe('formatOrderNumber', () => {
  it('formats counter=1 with 4-digit zero padding', () => {
    expect(formatOrderNumber({ year: 2026, counter: 1 })).toBe('ORD-2026-0001');
  });

  it('formats counter=42 with 4-digit zero padding', () => {
    expect(formatOrderNumber({ year: 2026, counter: 42 })).toBe('ORD-2026-0042');
  });

  it('formats counter=9999 at the natural 4-digit upper edge', () => {
    expect(formatOrderNumber({ year: 2026, counter: 9999 })).toBe('ORD-2026-9999');
  });

  it('degrades gracefully past 9999 to 5+ digits without format breakage (D-159)', () => {
    expect(formatOrderNumber({ year: 2026, counter: 10000 })).toBe('ORD-2026-10000');
    expect(formatOrderNumber({ year: 2026, counter: 123456 })).toBe('ORD-2026-123456');
  });

  it('surfaces the year segment verbatim across different years', () => {
    expect(formatOrderNumber({ year: 2030, counter: 1 })).toBe('ORD-2030-0001');
    expect(formatOrderNumber({ year: 2025, counter: 7 })).toBe('ORD-2025-0007');
  });
});
