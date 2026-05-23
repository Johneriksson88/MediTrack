---
phase: "07"
plan: "07-05"
subsystem: documentation
tags: [readme, demo-rundtur, sex-svar, elevator-pitch, swedish, phase7]
dependency_graph:
  requires:
    - canonical-readme-structure  # from 07-01
    - sc04-playwright-harness     # from 07-04 (Mobil-forst section referenced in Demo-rundtur)
  provides:
    - demo-rundtur-section
    - sex-svar-section
    - sex-supporting-bullets
  affects:
    - README.md
tech_stack:
  added: []
  patterns:
    - Swedish elevator-pitch prose (2–4 sentences per §6 answer)
    - Thesis — citation format for supporting bullets
    - "[Läs mer: §anchor] deep-link convention"
key_files:
  created: []
  modified:
    - README.md
decisions:
  - "D-124: unified §6-svar top section with 7 sub-headings; per-feature deep-dive §6 subsection converted to compact bullet-level supporting evidence"
  - "D-125: cost and observability answers cite concrete tools (OpenTelemetry, Loki/Splunk, Prometheus) and concrete numbers ($30/mån, $0.0001/call) — not hedged"
metrics:
  duration: "13 minutes"
  completed: "2026-05-23"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 1
---

# Phase 07 Plan 05: Demo-rundtur + §6-svar Summary

README.md's two largest narrative sections plus the audit deep-dive supporting-bullets subsection populated with submission-quality Swedish content. All three Slice 5 placeholders consumed.

## What Was Built

### Task 1: `## Demo-rundtur (5 minuter)` (commit af8f80a)

8 numbered Swedish steps threading every demoable REQ into one ~5-minute path:

1. **Logga in som sjuksköterska** — `sjukskoterska@example.test` / `demo1234` på `/login` (AUTH-02)
2. **Lägg en multi-radsbeställning** — `/bestallningar/ny`, `MedicationPickerSheet`, `QuantityStepper`, `Utkast → Skickad` (ORD-01 + ORD-02 + ORD-03)
3. **Försök redigera skickad beställning** — `HTTP 409 order_locked`, immutable post-submit (ORD-06)
4. **Logga in som apotekare** — `apotekare@example.test`, se beställning i tabben `Skickad`
5. **Bekräfta och leverera** — `DeliverConfirmDialog`, `Skickad → Bekräftad → Levererad`, `OrderActorTrail` (ORD-04 + ORD-05 + STK-01 + STK-02)
6. **Se lagret uppdateras** — `/lakemedel` + `/dashboard` `DashboardLowStockCard` (NTF-01 + NTF-02)
7. **AI-förslag på nytt läkemedel** — `Hämta AI-förslag`, `claude-haiku-4-5`, `tool_use`, konfidensbanden, `Slutgiltig klass` override (AI-01 + AI-02)
8. **Admin + audit-log** — `admin@example.test`, `/admin/audit`, `AuditDiffPanel`, `Kopiera permalink`, requestId-chip (AUD-01 + AUD-02 + AUD-03)

16 distinct REQ-IDs cited; all 3 roles covered; status machine `Utkast → Skickad → Bekräftad → Levererad` visible in-line.

### Task 2: `## §6-svar (intervjudiskussion)` (commit dfef898)

7 Swedish `###` subsections in canonical order; each ≤4 sentences; 6 of 7 end with `[Läs mer]` deep links:

| # | Heading | Target anchor | Sentences |
|---|---------|---------------|-----------|
| 1 | Hur hanterar systemet att två sjuksköterskor beställer samtidigt? | `#hur-audit-hooken-fungerar` | 4 |
| 2 | Hur skulle du skala upp till 50 vårdenheter? | `#vad-granskas` | 4 |
| 3 | Hur skulle du eftermontera autentisering? | `#hur-audit-hooken-fungerar` | 4 |
| 4 | Vad är du mest stolt över? | `#lager-2--db-rollbehörigheter--before-trigger` | 4 |
| 5 | Vad är du minst stolt över? | `#6-supporting-bullets` | 4 |
| 6 | Vad kostar systemet att köra? | (none — self-contained) | 4 |
| 7 | Hur skulle du övervaka det i produktion? | `#hur-audit-hooken-fungerar` | 3 |

Required citations in correct answers:
- Answer 1: `apps/api/test/orders.deliver.integration.test.ts` (Test 8, `pg_locks`-snapshot) + `audit.integration.test.ts` Test 2 + D-79 + D-91
- Answer 2: `careUnitId`, D-105 cursor pagination, D-16 cross-tenant admin exception
- Answer 3: `$extends`, D-83, D-90
- Answer 4: migration `0010`, migration `0008`, Test 4 (`permission denied`), Test 3 (`git grep`)
- Answer 5: `$queryRaw`, `$executeRaw`, Test 15 CI grep
- Answer 6: $30/mån, `claude-haiku-4-5 tool_use`, D-115 (no NPL backfill)
- Answer 7: OpenTelemetry, Loki/Splunk, Prometheus, D-125 honest framing

