# Phase 6: AI Categorization & Low-Stock Notifications — Pattern Map

**Mapped:** 2026-05-23
**Phase directory:** `.planning/phases/06-ai-categorization-low-stock-notifications/`
**Source of truth:** `06-CONTEXT.md` (D-106..D-120) — no RESEARCH.md (per-phase research disabled in `.planning/config.json`)
**Files analyzed:** ~30 (new + edited) / Analogs found: 30 / 30 (one new pattern flagged: Anthropic SDK call)

---

## File Classification

Grouped by layer. Each row lists role / data-flow / closest analog / match quality.

### DB / Migration

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/prisma/migrations/0012_medication_therapeutic_class/migration.sql` (NEW) | migration | DDL (CREATE TYPE + ALTER TABLE + CREATE INDEX) | `apps/api/prisma/migrations/20260521203032_0004_order_flow_drafts/migration.sql` (CreateEnum `OrderStatus` + index) | exact |
| `apps/api/prisma/schema.prisma` (EDIT) | model | Prisma schema enum + nullable column + `@@index` | existing `Medication` model (lines 105–118) + `OrderStatus` enum (lines 161–166) | exact |

### Shared Contracts (`@meditrack/shared`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `packages/shared/src/constants/therapeuticClass.ts` (NEW) | constant + Swedish label map | string-union + `Record<…, string>` | `packages/shared/src/constants/orderStatus.ts` AND `auditAction.ts` | exact |
| `packages/shared/src/contracts/ai.ts` (NEW) | Zod contract | request/response schemas | `packages/shared/src/contracts/audit.ts` (cursor + list shape) and `medication.ts` (typed request bodies) | role-match |
| `packages/shared/src/contracts/dashboard.ts` (NEW) | Zod contract | list response | `medicationListResponse` in `medication.ts` (rows + total envelope) | exact |
| `packages/shared/src/contracts/medication.ts` (EDIT) | Zod contract | extend list item + queries + create/update bodies | self — extend existing `medicationListItem` / `medicationListQuery` / `medicationUpdateRequest` etc. | exact |
| `packages/shared/src/contracts/permissions.ts` (EDIT) | Zod enum | append `'ai:suggest'` | self — `ACTION_KEYS` union (lines 22–41) | exact |

### API Service Layer (`apps/api/src/services`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/src/services/aiCategorization.service.ts` (NEW) | service (single-seam, D-106) | request-response over HTTP → Anthropic Messages API | `apps/api/src/services/medication.service.ts` for module header pattern; **Anthropic SDK call has no prior analog — net-new** | partial (header/style match; HTTP-out-to-LLM is new pattern) |
| `apps/api/src/services/dashboard.service.ts` (NEW) | service | CRUD-read via `$queryRaw` cross-column predicate | `medication.service.ts:listMedicationsForUnit` `$queryRaw` block (lines 170–177 — `currentStock < lowStockThreshold`) | exact |
| `apps/api/src/services/medication.service.ts` (EDIT) | service | extend filter chain + persistence | self — `listMedicationsForUnit` filter block (lines 89–101) + `createCareUnitMedication` + `updateCareUnitMedication` | exact |
| `apps/api/src/auth/permissions.ts` (EDIT) | RBAC map | append `'ai:suggest': ['apotekare', 'admin']` | self — `PERMISSIONS` record (lines 21–42) | exact |
| `apps/api/src/db/auditAllowlist.ts` (EDIT) | allowlist | add `'therapeuticClass'` to Medication entry | self — `AUDIT_ALLOWLIST.Medication` (lines 54–63) | exact |
| `apps/api/src/env.ts` (EDIT) | env validator | add `ANTHROPIC_API_KEY: z.string().optional()` to envSchema | self — envSchema (lines 7–16) | exact |

### API Route Layer (`apps/api/src/routes`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/src/routes/ai/suggest.ts` (NEW) | Fastify route | POST request-response | `apps/api/src/routes/audit/list.ts` (file-per-endpoint, D-65) + `routes/medications/create.ts` (POST body schema) | exact |
| `apps/api/src/routes/ai/index.ts` (NEW) | route registrar | barrel | `apps/api/src/routes/audit/index.ts` | exact |
| `apps/api/src/routes/dashboard/lowStock.ts` (NEW) | Fastify route | GET list | `apps/api/src/routes/audit/filters.ts` (GET, requireSession only) + `routes/medications/list.ts` (careUnitId-first service call) | exact |
| `apps/api/src/routes/dashboard/index.ts` (NEW) | route registrar | barrel | `apps/api/src/routes/audit/index.ts` | exact |
| `apps/api/src/app.ts` (EDIT) | composition | register two new route groups | self — `await app.register(auditRoutes);` block (lines 96–105) | exact |

### API Integration Tests (`apps/api/test`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/api/test/aiCategorization.integration.test.ts` (NEW) | integration test | mock LLM seam + RBAC matrix + timeout path | `apps/api/test/audit.integration.test.ts` (multi-block describe, RBAC matrix); test bootstrap from `helpers/buildTestApp.ts` | role-match (mock-the-seam pattern is fresh but bootstrap is identical) |
| `apps/api/test/dashboard.integration.test.ts` (NEW) | integration test | cross-tenant isolation + post-mutation refetch shape | `apps/api/test/audit.integration.test.ts` (Test 6 RBAC) + `orders.deliver.integration.test.ts` (post-deliver stock assertion pattern) | exact |

### Web Features (Query/Mutation Hooks, `apps/web/src/features`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/src/features/ai/useSuggestTherapeuticClass.ts` (NEW) | TanStack `useMutation` | request-response | `apps/web/src/features/orders/useOrderMutations.ts:useDeliverOrder` (lines 343–393 — `useMutation<OrderResponse, ApiError, …>`) | exact |
| `apps/web/src/features/ai/useAiAvailability.ts` (NEW) | TanStack `useQuery` | read | `apps/web/src/auth/useAuth.ts` (`useQuery<MeResponse>({ queryKey: ['me'], queryFn: fetchMe })`) | exact |
| `apps/web/src/features/dashboard/useLowStockQuery.ts` (NEW) | TanStack `useQuery` | read with `refetchInterval` + `refetchOnWindowFocus` | `apps/web/src/features/medications/useMedicationsQuery.ts:useMedicationsQuery` (lines 23–37) | exact |
| `apps/web/src/features/orders/useOrderMutations.ts` (EDIT, line ~358) | hook extension | add sibling invalidate | self — `useDeliverOrder.onSuccess` already invalidates `['medications']` at line 358; add `['dashboard', 'low-stock']` alongside | exact |
| `apps/web/src/features/medications/useMedicationMutations.ts` (EDIT) | hook extension | add sibling invalidate to create/update/delete `onSuccess` | self — three existing `onSuccess` blocks: `useCreateMedication` (line 44), `useUpdateMedication` (line 77), `useDeleteMedication` (line 202) | exact |

### Web Components (`apps/web/src/components`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/src/components/AiSuggestionChip.tsx` (NEW) | display component | read-only chip with callback | `apps/web/src/components/LowStockBadge.tsx` (inline-flex chip) + `NplBadge.tsx` (with children + secondary tone) | exact |
| `apps/web/src/components/ConfidenceBadge.tsx` (NEW) | variant-mapping wrapper | display | `apps/web/src/components/RoleBadge.tsx` (lines 16–43 — `ROLE_LABEL` + `ROLE_CLASS` maps + `<span>` render) AND `AuditActionChip.tsx` (lines 21–54 — class-by-key map + fallback) | exact |

### Web Routes (`apps/web/src/routes`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx` (NEW) | route component | render query result with empty/error states | `apps/web/src/routes/lakemedel/LowStockBanner.tsx` (banner styling) + `EmptyStateCard.tsx` (celebratory empty state container) | role-match |
| `apps/web/src/routes/dashboard/DashboardPage.tsx` (EDIT) | route shell | replace stub with new component | self — single-line stub (line 14) | exact |
| `apps/web/src/routes/lakemedel/MedicationSheet.tsx` (EDIT) | form route component | extend form state + add AI block | self — existing sheet imports + form state (lines 1–99) | exact |
| `apps/web/src/routes/lakemedel/LakemedelFilter.tsx` (EDIT) | filter bar | add fourth combobox left of ATC | self — existing ATC combobox (lines 145–214 — Popover+Command recipe) | exact |

