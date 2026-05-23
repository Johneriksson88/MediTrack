import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { aiSuggestionRequest, aiSuggestionResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import {
  isAvailable,
  suggestTherapeuticClass,
} from '../../services/aiCategorization.service.js';
import { AiUnavailableError } from '../../plugins/errorHandler.js';

/**
 * POST /api/ai/suggest-therapeutic-class — fetch an AI categorization
 * suggestion for a {name, atcCode} input pair.
 *
 * D-15 preHandler ordering: requireSession first, requirePermission second.
 * D-15 permission gate: 'ai:suggest' → apotekare + admin (sjuksköterska 403).
 * D-107: route-level isAvailable() check fires before the service call so
 *   the 503 ai_unavailable envelope is emitted without instantiating the
 *   Anthropic client (saves the cost of a network call we can't make).
 *
 * D-111: response wire shape is `aiSuggestionResponse`
 *   ({therapeuticClass, confidence: 'hog'|'medel'|'lag'}). Bucketing of
 *   the raw LLM confidence float happens server-side inside the service.
 *
 * D-112: 5s timeout via AbortController inside the service → throws
 *   AiTimeoutError → errorHandlerPlugin maps to 504 ai_timeout.
 *
 * TODO post-Phase-6 (T-06-15 mitigation): add per-user rate-limit
 *   (~30/min) to bound LLM cost in adversarial scenarios. For the v1
 *   demo with apotekare + admin restricted to ~2 seed accounts the
 *   residual risk is acceptable; the README documents this rationale.
 */
export async function suggestTherapeuticClassRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/ai/suggest-therapeutic-class',
    {
      preHandler: [requireSession, requirePermission('ai:suggest')],
      schema: {
        body: aiSuggestionRequest,
        response: { 200: aiSuggestionResponse },
      },
    },
    async (req) => {
      if (!isAvailable()) throw new AiUnavailableError();
      return suggestTherapeuticClass(req.body);
    },
  );
}
