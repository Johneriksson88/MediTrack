# Phase 5: Audit Log - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-22
**Phase:** 5-Audit Log
**Areas discussed:** Hook placement & before/after capture, Audit entry granularity, Append-only enforcement, /admin/audit browse UI

---

## Hook placement & before/after capture

### Q1: Where should the audit row be written from?

| Option | Description | Selected |
|--------|-------------|----------|
| Prisma `$extends` middleware | Query-extension intercepts create/update/updateMany/delete/deleteMany; auto-loads `before` via findFirst inside the same tx. Zero changes to existing service files. | ✓ |
| Service-layer wrapper / decorator | Each service imports `withAudit(...)`; explicit and greppable. Cost: must edit every service file. | |
| Fastify `onResponse` hook | Single global hook reads `req.method` + route URL. Cost: capturing `before` is hard for compound mutations. | |

**User's choice:** Prisma `$extends` middleware
**Notes:** Choice aligns with Phase 4 D-83's promise of "retrofit without touching Phase 4 code." Codified as D-90.

### Q2: Same transaction vs async post-success?

| Option | Description | Selected |
|--------|-------------|----------|
| Inside the same transaction | Mutation roll-back → audit row gone; audit failure → mutation rolls back. Zero "happened but not logged" gaps. | ✓ |
| Async post-success | Faster hot path; survives audit-table outage. Risk: crash between commit and audit-INSERT loses the row. | |

**User's choice:** Inside the same transaction
**Notes:** Forensics integrity matters more than write latency on this scale. Codified as D-91.

### Q3: How does the Prisma extension know the actor + careUnit?

| Option | Description | Selected |
|--------|-------------|----------|
| AsyncLocalStorage request context | Fastify onRequest hook seeds the store; Prisma extension reads from it. Zero changes to service signatures. | ✓ |
| Pass actor explicitly via prisma context arg | Each service call passes `{actorUserId, careUnitId}` to `prisma.$transaction`. Explicit but every signature widens. | |
| Skip context — derive from row | Read careUnitId off the mutated row; actor via Postgres `SET LOCAL`. Clever but the actor part is fragile. | |

**User's choice:** AsyncLocalStorage request context
**Notes:** Idiomatic Node 20 pattern. Codified as D-92; seed scripts naturally skip (no store) which is the desired behavior.

### Q4: Which Prisma operations should the extension intercept?

| Option | Description | Selected |
|--------|-------------|----------|
| create / update / updateMany / delete / deleteMany | All mutating model methods. Skips upsert (unused) and createMany (only seed). | ✓ |
| Mutations + $queryRaw / $executeRaw | Catches raw queries too. Cost: entity inference from SQL is brittle. | |
| Mutations only + document $queryRaw exclusion | Same coverage as option 1; explicit README note about $queryRaw exclusion. | |

**User's choice:** create / update / updateMany / delete / deleteMany
**Notes:** Codified as D-93. README documents the `$queryRaw` exclusion + reasoning (FOR UPDATE is a read; the actual writes go through `updateMany`).

---

## Audit entry granularity

### Q1: Order.deliver mutates 1 Order + N CUMs — granularity?

| Option | Description | Selected |
|--------|-------------|----------|
| 1+N sibling rows sharing a requestId | One audit row per Prisma write; all siblings share the request's UUID. | ✓ |
| 1 composite row with a structured details payload | Single audit row with both the Order flip and N stock additions encoded in details JSON. | |
| 1 audit per HTTP request — derive from route | One row per `POST /api/orders/:id/deliver` request. Coarse; stock side-effects become invisible. | |

**User's choice:** 1+N sibling rows sharing a requestId
**Notes:** Falls out naturally from the Prisma extension intercepting per-method. Codified as D-94. Diff-panel UI groups by requestId.

### Q2: Before/after — full snapshots or changed fields only?

