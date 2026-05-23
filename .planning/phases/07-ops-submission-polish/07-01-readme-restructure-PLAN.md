---
phase: 07
plan: 07-01
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
autonomous: true
requirements_addressed: [OPS-02, OPS-04]
must_haves:
  truths:
    - "Implements D-121 (canonical top-level section ordering + `## Feature deep dives` container), D-122 (all-Swedish translation of Phase 5+6 deep dives), D-130 (delete stale `## Status` + consolidate `## Med mer tid`), D-131 (`## Kända luckor` honest and specific)"
    - "A reviewer opens README.md and finds reviewer-facing brief sections in the top 200 lines"
    - "README.md is in Swedish throughout (with English technical proper-nouns + UI strings preserved verbatim in code-fences)"
    - "Stale `## Status` section is gone"
    - "`## Kända luckor` exists with 5 specific honest bullets"
    - "`## Med mer tid` exists with 5 themed buckets consolidating Phase 5 + Phase 6 + PROJECT.md v2 items"
    - "Phase 5+6 deep dives survive (translated) below a `---` separator inside `## Feature deep dives`"
    - "Top-of-file TOC links to every top-level section"
  artifacts:
    - path: README.md
      provides: reviewer-facing canonical brief-aligned Swedish documentation
      contains_sections:
        - "## Vad är det här?"
        - "## Snabbstart med Docker Compose"
        - "## Demo-konton"
        - "## Lokal utveckling utan Docker"
        - "## Tester"
        - "## Kända luckor"
        - "## Med mer tid"
        - "## Vad ligger var?"
        - "## Feature deep dives"
  key_links:
    - from: README.md top-of-file TOC
      to: "every `## ` heading"
      via: GitHub-flavored markdown auto-anchors
      pattern: "^- \\[.*\\]\\(#.*\\)$"
---

<objective>
Restructure README.md from its current append-only build-narrative (851 lines, mixed Swedish + English, stale Status section, Phase 5+6 deep dives at top) into the brief-aligned canonical layout locked by D-121, fully Swedish per D-122, with the consolidated `## Kända luckor` (D-131) and `## Med mer tid` (D-130) sections in place. The Phase 5+6 deep dives are translated to Swedish and moved BELOW a `---` separator into `## Feature deep dives`.

This slice is the largest of Phase 7 and **blocks every other slice** that places content in README.md (Slices 2, 4, 5). It DOES NOT yet add the `## Arkitekturval` section (Slice 2), the `## Mobil-först verifiering` section (Slice 4), or the `## Demo-rundtur` + `## §6-svar` sections (Slice 5). Those slices each insert their content into the canonical layout established here.

Purpose: pay the wholesale restructure cost in a single coherent commit chain — Slice 1 — so subsequent slices land focused additions into a clean structure.

