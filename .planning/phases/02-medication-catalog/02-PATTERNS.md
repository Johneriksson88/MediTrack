# Phase 2: Medication Catalog — Pattern Map

**Mapped:** 2026-05-21
**Files classified:** 22 new + 5 modified
**Analogs found:** 18 / 22 new (4 are greenfield in Phase 2)

> Pattern source: `apps/api/src/**`, `apps/web/src/**`, `packages/shared/src/**` (Phase 1 ships them all). No RESEARCH.md exists; this map is Phase 1 → Phase 2 inheritance only.

---

## File Classification

Grouped by layer (Schema/Migration → Shared Contracts → Backend Services/Routes → Frontend Components/Pages → Seed/Tooling).

### Schema / Migration

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `apps/api/prisma/schema.prisma` (MODIFIED — adds `Medication`, `CareUnitMedication`) | schema | write-once | `apps/api/prisma/schema.prisma` (Phase 1 `CareUnit`, `User`, `Session`) | exact |
| `apps/api/prisma/migrations/{ts}_medication_catalog/migration.sql` (NEW) | migration | write-once | `apps/api/prisma/migrations/20260520171636_init/migration.sql` | role-match — Phase 2 adds extension + GIN, no Phase 1 analog for that part |

### Shared Contracts (`packages/shared/src/`)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `packages/shared/src/contracts/medication.ts` (NEW) | contract | write-once | `packages/shared/src/contracts/me.ts` + `login.ts` | exact |
| `packages/shared/src/contracts/permissions.ts` (MODIFIED — append 4 ActionKeys) | contract | mutated | itself (Phase 1 line 22 — comment explicitly anticipates this) | exact |
| `packages/shared/src/constants/medicationForms.ts` (NEW) | shared-constant | write-once | `packages/shared/src/constants/orderStatus.ts` | exact |
| `packages/shared/src/constants/medicationDefaults.ts` (NEW) | shared-constant | write-once | `packages/shared/src/constants/orderStatus.ts` (curated `Record<>` table) | role-match |
| `packages/shared/src/index.ts` (MODIFIED — re-export new modules) | barrel | mutated | itself (Phase 1 barrel) | exact |

### Backend (`apps/api/src/`)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `apps/api/src/auth/permissions.ts` (MODIFIED — extend `PERMISSIONS` map) | config | mutated | itself (Phase 1 lines 17–23 explicitly preview Phase 2 entries) | exact |
| `apps/api/src/services/medication.service.ts` (NEW) | service | CRUD | `apps/api/src/services/user.service.ts` | exact |
| `apps/api/src/routes/medications/list.ts` (NEW) | route | read-only | `apps/api/src/routes/me.ts` | role-match (GET + paginate is new shape) |
| `apps/api/src/routes/medications/search.ts` (NEW) | route | read-only | `apps/api/src/routes/me.ts` | role-match |
| `apps/api/src/routes/medications/create.ts` (NEW) | route | mutated | `apps/api/src/routes/auth.ts` POST `/api/auth/login` | role-match (POST with body schema) |
| `apps/api/src/routes/medications/update.ts` (NEW) | route | mutated | `apps/api/src/routes/auth.ts` + `adminPing.ts` (preHandler chain) | role-match (PATCH new) |
| `apps/api/src/routes/medications/delete.ts` (NEW) | route | mutated | `apps/api/src/routes/auth.ts` DELETE `/api/auth/session` | role-match (DELETE + 204 in auth; soft-delete in Phase 2) |
| `apps/api/src/routes/medications/index.ts` (NEW — barrel that wires sub-routes) | barrel | write-once | `apps/api/src/app.ts` line 51-54 (route registration calls) | role-match |
| `apps/api/src/app.ts` (MODIFIED — register medication routes) | config | mutated | itself | exact |
| `apps/api/src/plugins/errorHandler.ts` (MODIFIED — add `NotFoundError`, `ConflictError`, `ForbiddenScopeError`) | utility | mutated | itself (Phase 1 lines 23–37 `InvalidCredentialsError`, `UnauthenticatedError` pattern) | exact |

### Frontend (`apps/web/src/`)

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `apps/web/src/routes/lakemedel/LakemedelPage.tsx` (REPLACES stub) | page | mutated | `apps/web/src/features/auth/LoginForm.tsx` (the only feature-page in Phase 1) + `routes/login/LoginPage.tsx` | role-match — Phase 1 has no list page |
| `apps/web/src/routes/lakemedel/MedicationTable.tsx` (NEW) | component | read-only | none — Phase 1 has no `<Table>` | **NEW IN PHASE 2** |
| `apps/web/src/routes/lakemedel/MedicationCardList.tsx` (NEW) | component | read-only | `apps/web/src/components/EmptyStateCard.tsx` (Card primitive usage) | partial |
| `apps/web/src/routes/lakemedel/MedicationCard.tsx` (NEW) | component | read-only | `apps/web/src/components/EmptyStateCard.tsx` | partial |
| `apps/web/src/routes/lakemedel/MedicationSheet.tsx` (NEW) | component | mutated | `apps/web/src/features/auth/LoginForm.tsx` (rhf+zodResolver+useMutation pattern) | role-match — Phase 1 has no `<Sheet>` |
| `apps/web/src/routes/lakemedel/DeleteMedicationDialog.tsx` (NEW) | component | mutated | none — Phase 1 has no `<AlertDialog>` | **NEW IN PHASE 2** |
| `apps/web/src/routes/lakemedel/LakemedelFilter.tsx` (NEW) | component | read-only | `apps/web/src/features/auth/LoginForm.tsx` (`useForm`+`Input` wiring) | partial |
| `apps/web/src/routes/lakemedel/LowStockBanner.tsx` (NEW) | component | read-only | `apps/web/src/components/ui/alert.tsx` (shadcn primitive) | partial |
| `apps/web/src/routes/lakemedel/PaginationFooter.tsx` (NEW) | component | read-only | none | **NEW IN PHASE 2** |
| `apps/web/src/components/LowStockBadge.tsx` (NEW) | component | read-only | `apps/web/src/components/RoleBadge.tsx` (parallel pattern — DO NOT extend) | exact (structurally) |
| `apps/web/src/components/NplBadge.tsx` (NEW) | component | read-only | `apps/web/src/components/RoleBadge.tsx` | exact (structurally) |
| `apps/web/src/components/InlineEditThreshold.tsx` (NEW) | component | mutated | `apps/web/src/features/auth/useLogin.ts` (`useMutation`) + `LoginForm.tsx` (focus/submit) | partial — optimistic pattern is greenfield |
| `apps/web/src/features/medications/useMedicationsQuery.ts` (NEW) | hook | read-only | `apps/web/src/auth/useAuth.ts` (`useQuery` shape) | exact |
| `apps/web/src/features/medications/useMedicationMutations.ts` (NEW) | hook | mutated | `apps/web/src/features/auth/useLogin.ts` (`useMutation` shape) | exact |

