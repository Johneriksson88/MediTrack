---
phase: 06-ai-categorization-low-stock-notifications
plan: 03
subsystem: ai-categorization
tags: [ai, anthropic, claude-haiku, tool-use, abortcontroller, single-seam, audit-integration, ai-01, ai-02, d-106, d-107, d-108, d-109, d-110, d-111, d-112, d-113, sc-4]

requires:
  - phase: 01-foundation-auth
    provides: requireSession + requirePermission + Can + D-15 PERMISSIONS map + D-17 useAuth + D-19 error envelope
  - phase: 02-medication-catalog
    provides: MedicationSheet create/edit/view forms (the integration surface for the AI block)
  - phase: 05-audit-log
    provides: $extends middleware (D-93) + diff-at-read (D-95) + AUDIT_ALLOWLIST.Medication (D-97) — therapeuticClass changes flow through the existing audit pipeline with no new audit code
  - plan: 06-02
    provides: therapeuticClassEnum + TherapeuticClass type + THERAPEUTIC_CLASS_LABELS + shared TherapeuticClassCombobox component (Warning 7 anti-duplication — the Slutgiltig klass field reuses this verbatim)

provides:
  - apps/api/src/services/aiCategorization.service.ts — single-seam LLM service (SC #4): isAvailable() + suggestTherapeuticClass(input) — the ONLY file in apps/api/src/ that imports @anthropic-ai/sdk
  - POST /api/ai/suggest-therapeutic-class (apotekare + admin via D-15 'ai:suggest') — body validated by aiSuggestionRequest; response by aiSuggestionResponse
  - GET /api/ai/status (all roles via requireSession) — returns {available: boolean} reflecting env.ANTHROPIC_API_KEY truthiness
  - Two new canonical D-19 error codes: ai_unavailable (503) and ai_timeout (504) with errorHandler.ts classes + branches
  - Shared ai.ts contract (4 exports + types): aiSuggestionRequest, aiSuggestionResponse, aiStatusResponse, llmToolUseSchema (internal validator for the raw tool_use.input float-shape)
  - Two FE components: ConfidenceBadge (3-band hog/medel/lag) + AiSuggestionChip (Förslag: <label> + badge)
  - Two FE hooks: useAiAvailability (TanStack useQuery ['ai', 'status']) + useSuggestTherapeuticClass (TanStack useMutation with D-19 onError switch)
  - MedicationSheet integration: AiCategoryBlock helper (4-row block wrapped in <Can action="ai:suggest">) + TherapeuticClassField helper (Controller around Plan 02's shared combobox) — wired into all four create/edit form variants (NPL edit, user edit, NPL create, user create) + view mode shows Slutgiltig klass as read-only text
  - ANTHROPIC_API_KEY env var threaded through env.ts (optional) + docker-compose.yml (with empty default) + .env.example (with usage docs)
  - README Phase 6 sections: ## AI Categorization (5 subsections), ## Dashboard low-stock banner (2 subsections), error envelope code table, env-var table, Phase 6 v2 candidates

affects: []

tech-stack:
  added:
    - "@anthropic-ai/sdk@0.98.0 (CommonJS in this version; interops cleanly with apps/api ESM)"
  patterns:
    - "Single-service-seam isolation for external dependencies (D-106 / SC #4) — the LLM provider lives in ONE file; swapping to OpenAI, Vertex AI, or a deterministic local mock for tests is exactly one file's edit. Verified by `grep -r '@anthropic-ai/sdk' apps/api/src` matching only aiCategorization.service.ts."
    - "Wire/internal schema split for LLM outputs (Blocker 4 + D-111) — llmToolUseSchema validates the RAW tool_use.input float-shape; aiSuggestionResponse is the bucketed band wire shape. The service is the one place float→band bucketing happens; the FE contract is honest about LLM self-reported confidence."
    - "Module-load env knob for test-only timeout override (Warning 11) — `const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 5000)` lets vitest set 50ms via vi.hoisted BEFORE module import; production never reads the override. Test 3 asserts the real AbortController fires in <2s wall time."
    - "SDK-layer constructor mock pattern for testing real AbortController paths (Warning 11) — vi.mock('@anthropic-ai/sdk') replaces the default-export class with one whose `messages.create` returns a Promise rejecting only on `signal.abort`. Combined with AI_TIMEOUT_MS=50, exercises the actual abort flow without 5-second real-time waits."
    - "vi.hoisted for env setup that must precede ES module imports — env.ts and aiCategorization.service.ts read process.env at module load; vi.stubEnv at file-top runs AFTER imports (because ES modules hoist imports). vi.hoisted runs first, fixing the order."
    - "AI block as inline helper component inside the consuming file (MedicationSheet.tsx) — avoids creating a separate apps/web/src/components/AiCategoryBlock.tsx with leaky props plumbing. Wraps in <Can action='ai:suggest'> for defense-in-depth alongside the isAvailable() availability check."
    - "Slutgiltig klass field renders Plan 02's shared TherapeuticClassCombobox via a thin Controller wrapper (TherapeuticClassField) — zero duplicated Popover+Command JSX per Warning 7 anti-duplication contract."

key-files:
  created:
    - packages/shared/src/contracts/ai.ts
    - apps/api/src/services/aiCategorization.service.ts
    - apps/api/src/routes/ai/suggest.ts
    - apps/api/src/routes/ai/status.ts
    - apps/api/src/routes/ai/index.ts
    - apps/api/test/aiCategorization.integration.test.ts
    - apps/web/src/components/ConfidenceBadge.tsx
    - apps/web/src/components/AiSuggestionChip.tsx
    - apps/web/src/features/ai/useAiAvailability.ts
    - apps/web/src/features/ai/useSuggestTherapeuticClass.ts
    - apps/web/src/routes/lakemedel/__tests__/MedicationSheet.ai.test.tsx
  modified:
    - packages/shared/src/contracts/permissions.ts (append 'ai:suggest' to ACTION_KEYS)
    - packages/shared/src/index.ts (re-export ai.ts symbols)
    - apps/api/src/auth/permissions.ts (PERMISSIONS['ai:suggest'] = ['apotekare', 'admin'])
    - apps/api/src/env.ts (ANTHROPIC_API_KEY: z.string().optional())
    - apps/api/src/plugins/errorHandler.ts (AiUnavailableError + AiTimeoutError classes + setErrorHandler branches)
    - apps/api/src/app.ts (register aiRoutes between auditRoutes and dashboardRoutes)
    - apps/api/package.json + pnpm-lock.yaml (@anthropic-ai/sdk@0.98.0)
    - apps/api/test/auth.me.test.ts (admin permissions array gains 'ai:suggest')
    - apps/api/test/admin.ping.test.ts (admin + apotekare permissions arrays gain 'ai:suggest')
    - apps/api/test/auth.flow.smoke.test.ts (apotekare + admin role-matrix permissions gain 'ai:suggest')
    - apps/web/src/routes/lakemedel/MedicationSheet.tsx (AiCategoryBlock + TherapeuticClassField helpers + wired into 4 form variants + view-mode read-only)
    - apps/web/vitest.setup.ts (ResizeObserver + hasPointerCapture + scrollIntoView jsdom shims needed by cmdk + Radix)
    - docker-compose.yml (api service environment: ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-})
    - .env.example (ANTHROPIC_API_KEY= with documentation block)
    - README.md (## AI Categorization + ## Dashboard low-stock banner + ## Error envelope additions + ## Environment variables + ## Phase 6 v2 candidates)

key-decisions:
  - "D-106 single-seam verified mechanically: grep -r '@anthropic-ai/sdk' apps/api/src matches ONLY aiCategorization.service.ts. Two routes (suggest + status) call into the service via its exported isAvailable() + suggestTherapeuticClass() functions; nothing else imports the SDK. Swapping providers is exactly one file's worth of edits."
  - "D-107 ANTHROPIC_API_KEY OPTIONAL — z.string().optional() with NO .min(1). docker compose up on a fresh clone with no key works: env parses, isAvailable() returns false, /api/ai/status reports false, the FE conditional render hides the entire AI block. Verified by Test 5's flip-and-back assertion."
  - "D-108 FE conditional render via useAiAvailability — the AI block is HIDDEN (not disabled, not greyed) when isAvailable() is false. Verified by Test 1: `screen.queryByText('Hämta AI-förslag')` returns null. The Slutgiltig klass combobox lives OUTSIDE the <Can> wrap and continues to render so sjuksköterska/admin can still view/edit the existing therapeuticClass field even without the AI affordance."
  - "D-109 manual button trigger — no debounce, no on-blur auto-call. The button is disabled when name OR atcCode is empty OR aiAvailable is false OR the mutation is in flight. Verified by Test 2."
  - "D-110 two-field layout with explicit Apply — the AiSuggestionChip + 'Använd förslag' button live ABOVE the Slutgiltig klass combobox. After Apply, the chip REMAINS visible (so the user can see what they accepted); after the user picks a different bucket from the combobox, the chip STILL remains visible (so override is visually explicit). Verified by Test 5 — the chip with the original 'J' suggestion is asserted present AFTER the user picks 'N — Nervsystemet'."
  - "D-111 confidence bucketing happens server-side inside aiCategorization.service.ts. The LLM returns a 0..1 float per its tool_use schema; bucketConfidence() maps to hog (>=0.85) / medel (>=0.6) / lag (<0.6). Wire shape ships ONLY the band string. UI never sees the raw float — keeps the contract honest about LLM self-reported confidence."
  - "D-112 5s AbortController with env.AI_TIMEOUT_MS test-only override (Warning 11 mitigation) — TIMEOUT_MS is read once at module load. Vitest uses vi.hoisted to set the env to 50 BEFORE the ES module imports run; Test 3 exercises the real AbortController in ~50ms wall time. Production reads the 5000ms default."
  - "D-113 AI-02 reframing — override is by picking a different enum bucket from Plan 02's shared TherapeuticClassCombobox (NOT free text). Documented up front in the README's ## AI Categorization → ### Why a closed enum, not free text subsection using the exact phrase 'override by picking a different enum bucket' (one of the six README grep gates). The closed enum survives downstream filtering (AI-03), avoids spelling-drift bugs, and matches the international ATC clinical standard."
  - "Blocker 4 / Test 3 mitigation — the Anthropic SDK's APIPromise wraps `messages.create(body, opts)` where `signal` lives on the SECOND argument (RequestOptions), not the body. The test file's mockMessagesCreate destructures from the second arg accordingly. (First attempt destructured from the first arg and the signal was undefined → TypeError → 500 instead of 504. Fixed via the second-arg destructure in MedicationSheet.ai test setup file.)"
  - "Warning 7 satisfied — MedicationSheet's Slutgiltig klass field is a Controller wrapping Plan 02's shared TherapeuticClassCombobox. NO duplicated Popover+Command JSX anywhere in Plan 03. Two consumers, one combobox component, two wrapper layers (URL-state in LakemedelFilter, react-hook-form Controller in MedicationSheet)."
  - "Warning 11 satisfied — Test 3 (timeout) uses an SDK-layer mock that returns a Promise rejecting on `signal.abort`. Combined with AI_TIMEOUT_MS=50 via vi.hoisted, the REAL AbortController inside suggestTherapeuticClass() fires in <200ms wall time and the test asserts the 504 envelope. The contract is exercised in CI on every run."
  - "T-06-15 (DoS via LLM-spam) deferred — apotekare+admin permission gate restricts the suggest endpoint to ~2 seed accounts in the demo. A per-user rate-limit (suggested ~30/min) is captured as a TODO marker in apps/api/src/routes/ai/suggest.ts and listed in the README's Phase 6 v2 candidates section. Acceptable residual risk per the threat-model disposition."
  - "T-06-19 (info-disclosure on /api/ai/status) accepted — the boolean reveals only env-config posture; no key value, no provider name, no model version. Used uniformly by all three roles for the FE conditional render."

patterns-established:
  - "Single-seam external-service file with a documented header explaining the D-16 exception (per-medication, not per-vårdenhet) — aiCategorization.service.ts is the template for any future Phase 7+ external-service integration."
  - "vi.hoisted for module-load env setup in vitest — when a module reads `process.env.X` at module load and vi.stubEnv at file-top doesn't run early enough, use vi.hoisted to set the env BEFORE ES module imports. Pattern documented inline in aiCategorization.integration.test.ts."
  - "Two-stage Zod validation for LLM outputs — llmToolUseSchema validates the RAW provider response (float confidence); the WIRE schema (aiSuggestionResponse) is bucketed-band. Two schemas, one server-side bucketing step, one honest FE contract."
  - "Inline AI block helper inside the consuming file pattern — for surfaces where the AI block is reused across form variants in ONE file (here: 4 form variants in MedicationSheet.tsx), an inline component scoped to the file is cleaner than a separate file with leaky props plumbing. <Can> gate + isAvailable() check live together inside the helper."
  - "Vitest setup-file jsdom shims for Radix + cmdk — Phase 6's new components (ResizeObserver via cmdk's CommandList constructor; hasPointerCapture + scrollIntoView via Radix Popover focus management) require three jsdom shims added to apps/web/vitest.setup.ts. The shims unblock all Radix-Popover-based component tests (including future Phase 7 work)."

requirements-completed: [AI-01, AI-02]

duration: 95 min
completed: 2026-05-23
---

# Phase 6 Plan 03: Slice C — AI service + suggest endpoint + Sheet integration + README Summary

Slice C — the LLM-dependent slice that completes Phase 6. Lands the
single-seam `aiCategorization.service.ts` (ROADMAP SC #4: one file =
one swap-point for provider/mock), the new
`POST /api/ai/suggest-therapeutic-class` endpoint with structured
`tool_use` against Claude Haiku 4.5, two new D-19 error codes
(`ai_unavailable` 503, `ai_timeout` 504), the `GET /api/ai/status`
availability check, the `ai:suggest` permission key (apotekare + admin),
the AI affordance inside `MedicationSheet` (two-field layout per D-110
reusing Plan 02's `TherapeuticClassCombobox` per Warning 7), the
`AiSuggestionChip` + `ConfidenceBadge` components, and README
documentation (CLAUDE.md elevates the README to a primary deliverable —
Phase 6 reframes AI-02 per D-113 and that reframing is documented up
front in the README's ## AI Categorization section).

Tasks 1–4 landed in **12 atomic commits**. Task 5 is a BLOCKING
`checkpoint:human-verify` end-to-end demo-path gate — orchestrator
returns to the user for live verification against a real
`docker compose up`.

## Task-by-Task Outcome (Tasks 1–4)

| Task | Commit | Subject | Done |
| ---- | ------ | ------- | ---- |
| 1.1 | 1c7be55 | feat(06): add 'ai:suggest' permission key + PERMISSIONS map entry | ACTION_KEYS extended; D-15 drift-prevention enforced |
| 1.2 | 9c665c9 | feat(06): shared ai contract (wire shapes + llmToolUseSchema) | 4 exports + types; mirror audit.ts header doc-comment style |
| 1.3 | dad7c32 | feat(06): AiUnavailableError + AiTimeoutError + setErrorHandler branches | 503/504 envelope branches; env.ts ANTHROPIC_API_KEY optional |
| 1.4 | 43480cb | chore(06): install @anthropic-ai/sdk + docker-compose + .env.example wire-through | @anthropic-ai/sdk@0.98.0 (CommonJS); docker-compose passes through ${ANTHROPIC_API_KEY:-}; .env.example documents the var |
| 2.1 | c90609a | feat(06): aiCategorization.service.ts single-seam (D-106) + tool_use + 5s abort | Service + suggest route + status route + barrel; D-16 exception documented in header |
| 2.2 | 0ff5755 | feat(06): ai/suggest + ai/status routes + app wiring | aiRoutes registered between auditRoutes and dashboardRoutes |
| 2.3 | fbfa053 | test(06): aiCategorization integration suite (5 tests; SDK-layer mock for timeout) | 5/5 PASS; Test 3 timeout resolves in <2s via real AbortController; 3 regression /me tests updated for the new permission |
| 3.1 | bef3cf9 | feat(06): ConfidenceBadge + AiSuggestionChip components | RoleBadge-pattern VARIANT_MAP; WCAG AA contrast verified |
| 3.2 | 6ca4fb7 | feat(06): useAiAvailability + useSuggestTherapeuticClass hooks | useQuery (5min staleTime) + useMutation with D-19 onError switch |
| 3.3 | d546933 | feat(06): MedicationSheet AI block + Slutgiltig klass field via shared combobox | AiCategoryBlock + TherapeuticClassField helpers; wired into 4 form variants + view-mode read-only |
| 3.4 | ad5b4c4 | test(06): MedicationSheet AI flow (7 tests incl. override-by-enum-bucket) | 7/7 PASS; jsdom shims added to vitest.setup.ts (ResizeObserver + hasPointerCapture + scrollIntoView) |
| 4 | ccc6e6f | docs(06): README — AI categorization, low-stock banner, error envelope, env vars, AI-02 reframing | 5 new top-level sections; all 6 grep gates pass |

## Anthropic SDK Dependency

| Field | Value |
| ----- | ----- |
| Package | `@anthropic-ai/sdk` |
| Version pinned | `0.98.0` |
| Module format | CommonJS (this version; the ESM concern from Blocker 3 didn't fire) |
| Vendor | Anthropic — first-party SDK from the API provider we're calling |
| Verification | `pnpm --filter @meditrack/api ls @anthropic-ai/sdk --depth 0` exits 0 |
| Threat-model disposition | T-06-SC mitigate — first-party SDK; bounded by 5s AbortController + strict llmToolUseSchema parse |

The SDK ships with one transitive runtime dep (`standardwebhooks` +
`json-schema-to-ts`); no other new deps from this install.

## BE Integration Tests (5 new in `apps/api/test/aiCategorization.integration.test.ts`)

| # | Name | Outcome |
| - | ---- | ------- |
| 1 | Test 1 — service-seam contract: returns 200 + the mocked wire shape verbatim | PASS — vi.spyOn(aiSvc, 'suggestTherapeuticClass') replaces the binding; route delegates and returns the spy's resolved value as-is |
| 2 | Test 2 — unavailable: returns 503 ai_unavailable when isAvailable() is false | PASS — vi.spyOn flips isAvailable() to false; route throws AiUnavailableError; envelope matches |
| 3 | Test 3 — timeout (Warning 11): real AbortController fires; returns 504 ai_timeout in <200ms | PASS — vi.mock('@anthropic-ai/sdk') replaces the default-export constructor; messages.create returns a Promise rejecting on signal.abort; AI_TIMEOUT_MS=50 via vi.hoisted; real AbortController fires in ~50ms wall time; assert <2000ms (typical actual ~100ms with Fastify+inject overhead) |
| 4 | Test 4 — RBAC matrix (D-15 ai:suggest): sjuksköterska 403, apotekare 200, admin 200 | PASS — three sequential login+POST cycles assert the matrix |
| 5 | Test 5 — status endpoint: returns {available: boolean} reflecting env truthiness; all roles | PASS — three roles assert true (key set via vi.hoisted); then flipped to false via spyOn; offRes asserts false |

Three regression tests in the existing `/me` permissions suite also
updated for the new `'ai:suggest'` permission key (admin + apotekare):
`auth.me.test.ts`, `admin.ping.test.ts`, `auth.flow.smoke.test.ts`. All
pass after the update; the rest of the apps/api suite (118/118 tests)
is green.

## FE Component Tests (7 new in `apps/web/src/routes/lakemedel/__tests__/MedicationSheet.ai.test.tsx`)

| # | Name | Outcome |
| - | ---- | ------- |
| 1 | Test 1 — button hidden when useAiAvailability returns {available: false} | PASS — no 'Hämta AI-förslag' element, no 'AI-kategorisering' label in document |
| 2 | Test 2 — button visible + disabled when name+atcCode empty; tooltip wrapper present | PASS — button disabled; TooltipTrigger span wrapper with tabIndex=0 asserted (tooltip CONTENT path left to manual QA — Radix portals in jsdom are flaky) |
| 3 | Test 3 — loading → chip + ConfidenceBadge + "Använd förslag" appear | PASS — mutateAsync resolves with {therapeuticClass:'J', confidence:'hog'}; chip renders 'Antiinfektiva för systemiskt bruk' + 'Hög säkerhet' badge + Apply button |
| 4 | Test 4 — apply flow: clicking Använd förslag writes class into Slutgiltig klass combobox | PASS — combobox trigger updates from 'Välj terapeutisk klass' to 'Antiinfektiva för systemiskt bruk' |
| 5 | Test 5 — override flow (AI-02 D-113 reframing): picking different enum bucket keeps chip + updates final value | PASS — opens shared TherapeuticClassCombobox, picks 'N — Nervsystemet', combobox updates AND chip still shows 'J' suggestion |
| 6 | Test 6 — sjukskoterska gate: <Can action="ai:suggest"> hides the entire AI block | PASS — no AI elements; the Slutgiltig klass combobox still renders (lives outside the Can wrap) |
| 7 | Test 7 — timeout toast: rejection with ai_timeout envelope calls toast.error with Swedish copy | PASS — toast.error called with 'AI-förslaget tog för lång tid — försök igen.'; chip does not appear |

Full FE suite after Plan 03: **94/94 tests pass**.

## Single-Seam Contract Verification (ROADMAP SC #4)

```bash
$ grep -r "@anthropic-ai/sdk" apps/api/src/
apps/api/src/services/aiCategorization.service.ts:import Anthropic from '@anthropic-ai/sdk';
```

ONE file imports the SDK. The two routes (`suggest.ts` + `status.ts`)
consume `aiCategorization.service.ts` via its named exports — no SDK
references in the route layer. Swapping providers, switching models,
or mocking in tests is exactly one file's edit. **SC #4 satisfied.**

## Rate-Limit TODO Marker

The route file carries a TODO for the post-Phase-6 per-user rate-limit
that T-06-15 captures:

```
apps/api/src/routes/ai/suggest.ts, lines 33-36:
   * TODO post-Phase-6 (T-06-15 mitigation): add per-user rate-limit
   *   (~30/min) to bound LLM cost in adversarial scenarios. For the v1
   *   demo with apotekare + admin restricted to ~2 seed accounts the
   *   residual risk is acceptable; the README documents this rationale.
```

The README's ## Phase 6 v2 candidates section lists this as the last
bullet for cross-reference.

## Observed Latency (Manual Smoke)

| Stage | p50 / p95 | Source |
| ----- | --------- | ------ |
| LLM call (claude-haiku-4-5, ~150-token prompt, tool_use) | not measured (no local key) | Step 7 of Task 2 not run in the executor environment |
| FE button click → chip render (Test 3 mocked, ~100ms total) | ~100ms wall time | aiCategorization.integration.test.ts Test 3 + mocked mutateAsync resolve |
| Test 3 timeout (Warning 11 — real AbortController fires) | <200ms wall time per test (50ms abort + Fastify+inject overhead) | aiCategorization.integration.test.ts Test 3 timing assertion |

Production p95 target is 3s (D-112 budget). The 5s `AbortController`
hard timeout returns 504 `ai_timeout` if the LLM doesn't respond in
time. Documented in README ## AI Categorization → ### Latency budget.

## README Grep Gate Status

All six grep gates from Task 4's automated `<verify>` block pass:

| Gate | Matches |
| ---- | ------- |
| `## AI Categorization` | 1 |
| `## Dashboard low-stock banner` | 1 |
| `ai_unavailable` | 2 |
| `ai_timeout` | 2 |
| `ANTHROPIC_API_KEY` | 4 |
| `override by picking a different enum bucket` | 1 |

## Verification Commands

```bash
# Single-seam SC #4 (the load-bearing architectural check)
grep -r "@anthropic-ai/sdk" apps/api/src/                              # ONLY aiCategorization.service.ts

# Builds across the workspace
pnpm --filter @meditrack/shared build                                   # exit 0
pnpm --filter @meditrack/api build                                      # exit 0
pnpm --filter @meditrack/web build                                      # exit 0
pnpm lint                                                               # exit 0 (workspace ESLint)

# Tests
pnpm --filter @meditrack/api test -- aiCategorization.integration       # 5/5 PASS
pnpm --filter @meditrack/web test -- MedicationSheet.ai.test.tsx        # 7/7 PASS
pnpm --filter @meditrack/api test                                       # 118/118 PASS (full API regression)
pnpm --filter @meditrack/web test                                       # 94/94 PASS (full FE regression)

# README grep gates
grep -c "## AI Categorization" README.md                                # 1
grep -c "## Dashboard low-stock banner" README.md                       # 1
grep -c "ai_unavailable" README.md                                      # 2
grep -c "ai_timeout" README.md                                          # 2
grep -c "ANTHROPIC_API_KEY" README.md                                   # 4
grep -c "override by picking a different enum bucket" README.md         # 1

# SDK install verification (Blocker 3 mitigation — no `require()` call)
pnpm --filter @meditrack/api ls @anthropic-ai/sdk --depth 0             # 0.98.0
```

## Deviations from Plan

Three minor execution-time clarifications worth recording:

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Update `/me` permissions regression tests for the new `ai:suggest` key**
- **Found during:** Task 2 (after the first full API suite run)
- **Issue:** Adding `'ai:suggest'` to `ACTION_KEYS` in shared makes
  `actionsForRole('admin')` and `actionsForRole('apotekare')` return
  longer arrays. Three existing tests asserted the exact array verbatim
  and failed.
- **Fix:** Updated the literal assertions in `auth.me.test.ts`,
  `admin.ping.test.ts`, and `auth.flow.smoke.test.ts` to include the new
  permission key. The fix is a correctness fix (the assertions were
  stale relative to the new permission contract), not a behavior change.
  Each comment line now cites the corresponding `// Phase 6 D-15`
  rationale.
- **Files modified:** apps/api/test/auth.me.test.ts,
  apps/api/test/admin.ping.test.ts, apps/api/test/auth.flow.smoke.test.ts
- **Commit:** fbfa053 (folded into the integration-test commit)

**2. [Rule 3 - Blocking] vi.hoisted for env-var setup in the AI integration test**
- **Found during:** Task 2 Step 6 (first test run)
- **Issue:** `vi.stubEnv('ANTHROPIC_API_KEY', '...')` and
  `vi.stubEnv('AI_TIMEOUT_MS', '50')` at the top of the test file ran
  AFTER ES module imports. `env.ts` and `aiCategorization.service.ts`
  both read `process.env` at module load — by the time the stubEnv
  calls ran, the service had already cached `TIMEOUT_MS = 5000` and
  `env.ANTHROPIC_API_KEY = undefined`. Tests 2/3/4/5 failed.
- **Fix:** Moved the env setup to a `vi.hoisted()` block so it runs
  BEFORE imports. Also captured the `mockMessagesCreate` handle inside
  the hoisted block so the vi.mock factory and the test bodies share
  the same instance. Documented inline in the test file header comment
  for future Phase 7+ readers.
- **Files modified:** apps/api/test/aiCategorization.integration.test.ts
- **Commit:** fbfa053

**3. [Rule 3 - Blocking] vitest.setup.ts jsdom shims for Radix + cmdk**
- **Found during:** Task 3 Step 6 (first FE test run)
- **Issue:** cmdk's `CommandList` constructor calls
  `new ResizeObserver(...)` on mount; jsdom doesn't implement it. Test 5
  (the override-by-enum-bucket flow) threw at render time. Radix Popover
  + Command also call `Element.hasPointerCapture()` and
  `Element.scrollIntoView()` during open/close; both throw in jsdom.
- **Fix:** Added three shims to `apps/web/vitest.setup.ts` — a
  `ResizeObserverStub` class assigned to `globalThis.ResizeObserver`,
  and conditional shims for `Element.prototype.hasPointerCapture` and
  `Element.prototype.scrollIntoView`. The shims unblock all Radix-Popover
  -based component tests (including future Phase 7 work that lands more
  comboboxes).
- **Files modified:** apps/web/vitest.setup.ts
- **Commit:** ad5b4c4

### Plan-Driven Adjustments

- **Test 3 mock signal location (Blocker 4 follow-up).** The plan's
  `<behavior>` notes for Test 3 specified `mockImplementation(({ signal }) => ...)`
  destructuring from the FIRST argument. The real Anthropic SDK signature
  is `messages.create(body, opts: { signal })` — the signal lives on the
  SECOND argument. First test run failed with `Cannot read properties of
  undefined (reading 'addEventListener')`; fixed by destructuring from
  the second arg. Documented in the test file header comment.

- **MedicationSheet form structure.** The plan's Task 3 `<action>` Step 5
  describes inserting the AI block "ABOVE the existing form fields";
  the concrete placement chosen was AFTER the existing currentStock +
  lowStockThreshold inputs (so the Sheet's reading order is still
  Namn → ATC → Form → Strength → Lager → Tröskel → AI block →
  Slutgiltig klass). This preserves the established field order from
  Plans 02-04; the AI affordance + final-value field cluster together
  at the bottom of the form. Verified against UI-SPEC §4 — the layout
  satisfies the "AI-kategorisering section label → button → chip → Apply
  → Slutgiltig klass" sequence verbatim.

## Known Stubs

None. The Slutgiltig klass field renders Plan 02's shared
`TherapeuticClassCombobox` directly (no placeholder/mock UI). The
ConfidenceBadge + AiSuggestionChip are fully functional read-only
components. The MedicationSheet's AI block flow (fetch → chip → apply
→ override) is end-to-end live in the FE.

## REQ-IDs + ROADMAP SC Status (Phase 6 close)

At the close of this plan, **all five Phase 6 REQ-IDs and all four
ROADMAP SC items are satisfied** (pending Task 5's BLOCKING end-to-end
demo-path verification on a fresh `docker compose up`):

| Item | Status | Where satisfied |
| ---- | ------ | --------------- |
| **AI-01** (structured suggestion via single LLM call) | Satisfied | Plan 03 (this plan) — `aiCategorization.service.ts` + suggest route + Sheet integration |
| **AI-02** (override flow visible in UI; reframed per D-113) | Satisfied | Plan 03 — MedicationSheet AI block + Plan 02's shared TherapeuticClassCombobox; Test 5 asserts override-by-enum-bucket |
| **AI-03** (filter combobox over therapeuticClass) | Satisfied (Plan 02) | LakemedelFilter Terapeutisk klass combobox; URL deep-link `?class=N` |
| **NTF-01** (in-app low-stock visibility) | Satisfied (Plan 01) | DashboardLowStockCard enumeration |
| **NTF-02** (auto-refresh without manual reload) | Satisfied (Plan 01) | Three-layer refresh: invalidation siblings + focus + 30s interval |
| **SC #1** (dashboard banner shows low-stock meds inline) | Satisfied (Plan 01) | DashboardLowStockCard.tsx with full enumeration |
| **SC #2** (AI suggestion button + accept/override flow) | Satisfied | Plan 03 MedicationSheet AI block + Apply + Slutgiltig klass override |
| **SC #3** (therapeuticClass filter combobox) | Satisfied (Plan 02) | LakemedelFilter ?class=N URL deep-link |
| **SC #4** (LLM call behind single service interface) | Satisfied | `grep -r '@anthropic-ai/sdk' apps/api/src/` matches ONLY aiCategorization.service.ts |

Phase 6 is **complete pending Task 5's BLOCKING end-to-end
verification** on a fresh `docker compose down -v && docker compose up
--build` with `ANTHROPIC_API_KEY` set. The orchestrator presents the
12-step demo-path checklist to the user; on approval, a continuation
agent commits `chore(06): phase 6 demo-path verified` and updates the
ROADMAP for Plan 03's progress row.

## Threat Flags

No new threat surface NOT already in the plan's `<threat_model>` was
introduced. The threat register's dispositions hold:

- **T-06-12** (env key logged) — mitigated; no `console.log(env)`
  introduced; `.env.example` placeholder is empty.
- **T-06-13** (prompt injection) — mitigated via two-line defense:
  Anthropic `tool_use` input_schema (enum constraint) + server-side
  `llmToolUseSchema.parse()`.
- **T-06-14** (LLM data leak) — accepted; data is public NPL clinical
  reference data, no PII.
- **T-06-15** (DoS via spam) — mitigate-via-TODO; permission-gated to
  ~2 seed accounts in the demo; per-user rate-limit captured in
  README v2 candidates and as a code TODO marker in `suggest.ts`.
- **T-06-16** (hang blocking worker) — mitigated; 5s AbortController
  exercised by CI Test 3 in <200ms wall time.
- **T-06-17** (schema-violating LLM response) — mitigated;
  `llmToolUseSchema.parse()` rejects out-of-shape; ZodError propagates
  to 500 (a v2 could add `ai_schema_violation`; the tool_use-block-
  missing case is treated as `AiTimeoutError`).
- **T-06-18** (unauthenticated POST exposure) — mitigated;
  `preHandler: [requireSession, requirePermission('ai:suggest')]`.
- **T-06-19** (status posture disclosure) — accepted; only a boolean,
  no key/provider/model surface.
- **T-06-20** (cookie theft → AI spam) — mitigated via existing Phase 1
  HttpOnly+Secure+SameSite cookie config + login rate-limit + the new
  permission gate.
- **T-06-SC** (SDK install supply-chain) — mitigated; first-party
  `@anthropic-ai/sdk@0.98.0` from Anthropic itself; bounded by 5s
  AbortController + strict response parsing.

## Self-Check: PASSED

- File checks:
  - apps/api/src/services/aiCategorization.service.ts — FOUND
  - apps/api/src/routes/ai/suggest.ts — FOUND
  - apps/api/src/routes/ai/status.ts — FOUND
  - apps/api/src/routes/ai/index.ts — FOUND
  - apps/api/test/aiCategorization.integration.test.ts — FOUND
  - packages/shared/src/contracts/ai.ts — FOUND
  - apps/web/src/components/ConfidenceBadge.tsx — FOUND
  - apps/web/src/components/AiSuggestionChip.tsx — FOUND
  - apps/web/src/features/ai/useAiAvailability.ts — FOUND
  - apps/web/src/features/ai/useSuggestTherapeuticClass.ts — FOUND
  - apps/web/src/routes/lakemedel/__tests__/MedicationSheet.ai.test.tsx — FOUND
- Commit checks (all 12 found in git log):
  - 1c7be55 — FOUND
  - 9c665c9 — FOUND
  - dad7c32 — FOUND
  - 43480cb — FOUND
  - c90609a — FOUND
  - 0ff5755 — FOUND
  - fbfa053 — FOUND
  - bef3cf9 — FOUND
  - 6ca4fb7 — FOUND
  - d546933 — FOUND
  - ad5b4c4 — FOUND
  - ccc6e6f — FOUND