| Option | Description | Selected |
|--------|-------------|----------|
| Full before + full after snapshot | Diff computed at READ time; survives schema drift; tiny storage cost vs row overhead. | ✓ |
| Changed fields only | Smaller rows. Cost: requires write-time diff computation; partial snapshots awkward when schema has drifted. | |
| after-only for create, before-only for delete, full pair for update | Compact; small storage win; slightly more branching in the extension. | |

**User's choice:** Full before + full after snapshot
**Notes:** Codified as D-95. Read-time diff is simple, deterministic, and forensics-friendly.

### Q3: Audit login / logout / failed-login?

| Option | Description | Selected |
|--------|-------------|----------|
| Audit auth events too | Session create/delete fall out of the extension for free; failed-login explicitly emitted from auth.service.ts. | ✓ |
| Only medication + order mutations | Honor SC #1 verbatim. Cleaner test surface. | |
| Mutations + login only | Half-measure. | |

**User's choice:** Audit auth events too (login / logout / failed-login)
**Notes:** Codified as D-96. PROJECT.md and AUD-01 say "every mutation (...user-initiated action)" which covers auth. The forensic value of `auth.login_failed` is the single richest signal.

### Q4: Sensitive-field redaction strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Per-model allowlist of auditable columns | Whitelist-by-default. New sensitive columns default to NOT being audited. | ✓ |
| Per-model denylist of sensitive columns | Default-leaky; new sensitive columns silently leak. | |
| Hash sensitive values (sha256) | Forensics correlation without exposing secrets. Overkill for v1. | |

**User's choice:** Per-model allowlist of auditable columns
**Notes:** Codified as D-97. Initial allowlist includes Medication / CUM / Order / OrderLine / User / Session columns; passwordHash and session.id are explicitly excluded.

---

## Append-only enforcement

### Q1: How many enforcement layers?

| Option | Description | Selected |
|--------|-------------|----------|
| Two layers — code absence + DB privilege revocation | SC #3 verbatim (grep absence) + Postgres `REVOKE UPDATE, DELETE, TRUNCATE`. | ✓ |
| Three layers — code absence + REVOKE + BEFORE-UPDATE trigger | Belt-and-braces. Redundant given REVOKE; extra migration + test cost. | |
| One layer — code absence only | Satisfies SC #3 literally. Weaker §6 story. | |

**User's choice:** Two layers — code absence + DB privilege revocation
**Notes:** Codified as D-98. README cites both layers as the §6 forensic-integrity story.

### Q2: How to prevent Prisma's auto-generated audit-mutation methods?

| Option | Description | Selected |
|--------|-------------|----------|
| ESLint `no-restricted-syntax` rule | Bans `prisma.auditEvent.update/delete/...` calls; allows `create`/`find*`/`count`. Runs in CI. | ✓ |
| Typed client wrapper that narrows AuditEventDelegate | Compile-error on forbidden calls — strongest guarantee. Cost: every import switches to the wrapper. | |
| Conventions + README grep only | Doc-only. Nothing actually prevents regressions. | |

**User's choice:** ESLint `no-restricted-syntax` rule
**Notes:** Codified as D-99. ESLint rule IS the grep, executed deterministically on every PR.

### Q3: How should the integration test prove enforcement?

| Option | Description | Selected |
|--------|-------------|----------|
| Two tests — grep absence + raw-SQL UPDATE rejected by Postgres | Both layers exercised. Strongest demo. | ✓ |
| Single test — raw-SQL UPDATE rejected | Misses the SC #3 literal "repository-wide grep." | |
| Single test — grep absence only | Doesn't exercise the DB privilege layer. | |

**User's choice:** Two tests — grep absence + raw-SQL UPDATE rejected by Postgres
**Notes:** Codified as D-100. Tests live in `audit.integration.test.ts`.

### Q4: Retention policy?

| Option | Description | Selected |
|--------|-------------|----------|
| Keep forever — no retention job in v1 | Demo never approaches the row count where this matters. v2 README note. | ✓ |
| Soft TTL flag — `@@index([createdAt])` + v2 retention note | Same as v1 forever; just explicit about the future hook. | |
| Implement retention purge in v1 | Contradicts append-only — purge is a delete, which is exactly what SC #3 forbids. | |

