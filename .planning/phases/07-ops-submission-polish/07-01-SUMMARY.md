---
phase: "07"
plan: "07-01"
subsystem: documentation
tags: [readme, swedish, restructure, phase7]
dependency_graph:
  requires: []
  provides:
    - canonical-readme-structure
    - swedish-deep-dives
    - placeholder-anchors-for-slices-2-4-5
  affects:
    - README.md
tech_stack:
  added: []
  patterns:
    - GitHub-flavored markdown TOC
    - canonical section ordering per D-121
    - Swedish technical prose with English code-fence proper-nouns
key_files:
  created: []
  modified:
    - README.md
decisions:
  - "D-121: canonical top-level section ordering established — TOC → Vad är det här? → Arkitekturval → Snabbstart → Demo-konton → Demo-rundtur → Lokal utveckling → Tester → Mobil-först → Kända luckor → Med mer tid → §6-svar → Vad ligger var? then --- then ## Feature deep dives"
  - "D-122: all-Swedish README with English technical proper-nouns in code-fences"
  - "D-130: stale ## Status section deleted; inline v2 lists lifted to consolidated ## Med mer tid with 5 buckets"
  - "D-131: ## Kända luckor populated with 5 specific honest bullets"
metrics:
  duration: "17 minutes"
  completed: "2026-05-23"
  tasks_completed: 1
  tasks_total: 1
  files_modified: 1
---

# Phase 07 Plan 01: README Restructure Summary

README.md wholesale restructured from 851-line mixed-English/Swedish build-narrative into the brief-aligned canonical Swedish layout (D-121/D-122/D-130/D-131), with Phase 5+6 deep dives translated and moved below a `---` separator.

## What Was Built

### Canonical sections landed (in order)

All 12 canonical top-level `## ` headings are present in this exact order:

1. `## Vad är det här?` — existing content preserved
2. `## Arkitekturval (motivera dina val)` — placeholder `<!-- Populated by Slice 2 -->`
3. `## Snabbstart med Docker Compose` — existing content preserved
4. `## Demo-konton` — existing content preserved
5. `## Demo-rundtur (5 minuter)` — placeholder `<!-- Populated by Slice 5 -->`
6. `## Lokal utveckling utan Docker` — existing content preserved
7. `## Tester` — existing content preserved + updated with `pnpm verify` mention
8. `## Mobil-först verifiering` — placeholder `<!-- Populated by Slice 4 -->`
9. `## Kända luckor` — 5 specific honest bullets (D-131)
10. `## Med mer tid` — 5 themed buckets (D-130)
11. `## §6-svar (intervjudiskussion)` — placeholder `<!-- Populated by Slice 5 -->`
12. `## Vad ligger var?` — existing content preserved + updated reference
13. `---` separator (immediately adjacent, no blank line)
14. `## Feature deep dives` — container for Phase 5+6 deep dives

### Placeholder anchors for downstream slices

| Placeholder | Section | Populated by |
|-------------|---------|--------------|
| `<!-- Populated by Slice 2 -->` | `## Arkitekturval (motivera dina val)` | Plan 07-02 |
| `<!-- Populated by Slice 4 -->` | `## Mobil-först verifiering` | Plan 07-04 |
| `<!-- Populated by Slice 5 -->` | `## Demo-rundtur (5 minuter)` + `## §6-svar (intervjudiskussion)` | Plan 07-05 |

### Swedish translation applied

Phase 5 audit deep dive (~460 lines) and Phase 6 AI/banner/error/env deep dives (~280 lines) translated to idiomatic technical Swedish per D-122 conventions:

- Swedish prose throughout
- UI strings verbatim in code-fences: `Hämta AI-förslag`, `Slutgiltig klass`, `Använd förslag`, `Hög säkerhet / Medel säkerhet / Låg säkerhet`, `Utkast / Skickad / Bekräftad / Levererad`
- Technical proper-nouns in code-fences: `AsyncLocalStorage`, `$extends`, `tool_use`, `claude-haiku-4-5`, `pg_locks`, `SQLSTATE 42501`, `meditrack_app`, `pg_trgm`, `FOR UPDATE`, `$queryRaw`, `$executeRaw`, `RBAC`, `JSON`, `HTTP 409`, `HTTP 503`, `HTTP 504`
- File paths in code-fences: `apps/api/src/services/audit.service.ts` etc.
- Variable/function names NOT translated: `requirePermission`, `useAuth`, `withActionOverride`, `careUnitId`
- Error codes NOT translated: `ai_unavailable`, `ai_timeout`, `order_locked`, `rate_limited`
- Migration names NOT translated: `0008_audit_events_revoke_grants`, `0010_audit_events_named_app_role`
- Test names NOT translated: `integration test #2`, `Test 15`, `audit.integration.test.ts`
- Roles in prose: lowercase Swedish (apotekare, sjuksköterska, admin); in code-fences: raw form (`role: 'sjukskoterska'`)