### Seed / Tooling

| New / Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------------|------|-----------|----------------|---------------|
| `apps/api/prisma/seed.ts` (MODIFIED — extend with NPL CSV streaming + per-`nplId` PRNG) | seed | mutated | itself (Phase 1 lines 56–91 — `upsert` idempotency + log line pattern) | exact for shape; **streaming + deterministic PRNG are new** |
| `apps/api/prisma/seed-data/lakemedel.csv` (NEW — 43 538-row committed CSV) | data | write-once | none — no committed seed data in Phase 1 | **NEW IN PHASE 2** |

---

## Pattern Assignments

### `apps/api/prisma/schema.prisma` (MODIFIED — add `Medication` + `CareUnitMedication`)

**Analog:** `apps/api/prisma/schema.prisma` (Phase 1 lines 24–59 — `CareUnit`, `User`, `Session` models).

**Imports / preamble pattern** — already in place, do not re-add:

```prisma
generator client { provider = "prisma-client-js" }
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

**Model + index pattern to mirror** (Phase 1 lines 31–44 — note `@@index` on FK, `@default(cuid())`, `createdAt`/`updatedAt`):

```prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  name         String
  role         Role
  careUnitId   String
  careUnit     CareUnit  @relation(fields: [careUnitId], references: [id])
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([careUnitId])
}
```

**Deltas the planner needs to know:**

- `Medication` is **global** (no `careUnitId`); `nplId String? @unique` (nullable for user-created — see D-27). Use `String`, not enum, for `form` (501 NPL values).
- `Medication` needs a `source` field — model as a string-literal enum `enum MedicationSource { npl user }` to stay consistent with the Phase 1 `Role` enum pattern (lines 18–22).
- `CareUnitMedication` mirrors the FK + `@@index([careUnitId])` pattern from `User` and adds `@@unique([careUnitId, medicationId])` (D-28).
- `deletedAt DateTime?` is new — no Phase 1 model carries one. Add a comment line above it referencing CAT-07 / D-33.
- Phase 1 added relation arrays back on `CareUnit` (`users User[]`); add `careUnitMedications CareUnitMedication[]` symmetrically.
- The `pg_trgm` extension + GIN index on `lower("Medication"."name") gin_trgm_ops` (D-26) **cannot** be expressed in `schema.prisma` — they live as raw SQL in the generated migration file (see next entry).

**Anti-pattern reminder:** Do NOT denormalize `careUnitId` onto `Medication`. Per D-27, `Medication` is the canonical NPL registry — careUnit-scoping happens via the `CareUnitMedication` join (mirrors Phase 1's `Session.careUnitId` snapshot decision in spirit but in reverse direction).

---

### `apps/api/prisma/migrations/{ts}_medication_catalog/migration.sql` (NEW)

**Analog:** `apps/api/prisma/migrations/20260520171636_init/migration.sql`.

**Generated-DDL pattern to mirror** (init migration lines 4–46):

```sql
-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "careUnitId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
```

**Deltas the planner needs to know (PHASE 2 GREENFIELD — no Phase 1 analog):**

Append the following **after** Prisma's auto-generated DDL (planner instructs to either edit the generated migration file post-`prisma migrate dev --create-only` or use a `prisma migrate dev --create-only` then hand-append):

```sql
-- Phase 2 D-26: enable pg_trgm + GIN index on lower(name) for ILIKE 'paracet%' at 43k rows.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX "Medication_name_lower_trgm_idx"
  ON "Medication" USING gin (lower("name") gin_trgm_ops);

-- Optional: prefix-index on atcCode for ATC-filter performance.
CREATE INDEX "Medication_atcCode_idx" ON "Medication" ("atcCode");
```

The planner should explicitly call out that **the `--create-only` flag is required** so the SQL can be hand-edited before being applied, then `prisma migrate dev` (no flag) applies it.

**Anti-pattern reminder:** Do NOT enable `pg_trgm` from application code (`SELECT … FROM pg_extension`) — it must be in the migration so `docker compose up` on a fresh clone works without a manual SQL step (D-26).

---

### `packages/shared/src/contracts/medication.ts` (NEW)

**Analog:** `packages/shared/src/contracts/me.ts` (lines 1–26) + `login.ts` (lines 1–32).

**Imports + schema pattern to mirror** (me.ts entire file):

```typescript
import { z } from 'zod';
import { roleEnum } from '../constants/roles.js';
import { actionKey } from './permissions.js';

/**
 * D-18 / Pattern F — `/api/me` response shape.
 * ...
 */
export const meResponse = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
  role: roleEnum,
  careUnit: z.object({ id: z.string(), name: z.string() }),
  permissions: z.array(actionKey),
});
export type MeResponse = z.infer<typeof meResponse>;
```

**Request/response paired schema pattern** (login.ts lines 9–32):

```typescript
export const loginRequest = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequest = z.infer<typeof loginRequest>;

export const loginResponse = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    name: z.string(),
    role: roleEnum,
    careUnit: z.object({ id: z.string(), name: z.string() }),
  }),
});
export type LoginResponse = z.infer<typeof loginResponse>;
```

**Deltas the planner needs:** Phase 2 introduces **five** paired schemas in this file (per UI-SPEC §File Layout):

1. `medicationListItem` — the joined row shape (Medication ∪ CareUnitMedication fields):
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
   ```
2. `medicationListResponse` — `{ rows: medicationListItem[], total, belowThresholdTotal, page, pageSize }` (D-44).
3. `medicationSearchResult` — top-20 typeahead shape (D-45): `{ id, name, atcCode, form, strength, source }`.
4. `medicationCreateRequest` — discriminated union of `{ kind: 'npl', medicationId, currentStock, lowStockThreshold }` and `{ kind: 'user', name, atcCode, form, strength?, currentStock, lowStockThreshold }` (D-30, D-31). Use `z.discriminatedUnion('kind', [...])`.
5. `medicationUpdateRequest` — `z.object({ currentStock: z.number().int().nonnegative().optional(), lowStockThreshold: z.number().int().positive().optional(), name: z.string().optional(), atcCode: z.string().optional(), form: z.string().optional(), strength: z.string().nullable().optional() })` (partial; service rejects name/atc/form/strength when `Medication.source === 'npl'` — D-32).