### Web Tests (`apps/web/src/routes/**/__tests__`)

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/src/routes/lakemedel/__tests__/MedicationSheet.ai.test.tsx` (NEW) | route test | mock hooks + interaction | `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx` (vi.mock for `useAuth` + feature hooks; `renderWithProviders`) | exact |
| `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx` (NEW) | route test | render states + query config assertion | `bestallningar/__tests__/BestallningarPage.test.tsx` + `DiscardDraftDialog.test.tsx` (state-by-prop render) | exact |

### Infra / Env

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `.env.example` (EDIT — file exists at repo root) | env template | add documented optional variable | self — existing `RATE_LIMIT_*` block in `docker-compose.yml` is the precedent for optional env vars | exact |
| `docker-compose.yml` (EDIT) | infra | add `ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}` to `api` service env block | self — `COOKIE_SECRET: ${COOKIE_SECRET:-…}` (line 47) and `RATE_LIMIT_*` (lines 55–56) | exact |
| `apps/api/prisma/seed.ts` (NOT EDITED — for-reference only) | seed | per CONTEXT.md no backfill in Phase 6 | n/a — flagged for v2 only | n/a |

---

## Pattern Assignments

Per-file concrete excerpts. Numbered line ranges are FROM the analog — Phase 6 copies the shape, not the literal data.

---

### 1. `apps/api/prisma/migrations/0012_medication_therapeutic_class/migration.sql` (NEW) — migration / DDL

**Analog:** `apps/api/prisma/migrations/20260521203032_0004_order_flow_drafts/migration.sql`

**Enum-creation pattern** (lines 1–2):

```sql
-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('utkast', 'skickad', 'bekraftad', 'levererad');
```

**Phase 6 delta:** Replace the enum name with `TherapeuticClass` and use the 14-value uppercase set from D-113:

```sql
-- CreateEnum
CREATE TYPE "TherapeuticClass" AS ENUM ('A','B','C','D','G','H','J','L','M','N','P','R','S','V');
```

**Index pattern** (lines 45–53 of analog):

```sql
-- CreateIndex
CREATE INDEX "Order_careUnitId_status_idx" ON "Order"("careUnitId", "status");
```

**Phase 6 delta:** add nullable column to existing table + single-column index per D-115 / D-117:

```sql
-- Add nullable column to existing Medication table.
ALTER TABLE "Medication" ADD COLUMN "therapeuticClass" "TherapeuticClass";

-- CreateIndex (supports the filter combobox + future bulk queries).
CREATE INDEX "Medication_therapeuticClass_idx" ON "Medication"("therapeuticClass");
```

**Watch-out from `20260522181022_0007_audit_events/migration.sql` (lines 50–68):** every Prisma-generated migration that touches `Medication` may emit a spurious `DROP INDEX "Medication_name_trgm_idx"` followed by a recreate. If `prisma migrate dev` produces that diff for the 0012 migration, KEEP the DROP+RECREATE block verbatim per the convention established in 0004 and 0007.

---

### 2. `apps/api/prisma/schema.prisma` (EDIT) — model

**Analog (existing in same file):** the `Medication` model block (lines 105–118):

```prisma
model Medication {
  id                  String               @id @default(cuid())
  nplId               String?              @unique
  name                String
  atcCode             String
  form                String
  strength            String?
  source              MedicationSource
  createdAt           DateTime             @default(now())
  careUnitMedications CareUnitMedication[]

  @@index([atcCode])
}
```

**Existing `OrderStatus` enum block** (lines 161–166) as the shape template:

```prisma
enum OrderStatus {
  utkast
  skickad
  bekraftad
  levererad
}
```

**Phase 6 delta:**

1. Add `enum TherapeuticClass { A B C D G H J L M N P R S V }` (uppercase per D-113; the Prisma enum and Postgres enum literals must match exactly — Prisma generates the same `CREATE TYPE` SQL).
2. Add `therapeuticClass TherapeuticClass?` to `Medication` (nullable per D-115).
3. Add `@@index([therapeuticClass])` (single-column, supports the new filter combobox per D-117 + the dashboard service `JOIN` predicate).

---

### 3. `packages/shared/src/constants/therapeuticClass.ts` (NEW) — string union + Swedish label map

**Analog:** `packages/shared/src/constants/orderStatus.ts` (full file, 19 lines):

```typescript
import { z } from 'zod';

export const ORDER_STATUSES = ['utkast', 'skickad', 'bekraftad', 'levererad'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orderStatusEnum = z.enum(ORDER_STATUSES);

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  utkast: 'Utkast',
  skickad: 'Skickad',
  bekraftad: 'Bekräftad',
  levererad: 'Levererad',
};
```

**Stronger second analog:** `packages/shared/src/constants/auditAction.ts` (header doc-comment pattern + the labels-by-key pattern at lines 56–68):

```typescript
export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Skapad',
  update: 'Uppdaterad',
  ...
};
```

**Phase 6 delta:** Verbatim shape — only the data changes:

```typescript
export const THERAPEUTIC_CLASSES = [
  'A', 'B', 'C', 'D', 'G', 'H', 'J', 'L', 'M', 'N', 'P', 'R', 'S', 'V',
] as const;
export type TherapeuticClass = (typeof THERAPEUTIC_CLASSES)[number];
export const therapeuticClassEnum = z.enum(THERAPEUTIC_CLASSES);
export const THERAPEUTIC_CLASS_LABELS: Record<TherapeuticClass, string> = {
  A: 'Mag–tarm och ämnesomsättning',
  B: 'Blod och blodbildande organ',
  C: 'Hjärta och kretslopp',
  D: 'Hud',
  G: 'Urin- och könsorgan, sexualhormoner',
  H: 'Hormonsystemet (exkl. könshormoner)',
  J: 'Antiinfektiva för systemiskt bruk',
  L: 'Tumörer och immunmodulering',
  M: 'Muskler och skelett',
  N: 'Nervsystemet',
  P: 'Antiparasitära medel',
  R: 'Andningsorganen',
  S: 'Ögon och öron',
  V: 'Övrigt',
};
```

Doc header: copy the "Pattern: mirrors orderStatus.ts" framing from `auditAction.ts:1–16`.

Must be re-exported from `packages/shared/src/index.ts` (the barrel — verify by grepping `auditAction.ts` export site).

---

### 4. `packages/shared/src/contracts/ai.ts` (NEW) — Zod request/response

**Analog:** `packages/shared/src/contracts/medication.ts` (header pattern + `medicationCreateUserRequest` body shape, lines 153–161):

```typescript
export const medicationCreateUserRequest = z.object({
  source: z.literal('user'),
  name: z.string().min(1),
  atcCode: z.string().min(1),
  ...
});
export type MedicationCreateUserRequest = z.infer<typeof medicationCreateUserRequest>;
```

**Phase 6 delta:**

```typescript
import { z } from 'zod';
import { therapeuticClassEnum, type TherapeuticClass } from '../constants/therapeuticClass.js';

export const aiSuggestionRequest = z.object({
  name: z.string().min(1),
  atcCode: z.string().min(1),
});
export type AiSuggestionRequest = z.infer<typeof aiSuggestionRequest>;

export const aiSuggestionResponse = z.object({
  therapeuticClass: therapeuticClassEnum,
  confidence: z.enum(['hog', 'medel', 'lag']),
});
export type AiSuggestionResponse = z.infer<typeof aiSuggestionResponse>;

// Claude's-discretion option (D-108): availability check.
export const aiStatusResponse = z.object({
  available: z.boolean(),
});
export type AiStatusResponse = z.infer<typeof aiStatusResponse>;
```

Doc header: copy "D-08 Zod schemas in shared … FE↔BE contract" framing from `audit.ts:1–28`.

Re-export from `packages/shared/src/index.ts`.

---

### 5. `packages/shared/src/contracts/dashboard.ts` (NEW) — Zod list response

**Analog:** `packages/shared/src/contracts/medication.ts:medicationListItem` + `medicationListResponse` (lines 34–85):

```typescript
export const medicationListItem = z.object({
  careUnitMedicationId: z.string(),
  medicationId: z.string(),
  name: z.string(),
  atcCode: z.string(),
  form: z.string(),
  strength: z.string().nullable(),
  currentStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().positive(),
  source: z.enum(['npl', 'user']),
});

