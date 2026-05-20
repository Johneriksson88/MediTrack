/**
 * Plan 02 placeholder — `requireSession` is wired only on the routes that
 * need it (`/api/me`, `DELETE /api/auth/session`) instead of as a global
 * plugin. This barrel re-exports the preHandler so future plans (Plan 03)
 * can promote it to a global decoration without churning import paths.
 */
export { requireSession } from '../auth/requireSession.js';