**Mirror the export style:** every schema is followed by `export type X = z.infer<typeof x>;`. The barrel (`packages/shared/src/index.ts`) re-exports each named export — match Phase 1 lines 9 and 11–14 exactly.

**Anti-pattern reminder:** Do NOT split this file by HTTP verb (no separate `list.ts`/`create.ts` shards). Phase 1 keeps all `/me` shapes in one file; mirror that.

---

### `packages/shared/src/contracts/permissions.ts` (MODIFIED)

**Analog:** itself.

**Current shape** (Phase 1 lines 21–25):

```typescript
export const ACTION_KEYS = ['admin:ping'] as const;
export type ActionKey = (typeof ACTION_KEYS)[number];

export const actionKey = z.enum(ACTION_KEYS);
```

**Phase 2 delta:** Append four literals — comment at top of file (lines 17–21) explicitly anticipates them:

```typescript
export const ACTION_KEYS = [
  'admin:ping',
  'medication:read',
  'medication:create',
  'medication:update',
  'medication:delete',
] as const;
```

No other change. The `actionKey` Zod enum auto-updates. The TS-completeness check on `Record<ActionKey, Role[]>` in `apps/api/src/auth/permissions.ts` will immediately fail to compile until the BE map is updated — this is the intended drift-prevention mechanism (per D-15 + comment lines 12–20 in the BE permissions file).

---

### `packages/shared/src/constants/medicationForms.ts` (NEW)

**Analog:** `packages/shared/src/constants/orderStatus.ts` (entire file, lines 1–19).

**Pattern to mirror** (orderStatus.ts lines 4–18):

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

