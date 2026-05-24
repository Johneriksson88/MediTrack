# Phase 9: Dashboard Depth + Back-Nav — Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 18 (10 new + 8 modified)
**Analogs found:** 18 / 18

All Phase 9 files have a direct in-repo analog (verified by Read). No "no-analog" rows. The Phase 6 dashboard surface and the Phase 4 BestallningarPage URL-state surface are the two structural ancestors; every new file mirrors one of them.

## File Classification

| New / Modified File | New? | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `packages/shared/src/contracts/dashboard.ts` | M | contract | request-response | `packages/shared/src/contracts/dashboard.ts` (existing `lowStockItem` / `lowStockListResponse`) | exact — same file, additive |
| `packages/shared/src/index.ts` | M | barrel | n/a | self (existing dashboard.ts re-export, lines 91–97) | exact |
| `apps/api/src/services/dashboard.service.ts` | M | service | request-response (DB read) | `listLowStockForUnit` in the same file (lines 56–97) | exact — sibling function in same file |
| `apps/api/src/routes/dashboard/orders.ts` | N | route handler | request-response | `apps/api/src/routes/dashboard/lowStock.ts` | exact — same dir, same shape |
| `apps/api/src/routes/dashboard/index.ts` | M | barrel | n/a | self (existing `lowStockRoute` registration) | exact |
| `apps/api/test/dashboard.orders.integration.test.ts` | N | test (integration) | request-response | `apps/api/test/dashboard.integration.test.ts` (NOTE: filename is `dashboard.integration.test.ts`, NOT `dashboard.lowStock.integration.test.ts` — CONTEXT.md's reference name does not exist on disk) | exact — sibling integration test, same dir |
| `apps/web/src/features/dashboard/useDashboardOrdersQuery.ts` | N | hook (query) | request-response | `apps/web/src/features/dashboard/useLowStockQuery.ts` | exact — sibling hook |
| `apps/web/src/features/orders/useOrderMutations.ts` | M | hook (mutations) | event-driven (cache invalidation) | self (existing 5 mutations each already invalidate `['dashboard', 'low-stock']` and `['orders', …]`) | exact — additive one-liner per mutation |
| `apps/web/src/features/orders/useBestallningarBackLink.ts` | N | hook (URL helper) | URL-as-state read | `BestallningarPage.tsx` lines 60–95 (`useSearchParams` + `isValidStatus` predicate inline at lines 45–52) | role-match — first dedicated URL-helper hook |
| `apps/web/src/features/orders/__tests__/useBestallningarBackLink.test.tsx` | N | test (hook) | URL-as-state read | `apps/web/test/useAuth.test.tsx` (renderHook + wrapper pattern) | role-match |
| `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx` | N | component | request-response read | `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx` | exact — sibling component |
| `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx` | N | test (component) | request-response | `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx` | exact — sibling test |
| `apps/web/src/routes/dashboard/DashboardPage.tsx` | M | route page | composition | self (currently mounts `<DashboardLowStockCard />` only) | exact — additive |
| `apps/web/src/routes/bestallningar/BestallningarPage.tsx` | M | route page | URL-as-state write | self (`handleNyBestallning` lines 79–82, row-click callbacks lines 225/230) | exact — additive `?from=` |
| `apps/web/src/routes/bestallningar/OrdersTable.tsx` | M | component | navigate emitter | self (lines 135, 139 — `navigate(\`/bestallningar/${row.id}\`)`); `tab` prop already at line 25, 41, 92 | exact — additive `?from=` |
| `apps/web/src/routes/bestallningar/OrdersCardList.tsx` | M | component | navigate emitter | self (line 88 — `navigate(\`/bestallningar/${row.id}\`)`); `tab` prop already at line 30, 73 | exact — additive `?from=` |
| `apps/web/src/routes/bestallningar/DraftsTable.tsx` / `DraftsCardList.tsx` | M (parent only) | component | navigate emitter (via callback) | self — the *callback owners* (BestallningarPage lines 225 + 230) build the URL; these two files unchanged structurally | role-match — parent edit, not child |
| `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` | M | route page | URL-as-state read (back-link) | self (3 inline `<Link to="/bestallningar">` at lines 96, 124–133 [two adjacent], 161 + post-discard `navigate('/bestallningar')` at line 413) | exact — site-of-edit is itself |
| `apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx` | M | test (component) | URL-as-state read | self (existing `'Tillbaka till beställningar'` assertion at line 236) | exact — extend |
| `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx` | M | test (component) | URL-as-state write | self (existing `'/bestallningar/new-order-id-789'` assertion at line 184) | exact — extend |

> Heads-up to the planner: CONTEXT.md mentions `apps/api/test/dashboard.lowStock.integration.test.ts`. **That filename does not exist.** The actual file is `apps/api/test/dashboard.integration.test.ts`. The new test should be named `apps/api/test/dashboard.orders.integration.test.ts` (CONTEXT.md's target name is correct; only the analog reference name was off).

---

## Pattern Assignments

### `packages/shared/src/contracts/dashboard.ts` (M, contract, additive)

**Analog:** the existing module (Phase 6). Same file — extend, do not rewrite.

**Existing imports + section banner pattern** (lines 1–3):
```ts
import { z } from 'zod';
import { therapeuticClassEnum } from '../constants/therapeuticClass.js';
```
Add (Phase 9):
```ts
import { orderStatusEnum } from '../constants/orderStatus.js';
import { roleEnum } from '../constants/roles.js';
```

**Existing schema-then-type pattern** (lines 50–68, 79–83) — every `z.object({…})` schema is followed by `export type X = z.infer<typeof x>`. Phase 9 additions MUST follow the same shape (per `<specifics>` of CONTEXT.md, schemas are: `dashboardOrderRow`, `nurseSubview`, `pharmacistSubview` (internal, no export needed), `dashboardOrdersResponse`).

**Discriminator value** — `roleEnum` literal members are `'apotekare' | 'sjukskoterska' | 'admin'` from `packages/shared/src/constants/roles.ts:8`:
```ts
export const ROLES = ['apotekare', 'sjukskoterska', 'admin'] as const;
```
Nurse subview uses `z.literal('sjukskoterska')`; pharmacist subview uses `z.enum(['apotekare', 'admin'])` — exactly as CONTEXT.md `<specifics>` block locks in.

**Doc-block conventions** — existing block (lines 4–28) names the D-IDs the contract is sourced from. Phase 9's additions should add a new "Phase 9 D-141 / D-142" header above the new exports.

---

### `packages/shared/src/index.ts` (M, barrel)

**Existing dashboard re-export block** (lines 91–97):
```ts
// Dashboard contracts — Phase 6 D-08 / D-120 / NTF-01 (FE↔BE dashboard low-stock API)
export {
  lowStockItem,
  type LowStockItem,
  lowStockListResponse,
  type LowStockListResponse,
} from './contracts/dashboard.js';
```
Phase 9 widens this block to also re-export `dashboardOrderRow`, `DashboardOrderRow`, `dashboardOrdersResponse`, `DashboardOrdersResponse`. Mirror the comma + type re-export style — every `z.object` export is paired with `type X`.

---

### `apps/api/src/services/dashboard.service.ts` (M, service, request-response)

**Analog:** `listLowStockForUnit` in the same file (lines 56–97).

**Imports pattern** (lines 1–2):
```ts
import { prisma } from '../db/client.js';
import type { LowStockListResponse, TherapeuticClass } from '@meditrack/shared';
```
Phase 9: add `DashboardOrdersResponse` (and `Role`) to the import.

**careUnitId-first arg pattern** (line 56–58) — single inviolable convention (D-16):
```ts
export async function listLowStockForUnit(
  careUnitId: string,
): Promise<LowStockListResponse> {
```
Phase 9's `listDashboardOrdersForUser` signature MUST be `(careUnitId: string, userId: string, role: Role): Promise<DashboardOrdersResponse>` — `careUnitId` FIRST, no exceptions.

**Prisma include + mapper pattern** — sibling `order.service.ts:listOrdersForUnit` (lines 220–246) is the closer structural sibling for Phase 9's service body (it queries `prisma.order.findMany` with `lines: { select: { id, quantity } }` + the actor includes, then maps via `toOrderListItem`). Copy this query shape but:
- Add `where: { status: 'utkast', createdByUserId: userId }` for the nurse `egnaUtkast` branch.
- Add `where: { status: { not: 'utkast' } }` for the nurse `recentHistory` branch.
- Add `where: { status: 'skickad' }` / `where: { status: 'bekraftad' }` for the pharmacist branches.
- `take: 5, orderBy: { createdAt: 'desc' }` on every branch.
- Compute `count` as a separate `prisma.order.count(…)` with the same `where` (rows are capped at 5 but count is the total).

**Mapping to `DashboardOrderRow`** — reuse the field subset from `toOrderListItem` (`order.service.ts:135–157`) but project ONLY:
```ts
{ id, status, lineCount, totalQuantity, createdBy: { id, name }, createdAt: row.createdAt.toISOString() }
```
This is `OrderListItem` minus the actor fields (submittedBy/confirmedBy/deliveredBy) — exactly the subset CONTEXT.md `<specifics>` locks in.

**Doc-block style** (lines 4–44 of dashboard.service.ts) — every service function carries a D-ID-annotated docstring. Phase 9's new function needs a "Phase 9 D-141 / D-142 — listDashboardOrdersForUser" header citing D-16 (careUnitId-first), D-141 (dedicated endpoint), D-142 (role-aware discriminated payload), D-143 (vårdenhet-wide recentHistory, not own-only), D-144 (top-5 DESC by createdAt).

---

### `apps/api/src/routes/dashboard/orders.ts` (N, route handler)

**Analog:** `apps/api/src/routes/dashboard/lowStock.ts` (entire file, 36 lines).

**Full file shape to mirror** (lines 1–35):
```ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { lowStockListResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { listLowStockForUnit } from '../../services/dashboard.service.js';

export async function lowStockRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/dashboard/low-stock',
    {
      preHandler: [requireSession],
      schema: { response: { 200: lowStockListResponse } },
    },
    async (req) => listLowStockForUnit(req.user!.careUnitId),
  );
}
```

Phase 9 verbatim transformation:
- File name: `orders.ts`. Exported function name: `ordersRoute`.
- Import: `dashboardOrdersResponse` + `listDashboardOrdersForUser`.
- Path: `'/api/dashboard/orders'`.
- preHandler: `[requireSession]` only — NO `requirePermission` (mirrors D-15 / D-120 — every role sees the dashboard; `order:read` is implicit via session).
- Handler body: `async (req) => listDashboardOrdersForUser(req.user!.careUnitId, req.user!.id, req.user!.role)`. Verify the field names on `req.user` (the lowStock route uses `req.user!.careUnitId`; check that `id` and `role` are also decorated by `requireSession`).
- Response schema: `{ response: { 200: dashboardOrdersResponse } }`. Because it's a discriminated union, Fastify will validate the response on serialize — a service bug returning the wrong shape will surface in tests.

---

### `apps/api/src/routes/dashboard/index.ts` (M, barrel)

**Existing pattern** (lines 1–16):
```ts
import type { FastifyInstance } from 'fastify';
import { lowStockRoute } from './lowStock.js';

export async function dashboardRoutes(app: FastifyInstance) {
  await app.register(lowStockRoute);
}
```
Phase 9: add `import { ordersRoute } from './orders.js';` and a second `await app.register(ordersRoute);` line. Keep ordering low-stock first to match the dashboard layout (D-146 keeps low-stock left/top).

---

### `apps/api/test/dashboard.orders.integration.test.ts` (N, integration test)

**Analog:** `apps/api/test/dashboard.integration.test.ts` (the actual on-disk file).

**Test-harness boilerplate** (lines 1–56):
```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { lowStockListResponse } from '@meditrack/shared';
import {
  TEST_APOTEKARE,
  TEST_SJUKSKOTERSKA,
  buildTestApp,
  createEmptyOrder,
  ensureAllRolesSeeded,
  loginAs,
  prisma,
  progressOrderToBekraftad,
  resetSessions,
} from './helpers/buildTestApp.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildTestApp();
  await ensureAllRolesSeeded();
});
beforeEach(async () => { await resetSessions(); });
afterAll(async () => { await app.close(); await prisma.$disconnect(); });
```
Phase 9 reuses this verbatim — same helpers, same lifecycle. Import `dashboardOrdersResponse` instead of `lowStockListResponse` for Zod-parsing the response in each test.

**Test-body pattern** — every test in the analog (lines 59–281) follows:
1. `loginAs(app, TEST_APOTEKARE)` or `TEST_SJUKSKOTERSKA` → cookie.
2. `app.inject({ method: 'GET', url: …, headers: { cookie } })`.
3. `expect(res.statusCode).toBe(200)`.
4. `dashboardOrdersResponse.parse(res.json())` — Zod-parse against the contract; failed parse asserts the wire shape.
5. Per-scenario expectations.

**Required Phase 9 scenarios** (per CONTEXT.md test surface, line 58):
- Test 1 (nurse role payload shape): login as TEST_SJUKSKOTERSKA, parse response, assert `role === 'sjukskoterska'`, assert `egnaUtkast.rows.length <= 5`, assert every row in `egnaUtkast` has `status === 'utkast'` AND `createdBy.id === TEST_SJUKSKOTERSKA.userId`, assert `recentHistory.length <= 5` AND every row's status `!== 'utkast'`.
- Test 2 (apotekare role payload shape): login as TEST_APOTEKARE, parse, assert `role === 'apotekare'`, assert `skickad.rows` all `status === 'skickad'`, `bekraftad.rows` all `status === 'bekraftad'`.
- Test 3 (cross-vårdenhet isolation, T-06-01): mirror the analog's Test 2 (lines 112–208) — second-vårdenhet user seeds an order, gets DISJOINT row set. Reuse the same setup-teardown ceremony (find-or-create careUnit, hashPassword, prisma.session.deleteMany cleanup) from lines 127–145.
- Test 4 (top-5 limit): create ≥6 utkast orders for nurse, assert `egnaUtkast.rows.length === 5` AND `egnaUtkast.count >= 6`.
- Test 5 (DESC by createdAt): create 3 orders with controlled timestamps, assert rows arrive newest-first.

**Idempotent cleanup pattern** (lines 127–145) — Phase 9 tests that seed extra orders MUST clean them up in a `finally`/post-assert block, mirroring the careUnit/user cleanup ceremony.

---

### `apps/web/src/features/dashboard/useDashboardOrdersQuery.ts` (N, hook)

**Analog:** `apps/web/src/features/dashboard/useLowStockQuery.ts` (entire file).

**Full structure to mirror** (lines 1–59):
```ts
import { useQuery } from '@tanstack/react-query';
import type { LowStockListResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

export const LOW_STOCK_QUERY_OPTIONS = {
  queryKey: ['dashboard', 'low-stock'] as const,
  refetchOnWindowFocus: true as const,
  refetchInterval: 30_000 as const,
};

export function useLowStockQuery() {
  return useQuery<LowStockListResponse, ApiError>({
    queryKey: LOW_STOCK_QUERY_OPTIONS.queryKey,
    queryFn: () => fetchJson<LowStockListResponse>('/api/dashboard/low-stock'),
    refetchOnWindowFocus: LOW_STOCK_QUERY_OPTIONS.refetchOnWindowFocus,
    refetchInterval: LOW_STOCK_QUERY_OPTIONS.refetchInterval,
  });
}
```

Phase 9 transformation — verbatim shape:
- Named const `DASHBOARD_ORDERS_QUERY_OPTIONS` with `queryKey: ['dashboard', 'orders'] as const`, `refetchOnWindowFocus: true as const`, `refetchInterval: 30_000 as const`.
- Hook `useDashboardOrdersQuery()` returning `useQuery<DashboardOrdersResponse, ApiError>`.
- Endpoint URL: `/api/dashboard/orders`.

**Doc-block pattern** (lines 4–33 of the analog) — extensive D-ID citation. Phase 9's docblock cites D-141 / D-142 / D-148 (three-layer refresh, mirrors D-119) — same prose density as the analog.

**Testability-without-mount pattern** (lines 35–50 of the analog) — the named export `LOW_STOCK_QUERY_OPTIONS` is asserted directly in DashboardLowStockCard.test.tsx Test 5 (line 194 of that test). Phase 9's DashboardOrdersCard.test.tsx Test N asserts against `DASHBOARD_ORDERS_QUERY_OPTIONS` the same way.

---

### `apps/web/src/features/orders/useOrderMutations.ts` (M, additive one-liners)

**Analog:** itself. The existing five mutations already each have their `['orders', …]` invalidation block, and `useDeliverOrder` (line 366) already has the `['dashboard', 'low-stock']` invalidation.

**Pattern to mirror — verbatim addition** (line 365–366, `useDeliverOrder`):
```ts
// Phase 6 D-119 / NTF-02: dashboard banner uses its own dedicated cache key (D-120).
void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] });
```

Phase 9 — adjacent line addition (one per mutation):
```ts
// Phase 9 D-148: dashboard orders card uses its own dedicated cache key (D-141).
void queryClient.invalidateQueries({ queryKey: ['dashboard', 'orders'] });
```

**Exact insertion sites** (paired alongside the existing `['orders', …]` invalidations — do NOT replace, ADD next to):
- `useCreateDraftOrder.onSuccess` (line 55–57) — after the `['orders', { status: 'utkast' }]` invalidation.
- `useSubmitOrder.onSuccess` (line 251–256) — after the `['orders', { status: 'utkast' }]` invalidation.
- `useConfirmOrder.onSuccess` (line 294–301) — after the `['orders', { status: 'bekraftad' }]` invalidation, before `toast.success('Bekräftad')`.
- `useDeliverOrder.onSuccess` (line 357–367) — after the existing `['dashboard', 'low-stock']` line. So `useDeliverOrder` ends up with BOTH dashboard keys invalidated; both are present in the final code.
- `useDiscardOrder.onSuccess` (line 424–429) — after the `['orders', { status: 'utkast' }]` invalidation, before `queryClient.removeQueries`.

**Doc-block update** — every `useDeliverOrder` doc comment block already lists `D-119 / D-120 / NTF-02`. Phase 9 adds a single line `Phase 9 D-148: also invalidates ['dashboard', 'orders']` to each of the 5 affected mutations' doc-blocks.

---

### `apps/web/src/features/orders/useBestallningarBackLink.ts` (N, hook)

**Analog:** the StatusTab union + `isValidStatus` predicate in `BestallningarPage.tsx` (lines 45–52):
```ts
type StatusTab = 'utkast' | 'skickad' | 'bekraftad' | 'levererad' | 'alla';
const VALID_STATUSES: StatusTab[] = ['utkast', 'skickad', 'bekraftad', 'levererad', 'alla'];

function isValidStatus(s: string): s is StatusTab {
  return VALID_STATUSES.includes(s as StatusTab);
}
```
And `useSearchParams` read pattern (lines 60–62):
```ts
const [searchParams, setSearchParams] = useSearchParams();
const rawStatus = searchParams.get('status') ?? 'utkast';
const status: StatusTab = isValidStatus(rawStatus) ? rawStatus : 'utkast';
```

**Locked signature from CONTEXT.md `<specifics>`** — copy the signature block from CONTEXT.md verbatim (lines 290–314 of CONTEXT.md). Three things to note:
1. Re-declare `StatusTab` + `VALID_STATUSES` + `isValidStatus` inline (do NOT cross-import from BestallningarPage — see `<code_context>` line 213's "smaller surface, no cross-file coupling" guidance).
2. Read with `useSearchParams()[0]` only — the hook is read-only; never call `setSearchParams`.
3. Return `{ to: string, label: string }` — label is hard-coded `'Tillbaka till beställningar'` (the exact existing copy in ComposeOrderPage at lines 100, 127, 134, 166).

**Resolution priority (D-151 / D-152 / D-153 / D-156)** — copy verbatim from CONTEXT.md specifics:
```ts
const raw = searchParams.get('from');
const fromValid: StatusTab | null = raw && isValidStatus(raw) ? raw : null;
const resolved: StatusTab | null = fromValid ?? opts?.fallbackStatus ?? null;
const to = resolved ? `/bestallningar?status=${resolved}` : '/bestallningar';
```

---

### `apps/web/src/features/orders/__tests__/useBestallningarBackLink.test.tsx` (N, hook test)

**Analog:** `apps/web/test/useAuth.test.tsx` (lines 1–60) for the `renderHook` + wrapper pattern; `MemoryRouter` wrapper from `apps/web/test/helpers/renderWithProviders.tsx` line 45 for the router context.

**Test setup pattern** — combine `renderHook` from `@testing-library/react` with a `<MemoryRouter initialEntries={[...]}>` wrapper:
```ts
import { renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useBestallningarBackLink } from '../useBestallningarBackLink';

function makeWrapper(initialPath: string) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>;
  };
}
```

**Required scenarios (per CONTEXT.md test surface, line 60)**:
- Test 1: `?from=skickad` → `to === '/bestallningar?status=skickad'`.
- Test 2: `?from=garbage` → invalid silently dropped → falls through to fallback / bare.
- Test 3: no `?from=`, `fallbackStatus: 'bekraftad'` → `to === '/bestallningar?status=bekraftad'`.
- Test 4: no `?from=`, no `fallbackStatus` → `to === '/bestallningar'`.
- Test 5: rerender with new `fallbackStatus` value (D-154 — recomputes on every render) → `to` updates.
- Test 6: each of `utkast/skickad/bekraftad/levererad/alla` accepted as `?from=`.
- Every test: `result.current.label === 'Tillbaka till beställningar'`.

---

### `apps/web/src/routes/dashboard/DashboardOrdersCard.tsx` (N, component)

**Analog:** `DashboardLowStockCard.tsx` (entire file, 138 lines).

**Imports pattern** (lines 1–13):
```ts
import { CheckCircle2 } from 'lucide-react';
import { useLowStockQuery } from '@/features/dashboard/useLowStockQuery';
import { LowStockBadge } from '@/components/LowStockBadge';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
```
Phase 9 mirror:
```ts
import { CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboardOrdersQuery } from '@/features/dashboard/useDashboardOrdersQuery';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
```
NO `LowStockBadge` import (different domain); ADD `Link` from `react-router-dom` (section headers + row links).

**Four-state branching** (lines 50–105) — copy the conditional skeleton:
```ts
if (isLoading) {
  return (
    <Card className="w-full max-w-2xl">
      <CardContent className="p-4 space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </CardContent>
    </Card>
  );
}

if (isError) {
  return (
    <Card className="w-full max-w-2xl">
      <CardContent className="p-4">
        <Alert variant="destructive">
          <AlertDescription>
            Kunde inte hämta lagernivåer — försök igen om en stund.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}
```
Phase 9: same shape; replace error copy with `'Kunde inte hämta beställningar — försök igen om en stund.'`. Loading skeleton: per CONTEXT.md `<specifics>` line 140, render TWO stacked sections each with a header skeleton + 3 row skeletons (denser than the low-stock card because there are two sections).

**Celebratory empty state pattern (lines 84–104)** — copy block:
```tsx
<div className="flex items-center justify-center flex-1 p-8">
  <Card className="max-w-md w-full p-8 text-center shadow-sm" role="status">
    <CheckCircle2
      className="h-12 w-12 text-emerald-600 mx-auto mb-4"
      aria-hidden="true"
    />
    <h2 className="text-xl font-semibold mb-2">{heading}</h2>
    <p className="text-sm text-muted-foreground">{sub}</p>
  </Card>
</div>
```
Phase 9 — two role-conditional empty messages (CONTEXT.md `<specifics>` lines 33–36):
- Nurse, when `egnaUtkast.count === 0 && recentHistory.length === 0`: heading `Inga aktiva beställningar.` / sub `Skapa en ny beställning när ni behöver fylla på.`.
- Apotekare/admin, when `skickad.count === 0 && bekraftad.count === 0`: heading `Inga beställningar väntar på åtgärd.` / sub `Allt hängt klart — inget att bekräfta eller leverera just nu.`.
- KEEP `text-emerald-600` on the icon and `role="status"` on the Card. DO NOT use `<EmptyStateCard>` (uses slate-400 — per the analog's line 36 comment and CONTEXT.md `<code_context>` line 209).

**Row layout pattern** (lines 117–133):
```tsx
<div
  key={row.careUnitMedicationId}
  role="listitem"
  className="flex items-center justify-between py-2 min-h-[44px]"
>
  <span className="text-sm font-normal truncate max-w-[180px]">{row.name}</span>
  <div className="flex items-center gap-2">
    <span className="text-xs text-muted-foreground">
      {row.currentStock} / {row.lowStockThreshold}
    </span>
    <LowStockBadge />
  </div>
</div>
```
Phase 9 row mirror — same `min-h-[44px]`, same `role="listitem"`, same `flex items-center justify-between py-2`, but each row is a `<Link to={`/bestallningar/${row.id}?from=${row.status}`}>` rather than a plain div. Row content per CONTEXT.md `<specifics>` line 247–260 — `id` substring (or short label), `formatRelative(row.createdAt)`, `{row.lineCount} rader · totalt {row.totalQuantity}` subtitle, ChevronRight on the right. NO LowStockBadge (different domain).

**Container/list role pattern** (lines 113–116):
```tsx
<CardContent className="max-h-80 overflow-y-auto" role="list" aria-label="Läkemedel under tröskel">
```
Phase 9: each of the two stacked sections is its own `role="list"` container with `aria-label` set to the Swedish section heading (`Egna utkast` / `Senaste beställningar` / `Väntar på bekräftelse` / `Väntar på leverans`). The outer Card holds both lists. Do NOT add the `max-h-80 overflow-y-auto` — at top-5 each section is already capped.

**CardHeader + CardTitle + CardDescription pattern** (lines 108–111):
```tsx
<CardHeader>
  <CardTitle>Läkemedel under tröskel</CardTitle>
  <CardDescription>totalt {total} under tröskel</CardDescription>
</CardHeader>
```
Phase 9: per section, wrap the heading in a `<Link to="/bestallningar?status=…">` (CONTEXT.md `<specifics>` line 138 — section header is the link, not a separate "View all"). CardDescription shows the count, e.g. `totalt 3`. Refer to the table in `<specifics>` line 334 for the (status → href) map per role.

**Discriminated-union branching at the FE** — `if (data.role === 'sjukskoterska') {…}` vs `if (data.role === 'apotekare' || data.role === 'admin') {…}`. The Zod union narrows TS perfectly when discriminated on the literal `role` field.

---

### `apps/web/src/routes/dashboard/__tests__/DashboardOrdersCard.test.tsx` (N, component test)

**Analog:** `DashboardLowStockCard.test.tsx` (entire 200-line file).

**Mock hook pattern** (lines 33–43):
```ts
vi.mock('@/features/dashboard/useLowStockQuery', async () => {
  const actual = await vi.importActual<typeof import('@/features/dashboard/useLowStockQuery')>(
    '@/features/dashboard/useLowStockQuery',
  );
  return { ...actual, useLowStockQuery: vi.fn() };
});

import { useLowStockQuery, LOW_STOCK_QUERY_OPTIONS } from '@/features/dashboard/useLowStockQuery';
const mockUseLowStockQuery = vi.mocked(useLowStockQuery);
```
Phase 9: identical pattern targeting `useDashboardOrdersQuery` + `DASHBOARD_ORDERS_QUERY_OPTIONS`. The `actual` preserve is essential — Test N asserts against the real constants.

**`mockQuery` helper** (lines 53–58):
```ts
function mockQuery(state: Partial<UseQueryResult<LowStockListResponse, ApiError>>) {
  mockUseLowStockQuery.mockReturnValue(state as UseQueryResult<LowStockListResponse, ApiError>);
}
```
Reuse pattern with `DashboardOrdersResponse` type substitution.

**Required scenarios** (per CONTEXT.md test surface, line 59):
- Test 1 (nurse subview rendering): mock `{ role: 'sjukskoterska', egnaUtkast: {…}, recentHistory: [...] }`; assert both section headings render; assert row count.
- Test 2 (apotekare subview rendering): mock `{ role: 'apotekare', skickad: {…}, bekraftad: {…} }`; assert both section headings render.
- Test 3 (nurse empty state): mock 0+0; assert `'Inga aktiva beställningar.'` heading + emerald icon (mirror Test 1 of the analog at lines 65–87).
- Test 4 (apotekare empty state): mock 0+0; assert `'Inga beställningar väntar på åtgärd.'` heading.
- Test 5 (row `?from=` correctness): assert at least one row's anchor has `href` containing `?from=skickad` (or whatever status the mocked row carries).
- Test 6 (section header link correctness): assert section heading anchors point to `/bestallningar?status=skickad` etc.
- Test 7 (loading): mirror Test 3 of the analog (animate-pulse count).
- Test 8 (error): mirror Test 4 of the analog (role="alert" with the Swedish copy).
- Test 9 (query config contract): mirror Test 5 of the analog (lines 194–199):
  ```ts
  expect(DASHBOARD_ORDERS_QUERY_OPTIONS.refetchOnWindowFocus).toBe(true);
  expect(DASHBOARD_ORDERS_QUERY_OPTIONS.refetchInterval).toBe(30_000);
  expect(DASHBOARD_ORDERS_QUERY_OPTIONS.queryKey).toEqual(['dashboard', 'orders']);
  ```

**`renderWithProviders` reuse** — same import path from the analog (line 7): `import { renderWithProviders } from '../../../../test/helpers/renderWithProviders';`. The helper wraps in MemoryRouter, so `<Link>` works without extra setup.

---

### `apps/web/src/routes/dashboard/DashboardPage.tsx` (M, route page)

**Analog:** itself (the current 18-line file).

**Existing body** (lines 15–17):
```ts
export function DashboardPage() {
  return <DashboardLowStockCard />;
}
```

**Phase 9 transformation — locked from CONTEXT.md `<specifics>` lines 322–329**:
```ts
export function DashboardPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto p-4 md:p-6 lg:p-8">
      <DashboardLowStockCard />
      <DashboardOrdersCard />
    </div>
  );
}
```

**Doc-block update** — current doc-block (lines 1–14) cites D-118 (single component, no h1, no chrome). Phase 9 widens to cite D-145 (grid grid-cols-1 md:grid-cols-2), D-146 (low-stock first, orders second). Keep the "no h1" statement — CardTitles inside the cards remain the page's primary headings.

**Padding/container pattern** — `p-4 md:p-6 lg:p-8` is the project's established mobile-first padding (used in `BestallningarPage.tsx:113`, `ComposeOrderPage.tsx:92, 121, 282, 318, 361`). `max-w-5xl mx-auto` is new at this route but consistent with the lightweight bias (cap at sensible width, not stretch-to-infinity).

---

### `apps/web/src/routes/bestallningar/BestallningarPage.tsx` (M, route page)

**Analog:** itself.

**`handleNyBestallning` site to edit** (lines 79–82):
```ts
async function handleNyBestallning() {
  const response = await createMutation.mutateAsync();
  navigate(`/bestallningar/${response.id}`);
}
```
Phase 9 — append `?from=utkast` (D-150 #3, plus `<discretion>` line 143's "ALWAYS use ?from=utkast regardless of which tab the user is on"):
```ts
navigate(`/bestallningar/${response.id}?from=utkast`);
```

**DraftsTable + DraftsCardList row-click sites** (lines 225 + 230):
```tsx
<DraftsTable items={rows} onRowClick={(row) => navigate(`/bestallningar/${row.id}`)} … />
<DraftsCardList items={rows} onCardClick={(row) => navigate(`/bestallningar/${row.id}`)} … />
```
Phase 9 — append `?from=utkast` (D-150 #1 — drafts only render on the Utkast tab):
```tsx
onRowClick={(row) => navigate(`/bestallningar/${row.id}?from=utkast`)}
onCardClick={(row) => navigate(`/bestallningar/${row.id}?from=utkast`)}
```

**OrdersTable + OrdersCardList — NOT edited at this layer** — they own their own navigate. See next two file entries.

---

### `apps/web/src/routes/bestallningar/OrdersTable.tsx` (M, component)

**Analog:** itself.

**`tab` prop already plumbed** (lines 30–32, 92, 135, 139):
```ts
type NonUtkastTab = 'skickad' | 'bekraftad' | 'levererad' | 'alla';
interface OrdersTableProps {
  rows: OrderListItem[];
  tab: NonUtkastTab;
  className?: string;
}
// …
onClick={() => navigate(`/bestallningar/${row.id}`)}
// …
navigate(`/bestallningar/${row.id}`);  // keyboard handler at line 139
```

**Phase 9 transformation — D-150 #2** — both navigation calls (line 135 + line 139):
```ts
onClick={() => navigate(`/bestallningar/${row.id}?from=${tab}`)}
// …
navigate(`/bestallningar/${row.id}?from=${tab}`);
```
The `tab` prop already carries the active tab value (`'skickad' | 'bekraftad' | 'levererad' | 'alla'`) — exactly the StatusTab subset the back-link hook accepts.

---

### `apps/web/src/routes/bestallningar/OrdersCardList.tsx` (M, component)

**Analog:** itself.

**Same edit shape** as `OrdersTable.tsx` — line 88's navigate becomes `navigate(`/bestallningar/${row.id}?from=${tab}`)`. `tab` is already at line 30 (prop) and line 73 (destructure).

---

### `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` (M, route page)

**Analog:** itself. Four sites to rewire — three `<Link to="/bestallningar">` + one `navigate('/bestallningar')`.

**Site 1 — loading-state back link** (lines 95–101):
```tsx
<Link
  to="/bestallningar"
  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
>
  <ChevronLeft className="h-4 w-4" />
  Tillbaka till beställningar
</Link>
```

**Site 2 — 404-state back link** (lines 123–129) — identical structure, identical `to="/bestallningar"`.

**Site 3 — 404-state "Tillbaka till beställningar" Button** (lines 133–135):
```tsx
<Link to="/bestallningar">
  <Button variant="link">Tillbaka till beställningar</Button>
</Link>
```

**Site 4 — header back link** (lines 161–167) — identical structure to Sites 1 and 2.

**Site 5 — post-discard navigation** (line 413, inside `DiscardDraftDialog` `onConfirm`):
```ts
navigate('/bestallningar');
```

**Phase 9 transformation** — at the top of the component (alongside other hooks at lines 57–68):
```ts
const order = orderQuery.data;
const backLink = useBestallningarBackLink({ fallbackStatus: order?.status });
```
Then replace each site:
- Sites 1, 2, 4 — `<Link to={backLink.to} className="…">…{backLink.label}</Link>`. KEEP the ChevronLeft icon and class names verbatim. Replace the literal `'Tillbaka till beställningar'` text with `{backLink.label}`.
- Site 3 — `<Link to={backLink.to}><Button variant="link">{backLink.label}</Button></Link>`.
- Site 5 — `navigate(backLink.to);` (immediately before `await discardMutation.mutateAsync(...)`).

**Loading + 404 work because** — `order` is `undefined` in those branches → hook receives `fallbackStatus: undefined` → returns `?from=`-if-valid OR bare `/bestallningar` (D-155).

**Existing test assertion to preserve** — `ComposeOrderPage.test.tsx` line 236 asserts `expect(screen.getByText('Tillbaka till beställningar')).toBeInTheDocument();`. Since `backLink.label` is hard-coded to that exact string, the assertion still passes after the rewire — NO test-side change required for the existing assertion.

---

### `apps/web/src/routes/bestallningar/__tests__/ComposeOrderPage.test.tsx` (M, test, extend)

**Analog:** itself. Existing 'Tillbaka till beställningar' assertion at line 236 (Test "Mode A renders correctly").

**New scenarios** (per CONTEXT.md test surface, line 61):
- Test N+1 (loading state honors `?from=`): mount with `initialPath: '/order-1?from=skickad'`, mock `setupOrderQuery` to return `isLoading: true`; assert the back-link anchor's `href` contains `?status=skickad`.
- Test N+2 (404 state honors `?from=`): mount with `initialPath: '/order-1?from=bekraftad'` + 404 error mock; assert both back-links (the loading-state and 404-state) have `href` ending `?status=bekraftad`.
- Test N+3 (header back link uses `order.status` fallback when `?from=` absent): mount with `initialPath: '/order-1'` (no `?from=`) + `MOCK_ORDER_BEKRAFTAD`; assert the back-link anchor `href` ends `?status=bekraftad`.
- Test N+4 (header back link uses `?from=` when present, overriding `order.status`): mount with `initialPath: '/order-1?from=alla'` + a non-utkast mock order; assert the back-link `href` ends `?status=alla`.
- Test N+5 (post-discard navigates to back-link `to`): set `?from=skickad`, click Kasta → Confirm; assert `mockNavigate` was called with `/bestallningar?status=skickad`.

**Use existing helpers** — `renderComposeOrderPage` (line 210) already takes `initialPath`. Pass `'/order-1?from=skickad'` etc. The existing `mockUseNavigate` (line 225) captures the post-discard navigate target.

---

### `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx` (M, test, extend)

**Analog:** itself.

**Existing navigate assertion** (line 184):
```ts
expect(mockNavigate).toHaveBeenCalledWith('/bestallningar/new-order-id-789');
```

**Phase 9 transformation — update this assertion** (D-150 #3):
```ts
expect(mockNavigate).toHaveBeenCalledWith('/bestallningar/new-order-id-789?from=utkast');
```

**New scenarios** (per CONTEXT.md test surface, line 62):
- Test (d) — clicking a row on the Skickade tab navigates with `?from=skickad`. Mock `useOrdersByStatusQuery` to return a non-empty `skickad` row set; set `initialPath: '/?status=skickad'`; click a row; assert `mockNavigate` was called with `/bestallningar/<id>?from=skickad`.

**Wrapper helpers** — `mockDraftsQuery` (line 83) + `mockCreateMutation` (line 98) already exist. Reuse them; add a `mockOrdersByStatusQuery(rows, status)` helper next to them (mirror the same shape).

---

## Shared Patterns

### Three-layer refresh (mutation invalidation + window focus + 30s poll)

**Source:** `useLowStockQuery.ts` lines 35–58 (the named-const + hook); five sibling invalidations in `useOrderMutations.ts` (the existing `['dashboard', 'low-stock']` line at line 366 plus the four implicit `['orders', …]` invalidations).

**Apply to:** `useDashboardOrdersQuery.ts` + all five `useOrderMutations.ts` `onSuccess` callbacks (one-liner per mutation; see file entry above).

Concrete excerpt (the testable-without-mount named export):
```ts
export const LOW_STOCK_QUERY_OPTIONS = {
  queryKey: ['dashboard', 'low-stock'] as const,
  refetchOnWindowFocus: true as const,
  refetchInterval: 30_000 as const,
};
```
**Why the `as const` matters** — keeps the literal types narrow so the test asserts the literal `true` / `30_000` / `['dashboard', 'low-stock']` rather than `boolean` / `number` / `string[]`. Phase 9 mirrors this verbatim.

### Celebratory empty state (Card role="status" + emerald CheckCircle2)

**Source:** `DashboardLowStockCard.tsx` lines 84–104.

**Apply to:** `DashboardOrdersCard.tsx` (both role-specific empty states).

Concrete excerpt:
```tsx
<div className="flex items-center justify-center flex-1 p-8">
  <Card className="max-w-md w-full p-8 text-center shadow-sm" role="status">
    <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto mb-4" aria-hidden="true" />
    <h2 className="text-xl font-semibold mb-2">{heading}</h2>
    <p className="text-sm text-muted-foreground">{sub}</p>
  </Card>
</div>
```

### Mobile-first row layout (44px touch target, role="listitem")

**Source:** `DashboardLowStockCard.tsx` lines 117–133.

**Apply to:** every row in `DashboardOrdersCard.tsx`.

Concrete excerpt:
```tsx
<div role="listitem" className="flex items-center justify-between py-2 min-h-[44px]">
  {/* row content — left text, right meta */}
</div>
```

Container is `role="list"` with an `aria-label` set to the section heading (e.g., `aria-label="Egna utkast"`).

### URL-as-state via `useSearchParams` (read + validate against StatusTab union)

**Source:** `BestallningarPage.tsx` lines 45–95.

**Apply to:** `useBestallningarBackLink.ts`.

Concrete excerpt — the inline predicate + read:
```ts
type StatusTab = 'utkast' | 'skickad' | 'bekraftad' | 'levererad' | 'alla';
const VALID_STATUSES: StatusTab[] = ['utkast', 'skickad', 'bekraftad', 'levererad', 'alla'];

function isValidStatus(s: string): s is StatusTab {
  return VALID_STATUSES.includes(s as StatusTab);
}

const [searchParams] = useSearchParams();
const raw = searchParams.get('from');
const valid: StatusTab | null = raw && isValidStatus(raw) ? raw : null;
```

The new hook duplicates this predicate inline (per `<code_context>` line 213's "smaller surface, no cross-file coupling" — do NOT extract to a shared file). Both modules' tests guard the same union; drift between them would be caught by either test failing.

### careUnitId-first service signature (D-16)

**Source:** `dashboard.service.ts:listLowStockForUnit(careUnitId)` (line 56) and `order.service.ts:listOrdersForUnit(careUnitId, filters)` (line 220).

**Apply to:** `listDashboardOrdersForUser(careUnitId, userId, role)` — `careUnitId` MUST be first; `userId` and `role` follow.

### Fastify route + Zod schema + requireSession (D-15 / D-120)

**Source:** `apps/api/src/routes/dashboard/lowStock.ts` (entire file).

**Apply to:** `apps/api/src/routes/dashboard/orders.ts`.

Concrete excerpt:
```ts
r.get(
  '/api/dashboard/orders',
  {
    preHandler: [requireSession],
    schema: { response: { 200: dashboardOrdersResponse } },
  },
  async (req) => listDashboardOrdersForUser(req.user!.careUnitId, req.user!.id, req.user!.role),
);
```
`requireSession` ONLY — no `requirePermission`. All three roles access; the service does the role-aware branching.

### Vitest mock-hook + named-const-preserve test pattern

**Source:** `DashboardLowStockCard.test.tsx` lines 33–48.

**Apply to:** `DashboardOrdersCard.test.tsx`.

Concrete excerpt:
```ts
vi.mock('@/features/dashboard/useDashboardOrdersQuery', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/dashboard/useDashboardOrdersQuery')
  >('@/features/dashboard/useDashboardOrdersQuery');
  return { ...actual, useDashboardOrdersQuery: vi.fn() };
});

import {
  useDashboardOrdersQuery,
  DASHBOARD_ORDERS_QUERY_OPTIONS,
} from '@/features/dashboard/useDashboardOrdersQuery';
```
The `actual` preserve keeps the named const live for the contract assertion test (mirror Test 5 of the analog).

### Vitest integration test boilerplate (buildTestApp + ensureAllRolesSeeded + loginAs)

**Source:** `apps/api/test/dashboard.integration.test.ts` lines 1–56.

**Apply to:** `apps/api/test/dashboard.orders.integration.test.ts`.

Concrete excerpt — same lifecycle hooks, same helper set. Phase 9 imports `dashboardOrdersResponse` instead of `lowStockListResponse`.

---

## No Analog Found

None. Every Phase 9 file maps to a same-or-adjacent sibling already in the repo. The Phase 6 dashboard surface (`DashboardLowStockCard` / `useLowStockQuery` / `listLowStockForUnit` / `lowStockListResponse` / `lowStockRoute`) and the Phase 4 BestallningarPage URL-state convention together cover every new file. `useBestallningarBackLink.ts` is the only file that does not duplicate an existing file's structure 1:1; its parts (StatusTab union + `isValidStatus` + `useSearchParams.get`) are all already in `BestallningarPage.tsx` lines 45–95.

---

## Metadata

**Analog search scope:**
- `apps/api/src/services/` (dashboard.service.ts, order.service.ts)
- `apps/api/src/routes/dashboard/` (lowStock.ts, index.ts)
- `apps/api/test/` (dashboard.integration.test.ts)
- `apps/web/src/routes/dashboard/` (DashboardPage.tsx, DashboardLowStockCard.tsx + __tests__)
- `apps/web/src/routes/bestallningar/` (BestallningarPage.tsx, ComposeOrderPage.tsx, DraftsTable.tsx, DraftsCardList.tsx, OrdersTable.tsx, OrdersCardList.tsx, __tests__)
- `apps/web/src/features/dashboard/` (useLowStockQuery.ts)
- `apps/web/src/features/orders/` (useOrderMutations.ts)
- `apps/web/test/` (useAuth.test.tsx for renderHook pattern, helpers/renderWithProviders.tsx for MemoryRouter wrapper)
- `packages/shared/src/contracts/` (dashboard.ts, order.ts)
- `packages/shared/src/constants/` (roles.ts)
- `packages/shared/src/index.ts` (barrel re-exports)

**Files scanned:** 18 read, 5 grep'd
**Pattern extraction date:** 2026-05-24
