---
phase: 03-draft-orders
plan: 02
type: execute
wave: 2
depends_on: [03-01]
files_modified:
  - apps/api/src/services/order.service.ts
  - apps/api/src/routes/orders/index.ts
  - apps/api/src/routes/orders/create.ts
  - apps/api/src/routes/orders/list.ts
  - apps/api/src/app.ts
  - apps/web/src/features/orders/useOrderQueries.ts
  - apps/web/src/features/orders/useOrderMutations.ts
  - apps/web/src/routes/bestallningar/BestallningarPage.tsx
  - apps/web/src/routes/bestallningar/DraftsTable.tsx
  - apps/web/src/routes/bestallningar/DraftsCardList.tsx
  - apps/web/src/routes/bestallningar/DraftCard.tsx
  - apps/web/src/router.tsx
autonomous: true
requirements: [ORD-01]
must_haves:
  truths:
    - "A user can click 'Ny beställning' on /bestallningar and is routed to /bestallningar/:id with a new Utkast Order having id, status='utkast', empty lines, scoped to their careUnit (D-50)"
    - "GET /api/orders?status=utkast returns only the caller's careUnit's Utkast Orders, sorted createdAt DESC, including lineCount + totalQuantity + createdBy.name (D-53, D-72)"
    - "Empty drafts state shows 'Inga utkast ännu' heading + 'Skapa en ny beställning för att komma igång.' body + 'Ny beställning' CTA (D-70)"
    - "Drafts list renders <table> at ≥md, <card list> at <md, both showing Skapad / Rader / Total / Skapad av / Öppna (D-72, UI-SPEC §2)"
    - "Cross-careUnit list access returns ONLY the caller's careUnit Orders (no cross-tenant leakage)"
    - "POST /api/orders requires order:create and scopes the new row to req.user.careUnitId; mass-assignment of careUnitId/status/createdByUserId in the body is rejected by Zod .strict()"
    - "/bestallningar/:id route exists and renders a minimal placeholder ComposeOrderPage stub (Slice 3 fills it in)"
  artifacts:
    - path: "apps/api/src/services/order.service.ts"
      provides: "createDraftOrder + listOrdersForUnit + toOrderListItem mapper"
      contains: "export async function createDraftOrder"
    - path: "apps/api/src/routes/orders/index.ts"
      provides: "orderRoutes barrel registering create + list"
      contains: "orderRoutes"
    - path: "apps/api/src/routes/orders/create.ts"
      provides: "POST /api/orders Fastify route"
      contains: "/api/orders"
    - path: "apps/api/src/routes/orders/list.ts"
      provides: "GET /api/orders Fastify route"
      contains: "/api/orders"
    - path: "apps/web/src/features/orders/useOrderQueries.ts"
      provides: "useDraftsQuery hook + useOrderQuery stub"
      contains: "useDraftsQuery"
    - path: "apps/web/src/features/orders/useOrderMutations.ts"
      provides: "useCreateDraftOrder hook (POST empty draft + navigate)"
      contains: "useCreateDraftOrder"
    - path: "apps/web/src/routes/bestallningar/BestallningarPage.tsx"
      provides: "drafts list page replacing the Phase 1 stub"
      contains: "Beställningar"
    - path: "apps/web/src/routes/bestallningar/DraftsTable.tsx"
      provides: "≥md drafts table component"
      contains: "DraftsTable"
    - path: "apps/web/src/routes/bestallningar/DraftsCardList.tsx"
      provides: "<md drafts card list component"
      contains: "DraftsCardList"
    - path: "apps/web/src/router.tsx"
      provides: "/bestallningar/:id route registration"
      contains: "/bestallningar/:id"
  key_links:
    - from: "apps/web/src/routes/bestallningar/BestallningarPage.tsx"
      to: "GET /api/orders?status=utkast"
      via: "useDraftsQuery"
      pattern: "useDraftsQuery"
    - from: "apps/api/src/routes/orders/create.ts"
      to: "apps/api/src/services/order.service.ts createDraftOrder"
      via: "preHandler chain → service call with careUnitId + userId"
      pattern: "createDraftOrder\\(req\\.user!\\.careUnitId"
    - from: "packages/shared/src/contracts/order.ts orderListItem"
      to: "DraftsTable + DraftCard rendering"
      via: "z.infer<typeof orderListItem>"
      pattern: "OrderListItem"
---

<objective>
Ship the first user-visible vertical slice: a working "drafts list + Ny beställning" loop end-to-end. The user logs in, lands on `/bestallningar`, sees their careUnit's Utkast Orders (including the seeded one from Slice 1), clicks "Ny beställning", an empty draft is POSTed, the user is routed to `/bestallningar/:id` (which renders a tiny placeholder Slice 3 will flesh out).