**Deltas the planner needs:**
- Per D-89 (Claude's Discretion): derive the top ~15–20 forms by frequency from `lakemedel.csv` (one-time analysis, hard-code the list — do NOT compute at runtime).
- Export `TOP_MEDICATION_FORMS` literal tuple + `MedicationForm` type derived from it + a Swedish-labels `Record` if needed (the NPL values are already Swedish — likely no relabeling needed).
- Add an `OVRIGA_FILTER_VALUE = 'Övriga' as const` sentinel that the BE service treats as `form NOT IN topForms` (D-89).

**Anti-pattern reminder:** Do NOT load this from a JSON file at boot. Static `as const` tuple is what makes the type narrow. Phase 1's `ORDER_STATUSES` is the locked precedent.

---

### `packages/shared/src/constants/medicationDefaults.ts` (NEW)

**Analog:** `packages/shared/src/constants/orderStatus.ts` (the labels `Record<>` pattern, lines 13–18).

**Pattern to mirror** (orderStatus.ts lines 13–18, the `Record<OrderStatus, string>` table):

```typescript
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  utkast: 'Utkast',
  ...
};
```

**Deltas the planner needs:** Encode D-40 heuristic. The function (not just a record — needs prefix-matching) lives here so both FE prefill and BE validation-fallback consume it:

```typescript
const TIER_INJECTION = 5;   // injektion / lösning / spray
const TIER_TOPICAL = 3;     // salva / kräm / gel
const TIER_ORAL_SOLID = 20; // tablett / kapsel / dragerad tablett
const FALLBACK_THRESHOLD = 10;

export function defaultLowStockThreshold(form: string): number {
  const f = form.toLowerCase();
  if (/injekt|lösning|spray/.test(f)) return TIER_INJECTION;
  if (/salva|kräm|gel/.test(f)) return TIER_TOPICAL;
  if (/tablett|kapsel|dragerad/.test(f)) return TIER_ORAL_SOLID;
  return FALLBACK_THRESHOLD;
}
```

Phase 1 has no analog for an *exported function* in `constants/`. Document the choice with a JSDoc block above the function — same prose style as `orderStatus.ts` lines 4–11.

**Anti-pattern reminder:** Do NOT put this in `apps/api/` only. The FE pre-fills the threshold input in the create Sheet (D-40, UI-SPEC §6a), so the function MUST be in `packages/shared`.

---

### `apps/api/src/auth/permissions.ts` (MODIFIED — extend `PERMISSIONS` map)

**Analog:** itself. Phase 1 lines 14–20 explicitly preview the Phase 2 entries.

**Current shape** (lines 21–23):

```typescript
export const PERMISSIONS: Record<ActionKey, Role[]> = {
  'admin:ping': ['admin'],
};
```

**Phase 2 delta — append four entries** (matches the comment hint on Phase 1 lines 14–20 and the role/action matrix in D-43):

```typescript
export const PERMISSIONS: Record<ActionKey, Role[]> = {
  'admin:ping': ['admin'],
  'medication:read':   ['apotekare', 'sjukskoterska', 'admin'],
  'medication:create': ['apotekare', 'admin'],
  'medication:update': ['apotekare', 'admin'],
  'medication:delete': ['apotekare', 'admin'],
};
```

`actionsForRole(role)` (lines 33–37) needs no changes — it iterates `PERMISSIONS` entries and intersects with role, so the new keys flow through automatically.

**Anti-pattern reminder:** Do NOT reorder the existing `'admin:ping'` entry. The `Object.entries` iteration order (declaration order in modern V8) determines `/me` `permissions[]` array order, which clients may compare on (Phase 1 comment lines 27–32). Append, don't reshuffle.

---

### `apps/api/src/services/medication.service.ts` (NEW)

**Analog:** `apps/api/src/services/user.service.ts` (entire file, lines 1–51).

**Imports + service-function signature pattern** (user.service.ts lines 1–20):

```typescript
import type { MeResponse } from '@meditrack/shared';
import { prisma } from '../db/client.js';
import { actionsForRole } from '../auth/permissions.js';

/**
 * Pattern D / D-16 / D-18 — `careUnitId` is the FIRST argument (the
 * documented service-layer rule). The session has a `careUnitId` snapshot
 * (D-16) that the auth preHandler decorates onto `req.user`; we pass it
 * here and use it in every Prisma `where` so a future code change can't
 * accidentally leak across tenants.
 */
export async function getMeForSession(
  careUnitId: string,
  sessionId: string,
): Promise<MeResponse> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { ... },
  });
  ...
}
```

**Filter-scoping pattern** (user.service.ts lines 21–37 — every Prisma call carries the `careUnitId` filter; mismatch throws):

```typescript
if (!session || session.careUnitId !== careUnitId) {
  throw new Error('Session no longer valid');
}
```

**Deltas the planner needs:** Define **six** service functions, all taking `careUnitId` first:

```typescript
export async function listMedicationsForUnit(
  careUnitId: string,
  filters: { q?: string; atc?: string; form?: string; belowThreshold?: boolean; page: number; pageSize: number },
): Promise<MedicationListResponse> { /* ... */ }

export async function searchGlobalMedications(
  careUnitId: string,                          // first arg even though we read GLOBAL Medication —
  filters: { q: string; limit: number },       // because we must EXCLUDE drugs already stocked at this unit (D-45).
): Promise<MedicationSearchResult[]> { /* ... */ }

export async function createCareUnitMedication(
  careUnitId: string,
  payload: MedicationCreateRequest,
): Promise<MedicationListItem> {
  // Transparent restore: if a soft-deleted row exists for (careUnitId, medicationId), UPDATE it (D-30).
  // Both branches of the discriminated union ('npl' | 'user') go through prisma.$transaction.
}

export async function updateCareUnitMedication(
  careUnitId: string,
  careUnitMedicationId: string,
  payload: MedicationUpdateRequest,
): Promise<MedicationListItem> {
  // Reject name/atc/form/strength updates when source === 'npl' (D-32) → throw ForbiddenScopeError.
  // 404 if careUnitMedicationId doesn't exist OR doesn't belong to careUnitId.
}

export async function softDeleteCareUnitMedication(
  careUnitId: string,
  careUnitMedicationId: string,
): Promise<void> {
  // SET deletedAt = now() — never DELETE (D-33).
  // 404 same as update.
}
```

Note from Phase 1 (lines 32–37 of user.service.ts): the service is the **last** line of defense for tenant scoping — it re-validates `careUnitId` even though `requireSession` already decorated it. Repeat that posture in every Phase 2 service function.

**Anti-pattern reminder:** The `login(email, password)` function in `auth.service.ts` is a **documented exception** to D-16 (Phase 1 auth.service.ts lines 10–17). Phase 2 has NO such exception — every function must take `careUnitId` first.

---

### `apps/api/src/routes/me.ts` → Phase 2 medication route files

**Analog:** `apps/api/src/routes/me.ts` (entire file, lines 1–32) + `apps/api/src/routes/adminPing.ts` (lines 1–40) + `apps/api/src/routes/auth.ts` lines 27–49 (POST with body schema).

**`r.get` + schema + preHandler chain** (me.ts lines 17–32):

```typescript
export async function meRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/me',
    {
      preHandler: [requireSession],
      schema: { response: { 200: meResponse } },
    },
    async (req) => {
      const { careUnitId, sessionId } = req.user!;
      return getMeForSession(careUnitId, sessionId);
    },
  );
}
```

**`requirePermission` preHandler chain** (adminPing.ts lines 26–40 — exact pattern to copy on every Phase 2 mutation route):

```typescript
export async function adminPingRoutes(app: FastifyInstance) {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/api/admin/ping',
    {
      preHandler: [requireSession, requirePermission('admin:ping')],
      schema: { response: { 200: adminPingResponse } },
    },
    async () => ({ pong: true as const, at: new Date().toISOString() }),
  );
}
```

**POST + body schema pattern** (auth.ts lines 30–49):

```typescript
r.post(
  '/api/auth/login',
  {
    schema: {
      body: loginRequest,
      response: { 200: loginResponse },
    },
  },
  async (req, reply) => {
    const { email, password } = req.body;     // TS-typed via Zod
    const { response, sessionId } = await login(email, password);
    reply.setCookie(...);
    return response;
  },
);
```

**DELETE + 204 pattern** (auth.ts lines 51–65):

```typescript
app.delete('/api/auth/session', async (req, reply) => {
  ...
  reply.status(204);
  return null;
});
```

**Deltas the planner needs:** Mirror this skeleton across all five medication route files. Concretely:

| File | Method + Path | preHandler chain | Schema |
|------|--------------|------------------|--------|
| `list.ts` | `r.get('/api/medications')` | `[requireSession, requirePermission('medication:read')]` | `querystring: medicationListQuery`, `response: { 200: medicationListResponse }` |
| `search.ts` | `r.get('/api/medications/search')` | `[requireSession, requirePermission('medication:read')]` | `querystring: medicationSearchQuery`, `response: { 200: z.object({ results: z.array(medicationSearchResult) }) }` |
| `create.ts` | `r.post('/api/medications')` | `[requireSession, requirePermission('medication:create')]` | `body: medicationCreateRequest`, `response: { 201: medicationListItem }` |
| `update.ts` | `r.patch('/api/medications/:id')` | `[requireSession, requirePermission('medication:update')]` | `params: z.object({ id: z.string() })`, `body: medicationUpdateRequest`, `response: { 200: medicationListItem }` |
| `delete.ts` | `r.delete('/api/medications/:id')` | `[requireSession, requirePermission('medication:delete')]` | `params: z.object({ id: z.string() })`, `response: { 204: …or empty }` |

Use the exact `const r = app.withTypeProvider<ZodTypeProvider>()` line — fastify-type-provider-zod's compilers are already set in `app.ts` (lines 39–40).

`req.user!` is safe inside the handler because `requireSession` is in the chain (Phase 1 me.ts line 28 comment). Use `req.user!.careUnitId` as the FIRST arg to every service call.

**Anti-pattern reminder:** Do NOT call Prisma from route handlers. Every Prisma access goes through `services/medication.service.ts` (D-16 / Phase 1 lines 4–10 of `user.service.ts` reiterate this rule).

---

### `apps/api/src/routes/medications/index.ts` (NEW — barrel route registrar)

**Analog:** `apps/api/src/app.ts` lines 50–54 (route registration block).

**Pattern to mirror** (app.ts lines 50–54):

```typescript
// Routes.
await app.register(authRoutes);
await app.register(meRoutes);
await app.register(adminPingRoutes);
await app.register(healthzRoutes);
```

**Delta:** Create a single `medicationRoutes(app)` function that internally registers the five sub-routes — keeps `app.ts` change small (one new line, one new import).

```typescript
export async function medicationRoutes(app: FastifyInstance) {
  await app.register(listMedicationsRoute);
  await app.register(searchMedicationsRoute);
  await app.register(createMedicationRoute);
  await app.register(updateMedicationRoute);
  await app.register(deleteMedicationRoute);
}
```

Then `app.ts` line addition: `await app.register(medicationRoutes);`.

---

### `apps/api/src/plugins/errorHandler.ts` (MODIFIED — add three new error classes)

**Analog:** itself (Phase 1 lines 23–37 — `InvalidCredentialsError` and `UnauthenticatedError` pattern).

**Pattern to mirror** (errorHandler.ts lines 23–37):

```typescript
export class InvalidCredentialsError extends Error {
  readonly code = 'invalid_credentials' as const;
  constructor() {
    super('Invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}

export class UnauthenticatedError extends Error {
  readonly code = 'unauthenticated' as const;
  constructor() {
    super('Unauthenticated');
    this.name = 'UnauthenticatedError';
  }
}
```

**setErrorHandler dispatch pattern** (errorHandler.ts lines 91–101):

```typescript
if (err instanceof InvalidCredentialsError) {
  return send(reply, 400, envelope('invalid_credentials', 'Fel e-post eller lösenord.'));
}

if (err instanceof UnauthenticatedError) {
  return send(reply, 401, envelope('unauthenticated', 'Du måste logga in.'));
}
```

**Deltas the planner needs:** Per D-19 + 02-CONTEXT.md `<code_context>` integration-points list, Phase 2 adds **three** new error classes + dispatch branches:

```typescript
export class NotFoundError extends Error {
  readonly code = 'not_found' as const;
  constructor(message = 'Resursen hittades inte.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictDuplicateMedicationError extends Error {
  readonly code = 'conflict_duplicate_medication' as const;
  constructor() {
    super('Läkemedlet finns redan i registret för din vårdenhet.');
    this.name = 'ConflictDuplicateMedicationError';
  }
}

export class ForbiddenScopeError extends Error {
  readonly code = 'forbidden' as const;
  constructor(message = 'Du saknar behörighet att utföra denna åtgärd.') {
    super(message);
    this.name = 'ForbiddenScopeError';
  }
}
```

Dispatch branches (insert before the unknown-error fallback at line 105):

```typescript
if (err instanceof NotFoundError) {
  return send(reply, 404, envelope('not_found', err.message));
}
if (err instanceof ConflictDuplicateMedicationError) {
  return send(reply, 409, envelope('conflict_duplicate_medication', err.message));
}
if (err instanceof ForbiddenScopeError) {
  return send(reply, 403, envelope('forbidden', err.message));
}
```

The Swedish messages are user-facing (D-19 line 16). All five error codes from `<code_context>` (`unauthenticated`, `forbidden`, `not_found`, `validation_failed`, `conflict_duplicate_medication`) are then routable — `unauthenticated` and `validation_failed` already exist.

**Anti-pattern reminder:** Do NOT reuse `UnauthenticatedError` for 403 cases (missing permission or wrong vårdenhet). Phase 1 `requirePermission` (lines 39–47) sends 403 inline; service-layer-detected wrong-tenant access should throw `ForbiddenScopeError` so the canonical envelope wraps it consistently.

---

### `apps/web/src/routes/lakemedel/LakemedelPage.tsx` (REPLACES stub)

**Analog (orchestrator pattern):** `apps/web/src/features/auth/LoginForm.tsx` (the only Phase 1 page that owns state + mutation + form). Page-shell pattern from `apps/web/src/components/EmptyStateCard.tsx` (the current stub).

**Current stub** (full file — to be REPLACED):

```typescript
import { Pill } from 'lucide-react';
import { EmptyStateCard } from '@/components/EmptyStateCard';

export function LakemedelPage() {
  return <EmptyStateCard icon={Pill} heading="Läkemedel" />;
}
```

**Phase 1 form-orchestration pattern to mirror** (LoginForm.tsx lines 36–66 — useForm + useMutation + try/catch on ApiError):

```typescript
const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginRequest>({
  resolver: zodResolver(loginRequest),
  defaultValues: { email: '', password: '' },
});

const login = useLogin();

async function onSubmit(values: LoginRequest) {
  setServerError(null);
  try {
    await login.mutateAsync(values);
    navigate(from, { replace: true });
  } catch (err) {
    if (err instanceof ApiError) {
      if (err.envelope.error.code === 'invalid_credentials') {
        setServerError('Fel e-post eller lösenord.');
        return;
      }
      ...
    }
  }
}
```

**TanStack Query pattern to mirror** (`useAuth.ts` lines 29–46):

```typescript
const { data, isLoading } = useQuery<MeResponse>({
  queryKey: ['me'],
  queryFn: fetchMe,
  retry: false,
});
```

**Deltas the planner needs:**

- This page owns:
  - URL-synced filter state via `useSearchParams` (D-39 + UI-SPEC §1) — keys `q`, `atc`, `form`, `belowThreshold`, `page`, `pageSize`.
  - One `useQuery(['medications', { q, atc, form, belowThreshold, page, pageSize }])` to `GET /api/medications` (UI-SPEC §1 "Query key").
  - Sheet open/close state (`useState<{ mode, careUnitMedication } | null>`) — URL does NOT change when Sheet is open (D-34).
- Compose: `<LowStockBanner>` (cond.) → `<LakemedelFilter>` → `<MedicationTable>` (md+) / `<MedicationCardList>` (<md) → `<PaginationFooter>` → `<MedicationSheet>` (overlay).
- Reuses `<EmptyStateCard icon={Pill} heading="Inga läkemedel ännu">` for the zero-rows-in-DB empty state (UI-SPEC §1).
- Pagebar uses the desktop `<Button>` + mobile FAB pattern from UI-SPEC §10.

**Anti-pattern reminder:** Do NOT fetch the full 43k rows to FE and paginate client-side. D-44 mandates server-side pagination. Also do NOT use `useEffect` to sync filter state to URL — use `useSearchParams` as the *source of truth*, derive everything else from it.

---

### `apps/web/src/components/LowStockBadge.tsx` (NEW — parallel to `<RoleBadge>`)

**Analog:** `apps/web/src/components/RoleBadge.tsx` (entire file, lines 1–43).

**Pattern to mirror exactly** (RoleBadge.tsx lines 16–43):

```typescript
import type { Role } from '@meditrack/shared';
import { cn } from '@/lib/utils';

const ROLE_LABEL: Record<Role, string> = { apotekare: 'Apotekare', /* ... */ };
const ROLE_CLASS: Record<Role, string> = { apotekare: 'bg-blue-100 text-blue-800', /* ... */ };

export interface RoleBadgeProps { role: Role; }

export function RoleBadge({ role }: RoleBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-1 text-xs font-semibold',
        ROLE_CLASS[role],
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}
```

**Deltas the planner needs:** Per UI-SPEC §4 — `<LowStockBadge>` has NO props and renders fixed content. Use the destructive shadcn token (NOT the slate role tokens):

```typescript
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export function LowStockBadge() {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold',
      'bg-destructive text-destructive-foreground',
    )}>
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
      Lågt lager
    </span>
  );
}
```

**Anti-pattern reminder (LOAD-BEARING — called out in 02-CONTEXT.md `<code_context>` line 162 and UI-SPEC §4):** Do NOT extend `<RoleBadge>` to a generic `<Badge>` and pass it different colors. UI-SPEC §4 reads: *"New component — do NOT reuse `<RoleBadge>`, parallel to it."* The two badges share a visual lineage but have different semantics; coupling them would force a refactor when Phase 3 adds the status pill (`Utkast`/`Skickad`/...). RoleBadge.tsx's own comment (lines 11–15) anticipates a future `<Chip>` generalization but defers it. Phase 2 keeps the parallel separation.

---

### `apps/web/src/components/NplBadge.tsx` (NEW)

**Analog:** `apps/web/src/components/RoleBadge.tsx` lines 32–43 (the `<span>` skeleton).

**Pattern to mirror:** identical to LowStockBadge skeleton above, but with the `bg-slate-100 text-slate-600` palette from UI-SPEC §"Från NPL Badge Color Contract".

```typescript
import { cn } from '@/lib/utils';

export interface NplBadgeProps {
  children?: React.ReactNode;  // defaults to 'Från NPL' but full lock-note variant passes more text
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

Phase 2 uses two forms (UI-SPEC §6b): bare `<NplBadge>` and `<NplBadge>Från NPL · namn / form / styrka är låsta</NplBadge>`. Hence the `children` prop with a default, unlike `<RoleBadge>` which has zero render-time variation per role.

---

### `apps/web/src/components/InlineEditThreshold.tsx` (NEW — optimistic mutation)

**Analog:** `apps/web/src/features/auth/useLogin.ts` (lines 1–35 — `useMutation` shape) + `apps/web/src/features/auth/LoginForm.tsx` (lines 105–117 — `disabled` + `Loader2` button states).

**`useMutation` pattern to mirror** (useLogin.ts lines 15–35):

```typescript
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<LoginResponse, ApiError, LoginRequest>({
    mutationFn: (body) => fetchJson<LoginResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], { ...data.user, permissions: [] });
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
```

**Deltas the planner needs (greenfield — Phase 1 has NO optimistic mutation):**

UI-SPEC §5 "Inline-Edit Threshold" requires `onMutate` (cache snapshot + optimistic apply) and `onError` (rollback). The TanStack Query optimistic pattern is:

```typescript
const mutation = useMutation({
  mutationFn: (newValue: number) =>
    fetchJson<MedicationListItem>(`/api/medications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ lowStockThreshold: newValue }),
    }),
  onMutate: async (newValue) => {
    await queryClient.cancelQueries({ queryKey: ['medications'] });
    const prev = queryClient.getQueriesData({ queryKey: ['medications'] });
    queryClient.setQueriesData({ queryKey: ['medications'] }, (old: any) =>
      /* map old.rows, swap lowStockThreshold for row whose careUnitMedicationId === id */
      patchRow(old, id, { lowStockThreshold: newValue }),
    );
    return { prev };           // snapshot for rollback
  },
  onError: (_err, _vars, ctx) => {
    if (ctx?.prev) ctx.prev.forEach(([key, val]) => queryClient.setQueryData(key, val));
    toast.error('Kunde inte spara — försök igen.');
  },
  onSettled: () => queryClient.invalidateQueries({ queryKey: ['medications'] }),
});
```

Reuse the `ApiError` typing from `useLogin` so callers can pattern-match on `err.envelope.error.code` (D-19 / api.ts lines 20–34).

**Anti-pattern reminder:** Do NOT make the Sheet's main Save button optimistic. Per D-42, "Sheet-based saves stay **pessimistic**" — only the inline-threshold-edit goes optimistic. Mixing the strategies is intentional and scoped per surface.

---

### `apps/web/src/features/medications/useMedicationsQuery.ts` (NEW)

**Analog:** `apps/web/src/auth/useAuth.ts` (lines 1–46).

**Pattern to mirror** (useAuth.ts lines 29–46):

```typescript
export function useAuth() {
  const { data, isLoading } = useQuery<MeResponse>({
    queryKey: ['me'],
    queryFn: fetchMe,
    retry: false,
  });
  const can = useCallback((action) => data?.permissions.includes(action) ?? false, [data]);
  return { user: data ?? null, isLoading, can };
}
```

**Delta:** Filter-keyed query with serialized filters in the key:

```typescript
export function useMedicationsQuery(filters: MedicationListFilters) {
  return useQuery<MedicationListResponse, ApiError>({
    queryKey: ['medications', filters],  // structurally compared by TanStack
    queryFn: () => fetchJson<MedicationListResponse>(`/api/medications?${qs.stringify(filters)}`),
    placeholderData: keepPreviousData, // smooth pagination — phase 2 nicety
  });
}

export function useMedicationSearchQuery(q: string, enabled: boolean) {
  return useQuery<{ results: MedicationSearchResult[] }, ApiError>({
    queryKey: ['medication-search', q],
    queryFn: () => fetchJson(`/api/medications/search?q=${encodeURIComponent(q)}&limit=20`),
    enabled,                  // gate on debounced non-empty q (UI-SPEC §6a, debounce 150 ms)
  });
}
```

**Anti-pattern reminder:** Do NOT use the search query inside the page-level list fetch. Search and list have **different** query keys and different scope (search hits global Medication; list hits CareUnitMedication × Medication scoped to careUnit). Phase 1's single `['me']` key is the only Phase 1 query — Phase 2's two-key setup is greenfield, document the split.

---

### `apps/web/src/features/medications/useMedicationMutations.ts` (NEW)

**Analog:** `apps/web/src/features/auth/useLogin.ts` (entire file) + `apps/web/src/features/auth/useLogout.ts` (entire file, lines 22–32 — `removeQueries`/`invalidateQueries` patterns).

**Pattern to mirror** (useLogin.ts lines 15–35 + useLogout.ts lines 22–32):

```typescript
// useLogin
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation<LoginResponse, ApiError, LoginRequest>({
    mutationFn: (body) => fetchJson(...),
    onSuccess: (data) => {
      queryClient.setQueryData(['me'], {...});
      void queryClient.invalidateQueries({ queryKey: ['me'] });
    },
  });
}
// useLogout
return useMutation({
  mutationFn: () => fetchJson<void>('/api/auth/session', { method: 'DELETE' }),
  onSuccess: () => { queryClient.removeQueries({ queryKey: ['me'] }); navigate('/login', { replace: true }); },
});
```

**Deltas:** Export three hooks — `useCreateMedication`, `useUpdateMedication`, `useDeleteMedication`. All three invalidate `['medications']` on success (pessimistic save per D-42). On 409 (conflict_duplicate_medication), do not auto-toast — the create Sheet handles it inline (D-30 transparent restore is server-driven, so this code path means "neither active nor soft-deleted row exists but the typeahead surfaced a stale entry"; rare).

---

### `apps/api/prisma/seed.ts` (MODIFIED — extend with NPL CSV streaming + deterministic stock/threshold)

**Analog:** `apps/api/prisma/seed.ts` (Phase 1 entire file, lines 1–101).

**Idempotent-upsert pattern to mirror** (seed.ts lines 60–85):

```typescript
await prisma.careUnit.upsert({
  where: { id: CARE_UNIT_ID },
  update: { name: CARE_UNIT_NAME },
  create: { id: CARE_UNIT_ID, name: CARE_UNIT_NAME },
});

for (const user of SEED_USERS) {
  await prisma.user.upsert({
    where: { email: user.email },
    update: {},   // no-op on re-run (lines 76 comment)
    create: { email: ..., name: ..., role: ..., careUnitId: CARE_UNIT_ID, passwordHash },
  });
}
```

**Console-log + error-handling pattern** (seed.ts lines 87–101):

```typescript
console.log(`[seed] Seeded users (password=${SHARED_PASSWORD}): ${SEED_USERS.map((u) => u.email).join(', ')}`);

main()
  .catch((err) => { console.error('[seed] failed:', err); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
```

**Deltas the planner needs (Phase 2 greenfield additions):**

1. **CSV streaming.** Use `csv-parse` (or `papaparse` in stream mode) to read `apps/api/prisma/seed-data/lakemedel.csv`. Delimiter `;`, encoding `utf-8`, CRLF line endings (per 02-CONTEXT.md `<canonical_refs>` seed-data note). Columns: `nplid;namn;atc_kod;form;form_kod;styrka`. `styrka` may be empty.
2. **Deterministic PRNG keyed on `nplId`.** D-25 — FNV-1a hash (or equivalent reproducible function). Plan must document the chosen function in a top-of-file JSDoc, mirroring Phase 1's "Performance" comment style (seed.ts lines 22–25).
3. **Batched `createMany`.** D-24 — 1000-row chunks. After all `Medication` rows, batch `createMany` `CareUnitMedication` rows for the seeded `CARE_UNIT_ID`. Use `skipDuplicates: true` for idempotency (an alternative path to upsert when there's no natural unique key beyond the composite). For the second seed run, the unique on `(careUnitId, medicationId)` makes `createMany` a no-op.
4. **8% rigged below-threshold.** Generate stock and threshold such that `stock < threshold` for ~8% of rows. Document the PRNG bias in a comment.
5. **Order of operations:** care unit → users → medications (CSV stream + upsert/createMany) → careUnitMedications (createMany scoped to the seeded care unit).
6. **Idempotency probe:** Re-running `pnpm db:seed` against an already-seeded DB exits 0 with no DB writes (Phase 1 invariant, lines 7–13). Use `upsert` on `nplId` for `Medication` (matches schema unique).

**Anti-pattern reminder:** Do NOT use `prisma.medication.upsert` in a per-row loop for 43 538 rows — that's ~43k round trips. The Phase 1 user seed uses upsert because N=3; Phase 2 must use `createMany` with `skipDuplicates: true`, or a `findMany`-then-bulk-create hybrid, to keep seed timing under 30 s on a modern laptop (per `<specifics>` line 212).

---

### `apps/api/prisma/seed-data/lakemedel.csv` (NEW — committed)

**Analog:** none. Phase 1 has no committed seed-data file.

**Deltas the planner needs (PHASE 2 GREENFIELD):**

- Copy `local/lakemedel.csv` (43 538 rows, Läkemedelsverket NPL, ~3-5 MB) to `apps/api/prisma/seed-data/lakemedel.csv` and **commit it** (D-23 — NPL is publicly redistributable).
- Format already documented in 02-CONTEXT.md `<canonical_refs>` line 144: `nplid;namn;atc_kod;form;form_kod;styrka`, semicolon-delimited, UTF-8 + CRLF.
- The `form_kod` column is preserved in the CSV (for future use) but not consumed in Phase 2 seed logic.
- The seed script (above) is the only consumer; no other code references this CSV.
- README in Phase 7 will cite Läkemedelsverket as the source (per `<specifics>` line 211).

**Anti-pattern reminder:** Do NOT put this in `local/` (Phase 1 convention is "local/ = uncommitted assets" per CLAUDE.md). The CSV in `apps/api/prisma/seed-data/` is the **committed** twin so a fresh `git clone` + `docker compose up` works end-to-end without manual download (D-23 / `<specifics>` line 212).

---

## Shared Patterns

### Auth — `requireSession` + `requirePermission` preHandler chain

**Source:** `apps/api/src/routes/adminPing.ts` lines 26–40 (the canonical "preHandler ORDER MATTERS" example). Also `apps/api/src/auth/requireSession.ts` lines 21–62 and `apps/api/src/auth/requirePermission.ts` lines 27–50.

**Apply to:** Every Phase 2 medication route file (`list.ts`, `search.ts`, `create.ts`, `update.ts`, `delete.ts`).

```typescript
r.get(
  '/api/admin/ping',
  {
    preHandler: [requireSession, requirePermission('admin:ping')],
    schema: { response: { 200: adminPingResponse } },
  },
  async () => ({ pong: true as const, at: new Date().toISOString() }),
);
```

**Order rule (Phase 1 adminPing.ts lines 17–19, requirePermission.ts lines 12–14):** `requireSession` FIRST (sets `req.user`), `requirePermission` SECOND (reads `req.user.role`). Never reorder.

### CareUnit scoping — service layer first arg

**Source:** `apps/api/src/services/user.service.ts` lines 4–10 + 17–37.

**Apply to:** Every function in `apps/api/src/services/medication.service.ts`.

```typescript
export async function getMeForSession(
  careUnitId: string,         // ← FIRST arg, ALWAYS
  sessionId: string,
): Promise<MeResponse> {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    /* ... */
  });
  if (!session || session.careUnitId !== careUnitId) {
    throw new Error('Session no longer valid');
  }
  ...
}
```

Route handlers pull `careUnitId` from `req.user!.careUnitId` (decorated by `requireSession`, type-declared in `apps/api/src/types/fastify.d.ts` lines 11–20).

### Error envelope translation

**Source:** `apps/api/src/plugins/errorHandler.ts` lines 71–112 (the `setErrorHandler` block).

**Apply to:** All Phase 2 service-layer thrown errors. Throw the named class; the existing error handler converts to envelope. Per D-19 Phase 2 needs `NotFoundError`, `ConflictDuplicateMedicationError`, `ForbiddenScopeError` added to this same file.

```typescript
if (err instanceof InvalidCredentialsError) {
  return send(reply, 400, envelope('invalid_credentials', 'Fel e-post eller lösenord.'));
}
if (err instanceof UnauthenticatedError) {
  return send(reply, 401, envelope('unauthenticated', 'Du måste logga in.'));
}
// Phase 2 adds NotFoundError → 404, ConflictDuplicateMedicationError → 409, ForbiddenScopeError → 403
```

### Zod-as-contract (FE↔BE single source)

**Source:** `packages/shared/src/contracts/login.ts` lines 9–32 (request + response paired schemas) + `apps/api/src/routes/auth.ts` lines 31–38 (route `schema: { body: loginRequest, response: { 200: loginResponse } }`) + `apps/web/src/features/auth/LoginForm.tsx` lines 40–43 (`zodResolver(loginRequest)`).

**Apply to:** All Phase 2 medication routes (BE) AND `<MedicationSheet>` form (FE create + edit paths).

```typescript
// shared: define once
export const medicationCreateRequest = z.discriminatedUnion('kind', [...]);

// BE: validates on the wire
r.post('/api/medications', { schema: { body: medicationCreateRequest, ... } }, ...);

// FE: validates the form
const { register, handleSubmit } = useForm<MedicationCreateRequest>({
  resolver: zodResolver(medicationCreateRequest),
});
```

### `<Can>` / `useCan` RBAC gating

**Source:** `apps/web/src/auth/Can.tsx` lines 23–29 + `apps/web/src/auth/useCan.ts` lines 14–16.

**Apply to:** All Phase 2 add buttons (desktop + FAB — UI-SPEC §10), edit Sheet save button, delete button. Sheet itself may open in `mode='view'` for `sjuksköterska` (D-36) — drive `mode` off `useCan('medication:update')`.

```tsx
<Can action="medication:create">
  <Button onClick={openCreateSheet}>Lägg till läkemedel</Button>
</Can>

// inline:
<Button disabled={!useCan('medication:update')}>Spara</Button>
```

The BE remains the security boundary (Phase 1 Can.tsx comment lines 15–18 reiterates this).

### `fetchJson` for all API calls

**Source:** `apps/web/src/lib/api.ts` lines 36–84.

**Apply to:** Every Phase 2 query and mutation. `credentials: 'include'` is already baked in (line 53); `ApiError` carries the envelope for caller-side `err.envelope.error.code` matching.

```typescript
const data = await fetchJson<MedicationListResponse>(`/api/medications?${qs}`);
```

Catch with `if (err instanceof ApiError && err.status === 409) { ... }` for the `conflict_duplicate_medication` edge.

### Responsive switch (table at md+ / cards <md)

**Source:** `apps/web/src/routes/shell/AppShell.tsx` lines 30–43 (Tailwind responsive `md:` chain, NO `useMediaQuery`).

**Apply to:** Catalog page render — `<MedicationTable className="hidden md:block" />` + `<MedicationCardList className="block md:hidden" />` (UI-SPEC §"Responsive Breakpoint Contracts"). CSS-only switch, mirroring Phase 1's nav switch.

### `lang="sv"` + Swedish copy

**Source:** Phase 1 UI-SPEC §A11y carries `<html lang="sv">`. Phase 1 user-facing strings (`'Fel e-post eller lösenord.'` in errorHandler.ts line 96, `'Loggar in…'` in LoginForm.tsx line 110, etc.) are all hardcoded Swedish.

**Apply to:** Every Phase 2 user-facing string per UI-SPEC §"Copywriting Contract". No translation layer; verbatim Swedish hardcoded in JSX and toast calls.

---

## No Analog Found

Files with no close match in Phase 1 code (planner should reference UI-SPEC + shadcn primitives for these, not Phase 1):

| File | Role | Data Flow | Reason / Where to Look |
|------|------|-----------|-----------------------|
| `MedicationTable.tsx` | component | read-only | Phase 1 has no `<Table>` usage. Reference: shadcn `<Table>` primitive (added Phase 2 — UI-SPEC §Components to Build), UI-SPEC §2 has the full column spec. |
| `DeleteMedicationDialog.tsx` | component | mutated | Phase 1 has no `<AlertDialog>` usage. Reference: shadcn `<AlertDialog>` primitive (added Phase 2), UI-SPEC §7. |
| `PaginationFooter.tsx` | component | read-only | Phase 1 has no pagination UI. Reference: UI-SPEC §11 (full spec including `aria` and Swedish copy). |
| `apps/api/prisma/seed-data/lakemedel.csv` | data | write-once | Phase 1 commits no data files. Reference: 02-CONTEXT.md `<canonical_refs>` line 144 (column format) + D-23 (copy & commit). |

Three additional surfaces are *partial* greenfield — they have a structural analog but a key behavior is new:

- `MedicationSheet.tsx` — Sheet primitive is new (Phase 2 shadcn install), but the rhf+zodResolver+useMutation pattern inside is identical to `LoginForm.tsx`.
- `LakemedelFilter.tsx` — uses shadcn `<Command>` (new Phase 2 install) for the ATC combobox; no Phase 1 combobox analog.
- `InlineEditThreshold.tsx` — `useMutation` shape is Phase 1, but `onMutate`/optimistic-cache pattern is greenfield.

---

## Metadata

**Analog search scope:** `apps/api/src/**` (20 files), `apps/web/src/**` (40 files), `packages/shared/src/**` (7 files), `apps/api/prisma/**` (3 files).
**Files scanned:** 70 source files.
**Pattern extraction date:** 2026-05-21.
**Notes:**
- Pattern lineage labels (Pattern B, D, E, F, J, K, L, M, etc.) appear in Phase 1 JSDoc comments — preserve them in Phase 2 files for cross-referencing.
- All Phase 1 files cited above include `D-NN` decision references in their headers; Phase 2 files should follow the same convention citing `D-20`..`D-45` from 02-CONTEXT.md.
- The 02-CONTEXT.md `<code_context>` section (lines 153–184) is the authoritative summary of which Phase 1 assets are reusable as-is vs. extended. This PATTERNS.md is its file-level expansion.
