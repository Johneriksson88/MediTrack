import { describe, it, expect, vi, beforeAll } from 'vitest';
import { orderResponse } from '@meditrack/shared';

/**
 * TDD RED phase — Phase 3 D-55 / D-56 / D-08.
 *
 * Tests for:
 *   1. OrderLockedError class — code, message, optional details.status
 *   2. ValidationFailedError class — code, details.reason
 *   3. orderResponse Zod schema round-trip (happy-path shape)
 *
 * All three groups must FAIL before implementation (RED gate).
 * After implementation they all pass (GREEN gate).
 *
 * Dynamic import pattern: errorHandler.ts imports env.ts (which validates
 * process.env at module load time). We stub env vars before the dynamic
 * import so the module initializes cleanly — same pattern as buildTestApp.ts.
 */

// Stub env vars BEFORE the dynamic import of errorHandler (which triggers env.ts).
vi.stubEnv('NODE_ENV', 'test');
vi.stubEnv('COOKIE_SECRET', 'test-cookie-secret-32-bytes-min-len-xxx');
vi.stubEnv('DATABASE_URL', 'postgres://meditrack:meditrack@localhost:5432/meditrack');

// Dynamic import avoids the hoisting problem — executed after vi.stubEnv above.
let OrderLockedError: typeof import('../src/plugins/errorHandler.js').OrderLockedError;
let ValidationFailedError: typeof import('../src/plugins/errorHandler.js').ValidationFailedError;

beforeAll(async () => {
  const handler = await import('../src/plugins/errorHandler.js');
  OrderLockedError = handler.OrderLockedError;
  ValidationFailedError = handler.ValidationFailedError;
});

// ---------------------------------------------------------------------------
// OrderLockedError (D-55)
// ---------------------------------------------------------------------------

describe('OrderLockedError', () => {
  it('has code = order_locked', () => {
    const err = new OrderLockedError();
    expect(err.code).toBe('order_locked');
  });

  it('has the correct default Swedish message', () => {
    const err = new OrderLockedError();
    expect(err.message).toBe('Beställningen kan inte ändras efter att den skickats.');
  });

  it('is an instance of Error', () => {
    const err = new OrderLockedError();
    expect(err).toBeInstanceOf(Error);
  });

  it('stores optional details.status on the instance', () => {
    const err = new OrderLockedError({ status: 'skickad' });
    expect(err.details?.status).toBe('skickad');
  });

  it('details is undefined when not provided', () => {
    const err = new OrderLockedError();
    expect(err.details).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ValidationFailedError (D-56)
// ---------------------------------------------------------------------------

describe('ValidationFailedError', () => {
  it('has code = validation_failed', () => {
    const err = new ValidationFailedError('Beställningen är tom.', {
      reason: 'empty_order',
    });
    expect(err.code).toBe('validation_failed');
  });

  it('carries details.reason = empty_order', () => {
    const err = new ValidationFailedError('Beställningen är tom.', {
      reason: 'empty_order',
    });
    expect(err.details?.reason).toBe('empty_order');
  });

  it('carries details.reason = invalid_quantity with optional lineId', () => {
    const err = new ValidationFailedError('Ogiltigt antal.', {
      reason: 'invalid_quantity',
      lineId: 'line-abc-123',
    });
    expect(err.details?.reason).toBe('invalid_quantity');
    expect(err.details?.lineId).toBe('line-abc-123');
  });

  it('is an instance of Error', () => {
    const err = new ValidationFailedError('Beställningen är tom.', {
      reason: 'empty_order',
    });
    expect(err).toBeInstanceOf(Error);
  });

  it('stores custom message', () => {
    const err = new ValidationFailedError('Custom message.', {
      reason: 'empty_order',
    });
    expect(err.message).toBe('Custom message.');
  });
});

// ---------------------------------------------------------------------------
// orderResponse contract round-trip (D-08 / D-47 / D-65)
// ---------------------------------------------------------------------------

describe('orderResponse — Zod schema round-trip', () => {
  const sampleOrderLine = {
    id: 'line-01',
    careUnitMedicationId: 'cum-01',
    quantity: 2,
    name: 'Alvedon',
    atcCode: 'N02BE01',
    form: 'Tablett',
    strength: '500 mg',
    currentStock: 10,
    lowStockThreshold: 5,
  };

  const sampleOrder = {
    id: 'order-01',
    careUnitId: 'careunit-01',
    createdByUserId: 'user-01',
    status: 'utkast' as const,
    submittedAt: null,
    submittedByUserId: null,
    // Phase 4 D-84 — confirm/deliver trios; null while in utkast/skickad.
    confirmedAt: null,
    confirmedByUserId: null,
    confirmedBy: null,
    deliveredAt: null,
    deliveredByUserId: null,
    deliveredBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lines: [sampleOrderLine],
    createdBy: { id: 'user-01', name: 'Sara Sjuksköterska' },
    submittedBy: null,
  };

  it('parses a valid utkast order with embedded lines', () => {
    const result = orderResponse.safeParse(sampleOrder);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('utkast');
      expect(result.data.lines).toHaveLength(1);
      expect(result.data.lines[0]?.quantity).toBe(2);
      expect(result.data.submittedBy).toBeNull();
    }
  });

  it('parses a skickad order with submittedAt and submittedBy populated', () => {
    const skickad = {
      ...sampleOrder,
      status: 'skickad' as const,
      submittedAt: new Date().toISOString(),
      submittedByUserId: 'user-02',
      submittedBy: { id: 'user-02', name: 'Anna Apotekare' },
    };
    const result = orderResponse.safeParse(skickad);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.status).toBe('skickad');
      expect(result.data.submittedAt).not.toBeNull();
      expect(result.data.submittedBy?.name).toBe('Anna Apotekare');
    }
  });

  it('rejects an order with an unknown status', () => {
    const bad = { ...sampleOrder, status: 'unknown' };
    const result = orderResponse.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('accepts strength: null on an order line', () => {
    const withNullStrength = {
      ...sampleOrder,
      lines: [{ ...sampleOrderLine, strength: null }],
    };
    const result = orderResponse.safeParse(withNullStrength);
    expect(result.success).toBe(true);
  });
});