Purpose: Demonstrates ORD-01 (create a draft) end-to-end without yet shipping the line-editing UX. Replaces the Phase 1 `BestallningarPage` stub. Also lays the BE service+route foundation (`order.service.ts`, `routes/orders/index.ts`, `app.ts` registration) that Slices 3-4 extend. The `/bestallningar/:id` route registration is included here so Slice 3 only needs to flesh out the page body, not add the route.

Output: BE `POST /api/orders` + `GET /api/orders?status=utkast` endpoints with careUnit scoping + RBAC + Zod-strict body; FE drafts list with mobile/desktop split + empty state + "Ny beställning" → POST → navigate flow; `/bestallningar/:id` route placeholder.
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/03-draft-orders/03-CONTEXT.md
@.planning/phases/03-draft-orders/03-PATTERNS.md
@.planning/phases/03-draft-orders/03-UI-SPEC.md
@.planning/phases/03-draft-orders/03-01-SUMMARY.md
@CLAUDE.md

<interfaces>
<!-- Key exports the executor needs. Extracted from the Slice 1 contracts + Phase 2 analogs. -->
<!-- Use these directly — no codebase exploration needed. -->

From packages/shared/src/contracts/order.ts (added by Slice 1):
- `orderResponse` — full single-order shape with embedded lines
- `orderListItem` — `{ id, status, createdAt, lineCount, totalQuantity, createdBy: { id, name } }`
- `orderListQuery` — `{ status: orderStatusEnum.default('utkast'), page?, pageSize? }`
- `orderListResponse` — `{ rows: orderListItem[], total: number }`
- `createOrderRequest` — `z.object({}).strict()`
- All paired with `export type X = z.infer<typeof x>`

From packages/shared/src/contracts/permissions.ts (extended by Slice 1):
- `ACTION_KEYS` includes `'order:read'`, `'order:create'`, `'order:update'`, `'order:submit'`, `'order:delete'`

From apps/api/src/plugins/errorHandler.ts (extended by Slice 1):
- `class OrderLockedError extends Error` (used by Slice 3-4 only; not directly here)
- `class NotFoundError extends Error` (used here for cross-tenant 404s in future order:by-id endpoints)

From apps/api/src/services/medication.service.ts (analog for service layout):
- All exports follow `function name(careUnitId: string, ...)` shape (D-16)
- Top-of-file block comment locks the careUnitId-first contract

From apps/api/src/routes/medications/list.ts (analog for the list route):
- `withTypeProvider<ZodTypeProvider>()` pattern + preHandler chain + Zod request/response schema
- Service-call form: `return listMedicationsForUnit(req.user!.careUnitId, req.query);`

From apps/web/src/features/medications/useMedicationsQuery.ts (analog for useDraftsQuery):
- `useQuery<TResponse, ApiError>({ queryKey, queryFn, placeholderData: keepPreviousData })`

From apps/web/src/features/medications/useMedicationMutations.ts (analog for useCreateDraftOrder):
- Pessimistic `useMutation` with `onSuccess` invalidate + `onError` toast.error('Kunde inte spara — försök igen.')
</interfaces>
</context>

## Phase Goal

