---
phase: 07
plan: 07-06
type: execute
wave: 4
depends_on: [07-01, 07-02, 07-03, 07-04, 07-05]
files_modified: []
autonomous: false
requirements_addressed: [OPS-01, OPS-02, OPS-04]
must_haves:
  truths:
    - "On a clean machine (or a `docker compose down -v && docker compose up --build`), the full Demo-rundtur walks end-to-end"
    - "All four SC criteria from ROADMAP Phase 7 are mechanically or human-verified"
    - "OPS-01 deliverables are concretely verified: 3 services healthy, all 3 demo users present, ≥10 seeded medications visible, ≥1 in-flight order present"
    - "`git log --oneline` after Phase 7 reads as a coherent narrative — no `wip`, no `fix typo`"
    - "The chore commit closing the phase mirrors the Phase 6 closeout pattern: `chore(phase-07): demo-path verified by user on fresh docker compose up`"
  artifacts:
    - path: ".planning/phases/07-ops-submission-polish/07-06-SUMMARY.md"
      provides: "Demo-path verification record"
      contains:
        - "Demo-rundtur steps verified"
        - "git log narrative review"
        - "Phase 7 SC checklist"
        - "OPS-01 deliverables verified (services + seed users + medications + in-flight order)"
  key_links: []
---

<objective>
Final phase-closing slice. Two human-verification gates, NO new code or doc edits:

1. **Demo-rundtur live walk on a fresh `docker compose down -v && docker compose up --build`.** The user (developer + product owner) walks the 8-step Demo-rundtur landed by Slice 5, confirming each step's UI behavior matches the prose description, no broken flows, no missing assets. This walk also **explicitly delivers OPS-01** — the requirement that `docker compose up` starts `postgres`, `api`, and `web` services with seed data (users for each role, one `vårdenhet`, sample medications, at least one in-flight order). Task 1's acceptance_criteria enumerate each OPS-01 deliverable mechanically. This mirrors the Phase 6 closeout pattern (`3cf26dd docs(phase-06): complete phase execution` was preceded by a `chore(06): phase 6 demo-path verified by user`).

