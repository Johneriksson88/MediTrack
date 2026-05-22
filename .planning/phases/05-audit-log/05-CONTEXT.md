# Phase 5: Audit Log - Context

**Gathered:** 2026-05-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Every successful mutation in the system — medication CRUD, order status transitions, order-line edits, stock decrements/increments, session creates and deletes — appends a row to an immutable `audit_events` table. An admin browses the log at `/admin/audit` in reverse-chronological order, filterable by user, entity type, and action. The table is append-only by *architecture*, not by runtime check: no code path issues UPDATE, DELETE, UPDATE_MANY, DELETE_MANY, UPSERT, or TRUNCATE against `audit_events`. A defense-in-depth layer at the DB role revokes those grants, so even a regression cannot bypass the contract.

**In scope (Phase 5 only — REQ-IDs AUD-01, AUD-02, AUD-03):**

- Prisma migration adding `AuditEvent` model + `audit_events` table. Columns at minimum: `id (cuid)`, `actorUserId (String?)` (nullable for failed-login where the user hasn't authenticated yet), `careUnitId (String?)` (denormalized from row scope, nullable for `Session`/`User` auth events that aren't naturally vårdenhet-scoped), `entityType (String)`, `entityId (String)`, `action (String)`, `before (Json?)`, `after (Json?)`, `requestId (String?)`, `createdAt (DateTime, default(now()))`. Indexes: `@@index([createdAt(sort: Desc), id])` (cursor pagination key), `@@index([actorUserId, createdAt(sort: Desc)])` (user filter), `@@index([entityType, createdAt(sort: Desc)])` (entity-type filter), `@@index([action, createdAt(sort: Desc)])` (action filter), `@@index([requestId])` (sibling-event grouping per D-94).
- A `BEFORE UPDATE OR DELETE` migration step that **also** runs `REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM CURRENT_USER` (whichever DB role the app uses — `DATABASE_URL` derives this; document the role in README). Privilege revocation is the second enforcement layer (D-98). Migration runs idempotently — `REVOKE … IF EXISTS` semantics via a `DO $$ … EXCEPTION` block; safe to re-run.
- Prisma `$extends` query middleware in `apps/api/src/db/auditExtension.ts` that intercepts `create`, `update`, `updateMany`, `delete`, `deleteMany` on the audited model list (Medication, CareUnitMedication, Order, OrderLine, User, Session). Per-model allowlists declare which columns are persisted into `before`/`after` (D-97); the extension drops everything outside the allowlist. For `update`/`delete`/`updateMany`/`deleteMany`: the extension loads the matching `before` row(s) inside the same `prisma.$transaction` immediately before the mutation, then writes 1+N sibling audit rows (one per affected row) inside the same tx (D-91, D-94).
- `AsyncLocalStorage` request-context store in `apps/api/src/plugins/requestContext.ts` (registered as a Fastify `onRequest` hook). Store payload: `{ actorUserId, careUnitId, requestId, requestSource: 'http' | 'seed' | 'test' }`. The Prisma extension reads from this store; when the store is empty (seed-script writes, test setup), the middleware skips audit-row creation entirely (D-92). `requestId` is a UUID v4 generated per request and surfaced on the `X-Request-Id` response header for log correlation.
- `audit:read` permission key wired through `packages/shared/src/contracts/permissions.ts` (`ACTION_KEYS`) and `apps/api/src/auth/permissions.ts` (`PERMISSIONS`, restricted to `['admin']`). The Phase 1 D-15 `Record<ActionKey, Role[]>` drift-prevention will demand an entry the moment the key lands in shared.
- `GET /api/audit/events` route (`apps/api/src/routes/audit/list.ts`) — admin-only via `requirePermission('audit:read')`. Query params: `actorUserId? (cuid)`, `entityType?` (enum: `medication | care_unit_medication | order | order_line | session | user`), `action?` (string — open enum: `create | update | delete | order.submit | order.confirm | order.deliver | order.softDelete | stock.increment | auth.login | auth.logout | auth.login_failed`), `cursor? (string, encoded {createdAt, id})`, `limit (int, default 50, max 100)`. Response: `{ events: AuditEventResponse[], nextCursor: string | null }`. Sort: `createdAt DESC, id DESC` deterministic tiebreak. Admin reads ALL careUnits (not scoped to their own vårdenhet) — this is the only endpoint where the careUnit scope guard is intentionally absent.
- `GET /api/audit/filters` route — admin-only — returns the distinct users (for the actor combobox: `{id, name, email}[]`), entity types, and actions available in the table to populate the three filter dropdowns. Cached at the BE for 60s (the set is small and rarely changes).
- `/admin/audit` page replaces the existing `AuditPage.tsx` stub (currently shows `<EmptyStateCard icon={ShieldCheck} heading="Admin" />`). Already gated by `<RoleRoute roles={['admin']}/>` from Phase 1 D-12. New components in `apps/web/src/routes/admin/`: `AuditPage.tsx` (page-level orchestration + `useAuditEventsQuery` + URL-as-state), `AuditFilterBar.tsx` (three combobox dropdowns + clear-all + URL sync), `AuditTable.tsx` (md+ table with expand-on-click), `AuditCardList.tsx` (<md card stack with expand-on-click), `AuditDiffPanel.tsx` (key/old/new triplet table — the diff rendering for the expanded row), `useAuditEventsQuery.ts` (TanStack `useInfiniteQuery` against the cursor-paginated endpoint).
- ESLint rule `no-restricted-syntax` ban on `prisma.auditEvent.update*`, `delete*`, `deleteMany`, `updateMany`, `upsert` — `create`, `findMany`, `findUnique`, `findFirst`, `count`, `aggregate` are allowed. Rule runs in `pnpm lint` and CI; README documents the rule + grep pattern.
- Integration tests in `apps/api/test/audit.integration.test.ts`:
  1. **End-to-end coverage test** — full `create draft → submit → confirm → deliver` pipeline; assert that the matching audit rows exist for every step, with correct actor/before/after and shared requestId per request (1+N sibling shape per deliver, D-94).
  2. **Append-only grep test** — `git grep -nE 'prisma\.auditEvent\.(update|delete|deleteMany|updateMany|upsert)\b'` produces zero matches in `apps/api/src`, `apps/web/src`, `packages/shared/src`. (Allows `prisma.auditEvent.create`, `findMany`, `findUnique`, etc.)
  3. **Append-only DB-layer test** — `prisma.$executeRawUnsafe("UPDATE audit_events SET action='hacked' WHERE id=$1", id)` is rejected by Postgres (privilege revocation fires); assert the thrown error includes a `permission denied` signal.
  4. **Sensitive-field redaction test** — log in as `apotekare@example.test`; assert the resulting `auth.login` audit row's `after` JSON does NOT contain `passwordHash` (User) or the raw session id (Session); only the allowlisted columns are present.
  5. **Admin-only access test** — `GET /api/audit/events` as `sjukskoterska` returns 403; as `apotekare` returns 403; as `admin` returns 200 with rows.
