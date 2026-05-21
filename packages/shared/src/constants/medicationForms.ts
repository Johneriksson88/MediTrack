/**
 * Phase 2 D-89 (Claude's discretion) — top-N most frequent medication forms
 * from the Läkemedelsverket NPL CSV (43 538 rows).
 *
 * Derivation: one-time frequency analysis of `local/lakemedel.csv` at
 * plan-execution time. Top-18 forms by count cover ~83% of the catalog.
 * All remaining forms are bucketed under `OVRIGA_FILTER_VALUE` ('Övriga').
 *
 * Pattern: mirrors `packages/shared/src/constants/orderStatus.ts` —
 * `as const` tuple, derived type, exported constants.
 *
 * Anti-pattern: do NOT compute this at runtime from the CSV. Static tuple
 * makes the type narrow so `MedicationForm` is a union of string literals.
 */

export const TOP_MEDICATION_FORMS = [
  'Filmdragerad tablett',
  'Tablett',
  'Kapsel, hård',
  'Injektionsvätska, lösning',
  'Depottablett',
  'Injektionsvätska, lösning i förfylld spruta',
  'Koncentrat till infusionsvätska, lösning',
  'Pulver och vätska till injektionsvätska, lösning',
  'Oral lösning',
  'Kapsel, mjuk',
  'Infusionsvätska, lösning',
  'Inhalationspulver',
  'Injektionsvätska, suspension',
  'Tuggtablett',
  'Munsönderfallande tablett',
  'Kräm',
  'Inhalationspulver, avdelad dos',
  'Ögondroppar, lösning',
] as const;

export type MedicationForm = (typeof TOP_MEDICATION_FORMS)[number];

/**
 * Sentinel value used by the form filter to mean "any form NOT in
 * TOP_MEDICATION_FORMS". The BE service translates this to a Prisma
 * `form: { notIn: [...TOP_MEDICATION_FORMS] }` clause.
 */
export const OVRIGA_FILTER_VALUE = 'Övriga' as const;
