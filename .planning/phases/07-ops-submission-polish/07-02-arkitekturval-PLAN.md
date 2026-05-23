---
phase: 07
plan: 07-02
type: execute
wave: 2
depends_on: [07-01]
files_modified:
  - README.md
autonomous: true
requirements_addressed: [OPS-02, OPS-04]
must_haves:
  truths:
    - "Implements D-123 (decision-matrix table + prose for three interview-defining choices + `### Vad vi medvetet avstått från` subsection)"
    - "Reviewer reading the top of README answers 'why this stack?' from the matrix alone"
    - "Three interview-defining choices (Postgres / Prisma `$extends` / named non-owner role) have dedicated prose paragraphs"
    - "The brief's lightweight bias is explicit — `### Vad vi medvetet avstått från` lists what we DIDN'T add"
    - "Every matrix row cites a sourceable decision (PROJECT.md row, phase 01-CONTEXT.md D-NN, or phase 03-CONTEXT.md D-NN)"
  artifacts:
    - path: README.md
      provides: "## Arkitekturval (motivera dina val) section populated"
      contains:
        - "9-row markdown table (Val | Alternativ övervägda | Varför vi valde så | Följdeffekt)"
        - "### Postgres + row-level FOR UPDATE prose paragraph"
        - "### Prisma $extends typed extensions prose paragraph"
        - "### Named `meditrack_app` non-owner role prose paragraph"
        - "### Vad vi medvetet avstått från subsection with 6–7 bullets"
  key_links:
    - from: "### Postgres + row-level FOR UPDATE"
      to: "apps/api/test/orders.deliver.integration.test.ts"
      via: cited test name in prose
    - from: "### Prisma $extends typed extensions"
      to: "Phase 5 audit middleware retrofit"
      via: cited D-83 + D-90 from phase 5 context
    - from: "### Named `meditrack_app` non-owner role"
      to: "migration 0008 + 0010 + audit.integration.test.ts Test 4"
      via: cited migration names + test number in prose
---

<objective>
Populate the `## Arkitekturval (motivera dina val)` section that Slice 1 anchored as a placeholder. This is the brief §3 "motivera dina val" deliverable — the heart of the README's stack-rationale answer. Deliverables per D-123:

1. **9-row × 4-column decision matrix** covering Frontend / Backend / Database / ORM / Server-state / UI-kit / Tester / Monorepo / Container-orchestrering.
2. **Three prose paragraphs (~150 words each)** on the three interview-defining choices: Postgres + FOR UPDATE, Prisma `$extends`, named `meditrack_app` role.
3. **`### Vad vi medvetet avstått från` subsection** — 6–7 bullets covering K8s / message queue / microservices / GraphQL federation / Real-time push / Email infrastructure / OAuth+SSO.

Purpose: a reviewer who reads ONLY this section can defend every stack choice in the interview. Source material is in PROJECT.md (Key Decisions table) + phase 01/03/04/05-CONTEXT.md decisions + `07-CONTEXT.md <specifics>` (matrix is pre-drafted in full).

Output: `README.md` `## Arkitekturval` placeholder replaced with full content (matrix + 3 prose + Vad vi medvetet avstått från).
</objective>