**User's choice:** Keep forever — no retention job in v1
**Notes:** Codified as D-101. The `@@index([createdAt(sort: Desc), id])` is already present for cursor pagination, so a future retention job has the right index.

---

## /admin/audit browse UI

### Q1: Page layout?

| Option | Description | Selected |
|--------|-------------|----------|
| Single table with expandable rows | shadcn `<Table>` md+ / card stack <md; click row to expand inline with diff panel. Phase 4 BestallningarPage pattern. | ✓ |
| Master / detail with side panel | List + `<Sheet>` detail. Mobile awkward. | |
| Card stack with inline diff | Diffs always visible; only ~3 rows above the fold. | |

**User's choice:** Single table with expandable rows
**Notes:** Codified as D-102. Mirrors Phase 4 D-82 responsive table/card switch.

### Q2: Filter UX?

| Option | Description | Selected |
|--------|-------------|----------|
| Three combobox dropdowns + URL-as-state | `Användare`, `Entitetstyp`, `Åtgärd`; URL is the source of truth. | ✓ |
| Free-text search across all three | Ambiguous; no autocomplete. | |
| Combobox + multi-select | Query-string serialization gets noisy. | |

**User's choice:** Three combobox dropdowns + URL-as-state
**Notes:** Codified as D-103. Phase 2 D-39 / D-42 URL-as-state pattern.

### Q3: Diff display?

| Option | Description | Selected |
|--------|-------------|----------|
| Key/old/new triplet table | `Fält | Före | Efter`; omit unchanged keys; Swedish-friendly. | ✓ |
| Side-by-side raw JSON | Powerful for nested objects but developer-y. | |
| Single JSON column with toggle | Comparison requires toggling — worst affordance. | |

**User's choice:** Key/old/new triplet table
**Notes:** Codified as D-104. The requestId group chip surfaces sibling events.

### Q4: Pagination strategy?

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor-based with 'Läs in fler' | `useInfiniteQuery` + cursor `{createdAt, id}`. Stable under concurrent inserts. | ✓ |
| Offset pagination with numbered page nav | Familiar; deep-linkable. Cost: page boundaries flicker under writes. | |
| Time-window default + 'see older' toggle | Demo-friendly but harder to seek. | |

**User's choice:** Cursor-based with `Läs in fler` button
**Notes:** Codified as D-105. `useInfiniteQuery` with base64-encoded `{createdAt, id}` cursor.

---

## Claude's Discretion

Captured at the end of the `<decisions>` section in CONTEXT.md. Highlights:
- Exact migration filenames (recommend `0007_audit_events` + `0008_audit_events_revoke_grants`).
- `ipAddress` column inclusion (recommend yes; `userAgent` recommend skip).
- `entityType` as `String` (not Postgres enum) for future-proofing.
- `action` as a String literal union in shared constants (mirrors `ORDER_STATUSES`).
- ESLint rule placement (root config recommended).
- Swedish copy variants for the page heading + filter labels + chip labels.
- Whether to expose `/api/audit/events/:id` for single-event permalink fetch (recommend yes).
- Whether seeds should write audit rows (recommend skip — seeds bypass the ALS store).

## Deferred Ideas

Captured in CONTEXT.md `<deferred>`:
- Retention purge / TTL (v2)
- Hashed sensitive-value storage (v2)
- JSONB patch diff storage (v2)
- Per-vårdenhet admin view (v2)
- Audit-event export CSV / PDF (out of scope per PROJECT.md)
- Webhook / SIEM forwarding (v2)
- Read-event auditing (v2)
- Tamper-evident hash-chain (v2)
- Free-text omnibox search (v2)
- Multi-select filters (v2)
- Permalink URL encoding expand state (v2)
- `$queryRaw` bypass closure via CI allowlist (v2)
- `auth.login_failed` rate-limit signal banner (v2)
- `ipAddress` column (Claude's discretion; if skipped, v2)
- `/api/audit/events/:id` single-event detail endpoint (Claude's discretion; if skipped, v2)
