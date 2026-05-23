import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { aiStatusResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { isAvailable } from '../../services/aiCategorization.service.js';

/**
 * GET /api/ai/status — reports whether the AI affordance is configured.
 *
 * D-108 — Claude's-discretion implementation: a new lightweight endpoint
 * over widening /me. Decouples the AI availability check from the auth
 * shape and lets the FE refetch availability without re-pulling /me
 * (admin could rotate the API key without restarting the api container).
 *
 * D-15 preHandler: requireSession ONLY — no requirePermission gate. All
 * three roles (sjukskoterska / apotekare / admin) read this so the FE
 * conditional render is uniform across roles. The boolean reveals only
 * env-config posture (no key value, no provider name, no model version
 * — T-06-19: accept).
 *
 * D-107 + D-108: `available` reflects env.ANTHROPIC_API_KEY truthiness
 * (via isAvailable() in the service file). When false, the FE hides the
 * "Hämta AI-förslag" button entirely; dashboard banner + medication
 * catalog + filter combobox all work unchanged.
 */
export async function aiStatusRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/ai/status',
    {
      preHandler: [requireSession],
      schema: { response: { 200: aiStatusResponse } },
    },
    async () => ({ available: isAvailable() }),
  );
}
