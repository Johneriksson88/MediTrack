import { describe, it, expect } from 'vitest';
import { medicationSearchQuery } from '@meditrack/shared';

/**
 * CR-03 regression — `q` minimum length.
 *
 * Before the CR-03 fix, `q: z.string()` accepted '' as valid. The service
 * applied `name: { contains: '', mode: 'insensitive' }`, which Prisma compiled
 * to `ILIKE '%%'` — a full scan over ~43k Medication rows on every empty-q
 * call. A direct API caller could amplify load by hitting `/api/medications/search?q=`.
 *
 * The fix adds `.min(1)` to `q`. We keep `.min(1)` rather than `.min(2)`
 * because the FE intentionally fires search on a single character (typeahead
 * UX) — the goal is closing the empty-string hole for direct API callers,
 * not constraining FE UX.
 */
describe('medicationSearchQuery — q min length (CR-03 regression)', () => {
  it('accepts a single character (matches FE typeahead UX)', () => {
    const result = medicationSearchQuery.parse({ q: 'a' });
    expect(result.q).toBe('a');
  });

  it('accepts a longer query', () => {
    const result = medicationSearchQuery.parse({ q: 'alvedon' });
    expect(result.q).toBe('alvedon');
  });

  it('rejects an empty string (the CR-03 bug — was previously accepted)', () => {
    const result = medicationSearchQuery.safeParse({ q: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing q', () => {
    const result = medicationSearchQuery.safeParse({});
    expect(result.success).toBe(false);
  });

  it('keeps default limit=20 when only q is provided', () => {
    const result = medicationSearchQuery.parse({ q: 'a' });
    expect(result.limit).toBe(20);
  });
});
