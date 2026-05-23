import type { FastifyInstance } from 'fastify';
import { suggestTherapeuticClassRoute } from './suggest.js';
import { aiStatusRoute } from './status.js';

/**
 * Phase 6 AI routes barrel.
 *
 * Two endpoints:
 *   - POST /api/ai/suggest-therapeutic-class — apotekare + admin only
 *     (D-15 'ai:suggest'); body is {name, atcCode}; response is
 *     {therapeuticClass, confidence: 'hog'|'medel'|'lag'} (D-111).
 *   - GET  /api/ai/status — all roles read; returns {available: boolean}
 *     reflecting env.ANTHROPIC_API_KEY truthiness (D-107 + D-108).
 *
 * Pattern: mirrors apps/api/src/routes/dashboard/index.ts — single
 * barrel that the app.ts composition awaits. New AI endpoints (future
 * v2 surfaces — predictive restock, chatbot) register here alongside.
 */
export async function aiRoutes(app: FastifyInstance) {
  await app.register(suggestTherapeuticClassRoute);
  await app.register(aiStatusRoute);
}