### Task 3: `#### §6 supporting bullets` (commit d111145)

12 compact Swedish bullets under `#### §6 supporting bullets` inside `### Audit log (Phase 5)`:

1. Samtidighet — `pg_locks`-baserad serialisering (Test 8, D-79)
2. Audit-loggen ljuger inte — rollback-säkerhet (Test 2, D-91)
3. Append-only — kodfrånvaro (Test 3, D-99)
4. Append-only — DB-lager (Test 4, migration 0008 + 0010, `SQLSTATE 42501`)
5. Named role split — REVOKE-skydd (migration 0010, D-98)
6. Per-concern ALS — request-context utan globals (`AsyncLocalStorage`, Plan 05-06)
7. Multi-tenancy — `careUnitId`-first (D-16)
8. Cursor-paginering — O(page-size) (D-105)
9. Eftermontering av authz — `$extends`-mönster (D-83, D-90)
10. CR-02 — entityId backstop (migration 0011, WR-07)
11. `$queryRaw` blind-spot — CI grep guard (Test 15)
12. Login rate-limit — bucket-isolerad (`@fastify/rate-limit`, 4 tests)

## Verification Results

All automated checks pass:

| Check | Status |
|-------|--------|
| Task 1: Demo-rundtur placeholder removed | PASS |
| Task 1: ≥8 numbered steps | PASS (8 steps) |
| Task 1: all 3 demo users present | PASS |
| Task 1: 6 critical UI strings present | PASS |
| Task 1: `Utkast → Skickad` status progression | PASS |
| Task 1: ≥5 distinct REQ-IDs | PASS (16 REQ-IDs) |
| Task 2: §6-svar placeholder removed | PASS |
| Task 2: all 7 subsections present | PASS |
| Task 2: all 7 answers ≤4 sentences | PASS (python3: [4,4,4,4,4,4,3]) |
| Task 2: 6 [Läs mer] links present | PASS |
| Task 2: orders.deliver.integration.test.ts cited | PASS |
| Task 2: migrations 0010 + 0008 cited | PASS |
| Task 2: queryRaw cited | PASS |
| Task 2: claude-haiku-4-5 cited | PASS |
| Task 2: OpenTelemetry cited | PASS |
| Task 3: §6 supporting bullets placeholder removed | PASS |
| Task 3: #### §6 supporting bullets heading exists | PASS |
| Task 3: ≥12 bullets | PASS (12 bullets) |
| Task 3: all 16 required citations present | PASS |

### Anchor link note

The `[Läs mer]` link to `#lager-2--db-rollbehörigheter--before-trigger` (Task 2 answer 4)
follows GitHub GFM auto-anchor rules exactly: the heading `#### Lager 2 — DB-rollbehörigheter
+ BEFORE-trigger` produces double-hyphens where the em dash `—` and surrounding spaces
were stripped. Python's simple regex check flagged this as SIMILAR (not PASS) because the
script normalizes out hyphens — the actual GitHub anchor is correct as written.

No anchor fixes were needed. All `[Läs mer]` targets (`#hur-audit-hooken-fungerar`,
`#vad-granskas`, `#lager-2--db-rollbehörigheter--before-trigger`, `#6-supporting-bullets`)
resolve to `####` headings that exist in the Feature deep dives section.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Populate Demo-rundtur (5 minuter) | af8f80a |
| 2 | Populate §6-svar (intervjudiskussion) | dfef898 |
| 3 | Populate §6 supporting bullets | d111145 |

## Deviations from Plan

None — plan executed exactly as written. Content is drawn verbatim or tightened from
the pre-drafted source material in `07-CONTEXT.md <specifics>` §6-svar elevator pitches.

## Known Stubs

None — all three Slice 5 placeholders consumed. No stub content remains in the sections
populated by this plan.

## Threat Flags

None — documentation-only edit. No new network endpoints, auth paths, file access patterns,
or schema changes. Demo credentials (`sjukskoterska@example.test` etc.) referenced in
Demo-rundtur are already documented in `## Demo-konton` (pre-existing disclosure).
The §6 "minst stolt över" answer (Task 2 answer 5) honestly discloses the `$queryRaw`
blind-spot — this is intentional engineering honesty per D-131, T-07-14 accepted.

## Self-Check

- [x] `README.md` modified: 3 placeholder sections replaced (verified by grep)
- [x] Commit `af8f80a` exists (Task 1 Demo-rundtur)
- [x] Commit `dfef898` exists (Task 2 §6-svar)
- [x] Commit `d111145` exists (Task 3 §6 supporting bullets)
- [x] No file deletions in any task commit

## Self-Check: PASSED
