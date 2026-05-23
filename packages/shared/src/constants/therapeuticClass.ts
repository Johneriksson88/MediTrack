import { z } from 'zod';

/**
 * Phase 6 D-113 / D-114 — Therapeutic class vocabulary (the 14 WHO ATC
 * level-1 anatomical groups).
 *
 * Pattern: mirrors orderStatus.ts. The 14 ATC level-1 anatomical groups
 * (D-113) are an international clinical standard since 1976 — the closed
 * enum is the right model for the domain (free-text was rejected in D-113
 * because it would break the AI-03 filter combobox via spelling drift,
 * and "V = Övrigt" already covers the overflow case).
 *
 * D-114 schema-integrity layering: Postgres enum (`TherapeuticClass`) +
 * Prisma enum + the shared TS string union below + the Zod enum below.
 * - The DB rejects any out-of-list value at INSERT/UPDATE.
 * - The Zod enum rejects any non-matching value at the request boundary.
 * - The TS union gives FE label-map exhaustiveness.
 *
 * Swedish labels (THERAPEUTIC_CLASS_LABELS) follow the WHO ATC anatomical
 * group naming verbatim and MUST match 06-CONTEXT.md `<specifics>`
 * character-for-character (including em-dashes and parentheses).
 */
export const THERAPEUTIC_CLASSES = [
  'A',
  'B',
  'C',
  'D',
  'G',
  'H',
  'J',
  'L',
  'M',
  'N',
  'P',
  'R',
  'S',
  'V',
] as const;
export type TherapeuticClass = (typeof THERAPEUTIC_CLASSES)[number];

export const therapeuticClassEnum = z.enum(THERAPEUTIC_CLASSES);

/**
 * Swedish display labels — used by the AiSuggestionChip, the
 * TherapeuticClassCombobox (LakemedelFilter + MedicationSheet), and the
 * audit diff panel label resolver. Verbatim from 06-CONTEXT.md
 * `<specifics>` block.
 */
export const THERAPEUTIC_CLASS_LABELS: Record<TherapeuticClass, string> = {
  A: 'Mag–tarm och ämnesomsättning',
  B: 'Blod och blodbildande organ',
  C: 'Hjärta och kretslopp',
  D: 'Hud',
  G: 'Urin- och könsorgan, sexualhormoner',
  H: 'Hormonsystemet (exkl. könshormoner)',
  J: 'Antiinfektiva för systemiskt bruk',
  L: 'Tumörer och immunmodulering',
  M: 'Muskler och skelett',
  N: 'Nervsystemet',
  P: 'Antiparasitära medel',
  R: 'Andningsorganen',
  S: 'Ögon och öron',
  V: 'Övrigt',
};
