import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';
import {
  THERAPEUTIC_CLASSES,
  llmToolUseSchema,
  type AiSuggestionRequest,
  type AiSuggestionResponse,
} from '@meditrack/shared';
import { AiTimeoutError, AiUnavailableError } from '../plugins/errorHandler.js';

/**
 * Phase 6 D-106 / D-16 EXCEPTION — single-seam LLM service satisfying
 * ROADMAP SC #4 ("LLM call is isolated behind a single service interface
 * so swapping providers — or mocking in tests — is one change in one file").
 *
 * # D-16 EXCEPTION — per-medication, NOT per-vårdenhet
 *
 * Every other service file in this repo takes careUnitId as the FIRST arg
 * (D-16 / Pattern D). aiCategorization.service.ts is the DOCUMENTED
 * EXCEPTION: classification is a property of the MOLECULE, not of the
 * vårdenhet that stocks it — paracetamol is N (Nervsystemet) everywhere,
 * regardless of which unit asks. Passing careUnitId here would either be
 * ignored (confusing) or scope the LLM call (wrong; the LLM has no
 * vårdenhet context).
 *
 * The two routes that consume this file (suggest + status) gate on
 * `requireSession` + (suggest only) `requirePermission('ai:suggest')`; the
 * caller's careUnitId is irrelevant to the LLM call itself but still
 * present in the `req.user` context for any future audit or rate-limit
 * extension.
 *
 * # D-107 — ANTHROPIC_API_KEY is OPTIONAL
 *
 * env.ANTHROPIC_API_KEY is a z.string().optional() — no `.min(1)`.
 * `isAvailable()` is the source of truth for whether the AI affordance
 * fires. When the key is undefined or empty, both routes degrade
 * gracefully: GET /api/ai/status returns `{available: false}` and
 * POST /api/ai/suggest-therapeutic-class throws AiUnavailableError (503).
 * The FE conditional render via useAiAvailability hides the "Hämta
 * AI-förslag" button entirely (D-108).
 *
 * # D-111 — confidence bucketing happens HERE, not in the wire schema
 *
 * The Anthropic tool_use input_schema declares `confidence: number 0..1`.
 * The LLM returns a float; this service buckets to a discrete BAND per
 * D-111 (>= 0.85 → hog, >= 0.6 → medel, < 0.6 → lag) BEFORE returning
 * the wire shape. Rationale: an LLM saying "92%" is theater, not
 * measurement; the band is the honesty signal that lands well in
 * interview review.
 *
 * The validator for the raw shape is `llmToolUseSchema` (exported from
 * @meditrack/shared). The wire shape is `aiSuggestionResponse`.
 *
 * # D-112 — 5s AbortController; overridable to ~50ms via env for vitest
 *
 * Latency budget is 3s p95, 5s hard timeout via AbortController. On abort,
 * we throw AiTimeoutError → errorHandlerPlugin maps to 504 ai_timeout.
 * Test 3 in apps/api/test/aiCategorization.integration.test.ts asserts the
 * real abort fires by mocking the Anthropic SDK constructor — Warning 11
 * mitigation: the SDK-layer mock returns a Promise that resolves only on
 * `signal.abort`, exercising the actual AbortController path in <200ms
 * wall time (via process.env.AI_TIMEOUT_MS='50').
 *
 * NOTE: env.AI_TIMEOUT_MS is NOT part of the env.ts Zod schema — it is a
 * test-only knob read directly from process.env. Production reads the
 * 5000ms default. Documented inline below.
 *
 * # D-15 — apotekare + admin only (route-level)
 *
 * The 'ai:suggest' permission key (apotekare + admin) is enforced at the
 * route boundary via requirePermission('ai:suggest'). sjuksköterska
 * receives 403 from POST /api/ai/suggest-therapeutic-class. GET
 * /api/ai/status is requireSession-only — all roles can read the
 * available boolean (T-06-19: accept).
 *
 * # AI-01 + AI-02 — REQ-IDs satisfied by this seam
 *
 * - AI-01: structured suggestion via single LLM call with the wire shape
 *   {therapeuticClass, confidence: band}.
 * - AI-02: accept-or-override-by-enum-bucket flow lives in the FE
 *   (MedicationSheet AI block); this service supplies the suggestion.
 *   D-113 reframing — the override path picks a different enum bucket
 *   from TherapeuticClassCombobox, NOT free text.
 */

// ---------------------------------------------------------------------------
// Module-private knobs
// ---------------------------------------------------------------------------

/**
 * D-112 / Warning 11 — overridable timeout. Defaults to 5000 ms in
 * production. Vitest sets `process.env.AI_TIMEOUT_MS = '50'` BEFORE
 * importing the service so Test 3 (timeout) resolves in <200ms wall
 * time without the suite waiting 5 seconds.
 *
 * Read at module load. Tests that need to flip the timeout must do so
 * BEFORE importing this module (or use vi.resetModules() + a re-import).
 */
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 5000);

