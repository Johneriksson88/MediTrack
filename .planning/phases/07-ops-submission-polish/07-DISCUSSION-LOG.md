# Phase 7: Ops & Submission Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 7-ops-submission-polish
**Areas discussed:** README structure & section order, Stack rationale ("motivera dina val"), Unified §6 interview-discussion section, Mobile-first verification deliverable (SC#4) + bonus pnpm verify command

---

## Gray area selection

| Option | Description | Selected |
|--------|-------------|----------|
| README structure & section order | Brief §3.3/§4 demands specific top-level sections. Current README is 850 lines, append-only by phase, mixed Swedish/English. | ✓ |
| Stack rationale — "motivera dina val" | Brief explicitly grades stack justification; currently NOT a standalone section. | ✓ |
| Unified §6 interview-discussion section | Brief §6 asks four questions; currently scattered across Phase 5 audit + Phase 6 sections. | ✓ |
| Mobile-first verification deliverable (SC#4) | Final 360/768/1024/1440 px pass on every primary screen. | ✓ |

---

## README structure & section order

### Q1: README shape

| Option | Description | Selected |
|--------|-------------|----------|
| Lift to canonical top + keep deep dives at bottom | TOC → brief-aligned sections at top; `## Feature deep dives` container below `---` separator. | ✓ |
| Add brief sections inline, keep current order | Inserts new sections; preserves accumulated narrative but buries them. | |
| Collapse phase narratives into compact summaries | Aggressively trims Phase 5+6 deep dives. | |

**User's choice:** Lift to canonical top + keep deep dives at bottom.
**Notes:** D-121. The brief-aligned top is the reviewer's first ~200 lines; the deep dives stay for depth-on-demand.

### Q2: Language

| Option | Description | Selected |
|--------|-------------|----------|
| Swedish for ops + brief-required, English for engineering deep dives | Codify the current mix as deliberate. | |
| All Swedish | Translate Phase 5+6 deep dives to Swedish. | ✓ |
| All English | Translate the Swedish intro + ops sections. | |

**User's choice:** All Swedish.
**Notes:** D-122. Maximum-language-consistency is the stronger interview signal for a Swedish-language reviewer base. UI strings + technical names stay in original form in code-fences; only narrative prose is translated.

### Q3: Demo path

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — dedicated 5-minute tour section, in Swedish | New `## Demo-rundtur (5 minuter)` near top. | ✓ |
| Yes, but compact — bullet list, no section heading | Add a short bullet list inside Demo-konton. | |
| No — trust the reviewer to explore | Risk reviewer missing audit-loggen. | |

**User's choice:** Dedicated Swedish demo tour section.
**Notes:** Source material already drafted in `.planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md <specifics>` (English); translate + expand to include Phase 3/4 order flow.

### Q4: Stale Status + v2 consolidation

| Option | Description | Selected |
|--------|-------------|----------|
| Delete Status + consolidate v2 lists into one top-level "Med mer tid" | Bucketed by theme: Audit / AI / UX / Drift / Säkerhet. | ✓ |
| Update Status to "submission-ready" + leave per-feature v2 lists | Light touch; reviewer scans multiple lists. | |
| Delete Status + leave per-feature v2 lists | Light touch; misses top-level "with more time" answer. | |

**User's choice:** Delete Status + consolidate into one top-level `## Med mer tid`.
**Notes:** D-130. Phase 5 §v2 candidates (~25 bullets) + Phase 6 §v2 candidates (~7 bullets) + PROJECT.md deferrals all lift to the new top section.

---

## Stack rationale — "motivera dina val"

### Q1: Format

| Option | Description | Selected |
|--------|-------------|----------|
| Decision matrix table + prose for the 2–3 most consequential choices | Scannable AND defensible. | ✓ |
| Pure decision matrix table | Maximally scannable; loses depth signal. | |
| ADR-style numbered records | Industrial-strength; redundant with .planning/ decision logs. | |
| Pure prose narrative | Most readable single read; less scannable. | |

**User's choice:** Decision matrix + prose for top 3.
**Notes:** D-123. The brief explicitly grades stack justification heavily.

### Q2: Matrix scope

| Option | Description | Selected |
|--------|-------------|----------|
| Full 9-row matrix covering the stack end-to-end | Frontend / Backend / DB / ORM / Server-state / UI / Tests / Monorepo / Container. | ✓ |
| Trimmed 5-row matrix — only choices a reviewer would push back on | Tighter; risks looking incomplete. | |
| Full 9-row + an explicit 'avstått' row for things we deliberately did NOT add | 9 rows + follow-on K8s/MQ/microservices/GraphQL/Redis/SSE bullets. | |

**User's choice:** Full 9-row matrix.
**Notes:** D-123. The "avstått" content was instead promoted to its own subsection (see Q4 below) rather than a matrix row.

### Q3: Prose depth choices

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres+FOR UPDATE, Prisma $extends, named meditrack_app role | Three paragraphs, each tied to a §6 question. | ✓ |
| Same three but add Fastify + TanStack Query | Five blocks; dilutes signal. | |
| Just Postgres + Prisma | Two paragraphs; loses named-role story. | |

**User's choice:** The three interview-defining choices.
**Notes:** D-123. Each prose paragraph ties to a §6 question.

### Q4: Avstått subsection

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — short bullet list right after the matrix | 6–7 bullets: K8s, MQ, microservices, GraphQL, SSE, email, OAuth/SSO. | ✓ |
| Yes — prose paragraph, not a list | Less scannable; loses some signal. | |
| No — just the matrix and prose | Trust the matrix's "Alternativ övervägda" column. | |

**User's choice:** Short bullet list after the matrix.
**Notes:** D-123. Directly answers the brief's "lightweight bias — every added moving part must be motivated" constraint.

---

## Unified §6 interview-discussion section

### Q1: §6 placement

| Option | Description | Selected |
|--------|-------------|----------|
| One unified top-level section, deep dives stay distributed | Top section with 2–4 sentence elevator pitches; per-feature deep dives keep their §6 phrasings. | ✓ |
| Single top section, lift ALL §6 prose from per-feature deep dives | Cleanest top-down read; fragments feature narrative. | |
| Just a §6 index linking to per-feature anchors | Smallest edit; weakest standalone read. | |

**User's choice:** Unified top + distributed deep-dive supporting material.
**Notes:** D-124. Single canonical entry point + depth available on demand.

### Q2: §6 depth

| Option | Description | Selected |
|--------|-------------|----------|
| Tight elevator pitch + "Läs mer" anchor link to the deep dive | 2–4 sentences each, ending with [Läs mer]. | ✓ |
| Full mid-length answer with inline code citations | Self-contained at top; some duplication. | |
| One-sentence headline + bullet list of supporting points | Maximally scannable; reads as debate-prep card. | |

**User's choice:** Tight pitch + Läs mer anchor.
**Notes:** D-124. Reader gets a complete answer at the top; clicks through for receipts.

### Q3: §6 set

| Option | Description | Selected |
|--------|-------------|----------|
| The canonical 5 (brief's 4 + 'least proud of') | concurrency / scale / retrofitting / proudest / least-proud. | |
| Just the brief's literal 4 | Skip least-proud; loses honest-engineering signal. | |
| The 5 above + 2 likely follow-ups (cost / observability) | 7 total. | ✓ |

**User's choice:** 7 questions total (5 canonical + cost + observability).
**Notes:** D-125. Anticipates the probable follow-ups the brief doesn't list but a reviewer will likely ask. Each gets a specific, concrete answer (not hedged).

### Q4: Phase 5 deep-dive §6 treatment

| Option | Description | Selected |
|--------|-------------|----------|
| Keep, but trim to bullet-level supporting evidence | Convert prose to bullets citing tests + migrations + code paths. | ✓ |
| Keep verbatim | Reader sees pitch AND prose; some duplication. | |
| Remove from deep dive entirely | Single source of truth at top; loses in-context narrative. | |

**User's choice:** Trim to bullet-level supporting evidence.
**Notes:** D-124. Avoids duplication; preserves depth.

---

## Mobile-first verification deliverable (SC#4)

### Q1: Format

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: 360 px screenshot grid (6 screens) inline + verification table for full matrix | Show-and-tell at mobile, table for breadth. | ✓ |
| Full 6×4 = 24 screenshot grid in /docs/screenshots/ + linked from README | All 24 cells; heavy (~3–6 MB). | |
| Verification table only — manual checklist with sign-off | Lightest; weakest signal for UI-graded brief. | |
| Playwright automated check (visual regression-lite) | ~150–300 lines + Playwright dep + CI run. | |

**User's choice:** Hybrid (360 px screenshots + table).
**Notes:** D-126. Mobile-first is the brief-prescribed breakpoint.

### Q2: Capture method

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-captured via Chrome DevTools, stored in docs/screenshots/ | ~600 KB; process documented. | |
| Captured via a one-shot Playwright script kept in the repo | Reproducible; rerunnable; adds Playwright dep. | ✓ |
| Hand-captured, kept in /local (gitignored) | Lightest; reviewer can't see them. | |

**User's choice:** Playwright one-shot script.
**Notes:** D-127. Reviewer can re-run; one-shot script lives at `apps/web/scripts/captureSc04Screenshots.ts`.

### Q3: Verification table format

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown table: rows=screens, cols=breakpoints, cells=✓/✘ + brief note when notable | One-line footnotes for notable cells. | ✓ |
| Per-screen subsection with the 4 breakpoints listed | Less scannable; more narrative room. | |
| Just '✓ verified at 360/768/1024/1440 px on 2026-MM-DD' — no table | Trusts reviewer; weakest. | |

**User's choice:** Markdown table with footnotes.
**Notes:** D-126.

### Q4: Playwright script also asserts layout

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — assertions live in the same script; exit code is the verification signal | Adds ~30 lines; reviewer re-run = re-verify. | ✓ |
| Capture only — verification stays manual via the table | Looser; less defensible vs future regression. | |
| Both capture AND a separate `pnpm verify:layout` script | Two entry points; over-engineered. | |

**User's choice:** Same script asserts + captures.
**Notes:** D-127. `scrollWidth <= innerWidth` (no x-overflow) + primary-nav `[data-test="primary-nav"]` reachability at each viewport × each route. D-128 nails the selector contract.

---

## Bonus decision: root-level `pnpm verify`

| Option | Description | Selected |
|--------|-------------|----------|
| lint + typecheck + test — standard pre-merge sanity | ~3 min walltime. | |
| lint + typecheck + test + build — production-grade sanity | ~5–6 min walltime; catches build-time issues. | ✓ |
| lint + typecheck + test + build + SC#4 Playwright | ~7–10 min; needs running stack. | |
| No top-level verify — trust per-app scripts | Lightest; loses one-shot affordance. | |

**User's choice:** lint + typecheck + test + build.
**Notes:** D-129. Build IS included to catch broken type narrowing / dead exports that test alone doesn't surface. SC#4 Playwright is intentionally NOT chained (requires running stack).

---

## Claude's Discretion

- Exact Swedish phrasing of "Vad är du mest stolt över?" and "Vad är du minst stolt över?" answers (paraphrase existing English source material, keep engineering-honest tone).
- Matrix row order (recommended: stack layer top-down, Frontend → Container).
- PNG compression strategy (accept Playwright output unless total > 1 MB).
- Whether to capture 24 PNGs vs only 6 (recommended: only 6, table covers the rest).
- Bucket ordering in `## Med mer tid` (recommended: Audit & efterlevnad first).
- TOC at top of README (recommended: yes, GitHub auto-anchor).
- Plan-slice ordering (6 slices recommended in CONTEXT.md `<specifics>`).
- Verification of `[data-test="primary-nav"]` attribute existing on AppShell — add if missing.

## Deferred Ideas

- CI/CD wiring of `pnpm verify` into GitHub Actions
- E2E functional Playwright suite (vs Phase 7's layout-only SC#4 script)
- Per-user password rotation at first login
- Git-history retrospective rewrite (only if planner surfaces an embarrassing commit)
- PNG `pngquant` compression post-pass (only if 6 PNGs > 1 MB)
- Translating planning artifacts into Swedish
- `## Hur jag arbetade` process retrospective section
- `Kopiera filterlänk` label rename (Phase 5 LOW #15)
- `SECURITY DEFINER` audit-retention purge function
- Production secrets management
- Per-vårdenhet admin scope toggle
- Per-user rate-limit on `POST /api/ai/suggest-therapeutic-class`
