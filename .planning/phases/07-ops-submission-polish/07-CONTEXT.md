# Phase 7: Ops & Submission Polish - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

The final, non-feature phase. The codebase is functionally complete after Phase 6; Phase 7's job is to make the submission **read well to the reviewer in under one hour** — README, Docker Compose, screenshots, and the §6 interview talking-points all land in submission-quality. No new application logic ships. Every Phase 7 edit either (a) restructures or augments documentation, (b) verifies a brief-required deliverable, or (c) adds a one-shot verification harness the reviewer can run.

**In scope (Phase 7 only — REQ-IDs OPS-01, OPS-02, OPS-04):**

- **README restructure.** Lift to brief-aligned canonical top-level sections (TOC → Vad är det här? → Arkitekturval → Snabbstart → Demo-konton → Lokal utveckling → Tester → Demo-rundtur → Kända luckor → Med mer tid → §6-svar → Vad ligger var?). Move the per-feature Phase 5+6 deep dives into a single "Feature deep dives" container at the bottom. Delete the stale `## Status` section (it reads "Phase 1 — klar" mid-build but is noise at submission).
- **All Swedish.** Translate the existing English deep dives (Phase 5 audit ≈460 lines, Phase 6 AI/banner ≈280 lines) into idiomatic technical Swedish. UI vocabulary stays verbatim (e.g., `Hämta AI-förslag` is a literal UI string and is NOT re-translated). The trade-off is intentional: Swedish lands strongest for a Swedish-language brief, Swedish-language UI, and Swedish-speaking reviewers — and exposes the engineering depth across the language barrier rather than only at the top.
- **New `## Arkitekturval (motivera dina val)`** section, lifted under "Vad är det här?". 9-row decision matrix `(Val | Alternativ övervägda | Varför vi valde så | Följdeffekt)` covering frontend / backend / DB / ORM / server-state / UI-kit / tests / monorepo / container orchestration. After the matrix, three prose paragraphs of depth on the three interview-defining choices: (1) **Postgres + row-level FOR UPDATE locking** (the direct answer to §6 concurrency), (2) **Prisma `$extends` typed extensions** (the direct answer to §6 retrofitting auth — Phase 5 audit middleware retrofit), (3) **Named `meditrack_app` non-owner role split** (architectural append-only audit-log enforcement, not a runtime check). After the prose: a `### Vad vi medvetet avstått från` subsection — 6–7 bullets covering K8s / message queue / microservices / GraphQL federation / Real-time push (SSE/WebSocket) / Email infrastructure / OAuth+SSO — each one line explaining the no and the reconsider trigger.
- **New `## Demo-rundtur (5 minuter)`** section near the top, after Demo-konton. Numbered steps walking the reviewer through every demoable REQ in one ~5-minute path: logga in som sjuksköterska → lägg multi-radsbeställning → logga in som apotekare → bekräfta + leverera → dashboard-banner uppdateras → AI-förslag på ny medicin → logga in som admin → läs audit-loggen. Material exists pre-drafted in `.planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md` `<specifics>` (English) — translate to Swedish, expand to include Phase 3/4 order flow which Phase 6's draft skips.
- **New unified `## §6-svar (intervjudiskussion)`** section near the top, after Med mer tid. **Seven** Swedish sub-headings:
  1. `### Hur hanterar systemet att två sjuksköterskor beställer samtidigt?` (concurrency — Phase 4 FOR UPDATE + Phase 5 D-91 "the audit log doesn't lie")
  2. `### Hur skulle du skala upp till 50 vårdenheter?` (scaling — careUnit-first service signatures everywhere + cursor pagination + denormalized careUnitId on audit rows + cross-tenant admin exception)
  3. `### Hur skulle du eftermontera autentisering?` (retrofitting — Phase 5 `$extends` did exactly this pattern for audit; the same pattern handles per-row authz)
  4. `### Vad är du mest stolt över?` (proudest — Postgres-enforced append-only + per-concern ALS refactor)
  5. `### Vad är du minst stolt över?` (least-proud — `$queryRaw` audit gap; closed via CI grep but the underlying limitation remains; NPL backfill skipped at seed)
  6. `### Vad kostar systemet att köra?` (cost — Postgres + 3 lightweight container services; AI is ~$0.0001 per `claude-haiku-4-5` tool_use call at the volumes a vårdenhet generates; no Redis, no SSE infra, no message queue)
  7. `### Hur skulle du övervaka det i produktion?` (observability — today: audit log (security observability) + structured Fastify logs to stdout; production would add: OpenTelemetry collector, log shipper to Loki/Splunk, metrics exporter (Prometheus), per-tenant SLO dashboards. We deliberately did NOT add these for a 1-week build.)
  Each top-level answer is 2–4 sentences (the elevator pitch) ending with `[Läs mer: §<Feature deep dive>](#anchor)` pointing into the lower-page deep dives.