Output: `README.md` restructured + translated + consolidated; existing per-feature inline `v2 candidates` lists removed (lifted to `## Med mer tid`); Phase 1 stale `## Status` section removed.
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/07-ops-submission-polish/07-CONTEXT.md
@.planning/phases/07-ops-submission-polish/07-PATTERNS.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Translate + restructure README to canonical brief-aligned Swedish layout</name>
  <files>README.md</files>
  <read_first>
    - README.md (the file being modified — current 851-line state)
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (D-121, D-122, D-130, D-131; `<specifics>` "Top-level README section ordering (final)" + "Swedish-language conventions")
    - .planning/phases/07-ops-submission-polish/07-PATTERNS.md (Pattern C — File-path / UI-string quoting in Swedish prose; "`README.md` (wholesale restructure)" pattern section)
  </read_first>
  <action>
    Restructure README.md in place per D-121's canonical top-level section ordering. The full ordered list of `## ` headings — in this exact order, top-to-bottom — is the section list in `07-CONTEXT.md <specifics>` "Top-level README section ordering (final)" (Vad är det här? → Arkitekturval (placeholder; populated by Slice 2) → Snabbstart med Docker Compose → Demo-konton → Demo-rundtur (placeholder; populated by Slice 5) → Lokal utveckling utan Docker → Tester → Mobil-först verifiering (placeholder; populated by Slice 4) → Kända luckor → Med mer tid → §6-svar (placeholder; populated by Slice 5) → Vad ligger var? → then `---` separator → `## Feature deep dives` container with Audit log / AI Categorization / Dashboard low-stock banner / Error envelope / Environment variables as `### ` subsections).

    For the placeholder sections (Arkitekturval, Demo-rundtur, Mobil-först verifiering, §6-svar) — insert each as `## <heading>` followed by a single one-line HTML comment placeholder like `<!-- Populated by Slice 0X -->` so Slice 2/4/5 have anchored insertion points and the TOC links work immediately. Do NOT draft the body of these sections in this task.

    Add a GitHub-flavored markdown TOC at the very top of the file (after the `# MediTrack` H1, before `## Vad är det här?`). The TOC is a bulleted list of `- [Section heading text](#section-heading-text)` lines covering every `## ` heading. Include the placeholder sections so their anchors are correct from day 1.

    Translate the existing English Phase 5 deep dive (current lines ~123–581 — `## Audit log` and its subsections) and the existing English Phase 6 deep dives (current lines ~582–842 — `## AI Categorization`, `## Dashboard low-stock banner`, `## Error envelope additions (Phase 6)`, `## Environment variables (Phase 6 additions)`) into idiomatic technical Swedish per D-122 + Pattern C. Apply these translation rules verbatim from `07-CONTEXT.md <specifics>` "Swedish-language conventions":
      - Swedish prose around English technical terms.
      - UI strings stay verbatim in code-fences (`Hämta AI-förslag`, `Slutgiltig klass`, `Använd förslag`, `Förslag:`, `Hög säkerhet / Medel säkerhet / Låg säkerhet`, `Utkast / Skickad / Bekräftad / Levererad`).
      - Technical proper-nouns stay in code-fences: `AsyncLocalStorage`, `$extends`, `tool_use`, `claude-haiku-4-5`, `pg_locks`, `SQLSTATE 42501`, `meditrack_app`, `pg_trgm`, `FOR UPDATE`, `$queryRaw`, `$executeRaw`, `RBAC`, `JSON`, `HTTP 409`, `HTTP 503`, `HTTP 504`.
      - File paths stay in code-fences (`apps/api/src/services/audit.service.ts`).
      - Variable/function names NEVER translated (`requirePermission`, `useAuth`, `withActionOverride`, `careUnitId`).
      - Error codes stay raw (`ai_unavailable`, `ai_timeout`, `order_locked`, `rate_limited`).
      - Migration names stay raw (`0008_audit_events_revoke_grants`, `0010_audit_events_named_app_role`).
      - Test names stay raw (`integration test #2`, `Test 15`, `audit.integration.test.ts`).
      - Roles in prose: lowercase Swedish (apotekare, sjuksköterska, admin). In code-fences: raw form (`role: 'sjukskoterska'`).
      - `vårdenhet` / `vårdenheter` as one word, no markup.

    Move the translated Phase 5 + 6 deep dives BELOW a horizontal-rule `---` separator into a new `## Feature deep dives` container. Inside that container, each former top-level `## ` from the deep dives becomes `### ` (one nesting level deeper). The current subsection structure under each (e.g., Phase 5's `### How the audit hook works` → `### Hur audit-hooken fungerar`) becomes `#### ` etc. Refer to `07-CONTEXT.md <specifics>` "Top-level README section ordering (final)" for the full target deep-dive subsection tree (under `## Feature deep dives` → `### Audit log (Phase 5)` etc.).

    Within each deep-dive section, REMOVE the inline `## v2 candidates` / `### v2 candidates` / `## Phase 6 v2 candidates` lists. Their items lift into the new top-level `## Med mer tid` section (see next bullet). Add a one-line link from each deep-dive section to `## Med mer tid` like `> Framtida idéer för detta område är listade under [§ Med mer tid](#med-mer-tid).`.

    Also REMOVE the existing Phase 5 inline `### §6 interview-ready phrasings` subsection from the audit deep dive. Per D-124 the content gets converted to compact bullet-level "supporting evidence" — Slice 5 will draft those bullets; for now, leave a one-line HTML comment placeholder `<!-- §6 supporting bullets — populated by Slice 5 -->` where the section used to be, anchored under a new `### §6 supporting bullets` heading (so Slice 5 has a stable insertion point).

    DELETE the current `## Status` section (currently lines ~113–122) entirely per D-130 — both the heading and its body.

    DELETE existing scattered inline links to ROADMAP / REQUIREMENTS at the bottom of the deleted Status section unless they appear elsewhere; they're noise at submission.

    Populate `## Kända luckor` (per D-131) — five bullets minimum. **Bullet format requirement:** each bullet starts with `- ` (markdown unordered-list bullet, not numbered) so the verify-block grep matches. Content is 1–2 Swedish sentences per bullet:
      - `pnpm verify` är inte wired till CI än (ingen GitHub Actions-workflow i repot — `## Med mer tid §Drift & skalning`).
      - 43 538 NPL-läkemedel saknar `therapeuticClass` på fresh seed (D-115 medveten avvägning — `## Feature deep dives §AI Categorization`).
      - `$queryRaw`-skrivvägar avlyssnas inte av audit-middleware (inga förekomster idag; CI-grep är vakten — `apps/api/test/audit.integration.test.ts` Test 15).
      - Demo-lösenord `demo1234` är hårdkodat i seed (ingen per-användare rotation vid första inlogg).
      - Ingen functional E2E-svit; Playwright används endast för SC#4 layoutverifiering (se `## Mobil-först verifiering`). Integration tests mot Fastify `app.inject` täcker API-ytan.

    Populate `## Med mer tid` (per D-130) — consolidated themed buckets in this order (per Claude's Discretion in `07-CONTEXT.md`): `### Audit & efterlevnad` → `### AI & klassificering` → `### Drift & skalning` → `### UX-polish` → `### Säkerhet`. Lift items from:
      - Current README inline lists (Phase 5 v2 candidates section and Phase 6 v2 candidates section before they were removed above).
      - `.planning/PROJECT.md` "Out of Scope" reasoning where it overlaps (do NOT duplicate Out of Scope — only items that are genuinely candidates for future work).
      - `07-CONTEXT.md <deferred>` items (CI/CD wiring of `pnpm verify`, E2E functional Playwright suite, per-user password rotation, `pngquant` PNG post-pass, SECURITY DEFINER purge function for audit retention, production secrets management, per-vårdenhet admin scope toggle, per-user rate-limit on `POST /api/ai/suggest-therapeutic-class`).
      Each bullet is 1–2 sentences Swedish prose, starting with `- `. NOT every deferred item lifts in — only those that genuinely answer "what I'd do with more time"; permanently-out-of-scope items (e.g., "translating planning artifacts into Swedish") do NOT lift in.

    Keep the existing Swedish ops sections (lines 1–122 today — Vad är det här? / Snabbstart / Demo-konton / Lokal utveckling / Tester) intact in content but reorder per the canonical layout. They keep their existing voice + code-fence conventions per Pattern C.

    Keep the closing `## Vad ligger var?` section at the END of the canonical top section (just before the `---` separator), with its existing content updated only to reference the new `## Feature deep dives` block.

    Add a one-paragraph note near the TOC documenting the language convention per D-122: "README är på svenska. UI-strängar citeras ordagrant; tekniska egennamn (`AsyncLocalStorage`, `$extends`, `meditrack_app`, ...) lämnas i ursprungsform inom kodfont."

    Do NOT touch `docker-compose.yml`, `.env.example`, or any source files. This task is README.md only.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. The 11 canonical top-level sections exist (placeholders count for now):
      grep -v '^#' README.md | grep -c "^## Vad är det här?$" | xargs test 0 -lt   # nonzero count
      for heading in "## Arkitekturval (motivera dina val)" "## Snabbstart med Docker Compose" "## Demo-konton" "## Demo-rundtur (5 minuter)" "## Lokal utveckling utan Docker" "## Tester" "## Mobil-först verifiering" "## Kända luckor" "## Med mer tid" "## §6-svar (intervjudiskussion)" "## Vad ligger var?" "## Feature deep dives"; do
        grep -F "$heading" README.md >/dev/null || (echo "MISSING: $heading"; exit 1)
      done
      # 2. The stale Status section is deleted:
      ! grep -F "## Status" README.md
      # Phase 1 — klar phrase is gone (Status body):
      ! grep -F "Phase 1 — Foundation & Auth — är klar" README.md
      # 3. Five themed buckets exist under Med mer tid:
      for bucket in "### Audit & efterlevnad" "### AI & klassificering" "### Drift & skalning" "### UX-polish" "### Säkerhet"; do
        grep -F "$bucket" README.md >/dev/null || (echo "MISSING: $bucket"; exit 1)
      done
      # 4. Kända luckor has at least 5 bullets. Accept either `- ` (unordered) or `N. ` (ordered) bullet markers.
      #    Filter out markdown-comment lines (just in case) before counting.
      n=$(awk '/^## Kända luckor$/,/^## /' README.md | grep -v '^#' | grep -cE '^(- |[0-9]+\. )')
      test "$n" -ge 5 || (echo "Kända luckor bullet count = $n (expected >= 5)"; exit 1)
      # 5. Language note exists:
      grep -F "README är på svenska" README.md
      # 6. Feature deep dives container exists after a `---` separator:
      grep -B1 "^## Feature deep dives" README.md | grep -F "---"
      # 7. Phase 6 v2 candidates inline list removed:
      ! grep -F "## Phase 6 v2 candidates" README.md
      # 8. Old inline §6 phrasings heading is gone (replaced by stub):
      ! grep -F "### §6 interview-ready phrasings" README.md
      grep -F "### §6 supporting bullets" README.md
      # 9. Placeholder comments for downstream slices exist:
      grep -F "<!-- Populated by Slice 2 -->" README.md
      grep -F "<!-- Populated by Slice 4 -->" README.md
      grep -F "<!-- Populated by Slice 5 -->" README.md
    </automated>
  </verify>
  <done>
    All 12 canonical top-level headings exist in correct order; `## Status` is gone; `## Kända luckor` has ≥5 bullets; `## Med mer tid` has 5 themed buckets; deep dives moved below `---` into `## Feature deep dives`; English Phase 5+6 prose translated to Swedish per D-122 conventions; TOC linked at top of file; placeholder HTML comments anchor the 3 sections Slices 2, 4, 5 will populate.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| README.md → reviewer | Static rendered markdown viewed on GitHub or in a local editor. No code execution. No input handling. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-01 | Information Disclosure | README content | accept | README has been public-facing since Phase 1; no secrets are added by this restructure (demo password `demo1234` was already documented in the existing Demo-konton section). |
| T-07-02 | Tampering | README content | accept | Edits are tracked via git; commit chain is the audit trail per project convention "vi läser dina commits". |
| T-07-03 | All other ASVS L1 categories | N/A | out-of-scope | Documentation-only edit — no inputs, no auth code, no DB access, no new attack surface. No new dependencies added. |
</threat_model>

<verification>
- README.md preserves all factual content from existing English deep dives (translated, not rewritten — the technical claims, file paths, decision IDs, test IDs are byte-identical to the source).
- Top-of-file TOC anchors resolve correctly when rendered on GitHub.
- The placeholder comments `<!-- Populated by Slice 2 -->`, `<!-- Populated by Slice 4 -->`, `<!-- Populated by Slice 5 -->` exist so downstream slices can insert their content at known anchor points.
- `git log --oneline -3` shows a single restructure commit chain following Pattern B (`docs(07-01): ...`).
</verification>

<success_criteria>
- All 12 canonical top-level headings exist in canonical order at top of README.md.
- README.md body Swedish-fraction (Swedish prose lines / total prose lines) ≥ 0.95 — i.e., body is essentially all Swedish per D-122.
- Phase 5 + Phase 6 inline v2 lists removed; consolidated into 5-bucket `## Med mer tid`.
- Stale `## Status` section gone.
- `git log --oneline -3` shows `docs(07-01): ...` commit messages following Pattern B.
- All grep-able assertions in `<verify>` pass.
</success_criteria>

<output>
Create `.planning/phases/07-ops-submission-polish/07-01-SUMMARY.md` when done, listing the canonical sections that landed, the placeholder anchors for Slice 2/4/5, the Swedish-translation conventions applied, and any deferred items lifted into `## Med mer tid`.
</output>