**As a** nurse (sjuksköterska), **I want to** compose, save, edit, and submit a multi-line medication order, **so that** the order reaches the pharmacist and the medications can be delivered.

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Backend — order.service.ts (create + list), routes/orders/{index,create,list}.ts, app.ts registration</name>
  <files>apps/api/src/services/order.service.ts, apps/api/src/routes/orders/index.ts, apps/api/src/routes/orders/create.ts, apps/api/src/routes/orders/list.ts, apps/api/src/app.ts</files>
  <read_first>
    - apps/api/src/services/medication.service.ts — careUnitId-first service-layer contract (D-16); top-of-file block comment style; the `listMedicationsForUnit` shape; the careUnit-scoped where-clause pattern; the cross-tenant 404 helper pattern (`NotFoundError` on `row.careUnitId !== careUnitId`)
    - apps/api/src/routes/medications/list.ts — Fastify route shape with `withTypeProvider<ZodTypeProvider>()` + preHandler chain `[requireSession, requirePermission('medication:read')]` + Zod querystring/response
    - apps/api/src/routes/medications/create.ts — POST route shape with `requirePermission('medication:create')` + Zod body + 201 reply
    - apps/api/src/routes/medications/index.ts — barrel pattern; `orderRoutes` mirrors `medicationRoutes`
    - apps/api/src/app.ts — current registration block; the new `await app.register(orderRoutes)` line goes right after `medicationRoutes`
    - apps/api/src/auth/requireSession.ts and apps/api/src/auth/requirePermission.ts — preHandlers reused as-is (do not modify)
    - apps/api/test/helpers/buildTestApp.ts — current shape of the test-harness helper; FORWARD-LOOKING NOTE: Slice 4 will need an `ensureSecondCareUnitSeeded()` helper for D-73 scenario 4 (cross-tenant 404 leak prevention). If extending the helper here in Slice 2 is mechanically simple (the file already exposes additive seed helpers like `ensureAllRolesSeeded`), add the second-careUnit helper now so Slice 4 can call it without modifying the harness. Otherwise leave a TODO comment at the bottom of `buildTestApp.ts` referencing "Slice 4 D-73 scenario 4 needs ensureSecondCareUnitSeeded" so the Slice 4 executor doesn't have to re-discover the requirement
    - packages/shared/src/contracts/order.ts — `createOrderRequest`, `orderListQuery`, `orderListResponse`, `orderListItem` schemas added by Slice 1
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`apps/api/src/services/order.service.ts`, `routes/orders/list.ts`, `routes/orders/create.ts`, `routes/orders/index.ts`, `app.ts` sections)
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-16, D-50, D-53, D-62, D-65, D-72, D-73)
  </read_first>
  <behavior>
    - `order.service.ts` exports `createDraftOrder(careUnitId: string, createdByUserId: string): Promise<OrderResponse>` — runs `prisma.order.create({ data: { careUnitId, createdByUserId, status: 'utkast' }, include: { lines: true, createdBy: { select: { id, name } }, submittedBy: { select: { id, name } } } })`, maps to `orderResponse` via `toOrderResponse`
    - `order.service.ts` exports `listOrdersForUnit(careUnitId: string, filters: OrderListQuery): Promise<OrderListResponse>` — runs `prisma.order.findMany({ where: { careUnitId, status: filters.status, deletedAt: null }, include: { lines: true, createdBy: { select: { id, name } } }, orderBy: { createdAt: 'desc' } })`. Computes `lineCount = row.lines.length`, `totalQuantity = row.lines.reduce((s,l) => s+l.quantity, 0)`. Returns `{ rows: rows.map(toOrderListItem), total: rows.length }`. Pagination stubbed — Phase 7 polish
    - `order.service.ts` exports `toOrderResponse(row): OrderResponse` and `toOrderListItem(row): OrderListItem` mapper helpers
    - `routes/orders/index.ts` exports `orderRoutes(app)` which registers `createOrderRoute` + `listOrdersRoute` (Slices 3-4 add more)
    - `routes/orders/create.ts` — `r.post('/api/orders', { preHandler: [requireSession, requirePermission('order:create')], schema: { body: createOrderRequest, response: { 201: orderResponse } } }, async (req, reply) => { const row = await createDraftOrder(req.user!.careUnitId, req.user!.id); reply.status(201); return row; })`
    - `routes/orders/list.ts` — `r.get('/api/orders', { preHandler: [requireSession, requirePermission('order:read')], schema: { querystring: orderListQuery, response: { 200: orderListResponse } } }, async (req) => listOrdersForUnit(req.user!.careUnitId, req.query))`
    - `app.ts` — append `import { orderRoutes } from './routes/orders/index.js';` and `await app.register(orderRoutes);` after the existing `medicationRoutes` registration
    - TDD: extend `apps/api/test/orders.integration.test.ts` (skeleton — full coverage lands in Slice 4) with two `it` blocks: (a) "POST /api/orders creates an Utkast Order scoped to req.user.careUnitId, ignores any careUnitId/status/createdByUserId in body via Zod .strict()", (b) "GET /api/orders?status=utkast returns only the caller's careUnit Orders sorted createdAt DESC and includes lineCount/totalQuantity/createdBy.name". Use the `apps/api/test/auth.flow.smoke.test.ts` harness pattern (`buildTestApp`, `ensureAllRolesSeeded`, `app.inject`, `captureSessionCookie`)
  </behavior>
  <action>
    Create `apps/api/src/services/order.service.ts` mirroring `medication.service.ts`'s top-of-file structure: import `prisma` from `../db/client.js`, error classes from `../plugins/errorHandler.js`, types from `@meditrack/shared`. Add a block comment locking the careUnitId-first contract (D-16). Implement two exported async functions — `createDraftOrder(careUnitId, createdByUserId)` and `listOrdersForUnit(careUnitId, filters)` — plus exported mapper helpers `toOrderResponse(row)` and `toOrderListItem(row)`. The list query filters by `{ careUnitId, status: filters.status, deletedAt: null }`, orders by `createdAt: 'desc'`, includes the lines (for count + total computation) and `createdBy: { select: { id: true, name: true } }`. Compute `lineCount` and `totalQuantity` in `toOrderListItem`. Return `{ rows, total: rows.length }`.

    Create `apps/api/src/routes/orders/index.ts` exporting an `orderRoutes(app: FastifyInstance)` barrel that registers `createOrderRoute` + `listOrdersRoute` (Slice 3 will add `getOrderRoute`, `linesRoute`, `pickerOptionsRoute`; Slice 4 will add `submitOrderRoute`, `deleteOrderRoute`).

    Create `apps/api/src/routes/orders/create.ts` mirroring `medications/create.ts`: `r.post('/api/orders', …)` with preHandler `[requireSession, requirePermission('order:create')]`, body `createOrderRequest` (`z.object({}).strict()` from Slice 1 — this is the T-03-02 mass-assignment mitigation), response `201: orderResponse`. Handler: `const row = await createDraftOrder(req.user!.careUnitId, req.user!.id); reply.status(201); return row;`.

    Create `apps/api/src/routes/orders/list.ts` mirroring `medications/list.ts`: `r.get('/api/orders', …)` with preHandler `[requireSession, requirePermission('order:read')]`, querystring `orderListQuery`, response `200: orderListResponse`. Handler: `return listOrdersForUnit(req.user!.careUnitId, req.query);`.

    Append to `apps/api/src/app.ts`: `import { orderRoutes } from './routes/orders/index.js';` near the top with the other route imports, and `await app.register(orderRoutes);` right after `await app.register(medicationRoutes);`.

    TDD before implementation: create `apps/api/test/orders.integration.test.ts` with the harness scaffold from `auth.flow.smoke.test.ts` (beforeAll buildTestApp + ensureAllRolesSeeded, beforeEach resetSessions, afterAll app.close + prisma.$disconnect, captureSessionCookie helper). Add the two `it` blocks listed in `<behavior>`. Run — they fail (RED). Implement, re-run — they pass (GREEN). Cross-careUnit list-scoping has a deeper test in Slice 4 (per D-73); Slice 2's list test just verifies "only my careUnit's rows come back" with two seeded careUnits.
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/api typecheck && pnpm --filter @meditrack/api test --run apps/api/test/orders.integration.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/src/services/order.service.ts` exports `createDraftOrder` and `listOrdersForUnit` (Grep `^export async function (createDraftOrder|listOrdersForUnit)`)
    - `apps/api/src/services/order.service.ts` first arg of every exported async function is `careUnitId: string` (Grep / inspect)
    - `apps/api/src/routes/orders/create.ts` contains `requirePermission('order:create')` and `createOrderRequest` schema usage (Grep)
    - `apps/api/src/routes/orders/list.ts` contains `requirePermission('order:read')` and `orderListQuery` + `orderListResponse` schema usage (Grep)
    - `apps/api/src/app.ts` contains `await app.register(orderRoutes)` (Grep)
    - `apps/api/test/orders.integration.test.ts` exists with ≥2 `it(` blocks: at least one for `POST /api/orders` and one for `GET /api/orders?status=utkast` (Grep)
    - Test "POST /api/orders creates an Utkast Order scoped to req.user.careUnitId and ignores body careUnitId" PASSES (test exits 0): sends `{ careUnitId: 'fake', status: 'skickad' }` body, expects 400 `validation_failed` from Zod `.strict()`; sends empty `{}` body, expects 201 with `status === 'utkast'` and `careUnitId === <session.careUnitId>`
    - Test "GET /api/orders?status=utkast scopes to careUnit + sorts createdAt DESC" PASSES: with two careUnits A and B each having Utkast orders, response from A's user includes only A's rows in createdAt-desc order; rows include `lineCount`, `totalQuantity`, `createdBy.name`
    - `POST /api/orders` without a session returns 401 `unauthenticated` (sanity inject)
    - `pnpm --filter @meditrack/api typecheck` exits 0
    - All existing api tests still pass: `pnpm --filter @meditrack/api test --run` exits 0
  </acceptance_criteria>
  <done>
    The two endpoints `POST /api/orders` and `GET /api/orders?status=utkast` are live, RBAC-gated, careUnit-scoped, Zod-strict-bodied, and covered by integration tests. The order service layer scaffold is ready for Slice 3 to extend with line operations and Slice 4 to extend with submit/delete.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Frontend — useOrderQueries/useOrderMutations hooks + /bestallningar/:id route registration</name>
  <files>apps/web/src/features/orders/useOrderQueries.ts, apps/web/src/features/orders/useOrderMutations.ts, apps/web/src/router.tsx</files>
  <read_first>
    - apps/web/src/features/medications/useMedicationsQuery.ts — analog for `useDraftsQuery` (queryKey + queryFn + placeholderData: keepPreviousData) and for `useOrderQuery` stub (single-resource fetch + retry: false posture)
    - apps/web/src/features/medications/useMedicationMutations.ts — analog for `useCreateDraftOrder` (pessimistic useMutation + onSuccess invalidate + onError toast)
    - apps/web/src/router.tsx — current route map; the `/bestallningar/:id` line goes right after the existing `/bestallningar` entry (D-PATTERNS map line 836-844)
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`useOrderQueries.ts`, `useOrderMutations.ts`, `router.tsx` sections)
    - .planning/phases/03-draft-orders/03-UI-SPEC.md §IA Route Map Addition + §1 Ny beställning click handler
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-50, D-65, D-69, D-70)
  </read_first>
  <behavior>
    - `useOrderQueries.ts` exports `useDraftsQuery()` — `queryKey: ['orders', { status: 'utkast' }]`, `queryFn` hits `GET /api/orders?status=utkast`, `placeholderData: keepPreviousData`, returns `UseQueryResult<OrderListResponse, ApiError>`
    - `useOrderQueries.ts` exports `useOrderQuery(id: string | undefined)` — `queryKey: ['order', id]`, `queryFn` hits `GET /api/orders/${id}`, `enabled: !!id`, `retry: false` so 404s surface immediately (Slice 3 wires this in fully — the hook is exported now so the placeholder ComposeOrderPage can render the loading skeleton)
    - `useOrderMutations.ts` exports `useCreateDraftOrder()` — pessimistic `useMutation<OrderResponse, ApiError, void>` that POSTs an empty body, on success invalidates `['orders', { status: 'utkast' }]`, on error toasts `'Kunde inte spara — försök igen.'`. Returns the full `OrderResponse` so the caller can `navigate(\`/bestallningar/${response.id}\`)`
    - `router.tsx` registers a new sibling route `{ path: '/bestallningar/:id', element: <ComposeOrderPage /> }` immediately after the existing `/bestallningar` entry, importing `ComposeOrderPage` from `./routes/bestallningar/ComposeOrderPage.tsx`
    - A minimal `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` placeholder exists (Slice 3 fully implements it) — for Slice 2 it must render: header back link "Tillbaka till beställningar", `<h1 className="text-2xl font-semibold">Nytt utkast</h1>`, and an `<EmptyStateCard>` with body "Slice 3 fyller i denna vy." so the route does not 404 and the post-POST navigation lands somewhere visible. Mark the file with a `// TODO Slice 3: replace placeholder body with line list + sticky footer + picker overlay` comment
  </behavior>
  <action>
    Create `apps/web/src/features/orders/useOrderQueries.ts` with three exports per the read_first analogs:
      - `useDraftsQuery()` — verbatim mirror of `useMedicationsQuery` shape but with `queryKey: ['orders', { status: 'utkast' }]` and `queryFn: () => fetchJson<OrderListResponse>('/api/orders?status=utkast')`
      - `useOrderQuery(id: string | undefined)` — mirror of `useMedicationSearchQuery`'s `enabled` + `retry: false` posture but for `['order', id]` + `GET /api/orders/${id}`
      - `usePickerOptionsQuery(q: string, enabled: boolean)` — Slice 3 owns the full implementation; for Slice 2 export it as a stub that hits `GET /api/orders/picker-options?q=…&limit=20` so the type compiles. Slice 3 will use it unchanged

    Create `apps/web/src/features/orders/useOrderMutations.ts` with `useCreateDraftOrder()`:
    ```
    useMutation<OrderResponse, ApiError, void>({
      mutationFn: () => fetchJson<OrderResponse>('/api/orders', { method: 'POST', body: JSON.stringify({}) }),
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'utkast' }] }),
      onError: () => toast.error('Kunde inte spara — försök igen.'),
    });
    ```
    Slice 3 + 4 add the remaining mutations (`useAddOrderLine`, `useUpdateOrderLineQuantity`, `useRemoveOrderLine`, `useSubmitOrder`, `useDiscardOrder`) — leave a `// TODO Slice 3/4: …` placeholder list at the bottom of the file.

    Update `apps/web/src/router.tsx`: import `ComposeOrderPage` next to `BestallningarPage`, add `{ path: '/bestallningar/:id', element: <ComposeOrderPage /> }` as a sibling route immediately after the existing `'/bestallningar'` entry. Per UI-SPEC §IA the two are sibling routes under the existing AuthGate+AppShell wrapper, NOT nested.

    Create a minimal `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` placeholder that renders the page chrome described in `<behavior>`. Slice 3 replaces the body completely.
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/web typecheck && pnpm --filter @meditrack/web build</automated>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/features/orders/useOrderQueries.ts` exports `useDraftsQuery`, `useOrderQuery`, `usePickerOptionsQuery` (Grep `^export function (useDraftsQuery|useOrderQuery|usePickerOptionsQuery)`)
    - `apps/web/src/features/orders/useOrderQueries.ts` contains literal `queryKey: ['orders', { status: 'utkast' }]` and `queryKey: ['order', id]` (Grep with normalised whitespace acceptable)
    - `apps/web/src/features/orders/useOrderMutations.ts` exports `useCreateDraftOrder` (Grep)
    - `apps/web/src/features/orders/useOrderMutations.ts` contains the toast literal `'Kunde inte spara — försök igen.'` (Grep)
    - `apps/web/src/router.tsx` contains the literal `'/bestallningar/:id'` (Grep)
    - `apps/web/src/routes/bestallningar/ComposeOrderPage.tsx` exists with a `Slice 3 fyller i denna vy.` placeholder + a `TODO Slice 3` comment (Grep)
    - `pnpm --filter @meditrack/web typecheck` exits 0
    - `pnpm --filter @meditrack/web build` exits 0
  </acceptance_criteria>
  <done>
    The FE has the data-fetching primitives and the route registration needed for Task 3's page composition. Slices 3-4 extend the same files; nothing here is throwaway.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Frontend — BestallningarPage drafts list + DraftsTable + DraftsCardList + DraftCard (vertical slice completion)</name>
  <files>apps/web/src/routes/bestallningar/BestallningarPage.tsx, apps/web/src/routes/bestallningar/DraftsTable.tsx, apps/web/src/routes/bestallningar/DraftsCardList.tsx, apps/web/src/routes/bestallningar/DraftCard.tsx</files>
  <read_first>
    - apps/web/src/routes/bestallningar/BestallningarPage.tsx — the existing Phase 1 stub (`<EmptyStateCard icon={ClipboardList} heading="Beställningar" />`); replace it entirely
    - apps/web/src/routes/lakemedel/LakemedelPage.tsx — page chrome + skeleton loading + empty-state + table/card-split rendering pattern (the precise hidden md:block / block md:hidden split)
    - apps/web/src/routes/lakemedel/MedicationTable.tsx — analog for `DraftsTable` (table header bg-muted/50, column header typography, row hover/focus styles, row-click navigation via `onRowClick`)
    - apps/web/src/routes/lakemedel/MedicationCardList.tsx + MedicationCard.tsx — analog for `DraftsCardList` + `DraftCard` (card chrome, role="button" + tabIndex + aria-label + onKeyDown handlers)
    - apps/web/src/components/EmptyStateCard.tsx — note: the existing component hardcodes a body string; either extend it to accept `body` + `action` props OR inline the empty-state card here (UI-SPEC §1 prefers inline — match `LakemedelPage` lines 211-228 geometry)
    - apps/web/src/auth/Can.tsx and apps/web/src/auth/useAuth.ts — `<Can action="order:create">` and `useAuth()` for RBAC gating on the "Ny beställning" button
    - apps/web/src/features/orders/useOrderQueries.ts (added in Task 2) — `useDraftsQuery`
    - apps/web/src/features/orders/useOrderMutations.ts (added in Task 2) — `useCreateDraftOrder`
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`BestallningarPage.tsx`, `DraftsTable.tsx`, `DraftsCardList.tsx + DraftCard.tsx` sections)
    - .planning/phases/03-draft-orders/03-UI-SPEC.md §1 (BestallningarPage), §2 (DraftsTable), §3 (DraftsCardList), §Copywriting, §Toast Feedback
  </read_first>
  <behavior>
    - `BestallningarPage` document title is set to `'Beställningar — MediTrack'` on mount, restored to `'MediTrack'` on unmount (UI-SPEC §Copywriting analog)
    - Page renders: `<h1 className="text-2xl font-semibold leading-tight">Beställningar</h1>` (D-70), a "Ny beställning" button (top-right desktop, FAB-style on mobile) gated by `<Can action="order:create">`, then the drafts content
    - Loading state: 5 `<Skeleton h-12 />` rows on ≥md, 3 `<Skeleton h-24 />` cards on <md (UI-SPEC §1)
    - Empty state (rows.length === 0): centered card with `<ClipboardList className="h-12 w-12 text-slate-400" />` icon, heading `Inga utkast ännu`, body `Skapa en ny beställning för att komma igång.`, CTA `<Button>Ny beställning</Button>` gated by `<Can action="order:create">` (D-70)
    - Filled state: `<DraftsTable items={rows} onRowClick={(row) => navigate(\`/bestallningar/${row.id}\`)} className="hidden md:block" />` + `<DraftsCardList items={rows} onCardClick={…} className="block md:hidden" />`
    - "Ny beställning" click: button enters `disabled + Loader2 animate-spin` state, `useCreateDraftOrder.mutateAsync()` → on success `navigate(/bestallningar/${response.id})`, on error toast `'Kunde inte spara — försök igen.'` (the hook's onError handles this — page just re-enables button)
    - `DraftsTable` columns per UI-SPEC §2: `Skapad` (`formatRelative(createdAt)`) / `Rader` / `Total` / `Skapad av` (`createdBy.name`) / `Öppna` (visually-empty column with right-edge ChevronRight; entire row clickable). NO status pill column (UI-SPEC §IA decision — Phase 3 list is utkast-only)
    - Column-header typography: `text-xs font-semibold text-muted-foreground uppercase tracking-wide`, `bg-muted/50` row bg (Phase 2 carry-forward)
    - Row click navigates to `/bestallningar/:id` via `onRowClick(row)`; aria-label `Öppna utkast skapat {formatRelative(createdAt)}` per UI-SPEC §A11y
    - `DraftCard` (mobile): three stacked rows — top `{formatRelative(createdAt)}` + right-edge ChevronRight; middle `Skapad av {createdBy.name}` in `text-xs text-muted-foreground`; bottom `{lineCount} rader · totalt {totalQuantity}` in `text-sm`. Card chrome `bg-card border border-border rounded-lg p-4 shadow-sm cursor-pointer hover:bg-muted/30`. role="button" + tabIndex={0} + aria-label same as table row
    - `formatRelative` helper — use `date-fns` if already installed (Phase 2 likely has it; check). If not, inline a thin Swedish-aware helper (`function formatRelative(d: Date): string`) returning strings like `'2 minuter sedan'`, `'1 timme sedan'`, `'igår'`. The helper can live next to BestallningarPage if no shared utility module exists yet
  </behavior>
  <action>
    Replace the Phase 1 stub in `apps/web/src/routes/bestallningar/BestallningarPage.tsx` with the drafts-list page per UI-SPEC §1: page-title effect, heading row with "Ny beställning" button gated by `<Can action="order:create">`, loading skeletons (≥md vs <md), empty state (with full inline empty-state card matching LakemedelPage lines 211-228 geometry — title `Inga utkast ännu`, body `Skapa en ny beställning för att komma igång.`, CTA `Ny beställning`), filled state (`<DraftsTable>` + `<DraftsCardList>` with the responsive `hidden md:block` / `block md:hidden` split per Phase 2 D-34). Page state: only `useNavigate()` + `useDraftsQuery()` + `useCreateDraftOrder()`. Hook the "Ny beställning" click to `useCreateDraftOrder.mutateAsync()` → on resolved response `navigate(\`/bestallningar/${response.id}\`)`.

    Create `apps/web/src/routes/bestallningar/DraftsTable.tsx` mirroring `MedicationTable.tsx`'s shell + header + row pattern; 5 columns per UI-SPEC §2 (`Skapad`, `Rader`, `Total`, `Skapad av`, `Öppna`); last column is a visually-empty header but renders a `ChevronRight` icon (`h-4 w-4 text-muted-foreground`) in each row; the entire `<TableRow>` is keyboard-clickable (`tabIndex={0}`, `onClick={() => onRowClick(item)}`, `onKeyDown={(e) => e.key === 'Enter' || e.key === ' ' ? (e.preventDefault(), onRowClick(item)) : void 0}`); `cursor-pointer hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary`. Drop `TooltipProvider` (no tooltips).

    Create `apps/web/src/routes/bestallningar/DraftsCardList.tsx` (thin barrel mirroring `MedicationCardList.tsx`) and `apps/web/src/routes/bestallningar/DraftCard.tsx` (single card per UI-SPEC §3 layout). aria-label `Öppna utkast skapat ${formatRelative(item.createdAt)}` per UI-SPEC §A11y. Card itself is the `<button role="button" tabIndex={0}>` with the appropriate onClick + onKeyDown for keyboard activation. NO trash button or any other interactive nested inside (different from `OrderLineCard` which Slice 3 ships).

    Determine `formatRelative`: if `date-fns` is in dependencies, import `formatDistanceToNow` and pass `{ locale: sv, addSuffix: true }` (sv from `date-fns/locale/sv`). If neither is installed, inline a small helper that handles 0-59 minutes, 1-23 hours, 1-6 days, then falls back to `date.toLocaleDateString('sv-SE')`. Pick the path with the smaller diff — check `pnpm --filter @meditrack/web list date-fns` first.

    Page-title effect: `useEffect(() => { document.title = 'Beställningar — MediTrack'; return () => { document.title = 'MediTrack'; }; }, [])` (analog `LakemedelPage`).

    No pagination per UI-SPEC §IA (drafts are bounded; Phase 7 polish can add it).
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/web typecheck && pnpm --filter @meditrack/web build && pnpm --filter @meditrack/web test --run apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx</automated>
    <human-check>Run `docker compose up`, log in as `sjukskoterska@example.test`, land on `/bestallningar` — the seeded Utkast draft from Slice 1 appears as one row (desktop) or card (resize to 360 px). Click "Ny beställning" → URL changes to `/bestallningar/<new-cuid>` and the placeholder ComposeOrderPage chrome ("Nytt utkast" + placeholder body) renders. Click "Tillbaka till beställningar" — back on the list, the new empty draft appears in the table sorted DESC by createdAt (newest first).</human-check>
  </verify>
  <acceptance_criteria>
    - `apps/web/src/routes/bestallningar/BestallningarPage.tsx` no longer contains the literal `<EmptyStateCard icon={ClipboardList} heading="Beställningar"` (Grep — replaced)
    - `BestallningarPage.tsx` contains `<h1 className="text-2xl font-semibold leading-tight">Beställningar</h1>` (Grep)
    - `BestallningarPage.tsx` contains the literals `'Inga utkast ännu'`, `'Skapa en ny beställning för att komma igång.'`, `'Ny beställning'` (Grep)
    - `BestallningarPage.tsx` contains `<Can action="order:create">` wrapping the "Ny beställning" button (Grep)
    - `BestallningarPage.tsx` contains `useDraftsQuery` import + invocation (Grep)
    - `BestallningarPage.tsx` contains `useCreateDraftOrder` import + invocation (Grep)
    - `DraftsTable.tsx` exists with column headers `Skapad`, `Rader`, `Total`, `Skapad av`, `Öppna` (Grep)
    - `DraftsTable.tsx` row container has `cursor-pointer hover:bg-muted/50` and a `tabIndex={0}` (Grep)
    - `DraftCard.tsx` exists with aria-label pattern `Öppna utkast skapat` (Grep)
    - FE component test `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx` exists and passes: (a) renders empty state with the three D-70 strings when `useDraftsQuery` returns `{ rows: [] }`; (b) renders a `<DraftsTable>` and `<DraftsCardList>` when `useDraftsQuery` returns ≥1 row; (c) clicking "Ny beställning" calls `useCreateDraftOrder().mutateAsync` and on resolved response calls `navigate('/bestallningar/<id>')`
    - `pnpm --filter @meditrack/web typecheck` exits 0
    - `pnpm --filter @meditrack/web build` exits 0
    - Human-check passes (Slice 1's seeded draft visible; Ny beställning round-trip works)
  </acceptance_criteria>
  <done>
    A user can open `/bestallningar`, see their careUnit's seeded Utkast draft, click "Ny beställning", and end up at `/bestallningar/<new-cuid>` with the placeholder ComposeOrderPage rendering. ORD-01's "create a draft order" leg is demoable end-to-end (the multi-line composition body comes in Slice 3).
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client → API | Body for `POST /api/orders` and querystring for `GET /api/orders` cross from untrusted client |
| Cross-careUnit | List + create endpoints scope to `req.user.careUnitId` from the server-side session, never from client input |
| FE RBAC | "Ny beställning" button gated by `<Can action="order:create">` — defense in depth; the BE preHandler is the real boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Information Disclosure | `GET /api/orders` cross-careUnit leak | mitigate | `listOrdersForUnit` where-clause includes `careUnitId: req.user.careUnitId` from the session-decorated request (D-16); integration test verifies a user from CareUnit A receives ONLY A's rows when both A and B have Utkast orders |
| T-03-02 | Tampering | Mass-assignment of `careUnitId`, `status`, `createdByUserId`, `submittedByUserId` via `POST /api/orders` body | mitigate | `createOrderRequest = z.object({}).strict()` (Slice 1) rejects every body field; service-layer signature `createDraftOrder(careUnitId, createdByUserId)` takes both from the session, never from the body |
| T-03-04 | Elevation of Privilege | A user without `order:create` role hits `POST /api/orders` | mitigate | Route preHandler `[requireSession, requirePermission('order:create')]`; FE additionally gates the button with `<Can action="order:create">` — this slice's permission map (Slice 1) grants all three roles |
| T-03-AUTH | Spoofing | Unauthenticated access to `/api/orders` | mitigate | `requireSession` preHandler returns 401 `unauthenticated` envelope before reaching the route handler — verified by sanity inject test |
| T-03-SC | Tampering | Supply chain — new npm/pnpm packages | accept | No new external npm packages introduced in this slice — only date-fns (already installed Phase 2) is used; verified via `pnpm --filter @meditrack/web list date-fns`. If not installed, inline a tiny helper instead (do NOT npm-install a new dep without a separate package-legitimacy gate) |
</threat_model>

<verification>
- BE typechecks: `pnpm --filter @meditrack/api typecheck` exits 0
- BE integration tests pass: `pnpm --filter @meditrack/api test --run apps/api/test/orders.integration.test.ts` exits 0
- FE typechecks + builds: `pnpm --filter @meditrack/web typecheck && pnpm --filter @meditrack/web build` exits 0
- FE component test for `BestallningarPage` passes
- All existing tests still pass: `pnpm -r test --run` exits 0
- Human-check: docker compose up → log in → `/bestallningar` shows seeded draft → Ny beställning navigates to `/bestallningar/<id>`
</verification>

<success_criteria>
- `POST /api/orders` returns 201 `{ id, status: 'utkast', lines: [], careUnitId: <session>, createdByUserId: <session>, … }` for any role; body fields are rejected by Zod .strict()
- `GET /api/orders?status=utkast` returns the caller's careUnit Utkast Orders sorted createdAt DESC with `lineCount` + `totalQuantity` + `createdBy.name`
- `/bestallningar` page replaces the Phase 1 stub, renders the drafts list (table ≥md / cards <md), the empty state when no drafts exist, and the "Ny beställning" button (Can-gated)
- `/bestallningar/:id` route is registered (ComposeOrderPage placeholder lives there for Slice 3 to flesh out)
- Slice 1's seeded Utkast draft is visible on the page after `docker compose up` for the sjukskoterska
- ORD-01 (create a draft order) is end-to-end demoable
</success_criteria>

<output>
Create `.planning/phases/03-draft-orders/03-02-SUMMARY.md` when done — record the integration-test file path, the seeded-draft id (for downstream reference), any deviations from the planned hook shapes, and an explicit note that `useOrderQuery` / `usePickerOptionsQuery` are exported but only consumed in Slice 3.
</output>
</content>
</invoke>