export const medicationListResponse = z.object({
  rows: z.array(medicationListItem),
  total: z.number().int().nonnegative(),
  belowThresholdTotal: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
```

**Phase 6 delta:** Narrower shape per D-120 — no pagination, no `belowThresholdTotal`, only the rows + total the banner needs:

```typescript
export const lowStockItem = z.object({
  careUnitMedicationId: z.string(),
  medicationId: z.string(),
  name: z.string(),
  currentStock: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().positive(),
  therapeuticClass: therapeuticClassEnum.nullable(),
});
export type LowStockItem = z.infer<typeof lowStockItem>;

export const lowStockListResponse = z.object({
  rows: z.array(lowStockItem),
  total: z.number().int().nonnegative(),
});
export type LowStockListResponse = z.infer<typeof lowStockListResponse>;
```

Re-export from `packages/shared/src/index.ts`.

---

### 6. `packages/shared/src/contracts/medication.ts` (EDIT)

**Analog:** self.

**Edit point 1** — `medicationListItem` (lines 34–44). Add one field:

```typescript
// existing:
source: z.enum(['npl', 'user']),
// add (preserve the existing closing }):
therapeuticClass: therapeuticClassEnum.nullable(),
```

**Edit point 2** — `medicationListQuery` (lines 59–69). Add one optional filter param:

```typescript
// existing optional filter fields end at:
belowThreshold: z.enum(['true', 'false']).transform(...).optional(),
// add:
therapeuticClass: therapeuticClassEnum.optional(),
// (keep page/pageSize at the bottom unchanged)
```

**Edit point 3** — `medicationUpdateRequest` (lines 191–207). Add one optional nullable field inside the `.strict()`:

```typescript
strength: z.string().nullable().optional(),
// add:
therapeuticClass: therapeuticClassEnum.nullable().optional(),
```

**Edit point 4** — `medicationCreateUserRequest` and `medicationCreateFromNplRequest` (lines 140–161). Add the same optional nullable field to BOTH literals so the discriminatedUnion compiles.

Add `import { therapeuticClassEnum } from '../constants/therapeuticClass.js';` at the top.

---

### 7. `packages/shared/src/contracts/permissions.ts` (EDIT)

**Analog:** self — append-only pattern documented inline at lines 7–21:

```typescript
export const ACTION_KEYS = [
  'admin:ping',
  'medication:read',
  ...
  'audit:read',
] as const;
```

**Phase 6 delta:** Append `'ai:suggest'` after `'audit:read'`:

```typescript
  // Phase 5 D-15 — admin-only audit log read.
  'audit:read',
  // Phase 6 D-15 — AI categorization; apotekare + admin.
  'ai:suggest',
] as const;
```

**Drift-prevention guarantee (D-15):** This file change will fail to compile until `apps/api/src/auth/permissions.ts`'s `PERMISSIONS: Record<ActionKey, Role[]>` map adds an entry. Do both edits in the same commit.

---

### 8. `apps/api/src/services/aiCategorization.service.ts` (NEW) — single-seam LLM service (D-106)

**Header pattern analog:** `apps/api/src/services/medication.service.ts:1–40` (full header doc) and `audit.service.ts:1–37` (D-16 exception documentation):

```typescript
import type { Medication, CareUnitMedication } from '@prisma/client';
import { prisma } from '../db/client.js';
import { ConflictDuplicateMedicationError, NotFoundError, ForbiddenScopeError } from '../plugins/errorHandler.js';
import type { MedicationListResponse, ... } from '@meditrack/shared';

/**
 * Pattern D / D-16 — careUnitId-first service layer for medication CRUD.
 *
 * D-16: `careUnitId` is the FIRST argument on every service function. ...
 */
```

**Phase 6 delta — net-new pattern (no analog for the Anthropic SDK call):**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env.js';
import type { TherapeuticClass, AiSuggestionRequest, AiSuggestionResponse } from '@meditrack/shared';
import { ValidationFailedError } from '../plugins/errorHandler.js'; // base; AiSuggestionError defined here

/**
 * Phase 6 D-106 / SC #4 — single-seam LLM service.
 *
 * D-16 EXCEPTION: per-medication, not per-careUnit. Document explicitly.
 * D-107: env.ANTHROPIC_API_KEY is OPTIONAL — isAvailable() gates everything.
 * D-111: confidence band mapping happens HERE (server-side), not on the wire.
 * D-112: 5s AbortController; route maps to 504 ai_timeout.
 */
const categorizerImpl = { /* private; the swap-point */ };

export function isAvailable(): boolean {
  return env.ANTHROPIC_API_KEY !== undefined && env.ANTHROPIC_API_KEY.length > 0;
}

export async function suggestTherapeuticClass(
  input: AiSuggestionRequest,
): Promise<AiSuggestionResponse> { ... }
```

**Error class pattern (analog `apps/api/src/plugins/errorHandler.ts:23–67`):**

```typescript
export class InvalidCredentialsError extends Error {
  readonly code = 'invalid_credentials' as const;
  constructor() { super('Invalid credentials'); this.name = 'InvalidCredentialsError'; }
}
```

**Phase 6 deltas in `errorHandler.ts` (also EDIT):**

```typescript
export class AiUnavailableError extends Error {
  readonly code = 'ai_unavailable' as const;
  constructor() {
    super('AI-tjänsten är inte tillgänglig.');
    this.name = 'AiUnavailableError';
  }
}
export class AiTimeoutError extends Error {
  readonly code = 'ai_timeout' as const;
  constructor() {
    super('AI-förslaget tog för lång tid.');
    this.name = 'AiTimeoutError';
  }
}
```

These two new codes go into the `setErrorHandler` mapping alongside the existing `InvalidCredentialsError` etc. The `details.reason` discriminator on `ValidationFailedError` at `errorHandler.ts:100` is the model for any future structured details on these errors.

---

### 9. `apps/api/src/services/dashboard.service.ts` (NEW) — low-stock list service

**Analog:** `apps/api/src/services/medication.service.ts:listMedicationsForUnit` $queryRaw block (lines 170–177):

```typescript
const belowThresholdTotal = await prisma.$queryRaw<Array<{ count: bigint }>>`
  SELECT COUNT(*) AS count
  FROM "CareUnitMedication" cum
  JOIN "Medication" m ON cum."medicationId" = m."id"
  WHERE cum."careUnitId" = ${careUnitId}
    AND cum."deletedAt" IS NULL
    AND cum."currentStock" < cum."lowStockThreshold"
`;
```

**Phase 6 delta — full enumeration variant (not just count), sorted by urgency (D-117):**

```typescript
import { prisma } from '../db/client.js';
import { ForbiddenScopeError } from '../plugins/errorHandler.js';
import type { LowStockListResponse, LowStockItem } from '@meditrack/shared';

/**
 * D-16: careUnitId is the FIRST arg.
 * D-117: sort by currentStock/lowStockThreshold ASC (most urgent first).
 * D-120: returns { rows, total } — no pagination.
 */
export async function listLowStockForUnit(careUnitId: string): Promise<LowStockListResponse> {
  const rows = await prisma.$queryRaw<Array<{
    careUnitMedicationId: string;
    medicationId: string;
    name: string;
    currentStock: number;
    lowStockThreshold: number;
    therapeuticClass: TherapeuticClass | null;
  }>>`
    SELECT cum."id" AS "careUnitMedicationId",
           m."id" AS "medicationId",
           m."name",
           cum."currentStock",
           cum."lowStockThreshold",
           m."therapeuticClass"
    FROM "CareUnitMedication" cum
    JOIN "Medication" m ON cum."medicationId" = m."id"
    WHERE cum."careUnitId" = ${careUnitId}
      AND cum."deletedAt" IS NULL
      AND cum."currentStock" < cum."lowStockThreshold"
    ORDER BY (cum."currentStock"::float / cum."lowStockThreshold"::float) ASC,
             m."name" ASC
  `;
  return { rows, total: rows.length };
}
```

**Scope-assertion pattern (medication.service.ts:188–193):** the `$queryRaw` already filters on `careUnitId = ${careUnitId}` so a defensive loop is not strictly necessary here (the query cannot return cross-tenant rows), but match the codebase by including the assertion if any non-parameterized SQL is added later.

---

### 10. `apps/api/src/services/medication.service.ts` (EDIT)

**Analog:** self — multiple edit points.

**Edit point A** — extend `listMedicationsForUnit` filter chain (lines 89–101):

```typescript
// existing pattern:
const medicationWhereConditions: Record<string, unknown> = {};

if (q) {
  medicationWhereConditions.name = { contains: q, mode: 'insensitive' };
}
if (atc) {
  medicationWhereConditions.atcCode = { startsWith: atc, mode: 'insensitive' };
}
if (form === OVRIGA_FILTER_VALUE) { ... }
```

**Phase 6 delta — append one branch:**

```typescript
if (filters.therapeuticClass) {
  medicationWhereConditions.therapeuticClass = filters.therapeuticClass;
}
```

Mirror the same branch inside the `belowThreshold` `$queryRaw` path (lines 125–146) — add a parameterised `m."therapeuticClass" = $N` clause.

**Edit point B** — extend `createCareUnitMedication` (lines 308–385) and `updateCareUnitMedication` (lines 407–481):

- For `source === 'user'` create: pass `therapeuticClass: payload.therapeuticClass ?? null` into the `tx.medication.create({ data: ... })` call.
- For `source === 'npl'`: per D-32 carve-out documented in D-115 — `therapeuticClass` IS editable on NPL meds (classification is metadata, not pharmaceutical identity). Add it to the medData write path in `updateCareUnitMedication` unconditionally (NOT inside the `if (row.medication.source === 'user')` block).

Document the D-32 carve-out in the function header comment.

**Edit point C** — extend `toListItem` (lines 52–64):

```typescript
return {
  careUnitMedicationId: row.id,
  medicationId: row.medicationId,
  ...
  source: row.medication.source as 'npl' | 'user',
  therapeuticClass: row.medication.therapeuticClass, // NEW Phase 6
};
```

---

### 11. `apps/api/src/auth/permissions.ts` (EDIT)

**Analog:** self (full file shown above).

**Phase 6 delta** — single line addition inside the `PERMISSIONS` map:

```typescript
  // Phase 5 D-15 — admin-only audit log read.
  'audit:read': ['admin'],
  // Phase 6 D-15 — apotekare + admin can fetch AI suggestions.
  'ai:suggest': ['apotekare', 'admin'],
};
```

The `Record<ActionKey, Role[]>` type enforces that this entry exists once `'ai:suggest'` is added to `ACTION_KEYS` — the drift-prevention guarantee from D-15.

---

### 12. `apps/api/src/db/auditAllowlist.ts` (EDIT)

**Analog:** self — `AUDIT_ALLOWLIST.Medication` (lines 54–63):

```typescript
Medication: [
  'id',
  'nplId',
  'name',
  'atcCode',
  'form',
  'strength',
  'source',
  'createdAt',
],
```

**Phase 6 delta — append one entry:**

```typescript
Medication: [
  'id',
  'nplId',
  'name',
  'atcCode',
  'form',
  'strength',
  'source',
  'createdAt',
  'therapeuticClass', // Phase 6 — D-95 diff-at-read surfaces this on update events.
],
```

This single edit gives D-95 audit coverage for free. No new audit action needed (the existing `update` event captures before/after).

---

### 13. `apps/api/src/env.ts` (EDIT)

**Analog:** self (full file, 30 lines):

```typescript
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});
```

**Phase 6 delta — append optional key (D-107 — NO `.min(1)`):**

```typescript
const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  COOKIE_SECRET: z.string().min(16, 'COOKIE_SECRET must be at least 16 characters'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  // Phase 6 D-107 — OPTIONAL. When undefined, the AI affordance hides itself
  // (isAvailable() returns false). `docker compose up` on a fresh clone works
  // without setting this; AI degrades gracefully.
  ANTHROPIC_API_KEY: z.string().optional(),
});
```

---

### 14. `apps/api/src/routes/ai/suggest.ts` (NEW)

**Analog:** `apps/api/src/routes/medications/create.ts` (full file, 39 lines — POST with body + permission):

```typescript
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { medicationCreateRequest, medicationListItem } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { createCareUnitMedication } from '../../services/medication.service.js';

export async function createMedicationRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.post(
    '/api/medications',
    {
      preHandler: [requireSession, requirePermission('medication:create')],
      schema: {
        body: medicationCreateRequest,
        response: { 201: medicationListItem },
      },
    },
    async (req, reply) => {
      const row = await createCareUnitMedication(req.user!.careUnitId, req.body);
      reply.status(201);
      return row;
    },
  );
}
```

**Phase 6 delta:**

```typescript
import { aiSuggestionRequest, aiSuggestionResponse } from '@meditrack/shared';
import { isAvailable, suggestTherapeuticClass } from '../../services/aiCategorization.service.js';
import { AiUnavailableError } from '../../plugins/errorHandler.js';

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
```

`AiTimeoutError` is thrown from within `suggestTherapeuticClass`; the `errorHandlerPlugin` translates both to 503/504 envelopes per D-19.

---

### 15. `apps/api/src/routes/ai/index.ts` (NEW)

**Analog:** `apps/api/src/routes/audit/index.ts` (full file, 17 lines):

```typescript
import type { FastifyInstance } from 'fastify';
import { listAuditEventsRoute } from './list.js';
import { auditFiltersRoute } from './filters.js';

export async function auditRoutes(app: FastifyInstance) {
  await app.register(listAuditEventsRoute);
  await app.register(auditFiltersRoute);
}
```

**Phase 6 delta:**

```typescript
import type { FastifyInstance } from 'fastify';
import { suggestTherapeuticClassRoute } from './suggest.js';
// If the GET /api/ai/status option from D-108 is taken, add:
// import { aiStatusRoute } from './status.js';

export async function aiRoutes(app: FastifyInstance) {
  await app.register(suggestTherapeuticClassRoute);
  // await app.register(aiStatusRoute);
}
```

---

### 16. `apps/api/src/routes/dashboard/lowStock.ts` (NEW)

**Analog:** `apps/api/src/routes/audit/filters.ts` (full file, 30 lines — GET with `requireSession` only):

```typescript
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { auditFiltersResponse } from '@meditrack/shared';
import { requireSession } from '../../auth/requireSession.js';
import { requirePermission } from '../../auth/requirePermission.js';
import { listAuditFilters } from '../../services/audit.service.js';

export async function auditFiltersRoute(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/audit/filters',
    {
      preHandler: [requireSession, requirePermission('audit:read')],
      schema: { response: { 200: auditFiltersResponse } },
    },
    async () => listAuditFilters(),
  );
}
```

**Second analog (careUnitId-first service call):** `apps/api/src/routes/medications/list.ts:25–37`:

```typescript
async (req) => {
  return listMedicationsForUnit(req.user!.careUnitId, req.query);
},
```

**Phase 6 delta — GET, requireSession only (all roles), careUnitId from req.user:**

```typescript
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

No `requirePermission` per D-120 — all three roles see the dashboard banner.

---

### 17. `apps/api/src/routes/dashboard/index.ts` (NEW)

**Analog:** `apps/api/src/routes/audit/index.ts` (shown above).

**Phase 6 delta:**

```typescript
import type { FastifyInstance } from 'fastify';
import { lowStockRoute } from './lowStock.js';

export async function dashboardRoutes(app: FastifyInstance) {
  await app.register(lowStockRoute);
}
```

---

### 18. `apps/api/src/app.ts` (EDIT)

**Analog:** self — existing route-registration block (lines 96–105):

```typescript
await app.register(authRoutes);
await app.register(meRoutes);
await app.register(adminPingRoutes);
await app.register(medicationRoutes);
await app.register(orderRoutes);
await app.register(auditRoutes);
await app.register(healthzRoutes);
```

**Phase 6 delta — add two imports + two `await app.register(...)` calls, placed alongside `auditRoutes`:**

```typescript
import { aiRoutes } from './routes/ai/index.js';
import { dashboardRoutes } from './routes/dashboard/index.js';

// ...inside buildApp():
await app.register(auditRoutes);
await app.register(aiRoutes);             // NEW
await app.register(dashboardRoutes);      // NEW
await app.register(healthzRoutes);
```

---

### 19. `apps/api/test/aiCategorization.integration.test.ts` (NEW)

**Bootstrap analog:** `apps/api/test/audit.integration.test.ts:1–140` (full top-of-file pattern — imports, beforeAll, afterAll):

```typescript
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  TEST_SJUKSKOTERSKA,
  TEST_APOTEKARE,
  TEST_ADMIN,
  buildTestApp,
  ensureAllRolesSeeded,
  loginAs,
  prisma,
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

**RBAC test pattern (audit.integration.test.ts Test 6 — described at lines 102–104):** assert 403 for sjukskoterska, 403 for apotekare, 200 for admin. Phase 6 mirrors but swaps the matrix per D-15:

- sjukskoterska → 403
- apotekare → 200
- admin → 200

**Phase 6 delta — net-new "mock the seam" pattern:** No prior analog uses module-level mocking for a swappable service. Approach: import the service module and `vi.spyOn(serviceModule, 'suggestTherapeuticClass')` per test (since D-106 explicitly designs the seam for this). Document the pattern in the test header so future readers see the SC #4 contract being asserted.

```typescript
import * as aiSvc from '../src/services/aiCategorization.service.js';

it('returns 200 with the mocked payload', async () => {
  vi.spyOn(aiSvc, 'suggestTherapeuticClass').mockResolvedValue({
    therapeuticClass: 'J',
    confidence: 'hog',
  });
  const cookie = await loginAs(app, TEST_APOTEKARE);
  const res = await app.inject({
    method: 'POST',
    url: '/api/ai/suggest-therapeutic-class',
    headers: { cookie },
    payload: { name: 'Amoxicillin', atcCode: 'J01CA04' },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ therapeuticClass: 'J', confidence: 'hog' });
});
```

Timeout test: `vi.spyOn(...).mockImplementation(() => new Promise(() => {}))` to force the 5-second `AbortController` to fire.

Unavailable test: monkey-patch `process.env.ANTHROPIC_API_KEY = ''` before the call, or `vi.spyOn(aiSvc, 'isAvailable').mockReturnValue(false)`.

---

### 20. `apps/api/test/dashboard.integration.test.ts` (NEW)

**Bootstrap analog:** same as #19.

**Cross-tenant assertion pattern analog:** `apps/api/test/orders.deliver.integration.test.ts` test 4 (cross-careUnit 404) — described at lines 30–32. Phase 6 mirrors: log in as the second-vårdenhet's user, assert different row set.

**Post-mutation refetch analog:** `orders.deliver.integration.test.ts` test 1 (happy path) at lines 27–28 — Phase 6's test 3 asserts that after `POST /api/orders/:id/deliver` the subsequent `GET /api/dashboard/low-stock` returns a smaller row count for the affected meds.

```typescript
it('returns lower row count after delivering an order that bumps stock above threshold', async () => {
  const apotekareCookie = await loginAs(app, TEST_APOTEKARE);
  const before = await app.inject({
    method: 'GET', url: '/api/dashboard/low-stock',
    headers: { cookie: apotekareCookie },
  });
  // ... progress an order to bekraftad, deliver it ...
  const after = await app.inject({ method: 'GET', url: '/api/dashboard/low-stock', headers: { cookie: apotekareCookie }});
  expect(after.json().total).toBeLessThan(before.json().total);
});
```

---

### 21. `apps/web/src/features/ai/useSuggestTherapeuticClass.ts` (NEW)

**Analog:** `apps/web/src/features/orders/useOrderMutations.ts:useDeliverOrder` (lines 343–393):

```typescript
export function useDeliverOrder() {
  const queryClient = useQueryClient();

  return useMutation<OrderResponse, ApiError, { orderId: string }>({
    mutationFn: ({ orderId }) =>
      fetchJson<OrderResponse>(`/api/orders/${orderId}/deliver`, { method: 'POST' }),
    onSuccess: (response, vars) => {
      queryClient.setQueryData(['order', vars.orderId], response);
      void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'bekraftad' }] });
      void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'levererad' }] });
      void queryClient.invalidateQueries({ queryKey: ['medications'] });
      toast.success('Levererad — lagret uppdaterat');
    },
    onError: (err, vars) => {
      if (err.envelope.error.code === 'order_transition_invalid') { ... }
      if (err.envelope.error.code === 'not_found') { toast.error('...'); return; }
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}
```

**Phase 6 delta — body-typed mutation, two new error codes (ai_unavailable / ai_timeout):**

```typescript
export function useSuggestTherapeuticClass() {
  return useMutation<AiSuggestionResponse, ApiError, AiSuggestionRequest>({
    mutationFn: (body) =>
      fetchJson<AiSuggestionResponse>('/api/ai/suggest-therapeutic-class', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onError: (err) => {
      if (err.envelope.error.code === 'ai_timeout') {
        toast.error('AI-förslaget tog för lång tid — försök igen.');
        return;
      }
      if (err.envelope.error.code === 'ai_unavailable') {
        toast.error('AI-tjänsten är inte tillgänglig.');
        return;
      }
      toast.error('Kunde inte hämta förslag — försök igen.');
    },
    // onSuccess: silent — chip appearance is the success signal (per UI-SPEC §6).
  });
}
```

---

### 22. `apps/web/src/features/ai/useAiAvailability.ts` (NEW)

**Analog:** `apps/web/src/auth/useAuth.ts` (full file, 47 lines — `useQuery<MeResponse>` pattern):

```typescript
export function fetchMe(): Promise<MeResponse> {
  return fetchJson<MeResponse>('/api/me');
}

export function useAuth() {
  const { data, isLoading } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
  });
  ...
}
```

**Phase 6 delta:**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { AiStatusResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

export function useAiAvailability() {
  return useQuery<AiStatusResponse, ApiError>({
    queryKey: ['ai', 'status'],
    queryFn: () => fetchJson<AiStatusResponse>('/api/ai/status'),
    retry: false,
    // 5-minute stale time — availability rarely flips at runtime.
    staleTime: 5 * 60_000,
  });
}
```

(If D-108's "widen `/me`" branch is taken instead, this file may not exist — the FE reads `useAuth().user?.aiAvailable`. Either is acceptable per CONTEXT.md Claude's Discretion.)

---

### 23. `apps/web/src/features/dashboard/useLowStockQuery.ts` (NEW)

**Analog:** `apps/web/src/features/medications/useMedicationsQuery.ts:useMedicationsQuery` (lines 23–37):

```typescript
export function useMedicationsQuery(filters: MedicationListQuery) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== '') {
      params.set(k, String(v));
    }
  }
  return useQuery<MedicationListResponse, ApiError>({
    queryKey: ['medications', filters],
    queryFn: () => fetchJson<MedicationListResponse>(`/api/medications?${params.toString()}`),
    placeholderData: keepPreviousData,
  });
}
```

**Phase 6 delta — no params; refetchInterval + refetchOnWindowFocus per D-119:**

```typescript
import { useQuery } from '@tanstack/react-query';
import type { LowStockListResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

export function useLowStockQuery() {
  return useQuery<LowStockListResponse, ApiError>({
    queryKey: ['dashboard', 'low-stock'],
    queryFn: () => fetchJson<LowStockListResponse>('/api/dashboard/low-stock'),
    refetchOnWindowFocus: true,    // D-119: Alt-tab back
    refetchInterval: 30_000,        // D-119: 30s background poll
  });
}
```

---

### 24. `apps/web/src/features/orders/useOrderMutations.ts` (EDIT, line ~358)

**Analog:** self — `useDeliverOrder.onSuccess` block at lines 351–360. The existing comment at line 357 even says **"Phase 6 NTF-01 hook"**:

```typescript
onSuccess: (response, vars) => {
  queryClient.setQueryData(['order', vars.orderId], response);
  void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'bekraftad' }] });
  void queryClient.invalidateQueries({ queryKey: ['orders', { status: 'levererad' }] });
  // Phase 6 NTF-01 hook: broad invalidation so the dashboard banner refetches.
  void queryClient.invalidateQueries({ queryKey: ['medications'] });
  toast.success('Levererad — lagret uppdaterat');
},
```

**Phase 6 delta — one new sibling line BELOW the existing `['medications']` invalidation:**

```typescript
void queryClient.invalidateQueries({ queryKey: ['medications'] });
// Phase 6 D-119: dashboard banner uses its own cache key (D-120 dedicated endpoint).
void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] });
```

Update the function header doc-comment (lines 324–342) to reflect the second invalidation.

---

### 25. `apps/web/src/features/medications/useMedicationMutations.ts` (EDIT)

**Analog:** self — three `onSuccess` blocks.

**Edit point A** — `useCreateMedication.onSuccess` (lines 44–48):

```typescript
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: ['medications'] });
  void queryClient.invalidateQueries({ queryKey: ['medication-search'] });
  toast.success('Sparat');
},
```

**Phase 6 delta — add sibling invalidate:**

```typescript
onSuccess: () => {
  void queryClient.invalidateQueries({ queryKey: ['medications'] });
  void queryClient.invalidateQueries({ queryKey: ['medication-search'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] }); // Phase 6 D-119
  toast.success('Sparat');
},
```

**Edit point B** — `useUpdateMedication.onSuccess` (lines 77–81): same pattern.

**Edit point C** — `useDeleteMedication.onSuccess` (lines 202–210): same pattern.

Also extend `useUpdateThresholdOptimistic.onSettled` (line 161): threshold edits can flip the under-threshold predicate, so add `['dashboard', 'low-stock']` to the unconditional invalidation alongside `['medications']`.

---

### 26. `apps/web/src/components/AiSuggestionChip.tsx` (NEW)

**Primary analog:** `apps/web/src/components/LowStockBadge.tsx` (full file, 33 lines — chip + cn + Lucide icon):

```typescript
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LowStockBadge() {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
        'bg-destructive text-destructive-foreground',
      )}
    >
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      Lågt lager
    </span>
  );
}
```

**Secondary analog (props + children + secondary tone):** `apps/web/src/components/NplBadge.tsx` (lines 17–32):

```typescript
export interface NplBadgeProps {
  children?: ReactNode;
}