- Seed-script audit suppression: `apps/api/prisma/seed.ts` runs OUTSIDE the request context (no ALS store), so the Prisma extension naturally skips audit rows during seed (D-92). Document this in the seed file header.

**Out of scope (other phases / v2):**

- Audit-event editing or correction — append-only is the contract; mistakes are corrected by a follow-up event, not a row mutation (deferred forever).
- Retention purge or archival job — keep forever for v1; v2 README note for cold-storage tier or TTL (D-101).
- Per-vårdenhet admin view — admin sees ALL vårdenheter (cross-tenant by design); a multi-tenant admin would be v2 work.
- Diff-storage as JSONB patch (RFC 6902) — Phase 5 stores full before/after; diff is computed at read time (D-95). Smaller storage shape is a v2 optimization.
- Sensitive-value hashing — passwordHash and session.id are simply dropped via allowlist (D-97); hashing them into the audit row is v2.
- Free-text omnibox search across events — out of v1 (combobox triple satisfies AUD-02 verbatim).
- Audit-event export (CSV / PDF) — explicit out-of-scope per PROJECT.md (CSV/PDF export is a deferred v2 idea).
- Webhook / SIEM forwarding of audit events — v2 idea, deferred.
- Read-event auditing (who viewed what) — only mutations are audited; SELECT events are not (would explode the row volume; not in REQUIREMENTS.md).
- Tamper-evident chain (hash-chained rows for cryptographic append-only proof) — v2 idea worth a README mention; v1 leans on the REVOKE grant for tamper resistance.
- `/admin` landing or nav restructuring — the existing nav already routes admins to `/admin/audit`; no new nav decisions in Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Hook Placement & Before/After Capture

- **D-90:** **Prisma `$extends` middleware is the audit hook.** A query-level extension wraps `PrismaClient` and intercepts mutating model methods (create/update/updateMany/delete/deleteMany). For UPDATE/DELETE the extension loads the `before` row(s) inside the same transaction, runs the original operation, then writes the audit row(s) — all inside the same `prisma.$transaction`. The alternative service-layer wrapper (each `*.service.ts` file imports `withAudit(fn, …)`) was rejected because it requires editing every existing service file, violating Phase 4 D-83's promise of "retrofit without touching Phase 4 code." Fastify `onResponse` was rejected because it can't get a clean `before` snapshot for compound mutations (deliver touches Order + N CUMs from a single route) — the extension's per-model-method interception gives free 1+N coverage. Adding a new audited entity in a future phase is a one-line edit to the `AUDITED_MODELS` table; everything else just works.

- **D-91:** **Audit row INSERT runs inside the same DB transaction as the mutation it describes.** Mutation rolls back → audit row vanishes; audit INSERT fails → mutation rolls back. Zero "happened in prod but not in the log" gaps. The slight write-amplification (one extra `INSERT INTO audit_events` per intercepted mutation) is negligible vs the forensic value. The extension's interception of `create/update/updateMany/delete/deleteMany` already runs inside whatever transaction the caller started — if the caller is bare (e.g. `prisma.medication.create(...)` outside a tx), Prisma auto-wraps it in an implicit tx, and the audit INSERT lands in that same implicit tx. For `updateMany`/`deleteMany`, the extension loads all matching rows by primary key inside the tx, runs the mutation, then emits N audit rows (one per affected primary key).

- **D-92:** **`AsyncLocalStorage` carries actor + careUnit + requestId from Fastify to Prisma.** A Fastify `onRequest` hook (registered before the routes) calls `als.run({ actorUserId: req.user?.id ?? null, careUnitId: req.user?.careUnitId ?? null, requestId: req.id, requestSource: 'http' }, () => done())`. The Prisma extension reads from `als.getStore()` on every intercepted mutation; if the store is empty (seed script, test fixtures, migration runner, future cron job that hasn't opted in), the extension SKIPS audit-row creation entirely. This is deliberate — seed scripts MUST not pollute the audit log with "the universe was created" rows. Tests that *want* to verify audit behavior wrap their setup in `als.run({ actorUserId: TEST_USER.id, ... }, () => { ... })`. Explicit-arg passing was rejected (every service signature would widen with the actor arg, plus every call site updates); deriving actor from the row was rejected (the actor and the row's owner aren't always the same — apotekare confirming a sjuksköterska's order is exactly this case).

- **D-93:** **Operations intercepted: `create`, `update`, `updateMany`, `delete`, `deleteMany`.** Skips: `upsert` (we don't use it anywhere in the codebase — grep verifies), `createMany` (only the seed script uses it, and seeds suppress audit per D-92), `findMany`/`findUnique`/`findFirst`/`count`/`aggregate` (reads — not mutations, not audited per scope). `$queryRaw` and `$executeRaw` are NOT intercepted (extension can't see them); they are used in two places — Phase 4's `$queryRaw … FOR UPDATE` for the Order-row lock (read-only lock acquisition, not a mutation — the actual UPDATE goes through `updateMany` which IS audited), and the deliver path's bulk stock-`UPDATE` which routes through Prisma's `update` per-CUM call (D-79). README documents the `$queryRaw` exclusion + the reasoning ("locks are reads; the writes that matter all route through Prisma model methods").