<execution_context>
@C:/Projekt/MediTrack/.claude/get-shit-done/workflows/execute-plan.md
@C:/Projekt/MediTrack/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/07-ops-submission-polish/07-CONTEXT.md
@.planning/phases/07-ops-submission-polish/07-PATTERNS.md
@.planning/phases/04-confirm-deliver-stock/04-CONTEXT.md
@.planning/phases/05-audit-log/05-CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Populate `## Arkitekturval (motivera dina val)` — matrix + 3 prose + Vad vi medvetet avstått från</name>
  <files>README.md</files>
  <read_first>
    - README.md (the file being modified — current state after Slice 1, with `<!-- Populated by Slice 2 -->` placeholder under `## Arkitekturval (motivera dina val)`)
    - .planning/phases/07-ops-submission-polish/07-CONTEXT.md (D-123; `<specifics>` "Arkitekturval matrix (9 rows — locked content)" — the matrix is fully drafted there and is the source for verbatim use)
    - .planning/PROJECT.md (Key Decisions table for matrix-row sources; `## Out of Scope` for `### Vad vi medvetet avstått från` bullet sources)
    - .planning/phases/04-confirm-deliver-stock/04-CONTEXT.md (D-79 CUM-batch FOR UPDATE lock — cited verbatim in the Postgres prose paragraph)
    - .planning/phases/05-audit-log/05-CONTEXT.md (D-83, D-90, D-91, D-93, D-98 — cited in the Prisma `$extends` prose paragraph + named-role prose paragraph)
    - .planning/phases/07-ops-submission-polish/07-PATTERNS.md (Pattern C — Swedish prose conventions to apply throughout)
  </read_first>
  <action>
    Replace the `<!-- Populated by Slice 2 -->` placeholder line under `## Arkitekturval (motivera dina val)` in README.md with the full section body. Section body sub-structure:

    **(1) Opening one-paragraph framing** — 2–3 sentences in Swedish setting up the matrix. Tone: "Här är besluten, varför vi valde så, och vad det kostade oss att välja annorlunda."

    **(2) The 9-row decision matrix** — copy the matrix from `07-CONTEXT.md <specifics>` "Arkitekturval matrix (9 rows — locked content)" VERBATIM. Row order (top-down by stack layer per Claude's Discretion): Frontend → Backend → Database → ORM → Server-state → UI-kit → Tester → Monorepo → Container. 4 columns: `Val | Alternativ övervägda | Varför vi valde så | Följdeffekt`. Each row is one line. The matrix is pre-drafted there and is the source for verbatim use — do NOT redraft.

    **(3) `### Postgres + row-level FOR UPDATE`** — prose paragraph, ~150 words Swedish. Must reference:
      - Why a relational DB (the domain — orders → order_lines → medications → audit; user → unit) is "obestridligt relationell".
      - The §6 concurrency answer: `SELECT ... FOR UPDATE` row-level locks make the two-nurses-ordering-simultaneously question answerable with a real mechanism, not a hand-wave.
      - The Phase 4 D-79 CUM-batch lock pattern: when an order is delivered, ALL affected medications are locked in the same transaction (NOT row-by-row); cite by name `apps/api/test/orders.deliver.integration.test.ts` and the `pg_locks` snapshot test.
      - One sentence on the trade-off: Postgres adds operational cost vs SQLite, but the §6 answer + multi-tenant scoping pay for that cost.

    **(4) `### Prisma $extends typed extensions`** — prose paragraph, ~150 words Swedish. Must reference:
      - The §6 retrofitting-auth answer: we eftermonterade audit-logging in Phase 5 WITHOUT touching any Phase 2/3/4 service file (D-83 from 05-CONTEXT.md).
      - The mechanism: Prisma's `$extends({ query: ... })` middleware intercepts model-level calls on the 6 audited models (D-90).
      - The same pattern handles per-row authz — `$extends` on `findMany` injects a `where: { tenantId }` clause; service code stays oblivious.
      - One sentence acknowledging the limitation (the §6 least-proud answer): `$extends` does NOT see `$queryRaw` writes; the CI grep + ESLint ban (D-99) is the guard.
      - Concrete file references: `apps/api/src/db/auditExtension.ts`, `audit.integration.test.ts` Test 3 (grep proof).

    **(5) `### Named `meditrack_app` non-owner role`** — prose paragraph, ~150 words Swedish. Must reference:
      - The architectural append-only audit guarantee: not a runtime check, an architectural one.
      - Two independent layers: (a) `meditrack_app` non-owner role with REVOKE UPDATE/DELETE/TRUNCATE on `AuditEvent` (migration `0010_audit_events_named_app_role`); (b) BEFORE-trigger that catches OWNER sessions that would otherwise bypass GRANT/REVOKE (migration `0008_audit_events_revoke_grants`).
      - Both layers asserted: `audit.integration.test.ts` Test 4 (raw SQL `UPDATE` rejected with `permission denied` / `SQLSTATE 42501`), Test 3 (`git grep` for banned patterns returns zero).
      - The three-layer defense at runtime: ESLint at commit, CI grep on PR, Postgres at runtime.
      - The §6 "what are you proudest of" hook lands here.

    **(6) `### Vad vi medvetet avstått från`** — bullet list, 6–7 entries. **Bullet format requirement:** each bullet starts with `- ` (markdown unordered-list bullet, not numbered) so the verify-block count is unambiguous. Source: PROJECT.md "Constraints" "Lightweight bias" line + PROJECT.md `## Out of Scope` section. Each bullet exactly ONE line: `- **<thing>** — <varför nej>; ompröva när <trigger>.` The 7 mandatory entries:
      - **Kubernetes** — Docker Compose räcker för en demo + en vårdenhet; orkestrering är overhead utan multi-region eller hög trafik. Ompröva när: > 1 region eller > 10 vårdenheter parallellt.
      - **Meddelandekö (Redis/RabbitMQ)** — Postgres LISTEN/NOTIFY eller cron räcker för v1; ingen async-fanout-pipeline behövs idag. Ompröva när: e-postnotifikationer (NTF-03) eller batch-jobb läggs till.
      - **Mikrotjänster** — En process per app räcker; en monolitisk Fastify-app testas och deployas atomiskt. Ompröva när: oberoende skalning per domän krävs (t.ex. AI-tjänst lyfter med egen autoscaling).
      - **GraphQL-federation** — Zod-kontrakt + tunna REST-routes ger samma typsäkerhet utan en federations-gateway. Ompröva när: > 3 klienter konsumerar samma API och queries divergerar.
      - **Real-time push (SSE/WebSocket)** — TanStack Query refetch-on-mutation + 30-sekunders polling (D-119) ger färska data utan en pubsub-infrastruktur. Ompröva när: latensbudget under 5 sekunder krävs eller multi-user simultaneous editing.
      - **E-postinfrastruktur** — Mailprovider + kö + mallar = för mycket yta för marginalt signalvärde mot in-app banner (NTF-01). Ompröva när: notifikationer ska gå utanför sessionen.
      - **OAuth / SSO** — E-post + lösenord räcker för internt verktyg; OAuth lägger till infra utan att ändra demo-storyn. Ompröva när: integration mot landstingets identitetsprovider (BankID, ADFS) blir krav.

    Apply Pattern C throughout — Swedish prose, English technical terms in code-fences, file paths in code-fences, role names lowercase Swedish in prose. UI strings (e.g., none in this section by design) are not relevant here; technical proper-nouns ARE relevant (`$extends`, `meditrack_app`, `pg_locks`, `FOR UPDATE`, `SQLSTATE 42501`).

    The opening framing paragraph + the matrix + 3 prose subsections + the "Vad vi medvetet avstått från" bullet list together replace the placeholder line. No other README.md sections are touched.
  </action>
  <verify>
    <automated>
      # Run via Bash tool (POSIX shell).
      # 1. Section placeholder is replaced (no longer present):
      ! grep -F "<!-- Populated by Slice 2 -->" README.md
      # 2. The 9-row matrix exists with correct header (4 pipes for 4 columns; row count check):
      awk '/^## Arkitekturval/,/^## /' README.md | grep -c "^|.*|.*|.*|.*|$" | xargs test 10 -le   # header + separator + 9 rows = ≥11 pipe-lines
      # 3. The three prose subsections exist as ### headings under ## Arkitekturval:
      for subsection in "### Postgres + row-level FOR UPDATE" "### Prisma \$extends typed extensions" "### Named \`meditrack_app\` non-owner role" "### Vad vi medvetet avstått från"; do
        grep -F "$subsection" README.md >/dev/null || (echo "MISSING: $subsection"; exit 1)
      done
      # 4. Vad vi medvetet avstått från has 6–7 bullets (use a portable shell expression — no xargs/awk pipeline).
      #    Strip any stray markdown-comment lines, then count `- ` bullets within the subsection.
      n=$(awk '/^### Vad vi medvetet avstått från$/,/^### |^## /' README.md | grep -v '^#' | grep -c '^- ')
      test "$n" -ge 6 && test "$n" -le 7 || (echo "Vad vi medvetet avstått från bullet count = $n (expected 6 or 7)"; exit 1)
      # 5. Cited references appear verbatim in prose:
      grep -F "apps/api/test/orders.deliver.integration.test.ts" README.md
      grep -F "0010_audit_events_named_app_role" README.md
      grep -F "0008_audit_events_revoke_grants" README.md
      grep -F 'audit.integration.test.ts' README.md
      grep -F "SQLSTATE 42501" README.md
      # 6. The matrix mentions all 9 stack layers:
      for layer in "Frontend" "Backend" "Database" "ORM" "Server-state" "UI-kit" "Tester" "Monorepo" "Container"; do
        awk '/^## Arkitekturval/,/^## /' README.md | grep -F "$layer" >/dev/null || (echo "MISSING row: $layer"; exit 1)
      done
    </automated>
  </verify>
  <done>
    `## Arkitekturval (motivera dani val)` placeholder replaced with: (a) framing paragraph, (b) 9-row decision matrix matching the locked content in `07-CONTEXT.md <specifics>`, (c) three prose paragraphs with concrete file/test/migration references, (d) `### Vad vi medvetet avstått från` with 6–7 bullets. All Swedish per Pattern C; no other README sections modified.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| README.md → reviewer | Static rendered markdown. No code execution. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-07-04 | Information Disclosure | README content | accept | The section references file paths, test names, and migration names — all already public in the repo. No secrets, no internal-only details added. |
| T-07-05 | All other ASVS L1 categories | N/A | out-of-scope | Documentation-only edit — no inputs, no auth code, no DB access, no new attack surface. No new dependencies added. |
</threat_model>

<verification>
- Every prose claim is verifiable by a reviewer who clicks through to the cited file (the cited file exists at the cited path; the cited test number exists in the test file; the cited migration name matches a file under `apps/api/prisma/migrations/`).
- Matrix row count = 9 exactly; column count = 4 exactly.
- Section nests correctly: `## Arkitekturval` H2 → 3× `###` prose subsections + `### Vad vi medvetet avstått från`.
</verification>

<success_criteria>
- `## Arkitekturval` section in README.md contains: 9-row matrix + 3 prose paragraphs + `### Vad vi medvetet avstått från` with 6–7 bullets.
- All grep-able assertions pass.
- Slice 1's placeholder comment is removed.
- Commit messages follow Pattern B (`docs(07-02): ...`).
</success_criteria>

<output>
Create `.planning/phases/07-ops-submission-polish/07-02-SUMMARY.md` when done, listing the matrix rows added, the three prose paragraphs by H3 heading, and the 6–7 bullets in Vad vi medvetet avstått från.
</output>
