---
phase: 03-draft-orders
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/api/prisma/schema.prisma
  - apps/api/prisma/migrations/
  - apps/api/prisma/seed.ts
  - packages/shared/src/contracts/order.ts
  - packages/shared/src/contracts/permissions.ts
  - packages/shared/src/index.ts
  - apps/api/src/auth/permissions.ts
  - apps/api/src/plugins/errorHandler.ts
autonomous: true
requirements: [ORD-01, ORD-02, ORD-03]
must_haves:
  truths:
    - "Prisma schema declares `enum OrderStatus { utkast skickad bekraftad levererad }` (D-46)"
    - "Prisma schema declares a single `Order` model (no separate `OrderDraft` table — status column distinguishes draft from submitted) with all D-62 columns and indexes (D-48, D-62)"
    - "Prisma schema declares `OrderLine` model with all D-63 columns and indexes"
    - "Migration applied: `npx prisma migrate dev` exits 0 and creates a new directory under apps/api/prisma/migrations/"
    - "Prisma client regenerated — `import { Order, OrderLine, OrderStatus } from '@prisma/client'` type-checks"
    - "Five new ACTION_KEYS exist: order:read, order:create, order:update, order:submit, order:delete (D-64)"
    - "BE PERMISSIONS map grants all three roles for every order:* key (D-64 / REQUIREMENTS.md ORD-01..03)"
    - "Seed produces one Utkast draft for sjukskoterska@example.test scoped to her vårdenhet (idempotent)"
    - "OrderLockedError and ValidationFailedError classes registered in errorHandler with 409/422 envelope mapping (D-54, D-55, D-56)"
    - "All zod schemas for orders exported from @meditrack/shared (orderResponse, orderListItem, orderListQuery, orderListResponse, addOrderLineRequest, updateOrderLineRequest, pickerOptionsQuery, pickerOption, pickerOptionsResponse, orderLineResponse, createOrderRequest)"
  artifacts:
    - path: "apps/api/prisma/schema.prisma"
      provides: "Order + OrderLine models + OrderStatus enum"
      contains: "model Order"
    - path: "apps/api/prisma/migrations/*_order_flow_drafts/migration.sql"
      provides: "DDL for Order/OrderLine tables + OrderStatus enum"
      contains: "CREATE TYPE \"OrderStatus\""
    - path: "packages/shared/src/contracts/order.ts"
      provides: "Zod schemas + inferred TS types for the FE↔BE order contract"
      exports: ["orderResponse", "orderListItem", "orderListQuery", "orderListResponse", "addOrderLineRequest", "updateOrderLineRequest", "pickerOptionsQuery", "pickerOption", "pickerOptionsResponse", "orderLineResponse", "createOrderRequest"]
    - path: "packages/shared/src/contracts/permissions.ts"
      provides: "Extended ACTION_KEYS tuple with order:* literals"
      contains: "'order:submit'"
    - path: "apps/api/src/auth/permissions.ts"
      provides: "BE PERMISSIONS map entries for order:*"
      contains: "'order:submit': ['apotekare', 'sjukskoterska', 'admin']"
    - path: "apps/api/src/plugins/errorHandler.ts"
      provides: "OrderLockedError + ValidationFailedError classes and envelope mapping"
      contains: "OrderLockedError"
    - path: "apps/api/prisma/seed.ts"
      provides: "Seeded in-flight Utkast draft for sjukskoterska@example.test"
      contains: "status: 'utkast'"
  key_links:
    - from: "packages/shared/src/contracts/permissions.ts"
      to: "apps/api/src/auth/permissions.ts"
      via: "Record<ActionKey, Role[]> compile-time exhaustiveness"
      pattern: "Record<ActionKey, Role\\[\\]>"
    - from: "packages/shared/src/constants/orderStatus.ts"
      to: "apps/api/prisma/schema.prisma OrderStatus enum"
      via: "verbatim mirror of ORDER_STATUSES tuple"
      pattern: "enum OrderStatus"
    - from: "packages/shared/src/contracts/order.ts"
      to: "apps/api/src/plugins/errorHandler.ts"
      via: "errorEnvelope reused as the 409/422 response shape"
      pattern: "code: 'order_locked'"
---

<objective>
Lay the schema + shared-contract foundation that the remaining three Phase 3 slices build on. Add `Order` + `OrderLine` Prisma models with the `OrderStatus` enum, run the Prisma migration, extend the FE↔BE permission contract with five `order:*` keys, register `OrderLockedError` / `ValidationFailedError` in the error handler, and ship a seeded in-flight draft for the demo.

