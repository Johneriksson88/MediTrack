import { describe, it, expect } from 'vitest';
import { medicationListQuery } from '@meditrack/shared';

/**
 * CR-01 regression — `belowThreshold` parsing.
 *
 * Before the CR-01 fix, `belowThreshold: z.coerce.boolean().optional()` made
 * the literal string 'false' parse as `true` (because z.coerce.boolean() is
 * just `Boolean(value)` under the hood, and `Boolean("false") === true`).
 * That meant a direct API call `GET /api/medications?belowThreshold=false`
 * silently returned a below-threshold-filtered list.
 *
 * The fix uses `z.enum(['true','false']).transform(v => v === 'true').optional()`,
 * which:
 *   - parses 'true' → true
 *   - parses 'false' → false
 *   - rejects any other string with a ZodError (400 validation_failed at the API)
 *   - accepts absent → undefined
 */
describe('medicationListQuery — belowThreshold (CR-01 regression)', () => {
  it('parses "true" as true', () => {
    const result = medicationListQuery.parse({ belowThreshold: 'true' });
    expect(result.belowThreshold).toBe(true);
  });

  it('parses "false" as false (the CR-01 bug — was previously true)', () => {
    const result = medicationListQuery.parse({ belowThreshold: 'false' });
    expect(result.belowThreshold).toBe(false);
  });

  it('treats absent as undefined', () => {
    const result = medicationListQuery.parse({});
    expect(result.belowThreshold).toBeUndefined();
  });

  it('rejects "1" (numeric truthiness no longer accepted)', () => {
    const result = medicationListQuery.safeParse({ belowThreshold: '1' });
    expect(result.success).toBe(false);
  });

  it('rejects "yes" (only literal "true"/"false" allowed)', () => {
    const result = medicationListQuery.safeParse({ belowThreshold: 'yes' });
    expect(result.success).toBe(false);
  });

  it('rejects empty string', () => {
    const result = medicationListQuery.safeParse({ belowThreshold: '' });
    expect(result.success).toBe(false);
  });
});
