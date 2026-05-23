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

The runtime role is `meditrack_app` — a named non-owner role whose
REVOKE on AuditEvent UPDATE/DELETE/TRUNCATE binds it physically
(Layer 2b, migration 0010). The OWNER role hits the BEFORE-trigger guard
(Layer 2a, migration 0008). See §Database roles below for the env-var split.

The trigger is the binding layer for owner sessions because the `meditrack`
role **owns** the table — Postgres bypasses GRANT/REVOKE checks for
owners, so REVOKE alone is ineffective for owner connections. The trigger fires
unconditionally and produces the verbatim "permission denied" message
D-98 promised. Integration test #4 ("Postgres rejects UPDATE on
audit_events") now asserts both layers:

```ts
await expect(
  prisma.$executeRawUnsafe(`UPDATE "AuditEvent" SET action=$1 WHERE id=$2`, 'hacked', realId),
).rejects.toThrow(/permission denied/i);
```

If a future code change tries an UPDATE — even one that ESLint and the
grep test missed — Postgres physically rejects it. **Append-only is
enforced by Postgres GRANTs and triggers, not by the application.**

#### Two-migration sequence (Migration 0008 → Migration 0010)

The append-only enforcement landed in two migrations:

- **Migration 0008** (Plan 01) installed an OWNER-binding `BEFORE UPDATE OR DELETE OR TRUNCATE`
  trigger on `AuditEvent` (Layer 2a) plus a no-op `REVOKE ... FROM CURRENT_USER` (Plan 01's
  SUMMARY documents the no-op finding — `CURRENT_USER` evaluated to the table owner, which
  Postgres bypasses for GRANT/REVOKE checks).
- **Migration 0010** (Plan 05-07) adds the NAMED-role `REVOKE UPDATE, DELETE, TRUNCATE ON
  "AuditEvent" FROM meditrack_app` (Layer 2b) and switches the application's runtime
  `DATABASE_URL` to connect as `meditrack_app`. The trigger in 0008 remains active and
  remains the OWNER-side guard (admin `psql` sessions, migrations, seed scripts).

Migration 0008's SQL is intentionally left unmodified: editing any byte of an applied Prisma
migration changes its SHA-256 checksum and causes `prisma migrate status` to report drift.
The cross-reference between the two migrations is documented in 0010's header instead.
See §Database roles below for the env-var split between the two roles.

### Database roles

The Postgres database has two roles:

- **`meditrack`** — the owner role. Used by `prisma migrate deploy` (migrations) and
  `prisma db seed` (seed scripts). Has full privileges on every table. Connection string lives
  in `DIRECT_URL`.
- **`meditrack_app`** — the application runtime role. Used by the api container's PrismaClient
  for ALL request-handling queries. Has SELECT / INSERT / UPDATE / DELETE on every table
  **EXCEPT** `AuditEvent`, where the role has SELECT + INSERT only — UPDATE / DELETE / TRUNCATE
  have been explicitly REVOKEd by migration 0010. Connection string lives in `DATABASE_URL`.

This split is the named-role half of the append-only audit-log story (D-98 Layer 2b). The
runtime role physically cannot mutate audit rows; the OWNER role can technically mutate them
but hits the BEFORE-trigger installed by migration 0008 (Layer 2a) which raises
`permission denied`. Either layer alone is sufficient for its role; the two compose for
defense-in-depth.

