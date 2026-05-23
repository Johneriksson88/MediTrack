---
phase: "07"
plan: "07-02"
subsystem: documentation
tags: [readme, arkitekturval, architecture, decision-matrix, phase7]
dependency_graph:
  requires:
    - "07-01: canonical-readme-structure (placeholder anchor)"
  provides:
    - "## Arkitekturval (motivera dina val) section populated"
    - "9-row decision matrix"
    - "3 prose paragraphs on interview-defining choices"
    - "Vad vi medvetet avstått från bullet list"
  affects:
    - README.md
tech_stack:
  added: []
  patterns:
    - Swedish technical prose with English code-fence proper-nouns (Pattern C)
    - Decision-matrix table (Val | Alternativ övervägda | Varför vi valde så | Följdeffekt)
key_files:
  created: []
  modified:
    - README.md
decisions:
  - "D-123: decision-matrix table + prose for three interview-defining choices + Vad vi medvetet avstått från subsection implemented verbatim from locked content in 07-CONTEXT.md"
metrics:
  duration: "8 minutes"
  completed: "2026-05-23"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 07 Plan 02: Arkitekturval Section Summary

README.md `## Arkitekturval (motivera dina val)` section populated per D-123 — the brief §3 "motivera dina val" deliverable. The `<!-- Populated by Slice 2 -->` placeholder replaced with matrix + 3 prose paragraphs + abstentions list.

## What Was Built

### 9-row decision matrix

| Row | Val | Decision source |
|-----|-----|-----------------|
| 1 | Frontend — TS + React | PROJECT.md Key Decisions row 1; brief §3.1 (user-locked) |
| 2 | Backend — Node.js + Fastify + TS | PROJECT.md Key Decisions row 2; Phase 1 D-04 |
| 3 | Database — PostgreSQL 16 | PROJECT.md Constraints; §6 concurrency answer |
| 4 | ORM — Prisma 5 | PROJECT.md Constraints; D-90/D-91/D-93 Phase 5 |
| 5 | Server-state — TanStack Query 5 | Phase 1 D-09; Phase 3 D-69; Phase 6 D-119 |
| 6 | UI-kit — shadcn/ui + Tailwind CSS 4 | Phase 1 D-10; brief §3.2 mobile-first |
| 7 | Tester — Vitest 2 | PROJECT.md Key Decisions row 5; brief §3.1 |
| 8 | Monorepo — pnpm workspaces 9 | Phase 1 D-03 |
| 9 | Container — Docker Compose v2 | PROJECT.md Constraints; brief §3.3 "ett plus" |

### Three prose subsections

**`### Postgres + row-level FOR UPDATE`** (~150 words Swedish)
- Explains relational domain necessity (orders → order_lines → medications → audit; user → unit)
- §6 concurrency answer: CUM-batch `SELECT ... FOR UPDATE` per D-79
- Cites `apps/api/test/orders.deliver.integration.test.ts` and `pg_locks` snapshot test by name
- Acknowledges operational cost trade-off vs SQLite

**`### Prisma $extends typed extensions`** (~150 words Swedish)
- §6 retrofitting-auth answer: audit-logging added in Phase 5 without touching Phase 2/3/4 service files (D-83)
- Mechanism: `$extends({ query: ... })` middleware on 6 audited models (D-90)
- Same pattern handles per-row authz via `where: { careUnitId }` injection
- Honest limitation: does NOT see `$queryRaw` writes; CI grep (Test 3) is the guard
- Cites `apps/api/src/db/auditExtension.ts` and `audit.integration.test.ts` Test 3

**`### Named meditrack_app non-owner role`** (~150 words Swedish)
- Architectural (not runtime) append-only audit guarantee
- Layer (a): `meditrack_app` non-owner role with REVOKE on `AuditEvent` (migration `0010_audit_events_named_app_role`)
- Layer (b): BEFORE-trigger catching OWNER sessions (migration `0008_audit_events_revoke_grants`)
- Asserted by `audit.integration.test.ts` Test 4 (raw SQL UPDATE rejects with `SQLSTATE 42501`) + Test 3
- Three-layer defense: ESLint at commit, CI grep on PR, Postgres at runtime
- §6 "what I'm most proud of" hook

### `### Vad vi medvetet avstått från` — 7 bullets

1. **Kubernetes** — Docker Compose räcker; ompröva vid > 1 region eller > 10 vårdenheter
2. **Meddelandekö (Redis/RabbitMQ)** — Postgres LISTEN/NOTIFY räcker; ompröva vid e-postnotifikationer
3. **Mikrotjänster** — en Fastify-process räcker; ompröva vid oberoende skalning per domän
4. **GraphQL-federation** — Zod-kontrakt + REST ger samma typsäkerhet; ompröva vid > 3 klienter
5. **Real-time push (SSE/WebSocket)** — TanStack Query polling räcker; ompröva vid < 5 s latensbudget
6. **E-postinfrastruktur** — för mycket yta för marginalt signalvärde mot in-app banner; ompröva vid out-of-session-notifikationer
7. **OAuth / SSO** — e-post + lösenord räcker; ompröva vid integration mot landstingets identitetsprovider

## Verification Results

| Check | Status |
|-------|--------|
| `<!-- Populated by Slice 2 -->` placeholder removed | PASS |
| 11 pipe-lines in matrix area (header + separator + 9 rows) | PASS (line-range count = 11) |
| `### Postgres + row-level FOR UPDATE` heading exists | PASS |
| `### Prisma $extends typed extensions` heading exists | PASS |
| `### Named \`meditrack_app\` non-owner role` heading exists | PASS |
| `### Vad vi medvetet avstått från` heading exists | PASS |
| 7 bullets in `### Vad vi medvetet avstått från` | PASS (line-range count = 7) |
| `apps/api/test/orders.deliver.integration.test.ts` cited | PASS |
| `0010_audit_events_named_app_role` cited | PASS |
| `0008_audit_events_revoke_grants` cited | PASS |
| `audit.integration.test.ts` cited | PASS |
| `SQLSTATE 42501` cited | PASS |
| All 9 stack layers in matrix | PASS |

Note: The plan's `awk '/^## Arkitekturval/,/^## /'` pattern fails on Windows git-bash
because the end-pattern `/^## /` also matches the start line (causing immediate end of range).
Same UTF-8 locale awk issue as documented in 07-01-SUMMARY.md. Direct line-range counts
(lines 33-125 for matrix, lines 115-124 for bullets) confirm all content is correct.

## Deviations from Plan

None — plan executed exactly as written. All content sourced verbatim from `07-CONTEXT.md
<specifics>` "Arkitekturval matrix (9 rows — locked content)" and the plan's `<action>` block.
Swedish Pattern C applied throughout.

## Known Stubs

None — this plan's goal is fully achieved. The `## Arkitekturval` section is completely
populated. The remaining placeholder stubs (`<!-- Populated by Slice 4 -->` and
`<!-- Populated by Slice 5 -->`) belong to plans 07-04 and 07-05 and are intentional.

## Threat Flags

None — documentation-only edit (README.md only). No new network endpoints, auth paths,
file access patterns, or schema changes introduced. All cited paths (migrations, test files)
are pre-existing public artifacts.

## Self-Check

- [x] `README.md` modified: confirmed (89 insertions, 1 deletion)
- [x] `## Arkitekturval` section has 9-row matrix: confirmed lines 40-50
- [x] Three `###` prose subsections exist: confirmed lines 52, 69, 90
- [x] `### Vad vi medvetet avstått från` has 7 bullets: confirmed lines 117-123
- [x] Commit `28d34ba` exists: confirmed via git log

## Self-Check: PASSED
