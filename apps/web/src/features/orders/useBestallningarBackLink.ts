import { useSearchParams } from 'react-router-dom';

/**
 * Phase 9 ORD-10 / D-149..D-156 — back-link resolver for ComposeOrderPage.
 *
 * Single source of truth for constructing the "Tillbaka till beställningar"
 * back-link `to` URL. Reads `?from=<status>` from the current location and
 * resolves to `/bestallningar?status=<status>` so the user lands on the same
 * status tab they came from. Falls back to the caller's `fallbackStatus`
 * (typically `order?.status`) when `?from=` is absent, and to a bare
 * `/bestallningar` (which defaults to Utkast) when nothing else is known.
 *
 * Design decisions:
 *
 *   D-149 — URL search param `?from=<status>` on `/bestallningar/:id`.
 *           Survives refresh, deep-linkable, shareable. Same URL-as-state
 *           convention as Phase 2 D-44 (filter chips) and Phase 4 D-82
 *           (status tabs). Rejected alternatives: react-router
 *           `location.state` (lost on refresh), `navigate(-1)` (fails for
 *           deep links + dashboard card), `sessionStorage` (leaks across
 *           orders).
 *
 *   D-150 — All 4 navigators construct `?from=<status>`:
 *           1. BestallningarPage `handleNyBestallning` → `?from=utkast`
 *              (new draft always lives in Utkast).
 *           2. DraftsTable/DraftsCardList rowClick → `?from=utkast`.
 *           3. OrdersTable/OrdersCardList rowClick → `?from=${tab}`.
 *           4. (Slice C) DashboardOrdersCard row links → `?from=${row.status}`.
 *
 *   D-151 — Helper lives here (`apps/web/src/features/orders/`). All 5
 *           back-link sites in ComposeOrderPage (3 Link + 1 Button-wrapping
 *           -Link + 1 navigate-after-discard) consume this hook so the
 *           validation + URL-building lives in exactly one file with its
 *           own test surface.
 *
 *   D-152 — `?from=` persists across in-page state changes (submit / confirm
 *           / deliver / discard). Nothing strips the param — back-nav still
 *           returns to the original tab even after the order's status moved.
 *
 *   D-153 — Fallback: caller passes `order?.status` so a deep-link to a
 *           Bekräftad order back-navs to the Bekräftade tab — same context
 *           the user would see if they navigated to that tab manually.
 *
 *   D-154 — Fallback recomputes on every render. When `?from=` is absent
 *           and `order.status` changes mid-session (user confirms a Skickad
 *           order → it becomes Bekräftad), the back-link follows the live
 *           status. When `?from=` IS present, it always wins regardless of
 *           `order.status` changes (D-152).
 *
 *   D-155 — Loading + 404 states get the no-fallback path. Hook receives
 *           `fallbackStatus: undefined` and returns `?from=`-if-valid OR
 *           bare `/bestallningar`. Tappable affordance must be there from
 *           the first paint (cold cache loading can be slow).
 *
 *   D-156 — Invalid `?from=` values silently treated as missing. Validated
 *           against the closed `StatusTab` union; unknown values fall
 *           through to `fallbackStatus`/bare. No error toast, no
 *           console.warn — `?from=` is decorative, not security-critical.
 *
 * StatusTab union + `isValidStatus` predicate are duplicated inline from
 * BestallningarPage.tsx (lines 45–52) rather than imported. Per 09-CONTEXT.md
 * `<code_context>` line 213: "smaller surface, no cross-file coupling".
 * Both modules' tests guard the same union; drift would break both.
 *
 * The hook is read-only — `useSearchParams()[0]` only, never `setSearchParams`.
 */

type StatusTab = 'utkast' | 'skickad' | 'bekraftad' | 'levererad' | 'alla';

const VALID_STATUSES = ['utkast', 'skickad', 'bekraftad', 'levererad', 'alla'] as const;

function isValidStatus(s: string): s is StatusTab {
  return (VALID_STATUSES as readonly string[]).includes(s);
}

export interface BackLink {
  to: string;
  label: string;
}

export function useBestallningarBackLink(opts?: { fallbackStatus?: StatusTab }): BackLink {
  const [searchParams] = useSearchParams();
  const raw = searchParams.get('from');
  const fromValid: StatusTab | null = raw && isValidStatus(raw) ? raw : null;
  const resolved: StatusTab | null = fromValid ?? opts?.fallbackStatus ?? null;
  const to = resolved ? `/bestallningar?status=${resolved}` : '/bestallningar';
  return { to, label: 'Tillbaka till beställningar' };
}