**The REVOKE is bound to a NAMED role, not to whichever role happened to run the migration.**
A future deployment swapping to a different role must consciously regrant the privileges,
surfacing the architectural decision instead of accidentally relaxing it. See
`apps/api/prisma/migrations/20260523000000_0010_audit_events_named_app_role/migration.sql`
for the GRANTs and the REVOKE; integration test #4 in
`apps/api/test/audit.integration.test.ts` asserts both layers (HIGH #3, Plan 05-07).

For local development, the role passwords are hardcoded in `docker-compose.yml`
(`meditrack` / `meditrack_app_dev`). Production deployments would substitute these with real
secrets via docker-compose `env_file` or a secret manager — out of scope for this demo.

| Role             | Used by                                  | Env var      | AuditEvent privileges |
|------------------|------------------------------------------|--------------|-----------------------|
| `meditrack`      | migrations, seed, admin psql sessions    | `DIRECT_URL` | Full (trigger guards) |
| `meditrack_app`  | api PrismaClient (all runtime queries)   | `DATABASE_URL` | SELECT + INSERT only |

### How the audit hook works

A Prisma `$extends` middleware (`apps/api/src/db/auditExtension.ts`)
intercepts `create`, `update`, `updateMany`, `delete`, `deleteMany` on
six audited models (`Medication`, `CareUnitMedication`, `Order`,
`OrderLine`, `User`, `Session`). Each per-model handler resolves the
active Prisma client by reading the top of `activeTxStackALS` — when
the caller is inside `prisma.$transaction(async (tx) => ...)`, that
stack holds the tx client; for bare calls it falls back to the captured
root client from `Prisma.defineExtension`. The extension intercepts
`$transaction` calls at runtime (via `patchTransactionForAudit`,
defined in `apps/api/src/db/auditExtension.ts`, applied once in
`apps/api/src/db/client.ts`) and calls `withActiveTx(tx, fn)` which
pushes the tx onto `activeTxStackALS` via a new `.run([...prev, tx], fn)`
frame — nested and parallel transactions each get their own independent
ALS frame so they never cross-attribute (CR-01). The handler then routes
BOTH the `findUnique` / `findMany` `before`-row pre-loads AND the final
`auditEvent.create` audit-row INSERT through that resolved context —
routing through the captured root `client` is what the original Plan 01
ship did and what caused D-91 to fail. **If the mutation rolls back, the
audit row rolls back with it** — integration test #2 forces a throw inside
a `prisma.$transaction(async (tx) => { await tx.careUnitMedication.update(...); throw new Error('forced rollback'); })`
block and asserts zero `audit_events` rows for the rolled-back entity
(D-91: "the audit log doesn't lie").

Actor identity and action overrides are carried from the Fastify
`onRequest` hook to the Prisma middleware via three independent
`AsyncLocalStorage` instances in
`apps/api/src/plugins/requestContext.ts`:

- **`actorALS`** — `{ actorUserId, careUnitId, requestId, requestSource, ipAddress }`.
  Seeded once per request in the `onRequest` hook (3-arg Fastify form:
  `actorALS.run(scope, () => done())`); updated by `setActor()` after
  cookie verification. When the store is absent (seed scripts, migration
  runners), the middleware skips audit row creation entirely (D-92) —
  `apps/api/prisma/seed.ts` runs outside the ALS scope, so the audit
  table starts empty on a fresh `docker compose up`.
- **`activeTxStackALS`** — a `readonly PrismaClient[]` stack managed by
  `withActiveTx(tx, fn)` / `currentActiveTx()`. Push and pop are
  implemented as immutable `.run([...prev, tx], fn)` frames rather than
  mutating a shared slot, so nested `$transaction` calls never overwrite
  each other's tx reference (CR-01 fix).
- **`actionOverrideALS`** — a single `string` frame (or absent). Set by
  `withActionOverride(action, fn)` which uses
  `actionOverrideALS.run(action, async () => fn())`. The `async` wrapper
  is critical: Prisma's `PrismaPromise` is lazy — without it, `.run()`
  only covers the synchronous `fn()` call that creates the lazy Promise;
  the actual `$extends` handler fires later when the Promise is
  `.then()`-ed, at which point the bare `.run()` frame would already be
  gone.

The actor is **never** sourced from a request body. Three regression
tests guard the per-concern ALS design: test #12 (nested `$transaction`
— outer rollback drops its audit row while the inner independent tx
keeps its own), test #13 (parallel `$transaction` with setImmediate
interleaving — each tx audits to its own actor, not the other's),
and test #14 (parallel requests on keep-alive connections — ALS frames
stay isolated across requests, CR-04).

The `auth.login_failed` path is the one place explicit `prisma.auditEvent.create`
calls live (in `apps/api/src/services/auth.service.ts`) — those events
fire BEFORE the `Session.create`, so the `$extends` middleware can't
observe them. Two writes, both inside the failure branches.

### Why `$extends` over `$use`?

Two Prisma middleware mechanisms exist:

- **`$use(middleware)`** — the original middleware API. Wraps every Prisma operation in a chain of functions; an audit middleware would intercept by registering a `$use` function that wraps the operation.
- **`$extends({query: {...}})`** — the typed-extension API introduced in Prisma 4 and the documented forward path in Prisma 5+.

