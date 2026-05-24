---
phase: 07
plan: 07-09
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/package.json
autonomous: true
requirements_addressed: [OPS-02, OPS-04]
must_haves:
  truths:
    - "Closes 07-VERIFICATION.md WR-03: `apps/web/package.json` scripts.build no longer contains `tsc --noEmit`; the script is exactly `vite build`. The redundant typecheck inside the build step (which `pnpm verify` already runs via `pnpm -r typecheck` before `pnpm -r build`) is gone."
    - "TypeScript coverage on apps/web is preserved by `pnpm -r typecheck` running first in the `pnpm verify` chain (D-129) and by `apps/web/package.json` scripts.typecheck (`tsc --noEmit`) being unchanged"
    - "`pnpm verify` still exits 0 end-to-end after the change (the chain `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` is unbroken; build now only emits, no longer double-typechecks)"
    - "Walltime improvement is informational (~5–10 s shaved per fresh `pnpm verify` run); the plan does NOT assert the walltime delta — only that the script no longer contains `tsc --noEmit`"
    - "Atomic commit scope `chore(07-09)` continues the Phase 7 per-slice narrative (mirrors `chore(phase-07): demo-path verified by user on fresh docker compose up` and the existing `chore(07-NN):` convention from 07-CONTEXT.md commit-conventions)"
  artifacts:
    - path: apps/web/package.json
      provides: "scripts.build with the redundant typecheck removed"
      contains:
        - '"build": "vite build"'
  key_links:
    - from: package.json (root) scripts.verify chain
      to: apps/web/package.json scripts.build
      via: "`pnpm -r build` no longer triggers a second tsc --noEmit on apps/web"
      pattern: '"build":\\s*"vite build"'
    - from: apps/web/package.json scripts.typecheck
      to: pnpm verify pnpm -r typecheck step
      via: "TypeScript coverage on apps/web is preserved by the typecheck script (`tsc --noEmit`) which `pnpm -r typecheck` invokes"
      pattern: '"typecheck":\\s*"tsc --noEmit"'
---

<objective>
Remove the redundant `tsc --noEmit` from `apps/web/package.json` scripts.build per 07-VERIFICATION.md WR-03 and 07-REVIEW.md WR-03.

**Gap source:** 07-VERIFICATION.md Anti-Patterns Found row for WR-03 (`apps/web/package.json:8` — `"build": "tsc --noEmit && vite build"` — redundant typecheck inside build script).

**The fix (one line, one file):** Change `apps/web/package.json` line 8 from:

```json
"build": "tsc --noEmit && vite build",
```

to:

```json
"build": "vite build",
```

**Why the redundancy exists today (context for the executor — not part of the fix):**

When `pnpm verify` runs (per D-129 plan 07-03), the chain is `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build`. The `pnpm -r typecheck` step invokes `apps/web/package.json` scripts.typecheck (`tsc --noEmit`) — apps/web is typechecked once here. Then `pnpm -r build` invokes `apps/web/package.json` scripts.build, which today is `tsc --noEmit && vite build` — apps/web is typechecked a SECOND time before vite builds. The second typecheck adds ~5–10 s on a cold run and creates two-locations-asserting-the-same-invariant ambiguity.

After the fix, the chain typechecks apps/web exactly once (during the typecheck step), then builds it (vite emits only). The TypeScript guarantee is preserved because the typecheck step still runs and still calls `tsc --noEmit` on the same files via the unchanged `scripts.typecheck`.

**Why this is a chore not a fix:** The build still produces correct output before AND after the change — `vite build` runs in both cases. The change improves the script's design (no redundant work) without changing the verify-chain's correctness contract. The commit scope is `chore(07-09)` per 07-CONTEXT.md commit conventions (`chore(07-NN):` for non-feature, non-bug code-housekeeping touches).

**Wave assignment:** Wave 1, `depends_on: []`. Independent of plans 07-07 (different file: README.md) and 07-08 (different file: captureSc04Screenshots.ts). The three plans share zero `files_modified` and can be scheduled in parallel.

**Out of scope:**
- No changes to `apps/web/package.json` scripts.typecheck — it stays `"tsc --noEmit"`, which is the typecheck contract the verify chain depends on.
- No changes to `apps/web/package.json` other scripts (`dev`, `preview`, `test`).
- No changes to root `package.json` (scripts.verify chain from D-129 / plan 07-03 is already correct).
- No changes to `apps/api/package.json` or `packages/shared/package.json` scripts.build — only apps/web had the redundant `tsc --noEmit` in its build (apps/api's build is `tsc -p .`, which IS the artifact-emitting compile; packages/shared's build is `tsc -p .`, same).
- No changes to `apps/web/tsconfig.json`, `apps/web/tsconfig.node.json`, or any tsconfig.
- No new `## Kända luckor` bullet — WR-03 is being FIXED, not documented as a known gap.
- No new dev-dependencies. No new files. No new tests.

