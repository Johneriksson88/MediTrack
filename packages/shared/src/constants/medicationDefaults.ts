/**
 * Phase 2 D-40 / STK-03 — default lowStockThreshold heuristic by medication form.
 *
 * Consumed by:
 *   - FE: pre-fills the Tröskel input in the add/edit Sheet when the user
 *     selects a medication from the typeahead (UI-SPEC §6a).
 *   - BE: validation fallback if the FE somehow omits the field (defensive;
 *     the FE always sends it for correctly-wired clients).
 *   - Seed script: `derive()` uses this to generate realistic thresholds for
 *     all 43 538 CareUnitMedication rows.
 *
 * Tiers (D-40):
 *   5  — injection/infusion/lösning/spray (parenteral, low-volume dispensing)
 *   20 — tablett/kapsel/dragerad (oral solids, high-volume, large stock kept)
 *   3  — salva/kräm/gel (topical, low unit count)
 *   10 — fallback for anything else (Övriga, granulat, depotplåster, etc.)
 *
 * Pattern: mirrors orderStatus.ts constants structure.
 * The function (not a plain Record) is required because NPL form strings are
 * free-text with many variants — prefix/substring matching is necessary.
 */

const TIER_INJECTION = 5;
const TIER_TOPICAL = 3;
const TIER_ORAL_SOLID = 20;
const FALLBACK_THRESHOLD = 10;

/**
 * Returns a sensible default lowStockThreshold for the given medication form.
 * Case-insensitive substring matching against NPL form strings (D-40, STK-03).
 *
 * @example
 * defaultLowStockThreshold('Injektionsvätska, lösning') // 5
 * defaultLowStockThreshold('Filmdragerad tablett')       // 20
 * defaultLowStockThreshold('Salva')                      // 3
 * defaultLowStockThreshold('Granulat')                   // 10
 */
export function defaultLowStockThreshold(form: string): number {
  const f = form.toLowerCase();
  if (/injekt|infus|lösning|spray/.test(f)) return TIER_INJECTION;
  if (/salva|kräm|gel/.test(f)) return TIER_TOPICAL;
  if (/tablett|kapsel|dragerad/.test(f)) return TIER_ORAL_SOLID;
  return FALLBACK_THRESHOLD;
}