export function NplBadge({ children = 'Från NPL' }: NplBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold',
      'bg-slate-100 text-slate-600',
    )}>
      {children}
    </span>
  );
}
```

**Phase 6 delta — UI-SPEC §2 layout (chip + ConfidenceBadge as child):**

```typescript
import { THERAPEUTIC_CLASS_LABELS, type TherapeuticClass } from '@meditrack/shared';
import { ConfidenceBadge } from './ConfidenceBadge';
import { cn } from '@/lib/utils';

export interface AiSuggestionChipProps {
  therapeuticClass: TherapeuticClass;
  confidence: 'hog' | 'medel' | 'lag';
}

export function AiSuggestionChip({ therapeuticClass, confidence }: AiSuggestionChipProps) {
  return (
    <div className={cn(
      'flex items-center gap-2 bg-slate-50 border border-border rounded-md px-3 py-2',
    )}>
      <span className="text-xs text-muted-foreground font-semibold">Förslag:</span>
      <span className="text-sm text-foreground">
        {THERAPEUTIC_CLASS_LABELS[therapeuticClass]}
      </span>
      <ConfidenceBadge confidence={confidence} />
    </div>
  );
}
```

UI-SPEC §2 specifies the "Använd förslag" button renders OUTSIDE this component (below the chip row) — wired via the parent's onApply handler, not via props.

---

### 27. `apps/web/src/components/ConfidenceBadge.tsx` (NEW)

**Primary analog:** `apps/web/src/components/RoleBadge.tsx` (full file, lines 16–43 — typed map + variant render):

```typescript
const ROLE_LABEL: Record<Role, string> = {
  apotekare: 'Apotekare',
  sjukskoterska: 'Sjuksköterska',
  admin: 'Admin',
};

