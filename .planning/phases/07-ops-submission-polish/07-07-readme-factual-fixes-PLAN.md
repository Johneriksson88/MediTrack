---
phase: 07
plan: 07-07
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
autonomous: true
requirements_addressed: [OPS-02, OPS-04]
must_haves:
  truths:
    - "Closes 07-VERIFICATION.md CR-01: README.md Arkitekturval matrix UI-kit cell reads 'Tailwind CSS 3' (not 'Tailwind CSS 4'); aligns with apps/web/package.json:51 (`tailwindcss: ^3.4.7`)"
    - "Closes 07-VERIFICATION.md WR-02: README.md `## Arkitekturval ### Prisma $extends typed extensions` paragraph lists the six audited models as `Medication, CareUnitMedication, Order, OrderLine, User, Session` (not `… Session, AuditEvent`); matches the canonical list in `## Hur audit-hooken fungerar` and `## Vad granskas?`"
    - "Re-running gsd-verifier on Phase 7 flips truth #3 (`README.md is factually accurate in all stack version claims`) from FAILED → VERIFIED"
    - "No other README content edited; Demo-rundtur / §6-svar / Mobil-först / Arkitekturval prose paragraphs / Vad vi medvetet avstått från are untouched"
    - "Atomic commit scope `docs(07-07)` continues the Phase 7 per-slice narrative discipline (mirrors `docs(07-01)` through `docs(07-05)`)"
  artifacts:
    - path: README.md
      provides: "Two one-line factual fixes inside two existing sections (Arkitekturval matrix line 47; `### Prisma $extends typed extensions` paragraph line 79)"
      contains:
        - "Tailwind CSS 3"
        - "`Order`, `OrderLine`, `User`, `Session`"
  key_links:
    - from: README.md ## Arkitekturval matrix row 6 (UI-kit)
      to: apps/web/package.json devDependencies.tailwindcss
      via: factual version claim
      pattern: "Tailwind CSS 3"
    - from: README.md ### Prisma $extends typed extensions paragraph
      to: README.md ## Hur audit-hooken fungerar / ## Vad granskas?
      via: shared audited-models list
      pattern: "Order.*OrderLine.*User.*Session"
---

<objective>
Close two factual errors in `README.md` flagged by 07-VERIFICATION.md and 07-REVIEW.md — both one-line edits to existing sections of the file. No content is added or removed beyond the literal strings below; no other section of the README is touched.

**Gap source:** 07-VERIFICATION.md gaps array (CR-01) + Anti-Patterns Found rows for CR-01 and WR-02.

**The two fixes:**

1. **CR-01 (BLOCKER)** — `README.md:47` Arkitekturval matrix row 6 (UI-kit) currently reads `shadcn/ui + Tailwind CSS 4`. `apps/web/package.json:51` installs `"tailwindcss": "^3.4.7"` (Tailwind v3). Change `Tailwind CSS 4` to `Tailwind CSS 3`. This is the single BLOCKER preventing the phase status from flipping `gaps_found → passed` at re-verification.

2. **WR-02 (WARNING)** — `README.md:79` lists the six audited models as `Medication, CareUnitMedication, Order, OrderLine, Session, AuditEvent`. The canonical Phase 5 list (used verbatim in `## Hur audit-hooken fungerar` and `## Vad granskas?`) is `Medication, CareUnitMedication, Order, OrderLine, User, Session`. Auditing the audit table itself would be circular and is not what the code does. Replace `AuditEvent` with `User` on the line-79 list so the section-79 summary matches the deep-dive elsewhere.

**Wave assignment:** Wave 1, `depends_on: []`. Independent of plans 07-08 (different file) and 07-09 (different file). Plans 07-07, 07-08, 07-09 can be scheduled in parallel.

**Commit scope:** `docs(07-07)` — doc-only changes; the per-slice scope continues the Phase 7 narrative pattern.