Purpose: Slices 2-4 cannot start until Prisma's generated client knows about `Order` / `OrderLine` and `@meditrack/shared` exports the order Zod schemas. The single permission contract and the canonical error envelope are also Phase 3 enablers — without them, no order route can be written. This slice is the smallest unit that unblocks parallel work downstream while still delivering a *visible* artifact (a seeded draft) that the user can confirm on `docker compose up`.

Output: A Prisma schema + migration + regenerated client; the shared contracts package re-exports order Zod schemas + ActionKey literals; the BE permissions map covers every new key; the error handler maps `order_locked` (409) and `validation_failed` (422) envelopes; the seed produces one Utkast draft scoped to the sjukskoterska's vårdenhet.
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/REQUIREMENTS.md
@.planning/phases/03-draft-orders/03-CONTEXT.md
@.planning/phases/03-draft-orders/03-PATTERNS.md
@.planning/phases/03-draft-orders/03-UI-SPEC.md
@CLAUDE.md
</context>

## Phase Goal

**As a** nurse (sjuksköterska), **I want to** compose, save, edit, and submit a multi-line medication order, **so that** the order reaches the pharmacist and the medications can be delivered.

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Extend Prisma schema with Order + OrderLine + OrderStatus and run migration [BLOCKING]</name>
  <files>apps/api/prisma/schema.prisma, apps/api/prisma/migrations/, apps/api/prisma/seed.ts</files>
  <read_first>
    - apps/api/prisma/schema.prisma — current state (Phase 1+2 models; mirror style for enum + careUnit-scoped model + soft-delete)
    - packages/shared/src/constants/orderStatus.ts — `ORDER_STATUSES` tuple is the single source of truth; the Prisma enum literal list MUST match verbatim (D-46)
    - apps/api/prisma/migrations/20260521000000_medication_catalog/migration.sql — the expected migration-output shape for new enums + tables + indexes + FKs (no raw SQL hand-edits this phase)
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`apps/api/prisma/schema.prisma` section) — exact field list, indexes, `@relation(name:…)` requirement for the two User FKs, on-delete policy per column
  </read_first>
  <behavior>
    - The `OrderStatus` enum declares all four values `utkast`, `skickad`, `bekraftad`, `levererad` even though Phase 3 only writes `utkast` and `skickad` (D-46)
    - `Order` columns: `id (cuid)`, `careUnitId`, `createdByUserId` (FK → User, onDelete: Restrict), `status OrderStatus @default(utkast)`, `submittedAt DateTime?`, `submittedByUserId String?` (FK → User, onDelete: Restrict, with `@relation(name: "OrderSubmittedBy")`), `deletedAt DateTime?`, `createdAt`, `updatedAt @updatedAt` (D-62)
    - `Order` indexes: `@@index([careUnitId, status])`, `@@index([careUnitId, createdAt])`, `@@index([createdByUserId])` (D-62)
    - `OrderLine` columns: `id (cuid)`, `orderId` (FK → Order, onDelete: Cascade), `careUnitMedicationId` (FK → CareUnitMedication, onDelete: Restrict), `quantity Int`, `createdAt`, `updatedAt @updatedAt` (D-63)
    - `OrderLine` indexes: `@@index([orderId])`, `@@index([careUnitMedicationId])` (D-63). NO `@@unique([orderId, careUnitMedicationId])` per D-63
    - User and CareUnitMedication models gain matching back-relations (`createdOrders Order[] @relation("OrderCreatedBy")`, `submittedOrders Order[] @relation("OrderSubmittedBy")` on User; `orderLines OrderLine[]` on CareUnitMedication)
    - `npx prisma migrate dev --name 0004_order_flow_drafts --skip-seed` succeeds and creates a new directory under `apps/api/prisma/migrations/` containing a `migration.sql` with `CREATE TYPE "OrderStatus"`, `CREATE TABLE "Order"`, `CREATE TABLE "OrderLine"`, and matching `CREATE INDEX` / `ADD CONSTRAINT … FOREIGN KEY` lines
    - `npx prisma generate` succeeds; the `@prisma/client` types include `Order`, `OrderLine`, `OrderStatus`
    - Seed script extension: idempotent insertion of one Utkast `Order` row for `sjukskoterska@example.test`, scoped to her CareUnit, with 3 `OrderLine` rows referencing existing CareUnitMedications (prefer 3 that satisfy `currentStock < lowStockThreshold` so the demo also shows the LowStockBadge in the picker scenario). Use existence check on `(careUnitId, createdByUserId, status='utkast', deletedAt=null)` to avoid duplicate seeds across reruns
  </behavior>
  <action>
    Extend `apps/api/prisma/schema.prisma` to add the `OrderStatus` enum (verbatim mirror of `ORDER_STATUSES` from `packages/shared/src/constants/orderStatus.ts` — values: `utkast`, `skickad`, `bekraftad`, `levererad`), the `Order` model (columns per D-62 including dual FKs to User using `@relation(name:…)` to disambiguate, soft-delete `deletedAt`, the three indexes), and the `OrderLine` model (columns per D-63, `onDelete: Cascade` on `orderId`, `onDelete: Restrict` on `careUnitMedicationId`, two indexes). Add matching back-relations to `User` (`createdOrders` / `submittedOrders`) and `CareUnitMedication` (`orderLines`). Triple-slash doc comments reference D-46 / D-48 / D-62 / D-63 and the Phase 4 hook (confirm/deliver).

    Run `cd apps/api && npx prisma migrate dev --name 0004_order_flow_drafts --skip-seed`. Verify it produced a new directory under `apps/api/prisma/migrations/` containing a `migration.sql` that creates the enum + two tables + indexes + FKs. NO raw-SQL hand-edits — the Phase 2 trgm GIN index is reused by Slice 3's picker without any additional Phase 3 SQL.

    Then run `cd apps/api && npx prisma generate` as a defensive follow-up (usually invoked automatically by migrate dev). Confirm `@prisma/client`'s generated types include `Order`, `OrderLine`, `OrderStatus`.

    Extend `apps/api/prisma/seed.ts` to seed one Utkast draft for `sjukskoterska@example.test`: look up her User + CareUnit + three CareUnitMedications (prefer ones with `currentStock < lowStockThreshold` so the demo path includes the LowStockBadge), then create `Order { status: 'utkast', careUnitId, createdByUserId }` + three `OrderLine` rows with `quantity: 1` if no Utkast row for `(careUnitId, createdByUserId)` already exists. Idempotent via existence check.

    This task is [BLOCKING] — Slices 2-4 cannot start until the migration is applied and the Prisma client is regenerated.
  </action>
  <verify>
    <automated>cd apps/api && npx prisma migrate dev --name 0004_order_flow_drafts --skip-seed && npx prisma generate && pnpm --filter @meditrack/api typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `apps/api/prisma/schema.prisma` contains the literal `enum OrderStatus {` followed by `utkast`, `skickad`, `bekraftad`, `levererad` (verified by Grep)
    - `apps/api/prisma/schema.prisma` contains `model Order {` and `model OrderLine {` (verified by Grep)
    - `apps/api/prisma/schema.prisma` contains `@@index([careUnitId, status])` and `@@index([careUnitId, createdAt])` (verified by Grep)
    - `apps/api/prisma/schema.prisma` contains both `@relation(name: "OrderCreatedBy"` and `@relation(name: "OrderSubmittedBy"` (verified by Grep)
    - A new migration directory exists under `apps/api/prisma/migrations/` with a `migration.sql` containing `CREATE TYPE "OrderStatus"` and `CREATE TABLE "Order"` and `CREATE TABLE "OrderLine"` (verified by Grep)
    - `cd apps/api && npx prisma migrate status` reports the new migration as applied
    - `cd apps/api && pnpm typecheck` exits 0 (proves the regenerated `@prisma/client` types compile against the rest of the codebase)
    - After running `pnpm --filter @meditrack/api seed`, `prisma.order.findFirst({ where: { status: 'utkast', deletedAt: null }, include: { createdBy: true, lines: true } })` returns one row whose `createdBy.email === 'sjukskoterska@example.test'` and whose `lines.length === 3`
    - Re-running `pnpm --filter @meditrack/api seed` does NOT create a second Utkast draft (idempotency)
  </acceptance_criteria>
  <done>
    Prisma schema, migration, generated client, and seed all reflect the Order/OrderLine/OrderStatus data model with one seeded Utkast draft visible for the sjukskoterska on a fresh `docker compose up`.
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Extend shared permission tuple + BE PERMISSIONS map with five order:* keys</name>
  <files>packages/shared/src/contracts/permissions.ts, apps/api/src/auth/permissions.ts</files>
  <read_first>
    - packages/shared/src/contracts/permissions.ts — existing `ACTION_KEYS` tuple + the drift-prevention comment (D-15)
    - apps/api/src/auth/permissions.ts — existing `PERMISSIONS: Record<ActionKey, Role[]>` map; this is where the compile-time exhaustiveness check lives
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`apps/api/src/auth/permissions.ts` section) — exact extension pattern + the Phase 4 note that `order:confirm` / `order:deliver` will be apotekare+admin only
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-64) — all three roles on all five `order:*` keys (REQUIREMENTS.md ORD-01..03 has no role restriction)
  </read_first>
  <behavior>
    - `ACTION_KEYS` tuple gains five literals in the order: `'order:read'`, `'order:create'`, `'order:update'`, `'order:submit'`, `'order:delete'`
    - `actionKey = z.enum(ACTION_KEYS)` and `type ActionKey = (typeof ACTION_KEYS)[number]` auto-update without manual edits
    - BE `PERMISSIONS` map gets five entries — each with `['apotekare', 'sjukskoterska', 'admin']` per D-64 / REQUIREMENTS.md ORD-01..03
    - A comment block before the new entries references D-64 + the Phase 4 plan to add `order:confirm` / `order:deliver` as apotekare+admin only
    - `actionsForRole('sjukskoterska')` returns an array that includes all five order keys
  </behavior>
  <action>
    Append the five literals `'order:read'`, `'order:create'`, `'order:update'`, `'order:submit'`, `'order:delete'` to `ACTION_KEYS` in `packages/shared/src/contracts/permissions.ts` (in that order — matches the lifecycle: read, then create, then update lines, then submit, then delete/discard). Add an inline comment referencing D-64.

    Add five matching entries to the `PERMISSIONS` map in `apps/api/src/auth/permissions.ts`, each set to `['apotekare', 'sjukskoterska', 'admin']` per D-64. Add a comment block above the new entries: `// Phase 3 D-64 — order permissions; all three roles per REQUIREMENTS.md ORD-01..03 (no role restriction). Phase 4 adds 'order:confirm' / 'order:deliver' restricted to apotekare+admin.`

    Verify the BE map compiles — TypeScript's `Record<ActionKey, Role[]>` exhaustiveness will fail the build if any literal in `ACTION_KEYS` is missing from `PERMISSIONS`.
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/shared build && pnpm --filter @meditrack/api typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "'order:" packages/shared/src/contracts/permissions.ts` returns 5
    - `grep -c "'order:.*'apotekare', 'sjukskoterska', 'admin'" apps/api/src/auth/permissions.ts` returns 5 (or equivalent multi-line check — every order:* key has all three roles)
    - `pnpm --filter @meditrack/api typecheck` exits 0 (proves `Record<ActionKey, Role[]>` exhaustiveness passed)
    - Quick repl: `node -e "const {actionsForRole} = require('./apps/api/dist/auth/permissions.js'); const keys = actionsForRole('sjukskoterska'); console.log(['order:read','order:create','order:update','order:submit','order:delete'].every(k => keys.includes(k)))"` prints `true` (after `pnpm --filter @meditrack/api build`)
  </acceptance_criteria>
  <done>
    The FE↔BE permission contract carries all five order keys, the BE PERMISSIONS map grants all three roles, and the existing `useAuth().can('order:create')` / `<Can action="order:create">` machinery from Phase 1 immediately works for order surfaces in later slices.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Add order contracts package + OrderLockedError/ValidationFailedError + envelope mappings</name>
  <files>packages/shared/src/contracts/order.ts, packages/shared/src/index.ts, apps/api/src/plugins/errorHandler.ts</files>
  <read_first>
    - packages/shared/src/contracts/medication.ts — analog for the schema-then-type pattern, the `.strict()` modifier on update requests, the section-divider comment style; pattern for `z.coerce.number().int()` on query strings
    - packages/shared/src/contracts/error.ts — `errorEnvelope` shape; `details: z.unknown().optional()` allows free-form details payloads (D-55, D-56)
    - packages/shared/src/index.ts — existing medication block; the order block must follow the same schema-and-type-on-adjacent-lines convention
    - packages/shared/src/constants/orderStatus.ts — re-use `orderStatusEnum` verbatim; do NOT redeclare the enum schema
    - apps/api/src/plugins/errorHandler.ts — existing `NotFoundError` + `ConflictDuplicateMedicationError` classes and the `setErrorHandler` envelope mapping branches (analog for `OrderLockedError` and `ValidationFailedError`)
    - .planning/phases/03-draft-orders/03-PATTERNS.md (`packages/shared/src/contracts/order.ts` and `errorHandler.ts` sections) — exact schema list and error-class shape
    - .planning/phases/03-draft-orders/03-CONTEXT.md (D-55, D-56) — `order_locked` message + 409, `validation_failed` reasons + 422
  </read_first>
  <behavior>
    - `packages/shared/src/contracts/order.ts` exports all of: `orderLineResponse`, `orderResponse`, `orderListItem`, `orderListQuery`, `orderListResponse`, `addOrderLineRequest`, `updateOrderLineRequest`, `createOrderRequest`, `pickerOptionsQuery`, `pickerOption`, `pickerOptionsResponse` — each immediately followed by `export type X = z.infer<typeof x>`
    - `orderResponse` shape contains `id`, `careUnitId`, `createdByUserId`, `status: orderStatusEnum`, `submittedAt: z.string().datetime().nullable()`, `submittedByUserId: z.string().nullable()`, `createdAt`, `updatedAt`, `lines: z.array(orderLineResponse)`, `createdBy: { id, name }`, `submittedBy: { id, name }.nullable()`
    - `orderLineResponse` carries the denormalized read-time join: `id`, `careUnitMedicationId`, `quantity`, `name`, `atcCode`, `form`, `strength: z.string().nullable()`, `currentStock`, `lowStockThreshold` (D-47)
    - `orderListItem` shape: `id`, `status`, `createdAt`, `lineCount`, `totalQuantity`, `createdBy: { id, name }` (D-72 columns)
    - `orderListQuery` defaults `status` to `'utkast'` (D-53) and supports paging stubs (`page`, `pageSize` with `.default()`)
    - `createOrderRequest = z.object({}).strict()` — empty body, rejects stray fields (D-50)
    - `addOrderLineRequest = z.object({ careUnitMedicationId: z.string().min(1), quantity: z.number().int().positive() }).strict()`
    - `updateOrderLineRequest = z.object({ quantity: z.number().int().positive() }).strict()`
    - `pickerOptionsQuery` mirrors `medicationSearchQuery`: `{ q: z.string().min(1), limit: z.coerce.number().int().min(1).max(20).default(20) }`
    - `pickerOption` shape per D-59 / D-61
    - `packages/shared/src/index.ts` re-exports every new schema + inferred type from `contracts/order.ts` in an `order.js` block
    - `OrderLockedError` class in errorHandler: `readonly code = 'order_locked' as const`, default message `'Beställningen kan inte ändras efter att den skickats.'`, optional `details?: { status?: OrderStatus }` constructor arg stashed on the instance
    - `ValidationFailedError` class: `readonly code = 'validation_failed' as const`, accepts `(message, details)` so the submit path can pass `{ reason: 'empty_order' | 'invalid_quantity', lineId?: string }`
    - `setErrorHandler` adds: `OrderLockedError → 409 envelope('order_locked', err.message, err.details)`; `ValidationFailedError → 422 envelope('validation_failed', err.message, err.details)`
    - Existing branches (`NotFoundError → 404`, `ConflictDuplicateMedicationError → 409`, `ForbiddenScopeError → 403`, default Zod → 400) remain intact and ordered before/around the new branches as appropriate
    - TDD: write unit tests under `apps/api/test/contracts.orderEnvelope.test.ts` that exercise the new error classes by instantiating them, throwing through a tiny `setErrorHandler`-style harness, and asserting status + envelope body shape (RED → GREEN). Also a contract round-trip test for `orderResponse.parse(sample)` on the happy-path shape
  </behavior>
  <action>
    Create `packages/shared/src/contracts/order.ts` mirroring `packages/shared/src/contracts/medication.ts` — top-of-file block comment referencing D-08 / D-46..D-49 / D-55 / D-65, then `// ---` section dividers for Status / Lines / Single Order / List / Picker. Export the eleven schemas listed in `<behavior>`, each followed by `export type X = z.infer<typeof x>`. Use `orderStatusEnum` imported from `@meditrack/shared` constants — do NOT redeclare it. `createOrderRequest` is `z.object({}).strict()` (D-50). `addOrderLineRequest` and `updateOrderLineRequest` use `.strict()` to reject mass-assignment (T2 in security_threat_model). `pickerOptionsQuery` is a verbatim mirror of `medicationSearchQuery`. `pickerOption` returns the per-row picker payload per D-59 + D-61.

    Update `packages/shared/src/index.ts` — append an `order.js` block immediately after the medication block, re-exporting every schema + inferred type on adjacent lines per the existing precedent.

    Update `apps/api/src/plugins/errorHandler.ts` — add two new error classes mirroring `NotFoundError`'s shape:
      - `OrderLockedError extends Error` with `readonly code = 'order_locked' as const`, default message `'Beställningen kan inte ändras efter att den skickats.'`, optional `details?: { status?: OrderStatus }` constructor arg stored on the instance
      - `ValidationFailedError extends Error` with `readonly code = 'validation_failed' as const`, `constructor(message: string, public readonly details?: { reason: 'empty_order' | 'invalid_quantity'; lineId?: string })`
    Then add envelope-mapping branches inside `setErrorHandler`: `OrderLockedError → reply.status(409).send(envelope('order_locked', err.message, err.details))`, `ValidationFailedError → reply.status(422).send(envelope('validation_failed', err.message, err.details))`. Order matters — both branches must come BEFORE the generic Zod-validation fallthrough so they're not swallowed (D-56 explicitly overrides the Zod 400 with 422 for the submit path).

    TDD before implementation: in `apps/api/test/contracts.orderEnvelope.test.ts` write `it`s that
      1. Throw `OrderLockedError` and assert the constructed error has `code === 'order_locked'` + `details?.status` round-trips
      2. Throw `ValidationFailedError({ reason: 'empty_order' })` and assert `details.reason === 'empty_order'`
      3. Round-trip a sample `orderResponse` through `orderResponse.parse(...)` to confirm the shape compiles
    Run the failing tests, implement, confirm GREEN.
  </action>
  <verify>
    <automated>pnpm --filter @meditrack/shared build && pnpm --filter @meditrack/api typecheck && pnpm --filter @meditrack/api test --run apps/api/test/contracts.orderEnvelope.test.ts</automated>
  </verify>
  <acceptance_criteria>
    - `packages/shared/src/contracts/order.ts` exports literals `orderResponse`, `orderListItem`, `orderListQuery`, `orderListResponse`, `addOrderLineRequest`, `updateOrderLineRequest`, `createOrderRequest`, `pickerOptionsQuery`, `pickerOption`, `pickerOptionsResponse`, `orderLineResponse` — `grep -c "^export const \(orderResponse\|orderListItem\|orderListQuery\|orderListResponse\|addOrderLineRequest\|updateOrderLineRequest\|createOrderRequest\|pickerOptionsQuery\|pickerOption\|pickerOptionsResponse\|orderLineResponse\) =" packages/shared/src/contracts/order.ts` returns 11
    - `packages/shared/src/contracts/order.ts` does NOT redeclare `orderStatusEnum` — `grep -c "orderStatusEnum =" packages/shared/src/contracts/order.ts` returns 0; `grep -c "from.*orderStatus" packages/shared/src/contracts/order.ts` returns ≥1
    - `apps/api/src/plugins/errorHandler.ts` contains `class OrderLockedError` and `class ValidationFailedError` (Grep)
    - `apps/api/src/plugins/errorHandler.ts` contains both `err instanceof OrderLockedError` and `err instanceof ValidationFailedError` inside `setErrorHandler` (Grep)
    - `pnpm --filter @meditrack/api test --run apps/api/test/contracts.orderEnvelope.test.ts` exits 0; the new test file contains ≥3 `it(` blocks
    - `pnpm --filter @meditrack/shared build` exits 0
    - `pnpm --filter @meditrack/api typecheck` exits 0
    - `import { orderResponse, addOrderLineRequest, pickerOption } from '@meditrack/shared'` resolves (verified by importing into the test file)
  </acceptance_criteria>
  <done>
    Slices 2-4 can `import { orderResponse, addOrderLineRequest, … } from '@meditrack/shared'`, route services can `throw new OrderLockedError({ status: 'skickad' })` and get a canonical 409 envelope, and the submit path can `throw new ValidationFailedError('…', { reason: 'empty_order' })` and get 422 with `details`.
  </done>