const ROLE_CLASS: Record<Role, string> = {
  apotekare: 'bg-blue-100 text-blue-800',
  sjukskoterska: 'bg-teal-100 text-teal-700',
  admin: 'bg-amber-100 text-amber-800',
};

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span className={cn(
      'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
      ROLE_CLASS[role],
    )}>
      {ROLE_LABEL[role]}
    </span>
  );
}
```

**Secondary analog (icon + map):** `AuditActionChip.tsx:21–54` — class-by-key map with fallback.

**Phase 6 delta — three bands, Lucide icons, UI-SPEC §3 contrast pairs:**

```typescript
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

const VARIANT_MAP = {
  hog:   { className: 'bg-green-100 text-green-700',   icon: TrendingUp,   label: 'Hög säkerhet' },
  medel: { className: 'bg-yellow-100 text-yellow-700', icon: Minus,        label: 'Medel säkerhet' },
  lag:   { className: 'bg-slate-100 text-slate-500',   icon: TrendingDown, label: 'Låg säkerhet' },
} as const;

export interface ConfidenceBadgeProps {
  confidence: 'hog' | 'medel' | 'lag';
}

export function ConfidenceBadge({ confidence }: ConfidenceBadgeProps) {
  const { className, icon: Icon, label } = VARIANT_MAP[confidence];
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold',
      className,
    )}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {label}
    </span>
  );
}
```

Per UI-SPEC §3 footer: do NOT extend `<Badge>` with new shadcn variants — use the className override approach above.

---

### 28. `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx` (NEW)

**Primary analog (banner styling, role=alert):** `apps/web/src/routes/lakemedel/LowStockBanner.tsx` (full file, 52 lines):

```typescript
return (
  <div
    role="alert"
    className="flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive"
  >
    <span>
      <strong>{belowThresholdTotal}</strong> läkemedel under tröskel
    </span>
    ...
  </div>
);
```

**Secondary analog (Card + CardHeader + CardContent):** UI-SPEC §1 uses shadcn `<Card>` — see existing usage in `apps/web/src/routes/lakemedel/MedicationCard.tsx` for the import pattern.

**Empty-state analog (celebratory variant):** `apps/web/src/components/EmptyStateCard.tsx:36–44`:

```typescript
return (
  <div className="flex items-center justify-center flex-1 p-8">
    <Card className="max-w-md w-full p-8 text-center shadow-sm">
      <Icon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
      <h2 className="text-xl font-semibold text-[#0F172A] mb-2">{heading}</h2>
      <p className="text-sm text-[#475569]">{body}</p>
    </Card>
  </div>
);
```

**Phase 6 delta:** Compose all three — full UI-SPEC §1 layout with skeleton/error/empty/non-empty states. The card has `max-h-80 overflow-y-auto` on `CardContent` to satisfy D-117's scroll requirement.

```typescript
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2 } from 'lucide-react';
import { LowStockBadge } from '@/components/LowStockBadge';
import { EmptyStateCard } from '@/components/EmptyStateCard';
import { useLowStockQuery } from '@/features/dashboard/useLowStockQuery';