### Granularity & Diff Shape

- **D-94:** **One audit row per entity mutation, siblings share a `requestId`.** Order.deliver flips one Order row + N CareUnitMedication rows → 1+N audit rows. The Order row gets `action='order.deliver'` (the route's name, not the underlying Prisma method) with `before/after` capturing the status flip + actor + timestamps. Each CUM row gets `action='stock.increment'` with `before/after` capturing the `currentStock` change. All 1+N rows share the request's UUID `requestId` (D-92), so the admin UI can group "this happened as part of one HTTP request" by `requestId`. The extension defaults the `action` to the Prisma method name (`create`/`update`/etc.); the deliver path is the one case that needs to set a richer action — it writes the Order audit row from the service layer (after the status flip + before the CUM updates), passing an explicit `action: 'order.deliver'` override via the ALS store. The 1+N shape is trivially-truthful ("one event per Prisma write"), greps cleanly, and gives the admin UI a natural expand-and-group affordance.

- **D-95:** **`before` and `after` store full row snapshots (filtered through the per-model allowlist).** Diff is computed at READ time inside `AuditDiffPanel.tsx` — given two JSON objects, render only the keys whose values differ. Cheap (the JSONs are small — every audited row is ≤ ~30 keys after the allowlist), deterministic, and survives schema drift (Phase 6 adds a `therapeuticClass` field to Medication → old audit rows naturally show only the keys that were present at write time). Storage cost is irrelevant vs the row overhead Postgres already imposes. The compute-at-read decision means the BE write path stays simple (the extension serializes `before` and `after` directly), and "changed-fields-only at write" plus its schema-drift problems is avoided.

- **D-96:** **Auth events (`Session.create` → `auth.login`, `Session.delete` → `auth.logout`) are audited.** Failed logins (where no Session is created) get a dedicated `auth.login_failed` audit row written explicitly from `apps/api/src/services/auth.service.ts` (`actorUserId: null`, `entityType: 'session'`, `entityId: <bogus or omitted>`, `action: 'auth.login_failed'`, `before: null`, `after: { email: <email-only-no-password> }`). This breaks the "Prisma extension does everything" purity but only at one site — and the explicit write lives BESIDE the existing `verifyCredentials` failure path, naturally. The session create/delete cases fall out of the extension for free. `auth.login_failed` is the single richest forensics signal in the audit log; not capturing it would be a weak demo.

- **D-97:** **Per-model allowlist of auditable columns** declared in `apps/api/src/db/auditAllowlist.ts` (or co-located inside `auditExtension.ts`). Initial mapping:
  - `Medication`: id, nplId, name, atcCode, form, strength, source, createdAt
  - `CareUnitMedication`: id, careUnitId, medicationId, currentStock, lowStockThreshold, deletedAt, createdAt, updatedAt
  - `Order`: id, careUnitId, createdByUserId, status, submittedAt, submittedByUserId, confirmedAt, confirmedByUserId, deliveredAt, deliveredByUserId, deletedAt, createdAt, updatedAt
  - `OrderLine`: id, orderId, careUnitMedicationId, quantity, createdAt, updatedAt
  - `User`: id, email, name, role, careUnitId, createdAt, updatedAt **— `passwordHash` is excluded; would never land in `before`/`after`.**
  - `Session`: userId, careUnitId, createdAt, expiresAt, lastSeenAt **— `id` (the session token) is excluded.**
  
  Whitelist-by-default is the defensive posture for a forensics tool: adding a new sensitive column (Phase 6's free-text therapeutic class? Unlikely sensitive — but a future MFA secret? Definitely) defaults to NOT being audited until someone adds it to the allowlist. The blacklist alternative was rejected because "default-leaky" is the wrong posture for an append-only forensics table. Hashed-value storage was rejected as v2 nice-to-have (overkill for one interview week).

### Append-only Enforcement

- **D-98:** **Two-layer enforcement: code absence + DB privilege revocation.** Layer 1 (architectural, satisfies SC #3 verbatim): no `prisma.auditEvent.update/delete/updateMany/deleteMany/upsert` call exists in the codebase; README documents the grep pattern + the negative result. Layer 2 (defense-in-depth at the DB role): a follow-up migration (`0008_audit_events_revoke_grants.sql` or named to sort after the create-table migration) runs `REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM CURRENT_USER;` — the role embedded in `DATABASE_URL`. Postgres physically rejects any UPDATE/DELETE attempt even if a future code change tries one. Three-layer (adding a BEFORE-UPDATE trigger) was rejected as redundant given the REVOKE — the trigger costs an extra migration + test surface for the same guarantee. One-layer (code-only) was rejected as a weaker §6 interview story ("we trust ourselves" is a worse answer than "Postgres rejects the write at the role layer").

- **D-99:** **ESLint `no-restricted-syntax` rule blocks audit-mutation calls** in `apps/api/.eslintrc.cjs` (or wherever the workspace ESLint config lives). Rule pattern:
  ```
  selector: "MemberExpression[object.property.name='auditEvent'][property.name=/^(update|updateMany|delete|deleteMany|upsert)$/]"
  message: "audit_events is append-only — see Phase 5 D-98. Use prisma.auditEvent.create only."
  ```
  Plus an analogous rule banning destructured access (`const { update } = prisma.auditEvent`). Allowed methods: `create`, `findMany`, `findUnique`, `findFirst`, `count`, `aggregate`. Runs in `pnpm lint` + CI. Pairs with the README-grep claim: the ESLint rule IS the grep, executed deterministically on every PR.

- **D-100:** **Two integration tests prove enforcement together.** Test A (grep): `git grep -nE 'prisma\.auditEvent\.(update|delete|deleteMany|updateMany|upsert)\b' apps packages` produces zero matches; spawned in a vitest test that does the check via `execFileSync` so CI fails on regressions. Test B (DB layer): in `audit.integration.test.ts`, with the live test Postgres, `await expect(prisma.$executeRawUnsafe("UPDATE audit_events SET action='hacked' WHERE id=$1", anyId)).rejects.toThrow(/permission denied/)`. Both demonstrate the layered story; the §6 interview answer cites both ("we asserted absence in the code AND rejected it at the DB role").

- **D-101:** **Retention: keep forever for v1.** No purge job, no TTL, no archival cron. The audit table grows unbounded; demo never approaches a row count where this matters (~hundreds of rows total in seed + demo path). README's "what I'd do with more time" calls out the v2 path: "TTL or cold-storage tier at N months — would need a separately-grantable role for the purge job to bypass the REVOKE, so the architectural append-only story stays intact." The `@@index([createdAt(sort: Desc), id])` is present from day 1, so any future retention job has the right index.

### `/admin/audit` Browse UI

- **D-102:** **Single shadcn `<Table>` on md+ / card stack on <md, with expand-on-click rows.** `AuditTable.tsx`'s columns: `Tid` (relative + tooltip with ISO timestamp), `Användare` (actor.name + role pill), `Entitet` (entityType chip + entityId truncated 8 chars), `Åtgärd` (action chip), `Diff` (brief summary — e.g. `status: skickad → bekraftad`, `currentStock: 3 → 8`). Click anywhere in the row → toggle expand, revealing the `AuditDiffPanel` below. Mobile (<md): `AuditCardList.tsx` renders each event as a card; tap-to-expand reveals the same diff panel inline. Phase 4's BestallningarPage `OrdersTable`/`OrdersCardList` pair is the precedent; same responsive switch (Tailwind `hidden md:block` / `md:hidden`). Master/detail with side-panel was rejected because a single-page table with inline expand is friendlier for the demo's "scroll → click → see full diff" path. Card-stack-without-table-on-desktop was rejected because a long table is denser and easier to scan.

- **D-103:** **Three combobox dropdowns above the table, URL-as-state.** `AuditFilterBar.tsx` renders three shadcn `<Combobox>` controls left-to-right: `Användare` (the actor combobox, populated from `GET /api/audit/filters`'s users list, showing `name (email)`), `Entitetstyp` (entity-type combobox, populated from the same endpoint), `Åtgärd` (action combobox, same). A clear-all button to the right resets all three. Selecting any combobox value updates the URL (`/admin/audit?actor=usr_xxx&entity=order&action=order.deliver`) via `useSearchParams`; the URL is the source of truth, the query reads from it (`useAuditEventsQuery(params)`). Mobile (<md): the filter bar collapses into a horizontally-scrollable strip below the heading (Phase 4 D-82 status-tab precedent). Free-text omnibox was rejected as ambiguous; multi-select per axis was rejected as over-engineered for v1.

- **D-104:** **`AuditDiffPanel.tsx` renders a key/old/new triplet table.** On row expand, the panel reads `before` and `after` from the event, computes the set of differing keys (omitting unchanged keys), and renders a small `<Table>`: `Fält | Före | Efter`. CREATE rows (no `before`): show only `Efter` column with every allowlisted key. DELETE rows (no `after`): show only `Före`. UPDATE rows: show only the changed keys. For sibling events sharing a `requestId`, the panel header surfaces a chip `"Del av begäran <requestId.slice(-8)> · X händelser"` linking to the filter URL that selects all events with that requestId (a forensic deep-link). Side-by-side raw JSON was rejected as too developer-y; toggle-between-before-and-after was rejected as the worst affordance for review work.

- **D-105:** **Cursor pagination, `useInfiniteQuery` + "Läs in fler" button.** The list endpoint returns `{ events, nextCursor }` where `nextCursor` is a base64-encoded `{createdAt, id}` pair (the (timestamp, id) of the last event in the current page). `useAuditEventsQuery` is `useInfiniteQuery` with `getNextPageParam: lastPage => lastPage.nextCursor`. UI shows the events flat-mapped from all loaded pages; a `<Button>` "Läs in fler" at the bottom fetches the next 50 when `hasNextPage`. First-page latency budget: <100 ms on the demo dataset. Sort: `createdAt DESC, id DESC` (id is the deterministic tiebreaker for events written in the same millisecond, which happens for sibling events of one deliver). Offset pagination was rejected for the §6 scaling answer (offset shifts under concurrent inserts; cursor is stable). Time-window default was rejected as harder to deep-link.

### Claude's Discretion

- Exact migration filenames (recommend `0007_audit_events` for the table + `0008_audit_events_revoke_grants` to sort after, or a single combined migration — Claude's call; either is acceptable as long as the REVOKE runs after CREATE TABLE).
- Schema column list — the proposed set above (id, actorUserId, careUnitId, entityType, entityId, action, before, after, requestId, createdAt) is the recommended floor. Adding `ipAddress`/`userAgent` is reasonable polish but not required by AUD-01 — Claude's call based on plan-budget. Recommend: include `ipAddress` (cheap, useful for §6 anti-abuse discussion), skip `userAgent` (low signal for an internal tool).
- Whether `entityType` is a Postgres enum (closed set: medication, care_unit_medication, order, order_line, user, session) or a plain `String`. Recommend `String` with a TypeScript `AuditEntityType` union — Phase 6 might add new entity types (e.g. therapeutic class taxonomy) and a String avoids a migration per addition.
- `action` as String — open set, listed in `packages/shared/src/constants/auditAction.ts`. Single-source-of-truth pattern, mirrors `ORDER_STATUSES` (Phase 3 D-46).
- ESLint rule placement (root config vs per-package) — recommend root `eslintrc.cjs` so the rule applies everywhere; the few legitimate `prisma.auditEvent.findMany` reads in `apps/api/src/services/audit.service.ts` and the test files don't match the banned patterns.
- Whether `AuditPage.tsx` keeps the current `EmptyStateCard` stub-pattern for the "no events" empty state (Swedish: `Inga händelser ännu — händelser visas här när någon ändrar något.`). Recommend yes; consistent with Phase 1's EmptyStateCard reuse pattern.
- Whether to expose a "Permalink" affordance (copy-to-clipboard URL for a single event including the row-expand state). Recommend yes (one-line addition to the expanded panel; useful for forensics workflows); not required by AUD-02.
- Swedish copy for the page heading + filter labels (recommend: heading `Granskningslogg`, filter labels `Användare` / `Entitetstyp` / `Åtgärd`, expand-row a11y label `Visa detaljer`, empty state `Inga händelser matchade filtren.`). Lock in the entry-row Diff column compact format too (e.g. `status: skickad → bekraftad` reads cleaner than `Order.status: 'skickad' → 'bekraftad'`).
- Whether to bake one of each audit event type into the seed via deliberate "demo-state synthesis" — Recommend skipping: the existing Phase 4 seed runs through the deliver path on `docker compose up`, which naturally writes the 1+N audit rows. The audit page is populated by the seed flow itself, not by a separate audit-seed step. (Seeds run inside `als.run({ actorUserId: <seed-user>.id, requestSource: 'seed' }, …)` to make this work — OR seeds bypass the ALS entirely and the deliver path is replayed via `app.inject` post-seed. Pick whichever fits the seed-script architecture; both work.)
- Whether the `requestId` index is `@@index([requestId])` or `@@index([requestId, createdAt])` — recommend the former (small, group-by use case).
- Whether to expose `/api/audit/events/:id` for a single-event detail fetch (used by deep-link permalinks). Recommend yes; one extra route, trivial.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project framing & scope

- `.planning/PROJECT.md` — Locked stack + Key Decisions table. The row **"Audit log = append-only `audit_events` table via BE middleware | Cheap to build, hard to bypass, demos well; admin role can view"** is binding — this phase implements that decision verbatim. Also: TS+React+Vite+TanStack Query+Tailwind+shadcn, Node+TS+Fastify, Postgres+Prisma, Vitest, Docker Compose.
- `.planning/REQUIREMENTS.md` §"Audit Log" — REQ-IDs AUD-01, AUD-02, AUD-03 with full acceptance language. **The reviewable acceptance criteria for this phase.**
- `.planning/ROADMAP.md` §"Phase 5: Audit Log" — Goal, the 4 success criteria, mode (mvp), Requirements list. SC #4 "centralized hook (BE middleware or service-layer wrapper)" is satisfied by D-90.

### Phase 1 decisions inherited (carry forward, do not re-decide)

- `.planning/phases/01-foundation-auth/01-CONTEXT.md` D-01..D-19 — **all locked**. Especially:
  - **D-08:** Zod schemas in `packages/shared/src/contracts/*.ts` are the FE↔BE contract. New file `audit.ts` mirrors the pattern; new schema `auditEventResponse` for the list endpoint.
  - **D-12:** `<RoleRoute roles={['admin']}/>` already wraps `/admin/audit` — Phase 5 just replaces the stub component.
  - **D-15:** `PERMISSIONS: Record<ActionKey, Role[]>` map. Phase 5 appends `'audit:read'` restricted to `['admin']`.
  - **D-16:** Service-layer Prisma access with `careUnitId` first. Phase 5's `audit.service.ts` is the deliberate exception — admin reads cross-tenant, so the signature is `listAuditEvents(filters, cursor, limit)` with no `careUnitId` first arg. Document this exception explicitly.
  - **D-17:** `useAuth()` + `<Can action="audit:read">` on the FE. The admin nav surfacing of /admin/audit already exists; the in-page actions (e.g. the diff-panel permalink copy button) gate via `<Can>` too if needed.
  - **D-19:** Canonical error envelope `{ error: { code, message, details? } }`. Phase 5 reuses `unauthenticated`, `forbidden`, `validation_failed` from the existing catalog; introduces NO new error codes.
- `.planning/phases/01-foundation-auth/01-UI-SPEC.md` — Design system (shadcn `new-york` + slate), spacing scale, touch targets (≥44 px), bottom-tab-bar dimensions. Admin page lives inside the existing app shell; row-expand affordance is ≥44 px tappable.

### Phase 2 decisions inherited (carry forward, do not re-decide)

- `.planning/phases/02-medication-catalog/02-CONTEXT.md` D-20..D-45 — **all locked**. Especially:
  - **D-27 / D-28 / D-33:** Medication + CareUnitMedication soft-delete pattern. The audit allowlist (D-97) includes `deletedAt` so soft-delete transitions are visible in the audit diff.
  - **D-39 / D-42:** URL-as-state for filters. `/admin/audit` filter bar follows this pattern verbatim — three combobox values mirror to query params.

### Phase 3 decisions inherited (carry forward, do not re-decide)

- `.planning/phases/03-draft-orders/03-CONTEXT.md` D-46..D-73 — **all locked**. Especially:
  - **D-46:** `OrderStatus` enum. Audit `before`/`after` JSON encodes status as a plain string matching the enum value.
  - **D-49 / D-54:** Atomic UPDATE-with-precondition + actor/timestamp stamping. The audit hook intercepts the underlying `updateMany` call, captures the stamped fields in `after`.
  - **D-65:** File-per-endpoint pattern. Phase 5's `/api/audit/events` lives at `apps/api/src/routes/audit/list.ts`; `/api/audit/filters` at `apps/api/src/routes/audit/filters.ts`; `apps/api/src/routes/audit/index.ts` is the registrar (mirrors orders/ and medications/).
  - **D-69:** TanStack Query key conventions. `['audit', 'events', filters]` for the infinite query; `['audit', 'filters']` for the filter combobox source.

### Phase 4 decisions inherited (carry forward, do not re-decide)

- `.planning/phases/04-confirm-deliver-stock/04-CONTEXT.md` D-74..D-89 — **all locked**. Especially:
  - **D-79:** Deliver's batch CUM `UPDATE` per CUM-id-sorted lock order. The audit hook intercepts each Prisma `update` and writes one `stock.increment` event per CUM. Sibling shape (D-94) groups them by requestId.
  - **D-83:** "Phase 5 retrofits middleware that records every mutation in this phase without touching Phase 4 code" — D-90 satisfies this verbatim by using `$extends` instead of service-layer wrappers.
  - **D-84:** Actor columns on Order. Audit hook captures these in `after` for `order.confirm` and `order.deliver` events automatically (they're in the allowlist).

### Existing code patterns (Phase 1+2+3+4 lay the foundation Phase 5 builds on)

- `apps/api/prisma/schema.prisma` — Models: CareUnit, User, Session, Medication, CareUnitMedication, Order, OrderLine. Phase 5 ADDS `AuditEvent` model.
- `apps/api/src/db/client.ts` — Existing `PrismaClient` singleton. Phase 5 wraps with `$extends` from `auditExtension.ts`; consumer code imports the extended client unchanged.
- `apps/api/src/plugins/{cookies.ts, errorHandler.ts, requestUser.ts}` — Existing plugin pattern. Phase 5 ADDS `requestContext.ts` (ALS-wrapping onRequest hook).
- `apps/api/src/auth/permissions.ts` — `PERMISSIONS` map. Phase 5 appends `'audit:read': ['admin']`.
- `apps/api/src/services/{auth.service.ts, medication.service.ts, order.service.ts, user.service.ts}` — Existing services; Phase 5 ADDS `audit.service.ts` (read-only — list events, list filters). Phase 5 EXTENDS `auth.service.ts` with the explicit `auth.login_failed` write (D-96).
- `apps/api/src/routes/{auth.ts, me.ts, healthz.ts, adminPing.ts, medications/, orders/}` — Phase 5 ADDS `routes/audit/{list.ts, filters.ts, index.ts}` and registers the new registrar in `apps/api/src/app.ts`.
- `apps/api/test/orders.integration.test.ts` + `orders.deliver.integration.test.ts` + `helpers/buildTestApp.ts` — Existing test patterns. Phase 5 ADDS `audit.integration.test.ts` reusing the helpers; the end-to-end test (D-100 test #1) imports `progressOrderToBekraftad` from Phase 4.
- `apps/web/src/routes/admin/AuditPage.tsx` — Current stub (`<EmptyStateCard icon={ShieldCheck} heading="Admin" />`). Phase 5 REPLACES with the real page + feature-folder structure.
- `apps/web/src/components/{ui/, EmptyStateCard.tsx, RoleBadge.tsx, OrderStatusPill.tsx}` — Existing primitives reused. Phase 5 needs shadcn `<Combobox>` (or `<Select>` if combobox isn't installed yet — `pnpm dlx shadcn add combobox`), `<Table>`, `<Badge>` (chips), and probably `<Tooltip>` for the relative-time → ISO-timestamp hover. Verify presence; add via shadcn CLI if missing.
- `packages/shared/src/contracts/{login.ts, me.ts, medication.ts, order.ts, permissions.ts}` — Existing contracts. Phase 5 ADDS `packages/shared/src/contracts/audit.ts` (`auditEventResponse`, `auditEventListResponse`, `auditEventListQuery`, `auditFiltersResponse`).
- `packages/shared/src/constants/{orderStatus.ts}` — Existing const + label pattern. Phase 5 ADDS `auditAction.ts` (action string union + Swedish label map for the action chip).
- `.eslintrc.cjs` (or wherever the workspace ESLint config lives) — Phase 5 EXTENDS with the `no-restricted-syntax` rule (D-99).

### Brief (interview source-of-truth — local only, not in repo CI)

- `local/intervju-testcase-1-1-.pdf` §2.2 (audit log listed as an optional feature — "loggning av åtgärder med tidsstämpel/användare"); §5 (evaluation weights — code quality + data model + system design ★★★★★/★★★★/★★★★ all reward this kind of architectural commitment); §6 (the §6 questions Phase 5 helps answer: "retrofitting auth" — Phase 5 retrofits audit without touching prior phases, demonstrating the same pattern; "what I'm proud of" — the layered append-only enforcement is a strong story).

### Tooling / harness

- `CLAUDE.md` — Tooling rules, GSD workflow expectations, stack constraints.
- `.planning/STATE.md` — Current phase progress (Phase 4 complete; Phase 5 ready to plan).
- `.planning/config.json` — Workflow toggles (sequential, plan-check on, verifier on, per-phase research disabled).

No external ADRs or SPEC.md exist for Phase 5 — implementation decisions captured above (D-90..D-105) are the canonical record.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Phase 1+2+3+4 shipped a working monorepo with auth, RBAC, medication catalog, draft orders, confirm/deliver/stock, and a tested audit-friendly transaction pattern. Phase 5 retrofits an audit layer at the Prisma boundary; it does NOT edit any existing service file's logic, only the Prisma client they import.

- **`prisma` singleton (`apps/api/src/db/client.ts`)** — Wrap with `$extends`. The default export becomes the audit-extended client; every existing import of `prisma` automatically uses the wrapped client. Zero changes to the ~25 call sites.
- **`requireSession.ts` + `req.user`** — The Fastify preHandler already decorates `req.user` with `{ id, careUnitId, role }`. Phase 5's `requestContext.ts` onRequest hook reads from `req.user` (after `requireSession` has run on protected routes) and pushes into the ALS store. For unprotected routes (login, healthz), the ALS store has `actorUserId: null` — the `auth.login_failed` audit event handles its actor-less case explicitly (D-96).
- **`<RoleRoute roles={['admin']}/>`** — Already routes admins to `/admin/audit` (Phase 1 D-12). Phase 5 just replaces the stub `AuditPage.tsx`.
- **`AuditPage.tsx` stub** — `EmptyStateCard` lives in the page; Phase 5's empty-filter-result state can reuse it.
- **shadcn `<Tabs>` (Phase 4) and `<AlertDialog>` (Phase 3)** — Not directly used by Phase 5, but the Phase 4 BestallningarPage table/card responsive switch is the precedent the AuditPage layout follows.
- **`OrderStatusPill.tsx` + `RoleBadge.tsx`** — Patterns for chip-style status/role rendering. Phase 5's action chips and entity-type chips follow the same `<Badge variant=…>` pattern.
- **`useInfiniteQuery` (TanStack Query)** — Already installed (TanStack is in Phase 1's stack). First use is Phase 5 — pattern is straightforward.
- **`helpers/buildTestApp.ts`** — Existing test bootstrap. Phase 5's `audit.integration.test.ts` imports `buildTestApp`, `loginAs`, `ensureAllRolesSeeded`, `progressOrderToBekraftad` unchanged.

### Established Patterns (Phase 1+2+3+4 → Phase 5 inheritance)

- **Service-layer with `careUnitId` first arg** (D-16). Phase 5 deliberately breaks this for the audit-read path (admin is cross-tenant); the exception is documented in audit.service.ts and CONTEXT.md (this section).
- **Atomic UPDATE-with-precondition** (D-54). Phase 5 does NOT mutate audited entities; it observes mutations and writes audit rows in the same tx (D-91).
- **404-not-403 on cross-careUnit** (D-73). N/A for audit read (admin sees all); audit-mutation endpoints don't exist (D-98).
- **Zod schemas in shared, inferred TS types** (D-08). `audit.ts` schemas; types auto-flow to BE+FE.
- **Canonical error envelope** (D-19). Phase 5 reuses existing codes (`unauthenticated`, `forbidden`, `validation_failed`). No new error codes.
- **Permission-map drift-prevention** (D-15). `'audit:read'` addition is a 2-file change (shared `ACTION_KEYS` + BE `PERMISSIONS`); TS exhaustiveness enforces both lands.
- **URL-as-state for filters** (D-39, D-42, D-82). `/admin/audit?actor=...&entity=...&action=...` follows the established pattern.
- **Full-Response on mutation** (D-57). N/A for Phase 5 read endpoints; the list endpoint returns `{ events, nextCursor }` shape (cursor-paginated).
- **Mobile-first responsive switch** (D-10, D-82). AuditTable (md+) / AuditCardList (<md) follows Phase 4 BestallningarPage's pattern verbatim.

### Integration Points

- **`/me` response** — Widens automatically: `permissions: ActionKey[]` includes `'audit:read'` for admin. Existing `useAuth().can(...)` works unchanged.
- **Bottom tab bar / sidebar nav** — `/admin/audit` is already in the nav for admin role (Phase 1 D-12 / D-14). No nav changes.
- **`prisma migrate dev`** — Phase 5 ships migrations: `0007_audit_events` (create table + indexes) and `0008_audit_events_revoke_grants` (REVOKE statements). Additive; existing data unaffected.
- **Prisma client wrap** — `apps/api/src/db/client.ts` exports the extended client. All existing services keep their `import { prisma } from '../db/client.js'`; they're now using the audit-extended client transparently.
- **Fastify plugin chain** — `app.ts` registers `requestContextPlugin` AFTER `cookies` and `errorHandler` but BEFORE the routes (specifically, BEFORE `requireSession` runs so the ALS store is set up; the onRequest hook fires, then `requireSession` populates req.user, then the ALS store is updated in the same onRequest chain — or use a two-step approach: onRequest seeds requestId, then a preHandler-level hook adds the actor after auth).
- **Seed script** — `apps/api/prisma/seed.ts` runs outside the ALS store; the extension naturally skips audit rows during seed. Document at the top of `seed.ts`. Tests that want audit behavior wrap setup in `als.run({...}, () => { ... })`.
- **Docker Compose** — No service changes; api still runs migrations + seed on start. After Phase 5, the first `docker compose up` shows seeded mutations producing visible audit rows when the demo path is exercised.

</code_context>

<specifics>
## Specific Ideas

- **Swedish UI vocabulary (locked for Phase 5):**
  - Page heading: `Granskningslogg`
  - Empty state heading (no events yet): `Inga händelser ännu`
  - Empty state body (no events yet): `Händelser visas här när någon ändrar något i systemet.`
  - Empty state body (filtered, no matches): `Inga händelser matchade filtren.`
  - Filter labels (left-to-right): `Användare`, `Entitetstyp`, `Åtgärd`
  - Clear-all button: `Rensa filter`
  - Pagination button: `Läs in fler`
  - Loading-more state: `Läser in fler händelser...`
  - End-of-list state: `Inga fler händelser att visa.`
  - Diff-panel column headers: `Fält | Före | Efter`
  - Requestid-group chip: `Del av begäran <last8> · X händelser`
  - Permalink button: `Kopiera permalink`
  - Permalink-copied toast: `Permalink kopierad.`
  - Entity-type chip labels: `läkemedel` (medication), `lagersaldo` (care_unit_medication), `beställning` (order), `beställningsrad` (order_line), `användare` (user), `session` (session)
  - Action chip labels: `Skapad` (create), `Uppdaterad` (update), `Borttagen` (delete), `Skickad` (order.submit), `Bekräftad` (order.confirm), `Levererad` (order.deliver), `Borttagen (utkast)` (order.softDelete), `Lager ökat` (stock.increment), `Inloggad` (auth.login), `Utloggad` (auth.logout), `Inloggning misslyckades` (auth.login_failed)
- **Demo path on first `docker compose up` (Phase 5):**
  1. Reviewer runs `docker compose up`; seed populates the DB (no audit rows yet — seeds suppress audit).
  2. Reviewer logs in as `apotekare@example.test` (writes one `auth.login` audit row).
  3. Reviewer navigates `/bestallningar?status=skickad`, clicks the seeded Skickad order → Mode C, clicks `Bekräfta beställning` → page flips to Mode D (writes one `order.confirm` audit row, plus the underlying Order `update` is the same single event since D-94 keeps event-per-write).
  4. Reviewer clicks `Markera som levererad`, confirms → writes one `order.deliver` audit row + N `stock.increment` siblings sharing one requestId.
  5. Reviewer logs out (writes one `auth.logout` audit row), then logs in as `admin@example.test`.
  6. Reviewer navigates `/admin/audit`; the page shows the 4+N events from steps 2-5 in reverse chrono. Reviewer expands the `order.deliver` row → diff panel shows `status: bekraftad → levererad` + the requestId group chip surfacing the N sibling stock events.
  7. Reviewer applies a filter `Entitetstyp = lagersaldo` → only the N stock events remain visible; URL is `/admin/audit?entity=care_unit_medication`.
  8. 30-60 seconds total covers AUD-01 (every mutation logged with actor/timestamp/before/after), AUD-02 (admin browses, filters combine), and gives the §6 audience a visual proof of D-98's enforcement story (which is asserted by the test suite, not the UI).
- **§6 prep notes (Phase 5 strengthens these answers):**
  - **"Two nurses ordering simultaneously" (concurrency)** → Phase 4 already proves the lock contract. Phase 5 adds the forensic angle: the loser's failed attempt does NOT write an audit row (the mutation rolled back, so the audit row rolled back with it per D-91). The README can cite this as evidence of "the audit log doesn't lie."
  - **"Scale to 50 vårdenheter"** → Phase 5's audit_events table is unscoped (admin sees all). The denormalized `careUnitId` column (D-97 allowlist includes it for entity rows) enables a future per-vårdenhet admin view in v2. README cites: "v2: filter by careUnit; the column is already there."
  - **"Retrofitting auth"** → Phase 5 itself is the exemplar of "retrofit without touching prior phases." Phase 4 D-83 explicitly predicted this. README cites: "Phase 5 was added without editing any Phase 2/3/4 service code — Prisma extensions + ALS context did the work."
  - **"What I'm proud of"** → README candidate: "Append-only is enforced by Postgres GRANTs, not by the application. Even if a future contributor writes `prisma.auditEvent.delete(...)`, ESLint blocks the commit; if the ESLint disables get committed, Postgres rejects the query at the role layer. Two layers, asserted by tests."
  - **"What I'm least proud of"** → README candidate: "The Prisma extension can't see `$queryRaw` mutations. None exist today (Phase 4 D-79 only uses raw queries for the FOR UPDATE lock, which is a read), but a future raw-write would silently bypass the audit. v2: add a CI grep that bans `$executeRaw` outside an allowlist."
- **`docker compose up` golden command remains intact.** Phase 5 migrations are additive; seed runs unchanged; only the api container picks up the new ALS plugin + Prisma extension. First boot time impact: <50 ms additional cost.
- **The audit page is the closest the project gets to a "system admin" surface.** Keep visual weight modest — this is a forensics tool, not a dashboard. shadcn `new-york` slate styling matches Phase 1+2+3+4 verbatim.

</specifics>

<deferred>
## Deferred Ideas

- **Retention purge / TTL** — D-101 keeps audit rows forever in v1. v2 README note for cold-storage tier or N-month TTL; would need a separately-grantable purge role to bypass the REVOKE without breaking the architectural append-only story.
- **Hashed sensitive-value storage** — D-97 drops passwordHash + session.id entirely. v2: hash them (sha256) into the audit row so forensics can correlate without exposing the secret.
- **JSONB patch (RFC 6902) diff storage** — D-95 stores full before/after; v2 could store a compact patch to save space when the audit grows large.
- **Per-vårdenhet admin view** — Phase 5's admin sees all careUnits (cross-tenant). v2: a "scope to this vårdenhet" toggle in the filter bar, gated by a per-careUnit admin role.
- **Audit-event export (CSV / PDF)** — Explicit out-of-scope per PROJECT.md (the v1 CSV/PDF exclusion). v2 surface.
- **Webhook / SIEM forwarding** — v2 idea; would emit each audit row to an external sink (Splunk, Datadog, etc.).
- **Read-event auditing** — Phase 5 only audits mutations. v2 idea: log who viewed which order / medication. Would require careful sampling to avoid row-volume explosion.
- **Tamper-evident hash-chain** — Each audit row carries a hash of the previous row's content; tampering with row N invalidates the chain from N onward. v2 cryptographic-append-only idea. README mention candidate.
- **Free-text omnibox search** — D-103 ships three combobox dropdowns. v2: a search box over actor/entity/action/diff-content with autocomplete.
- **Multi-select filters** — D-103 single-select per axis. v2: multi-select per filter.
- **Permalink deep-link to expanded event** — Mostly captured (D-104's permalink-copy button); v2 idea is the URL also encodes the expand state so navigating directly re-opens the expanded row.
- **`$queryRaw` bypass closure** — A CI grep that bans `$executeRaw` outside an allowlist (Phase 4 D-79's `FOR UPDATE` would be allowlisted; future raw-writes would force a discussion). README v2 candidate.
- **`/api/audit/events/:id` single-event detail endpoint** — Claude's discretion noted as recommended; if not shipped in plan, it's a deferred polish.
- **`ipAddress` column** — Claude's discretion noted as recommended; if skipped, v2 candidate.
- **`auth.login_failed` rate-limit signal surfacing** — The audit log captures every failed-login. v2: a banner on the admin page if N failed-logins from one email in M minutes. Brute-force detection.

</deferred>

---

*Phase: 5-Audit Log*
*Context gathered: 2026-05-22*