</task>

</tasks>

<threat_model>

## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Client → API | Untrusted request bodies cross at every order endpoint (Slices 2-4 use the contracts and error classes added here) |
| Application → DB | Service layer is the only writer for `Order.status`, `Order.submittedAt`, `Order.submittedByUserId`, `Order.careUnitId`, `Order.createdByUserId` |
| Cross-careUnit | One user from CareUnit A must not be able to read/edit an Order in CareUnit B |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-03-01 | Information Disclosure | Cross-careUnit Order access (T1 in planning context) | mitigate | Schema-level: `Order.careUnitId` column + `@@index([careUnitId, status])` ensures every service-layer where-clause can scope efficiently. Slice 2-4 service code MUST include `careUnitId` in every where-clause and return 404 (not 403) on mismatch per D-73 — that mitigation is implemented in Slices 2-4; this slice ensures the schema/index enables it |
| T-03-02 | Tampering | Mass-assignment on order request bodies (T2) | mitigate | All Phase 3 request schemas (`createOrderRequest`, `addOrderLineRequest`, `updateOrderLineRequest`) use Zod `.strict()` so stray fields like `status`, `careUnitId`, `submittedByUserId` are rejected at the route boundary before reaching the service |
| T-03-03 | Tampering / Race | TOCTOU on Order edits or submit (T3) | mitigate | Schema-level support: `OrderStatus` enum, `Order.deletedAt`, indexes. The actual atomic-UPDATE pattern with `WHERE id = ? AND status = 'utkast'` is implemented by Slices 3-4 services that throw `OrderLockedError` (registered here). This slice provides the error type with `details: { status }` so the FE can react to the precise loser state |
| T-03-04 | Elevation of Privilege | Permission gate bypass on `order:submit` (T4) | mitigate | `order:submit` literal added to `ACTION_KEYS` so the FE `<Can action="order:submit">` autocompletes and the BE `requirePermission('order:submit')` preHandler (added by Slices 3-4) can reference it; `Record<ActionKey, Role[]>` compile-time exhaustiveness blocks accidental omission |
| T-03-05 | Injection | SQL injection on picker typeahead (T5) | accept | Schema/contract level: not applicable. The picker `q` parameter is validated by Zod (`pickerOptionsQuery.q = z.string().min(1)`) and consumed by Prisma's parameterized `contains` mode in Slice 3 — no raw SQL anywhere |
| T-03-SC | Tampering | npm/pnpm installs of new packages | accept | No new external npm/pnpm packages installed in this slice — only schema/contract/error-handler edits using already-installed deps (`@prisma/client`, `zod`, `fastify`). Package legitimacy gate not triggered |
</threat_model>