Output: 1 file modified (`README.md`), 2 single-line edits, zero other touches.
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-ops-submission-polish/07-VERIFICATION.md
@.planning/phases/07-ops-submission-polish/07-REVIEW.md
@.planning/phases/07-ops-submission-polish/07-CONTEXT.md
@.planning/phases/07-ops-submission-polish/07-PATTERNS.md
@README.md
@apps/web/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix CR-01 — README Arkitekturval UI-kit cell (Tailwind CSS 4 → 3)</name>
  <files>README.md</files>
  <read_first>
    - README.md lines 40–50 (the 9-row Arkitekturval matrix; the UI-kit row is line 47; surrounding rows are NOT to be touched)
    - apps/web/package.json lines 39–56 (devDependencies block — confirms `"tailwindcss": "^3.4.7"` on line 51; this is the source-of-truth the README must align to)
    - 07-VERIFICATION.md gaps[0] (CR-01 specification: status FAILED, the exact swap, the cited line numbers)
    - 07-REVIEW.md `## Critical Issues ### CR-01` (fix snippet — the literal before/after strings)
  </read_first>
  <action>
    Single Edit operation on `README.md` line 47.

    Locate the matrix row that currently begins:

    `| **UI-kit** — shadcn/ui + Tailwind CSS 4 | MUI, Chakra, Mantine, Ant Design | shadcn ger kopierade komponenter i koden (ingen runtime-dep), Tailwind ger mobil-först responsivitet i klassnamn; matchar brief-§3.2 "responsivt UI" utan en custom-CSS-budget | Phase 1 UI-SPEC (slate + new-york), touch-targets ≥44 px; Combobox + Sheet + Dialog + Tabs återanvänds över alla 6 sidor |`

    Change the leading cell text from:

    `**UI-kit** — shadcn/ui + Tailwind CSS 4`

    to:

    `**UI-kit** — shadcn/ui + Tailwind CSS 3`

    The rest of the row (alternatives column, rationale column, follow-on column) is unchanged. Adjacent matrix rows (Frontend, Backend, Database, ORM, Server-state, Tester, Monorepo, Container) are NOT touched. The three prose paragraphs that follow the matrix (`### Postgres + row-level FOR UPDATE`, `### Prisma $extends typed extensions`, `### Named meditrack_app non-owner role`) are NOT touched.

    Do NOT touch `apps/web/package.json` — Tailwind v3 is the correct installed version; the README was the wrong artifact.

    Do NOT add a `## Kända luckor` bullet about this — CR-01 is being fixed, not documented as a known gap.

    Do NOT add a "what changed" inline comment in the README. The git commit message is the audit trail.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. Exactly one match for "Tailwind CSS 3" in the README (the matrix cell):
      test "$(grep -F 'Tailwind CSS 3' README.md | wc -l)" -eq 1
      # 2. Zero matches for "Tailwind CSS 4" (the old wrong string is gone):
      test "$(grep -F 'Tailwind CSS 4' README.md | wc -l)" -eq 0
      # 3. The UI-kit row is still on a single line and still contains the rest of the row:
      grep -F '**UI-kit** — shadcn/ui + Tailwind CSS 3' README.md
      grep -F 'shadcn ger kopierade komponenter i koden' README.md
      # 4. apps/web/package.json is unchanged (Tailwind v3 stays the truth):
      node -e "const j=require('./apps/web/package.json'); if (!j.devDependencies.tailwindcss || !j.devDependencies.tailwindcss.includes('3.')) {console.error('apps/web tailwindcss devDep changed:', j.devDependencies.tailwindcss); process.exit(1)}"
    </automated>
  </verify>
  <done>
    `README.md` line 47 reads `**UI-kit** — shadcn/ui + Tailwind CSS 3`. Zero remaining occurrences of `Tailwind CSS 4` in the file. `apps/web/package.json` `tailwindcss` devDep version unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix WR-02 — README audited-models list (Session, AuditEvent → User, Session)</name>
  <files>README.md</files>
  <read_first>
    - README.md lines 72–85 (the `### Prisma $extends typed extensions` paragraph; the wrong list is on line 79 and continues "Service-koden är omedveten om / att mellanhanden finns.")
    - README.md `## Hur audit-hooken fungerar` (~line 534-536 area — the canonical list `Medication, CareUnitMedication, Order, OrderLine, User, Session`; read this section to confirm the target list)
    - README.md `## Vad granskas?` (~line 617 area — the same canonical list as a table)
    - 07-VERIFICATION.md Anti-Patterns Found row for WR-02 (`README.md` line 79 — `AuditEvent` listed as one of six audited models — should be `User`)
    - 07-REVIEW.md `## Warnings ### WR-02` (fix snippet — literal before/after strings)
  </read_first>
  <action>
    Single Edit operation on `README.md` line 79.

    Locate the line that currently reads (the trailing portion of the parenthetical list):

    `` `Order`, `OrderLine`, `Session`, `AuditEvent`). Service-koden är omedveten om ``

    Change `` `Session`, `AuditEvent` `` to `` `User`, `Session` ``. The full corrected line reads:

    `` `Order`, `OrderLine`, `User`, `Session`). Service-koden är omedveten om ``

    (Preserve the surrounding markdown verbatim — the closing `)`, the period, the trailing prose, the line break, the line 80 continuation `att mellanhanden finns.`)

    The prior portion of the parenthetical (line 78: `` för de sex granskade modellerna (D-90: `Medication`, `CareUnitMedication`, ``) is unchanged. The result is the full audited-models list reading:

    `Medication, CareUnitMedication, Order, OrderLine, User, Session`

    — which is the SAME list that already appears verbatim in `## Hur audit-hooken fungerar` and `## Vad granskas?`. The internal inconsistency is resolved.

    Do NOT touch the deep-dive sections (`## Hur audit-hooken fungerar`, `## Vad granskas?`) — they are already correct. Do NOT touch any other occurrence of `AuditEvent` in README.md (other occurrences in lines 99, 312, 367, 448, 457, 471, 484, 488, 506, 526, 692, 707, 709 refer to the audit TABLE / trigger / role / migration — all correct and not part of the audited-models list).

    Do NOT bundle this with the CR-01 edit in a single commit — keep two distinct atomic commits per Pattern B (commit-narrative discipline). Both touch `README.md` but they can be staged separately via `git add -p` and committed one at a time:
    - Commit 1: CR-01 (Task 1 change only).
    - Commit 2: WR-02 (Task 2 change only).

    Alternative acceptable pattern (planner discretion at execute-time): one combined commit `docs(07-07): fix README factual errors (CR-01 Tailwind v3; WR-02 audited models list)` is also acceptable if the executor prefers a single tight commit per slice — both edits are tightly coupled by being README-factual-corrections from the same review. The commit message MUST cite both gap IDs verbatim. Default recommendation: one combined commit for cleaner `git log --oneline` storytelling.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. The corrected list appears on line 79 (or thereabouts — anchor by the surrounding prose):
      grep -F '`Order`, `OrderLine`, `User`, `Session`' README.md
      # 2. The wrong sub-list `Session`, `AuditEvent` is no longer present anywhere in the file:
      test "$(grep -F '`Session`, `AuditEvent`' README.md | wc -l)" -eq 0
      # 3. The wider parenthetical still starts with "för de sex granskade modellerna" and still names the first four models:
      grep -F 'för de sex granskade modellerna (D-90: `Medication`, `CareUnitMedication`' README.md
      # 4. The canonical lists in the deep-dive sections are unchanged (they were already correct):
      grep -F 'Hur audit-hooken fungerar' README.md
      grep -F 'Vad granskas?' README.md
      # 5. Other `AuditEvent` references (the TABLE / TRIGGER / role contexts) are preserved — there are still multiple `AuditEvent` mentions in the README, just not in the audited-models list:
      test "$(grep -c 'AuditEvent' README.md)" -ge 5
    </automated>
  </verify>
  <done>
    `README.md` line 79 reads `` `Order`, `OrderLine`, `User`, `Session`). Service-koden är omedveten om ``. The substring `` `Session`, `AuditEvent` `` no longer appears anywhere in the file. The canonical audited-models list in `## Hur audit-hooken fungerar` and `## Vad granskas?` is unchanged. Other (correct) `AuditEvent` references in the README — naming the table, the trigger, the role, the migration — are preserved.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| README.md → reviewer | Doc-only edits; no code execution, no runtime input, no auth, no DB access. The reviewer reads the README; nothing the README says is parsed or executed. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-09 | Information Disclosure | README factual claims | mitigate | Both edits remove factually wrong claims (Tailwind v4, AuditEvent in audited-models) and replace with the verified-correct strings (Tailwind v3 from package.json; User from the canonical Phase 5 list). The change reduces reviewer-side confusion. |
