# MediTrack

## Vad är det här?

Internt webbverktyg på svenska för **vårdenheter** att hantera läkemedelslager
och beställningar — sjuksköterskor, apotekare och administratörer ser aktuellt
lagersaldo, lägger flerradsbeställningar och följer status `Utkast → Skickad
→ Bekräftad → Levererad`, med varning när ett läkemedel går under sin
tröskel. Ersätter dagens felbenägna listor och e-postbeställningar.

Levereras som Medovias case för senior-fullstack-intervjun (en veckas
tidsbudget).

## Snabbstart med Docker Compose

`docker compose up` är guldkommandot — postgres, api och web startar
tillsammans, migrationerna körs, seedningen lägger upp tre demo-användare och
SPA:n nås på `http://localhost:5173`.

### Förkrav

- **Docker Desktop ≥ 4.x** (eller Docker Engine + Compose v2)
- Node 20 och pnpm 8+ behövs bara för lokal utveckling utanför Docker
  (se nedan). Aktivera pnpm via Corepack vid behov:
  `corepack enable && corepack prepare pnpm@9.0.0 --activate`.

### Tre steg

1. Skapa `.env` från mallen och generera ett riktigt cookie-hemligt värde:
   ```bash
   cp .env.example .env
   # Lägg in 32 slumpade bytes som COOKIE_SECRET:
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```
   Klistra in resultatet bakom `COOKIE_SECRET=` i `.env`.

2. Starta hela stacken (första körningen drar postgres-imagen och bygger
   api + web — räkna med ett par minuter på kallt cache):
   ```bash
   docker compose up --build
   ```

3. Öppna `http://localhost:5173` i webbläsaren och logga in med ett av
   demo-kontona nedan.

### Återställning

För att rensa databasvolymen och börja om från start:
```bash
docker compose down -v && docker compose up --build
```
Seedningen är idempotent — du kan köra `docker compose up` om och om igen
utan att antalet användare växer.

## Demo-konton

Tre seedade användare på samma vårdenhet, alla med samma demo-lösenord:

| E-post                       | Lösenord  | Roll          | Vårdenhet               |
|------------------------------|-----------|---------------|-------------------------|
| `apotekare@example.test`     | `demo1234`| Apotekare     | Avdelning 4, Karolinska |
| `sjukskoterska@example.test` | `demo1234`| Sjuksköterska | Avdelning 4, Karolinska |
| `admin@example.test`         | `demo1234`| Admin         | Avdelning 4, Karolinska |

Lösenorden är ett medvetet trivialt demo-värde och finns i klartext i
seed-skriptet (`apps/api/prisma/seed.ts`). I en skarp miljö skulle de
genereras per användare och rotaras vid första inlogg — det är inte
inom ramen för Phase 1.

## Lokal utveckling utan Docker

För snabbare iteration (HMR i Vite, `tsx watch` på api:t) kan postgres
ligga i Docker medan api och web kör direkt på värddatorn:

1. Starta bara postgres-tjänsten:
   ```bash
   docker compose up postgres -d
   ```

2. Installera beroenden vid första körningen:
   ```bash
   pnpm install
   ```

3. Kör initial migration + seed (en gång efter `down -v` eller schemaändring):
   ```bash
   pnpm --filter @meditrack/api exec prisma migrate dev
   pnpm --filter @meditrack/api exec prisma db seed
   ```

4. Starta api och web i parallell (alternativt i två terminaler):
   ```bash
   pnpm -r --parallel dev
   ```
   - api lyssnar på `http://localhost:3000`
   - web kör Vite dev-server på `http://localhost:5173` med proxy till api

## Tester

API:t har en integrations-smoke-svit (Vitest + Fastify `app.inject` mot
samma Postgres som dev-stacken):

```bash
pnpm --filter @meditrack/api exec vitest run
```