Output: 1 file modified (`apps/web/package.json`); 1 single-line edit; net -16 characters (removal of `tsc --noEmit && `).
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
@apps/web/package.json
@package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove `tsc --noEmit && ` from apps/web/package.json scripts.build</name>
  <files>apps/web/package.json</files>
  <read_first>
    - apps/web/package.json (lines 6–12 are the scripts block; line 8 is the target; line 11 `"typecheck": "tsc --noEmit"` must stay unchanged — it is the typecheck contract the verify chain depends on)
    - package.json (root, lines 9–18 — verifies the `verify` chain runs `pnpm -r typecheck` BEFORE `pnpm -r build`; the typecheck-before-build ordering is what makes removing the build-side typecheck safe)
    - apps/api/package.json (reference — its build script is `"build": "tsc -p ."`, which IS the artifact-emitting compile, NOT a redundant typecheck; this is why WR-03 only flags apps/web)
    - packages/shared/package.json (reference — same shape as apps/api; the build IS the compile)
    - 07-VERIFICATION.md Anti-Patterns Found row for WR-03 (line 8 reference)
    - 07-REVIEW.md `## Warnings ### WR-03` (literal fix snippet — `"build": "vite build"`)
  </read_first>
  <action>
    Single Edit operation on `apps/web/package.json` line 8.

    Locate:

    ```json
        "build": "tsc --noEmit && vite build",
    ```

    Replace with:

    ```json
        "build": "vite build",
    ```

    The trailing comma is preserved (line 9 follows with `"preview"`). The leading indentation (4 spaces inside the `scripts` block) is preserved. The script key (`"build"`) is unchanged. The change is purely the value string — `tsc --noEmit && ` is removed; `vite build` remains.

    Do NOT touch any other line of `apps/web/package.json`:
    - Line 7 `"dev": "vite"` — unchanged.
    - Line 9 `"preview": "vite preview --host 0.0.0.0 --port 5173"` — unchanged.
    - Line 10 `"test": "vitest run"` — unchanged.
    - Line 11 `"typecheck": "tsc --noEmit"` — UNCHANGED. This is the script `pnpm -r typecheck` invokes; it MUST keep typechecking apps/web. Removing or weakening it would lose TypeScript coverage on apps/web entirely; that is exactly what WR-03 warns against. The fix is to remove the DUPLICATE typecheck in build, not to remove typechecking.
    - `dependencies` and `devDependencies` blocks — unchanged. No new deps, no removed deps.

    Do NOT change `package.json` (root). The `scripts.verify` chain from D-129 (plan 07-03) is `pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` — typecheck runs BEFORE build. That ordering is what makes this fix safe: TypeScript errors in apps/web still abort `pnpm verify` at the typecheck step, before build runs. The build no longer needs to re-assert the type-correctness invariant.

    Do NOT add a comment / doc-string explaining the change inside package.json (JSON has no comment syntax, and noise is bad). The commit message is the audit trail.

    After editing, verify locally:
    1. `node -e "console.log(require('./apps/web/package.json').scripts.build)"` outputs exactly `vite build` (no `tsc --noEmit`).
    2. `pnpm --filter @meditrack/web typecheck` exits 0 (the typecheck script still works — proves we did not break apps/web's TypeScript story).
    3. `pnpm --filter @meditrack/web build` exits 0 (vite produces a build without the redundant typecheck step).
    4. `pnpm verify` exits 0 (the full chain still passes; the typecheck-before-build ordering catches any TS errors).
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. The build script value is EXACTLY "vite build" — no tsc, no &&, nothing else:
      node -e "const j=require('./apps/web/package.json'); if (j.scripts.build !== 'vite build') {console.error('build script wrong, got:', JSON.stringify(j.scripts.build)); process.exit(1)}"
      # 2. The typecheck script value is UNCHANGED ("tsc --noEmit") — apps/web still typechecks:
      node -e "const j=require('./apps/web/package.json'); if (j.scripts.typecheck !== 'tsc --noEmit') {console.error('typecheck script changed unexpectedly, got:', JSON.stringify(j.scripts.typecheck)); process.exit(1)}"
      # 3. Other scripts unchanged:
      node -e "const j=require('./apps/web/package.json'); const expected = {dev:'vite', preview:'vite preview --host 0.0.0.0 --port 5173', test:'vitest run'}; for (const k of Object.keys(expected)) { if (j.scripts[k] !== expected[k]) {console.error('script', k, 'changed:', j.scripts[k]); process.exit(1)} }"
      # 4. Dependencies block is unchanged (count of deps/devDeps is stable; an accidental dep removal would be caught here):
      node -e "const j=require('./apps/web/package.json'); console.log('deps:', Object.keys(j.dependencies||{}).length, 'devDeps:', Object.keys(j.devDependencies||{}).length)"
      # 5. The apps/web typecheck still runs and exits 0 (proves TypeScript coverage is intact):
      pnpm --filter @meditrack/web typecheck
      # 6. The apps/web build still runs and exits 0 (proves vite-only build works without the pre-typecheck):
      pnpm --filter @meditrack/web build
      # 7. The full verify chain still passes — this is the functional contract that matters:
      pnpm verify
    </automated>
  </verify>
  <done>
    `apps/web/package.json` scripts.build is exactly `"vite build"`. `apps/web/package.json` scripts.typecheck is unchanged (`"tsc --noEmit"`). `pnpm --filter @meditrack/web typecheck` exits 0. `pnpm --filter @meditrack/web build` exits 0. `pnpm verify` (the full chain) exits 0. No other lines of `apps/web/package.json` are changed.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| apps/web/package.json scripts.build → developer's shell / CI | Local-development tooling only. No production runtime impact. Removing the redundant typecheck reduces verify walltime; it does not change what the build emits (vite output is identical) nor the typecheck contract (preserved via scripts.typecheck + the verify chain ordering). |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-14 | Tampering | Build pipeline correctness | mitigate | The typecheck-before-build ordering in the root `pnpm verify` chain (D-129, plan 07-03) is what makes removing the build-side typecheck safe. We assert that ordering is intact: the verify script runs `pnpm -r typecheck` before `pnpm -r build`. If a future PR reorders the chain, this fix becomes unsafe — but that is a separate concern and would be caught by a code review. |
| T-07-15 | Repudiation | "Two locations asserting the same invariant" | mitigate | Before the fix, both `apps/web build` AND `pnpm -r typecheck` typechecked apps/web — if one was disabled, the other silently covered, hiding the gap. After the fix, the single owner is `pnpm -r typecheck` invoking scripts.typecheck. The contract is explicit. |
| T-07-16 | All other ASVS L1 categories | N/A | out-of-scope | Tooling-only edit; no inputs, no auth code, no DB, no network, no new attack surface. |
</threat_model>

<verification>
- `node -e "console.log(require('./apps/web/package.json').scripts.build)"` outputs exactly `vite build`.
- `node -e "console.log(require('./apps/web/package.json').scripts.typecheck)"` outputs exactly `tsc --noEmit` (unchanged).
- `pnpm --filter @meditrack/web typecheck` exits 0.
- `pnpm --filter @meditrack/web build` exits 0.
- `pnpm verify` exits 0 end-to-end — the full lint + typecheck + test + build chain still works.
- No other `apps/web/package.json` script values, dependencies, or devDependencies changed.
- Walltime improvement (~5–10 s shaved per fresh verify run) is informational — NOT asserted programmatically per 07-VERIFICATION.md WR-03 ("Local-walltime confirmation is human-gated in the verifier; the plan does NOT need to assert the walltime delta — only that the build script no longer contains `tsc --noEmit`").
</verification>

<success_criteria>
- 1 file modified: `apps/web/package.json` — exactly one single-line edit (scripts.build).
- All `node -e` and `pnpm` assertions in `<verify>` block pass.
- Commit message follows Pattern B: scoped `chore(07-09)`; cites WR-03 verbatim by gap ID so the verifier can grep-trace gap → plan → commit.
- After this plan + 07-07 + 07-08 land, re-running gsd-verifier on Phase 7 reports WR-03 as resolved.
</success_criteria>

<output>
Create `.planning/phases/07-ops-submission-polish/07-09-SUMMARY.md` when done, listing:
- The exact diff for the apps/web/package.json scripts.build edit.
- The commit SHA (single commit per atomic-narrative discipline).
- Confirmation that `pnpm --filter @meditrack/web typecheck` exited 0.
- Confirmation that `pnpm --filter @meditrack/web build` exited 0.
- Confirmation that `pnpm verify` exited 0 end-to-end.
- Optional walltime observation (before vs after — informational, not assertive).
</output>