| T-07-10 | All other ASVS L1 categories | N/A | out-of-scope | Doc-only edit; no runtime impact; no attack surface; no dependencies added; no inputs accepted. |
</threat_model>

<verification>
- `grep -F "Tailwind CSS 3" README.md` returns one line; `grep -F "Tailwind CSS 4" README.md` returns zero lines.
- `grep -F '`Order`, `OrderLine`, `User`, `Session`' README.md` returns one line; `grep -F '`Session`, `AuditEvent`' README.md` returns zero lines.
- README sections OUTSIDE lines 47 and 79 are byte-identical to pre-change state (the diff is two single-line modifications and nothing else).
- `apps/web/package.json` `tailwindcss` devDep version is unchanged.
- On re-running gsd-verifier against Phase 7, truth #3 (`README.md is factually accurate in all stack version claims`) flips from FAILED → VERIFIED, and the CR-01 + WR-02 entries in Anti-Patterns Found are cleared.
</verification>

<success_criteria>
- 1 file modified: `README.md` — exactly two single-line edits.
- All grep assertions in `<verify>` blocks pass.
- Commit message follows Pattern B: scoped `docs(07-07)`; cites CR-01 and WR-02 verbatim by gap ID so the verifier can grep-trace gap → plan → commit.
- After this plan + 07-08 + 07-09 land, re-running gsd-verifier on Phase 7 reports CR-01 + WR-01 + WR-02 + WR-03 as resolved; status flips from `gaps_found` → `passed` (modulo the 3 residual `human_verification` items handled out-of-band by the user's live-stack walk).
</success_criteria>

<output>
Create `.planning/phases/07-ops-submission-polish/07-07-SUMMARY.md` when done, listing:
- The exact README diff (before/after for both lines).
- The commit SHA(s) — one or two commits per the planner's discretion in Task 2's action note.
- Confirmation that `grep` assertions in `<verify>` pass.
- Note any deviation from the recommended single-vs-double-commit choice.
</output>