Suiten täcker login (AUTH-01), `/me`-rundturen (AUTH-02), RBAC-matrisen
för `/api/admin/ping` (AUTH-05/06) och en end-to-end-smoke som loggar
in som var och en av de tre demo-rollerna och kör hela
`login → /me → /admin/ping → logout`-pipelinen
(`apps/api/test/auth.flow.smoke.test.ts` — Phase 1 success-kriterium #4).

## Status

Phase 1 — Foundation & Auth — är klar. Phases 2–7 är planerade men inte
implementerade ännu. Se `.planning/ROADMAP.md` för fasplanen och
`.planning/REQUIREMENTS.md` för alla 38 v1-requirements med spårbarhet.

Phase 7 kommer utöka denna README med det fulla brief-kravet:
arkitektur-motivering, svaren på §6 (samtidighet, skalning, retrofitting
av auth), och "kända luckor + vad jag skulle göra med mer tid".

## Audit log

Every successful mutation in MediTrack is recorded in an immutable
`audit_events` table — medication CRUD, order status transitions
(`Utkast → Skickad → Bekräftad → Levererad`), order-line edits,
stock decrements/increments, session creates and deletes, and failed
login attempts. The table is **append-only — no application code path
issues UPDATE, DELETE, UPDATE_MANY, DELETE_MANY, or UPSERT against it.**
Append-only is enforced at two independent layers.

### Layer 1 — code absence (architectural)

The codebase contains zero calls to `prisma.auditEvent.update`,
`updateMany`, `delete`, `deleteMany`, or `upsert`. This is mechanically
asserted on every CI run by integration test #3 in
`apps/api/test/audit.integration.test.ts` ("grep finds zero
prisma.auditEvent.update*/delete*/upsert calls"), which spawns:

```bash
git grep -nE 'prisma\.auditEvent\.(update|delete|deleteMany|updateMany|upsert)\b' apps packages
```

and asserts exit code 1 (no matches). The grep is the canonical
acceptance check for AUD-03's "no UPDATE or DELETE code paths exist."

The same patterns are caught at PR time by an ESLint
`no-restricted-syntax` rule in `.eslintrc.cjs` (D-99):

```js
selector: "MemberExpression[object.property.name='auditEvent'][property.name=/^(update|updateMany|delete|deleteMany|upsert)$/]"
message:  "audit_events is append-only — see Phase 5 D-98. Use prisma.auditEvent.create only."
```

`pnpm lint` runs this rule across the whole workspace. A scratch-file
smoke test (run inline by Plan 03 verification) confirms the rule
actually fires on a fabricated `prisma.auditEvent.update(...)` call —
not just absent-by-omission. Allowed methods: `create`, `findMany`,
`findUnique`, `findFirst`, `count`, `aggregate`, `groupBy`.

### Layer 2 — DB role privilege revocation + BEFORE-trigger

Migration `0008_audit_events_revoke_grants` runs two things:

1. `REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM CURRENT_USER`
   — the standard GRANT/REVOKE guard, kept as defense-in-depth so any
   future runtime role that doesn't own the table is automatically
   guarded.
2. A `BEFORE UPDATE/DELETE/TRUNCATE` trigger that calls a plpgsql
   function which `RAISE EXCEPTION ... USING ERRCODE = '42501'`. 42501
   is the canonical SQLSTATE behind "permission denied for table".

The trigger is the binding layer in practice because the `meditrack`
role **owns** the table — Postgres bypasses GRANT/REVOKE checks for
owners, so REVOKE alone is ineffective today. The trigger fires
unconditionally and produces the verbatim "permission denied" message
D-98 promised. Integration test #4 ("Postgres rejects UPDATE on
audit_events") asserts this from the test runner:

```ts
await expect(
  prisma.$executeRawUnsafe(`UPDATE "AuditEvent" SET action=$1 WHERE id=$2`, 'hacked', realId),
).rejects.toThrow(/permission denied/i);
```

If a future code change tries an UPDATE — even one that ESLint and the
grep test missed — Postgres physically rejects it. **Append-only is
enforced by Postgres GRANTs and triggers, not by the application.**

### How the audit hook works

A Prisma `$extends` middleware (`apps/api/src/db/auditExtension.ts`)
intercepts `create`, `update`, `updateMany`, `delete`, `deleteMany` on
six audited models (`Medication`, `CareUnitMedication`, `Order`,
`OrderLine`, `User`, `Session`). Each per-model handler resolves the
active client surface from the `AsyncLocalStorage` store's `activeTx`
slot — when the caller is inside `prisma.$transaction(async (tx) => ...)`,
that slot holds the tx client; for bare calls, it falls back to the
captured root client from `Prisma.defineExtension`. The extension
intercepts `$transaction` calls at runtime (via `patchTransactionForAudit`,
defined in `apps/api/src/db/auditExtension.ts`, applied once in
`apps/api/src/db/client.ts`) to push the tx into the `activeTx` slot
before the user's callback runs, then clears it in the finally block. The
handler then routes BOTH the `findUnique` / `findMany` `before`-row
pre-loads AND the final `auditEvent.create` audit-row INSERT through that
resolved context — routing through the captured root `client` is what the
original Plan 01 ship did and what caused D-91 to fail. **If the mutation rolls back, the audit row rolls back with it**
— integration test #2 forces a throw inside a
`prisma.$transaction(async (tx) => { await tx.careUnitMedication.update(...); throw new Error('forced rollback'); })`
block and asserts zero `audit_events` rows for the rolled-back entity
(D-91: "the audit log doesn't lie").

Actor identity is carried from the Fastify `onRequest` hook to the
Prisma middleware via `AsyncLocalStorage`
(`apps/api/src/plugins/requestContext.ts`) — store payload
`{ actorUserId, careUnitId, requestId, requestSource, ipAddress, actionOverride, activeTx }`.
The actor is **never** sourced from a request body. When the ALS store
is empty (seed scripts, migration runners), the middleware skips audit
row creation entirely (D-92) — `apps/api/prisma/seed.ts` runs outside
the ALS scope, so the audit table starts empty on a fresh
`docker compose up`.

The `auth.login_failed` path is the one place explicit `prisma.auditEvent.create`
calls live (in `apps/api/src/services/auth.service.ts`) — those events
fire BEFORE the `Session.create`, so the `$extends` middleware can't
observe them. Two writes, both inside the failure branches.

### What's audited

| Model              | Allowlisted columns                                                                                                                                                         | Notes                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Medication         | id, nplId, name, atcCode, form, strength, source, createdAt                                                                                                                 | —                                                                                  |
| CareUnitMedication | id, careUnitId, medicationId, currentStock, lowStockThreshold, deletedAt, createdAt, updatedAt                                                                              | Stock changes audited via `stock.increment` siblings of `order.deliver`.           |
| Order              | id, careUnitId, createdByUserId, status, submittedAt, submittedByUserId, confirmedAt, confirmedByUserId, deliveredAt, deliveredByUserId, deletedAt, createdAt, updatedAt    | Status transitions wrapped with `withActionOverride('order.submit'|'confirm'|...)` |
| OrderLine          | id, orderId, careUnitMedicationId, quantity, createdAt, updatedAt                                                                                                           | —                                                                                  |
| User               | id, email, name, role, careUnitId, createdAt, updatedAt — **excludes `passwordHash`**                                                                                       | Hash NEVER appears in audit rows (D-97). Asserted by integration test #5.          |
| Session            | userId, careUnitId, createdAt, expiresAt, lastSeenAt — **excludes `id` (the raw signed session token)**                                                                     | Two-layer leak prevention — see below.                                             |

For Session-typed audit rows the `entityId` column carries the actor
User.id, **NEVER** the raw `Session.id` (T-05-03). This is enforced by
`resolveEntityId(model, row)` in `apps/api/src/db/auditAllowlist.ts`,
which returns `row.userId` for Session writes. Two layers close the
session-token leak path:

- `AUDIT_ALLOWLIST` excludes `Session.id` from the `after` JSON.
- `resolveEntityId` returns `row.userId` (NOT `row.id`) for `entityId`.

Both layers are asserted in lockstep by integration test #7
("auth.login + auth.logout entityId equals User.id, NEVER the raw
Session.id").

### Known gap (honest disclosure)

`prisma.$queryRaw` and `prisma.$executeRaw` are **not** intercepted by
the `$extends` middleware. The middleware sits at the model-method
boundary, not the raw-SQL boundary.

Today this is harmless: the only raw queries in the codebase are
Phase 4's `FOR UPDATE` row lock (a read, not a mutation — the actual
UPDATE goes through Prisma's `updateMany` which IS audited). But a
**future** raw write would silently bypass the audit log. v2
mitigation: a CI grep banning `$executeRaw` outside an allowlist
(Phase 4's `FOR UPDATE` would be allowlisted; future raw-writes would
force a code-review discussion).

**One-shot orphan-row cleanup (migration 0009).** The initial Phase 5
ship had a bug in the Prisma extension where the audit-row INSERT and
`before`-row pre-loads ran against the captured root `client` argument
from `Prisma.defineExtension((client) => ...)`, not against the active
transactional context. Mutations that rolled back left orphan audit rows
that the append-only triggers refused to let application code delete.
Migration `0009_audit_events_purge_orphans` is a one-shot maintenance
migration that disables `AuditEvent_no_delete` inside its own
transaction, deletes all pre-migration rows, then re-enables the trigger
— all inside the same tx, so the audit table is never bypassable in a
state visible to a concurrent session. The fix to the extension (Plan 04
Task 1) and the regression test (Plan 04 Task 2) ensure no future
rollback produces an orphan.

### §6 interview-ready phrasings

The Medovia brief §6 lists four discussion questions. Phase 5 sharpens
the answers:

**"Two nurses ordering simultaneously" (concurrency).**
Phase 4 holds the row lock; the loser's transaction rolls back, and
the audit log rolls back with it (D-91) — the failed attempt does NOT
appear in `audit_events`. **The audit log doesn't lie** about what
actually happened. Integration test #2 asserts this rollback contract.

**"Scale to 50 vårdenheter".**
Audit rows carry a denormalized `careUnitId` column. The admin view is
intentionally cross-tenant today; v2 adds a "scope to my vårdenhet"
filter without a migration — the column is already there. Cursor
pagination via `useInfiniteQuery` (D-105) keeps the list endpoint
O(page-size) instead of offset-O(skip+limit), so the latency budget
holds as the table grows.

**"Retrofitting auth".**
Phase 5 retrofitted audit logging without touching any Phase 2/3/4
service code. The `$extends` extension wraps the existing Prisma
client; existing services keep their `import { prisma }` and pick up
audit behavior transparently. The same pattern would handle a per-row
authz check — `$extends` on `findMany` to inject a `where: { tenantId }`
clause. This is the canonical answer to "could you bolt auth on later
without rewriting?" — yes, this codebase already did it for audit.

**"What I'm proud of".**
Append-only is enforced by Postgres GRANTs and a BEFORE-trigger, not
by the application. Even if a future contributor writes
`prisma.auditEvent.delete(...)`, ESLint blocks the commit; if the lint
disables get committed, Postgres rejects the query at the role layer
with `permission denied`. Two layers, both asserted by tests:

- Integration test #3 — grep for the banned patterns, asserts zero matches.
- Integration test #4 — raw-SQL UPDATE against AuditEvent, asserts rejection.

**"What I'm least proud of".**
The Prisma extension can't see `$queryRaw` mutations. No such mutations
exist today — Phase 4's `FOR UPDATE` is read-only — but a future raw
write would silently bypass the audit log. v2: a CI grep banning
`$executeRaw` outside an allowlist. I picked the smallest blast radius
I could find for a one-week budget, and chose to document the gap
honestly rather than hide it.

### v2 candidates

What I'd add with more time, in rough priority order:

- **Retention purge / cold-storage tier** — v1 keeps audit rows forever
  (D-101). A TTL or archival cron would need a separately-grantable
  purge role to bypass the REVOKE without breaking the architectural
  append-only story.
- **`$executeRaw` allowlist CI grep** — Closes the known gap above.
- **Hash-chained rows for cryptographic append-only proof** — Each row
  carries `sha256(prev_row || this_row)`; tampering with row N
  invalidates the chain from N onward.
- **Per-vårdenhet admin view** — A "scope to my vårdenhet" filter in
  the FE; column is already on the row.
- **Audit-event export (CSV / PDF)** — Out of scope per PROJECT.md but
  trivial to wire on top of the existing list endpoint.
- **Webhook / SIEM forwarding** — Emit each row to Splunk / Datadog /
  similar via a post-commit hook.
- **Read-event auditing** — Today only mutations are audited. v2 could
  log SELECT events too (with sampling to bound row volume).
- **Free-text omnibox search** — D-103 ships three combobox filters;
  v2 could add a search box over actor / entity / action / diff text.
- **JSONB patch diff storage (RFC 6902)** — D-95 stores full
  before/after; v2 could store a compact patch to save space at scale.
- **`auth.login_failed` brute-force banner** — Surface N failed-logins
  from one email in M minutes as an admin-page banner.

## Vad ligger var?

| Sökväg              | Innehåll                                                          |
|---------------------|-------------------------------------------------------------------|
| `apps/web`          | React + Vite + Tailwind + shadcn (SPA)                            |
| `apps/api`          | Fastify + Prisma (Node.js + TypeScript)                           |
| `packages/shared`   | Zod-kontrakt och konstanter delade mellan klient och server       |
| `.planning`         | Planeringsartefakter (PROJECT, REQUIREMENTS, ROADMAP, fas-planer) |
| `local`             | Lokala filer (brief-PDF m.m.); committas inte                     |