/**
 * Confidence-band bucketing per D-111. The LLM returns a float; the band
 * is the wire shape. >= 0.85 = hog, >= 0.6 = medel, < 0.6 = lag.
 */
function bucketConfidence(
  raw: number,
): AiSuggestionResponse['confidence'] {
  if (raw >= 0.85) return 'hog';
  if (raw >= 0.6) return 'medel';
  return 'lag';
}

/**
 * Anthropic tool_use schema constraining the LLM to one of the 14 valid
 * therapeutic class codes + a 0..1 confidence float. T-06-13 first line:
 * even a fully-coerced prompt cannot produce out-of-enum data via the
 * tool_use mechanism. llmToolUseSchema.parse() is the SECOND line.
 */
const classifyMedicationTool = {
  name: 'classify_medication',
  description:
    'Classify a medication into one of the 14 WHO ATC level-1 anatomical groups.',
  input_schema: {
    type: 'object' as const,
    properties: {
      therapeuticClass: {
        type: 'string',
        enum: [...THERAPEUTIC_CLASSES],
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
      },
    },
    required: ['therapeuticClass', 'confidence'],
  },
};

const SYSTEM_PROMPT =
  'Du är en klinisk farmakologisk assistent. Du klassificerar läkemedel enligt WHO ATC nivå 1 (anatomisk grupp).';

function buildUserMessage(input: AiSuggestionRequest): string {
  return (
    'Klassificera följande läkemedel. Namn: "' +
    input.name +
    '". ATC-kod: "' +
    input.atcCode +
    '". Returnera exakt en kategori från listan: A, B, C, D, G, H, J, L, M, N, P, R, S, V. Inkludera även din säkerhet (0..1).'
  );
}

// ---------------------------------------------------------------------------
// Public surface — the single seam (D-106 / SC #4)
// ---------------------------------------------------------------------------

/**
 * D-107 / D-108 — single source of truth for "is the AI affordance live?".
 * Drives both the FE conditional render (via /api/ai/status) and the
 * service-internal defensive check inside suggestTherapeuticClass.
 *
 * Returns true only when env.ANTHROPIC_API_KEY is set AND non-empty.
 */
export function isAvailable(): boolean {
  return env.ANTHROPIC_API_KEY !== undefined && env.ANTHROPIC_API_KEY.length > 0;
}

/**
 * Phase 6 AI-01 / D-106 — primary categorization seam.
 *
 * Sends a constrained tool_use request to Anthropic Claude Haiku 4.5
 * with a 5-second AbortController (overridable via env.AI_TIMEOUT_MS for
 * vitest). Validates the raw tool_use.input with llmToolUseSchema,
 * buckets the confidence float to a band per D-111, returns the wire
 * shape.
 *
 * Throws:
 *   - AiUnavailableError if isAvailable() flipped to false between the
 *     route check and the call (race condition; the FE check normally
 *     covers this).
 *   - AiTimeoutError if the AbortController fires before the LLM
 *     responds (504 ai_timeout). ALSO thrown if the response is missing
 *     the tool_use block — schema-violation surfaced as timeout for now;
 *     a v2 could add ai_schema_violation.
 *   - ZodError if the tool_use.input violates llmToolUseSchema (the LLM
 *     ignored its own input_schema). Propagates → 500 internal_error;
 *     this is a server-side bug, not a user error.
 */
export async function suggestTherapeuticClass(
  input: AiSuggestionRequest,
): Promise<AiSuggestionResponse> {
  // Defensive second-layer check; the route also checks isAvailable().
  if (!isAvailable()) throw new AiUnavailableError();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY! });
    const response = await client.messages.create(
      {
        model: 'claude-haiku-4-5',
        max_tokens: 256,
        system: SYSTEM_PROMPT,
        tools: [classifyMedicationTool],
        tool_choice: { type: 'tool', name: 'classify_medication' },
        messages: [{ role: 'user', content: buildUserMessage(input) }],
      },
      { signal: controller.signal },
    );

    // Find the tool_use block. tool_choice forces it to exist; the guard
    // is defensive (schema-violation surfaced as timeout for v1).
    const toolUse = response.content.find((b) => b.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') {
      throw new AiTimeoutError();
    }

    // Validate the raw float-shape; out-of-shape or out-of-range responses
    // throw a ZodError which propagates → 500 (LLM violated its own
    // tool schema; server-side bug, not user error). T-06-17 second line.
    const raw = llmToolUseSchema.parse(toolUse.input);

    return {
      therapeuticClass: raw.therapeuticClass,
      confidence: bucketConfidence(raw.confidence),
    };
  } catch (err) {
    // AbortController → DOMException 'AbortError' OR the SDK's own
    // APIUserAbortError class. Either path → AiTimeoutError.
    if (
      err instanceof AiTimeoutError ||
      err instanceof AiUnavailableError
    ) {
      throw err;
    }
    if (
      (err as { name?: string })?.name === 'AbortError' ||
      err instanceof Anthropic.APIUserAbortError
    ) {
      throw new AiTimeoutError();
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
