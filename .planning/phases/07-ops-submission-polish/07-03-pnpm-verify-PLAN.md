---
phase: 07
plan: 07-03
type: execute
wave: 2
depends_on: [07-01]
files_modified:
  - package.json
  - apps/api/package.json
  - README.md
autonomous: true
requirements_addressed: [OPS-04]
must_haves:
  truths:
    - "Implements D-129 (root `pnpm verify` runs lint + typecheck + test + build, in that order; SC#4 Playwright is NOT chained in)"
    - "Running `pnpm verify` from the repo root runs lint + typecheck + test + build and exits 0 on a clean working tree"
    - "Each workspace has a `typecheck` script (apps/api was missing it)"
    - "README §Tester documents `pnpm verify` and its walltime expectation"
    - "Root `lint` stays direct (non-recursive); per Pattern E rationale in PATTERNS.md"
  artifacts:
    - path: package.json
      provides: "Root scripts.verify and scripts.typecheck"
      contains: ['"verify":', '"typecheck":']
    - path: apps/api/package.json
      provides: "Per-workspace typecheck script"
      contains: ['"typecheck":']
    - path: README.md
      provides: "## Tester section augmented with pnpm verify documentation"
      contains:
        - "pnpm verify"
        - "lint + typecheck + test + build"
  key_links:
    - from: package.json scripts.verify
      to: per-workspace pnpm -r lint/typecheck/test/build
      via: && chain
      pattern: "verify.*pnpm.*lint.*pnpm.*typecheck.*pnpm.*test.*pnpm.*build"
---

<objective>
Wire a root `pnpm verify` script that runs lint + typecheck + test + build in sequence per D-129. This makes "is the repo healthy?" a one-command answer for the reviewer.

**Wave assignment:** Plan 07-03 sits in **Wave 2 with `depends_on: [07-01]`** because Task 2 modifies `README.md` (the file Slice 1 wholesale-restructures). Reassigning from Wave 1 to Wave 2 trades ~30 s of theoretical parallel-execution gain for an explicit, correct dependency declaration. The package.json edits in Task 1 do not conflict with Slice 1 — only Task 2's README edit does — but declaring the whole plan as Wave 2 keeps the dependency graph honest.

Per D-129 + PATTERNS.md Pattern D + Pattern E:
- Root `scripts.verify` = `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` (root `lint` stays direct per PATTERNS.md recommendation (a); the `&&` chain combines the direct root lint with the per-workspace recursive calls for typecheck/test/build).
- Root `scripts.typecheck` = `pnpm -r typecheck` (convenience for "just typecheck").
- `apps/api/package.json` gains `"typecheck": "tsc --noEmit -p ."` (apps/web and packages/shared already have it per PATTERNS.md verifications).
- `apps/api/tsconfig.json` keeps `"include": ["src"]` per Pattern E rationale (a) — typecheck scope = production build scope; tests get type coverage via vitest's own loader during `pnpm test`.
- README `## Tester` body gains documentation for the new `pnpm verify` command + walltime expectation (~5–6 min) + Note that SC#4 Playwright is NOT chained in (separate concern; documented in Slice 4).