export function DashboardLowStockCard() {
  const { data, isLoading, isError } = useLowStockQuery();

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
        <CardContent>
          <Alert variant="destructive">
            <AlertDescription>
              Kunde inte hämta lagernivåer — försök igen om en stund.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
  if (data!.total === 0) {
    return (
      <EmptyStateCard
        icon={CheckCircle2}
        heading="Alla läkemedel är över tröskel."
        body="Alla läkemedel i din vårdenhet är över lagertröskeln."
      />
    );
  }
  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>Läkemedel under tröskel</CardTitle>
        <CardDescription>{data!.total} läkemedel</CardDescription>
      </CardHeader>
      <CardContent className="max-h-80 overflow-y-auto" role="list" aria-label="Läkemedel under tröskel">
        {data!.rows.map((row) => (
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
        ))}
      </CardContent>
    </Card>
  );
}
```

**Watch-out:** `EmptyStateCard` currently icons in slate-400. Per UI-SPEC §Color we want emerald-600 for the celebratory state. Either (a) widen `EmptyStateCardProps` with an `iconClassName?: string` prop, or (b) render the celebratory empty state inline (not via `EmptyStateCard`). UI-SPEC §1 implies the latter is acceptable.

---

### 29. `apps/web/src/routes/dashboard/DashboardPage.tsx` (EDIT)

**Analog:** self (full file, 16 lines).

**Phase 6 delta — replace the single line:**

```typescript
// Before:
import { LayoutDashboard } from 'lucide-react';
import { EmptyStateCard } from '@/components/EmptyStateCard';
export function DashboardPage() {
  return <EmptyStateCard icon={LayoutDashboard} heading="Dashboard" />;
}

