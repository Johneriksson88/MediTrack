import { describe, it, expect } from 'vitest';
import {
  THERAPEUTIC_CLASSES,
  THERAPEUTIC_CLASS_LABELS,
  therapeuticClassEnum,
} from '@meditrack/shared';

/**
 * Phase 6 Plan 02 — Nyquist coverage of the shared therapeutic-class
 * vocabulary (D-113 / D-114 / Warning 6).
 *
 * The plan calls for these assertions to live in
 * `packages/shared/src/constants/__tests__/therapeuticClass.test.ts`, but
 * the @meditrack/shared package has no vitest install (its package.json
 * has only zod + typescript; the existing shared contract tests all live
 * here under apps/api/test/contracts.*.test.ts per the established
 * codebase pattern — see contracts.medicationListQuery.test.ts and
 * contracts.medicationSearchQuery.test.ts). Co-locating with the existing
 * contract test suite avoids spinning up a parallel vitest config inside
 * @meditrack/shared for four assertions.
 *
 * The four assertions form a Nyquist sample of the enum's invariants:
 *  1. Cardinality — the union is exactly the 14 ATC level-1 groups.
 *  2. Parse-success — therapeuticClassEnum accepts a valid letter.
 *  3. Parse-failure — therapeuticClassEnum rejects an out-of-enum letter.
 *  4. Label-key-set — THERAPEUTIC_CLASS_LABELS covers every code (no
 *     missing, no extra).
 *
 * If any test breaks because of a drift in the enum, every downstream
 * consumer (LakemedelFilter combobox, dashboard contract, MedicationSheet
 * Plan-03 AI affordance) is also broken — failing here gives a single
 * focused signal instead of a fan-out of FE/BE errors.
 */
describe('therapeuticClass constants', () => {
  it('THERAPEUTIC_CLASSES has exactly 14 ATC level-1 entries (D-113)', () => {
    expect(THERAPEUTIC_CLASSES).toHaveLength(14);
  });

  it('therapeuticClassEnum accepts a valid letter', () => {
    expect(() => therapeuticClassEnum.parse('N')).not.toThrow();
  });

  it('therapeuticClassEnum rejects an out-of-enum letter', () => {
    expect(() => therapeuticClassEnum.parse('X')).toThrow();
  });

  it('THERAPEUTIC_CLASS_LABELS covers every code (no missing, no extra)', () => {
    expect(Object.keys(THERAPEUTIC_CLASS_LABELS).sort()).toEqual(
      [...THERAPEUTIC_CLASSES].sort(),
    );
  });
});