2. **`git log --oneline` narrative review.** The user (or executor on the user's behalf) reads the Phase 7 commit chain from `docs(07-01): ...` forward and confirms:
   - Every commit message is conventional-commits style (no `wip`, no `fix typo`, no profanity, no debug-noise).
   - Atomic — each commit ships one coherent change; no `did several things at once` smell.
   - Narrative — reading top-to-bottom tells the story "restructured README → wrote stack rationale → added verify command → added SC#4 harness → drafted demo path + interview answers".
   - If any commit message is embarrassing, mark it for a localized `git commit --amend` candidate noted in the SUMMARY but do NOT do a phase-wide rebase per CONTEXT `<deferred>`.

This slice ships zero new files and zero file modifications. Its output is the `07-06-SUMMARY.md` (the verification record) and a final chore commit closing the phase.

The `/gsd:transition` step that follows this slice handles `PROJECT.md ## Validated` row appends + `.planning/STATE.md` updates — those are NOT in this plan per CONTEXT line 50.

Output: 1 SUMMARY.md + 1 chore commit (`chore(phase-07): demo-path verified by user on fresh docker compose up`).
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/ROADMAP.md
@.planning/phases/07-ops-submission-polish/07-CONTEXT.md
@README.md
</context>

<tasks>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 1: Live demo-rundtur walk on a fresh `docker compose up --build` (OPS-01 + OPS-02 + SC#1–SC#4)</name>
  <files></files>
  <what-built>
    Slices 1–5 landed: README restructured + translated to Swedish + populated with `## Arkitekturval` matrix + prose, `## Demo-rundtur (5 minuter)` numbered walkthrough, `## §6-svar (intervjudiskussion)` 7 elevator pitches, `## Mobil-först verifiering` with 6 PNGs + 6×4 table, `## Kända luckor`, `## Med mer tid`, `## Tester` documents `pnpm verify`. Plus the `data-test="primary-nav"` attribute on both nav files, the Playwright SC#4 script, and root `pnpm verify` chain. Task 1 is the human-gated end-to-end walk against a from-scratch stack, and the explicit delivery point for OPS-01 (REQUIREMENTS.md line 70: `docker compose up` starts `postgres`, `api`, and `web` services with seed data — users for each role, one `vårdenhet`, sample medications, at least one in-flight order).
  </what-built>
  <how-to-verify>
    1. From a fresh terminal at repo root: `docker compose down -v && docker compose up --build`. Wait until all three services pass their docker healthchecks (postgres healthcheck green; api `/healthz` 200; web dev server serving). Capture `docker compose ps` output showing all 3 services as `healthy` (or `running` for services without a healthcheck) — paste into the SUMMARY.
    2. **OPS-01 — Seed users for all three roles:** open `http://localhost:5173/login` and verify each demo user logs in successfully:
       - `sjukskoterska@example.test` / `demo1234` → lands on a sjukskoterska-scoped view.
       - `apotekare@example.test` / `demo1234` → lands on an apotekare-scoped view.
       - `admin@example.test` / `demo1234` → lands with `/admin/audit` available in the nav.
    3. **OPS-01 — Seeded vårdenhet:** confirm the seeded user's scope shows one `vårdenhet` (visible in header chip / unit selector / order form context — wherever the UI surfaces it).
    4. **OPS-01 — Seeded medications:** navigate to `/lakemedel` as sjuksköterska. Confirm ≥ 10 medications render in the list. Capture the count from the list footer or by counting rows — paste into the SUMMARY.
    5. **OPS-01 — At least one in-flight order:** navigate to `/bestallningar`. Confirm at least one order exists in a pre-`Levererad` status (`Utkast`, `Skickad`, or `Bekräftad`). Capture the order ID + status — paste into the SUMMARY.
    6. **OPS-02 — README anchor + asset sanity:** open README.md on GitHub (or in a markdown previewer) — confirm:
       - The TOC at the top renders as clickable anchor links.
       - Every TOC link resolves to a real `## ` heading (no broken anchors).
       - The 6 inlined `docs/screenshots/sc04-360-<slug>.png` thumbnails render (240 px wide).
       - The §6-svar `[Läs mer: ...](#...)` deep-links resolve to real `### ` headings in `## Feature deep dives`.
    7. **Demo-rundtur walk (8 steps from `## Demo-rundtur (5 minuter)`):**
       - Step 1: Logga in som sjukskoterska@example.test — landar på dashboard.
       - Step 2: Lägg en multi-radsbeställning på `/bestallningar/ny` med 2–3 mediciner; submit; status `Utkast → Skickad`.
       - Step 3: Försök redigera den skickade beställningen — `HTTP 409 order_locked` returneras.
       - Step 4: Logga ut → in som apotekare; se beställningen i tabben "Skickad".
       - Step 5: Klicka in; "Bekräfta" → `Skickad → Bekräftad`; "Leverera" → DeliverConfirmDialog → `Bekräftad → Levererad`; lagersaldot ökar på alla berörda mediciner.
       - Step 6: Navigera till `/lakemedel` — verifiera ökat lagersaldo. Navigera till `/dashboard` — banner refreshed.
       - Step 7: Lägg till ny medicin med AI-förslag; `Hämta AI-förslag` returnerar `tool_use` rekommendation; spara med override eller acceptera.
       - Step 8: Logga ut → in som admin; navigera till `/admin/audit`; filtrera + se diff-panel; klicka `Kopiera permalink`.
    8. **SC#3 — `pnpm verify`:** from repo root → exits 0 in ≤6 min. Capture walltime — paste into the SUMMARY.
    9. **SC#4 — Playwright harness:** `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts` — exits 0; 6 PNGs regenerated identically.
   10. View the README's `## Arkitekturval` matrix; confirm each row's references match the actual codebase (`apps/api/test/orders.deliver.integration.test.ts` exists, etc.).
   11. Inspect `## Kända luckor` — every bullet is honest + actionable (not vague).
   12. If any step fails: capture the failure mode + filename, fix it in a follow-up `docs(07-06):` or `fix(07-06):` commit, re-run the affected step.
  </how-to-verify>
  <acceptance_criteria>
    - **OPS-01 — Services healthy:** On a fresh `docker compose down -v && docker compose up --build`, all 3 services (`postgres`, `api`, `web`) pass their docker healthchecks (or run cleanly for services without a healthcheck). `docker compose ps` output captured in the SUMMARY shows the healthy state.
    - **OPS-01 — Seed users for all 3 roles:** `sjukskoterska@example.test`, `apotekare@example.test`, and `admin@example.test` all successfully log in with `demo1234` on the freshly-seeded stack.
    - **OPS-01 — Seeded vårdenhet:** exactly one `vårdenhet` exists in the seed (visible in UI scope chip or admin view) and is the scope of the seeded sjuksköterska + apotekare users.
    - **OPS-01 — Seeded medications:** `/lakemedel` shows ≥ 10 seeded medications on the fresh stack. Count captured in the SUMMARY.
    - **OPS-01 — In-flight order:** `/bestallningar` shows ≥ 1 order in a status before `Levererad` (i.e., `Utkast`, `Skickad`, or `Bekräftad`) on the fresh stack. Order ID + status captured in the SUMMARY.
    - All 8 Demo-rundtur steps complete without errors in the live UI.
    - `pnpm verify` exits 0 end-to-end (SC#3 mechanically verified).
    - `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts` exits 0 (SC#4 mechanically verified).
    - All README anchor links (TOC + `[Läs mer]`) resolve (OPS-02 anchor integrity).
    - All 6 inline PNG thumbnails render in the README.
    - No HTTP 5xx errors in api logs during the walk.
    - User explicitly approves with "approved" + a one-line note in the SUMMARY about anything notable.
  </acceptance_criteria>
  <resume-signal>Type "approved" with a one-line note summarizing the walk (e.g., "8/8 steps clean, OPS-01 verified: 3 services healthy, 3 demo users, 12 medications, 2 in-flight orders, pnpm verify 4m32s, no surprises"), or describe the issue + corrective action.</resume-signal>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: `git log --oneline` Phase 7 narrative review</name>
  <files></files>
  <what-built>
    Slices 1–5 each shipped their own commit chain. Task 2 is the user's narrative-review pass on the full Phase 7 commit history, mirroring the brief's "vi läser dina commits" weighting.
  </what-built>
  <how-to-verify>
    1. From repo root: `git log --oneline --grep='07-' main..HEAD` (or substitute the appropriate range — whatever shows all Phase 7 commits).
    2. Read the messages top-to-bottom. Confirm:
       - Every message uses conventional-commits style: `<type>(<scope>): <imperative summary>`. Types in use: `docs`, `chore`, `feat`. Scope: `07-01` / `07-02` / `07-03` / `07-04` / `07-05` / `07-06` / `phase-07`.
       - No `wip`, `fix typo`, `oops`, `fixup`, debug-only messages, profanity, or test-noise.
       - Atomic — each commit ships one coherent change; no "did 5 things at once" smell.
       - Narrative — reading the log tells: restructured README → wrote stack rationale → added verify command → added SC#4 harness → drafted demo path + interview answers → demo-path verified.
       - Phase 7 ends with a `chore(phase-07): demo-path verified by user on fresh docker compose up` commit mirroring `3cf26dd docs(phase-06): complete phase execution`.
    3. If any commit message is embarrassing:
       - If it's the most recent commit on the current branch and the change is small: `git commit --amend` is acceptable.
       - If it's deeper in history: note it in `07-06-SUMMARY.md` as a deferred `git commit --amend` candidate per CONTEXT `<deferred>` "Git-history retrospective rewrite"; do NOT do a phase-wide rebase.
    4. Run `git log --oneline | head -50` and read the full project history from the most recent commit back to Phase 1. Confirm the overall arc tells a coherent story (foundation → catalog → orders → confirm/deliver/stock → audit → AI/banner → ops/polish).
  </how-to-verify>
  <acceptance_criteria>
    - Every Phase 7 commit uses `docs(07-NN)` / `chore(07-NN)` / `feat(07-NN)` / `docs(phase-07)` / `chore(phase-07)` scope.
    - No commit message contains: `wip`, `fix typo`, `oops`, `fixup`, debug-only language, or non-conventional-commits format.
    - Atomic — no commit ships > 1 unrelated change.
    - Final closing commit `chore(phase-07): demo-path verified by user on fresh docker compose up` exists and is the most-recent commit.
    - User explicitly approves the narrative quality.
  </acceptance_criteria>
  <resume-signal>Type "approved" with a one-line note (e.g., "narrative clean, no amend candidates found"), or list specific commit hashes to amend + the corrective action.</resume-signal>
</task>

<task type="auto">
  <name>Task 3: Write `07-06-SUMMARY.md` and commit the phase-closing chore</name>
  <files>.planning/phases/07-ops-submission-polish/07-06-SUMMARY.md</files>
  <read_first>
    - .planning/phases/07-ops-submission-polish/07-01-SUMMARY.md (through 07-05 if all exist — gather slice summaries to roll up)
    - .planning/ROADMAP.md (`### Phase 7: Ops & Submission Polish` Success Criteria 1–4 — confirm each is checked off)
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (the original phase scope to retrospectively validate against)
  </read_first>
  <action>
    Create `.planning/phases/07-ops-submission-polish/07-06-SUMMARY.md`. Sections:

    **(1) Phase 7 closeout summary** — 2–3 sentences in English summarizing what shipped.

    **(2) OPS-01 deliverables checklist** — 5 bullets capturing the concrete values observed during Task 1:
      - 3 services healthy after `docker compose up --build` (paste `docker compose ps` snippet).
      - 3 demo users (sjuksköterska / apotekare / admin) login OK with `demo1234`.
      - 1 `vårdenhet` seeded (paste name).
      - ≥10 medications seeded (paste count).
      - ≥1 in-flight order seeded (paste order ID + status).

    **(3) Phase 7 ROADMAP SC checklist** — 4 bullets explicitly verifying each ROADMAP SC:
      - SC#1: `docker compose up` on clean clone brings up postgres + api + web with seed data → ✓ verified in Task 1, walltime `<observed>`, OPS-01 deliverables in section (2).
      - SC#2: README contains every brief-required section (purpose / stack rationale / run instructions / known gaps / "with more time" + §6 short answers) → ✓ list of section headings.
      - SC#3: `git log --oneline` reads as coherent narrative → ✓ verified in Task 2.
      - SC#4: Final mobile-first verification pass → ✓ Playwright script exits 0; 6 PNGs + 6×4 table in README.

    **(4) Slice roll-up** — one paragraph per slice (07-01 through 07-05) summarizing what landed. Pull from each slice's own SUMMARY.md if it exists.

    **(5) Deferred items lifted from Phase 7** — any items the user flagged during Task 1 or Task 2 that weren't fixed in-phase, with a one-line note + the bucket they live in under `## Med mer tid`.

    **(6) Demo-rundtur walltime + observations** — the actual walltime observed during Task 1's live walk + any UX glitches noted.

    **(7) Next action** — point to `/gsd:transition 7` for `PROJECT.md` Validated row appends + `STATE.md` updates.

    After writing the SUMMARY: stage it for commit. Final commit: `chore(phase-07): demo-path verified by user on fresh docker compose up` with the SUMMARY as the staged file. Mirror the Phase 6 closeout pattern.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. SUMMARY exists:
      test -f .planning/phases/07-ops-submission-polish/07-06-SUMMARY.md
      # 2. Mentions all 4 SCs:
      for sc in "SC#1" "SC#2" "SC#3" "SC#4"; do grep -F "$sc" .planning/phases/07-ops-submission-polish/07-06-SUMMARY.md >/dev/null || (echo "missing: $sc"; exit 1); done
      # 3. Mentions OPS-01 deliverables checklist:
      grep -F "OPS-01" .planning/phases/07-ops-submission-polish/07-06-SUMMARY.md
      # 4. Mentions all 5 prior slices:
      for slice in "07-01" "07-02" "07-03" "07-04" "07-05"; do grep -F "$slice" .planning/phases/07-ops-submission-polish/07-06-SUMMARY.md >/dev/null || (echo "missing slice: $slice"; exit 1); done
      # 5. Phase-closing commit landed:
      git log --oneline -5 | grep -E "chore\(phase-07\): demo-path verified"
      # 6. The closing commit IS the most-recent commit (no further work after):
      git log --oneline -1 | grep -E "chore\(phase-07\): demo-path verified"
    </automated>
  </verify>
  <done>
    `07-06-SUMMARY.md` exists with the 7 documented sections including the OPS-01 deliverables checklist with concrete observed values; `chore(phase-07): demo-path verified by user on fresh docker compose up` is the latest commit; all 4 ROADMAP SCs explicitly checked off in the SUMMARY.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Live demo walk → developer's machine | Walk executes against `localhost:5173` and `localhost:3000` (api + web running via docker compose). Same surface as the existing dev workflow. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-17 | All ASVS L1 categories | N/A | out-of-scope | No new code or doc edits in this slice — only human verification of work landed in slices 01–05. The threat surface was assessed in each prior plan's `<threat_model>`. |
</threat_model>

<verification>
- `07-06-SUMMARY.md` exists and references all 5 prior slice summaries.
- All 4 ROADMAP Phase 7 SCs are explicitly checked off in the SUMMARY with a verification source (Task 1 / Task 2 / a grep / a script exit code).
- OPS-01 deliverables (services + seed users + vårdenhet + medications + in-flight order) are concretely recorded in the SUMMARY with the values observed during Task 1's live walk.
- Phase 7's final commit matches the Phase 6 closeout pattern verbatim in shape (`chore(phase-07): demo-path verified by user on fresh docker compose up`).
- The user explicitly approved both human-verification gates with "approved" + a one-line note.
</verification>

<success_criteria>
- 1 file created: `07-06-SUMMARY.md`.
- 2 human-verification gates passed with "approved".
- OPS-01 deliverables explicitly verified during Task 1 and recorded in the SUMMARY.
- Phase-closing chore commit landed.
- Phase 7 is complete and ready for `/gsd:transition 7`.
</success_criteria>

<output>
After Task 3 completes, Phase 7 is ready for `/gsd:transition 7`, which handles `PROJECT.md ## Validated` row appends + `.planning/STATE.md` updates.
</output>