<verification>
- Migration applied: `cd apps/api && npx prisma migrate status` shows `0004_order_flow_drafts` as applied
- Schema compiles: `cd apps/api && npx prisma validate` exits 0
- Generated client carries new types: `pnpm --filter @meditrack/api typecheck` exits 0
- Shared package builds with new contracts: `pnpm --filter @meditrack/shared build` exits 0
- Error envelope unit tests pass: `pnpm --filter @meditrack/api test --run apps/api/test/contracts.orderEnvelope.test.ts` exits 0
- Permission map covers every order:* key: `cd apps/api && pnpm typecheck` exits 0 (drift-prevention satisfied)
- Seed produces an Utkast draft for sjukskoterska: a fresh `pnpm --filter @meditrack/api seed` followed by a Prisma client query finds one
- Whole-monorepo build proves nothing else broke: `pnpm -r build` exits 0
</verification>

<success_criteria>
- `Order` + `OrderLine` + `OrderStatus` exist as Prisma artifacts and a single new migration is in `apps/api/prisma/migrations/`
- `@meditrack/shared` exports the eleven new order Zod schemas + inferred types
- The five `order:*` action keys exist in `ACTION_KEYS`, are wired into the BE `PERMISSIONS` map for all three roles, and the FE `<Can action="order:create">` autocompletes them
- `OrderLockedError` (409) and `ValidationFailedError` (422) classes are registered in `errorHandler.ts` with details-preserving envelope mappings
- Seed produces one Utkast draft for `sjukskoterska@example.test` (idempotent across reruns)
- All existing Phase 1+2 tests still pass: `pnpm -r test --run` exits 0
</success_criteria>

<output>
Create `.planning/phases/03-draft-orders/03-01-SUMMARY.md` when done — capture the migration filename, the exact additions to `ACTION_KEYS`, the seeded draft id (for downstream demo reference), and any deviations from the planned schema/contract shapes.
</output>
