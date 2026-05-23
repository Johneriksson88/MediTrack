import { z } from 'zod';
import {
  therapeuticClassEnum,
  type TherapeuticClass,
} from '../constants/therapeuticClass.js';

/**
 * Phase 6 D-08 / D-106 / D-111 — AI categorization contracts.
 *
 * D-08: Zod schemas in this file are the FE↔BE contract for the AI
 *   categorization API. Both sides import from '@meditrack/shared';
 *   inferred TS types are the canonical shape.
 *
 * Two distinct schemas live here on purpose:
 *
 *   1. `aiSuggestionResponse` — the WIRE shape (FE↔BE contract). Ships a
 *      discrete confidence BAND (`'hog' | 'medel' | 'lag'`). This is what
 *      the route returns and what the FE chip + ConfidenceBadge render.
 *
 *   2. `llmToolUseSchema` — the INTERNAL shape validating the raw
 *      `tool_use.input` returned by the Anthropic Messages API. The LLM
 *      returns confidence as a FLOAT 0..1 per the `tool_use` input_schema;
 *      `aiCategorization.service.ts` buckets the float into the band per
 *      D-111 (>= 0.85 → hog; >= 0.6 → medel; < 0.6 → lag) BEFORE returning
 *      the wire shape. The bucketing happens server-side because an LLM
 *      saying "92%" is theater, not measurement — the band is the honesty
 *      signal that lands well in interview review.
 *
 *   Exporting `llmToolUseSchema` lets the service file import-and-validate
 *   without redefining the shape; downstream FE code never uses this
 *   schema — the wire shape is the FE contract.
 *
 * `aiStatusResponse` powers GET /api/ai/status (D-108 — Claude's-discretion
 * implementation; new lightweight endpoint over widening /me). All three
 * roles can read it so the FE conditional render is uniform across roles.
 *
 * Pattern: mirrors `packages/shared/src/contracts/audit.ts` (schema, then
 * `export type X = z.infer<typeof x>`).
 */

// ---------------------------------------------------------------------------
// Wire shapes — FE↔BE contract (D-08)
// ---------------------------------------------------------------------------

/**
 * Request body for POST /api/ai/suggest-therapeutic-class.
 *
 * Mirrors the `.min(1)` shape of `medicationCreateUserRequest` for name
 * and ATC code so empty strings are rejected at the request boundary.
 * The values flow into the LLM prompt verbatim (see service file).
 */
export const aiSuggestionRequest = z.object({
  name: z.string().min(1),
  atcCode: z.string().min(1),
});
export type AiSuggestionRequest = z.infer<typeof aiSuggestionRequest>;

/**
 * Response body for POST /api/ai/suggest-therapeutic-class on success.
 *
 * `therapeuticClass` is one of the 14 WHO ATC level-1 anatomical groups
 * (D-113); the closed enum is DB-enforced via Postgres TherapeuticClass.
 *
 * `confidence` is the bucketed BAND string (`'hog' | 'medel' | 'lag'`),
 * NOT the raw float. See `llmToolUseSchema` + the service file for the
 * float-to-band bucketing logic (D-111).
 */
export const aiSuggestionResponse = z.object({
  therapeuticClass: therapeuticClassEnum,
  confidence: z.enum(['hog', 'medel', 'lag']),
});
export type AiSuggestionResponse = z.infer<typeof aiSuggestionResponse>;

/**
 * Response body for GET /api/ai/status.
 *
 * `available` reflects whether `env.ANTHROPIC_API_KEY` is set and non-empty
 * at the API process (D-107 + D-108). The FE conditional render of the
 * "Hämta AI-förslag" button reads this value via `useAiAvailability`.
 *
 * All three roles can read the status — the FE check is uniform across
 * roles, and the value (boolean) reveals only env-config posture with no
 * adversarial value in a single-tenant internal tool (T-06-19: accept).
 */
export const aiStatusResponse = z.object({
  available: z.boolean(),
});
export type AiStatusResponse = z.infer<typeof aiStatusResponse>;

// ---------------------------------------------------------------------------
// Internal validator — raw LLM tool_use shape (NOT a wire contract)
// ---------------------------------------------------------------------------

/**
 * Phase 6 D-111 — Validates the RAW `tool_use.input` returned by Anthropic.
 *
 * Distinct from `aiSuggestionResponse` (the WIRE shape) because the LLM
 * returns confidence as a float 0..1 that we bucket server-side into
 * hog/medel/lag before responding. Exported so the service file can
 * import-and-validate without redefining the shape; downstream FE code
 * never uses this — the wire shape is the FE contract.
 *
 * `therapeuticClassEnum` constrains the LLM to one of the 14 valid codes
 * even under prompt-injection (T-06-13 mitigation): the Anthropic
 * tool_use mechanism is the FIRST line (input_schema enum); this Zod
 * parse is the SECOND line, rejecting any shape drift if the LLM
 * misbehaves.
 */
export const llmToolUseSchema = z.object({
  therapeuticClass: therapeuticClassEnum,
  confidence: z.number().min(0).max(1),
});
export type LlmToolUse = z.infer<typeof llmToolUseSchema>;

// Re-export the underlying type so consumers reading just this file
// don't need a second import from `constants/therapeuticClass`.
export type { TherapeuticClass };