Output: 3 files modified, 1 new root script (`verify`), 1 new workspace script (`apps/api/scripts.typecheck`), README `## Tester` documents `pnpm verify`.
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/phases/07-ops-submission-polish/07-CONTEXT.md
@.planning/phases/07-ops-submission-polish/07-PATTERNS.md
@package.json
@apps/api/package.json
@apps/web/package.json
@packages/shared/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire root `pnpm verify` and add `apps/api/scripts.typecheck`</name>
  <files>package.json, apps/api/package.json</files>
  <read_first>
    - package.json (root — current state, lines 9–18 `scripts` block — analog source per PATTERNS.md Pattern D)
    - apps/api/package.json (target — must gain `"typecheck": "tsc --noEmit -p ."` per PATTERNS.md `apps/api/package.json` row)
    - apps/web/package.json (reference — already has `"typecheck": "tsc --noEmit"` at line 11 — analog)
    - packages/shared/package.json (reference — already has `"typecheck": "tsc -p . --noEmit"` at line 17 — analog)
    - apps/api/tsconfig.json (verify `"include": ["src"]` per Pattern E rationale (a) — confirms scope of `tsc --noEmit -p .`)
    - .planning/phases/07-ops-submission-polish/07-PATTERNS.md (`package.json (root) — add scripts.verify` section + `apps/api/package.json — add scripts.typecheck` section + Pattern D + Pattern E)
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (D-129 — full specification)
  </read_first>
  <action>
    **Edit `package.json` (root)** — add two new entries to the `scripts` block:
      - `"verify": "pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build"` — per PATTERNS.md recommendation (a) (root `lint` stays direct; the `&&` chain combines).
      - `"typecheck": "pnpm -r typecheck"` — convenience script.

    Place these alphabetically near the existing scripts (after `test`, before `lint`, or wherever alphabetical order dictates — match existing convention). Do NOT change any existing scripts.

    **Edit `apps/api/package.json`** — add to its `scripts` block:
      - `"typecheck": "tsc --noEmit -p ."`

    Place after the existing `"build": "tsc -p ."` line. Do NOT change any other scripts.

    Do NOT touch `apps/web/package.json` (already conforms — `"typecheck": "tsc --noEmit"` exists). Do NOT touch `packages/shared/package.json` (already conforms). Do NOT touch `apps/api/tsconfig.json` (Pattern E rationale (a) — typecheck scope = production build scope is the right call for a polish phase).

    After editing, verify the new script works from a clean shell — run `pnpm -r typecheck` from the repo root and confirm it exits 0 across all three workspaces.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. Root package.json has scripts.verify with the exact && chain:
      node -e "const j=require('./package.json'); if (!j.scripts.verify || !j.scripts.verify.includes('pnpm lint') || !j.scripts.verify.includes('pnpm -r typecheck') || !j.scripts.verify.includes('pnpm -r test') || !j.scripts.verify.includes('pnpm -r build')) {console.error('verify script missing or wrong:', j.scripts.verify); process.exit(1)}"
      # 2. Root package.json has scripts.typecheck:
      node -e "const j=require('./package.json'); if (!j.scripts.typecheck) {console.error('root typecheck missing'); process.exit(1)}"
      # 3. apps/api/package.json has scripts.typecheck:
      node -e "const j=require('./apps/api/package.json'); if (!j.scripts.typecheck || !j.scripts.typecheck.includes('tsc')) {console.error('apps/api typecheck missing:', j.scripts.typecheck); process.exit(1)}"
      # 4. pnpm -r typecheck succeeds end-to-end (all 3 workspaces):
      pnpm -r typecheck
      # 5. apps/web and packages/shared scripts still present:
      node -e "if (!require('./apps/web/package.json').scripts.typecheck || !require('./packages/shared/package.json').scripts.typecheck) {process.exit(1)}"
    </automated>
  </verify>
  <done>
    Root `package.json` has `verify` + `typecheck` scripts; `apps/api/package.json` has `typecheck` script; `pnpm -r typecheck` exits 0 across all 3 workspaces.
  </done>
</task>