Phase 5 uses `$extends` because:
- `$extends` ships typed extensions per model + per method — `prisma.medication.create` and `prisma.order.update` get distinct extension handlers with type-safe arg shapes. `$use` has a single generic middleware function with untyped args.
- `$extends` is documented as the long-term API; `$use` is being phased out (the Prisma 5.0 release notes name `$extends` as the recommended replacement).
- The trade-off: `$extends` does NOT natively intercept `prisma.$transaction` callbacks (the extension's interceptors fire on the EXTENDED client; calling `prisma.$transaction(async (tx) => tx.x.y())` invokes `tx.x.y()` on the inner unextended client). Plan 05-04 closed this gap with the runtime `$transaction` patch in `auditExtension.ts:patchTransactionForAudit`; Plan 05-06 hardened it under nested + parallel + keep-alive concurrency via per-concern ALS instances.

Closes 05-REVIEWS.md MEDIUM #18.

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

### Defense-in-depth guards (Plan 05-08)

Three additional guards close gaps the two layers above didn't cover:

- **`createMany` is banned outside `apps/api/prisma/seed.ts`** (ESLint
  `no-restricted-syntax`, 05-REVIEWS.md HIGH #4). D-93 deliberately skipped
  intercepting `createMany` in the audit extension because seed was the only
  known consumer. The ESLint ban operationalises that decision — a future
  contributor adding a `prisma.medication.createMany([...])` call in a service
  file gets a PR-time lint error directing them to either (a) decompose into N
  individual `prisma.<model>.create({data})` calls (which ARE intercepted) or
  (b) reopen D-93 and intercept `createMany` in the extension.

- **`$executeRaw` / `$executeRawUnsafe` are subject to a CI allowlist**
  (integration test `audit.integration.test.ts` Test 15, 05-REVIEWS.md MEDIUM
  #5). Raw queries bypass the audit extension; a CI grep asserts every
  production-code match is in a documented allowlist. The allowlist is currently
  empty — Phase 4 D-79's `FOR UPDATE` uses `$queryRaw` (READ form), which is
  not subject to the ban. A future raw-write must be added to the allowlist
  consciously, surfacing the architectural decision at PR time.

- **`audit_events.entityId` cannot be empty or NULL** (migration 0011 BEFORE
  INSERT trigger, 05-REVIEWS.md LOW #12). Plan 05-05's WR-07 split path closed
  the sentinel-empty-string case in the application code (`auth.service.ts` now
  sets `entityId` to the attempted email for unknown-email login failures). The
  trigger is the DB-layer backstop — any future code path that forgets to set
  `entityId` hits SQLSTATE 23514 instead of writing a meaningless row.

### Known gap (honest disclosure)

`prisma.$queryRaw` and `prisma.$executeRaw` are **not** intercepted by
the `$extends` middleware. The middleware sits at the model-method
boundary, not the raw-SQL boundary.

Today this is harmless: the only raw queries in the codebase are
Phase 4's `FOR UPDATE` row lock (a read, not a mutation — the actual
UPDATE goes through Prisma's `updateMany` which IS audited), and some
read-only `$queryRaw` calls in `medication.service.ts` (column-vs-column
predicates Prisma ORM cannot express). No `$executeRaw` write calls exist
in production code — enforced by the CI grep in Test 15 above. A future
raw write that needs to land must be added to the allowlist with a
documented reason, surfacing the audit-bypass decision at PR time.

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

Plan 05-08 deepened the enforcement with three additional guards: an ESLint
ban on `*.createMany` outside `seed.ts` (HIGH #4), a CI grep enforcing an
allowlist on `$executeRaw` writes (MEDIUM #5), and a BEFORE INSERT trigger
rejecting empty-string `entityId` rows with SQLSTATE 23514 (LOW #12). The
three guards are independently tested (Tests 15 and 16 join Tests 3 and 4).

The Plan 05-06 per-concern ALS refactor is also something I'm proud of.
The original design used a single merged `RequestContext` store with an
`activeTx` slot that was mutated in a `finally` block — safe for the
simple case but incorrect under nested or parallel `$transaction` calls
(CR-01) and under keep-alive TCP connections where the store persists
across requests (CR-04). The fix splits concerns into three independent
`AsyncLocalStorage` instances (`actorALS`, `activeTxStackALS`,
`actionOverrideALS`) so each concern has exactly the lifetime it needs.
The iterative process — ship, write regression tests that expose the
failure modes, then refactor — is a pattern I'd repeat on any audit
system.

**"What I'm least proud of".**
The Prisma extension can't see `$queryRaw` mutations. No `$executeRaw`
writes exist today — Phase 4's `FOR UPDATE` is read-only — and Plan 05-08
ships a CI grep (Test 15) that asserts zero off-allowlist `$executeRaw`
calls; a future raw write must be allowlisted at PR time. The gap is now
documented and guarded rather than hidden, but the underlying limitation
(the `$extends` boundary) remains. I picked the smallest blast radius
I could find for a one-week budget.

The original Plan 05-01 design also used `als.enterWith()` in a Fastify
`onRequest` hook. `enterWith` binds a store to the _surrounding_ async
context rather than running a callback inside a new scope — it works for
simple request-response cases but makes the store's lifetime ambiguous
under connection reuse (the store from request N can bleed into request
N+1 on a keep-alive socket if the hook fires before the previous store
drains). The lesson: when wrapping async work in Node.js, prefer
`als.run(store, fn)` with a callback that covers the full scope of the
work. `enterWith` is the right tool only when you genuinely have no
callback boundary — the Fastify 3-arg hook (`(req, reply, done)`) gives
exactly the boundary needed: `actorALS.run(scope, () => done())`.
Reading the Node.js docs more carefully before the initial ship would
have avoided the CR-04 retro.

### v2 candidates

What I'd add with more time, in rough priority order:

- **Retention purge / cold-storage tier** — v1 keeps audit rows forever
  (D-101). A TTL or archival cron would need a separately-grantable
  purge role to bypass the REVOKE without breaking the architectural
  append-only story.
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
- **SECURITY DEFINER purge function for audit retention** — Plan 05-04 shipped a one-shot orphan-purge migration (0009) that disables the AuditEvent BEFORE-trigger inside a tx. That pattern is the precedent for v2: a `purge_audit_events_before(cutoff_date)` SECURITY DEFINER function that suspends the trigger via a transaction-local GUC (`SET LOCAL meditrack.allow_purge = on`), runs the purge, and re-enables. The trigger short-circuits when the GUC is set; admins running the function explicitly opt in. Closes 05-REVIEWS.md MEDIUM #10 — the architectural append-only story stays intact even when retention work lands.
- **"FailedLogins" union view at /admin/audit** — Plan 05-05's WR-07 split failed-logins into two entityTypes (`auth_attempt` for unknown email, `session` for known-user wrong-password). An admin investigating brute-force has to apply two separate filters. v2: a "FailedLogins" tab that unions both entityTypes server-side, OR a `GET /api/audit/failed-logins` endpoint returning the union. 05-REVIEWS.md LOW #14.
- **`Kopiera filterlänk` label rename** — The current Swedish label `Kopiera permalink` overstates what's copied (it's a filter URL, not a deep-link to the expanded event). v2: rename to `Kopiera filterlänk` after revisiting the Swedish-copy lock in `.planning/phases/05-audit-log/05-CONTEXT.md <specifics>`. 05-REVIEWS.md LOW #15.
- **Swedish translation of §6 answers** — This README is in English; the UI copy is locked in Swedish per CONTEXT.md `<specifics>`. §6 phrasings in English can be translated live in the interview if Swedish is preferred. v2: pre-translate the §6 paragraphs so the interview answer reads from the README verbatim. 05-REVIEWS.md LOW #17.
- **Per-vårdenhet admin scope toggle** — Phase 5's admin sees ALL careUnits (cross-tenant per D-16's documented exception). v2: a toggle in the FilterBar that scopes to a specific careUnit, gated by a per-careUnit admin role. Useful when the system scales to 50 vårdenheter (§6 question). Tracked in `.planning/phases/05-audit-log/05-CONTEXT.md <deferred>`.

## Vad ligger var?

| Sökväg              | Innehåll                                                          |
|---------------------|-------------------------------------------------------------------|
| `apps/web`          | React + Vite + Tailwind + shadcn (SPA)                            |
| `apps/api`          | Fastify + Prisma (Node.js + TypeScript)                           |
| `packages/shared`   | Zod-kontrakt och konstanter delade mellan klient och server       |
| `.planning`         | Planeringsartefakter (PROJECT, REQUIREMENTS, ROADMAP, fas-planer) |
| `local`             | Lokala filer (brief-PDF m.m.); committas inte                     |