// After:
import { DashboardLowStockCard } from './DashboardLowStockCard';
export function DashboardPage() {
  return <DashboardLowStockCard />;
}
```

Per UI-SPEC §IA Changes: no `<h1>` is added — `CardTitle` inside the card serves as the page's primary heading.

---

### 30. `apps/web/src/routes/lakemedel/MedicationSheet.tsx` (EDIT)

**Analog:** self — existing imports + form state (lines 1–99).

**Phase 6 delta — three localized edits:**

A. Add imports at the top:

```typescript
import { Sparkles, Loader2 } from 'lucide-react'; // Loader2 already present
import { THERAPEUTIC_CLASSES, THERAPEUTIC_CLASS_LABELS, type TherapeuticClass } from '@meditrack/shared';
import { AiSuggestionChip } from '@/components/AiSuggestionChip';
import { useSuggestTherapeuticClass } from '@/features/ai/useSuggestTherapeuticClass';
import { useAiAvailability } from '@/features/ai/useAiAvailability';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
```

B. Widen the resolver-defined form state with two new fields:
- `aiSuggestion: AiSuggestionResponse | null` (local, not persisted)
- `therapeuticClass: TherapeuticClass | null` (the user's authoritative value, persisted)

The resolver already accepts `therapeuticClass` per the medication.ts edit (#6 above) — just add a `useState<AiSuggestionResponse | null>(null)` for the chip.

C. Insert the AI block above the existing form rows (the UI-SPEC §4 layout):

```tsx
<Can action="ai:suggest">
  <div className="mt-4 mb-4">
    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
      AI-kategorisering
    </Label>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          type="button"
          onClick={handleFetchSuggestion}
          disabled={!name || !atcCode || aiAvailable === false || isFetching}
          className="w-full"
        >
          {isFetching ? (
            <><Loader2 className="h-4 w-4 animate-spin mr-2" />Hämtar förslag…</>
          ) : (
            <><Sparkles className="h-4 w-4 mr-2" />Hämta AI-förslag</>
          )}
        </Button>
      </TooltipTrigger>
      {(aiAvailable === false) && (
        <TooltipContent>AI-förslag är inte tillgängligt (saknad API-nyckel).</TooltipContent>
      )}
    </Tooltip>
    {aiSuggestion && (
      <>
        <AiSuggestionChip
          therapeuticClass={aiSuggestion.therapeuticClass}
          confidence={aiSuggestion.confidence}
        />
        <Button
          variant="outline" size="sm"
          onClick={() => setValue('therapeuticClass', aiSuggestion.therapeuticClass)}
          className="mt-1"
        >
          Använd förslag
        </Button>
      </>
    )}
    {/* Slutgiltig klass combobox — uses THERAPEUTIC_CLASSES + Label "Slutgiltig klass" */}
  </div>