- **Trim the Phase 5 audit-log deep dive's existing inline `### §6 interview-ready phrasings`** subsection (~5 paragraphs of English prose) into compact Swedish bullets citing tests + migrations + code paths (e.g., `Audit-loggen ljuger inte: integrationstest #2 framtvingar rollback inuti $transaction, verifierar noll audit_events-rader`). The top-level §6 elevator pitch points here via `[Läs mer]`.
- **Consolidated `## Med mer tid`** section near the top, lifting Phase 5 §v2 candidates (~25 bullets) + Phase 6 §v2 candidates (~7 bullets) + scattered PROJECT.md deferrals + this phase's deferred ideas into ONE prioritized list bucketed by theme: **Audit & efterlevnad** / **AI & klassificering** / **UX-polish** / **Drift & skalning** / **Säkerhet**. Per-feature deep dives drop their inline `## v2 candidates` lists and link to this top section.
- **Consolidated `## Kända luckor`** section near the top — honest, short. Specific items, not vague:
  - `pnpm verify` is not wired into CI yet (no GitHub Actions workflow in repo).
  - 43 538 NPL-läkemedel saknar `therapeuticClass` på fresh seed (D-115 documented trade-off).
  - `$queryRaw` write-path inte avlyssnat av audit-middleware (no occurrences today; CI grep is the guard — Test 15 in `apps/api/test/audit.integration.test.ts`).
  - Lösenord rotas inte vid första inlogg (demo-värde `demo1234` hårdkodat i seed).
  - Ingen E2E-svit (Playwright används endast för SC#4 layoutverifiering, inte funktionell flöde) — integration tests against Fastify `app.inject` cover the API surface.
- **New `apps/web/scripts/captureSc04Screenshots.ts`** — Playwright-driven one-shot script. Spins up Postgres+api+web (assumes `docker compose up` is running; documented), logs in as admin, navigates to each of six primary routes (`/login` first as anonymous, then `/lakemedel` / `/bestallningar/ny` / `/bestallningar` / `/admin/audit` / `/dashboard`) at viewport `360 × 800`. For each route: capture `docs/screenshots/sc04-360-<slug>.png` (PNG-8, ≤ 100 KB target via `image/png` lossy compression off — accept whatever Playwright emits; manual squeeze with `pngquant` if budget violated). Also asserts `document.documentElement.scrollWidth <= window.innerWidth` (no x-overflow) and primary nav anchor is reachable (`document.querySelector('[data-test="primary-nav"]')` visible) at viewport 360/768/1024/1440 per route. Exit 0 ⇒ SC#4 mechanically verified. Exit non-zero ⇒ verification failed; reviewer can re-run.
  - Dependency: `@playwright/test` added to `apps/web` `devDependencies` (one new dep). Browser binaries downloaded once via `pnpm exec playwright install chromium` (documented in README under Tester).
  - README inlines the 6 × 360 px screenshots via markdown `![](docs/screenshots/sc04-360-<slug>.png)` with explicit `width="240"` thumbnails inside the `## Mobil-först verifiering` section.
  - Verification table: 6 rows (Login / Katalog / Beställningsskapande / Beställningshistorik / Audit / Dashboard) × 4 cols (360 / 768 / 1024 / 1440), cells are `✓` or `✓¹` (with footnote when notable — e.g., "kort-layout växlar till tabell vid md", "filterlist scrollar horisontellt vid 360"). Legend below the table: capture date + the exact command `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts`.
- **New root-level `pnpm verify`** script in `package.json`. Runs `pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm -r build` in that order. Per-workspace `typecheck` script needs adding where it's missing (`apps/api`, `apps/web`, `packages/shared`) — `tsc --noEmit -p <tsconfig>`. README under `## Tester` documents the command + the ~5–6 minute walltime expectation. NOT included: SC#4 Playwright (requires running stack; documented as a separate command).
- **Stack rationale matrix sources** (the planner will need these to fill the 9-row matrix authoritatively):
  - Frontend (TS+React) — PROJECT.md Key Decisions row 1; brief §3.1.
  - Backend (Fastify) — PROJECT.md Key Decisions row 2; phase 1 D-04 in `.planning/phases/01-foundation-auth/01-CONTEXT.md`.
  - DB (Postgres) — PROJECT.md Constraints; the §6 concurrency answer.
  - ORM (Prisma) — PROJECT.md Constraints; D-90 / D-91 / D-93 in phase 5.
  - Server-state (TanStack Query) — phase 1 D-09 / D-69 phase 3.
  - UI kit (shadcn/ui) — phase 1 D-10; matches brief §3.2 mobile-first requirement.
  - Tests (Vitest) — PROJECT.md Key Decisions row 5; brief §3.1 minimum requirement.
  - Monorepo (pnpm workspaces) — phase 1 D-03; minimal config.
  - Container (Docker Compose) — PROJECT.md Constraints; brief §3.3 golden command.
- **README §Tester additions**: document `pnpm verify` (~5–6 min walltime); document `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts` for SC#4 layout check (requires `docker compose up` running); document `pnpm exec playwright install chromium` first-time setup.
- **PROJECT.md `## Validated`** appends Phase 7 row(s): OPS-01 + OPS-02 + OPS-04 each move from Active to Validated with a one-line phase reference. This is mechanical and gets done in the phase-end `/gsd:transition` step, not in the implementation plans.
- **Final demo-path smoke** is the human verification gate — Phase 7 ends with a clean-machine `docker compose up --build` walk of the new Demo-rundtur section, mirroring the Phase 6 closeout pattern (`chore(06): phase 6 demo-path verified`).

**Out of scope (other phases / v2):**

- **New application features.** Phase 7 ships zero new API endpoints, zero new pages, zero new data-model changes.
- **CI/CD pipeline.** Wiring `pnpm verify` into GitHub Actions is in `## Kända luckor`. v2.
- **End-to-end functional Playwright suite.** The SC#4 script is layout-only (screenshot + scrollWidth + nav-reachability). Functional E2E flows are in `## Med mer tid`. v2.
- **Translating the planning artifacts (`.planning/**/*.md`)** into Swedish. Those are internal artifacts; only README + commit messages + UI need to be reviewer-facing Swedish.
- **Re-translating UI strings.** The Swedish UI vocabulary is locked from Phase 1+ — `Utkast / Skickad / Bekräftad / Levererad`, `Hämta AI-förslag`, etc. Phase 7 does NOT re-touch these.
- **Production secrets management** (Docker secrets, HashiCorp Vault, AWS Secrets Manager). README already documents the demo-value caveat in §Demo-konton. v2.
- **Performance tuning / load testing.** No `wrk` / `k6` scripts. The §6 cost + observability answers acknowledge the gap honestly.
- **Git-history retrospective rewrite.** SC#3 says "no wip or fix typo". We've been disciplined throughout — no rewrite pass; if `git log --oneline` surfaces any embarrassing commit during the planner's read, that's a localized `git commit --amend` candidate noted then, not a phase-wide rebase.
- **Seed enrichment beyond Phase 4's `seedDemoOrders`** — 4 orders × 4 statuses already satisfies OPS-01's "at least one in-flight order". No more.
- **Removing `apps/api/src/services/aiCategorization.service.ts` SDK dep when `ANTHROPIC_API_KEY` is absent.** The Phase 6 graceful-degradation behavior is locked.

</domain>

<decisions>
## Implementation Decisions

### README structure & language

- **D-121:** **Lift to brief-aligned canonical top-level sections; keep Phase 5+6 deep dives at the bottom inside a `## Feature deep dives` container.** Top of file is the brief-grade reviewer experience: TOC → Vad är det här? → Arkitekturval → Snabbstart → Demo-konton → Lokal utveckling → Tester → Demo-rundtur (5 minuter) → Kända luckor → Med mer tid → §6-svar (intervjudiskussion) → Vad ligger var?. Below the `---` separator: `## Feature deep dives` → Audit log (Phase 5) → AI Categorization (Phase 6) → Dashboard low-stock banner (Phase 6) → Error envelope additions (Phase 6) → Environment variables. The reviewer can answer every brief-required question from the top 200 lines; the deep details remain for the curious. Append-only growth was the right pattern during build; submission is the moment to pay the restructure cost. The two alternatives — leaving phase narratives in their accumulated order with inline brief-required sections, OR aggressively trimming deep dives to ~80-line summaries — were rejected: the first buries the brief sections under 850 lines and undersells the architecture; the second loses the interview material the user expects to reference live.

- **D-122:** **All Swedish.** Translate the Phase 5 audit (~460 lines) + Phase 6 AI/banner (~280 lines) + error envelope + env var deep dives into idiomatic technical Swedish. The Swedish-UI-vocabulary lock from Phase 1+ stays — UI strings (`Hämta AI-förslag`, `Utkast / Skickad / Bekräftad / Levererad`, status pills, button labels) are quoted verbatim in code-fences. Technical names not in common Swedish use (`AsyncLocalStorage`, `$extends`, `tool_use`, SQLSTATE codes, file paths) stay in English in code-fences. Variable names + log strings + error codes are NOT translated. The mix-as-deliberate alternative was rejected: maximum-language-consistency is the stronger interview signal for a Swedish-language reviewer base; the cost (~one focused day of translation work) is acceptable in a polish phase whose entire job is reviewer optics. Document the convention in a one-paragraph note near the TOC: "README är på svenska. UI-strängar citeras ordagrant; tekniska egennamn (AsyncLocalStorage, `$extends`, ...) lämnas i ursprungsform inom kodfont."

### Arkitekturval (motivera dina val)

- **D-123:** **Decision-matrix table + prose for three interview-defining choices + `Vad vi medvetet avstått från` subsection.** Section layout (top-of-file, immediately after "Vad är det här?"):
  1. **Matrix** — 9 rows × 4 columns `(Val | Alternativ övervägda | Varför vi valde så | Följdeffekt)`. One row per: Frontend / Backend / Database / ORM / Server-state / UI-kit / Tester / Monorepo / Container-orchestrering. Each row is exactly one line. Scannable; comparable.
  2. **Prose paragraphs** — three paragraphs (~150 words each):
     - `### Postgres + row-level FOR UPDATE` — directly ties to the §6 concurrency question. References the Phase 4 D-79 CUM-batch lock + the `apps/api/test/orders.deliver.integration.test.ts` `pg_locks` proof.
     - `### Prisma $extends typed extensions` — directly ties to the §6 retrofitting-auth question. Phase 5's audit middleware retrofitted onto Phase 2/3/4 code without touching any service file (D-83); the same pattern handles per-row authz.
     - `### Named `meditrack_app` non-owner role` — the architectural append-only guarantee. References migration 0010, the `DATABASE_URL`/`DIRECT_URL` split, the BEFORE-trigger from migration 0008, and integration test #4.
  3. **`### Vad vi medvetet avstått från`** — bullet list, 6–7 entries: Kubernetes, message queue (Redis/RabbitMQ), microservices, GraphQL federation, Real-time push (SSE/WebSocket), Email-infrastruktur, OAuth/SSO. Each one line: `<thing> — varför nej (link), när vi skulle ompröva`.

  ADR-style numbered records were rejected as redundant with the `.planning/phases/0X-CONTEXT.md` decision logs we already have; pure prose was rejected as un-scannable; pure-matrix-no-prose was rejected because it strips the depth signal the brief explicitly grades. Decision matrix + targeted prose hits both scannability and defensibility.

### §6 interview-discussion section

- **D-124:** **One unified top-level `## §6-svar (intervjudiskussion)` section near the top; per-feature deep-dive §6 subsections kept but trimmed to compact bullet-level supporting evidence.** Seven Swedish sub-headings in the top section (the brief's canonical 4 + `Vad är du mest stolt över?` + two anticipated follow-ups: `Vad kostar systemet att köra?` and `Hur skulle du övervaka det i produktion?`). Each answer is 2–4 sentences — the elevator pitch — ending with `[Läs mer: §<Feature deep dive>](#anchor)` pointing into the lower-page material. The Phase 5 audit-log deep dive's existing `### §6 interview-ready phrasings` subsection is **kept but converted from prose to bullet-level supporting evidence** referencing tests + migrations + code paths (e.g., `Audit-loggen ljuger inte — integrationstest #2 framtvingar rollback inuti $transaction, verifierar noll audit_events-rader (D-91)`). Phase 6 deep dives also gain compact §6 supporting bullets where today the prose lives in `06-CONTEXT.md` `<specifics>`. Result: single canonical entry point at top, depth available on demand, no prose duplication between top and deep dives.

- **D-125:** **The two anticipated follow-ups (cost + observability) get specific, honest answers — not hedged.** Cost answer cites the actual stack: one Postgres container, two Node containers, no Redis, no message queue, no SSE; AI cost is `~$0.0001 per claude-haiku-4-5 tool_use call`, manual on-demand only, no batch backfill. Observability answer is honest about what we have (audit log = security observability, structured Fastify logs to stdout) and what production would add (OTel collector, log shipper to Loki/Splunk, Prometheus exporter, per-tenant SLO dashboards). Naming concrete tools we'd reach for, NOT vague gestures, is the difference between an interview-ready answer and a hand-wave.

### Mobile-first verification (SC#4)

- **D-126:** **Hybrid deliverable: 6 × 360 px screenshots inlined in README + 6×4 verification table with footnotes.** The 360 px screenshots are the visual "show, don't tell" because mobile is the brief's most-prescribed breakpoint ("mobil-först"). The full 4-breakpoint matrix is covered by the markdown verification table — six rows (Login, Katalog, Beställningsskapande, Beställningshistorik, Audit, Dashboard) × four columns (360, 768, 1024, 1440), cells are `✓` or `✓¹` with one-line footnotes when notable (layout switch, horizontal-scroll filter strip, etc.). PNGs stored under `docs/screenshots/sc04-360-<slug>.png`, inlined via markdown image tags with `width="240"` for thumbnail rendering. Approximate repo footprint: ~600 KB for 6 PNGs. Full 24-cell screenshot grid was rejected as too heavy for the repo and dilutes the mobile-first signal; table-only was rejected as the weakest verifiable signal for a UI/UX-graded brief.

- **D-127:** **Playwright one-shot script captures screenshots AND asserts `scrollWidth <= innerWidth` + primary-nav reachability across all 24 cells.** File: `apps/web/scripts/captureSc04Screenshots.ts`. Drives headless Chromium. Logs in as `admin@example.test` (the role that can see every route — Login is captured anonymous, before login). Iterates `[360, 768, 1024, 1440] × ['/login', '/lakemedel', '/bestallningar/ny', '/bestallningar', '/admin/audit', '/dashboard']`. For each cell: asserts no horizontal overflow + nav reachability. For the 6 × 360 cells: also captures PNG to `docs/screenshots/sc04-360-<slug>.png`. Exit 0 = SC#4 mechanically verified. Reviewer (or future me) can re-run via `pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts`. Adds `@playwright/test` as a dev-dep; `pnpm exec playwright install chromium` is a documented first-time step. Capture-only (no assertions) was rejected as a missed opportunity — a 30-line addition turns the script from a screenshot tool into a verification harness with an exit code that closes the loop between "we say it works" and "CI can say it works". Hand-screenshots in `/local` (gitignored) was rejected because a reviewer cloning the repo wouldn't see them.

- **D-128:** **The primary-nav reachability assertion targets `[data-test="primary-nav"]`** — the planner / executor needs to verify this attribute exists on the relevant `AppShell` nav element (`apps/web/src/routes/shell/AppShell.tsx`) and add it if missing. If the attribute is missing the script needs to fail loudly with a clear diagnostic (NOT silently pass), so a future nav refactor that drops the attribute is caught.

### Root verification command

- **D-129:** **`pnpm verify` runs lint + typecheck + test + build, in that order.** Root `package.json` `scripts.verify` is `pnpm -r lint && pnpm -r typecheck && pnpm -r test && pnpm -r build`. Per-workspace `typecheck` script is `tsc --noEmit -p <tsconfig>` — needs adding to any workspace missing it (`apps/api`, `apps/web`, `packages/shared` — to verify in planning). Build IS included (despite slowing the walltime to ~5–6 min) because Phase 5+6 added new files that the existing `pnpm test` may not exercise — broken type narrowing or dead exports surface at build time but not at test time. SC#4 Playwright is intentionally NOT chained into `pnpm verify` because it requires the api+web stack running locally — that's a separate concern with its own documented command. README under `## Tester` documents both commands, the walltime expectations, and the prerequisite for SC#4 (stack running).

### Stale content cleanup

- **D-130:** **Delete the `## Status` section entirely; consolidate v2 lists into one prioritized `## Med mer tid`.** The Status section ("Phase 1 — klar. Phases 2–7 är planerade men inte implementerade ännu") was useful during build; at submission it's stale noise (it doesn't reflect 6/7 phases complete). Delete. The Phase 5 `### v2 candidates` (~25 bullets), Phase 6 `## Phase 6 v2 candidates` (~7 bullets), scattered PROJECT.md deferrals, and this phase's `<deferred>` ideas are lifted into ONE top-level `## Med mer tid` section, bucketed by theme: **Audit & efterlevnad** / **AI & klassificering** / **UX-polish** / **Drift & skalning** / **Säkerhet**. Per-feature deep dives drop their inline v2 lists, link to the top. Reviewer's "what would you do with more time" answer is one click away; per-feature context remains for the curious.

- **D-131:** **`## Kända luckor` is honest and specific, not vague.** Five bullets minimum: (1) `pnpm verify` not yet wired into CI (no GitHub Actions workflow), (2) 43 538 NPL-läkemedel saknar `therapeuticClass` på fresh seed (D-115), (3) `$queryRaw` write-path inte avlyssnat av audit-middleware (no occurrences today; CI grep is the guard), (4) demo-lösenord `demo1234` hårdkodat i seed (no per-user rotation at first login), (5) ingen functional E2E-svit (Playwright används endast för SC#4 layout). Each bullet 1–2 sentences. Soft-gloss alternatives were rejected: the brief explicitly says reviewers prefer "ett välmotiverat halvfärdigt arbete framför ett okommenterat färdigt", and the honest gap inventory IS the most-valued kind of honesty.

### Claude's Discretion

- **Exact Swedish phrasing of `### Vad är du mest stolt över?` and `### Vad är du minst stolt över?` answers** — paraphrase the existing English material in `README.md ## Audit log ### §6 interview-ready phrasings` (Phase 5 lines 437–470) and the §6 specifics in `.planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md <specifics>`. Keep the engineering-honest tone; don't soften the limitations.
- **Order of rows in the 9-row matrix** — recommend top-down by stack layer: Frontend → Backend → Database → ORM → Server-state → UI-kit → Tester → Monorepo → Container. Reader's mental model is "from where the user clicks down to the runtime".
- **PNG compression strategy** — accept whatever Playwright emits (typically ~80–150 KB at 360×800 full-page) without a `pngquant` post-pass UNLESS the 6 PNGs total > 1 MB; if they do, run `pngquant --quality=70-90 docs/screenshots/*.png --ext .png --force` once.
- **Whether the screenshot script also pushes assertions for `768 / 1024 / 1440` PNGs** — recommend NO. The verification table covers those textually; storing 24 PNGs balloons the repo. Mobile is the brief-prescribed screenshot.
- **Bucket ordering in `## Med mer tid`** — recommend `Audit & efterlevnad` first (the audit story is the most interview-defensible), `AI & klassificering` second, `Drift & skalning` third, `UX-polish` fourth, `Säkerhet` last. Order tells the reader what we'd reach for next.
- **Whether to add a TOC at the top of README** — recommend YES, GitHub-flavored markdown auto-anchor-link list, ~10 lines. Helps the reviewer skim. Renders as a clickable list on GitHub.
- **Phase 7 plan-slice ordering** — recommend (1) README restructure + Swedish translation + consolidated sections (largest, blocks everything else); (2) Arkitekturval matrix + prose + avstått (depends on top-level structure being in place); (3) `pnpm verify` script + per-workspace typecheck scripts (independent, can land in parallel with 1+2); (4) SC#4 Playwright script + screenshots + verification table + README inline (depends on 1 for the section placement); (5) final demo-path human gate + PROJECT.md ## Validated row updates. Each slice ends with its own commit chain that's independently demoable to the reviewer reading `git log --oneline`.
- **Whether to add `apps/web/scripts/` to `.gitignore` carve-outs** — only the new script file lives there; if no existing scripts/ directory exists, create it cleanly. Verify in planning.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 7 framing & scope (the brief and roadmap)

- `.planning/PROJECT.md` — Locked stack + Key Decisions table + Constraints (lightweight bias, Swedish-domain-vocabulary, audit+concurrency+multi-tenancy non-negotiable, Docker Compose as golden command). The Arkitekturval matrix sources rows from here. The `## Out of Scope` section is the canonical reference for the `### Vad vi medvetet avstått från` bullet list.
- `.planning/REQUIREMENTS.md` §"Ops / Deliverables" (OPS-01, OPS-02, OPS-04) — the reviewable acceptance language. OPS-02 verbatim: "README.md includes — project purpose, stack rationale per the brief's 'motivera dina val', run instructions, known gaps, 'with more time' section, brief notes on the §6 questions (concurrency / scaling / auth retrofitting)". The structural plan in `<domain>` above maps 1:1 to that wording.
- `.planning/ROADMAP.md` §"Phase 7" — Goal + 4 Success Criteria + Mode (mvp) + Requirements list. SC#4 wording "Final mobile-first verification pass: the four required breakpoints render correctly on every primary screen (login, catalog, order create, order history, audit, dashboard)" defines the SC#4 deliverable. The 6 primary screens listed there are authoritative.
- `local/intervju-testcase-1-1-.pdf` (Swedish brief — local only, NOT in CI) §3.3 "ett plus" for Docker Compose, §4 README deliverable list, §5 evaluation rubric (code quality + architecture ★★★★★ / API+data ★★★★ / system design ★★★★ / UI/UX ★★★ / README ★★★), §6 the four interview questions, §1 Medovia "AI-first" framing. The Phase 7 README deliverables map directly to §4. The §6-svar section maps directly to §6.

### Phase 1–6 decisions inherited (carry forward, do NOT re-decide)

- `.planning/phases/01-foundation-auth/01-CONTEXT.md` D-01..D-19 — **all locked**. The Arkitekturval matrix sources rows from Phase 1 decisions: D-03 (pnpm workspaces monorepo), D-04 (Fastify), D-08 (Zod-shared contracts), D-09 (TanStack Query), D-10 (Tailwind + shadcn). The Demo-konton README section is already in place from Phase 1 and is correct — no edits.
- `.planning/phases/02-medication-catalog/02-CONTEXT.md` D-20..D-45 — **all locked**. D-32 (NPL field-locking) and D-44 (`$queryRaw` low-stock predicate) are referenced in the §6 retrofitting answer's deep dive.
- `.planning/phases/03-draft-orders/03-CONTEXT.md` D-46..D-73 — **all locked**. D-65 (file-per-endpoint) is referenced in Arkitekturval prose under Backend (Fastify). D-69 (TanStack key conventions) referenced in Server-state prose.
- `.planning/phases/04-confirm-deliver-stock/04-CONTEXT.md` D-74..D-89 — **all locked**. D-79 (CUM-batch FOR UPDATE lock) is the **canonical reference for the §6 concurrency answer** and the Postgres prose paragraph. The Phase 4 concurrency test (`apps/api/test/orders.deliver.integration.test.ts`) is cited verbatim by name.
- `.planning/phases/05-audit-log/05-CONTEXT.md` D-90..D-105 — **all locked**. D-91 ("the audit log doesn't lie"), D-93 (audited operations), D-98 (REVOKE + BEFORE-trigger architecture), and D-101 (audit retention forever, v2 candidate) are all referenced in the §6-svar section's audit-related answers. The Phase 5 deep dive in README is the source for the audit prose paragraph in Arkitekturval (`### Named `meditrack_app` non-owner role`).
- `.planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md` D-106..D-120 — **all locked**. The pre-drafted demo path in `<specifics>` (English) is the source material for the Swedish `## Demo-rundtur (5 minuter)` section — translate and expand to include the Phase 3/4 order-flow steps Phase 6's draft skips. Phase 6 §v2 candidates feed into the consolidated `## Med mer tid` bucket "AI & klassificering".

### Existing README current state (Phase 7 EDITS this file)

- `README.md` — 851 lines, mixed Swedish (intro+ops, lines 1–122) + English (Phase 5 audit, lines 123–581; Phase 6 AI+banner+error+env, lines 582–842; closing `## Vad ligger var?`, lines 843–851). Section headings extracted by grep:
  ```
  Vad är det här? (3)
  Snabbstart med Docker Compose (14)
  Demo-konton (55)
  Lokal utveckling utan Docker (70)
  Tester (98)
  Status (113)            ← stale, DELETE
  Audit log (123)         ← English; translate + restructure
  AI Categorization (582) ← English; translate + restructure
  Dashboard low-stock banner (715) ← English; translate
  Error envelope additions (Phase 6) (777) ← English; translate
  Environment variables (Phase 6 additions) (794) ← English; translate
  Phase 6 v2 candidates (807)  ← lift to top-level Med mer tid
  Vad ligger var? (843)
  ```
- `docker-compose.yml` — Already correctly configured for the golden command. No Phase 7 edits expected unless `.env.example` gains a new variable.
- `.env.example` — Phase 6-current. No Phase 7 additions expected.

### Existing code referenced by Phase 7 deliverables (read-only — no edits needed)

- `apps/web/src/routes/shell/AppShell.tsx` — Verify `[data-test="primary-nav"]` attribute exists on the nav element; ADD if missing (smallest possible edit). The SC#4 script targets this selector.
- `apps/web/src/routes/{login, dashboard, lakemedel, bestallningar, admin}` — The six primary routes the SC#4 script visits. Read-only references; no edits.
- `apps/api/test/orders.deliver.integration.test.ts` — Cited by name in the Arkitekturval Postgres prose paragraph + the §6 concurrency answer. Read-only.
- `apps/api/test/audit.integration.test.ts` Tests 2, 3, 4, 15 — Cited by name in the §6 audit + proudest answers. Read-only.
- `apps/api/prisma/migrations/0008_*/migration.sql` + `0010_*/migration.sql` — Cited by name in the Arkitekturval named-role prose paragraph. Read-only.
- `apps/api/src/db/auditExtension.ts` — Cited by name in the `$extends` retrofit prose. Read-only.
- `apps/api/src/services/order.service.ts` — Reference for the `withActionOverride('order.deliver')` + tx.$queryRaw FOR UPDATE pattern. Read-only.

### Tooling / harness

- `CLAUDE.md` — Tooling rules, GSD workflow expectations, stack constraints, language conventions. The "Mandatory feature scope", "Constraints that shape decisions", and "Interview questions to design for" sections are the brief-verbatim source.
- `.planning/STATE.md` — Current phase progress (Phase 6 complete, ready_to_plan for Phase 7). Phase 7's git_commit step updates this.
- `.planning/config.json` — Workflow toggles (sequential, plan-check on, verifier on, per-phase research disabled). No Phase 7 changes to config.

### External docs (consult only if a planner needs them — likely unnecessary)

- WHO ATC classification (whocc.no/atc_ddd_index) — Phase 6 reference, NOT a Phase 7 concern.
- Anthropic Messages API + tool_use — Phase 6 reference, NOT a Phase 7 concern.
- Playwright API — `https://playwright.dev/docs/api/class-page` for `page.setViewportSize`, `page.screenshot({fullPage: true})`, and `page.evaluate(() => document.documentElement.scrollWidth)`. Used by the SC#4 script.
- pnpm workspace docs — `https://pnpm.io/recursive` for `-r --filter` semantics, used by `pnpm verify`.

No external SPEC.md exists for Phase 7 — implementation decisions captured above (D-121..D-131) are the canonical record.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Phase 7 is the polish phase — the codebase is functionally complete. The "assets" Phase 7 reuses are mostly **documentation source material** that gets restructured + translated, plus a small number of cited code paths.

- **`README.md` lines 123–841** (current Phase 5+6 English deep dives) — Translation source material for the Swedish deep dives at the bottom of the restructured README. The structural reorganization moves these blocks below a `---` separator into a `## Feature deep dives` container; the translation is paragraph-by-paragraph.
- **`README.md` lines 437–470** (Phase 5 `### §6 interview-ready phrasings`) — Source material for four of the seven top-level §6 answers (concurrency, scale, retrofitting, proudest). Phase 7 translates + tightens to elevator-pitch length; the deep-dive subsection survives as bullet-level supporting evidence.
- **`.planning/phases/06-ai-categorization-low-stock-notifications/06-CONTEXT.md` `<specifics>`** — Source material for the `## Demo-rundtur (5 minuter)` section. Phase 6 drafted the AI + banner part of the demo path in English; Phase 7 translates to Swedish + expands to include the Phase 3/4 order-flow steps the Phase 6 draft skipped (login → ny beställning → multi-line → submit → confirm → deliver) BEFORE the banner-refreshes step.
- **`apps/api/test/orders.deliver.integration.test.ts`** — Cited by name in the Arkitekturval Postgres prose paragraph AND in the §6 concurrency answer. NO test edits in Phase 7; the file is read-only reference material.
- **`apps/api/test/audit.integration.test.ts` Tests 2, 3, 4, 15** — Cited by name in the §6 audit + proudest answers. Read-only reference material.
- **`docker-compose.yml`** — Already correct from Phase 1+5+6. No Phase 7 edits.
- **`apps/api/prisma/seed.ts` `seedDemoOrders`** — Already satisfies OPS-01's "at least one in-flight order" requirement (one order per status = 4 orders). No Phase 7 edits.

### Established Patterns (Phase 1..6 → Phase 7 inheritance)

- **Atomic-commit narrative** (PROJECT.md "Git history is graded"). Phase 7 ships in 4–5 narratively-grouped commit chains, each its own slice end-to-end. `git log --oneline` after Phase 7 reads like a coherent doc-restructure story (NOT one giant `docs: README rewrite` commit).
- **Swedish UI vocabulary verbatim** (PROJECT.md Constraints). Phase 7 quotes existing UI strings in code-fences; does NOT re-translate them.
- **Brief's lightweight bias** (PROJECT.md Constraints). `## Arkitekturval ### Vad vi medvetet avstått från` is the literal manifestation of "every added moving part must be motivated in the README" — listing the parts we deliberately DIDN'T add IS the motivation.
- **Brief reviewer reads commits** (PROJECT.md). Phase 7's commit messages stay conventional-commits + atomic. Doc-only commits use `docs(07): …` scope.
- **GSD per-plan SUMMARY.md** (from prior phases). Each Phase 7 plan ends with a SUMMARY.md the planner can reference; commit closing each slice.

### Integration Points

- **No new runtime integration points.** Phase 7 ships no new API endpoints, no new pages, no new env vars.
- **One new dev-dep**: `@playwright/test` in `apps/web` devDependencies. Documented in README under Tester (first-time-setup `pnpm exec playwright install chromium`). Browser binaries are ~150 MB on the developer's machine; NOT committed.
- **Six new files committed**: `apps/web/scripts/captureSc04Screenshots.ts`, `docs/screenshots/sc04-360-login.png`, `docs/screenshots/sc04-360-katalog.png`, `docs/screenshots/sc04-360-bestallningsskapande.png`, `docs/screenshots/sc04-360-bestallningshistorik.png`, `docs/screenshots/sc04-360-audit.png`, `docs/screenshots/sc04-360-dashboard.png`. Approximate repo footprint addition: ~700 KB (script + 6 PNGs).
- **One root-level edit**: `package.json` gains `scripts.verify`. Per-workspace `package.json` files may gain `scripts.typecheck` where missing.
- **One small AppShell edit**: add `data-test="primary-nav"` attribute if missing — minimum-surface-change.

</code_context>

<specifics>
## Specific Ideas

### Swedish-language conventions (locked for Phase 7)

- README is in Swedish. UI-strängar citeras ordagrant i kodfont (`Utkast / Skickad / Bekräftad / Levererad`, `Hämta AI-förslag`, `Slutgiltig klass`, `Använd förslag`, `Förslag:`, `Hög säkerhet / Medel säkerhet / Låg säkerhet`). Tekniska egennamn lämnas i ursprungsform inom kodfont: `AsyncLocalStorage`, `$extends`, `tool_use`, `claude-haiku-4-5`, `pg_locks`, `SQLSTATE 42501`, `meditrack_app`, `pg_trgm`, `FOR UPDATE`, `$queryRaw`, `$executeRaw`, `RBAC`, `JSON`, `HTTP 409`, `HTTP 503`, `HTTP 504`.
- Filsökvägar lämnas i ursprungsform (`apps/api/src/services/audit.service.ts`).
- Variabel- och funktionsnamn lämnas i ursprungsform (`requirePermission`, `useAuth`, `withActionOverride`, `careUnitId`).
- Felkoder lämnas i ursprungsform (`ai_unavailable`, `ai_timeout`, `order_locked`, `rate_limited`).
- Migration-namn lämnas i ursprungsform (`0008_audit_events_revoke_grants`, `0010_audit_events_named_app_role`).
- Test-namn lämnas i ursprungsform (`integration test #2`, `Test 15`, `audit.integration.test.ts`).
- Roller stavas på svenska (apotekare / sjuksköterska / admin) i prosa men i ursprungsform i kodfont (`role: 'sjukskoterska'`).
- Vårdenhet skrivs som ett ord, kursiverat eller utan markering: `vårdenhet`, `vårdenheter`.

### Top-level README section ordering (final)

```
# MediTrack
[TOC — auto-anchor links]
## Vad är det här?
## Arkitekturval (motivera dina val)
  Matrix (9 rows)
  ### Postgres + row-level FOR UPDATE
  ### Prisma $extends typed extensions
  ### Named `meditrack_app` non-owner role
  ### Vad vi medvetet avstått från
## Snabbstart med Docker Compose
  ### Förkrav
  ### Tre steg
  ### Återställning
## Demo-konton
## Demo-rundtur (5 minuter)
## Lokal utveckling utan Docker
## Tester
  pnpm verify (lint + typecheck + test + build)
  Per-app vitest commands
  SC#4 Playwright command (requires running stack)
## Mobil-först verifiering
  6 × 360 px screenshot grid
  6×4 verification table
## Kända luckor
## Med mer tid
  ### Audit & efterlevnad
  ### AI & klassificering
  ### Drift & skalning
  ### UX-polish
  ### Säkerhet
## §6-svar (intervjudiskussion)
  ### Hur hanterar systemet att två sjuksköterskor beställer samtidigt?
  ### Hur skulle du skala upp till 50 vårdenheter?
  ### Hur skulle du eftermontera autentisering?
  ### Vad är du mest stolt över?
  ### Vad är du minst stolt över?
  ### Vad kostar systemet att köra?
  ### Hur skulle du övervaka det i produktion?
## Vad ligger var?

---

## Feature deep dives

### Audit log (Phase 5)
  ### Lager 1 — kodfrånvaro (arkitekturellt)
  ### Lager 2 — DB-rollbehörigheter + BEFORE-trigger
  ### Hur audit-hooken fungerar
  ### Vad granskas?
  ### Försvar-på-djupet-skydd (Plan 05-08)
  ### §6 supporting bullets (was: §6 interview-ready phrasings)
  ### Lärdomar
  ### Inloggning-rate-limit

### AI Categorization (Phase 6)
  ### Hur förslaget fungerar
  ### Tillförlitlighetsband-semantik
  ### Varför en sluten enum, inte fritext
  ### Reservstrategi när API-nyckeln saknas
  ### Latensbudget

### Dashboard low-stock banner (Phase 6)
  ### Uppdateringsstrategi
  ### Varför en dedikerad endpoint

### Error envelope (felkoder)
### Environment variables (miljövariabler)
```

### Arkitekturval matrix (9 rows — locked content)

| Val | Alternativ övervägda | Varför vi valde så | Följdeffekt |
|-----|----------------------|--------------------|-------------|
| **Frontend** | TS + React | Vue 3 + TS, Svelte+Kit, Next.js, Remix | Låst av användaren; matchar Medovias interna stack; React + Vite ger snabbaste utvecklingsloop på en veckas tidsbudget | shadcn/ui-komponenter, TanStack Query för server-state, react-hook-form + Zod för formulärvalidering |
| **Backend** | Node.js + Fastify + TS | Express, NestJS, Go (Gin/Echo), Ruby on Rails | Samma språk över FE+BE → delade Zod-kontrakt; Fastify är TS-native, snabbare än Express, har plugin-arkitektur som matchade `@fastify/rate-limit` + `@fastify/cookie` rent | File-per-endpoint route-mönster (D-65); plugin-baserad request-context (D-92); auth + rate-limit + audit som plugins |
| **Database** | PostgreSQL 16 | MySQL 8, SQLite, MongoDB | Domänen är obestridligt relationell; `SELECT ... FOR UPDATE` ger ett verkligt svar på §6-frågan om två samtidiga beställningar | Phase 4 D-79 CUM-batch lock; Phase 5 named-role split; pg_trgm GIN-index för fritextsökning (Phase 2 CR-02) |
| **ORM** | Prisma 5 | Drizzle, Kysely, TypeORM, raw SQL | Schema-first migrationer; genererade TS-typer; `$extends` typed extensions möjliggjorde Phase 5 audit-middleware utan att röra service-koden | Audit via `$extends` (D-90..D-97); migrationer i Git-historiken berättar datamodellens historia |
| **Server-state** | TanStack Query 5 | Redux Toolkit, SWR, Zustand, Apollo | Server-state är fundamentalt async; cache-key + invalidations + refetch-on-focus löser låg-lager-banner-uppdatering i Phase 6 utan en client-state-store | D-69 query-key-konventioner; D-119 sibling-invalidations; D-105 useInfiniteQuery för audit-paginering |
| **UI-kit** | shadcn/ui + Tailwind CSS 4 | MUI, Chakra, Mantine, Ant Design | shadcn ger kopierade komponenter i koden (ingen runtime-dep), Tailwind ger mobil-först responsivitet i klassnamn; matchar brief-§3.2 "responsivt UI" utan en custom-CSS-budget | Phase 1 UI-SPEC (slate + new-york), touch-targets ≥44 px; Combobox + Sheet + Dialog + Tabs återanvänds över alla 6 sidor |
| **Tester** | Vitest 2 | Jest, Mocha + Chai, Node:test | Vite-native (delar config med apps/web); Fastify `app.inject` mot riktig Postgres ger integrationstest utan att starta en server | Plan 05-03 har 17 audit-integration-tester; Plan 04 har 7 deliver-tester inkl. pg_locks-bevis; Plan 06 har 5 AI + 3 dashboard-integration-tester |
| **Monorepo** | pnpm workspaces 9 | Nx, Turborepo, npm + Lerna, plain folders | Inga extra config-filer; `pnpm -r` räcker för parallella scripts; symlinks för `@meditrack/shared` ger typedelning utan publicering | `apps/api`, `apps/web`, `packages/shared`; root `pnpm verify` kör hela suiten på ett kommando (D-129) |
| **Container** | Docker Compose v2 | Kubernetes, Podman Compose, Vagrant, devcontainers | Brief §3.3 nämner explicit "ett plus"; ett kommando (`docker compose up --build`) startar postgres + api + web + seed; ingen orkestrerings-overhead för en demo | pgdata-volym; healthcheck-baserad `depends_on`; named role split via env-var-injektion |

### §6-svar — elevator pitches (Swedish, ≤4 sentences each)

(Final text to be drafted by the planner / executor; here is the source skeleton.)

1. **Hur hanterar systemet att två sjuksköterskor beställer samtidigt?**
   Postgres' radlås via `SELECT ... FOR UPDATE` löser kapplöpningen. När en beställning levereras tas en CUM-batch-låsning på alla berörda mediciner i samma transaktion (Phase 4 D-79); samtidiga leveranser serialiseras istället för att race-a. Förloraren rullas tillbaka, och eftersom Phase 5's audit-middleware skriver in i samma transaktion rullas audit-raden tillbaka med den (D-91 — "audit-loggen ljuger inte"). Bevisas av `apps/api/test/orders.deliver.integration.test.ts` (`pg_locks`-snapshot) och integration test #2 i `audit.integration.test.ts`. [Läs mer: §Audit log §Hur audit-hooken fungerar]

2. **Hur skulle du skala upp till 50 vårdenheter?**
   Datamodellen är multi-tenant från dag 1 — `careUnitId` på alla resurser, service-signaturer tar `careUnitId` först (D-16), index på alla scope-kolumner. Admin-vyn för audit är medvetet cross-tenant idag (D-16 undantag); v2-tillägget "scope to my vårdenhet" är bara ett WHERE-tillägg eftersom kolumnen redan är där. Cursor-paginering (D-105) ger O(page-size) snarare än offset O(skip+limit), så audit-tabellen tål storleksordningar mer rader. Inga `careUnit`-kopplade in-memory-cachar är delade mellan request — horisontell skalning är drop-in. [Läs mer: §Audit log §Vad granskas?]

3. **Hur skulle du eftermontera autentisering?**
   Phase 5 är beviset: vi eftermonterade audit-logging *utan att röra en enda Phase 2/3/4-service-fil*. Mönstret är Prisma's `$extends` typed-extensions som inskjuter modellnivå-mellanhand utan att service-koden vet om det (D-83 + D-90). Samma mönster fungerar för per-rad authz — `$extends` på `findMany` injicerar en `where: { tenantId }`-klausul; service-koden påverkas inte. Den här kodbasen har redan gjort eftermonteringen en gång, för audit. [Läs mer: §Audit log §Hur audit-hooken fungerar §Varför `$extends` över `$use`]

4. **Vad är du mest stolt över?**
   Append-only-skyddet på audit-tabellen är fysiskt erforderligt av Postgres, inte av applikationen. Två oberoende lager: en `meditrack_app` non-owner-roll har REVOKE på UPDATE/DELETE/TRUNCATE (migration 0010), och en BEFORE-trigger fångar OWNER-sessioner som annars skulle bypassa GRANT/REVOKE (migration 0008). Bägge lager assertas av `audit.integration.test.ts` Test 4 (`UPDATE` mot `AuditEvent` rejectas med `permission denied`) och Test 3 (`git grep` för bannade patterns returnerar noll). Även om en framtida bidragsgivare skriver `prisma.auditEvent.delete(...)` stoppas hen av tre lager: ESLint på commit, CI-grep på PR, Postgres på runtime. [Läs mer: §Audit log §Lager 2]

5. **Vad är du minst stolt över?**
   Prisma's `$extends`-mellanhand ser inte `$queryRaw`-skrivningar. Idag är det skadefritt — inga `$executeRaw`-skrivningar finns i produktion-koden, och en CI-grep (Test 15) assertar det vid varje körning — men det underliggande gapet (`$extends`-gränsen) finns kvar. En framtida raw-skrivning måste in i en explicit allowlist på PR-tid, vilket gör arkitekturbeslutet synligt snarare än dolt. Jag valde den minsta blast-radien jag hittade för en veckas budget; ett v2-fix vore att intercepta `$executeRaw` i mellanhanden eller route alla raw-skrivningar via en service-funktion som *är* avlyssnad. [Läs mer: §Audit log §Känd lucka (ärlig redovisning)]

6. **Vad kostar systemet att köra?**
   En PostgreSQL-instans + två Node-containers — ingen Redis, ingen meddelandekö, ingen SSE/WebSocket-infrastruktur. På en small DigitalOcean-droplet eller motsvarande hamnar grundkostnaden under $30/mån. AI-tilläget tillkommer endast när användaren klickar på `Hämta AI-förslag`: cirka $0.0001 per `claude-haiku-4-5 tool_use`-anrop, och vi har medvetet INTE backfill-klassificerat de 43 538 NPL-läkemedlen vid seed eftersom kostnaden ($4 per fresh `docker compose up`) inte motiverades på en demo (D-115). Stockholms-vårdenhet med 100 beställningar/dag ger AI-kostnad < $1/månad.

7. **Hur skulle du övervaka det i produktion?**
   Idag har vi audit-log (säkerhets-observability) och strukturerade Fastify-loggar till stdout. Produktion skulle lägga till: en OpenTelemetry-collector för traces, en log-shipper till Loki eller Splunk för aggregering, en Prometheus-exporter för per-route latens + felfrekvens, samt per-tenant SLO-dashboards för latens-budget per vårdenhet. Audit-loggen redan finns och är den enskilt viktigaste säkerhets-observability vi har — den berättar exakt vem som gjorde vad och när. Vi har medvetet INTE byggt observability-infrastrukturen i denna byggnad eftersom den lägger till tre tjänster för marginalt signalvärde i en demo.

### Verification table (Mobil-först verifiering — 6×4)

| Skärm | 360 px | 768 px | 1024 px | 1440 px |
|-------|--------|--------|---------|---------|
| Login | ✓ | ✓ | ✓ | ✓ |
| Katalog (/lakemedel) | ✓¹ | ✓ | ✓ | ✓ |
| Beställningsskapande (/bestallningar/ny) | ✓² | ✓ | ✓ | ✓ |
| Beställningshistorik (/bestallningar) | ✓³ | ✓ | ✓ | ✓ |
| Audit (/admin/audit) | ✓⁴ | ✓ | ✓ | ✓ |
| Dashboard (/dashboard) | ✓ | ✓ | ✓ | ✓ |

Fotnoter (planner expanderar — innehåll baserat på det faktiska responsiva beteendet):
- ¹ Filterlist scrollar horisontellt; tabell växlar till kortlayout vid `<md`.
- ² Multi-line beställning stackar vertikalt; QuantityStepper har 44 px touch-target.
- ³ Tabell växlar till DraftsCardList vid `<md`; status-tabs förblir nåbara.
- ⁴ FilterBar's tre comboboxer staplar vertikalt; diff-panel kollapsar till expanderbart accordion.

(Capture date + command genereras automatiskt under tabellen av planning slice 4.)

### Plan-slice ordering (recommended)

1. **Slice 1 — README restructure + Swedish translation + consolidated `## Kända luckor` + `## Med mer tid`.** Largest slice; blocks everything else; ends with a single big `docs(07): restructure README to brief-aligned canonical layout, all-Swedish` commit (acceptable here because the diff is a wholesale reorganization, not a feature add).
2. **Slice 2 — `## Arkitekturval` (matrix + 3 prose + avstått-bullet-list).** Depends on Slice 1's section being in place. Independent of Slice 3+4.
3. **Slice 3 — `pnpm verify` script + per-workspace `typecheck` scripts + README §Tester update.** Independent of 1+2 except for README placement.
4. **Slice 4 — SC#4 Playwright script + capture 6 PNGs + verification table + README §Mobil-först verifiering inline.** Depends on Slice 1 (README structure) for section placement; INDEPENDENT of 2+3.
5. **Slice 5 — `## Demo-rundtur (5 minuter)` + `## §6-svar (intervjudiskussion)`.** Depends on 1 (placement) + 4 (screenshot section landed). Closes the README work.
6. **Slice 6 — Final demo-path human gate** (chore(07): phase 7 demo-path verified by user on fresh docker compose up).

### Commit message conventions (Phase 7)

- All Phase 7 commits use `docs(07-NN):` scope for README/doc-only work.
- Code-bearing commits (Slice 3 root `package.json`, Slice 4 Playwright script + PNGs + AppShell attribute) use `chore(07-NN):` or `feat(07-NN):` per the existing project convention.
- Each slice ends with a `docs(07-NN): complete <slice name> plan` commit (per the existing pattern Phase 5+6 used).
- Final phase commit: `docs(phase-07): complete phase execution` mirroring `docs(phase-06): complete phase execution`.

</specifics>

<deferred>
## Deferred Ideas

(Captured during Phase 7 discussion; do NOT lose; do NOT act on in Phase 7. Lift into `## Med mer tid` at write-time if appropriate.)

- **CI/CD wiring of `pnpm verify` into GitHub Actions.** Adds `.github/workflows/verify.yml` running on `push` + `pull_request`. Not Phase 7 because GitHub Actions adoption is its own infrastructure decision (caching strategy, runner selection, branch protection). Bucket: **Drift & skalning**.
- **End-to-end functional Playwright suite.** The SC#4 script is layout-only. A v2 functional suite would cover the demo-rundtur as automated test (login → order → confirm → deliver → audit-show). Bucket: **Drift & skalning**.
- **Per-user password rotation at first login.** Demo-värdet `demo1234` är hårdkodat i seed; produktion skulle generera + tvinga byte vid första inlogg. Bucket: **Säkerhet**.
- **Git-history retrospective rewrite.** If `git log --oneline` surfaces any embarrassing commit message during planning, that's a localized `git commit --amend` candidate, NOT a phase-wide rebase. Document the policy in the planner's commit checklist. Not Phase 7 unless an embarrassment is actually identified.
- **PNG compression via `pngquant` post-pass.** Only triggered if the 6 SC#4 screenshots total > 1 MB. Doc-level note in Phase 7; not pre-emptive.
- **Translating the planning artifacts (`.planning/**/*.md`) into Swedish.** Internal artifacts; not part of the reviewer-facing deliverable. Permanently out of scope unless a Swedish-only project standard is adopted later.
- **A `## Hur jag arbetade` (process retrospective) section in README.** A meta-commentary on the GSD workflow + agentic-AI build approach. Considered but rejected for Phase 7 — risks looking self-indulgent; the engineering depth in `## Arkitekturval` + `## §6-svar` already carries that signal indirectly. v2 only if a reviewer asks.
- **`Kopiera filterlänk` label rename** (Phase 5 LOW #15 — currently `Kopiera permalink` overstates what's copied). Documented in Phase 5 `<deferred>`. Not Phase 7 because it's a UI string change that requires its own commit + test + audit-row test update; cost-out-of-scope for a polish phase. Bucket: **UX-polish**.
- **`SECURITY DEFINER` purge function for audit retention.** Phase 5 v2 candidate; deep-dive worthy in `## Med mer tid` under **Audit & efterlevnad**. Carries forward.
- **Production secrets management** (Docker secrets, Vault, AWS Secrets Manager). Demo seed-passwords are hardcoded. Bucket: **Säkerhet**.
- **Per-vårdenhet admin scope toggle.** Phase 5 deferred. Lifts into **Audit & efterlevnad** in `## Med mer tid`.
- **Per-user rate-limit on `POST /api/ai/suggest-therapeutic-class`.** Phase 6 T-06-15 / `## Phase 6 v2 candidates`. Lifts into **Säkerhet** in `## Med mer tid`.

</deferred>

---

*Phase: 7-Ops & Submission Polish*
*Context gathered: 2026-05-23*