<task type="auto">
  <name>Task 2: Document `pnpm verify` in README §Tester</name>
  <files>README.md</files>
  <read_first>
    - README.md (current state after Slice 1's restructure; the `## Tester` section now contains Slice 1's translated content)
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (D-129 — README §Tester documentation requirements; `<specifics>` "Top-level README section ordering (final)" `## Tester` subsection bullets)
    - .planning/phases/07-ops-submission-polish/07-PATTERNS.md (Pattern C — Swedish prose conventions to use for the addition)
    - package.json (root — verify the `scripts.verify` chain is exactly what gets documented)
  </read_first>
  <action>
    Because this plan declares `depends_on: [07-01]` and runs in Wave 2, the orchestrator will only schedule it after Slice 1 has landed — no in-task gate check needed. Proceed directly to the README edit.

    Append a Swedish paragraph to the `## Tester` section in README.md documenting the new commands. The addition lands AFTER any existing content Slice 1 produced in `## Tester`. New content:

    A short Swedish lead-in sentence: "Hela suiten verifieras med ett kommando från repo-roten:"

    Code-fence with bash:
    ```
    pnpm verify
    ```

    A Swedish prose paragraph (2–3 sentences) explaining: körs lint + typecheck + test + build i den ordningen; ~5–6 minuter walltime på första körningen; exit 0 betyder att repot är hälsosamt. Cite the underlying chain explicitly: "`pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build`".

    A short follow-up paragraph noting that the SC#4 Playwright layout-check is NOT chained into `pnpm verify` because it requires `docker compose up` running — its dedicated command lives under `## Mobil-först verifiering` (Slice 4 will populate that section; the cross-reference link is OK to add now since the section heading exists from Slice 1's placeholder anchor).

    Apply Pattern C — Swedish prose; code-fences for `pnpm verify`, the full `&&` chain, `pnpm lint`, etc. UI strings irrelevant here; technical names (`Vitest`, `tsc`, `eslint`) stay raw in code-fences.

    Do NOT touch any other section of README.md. The edit is one self-contained addition to `## Tester`.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. Section exists from Slice 1:
      grep -F "## Tester" README.md
      # 2. New documentation present in the Tester section:
      awk '/^## Tester$/,/^## /' README.md | grep -F "pnpm verify"
      awk '/^## Tester$/,/^## /' README.md | grep -F "pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build"
      # 3. Walltime expectation documented:
      awk '/^## Tester$/,/^## /' README.md | grep -E "5.6 min|5-6 min|5–6 min"
      # 4. Cross-ref to Mobil-först section exists (will resolve when Slice 4 lands):
      awk '/^## Tester$/,/^## /' README.md | grep -F "Mobil-först"
    </automated>
  </verify>
  <done>
    README `## Tester` documents `pnpm verify`, the full chain, the walltime, and notes that SC#4 Playwright is documented separately under `## Mobil-först verifiering`.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| package.json scripts → developer's shell | Scripts run with the developer's local privileges. No new commands invoke remote endpoints; all four (`lint`, `typecheck`, `test`, `build`) are pure local tooling. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-06 | Tampering | `pnpm verify` chain | accept | The chain composes existing scripts (`lint`, `typecheck`, `test`, `build`) that already exist and have been audited. No new install steps, no new dependencies. |
| T-07-07 | Denial of Service | `pnpm verify` walltime | accept | Walltime ~5–6 min on first run; subsequent runs faster due to vitest/tsc caches. Acceptable for a one-shot verification command. Not a production runtime concern. |
| T-07-08 | All other ASVS L1 categories | N/A | out-of-scope | Tooling-only edit — no inputs, no auth code, no DB access, no new attack surface. No new dependencies added. |
</threat_model>

<verification>
- `pnpm verify` command exits 0 on a clean working tree (full chain runs successfully).
- `pnpm -r typecheck` exits 0 across all 3 workspaces.
- Root `scripts.lint` is preserved (direct eslint pass — non-recursive — per PATTERNS.md recommendation (a)).
- README `## Tester` documents both the command and the rationale for not chaining SC#4.
</verification>

<success_criteria>
- 3 files modified: `package.json` (root, +2 scripts), `apps/api/package.json` (+1 script), `README.md` (+ paragraph in `## Tester`).
- All grep-able assertions in `<verify>` blocks pass.
- `pnpm verify` runs end-to-end without errors (this is the canonical functional check).
- Commit messages follow Pattern B (`chore(07-03): ...` for package.json edits; `docs(07-03): ...` for README).
</success_criteria>

<output>
Create `.planning/phases/07-ops-submission-polish/07-03-SUMMARY.md` when done, listing: the exact `scripts.verify` string committed, the apps/api typecheck script added, the README `## Tester` text added, walltime observed on first `pnpm verify` run.
</output>