</Can>
```

The `<Can>` wrap is defense-in-depth per D-17 alongside `isAvailable()`.

---

### 31. `apps/web/src/routes/lakemedel/LakemedelFilter.tsx` (EDIT)

**Analog:** self — existing ATC combobox (lines 145–214):

```typescript
<Popover open={atcOpen} onOpenChange={setAtcOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" className="w-[140px] justify-between" aria-label="Filtrera på ATC-kod">
      {atc || 'ATC-kod ▾'}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-[240px] p-0" align="start">
    <Command>
      <CommandInput placeholder="Skriv ATC-prefix…" value={localAtc} onValueChange={(v) => setLocalAtc(v)} />
      <CommandList>
        <CommandEmpty>Inget matchade.</CommandEmpty>
        <CommandGroup>
          {filteredSuggestions.map((prefix) => (
            <CommandItem key={prefix} value={prefix} onSelect={() => { onChange({ atc: prefix, page: 1 }); setAtcOpen(false); }}>
              {prefix}
            </CommandItem>
          ))}
          ...
```

**Phase 6 delta** — add an identical Combobox structure for `Terapeutisk klass`, positioned LEFT of the ATC combobox per D-116 / UI-SPEC §5:

- 14 fixed options from `THERAPEUTIC_CLASSES` + `THERAPEUTIC_CLASS_LABELS`
- Trigger label: `Alla klasser` when unset; Swedish label when set
- Min-width `w-[160px]` per UI-SPEC mobile rule
- URL param: `?class=N` (single-letter)
- Single-select, clear button (mirrors the existing ATC clear at lines 199–213)

Also widen the `LakemedelFilterProps` interface (lines 44–70) with `therapeuticClass: TherapeuticClass | ''` and update `onChange` to accept `therapeuticClass?`.

---

### 32. `apps/web/src/routes/lakemedel/__tests__/MedicationSheet.ai.test.tsx` (NEW)

**Analog:** `apps/web/src/routes/bestallningar/__tests__/BestallningarPage.test.tsx:1–80` (mock pattern):

```typescript
vi.mock('@/auth/useAuth', () => ({ useAuth: vi.fn(), fetchMe: vi.fn() }));
vi.mock('@/features/orders/useOrderQueries', () => ({ useDraftsQuery: vi.fn(), ... }));
vi.mock('@/features/orders/useOrderMutations', () => ({ useCreateDraftOrder: vi.fn() }));
```

**Phase 6 delta — mocks for the two new feature hooks:**

```typescript
vi.mock('@/features/ai/useAiAvailability', () => ({ useAiAvailability: vi.fn() }));
vi.mock('@/features/ai/useSuggestTherapeuticClass', () => ({ useSuggestTherapeuticClass: vi.fn() }));

// Per UI-SPEC §6 — assert:
// 1. Button hidden when useAiAvailability().data?.available === false
// 2. Click button → loading state → chip appears
// 3. Click "Använd förslag" → therapeuticClass field updates
// 4. User can edit the field after applying (override flow)
```

Use `renderWithProviders` from `apps/web/test/helpers/renderWithProviders` (per `BestallningarPage.test.tsx:8`).

---

### 33. `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx` (NEW)

**Analog:** same as #32 + `DiscardDraftDialog.test.tsx:1–80` (state-by-prop assertion).

**Phase 6 delta:** Mock `useLowStockQuery` to drive empty/non-empty/loading/error states. Assert `refetchOnWindowFocus` + `refetchInterval` are configured per UI-SPEC §6 footer — inspect the query options via `QueryClient.getQueryDefaults` rather than waiting for the interval to fire.

```typescript
vi.mock('@/features/dashboard/useLowStockQuery', () => ({ useLowStockQuery: vi.fn() }));

// Per UI-SPEC §6:
// 1. Empty state when total === 0 (CheckCircle2 + heading)
// 2. Non-empty: lists every row with correct stock/threshold/name
// 3. refetchOnWindowFocus + 30s interval configured (assert via QueryClient inspection)
```

---

### 34. `docker-compose.yml` (EDIT)

**Analog:** self — existing optional env variable patterns (lines 47, 55–56):

```yaml
COOKIE_SECRET: ${COOKIE_SECRET:-dev-cookie-secret-please-replace-32b-min}
...
RATE_LIMIT_LOGIN_PER_EMAIL_PER_MINUTE: "10"
RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE: "30"
```

**Phase 6 delta — append to the api service `environment:` block:**

```yaml
# Phase 6 D-107 — OPTIONAL. When set, the medication Sheet shows
# the "Hämta AI-förslag" button. When unset (or empty), the affordance
# is hidden and the app behaves as v1-without-AI.
ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}
```

The `:-` default of empty string passes `z.string().optional()` (which then resolves to `''`, and `isAvailable()` checks for length > 0).

---

### 35. `.env.example` (EDIT — file already exists at repo root)

**Analog:** self — existing pattern (lines 1–17):

```bash
# Database connection (used by Prisma PrismaClient at runtime).
# Plan 05-07: runtime queries connect as the named non-owner role meditrack_app
# ...
DATABASE_URL=postgres://meditrack_app:meditrack_app_dev@localhost:5432/meditrack
```

**Phase 6 delta — append:**

```bash
# Anthropic API key (OPTIONAL — Phase 6 D-107).
# When set, the medication Sheet shows the "Hämta AI-förslag" button.
# When unset, the AI affordance hides itself; the dashboard banner and
# medication catalog still work unchanged.
ANTHROPIC_API_KEY=
```

---

### 36. `apps/api/prisma/seed.ts` (NOT EDITED per CONTEXT.md — listed for completeness)

**Status:** Per D-115 + Out-of-Scope: "no seed-time backfill of the 43,538 NPL meds". This file is INTENTIONALLY untouched in Phase 6. Recorded here only because the mandatory list requested it: the seed.ts file is the analog for "where could backfill go in v2". The Phase 7 README §What I'd do with more time and the v2 admin batch-categorize job both reference this file.

---

## Shared Patterns

### Canonical error envelope (D-19) — applies to both new routes

**Source:** `apps/api/src/plugins/errorHandler.ts` (lines 23–67 for existing error classes, lines 95–108 for `ValidationFailedError` with `details.reason` discriminator).

```typescript
export class InvalidCredentialsError extends Error {
  readonly code = 'invalid_credentials' as const;
  constructor() { super('Invalid credentials'); this.name = 'InvalidCredentialsError'; }
}
```

**Apply to:** new `AiUnavailableError` (503) and `AiTimeoutError` (504) classes; both added to `setErrorHandler` mapping. Per the existing pattern, errors are thrown from services and mapped at the plugin boundary — routes don't construct envelopes directly.

---

### careUnitId-first service signature (D-16) — applies to dashboard.service.ts

**Source:** `apps/api/src/services/medication.service.ts:1–40` (header doc) + every function signature:

```typescript
export async function listMedicationsForUnit(careUnitId: string, filters: ...) { ... }
export async function createCareUnitMedication(careUnitId: string, payload: ...) { ... }
```

**Apply to:** `dashboard.service.ts:listLowStockForUnit(careUnitId)`.

**Documented exception:** `aiCategorization.service.ts` does NOT take careUnitId — per D-16 carve-out documented in CONTEXT.md `<canonical_refs>` line 12. The LLM call is per-medication, not per-vårdenhet (paracetamol is `N` everywhere). Header comment must say so explicitly, mirroring the audit.service.ts D-16 EXCEPTION header pattern (lines 5–16 of `audit.service.ts`).

---

### preHandler ordering (D-15) — applies to all new routes

**Source:** `apps/api/src/routes/medications/create.ts:25–27` and `audit/list.ts:30`:

```typescript
preHandler: [requireSession, requirePermission('medication:create')],
```

**Apply to:** `routes/ai/suggest.ts` (`[requireSession, requirePermission('ai:suggest')]`), `routes/dashboard/lowStock.ts` (`[requireSession]` only — D-120).

NEVER reorder. requireSession decorates `req.user`; requirePermission reads `req.user.role`.

---

### File-per-endpoint route layout (D-65) — applies to ai/ and dashboard/

**Source:** `apps/api/src/routes/audit/` (3 files: list.ts, filters.ts, index.ts).

**Apply to:** `apps/api/src/routes/ai/` (suggest.ts + optional status.ts + index.ts) and `apps/api/src/routes/dashboard/` (lowStock.ts + index.ts).

---

### Zod-shared FE↔BE contract pattern (D-08)

**Source:** `packages/shared/src/contracts/audit.ts:1–28` (header doc + schema-then-export-type pattern).

**Apply to:** `contracts/ai.ts` + `contracts/dashboard.ts` — every `z.object({...})` is followed immediately by `export type X = z.infer<typeof x>`. Re-export from `packages/shared/src/index.ts`.

---

### Audit-via-$extends — applies to Medication.therapeuticClass writes

**Source:** `apps/api/src/db/auditAllowlist.ts:53–63` (Medication entry).

**Apply to:** Adding `'therapeuticClass'` to the existing entry — D-95's diff-at-read mechanism automatically surfaces `therapeuticClass: null → J` in the AuditDiffPanel for free. NO new audit action needed; the existing `update` event captures the change via the $extends middleware. Confirmed live in Phase 5 progress notes (STATE.md line 118): "D-95 live: diff computed at READ time inside AuditDiffPanel … survives Phase 6+ schema additions."

---

### TanStack invalidation chain (D-69 / D-119)

**Source:** `apps/web/src/features/orders/useOrderMutations.ts:351–360` (`useDeliverOrder.onSuccess` — already invalidates `['medications']` per the Phase 6 hook commented in lines 357–358).

**Apply to:** All three medication mutations + the deliver mutation: each `onSuccess` adds `void queryClient.invalidateQueries({ queryKey: ['dashboard', 'low-stock'] })` as a sibling line.

---

### URL-as-state for filters (D-39 / D-42)

**Source:** `apps/web/src/routes/lakemedel/LakemedelFilter.tsx:79–104` (search input debounce + `setLocalQ` sync from URL).

**Apply to:** New `Terapeutisk klass` combobox — emits `onChange({ therapeuticClass: 'N', page: 1 })`; LakemedelPage syncs `?class=N` via the existing `URLSearchParams` infrastructure.

---

### Lucide icon decoration

**Source:** `apps/web/src/components/LowStockBadge.tsx:27` (`aria-hidden="true"` on icon).

**Apply to:** `ConfidenceBadge` (TrendingUp/Minus/TrendingDown) and the `Sparkles` icon on the "Hämta AI-förslag" button — all decorative, `aria-hidden="true"`. Label text is the accessible content per UI-SPEC §Accessibility.

---

## No Analog Found

| File / Pattern | Reason |
|----------------|--------|
| Anthropic SDK call inside `aiCategorization.service.ts` (`new Anthropic({ apiKey })`, `client.messages.create(...)`, `tool_use` structured output, `AbortController` 5s timeout) | **No prior HTTP-to-external-LLM call exists in the codebase.** Phase 6 introduces the pattern. The single-seam structure (D-106) IS the architectural answer — the file is small enough to read entirely, and `categorizerImpl` is the one swap-point. Document the implementation in the service header so the reviewer's first read of the file conveys the SC #4 contract. |
| `vi.spyOn(serviceModule, 'suggestTherapeuticClass')` test pattern | No prior test mocks a service module at the import level. Phase 5 tests use `actorALS.run` + direct service imports, but never replace a service implementation. New pattern is justified by D-106 — the seam exists explicitly for testability. |
| "Celebratory" `EmptyStateCard` variant (emerald-600 icon, positive heading) | `EmptyStateCard` defaults to slate-400 (failure-neutral). UI-SPEC §1 requests emerald-600. Solution: render the celebratory state inline using the same JSX skeleton (lines 36–44 of `EmptyStateCard.tsx`) but with `text-emerald-600` and `CheckCircle2` — OR widen `EmptyStateCard` with an `iconClassName?: string` prop. Either is acceptable; the planner picks one. |

---

## Metadata

**Analog search scope:**
- `apps/api/prisma/migrations/` (11 migrations)
- `apps/api/src/routes/` (23 route files across `audit/`, `medications/`, `orders/`, plus root-level routes)
- `apps/api/src/services/` (5 services)
- `apps/api/src/db/`, `apps/api/src/auth/`, `apps/api/src/plugins/`
- `apps/api/test/` (13 test files)
- `apps/web/src/features/` (6 hook files across `auth/`, `medications/`, `orders/`)
- `apps/web/src/components/` (~30 component files)
- `apps/web/src/routes/` (~40 route files, including `__tests__/`)
- `packages/shared/src/contracts/` (7 contract files)
- `packages/shared/src/constants/` (6 constant files)
- `docker-compose.yml`, `.env.example`, `apps/api/prisma/schema.prisma`

**Files scanned (read into context):** ~26
**Files referenced by line/section (not fully read):** ~10

**Cross-cutting patterns identified:**
- Every new route follows the `medications/create.ts` (POST) or `audit/filters.ts` (GET) shape — Fastify + zod-type-provider + preHandler + service call
- Every new shared contract follows the audit.ts header doc style + schema-then-`z.infer` export
- Every new service file follows the medication.service.ts header (D-16 + scope assertion)
- Every Phase 6 chip / badge is the LowStockBadge.tsx / RoleBadge.tsx primitive — `inline-flex items-center rounded-full px-* py-* text-xs font-semibold` + Tailwind variant class
- Every TanStack hook follows useMedicationsQuery.ts (queries) or useOrderMutations.ts (mutations)

**Pattern extraction date:** 2026-05-23