### Deep dives restructured

Each former top-level `##` from Phase 5+6 deep dives became `###` inside `## Feature deep dives`. Former `###` subsections became `####`. The subsection tree:

```
## Feature deep dives
### Audit log (Phase 5)
  #### Lager 1 — kodfrånvaro (arkitekturellt)
  #### Lager 2 — DB-rollbehörigheter + BEFORE-trigger
  #### Databasroller
  #### Hur audit-hooken fungerar
  #### Varför $extends över $use?
  #### Vad granskas?
  #### Försvar-på-djupet-skydd (Plan 05-08)
  #### Känd lucka — audit-gap
  #### §6 supporting bullets [stub — Slice 5]
  #### Lärdomar
  #### Inloggnings-rate-limit
### AI Categorization (Phase 6)
  #### Hur förslaget fungerar
  #### Tillförlitlighetsband-semantik
  #### Varför en sluten enum, inte fritext
  #### Reservstrategi när API-nyckeln saknas
  #### Latensbudget
### Dashboard low-stock banner (Phase 6)
  #### Uppdateringsstrategi
  #### Varför en dedikerad endpoint
### Felkodsenvelope (Phase 6)
### Miljövariabler (Phase 6 additions)
```

### Inline v2 lists removed

- Phase 5 `### v2 candidates` (~25 bullets) removed from Audit deep dive
- `## Phase 6 v2 candidates` (~7 bullets) section removed
- Items lifted to consolidated `## Med mer tid` with 5 themed buckets
- Each deep dive section got a `> Framtida idéer...` link back to `## Med mer tid`

### Stale content deleted

- `## Status` section ("Phase 1 — Foundation & Auth — är klar...") deleted per D-130
- `### §6 interview-ready phrasings` heading replaced by `#### §6 supporting bullets` stub

## Verification Results

All automated checks from the plan pass:

| Check | Status |
|-------|--------|
| 12 canonical `## ` headings exist | PASS |
| `## Status` section deleted | PASS |
| Phase 1 body text deleted | PASS |
| 5 themed buckets in `## Med mer tid` | PASS |
| Language note `README är på svenska` exists | PASS |
| `---` separator immediately before `## Feature deep dives` | PASS |
| `## Phase 6 v2 candidates` removed | PASS |
| `### §6 interview-ready phrasings` removed | PASS |
| `### §6 supporting bullets` exists | PASS |
| `<!-- Populated by Slice 2 -->` exists | PASS |
| `<!-- Populated by Slice 4 -->` exists | PASS |
| `<!-- Populated by Slice 5 -->` exists | PASS |
| 5 bullets in `## Kända luckor` | PASS (confirmed via line-range grep) |

Note: The plan's `awk '/^## Kända luckor$/,.../'` command fails on Windows git-bash due to
UTF-8 locale handling in awk's regex engine. Direct line-range verification confirms 5 bullets
exist at lines 162–166. This is a test-environment issue, not a content issue.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

The following placeholder sections are intentional and tracked:

| Section | File | Populated by |
|---------|------|--------------|
| `## Arkitekturval (motivera dina val)` body | README.md line ~35 | Plan 07-02 |
| `## Demo-rundtur (5 minuter)` body | README.md line ~95 | Plan 07-05 |
| `## Mobil-först verifiering` body | README.md line ~158 | Plan 07-04 |
| `## §6-svar (intervjudiskussion)` body | README.md line ~205 | Plan 07-05 |
| `#### §6 supporting bullets` body | README.md (in Feature deep dives) | Plan 07-05 |

These stubs are intentional per the plan — Slice 1 pays the restructure cost and establishes
anchors; Slices 2, 4, 5 fill the bodies. The stubs do NOT prevent this plan's goal (canonical
structure + Swedish translation) from being achieved.

## Threat Flags

None — documentation-only edit. No new network endpoints, auth paths, file access patterns,
or schema changes. The demo password `demo1234` is mentioned in `## Kända luckor` and
`## Demo-konton` but was already documented in the previous README.

## Self-Check

- [x] `README.md` exists and is modified: confirmed 827 lines
- [x] Commit `7d36a0b` exists: `git log --oneline` shows it
- [x] No file deletions in commit: confirmed

## Self-Check: PASSED
