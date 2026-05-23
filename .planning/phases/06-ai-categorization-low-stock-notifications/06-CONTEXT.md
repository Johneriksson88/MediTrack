# Phase 6: AI Categorization & Low-Stock Notifications - Context

**Gathered:** 2026-05-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Two differentiating features land on top of the working core, both visible from the dashboard / medication catalog.

**Feature 1 — AI Categorization.** A `therapeuticClass` column lands on the global `Medication` table (closed enum of the 14 ATC level-1 anatomical groups: A, B, C, D, G, H, J, L, M, N, P, R, S, V). In the Create/Edit medication Sheet, a "Hämta AI-förslag" button calls Anthropic Claude (`claude-haiku-4-5`) with the medication's `name` + `atcCode` and receives a structured `{therapeuticClass, confidence}` payload. The UI renders a read-only "AI-förslag" chip + a Hög/Medel/Låg confidence badge next to a free-text "Slutgiltig klass" field; an "Använd förslag" button copies the AI value into the user field so accept vs override is visually explicit and auditable. The chosen class persists on `Medication` and becomes the fourth combobox in `LakemedelFilter.tsx` (positioned left of ATC).

**Feature 2 — Dashboard Low-Stock Banner.** `apps/web/src/routes/dashboard/DashboardPage.tsx` currently renders an `<EmptyStateCard>` stub. Phase 6 replaces it with a banner card that **enumerates every** `CareUnitMedication` in the user's `vårdenhet` whose `currentStock < lowStockThreshold` — name, current stock, threshold, sortable, scrollable inline. Driven by a new `GET /api/dashboard/low-stock` endpoint with its own cache key (`['dashboard', 'low-stock']`); auto-refreshes via three layers: existing `useDeliverOrder` invalidation (in-tab), TanStack `refetchOnWindowFocus` (Alt-tab back), and a 30-second `refetchInterval` (left open).

**In scope (Phase 6 only — REQ-IDs AI-01, AI-02, AI-03, NTF-01, NTF-02):**

- Prisma migration `0012_medication_therapeutic_class`: Postgres `TherapeuticClass` enum (`A`, `B`, `C`, `D`, `G`, `H`, `J`, `L`, `M`, `N`, `P`, `R`, `S`, `V`); add nullable `therapeuticClass TherapeuticClass?` column to `Medication`; index `@@index([therapeuticClass])` (single-column, supports filter combobox); no backfill of the 43,538 NPL seed rows (D-115).
- `packages/shared/src/constants/therapeuticClass.ts`: string union + Swedish label map mirroring `auditAction.ts` / `orderStatus.ts` (`THERAPEUTIC_CLASSES`, `THERAPEUTIC_CLASS_LABELS: Record<TherapeuticClass, string>`). Swedish labels: `A = Mag–tarm och ämnesomsättning`, `B = Blod och blodbildande organ`, `C = Hjärta och kretslopp`, `D = Hud`, `G = Urin- och könsorgan, sexualhormoner`, `H = Hormonsystemet (exkl. könshormoner)`, `J = Antiinfektiva för systemiskt bruk`, `L = Tumörer och immunmodulering`, `M = Muskler och skelett`, `N = Nervsystemet`, `P = Antiparasitära medel`, `R = Andningsorganen`, `S = Ögon och öron`, `V = Övrigt`.
- `packages/shared/src/contracts/medication.ts`: extend `medicationListItem` with `therapeuticClass: TherapeuticClass | null`; extend `medicationListQuery` with optional `therapeuticClass?: TherapeuticClass`; extend `medicationUpdateRequest` and `medicationCreateUserRequest` and `medicationCreateFromNplRequest` with optional `therapeuticClass?: TherapeuticClass | null`.
- `packages/shared/src/contracts/ai.ts` (new): `aiSuggestionRequest` (name + atcCode, both `.min(1)`) and `aiSuggestionResponse` (`{therapeuticClass: TherapeuticClass, confidence: 'hog' | 'medel' | 'lag'}`).
- `apps/api/src/env.ts`: add `ANTHROPIC_API_KEY: z.string().optional()` to envSchema (D-107). NO `.min(1)` — empty/missing is the documented graceful-degradation mode.
- `apps/api/src/services/aiCategorization.service.ts` (new): single exported interface satisfying ROADMAP SC #4 (one file, one swap-point for providers/mocks):
  - `isAvailable(): boolean` — returns `env.ANTHROPIC_API_KEY !== undefined` (D-108).
  - `suggestTherapeuticClass(input: {name: string, atcCode: string}): Promise<{therapeuticClass: TherapeuticClass, confidence: 'hog' | 'medel' | 'lag'}>` — calls Anthropic Messages API with `claude-haiku-4-5`, `tool_use` structured output (tool schema = the enum + confidence band), 5-second `AbortController` timeout. Throws `AiSuggestionError` on missing key, timeout, network error, schema-violating response, or rate limit.
  - Internal: a private `categorizerImpl` const that the file exports as the single seam. Swapping providers (OpenAI, deterministic mock for tests) is exactly one file's worth of edits.
- `apps/api/src/routes/ai/suggest.ts` (new): `POST /api/ai/suggest-therapeutic-class` — `requirePermission('medication:create')` (anyone who can create a medication can fetch an AI suggestion); body is `aiSuggestionRequest`; returns `aiSuggestionResponse` on success; returns `503 ai_unavailable` envelope `{error: {code: 'ai_unavailable', message: 'AI-tjänsten är inte tillgänglig.'}}` when `isAvailable()` is false; returns `504 ai_timeout` envelope when the LLM exceeds 5s.
- `apps/api/src/services/medication.service.ts`: extend `createCareUnitMedication`, `updateCareUnitMedication`, and (for the NPL create path) the underlying `Medication` lookup to write/update `therapeuticClass`. NPL meds: `therapeuticClass` is settable independently of the NPL-locked name/ATC/form/strength (D-32 carve-out: classification is metadata, not pharmaceutical identity).
- `apps/api/src/services/medication.service.ts` extends `listMedicationsForUnit` filter chain with the new `therapeuticClass` predicate (joined via existing `medicationWhereConditions`).
- `apps/api/src/services/dashboard.service.ts` (new): `listLowStockForUnit(careUnitId): Promise<{rows: LowStockItem[], total: number}>` — same `currentStock < lowStockThreshold` `$queryRaw` as `belowThresholdTotal` (D-44), no pagination, scoped to `req.user.careUnitId`.
- `apps/api/src/routes/dashboard/lowStock.ts` + `apps/api/src/routes/dashboard/index.ts` (new): `GET /api/dashboard/low-stock` — `requireSession` only (all three roles see the dashboard); no query params.
- `packages/shared/src/contracts/dashboard.ts` (new): `lowStockItem` (name + careUnitMedicationId + medicationId + currentStock + lowStockThreshold + therapeuticClass), `lowStockListResponse` (`{rows, total}`).
- `apps/web/src/features/ai/useSuggestTherapeuticClass.ts` (new): `useMutation<AiSuggestionResponse, ApiError, AiSuggestionRequest>`; the medication Sheet calls this on "Hämta AI-förslag" click.
- `apps/web/src/features/ai/useAiAvailability.ts` (new): `useQuery<{available: boolean}>` against a new `GET /api/ai/status` (or piggyback `/me` — D-108 punts the implementation to Claude's discretion, see Decisions). Drives the conditional render of the AI button.
- `apps/web/src/components/AiSuggestionChip.tsx` (new): the read-only chip showing `Förslag: <class label>` + the Hög/Medel/Låg `<Badge>`; receives an `onApply` callback for the "Använd förslag" button.
- `apps/web/src/components/ConfidenceBadge.tsx` (new): three-band `<Badge variant={hog|medel|lag}>` Swedish-labeled (`Hög säkerhet` / `Medel säkerhet` / `Låg säkerhet`). Mapping from raw LLM confidence (assumed 0..1): `>= 0.85 → hog`, `>= 0.6 → medel`, `< 0.6 → lag` (mapping happens server-side inside `aiCategorization.service.ts` so the wire format is the band string, not the raw float — keeps the UI honest about precision).
- `apps/web/src/routes/lakemedel/MedicationSheet.tsx`: extend create + edit mode with the AI-suggestion two-field layout (D-110). New shared form state: `aiSuggestion: AiSuggestionResponse | null`, `therapeuticClass: TherapeuticClass | null` (the final user value). The "Hämta AI-förslag" button is disabled when `name` is empty OR `atcCode` is empty OR `useAiAvailability().data?.available === false` — tooltip explains why.
- `apps/web/src/routes/lakemedel/LakemedelFilter.tsx`: add a fourth `<Combobox>` "Terapeutisk klass" positioned LEFT of the ATC combobox (D-116). URL param `?class=N` (single-letter code matches Postgres enum value). Clear-button included; combines AND with existing filters.
- `apps/web/src/routes/dashboard/DashboardPage.tsx`: replace the `EmptyStateCard` stub with `<DashboardLowStockCard />`.
- `apps/web/src/routes/dashboard/DashboardLowStockCard.tsx` (new): the banner card. Uses `useLowStockQuery` with `refetchOnWindowFocus: true` and `refetchInterval: 30_000` (D-119). Empty state when `total === 0`: celebratory `EmptyStateCard` reuse with `<CheckCircle2 className="text-emerald-600" />` and heading `Alla läkemedel är över tröskel.`.
- `apps/web/src/features/dashboard/useLowStockQuery.ts` (new): TanStack `useQuery<LowStockListResponse>` against `/api/dashboard/low-stock`, query key `['dashboard', 'low-stock']`.
- `apps/web/src/features/orders/useOrderMutations.ts`: extend `useDeliverOrder.onSuccess` to also invalidate `['dashboard', 'low-stock']` (the existing `invalidateQueries(['medications'])` line at apps/web/src/features/orders/useOrderMutations.ts:358 is preserved; add the dashboard key alongside it — D-119).
- `apps/web/src/features/medications/useMedicationMutations.ts`: extend create + update + delete `.onSuccess` to invalidate `['dashboard', 'low-stock']` (any stock or threshold edit can flip the under-threshold predicate; D-119).
- `packages/shared/src/contracts/permissions.ts`: append `'ai:suggest'` to `ACTION_KEYS` (restricted to `['apotekare', 'admin']` in BE `PERMISSIONS`); FE `<Can action="ai:suggest">` gates the AI button as defense-in-depth alongside `isAvailable()`. D-15 drift-prevention enforces the map entry.
- `.env.example` (new at repo root): documents `ANTHROPIC_API_KEY=` placeholder + a one-line comment `# Optional. When set, the medication Sheet shows the 'Hämta AI-förslag' button.`. `docker-compose.yml` reads via `${ANTHROPIC_API_KEY:-}` so a missing variable doesn't fail the api service.
- Phase 5 audit allowlist (`apps/api/src/db/auditAllowlist.ts`) extended: `Medication.therapeuticClass` added so changes are visible in the audit diff. No new audit action; `update` events automatically capture before/after of the new field via the existing `$extends` middleware (D-95 diff-at-read survives schema additions — verified live in Phase 5).
- Integration tests in `apps/api/test/aiCategorization.integration.test.ts`:
  1. **Service interface contract** — mock `categorizerImpl` returns a fixed payload; assert `POST /api/ai/suggest-therapeutic-class` returns 200 with the expected shape.
  2. **Unavailable path** — set `ANTHROPIC_API_KEY=''`; assert `isAvailable() === false`; assert `POST /api/ai/suggest-therapeutic-class` returns 503 `ai_unavailable`.
  3. **Timeout path** — mock impl returns a never-resolving Promise; assert the endpoint returns 504 `ai_timeout` within 6 seconds (5s timeout + ~1s slack).
  4. **RBAC** — `sjukskoterska` returns 403; `apotekare` returns 200; `admin` returns 200.
- Integration tests in `apps/api/test/dashboard.integration.test.ts`:
  1. Seeded vårdenhet returns >0 low-stock rows; the row shapes match the contract.
  2. Cross-careUnit isolation: log in as a second vårdenhet's user; the row set differs (T-02-01 carry-over).
  3. After `POST /api/orders/:id/deliver` (stock incremented), a subsequent `GET /api/dashboard/low-stock` returns a smaller row count for the affected meds.
- Web tests in `apps/web/src/routes/lakemedel/__tests__/MedicationSheet.ai.test.tsx`:
  - Button hidden when `useAiAvailability().data?.available === false`.
  - Click "Hämta AI-förslag" → loading state → chip appears with class label + confidence badge.
  - Click "Använd förslag" → `therapeuticClass` field populates with the suggestion value.
  - User can edit the field after applying (override flow).
- Web tests in `apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx`:
  - Empty state when `total === 0`.
  - Non-empty: lists every row with correct stock/threshold/name.
  - `refetchOnWindowFocus` + 30s interval are configured (assert via TanStack QueryClient inspection, not by waiting).
- README known-gap line: "AI categorization runs only when `ANTHROPIC_API_KEY` is set in `.env`. The 43,538 seeded NPL meds start without a therapeutic class — backfilling at seed time would cost ~$4 in API calls per fresh `docker compose up`, which is too aggressive for a demo environment. The 'Hämta AI-förslag' button populates rows on-demand; an admin batch-categorize job is a v2 idea."

**Out of scope (other phases / v2):**

- **Backfill of 43k NPL seed meds at seed time** — explicit out-of-scope (cost, latency, demo brittleness). The dashboard demo shows on-demand classification; bulk admin tooling is a v2 deferred idea.
- **Email/SMS/push notifications for low-stock** — explicit per PROJECT.md; in-app banner is the v1 surface.
- **Real-time SSE/WebSocket banner updates** — explicit per PROJECT.md. 30s polling + window-focus + on-mutation invalidation is the v1 freshness story.
- **AI predictive restock + chatbot** — v2 per PROJECT.md (AI-04, AI-05).
- **AI suggestion audit as a distinct action** (e.g., `medication.ai_suggested`) — punted; the existing Phase 5 `update` event with diff-at-read (D-95) already captures `therapeuticClass: null → 'J'` clearly. A distinct action would over-engineer the audit story for marginal forensic value. See Deferred Ideas.
- **Open-ended therapeutic class string** — explicit rejected in D-113; closed enum is the chosen taxonomy.
- **Per-row "Beställ" CTA inside the dashboard banner** (deep-link to compose-order preloaded with the low-stock med) — scope creep; tracked in Deferred Ideas. The brief's NTF-01 only asks for visibility, not action.
- **Severity gradient coloring on banner rows** (red < 25% of threshold, amber < 50%, etc.) — polish; punted to Deferred Ideas.
- **Per-language label override or i18n framework** — Swedish labels are hard-coded per Phase 1 convention; React-intl/i18next adoption is v2.
- **Caching AI suggestions by `(name, atcCode)`** — the LLM call is fast + cheap + idempotent for this input; a real cache adds a Postgres table or in-memory LRU for marginal speedup at the cost of stale-suggestion bugs. Punted unless cost during the demo becomes a problem.
- **Different AI provider on the same single-service interface** — the SC #4 contract is "swappable", not "actually swap during Phase 6". OpenAI/local-mock variants are tested via the `categorizerImpl` seam in unit tests; only Anthropic ships in v1.
- **Confidence-aware UI thresholds** (e.g., low-confidence suggestions don't auto-fill) — D-111 keeps it simple: every suggestion is shown with a band; user always has to click Apply explicitly. No confidence-gating logic.

</domain>

<decisions>
## Implementation Decisions

### LLM Provider + Service Interface (ROADMAP SC #4)

- **D-106:** **Anthropic Claude with `claude-haiku-4-5` behind a single-service interface.** `apps/api/src/services/aiCategorization.service.ts` exports `{isAvailable, suggestTherapeuticClass}` — swapping providers (OpenAI, deterministic mock for tests) is one file's worth of edits. Haiku is the right cost/latency profile for a name+ATC→one-of-14-buckets call (~1s typical, <$0.0001/call). Sonnet/Opus are wildly overkill. OpenAI is a defensible alternative but using Anthropic in a one-week build that's literally being reviewed by AI-first Medovia (PROJECT.md §1) is a deliberate signal.

- **D-107:** **`ANTHROPIC_API_KEY` is OPTIONAL at startup.** `apps/api/src/env.ts` adds `ANTHROPIC_API_KEY: z.string().optional()` to `envSchema` — no `.min(1)`. `.env.example` documents the variable with a single-line comment. The brief's golden command `docker compose up` continues to work on a fresh clone without any API key configured. The AI feature degrades gracefully (D-108). Hard-requiring the key was rejected because it breaks the "just run docker compose up" reviewer experience over a feature that's an optional anyway.

- **D-108:** **AI affordance is conditionally rendered via `isAvailable()`.** When `env.ANTHROPIC_API_KEY` is undefined, the FE hides the "Hämta AI-förslag" button entirely (it doesn't render as disabled, doesn't show an error toast, doesn't reserve layout space). The dashboard banner and the medication catalog still work unchanged — they're not LLM-dependent. Reviewer experience on a fresh clone without a key: the app feels like the "v1 without AI"; once a key is added, the AI affordance appears. Two implementation alternatives for surfacing availability to the FE (Claude's discretion below): (a) a new `GET /api/ai/status` endpoint, OR (b) widen the existing `/me` response with `aiAvailable: boolean`. Either works; both keep the FE check to a single TanStack query call.

### AI Suggestion UX in the Medication Sheet

- **D-109:** **Manual button trigger — "Hämta AI-förslag".** No debounced field-blur calls, no on-save auto-categorization. The button is explicit user opt-in: click → spinner → result. Cheapest implementation, cleanest demo (reviewer clicks and watches), zero wasted API calls. Disabled (with tooltip) when `name` or `atcCode` is empty OR `isAvailable()` is false. The on-save server-side option was rejected because it strips the visible "accept or override" affordance from AI-02, which is the whole point of that requirement.

- **D-110:** **Two-field layout with explicit Apply button.** The Sheet shows two adjacent rows:
  1. Read-only `<AiSuggestionChip>` rendering `Förslag: <Swedish class label>` + a `<ConfidenceBadge>` (Hög/Medel/Låg). When no suggestion has been fetched yet, this row collapses (no chip, no badge — just the button).
  2. Free-text `<Input>` "Slutgiltig klass" (the user's authoritative value, written to `therapeuticClass`).
  3. Between (1) and (2): an `<Button variant="outline">` "Använd förslag" that copies the chip's class into the input field. Click → input populated; user can immediately edit (override).
  
  This layout makes "I overrode the AI" *visible to the user* — they see the chip and the field, side-by-side, never auto-merged. It's also visible to the audit log: the `Medication.update` event records the resulting `therapeuticClass`, and if the value differs from the chip's suggestion (which we don't persist anywhere), the discrepancy is a behavior story for the README. Single-field pre-fill (the workflow's recommendation) was rejected because the override path becomes invisible — the user erases the AI value and the rationale lives only in their head. Inline ghost-text was rejected as a11y-fiddly and unusual in form UX.

- **D-111:** **Confidence rendered as a discrete Hög/Medel/Låg badge.** The raw confidence float from the LLM (assumed 0..1) is bucketed server-side inside `aiCategorization.service.ts` — `>= 0.85 → hog`, `>= 0.6 → medel`, `< 0.6 → lag` — and only the band string ships in `aiSuggestionResponse`. This (a) keeps the wire format honest about LLM self-reported confidence (an LLM saying "92%" is theater, not measurement), (b) reads cleaner in Swedish than a percentage, and (c) makes the contract trivial to mock in tests. The shared TS type is `'hog' | 'medel' | 'lag'`; `<ConfidenceBadge>` renders with shadcn `Badge` variants (`hog → green`, `medel → amber`, `lag → outline`). Hiding confidence entirely was rejected because the band IS the honesty signal that lands well in interview review.

- **D-112:** **3-second p95 latency budget, 5-second hard timeout.** Service-layer `AbortController` aborts the Anthropic call at 5 seconds; the route returns 504 `ai_timeout`. The README documents the budget under §AI categorization. Test 3 in `aiCategorization.integration.test.ts` asserts the timeout with a stubbed never-resolving impl. Haiku 4.5 routinely returns <1s for a structured-output call this small — 3s p95 is comfortable even with cold-start / first-request noise on the demo network. 1s p95 was rejected as brittle; 5s/10s was rejected as a "we didn't bother" signal.

### Therapeutic Class Taxonomy

- **D-113:** **Closed enum of 14 ATC level-1 anatomical groups.** Values: `A`, `B`, `C`, `D`, `G`, `H`, `J`, `L`, `M`, `N`, `P`, `R`, `S`, `V`. Swedish labels (see §"In scope" above for the full list) follow the WHO ATC anatomical-group naming. The LLM is constrained via `tool_use` to return one of the 14 codes — no free-text, no out-of-list values, no hallucinated categories. AI-02's "override with free text" is reframed as "override by picking a different bucket from the same list" — defensible in the interview because (a) free-text breaks AI-03's filter combobox (spelling drift across 'Antibiotika', 'Antibiotikum', 'Antibiotic'), and (b) ATC level-1 is an international clinical standard since 1976. The closed enum is the right model for the domain. Hybrid (closed enum + "Annat" overflow) was rejected as scope creep — adds a second column for an edge case that ATC level-1 already covers via `V = Övrigt`.

- **D-114:** **Postgres enum + Prisma enum + shared TS string union.** Migration `0012_medication_therapeutic_class` creates `TherapeuticClass` Postgres enum; Prisma generates the matching TS enum; `packages/shared/src/constants/therapeuticClass.ts` exports a string union + Swedish label map that mirrors the `auditAction.ts` / `orderStatus.ts` pattern. Data integrity is DB-enforced at INSERT time — a regression that smuggles `'NOPE'` into the column is rejected by Postgres. Plain String + TS union (the Phase 5 D-97 pattern for `entityType` / `action`) was considered but rejected: those Phase 5 columns are open sets that future phases legitimately extend; the 14 ATC anatomical groups are a stable international standard, so the slight rigidity of a DB enum is the correct tradeoff. FK to a lookup table was rejected as scope creep — 14 static categories don't earn a row-per-category table.

- **D-115:** **`therapeuticClass` lives on `Medication` (global), nullable.** A drug's therapeutic class is a property of the molecule, not of where it's stocked — paracetamol is `N` (Nervsystemet) everywhere. Putting it on `CareUnitMedication` would model the domain incorrectly. Nullable because 43,538 seeded NPL meds start unset (no seed-time backfill per Out-of-Scope), and user-created meds start null until the user clicks "Hämta AI-förslag". The audit allowlist (Phase 5 D-97) is extended to include `therapeuticClass`; Phase 5 D-95 (diff-at-read) means the new column survives schema-additions verbatim — old audit rows simply don't show the field.

- **D-116:** **Filter combobox positioned LEFT of the existing ATC combobox.** `LakemedelFilter.tsx` order from left to right: `Terapeutisk klass` (broadest semantic filter) → `ATC` (narrower code-prefix filter) → `Form` (physical property) → `Visa endast under tröskel` (boolean toggle). The reading order goes broad → narrow → physical → boolean, matching how a user would mentally narrow a search. URL param `?class=N` (single-letter code matches Postgres enum value). Single-select (matches the 14-entry enum perfectly — multi-select would invite "antibiotics AND nervsystem" queries that don't map to any real clinical workflow). Mobile (<md): collapses into the existing horizontally-scrollable filter strip alongside the other comboboxes. Replacing ATC with the new filter was rejected — Phase 2 already shipped ATC and removing it would regress UX.

### Dashboard Low-Stock Banner

- **D-117:** **Full enumeration of every low-stock med inline, scrollable.** The banner body lists every `CareUnitMedication` in the user's `vårdenhet` with `currentStock < lowStockThreshold`, one row per med, showing name + `<LowStockBadge>` (reused from `apps/web/src/components/LowStockBadge.tsx`) + current/threshold values. Sorted by `currentStock / lowStockThreshold` ratio ASC (most-urgent first). When the list exceeds ~5 rows, the inner card scrolls (`max-h-80 overflow-y-auto`). NTF-01 literally says "enumerating every medication" so the full-list reading is the most faithful interpretation. Top-N truncation was rejected because it under-delivers NTF-01; count-only was rejected because Phase 2 already ships a count banner on `/lakemedel` and duplicating it on the dashboard adds nothing.

- **D-118:** **Renders on `DashboardPage` only — replaces the current stub.** `apps/web/src/routes/dashboard/DashboardPage.tsx:14` currently returns `<EmptyStateCard icon={LayoutDashboard} heading="Dashboard" />`. Phase 6 replaces that single line with `<DashboardLowStockCard />` (the new component). No changes to `AppShell.tsx`, no changes to other routes' layouts. The "always-visible app-shell strip" alternative was rejected because it would regress every page's chrome for one feature; the "tab-bar badge" alternative was rejected as scope creep. Containing the change to one route also keeps the UI-SPEC delta small.

- **D-119:** **Three-layer refresh: TanStack invalidation + window focus + 30-second poll.** (a) The existing `useDeliverOrder.onSuccess` already invalidates `['medications']` at `apps/web/src/features/orders/useOrderMutations.ts:358`; we add a sibling `invalidateQueries(['dashboard', 'low-stock'])` call. Same-tab deliveries refresh instantly. (b) `useLowStockQuery` sets `refetchOnWindowFocus: true` so Alt-tabbing back catches changes made in another tab/session — directly answers the §6 "two nurses" question for this surface. (c) `refetchInterval: 30_000` covers "left the dashboard tab open during a demo" — costs ~one GET per 30s when the tab is foreground, zero when backgrounded (TanStack pauses interval polling on hidden tabs by default). All three combined give NTF-02 a robust answer without ever needing SSE/WebSocket infrastructure (PROJECT.md explicitly excludes real-time push). The medication mutations (create/update/delete) also invalidate `['dashboard', 'low-stock']` because stock-or-threshold edits flip the under-threshold predicate.

- **D-120:** **New dedicated endpoint `GET /api/dashboard/low-stock`.** Returns a focused `{rows: LowStockItem[], total: number}` payload — no pagination, no `belowThresholdTotal`, no `page/pageSize`. Owns its own cache key `['dashboard', 'low-stock']` so the dashboard's refresh model is independent of the `/lakemedel` page's filter state (`['medications', filters]`). Reusing `GET /api/medications?belowThreshold=true&pageSize=100` was rejected because the cache-key collision would mean any filter change on `/lakemedel` invalidates the dashboard banner, and the response payload carries page metadata the banner doesn't need. Widening `/me` was rejected as wrong-layer coupling (auth shape and dashboard concerns should not be married). New endpoint = ~30 lines of service + route code reusing the existing `currentStock < lowStockThreshold` `$queryRaw` pattern from `medication.service.ts`.

### Claude's Discretion

- **`GET /api/ai/status` vs widening `/me` for `aiAvailable`** — both work. Recommend a new lightweight `GET /api/ai/status` returning `{available: boolean}` so the FE can refetch (e.g., admin adds the key without restarting the api container — implausible in dev, but the smaller surface area is cleaner). Either is acceptable to plan; locked dimension is "the FE can check availability via TanStack query without polling on every render".
- **Exact Anthropic SDK usage** — `@anthropic-ai/sdk` or raw `fetch` against `api.anthropic.com/v1/messages` are both fine. SDK gets you typing + structured-output ergonomics; raw fetch is one fewer dep. Recommend the SDK (~150 KB, real types). Tool-use schema for structured output: `{name: 'classify_medication', input_schema: {type: 'object', properties: {therapeuticClass: {type: 'string', enum: ['A',...,'V']}, confidence: {type: 'number', minimum: 0, maximum: 1}}, required: ['therapeuticClass', 'confidence']}}`. System prompt: short Swedish-friendly framing ("Du klassificerar ett läkemedel...") followed by the structured-output instruction.
- **Whether the LLM call uses extended thinking** — Haiku 4.5 doesn't really need it for this task. Recommend skipping (latency budget is tighter if thinking is on).
- **Plan-slice ordering** — recommend ship slice 1 = dashboard banner end-to-end (works without API key, demoable immediately, fully exercises the existing invalidation infrastructure); slice 2 = therapeuticClass schema migration + filter combobox (no LLM dependency, ships cleanly); slice 3 = AI service + suggest endpoint + Sheet integration. This ordering means every commit chain is demoable independently — reviewer reading git log sees the dashboard come alive before AI even enters the picture.
- **Whether the banner shows a "Beställ" per-row CTA** — recommend NO for Phase 6 (NTF-01 only requires visibility; the CTA is scope creep — Deferred Ideas). Phase 7 README §What I'd do with more time can mention it.
- **Whether ConfidenceBadge has icons** — recommend a small `<TrendingUp/>` for `hog`, `<Minus/>` for `medel`, `<TrendingDown/>` for `lag`. Icons help skim. Lucide already in the bundle.
- **Whether the empty-state banner (no low-stock items) is celebratory or hidden** — recommend celebratory (`<CheckCircle2 className="text-emerald-600"/>` + `Alla läkemedel är över tröskel.`). A blank dashboard looks broken; a positive empty state communicates "system is healthy".
- **README section ordering for the AI categorization piece** — recommend a dedicated `## AI Categorization` section under `## Audit log` (Phase 5's section), with sub-headings `### How the suggestion works`, `### Confidence band semantics`, `### Why a closed enum, not free text`, `### Falling back when the API key is absent`. Mirrors Phase 5's layered README style.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project framing & scope

- `.planning/PROJECT.md` — Locked stack + Key Decisions table. Two rows are binding for this phase: **"AI optional = auto-categorization by name/ATC | Cheapest of the three AI suboptions; most testable; useful in the UI (filter by therapeutic class)"** (this phase implements that decision verbatim) and **"Notifications = in-app banner on dashboard from a stock-level computed field | Email skipped; smaller scope, fast win, no extra infra"** (Phase 6 ships exactly this). Out-of-scope rows that constrain Phase 6: "AI: predictive restock", "AI: chatbot", "Email delivery", "Real-time order updates" — all four are explicit deferrals; do NOT plan around them.
- `.planning/REQUIREMENTS.md` §"AI: Auto-Categorization" (AI-01, AI-02, AI-03) and §"Notifications" (NTF-01, NTF-02). The reviewable acceptance language for the phase. AI-01's "documented latency budget" is locked at 3s p95 (D-112). AI-02's "override with free-text class" is reframed in D-113 as "override by picking another enum bucket" — document the deliberate reframing in README so the interviewer sees the deviation up front.
- `.planning/ROADMAP.md` §"Phase 6" — Goal + 4 Success Criteria + Mode (mvp) + Requirements list. SC #4 "LLM call is isolated behind a single service interface so swapping providers (or mocking in tests) is one change in one file" is satisfied by D-106's `aiCategorization.service.ts` seam.

### Phase 1–5 decisions inherited (carry forward, do not re-decide)

- `.planning/phases/01-foundation-auth/01-CONTEXT.md` D-01..D-19 — **all locked**. Especially:
  - **D-08:** Zod schemas in `packages/shared/src/contracts/*.ts` are the FE↔BE contract. Phase 6 ADDS `ai.ts`, `dashboard.ts`; EXTENDS `medication.ts` and `permissions.ts`.
  - **D-15:** `PERMISSIONS: Record<ActionKey, Role[]>` map. Phase 6 appends `'ai:suggest'` (apotekare + admin).
  - **D-16:** Service-layer Prisma access with `careUnitId` first. `dashboard.service.ts:listLowStockForUnit(careUnitId)` follows verbatim. `aiCategorization.service.ts` is the deliberate exception — the LLM call is per-medication, not per-vårdenhet (no careUnit context is meaningful for "what therapeutic class is paracetamol"). Document the exception in the service header.
  - **D-17:** `useAuth()` + `<Can action="...">`. Phase 6 gates the "Hämta AI-förslag" button with `<Can action="ai:suggest">` as defense in depth alongside `isAvailable()`.
  - **D-19:** Canonical error envelope `{error: {code, message, details?}}`. Phase 6 introduces TWO new codes: `ai_unavailable` (503) and `ai_timeout` (504). Both documented in the README error catalog alongside the Phase 1+ existing codes.
- `.planning/phases/01-foundation-auth/01-UI-SPEC.md` — Design system (shadcn `new-york` + slate), spacing scale, touch targets (≥44 px). Dashboard banner row click targets must hit 44 px; AI button in the Sheet must hit 44 px.
- `.planning/phases/02-medication-catalog/02-CONTEXT.md` D-20..D-45 — **all locked**. Especially:
  - **D-32:** NPL meds' name/ATC/form/strength are field-locked server-side. Phase 6 EXTENDS the contract — `therapeuticClass` is editable on NPL meds (classification is metadata, not pharmaceutical identity). Document the carve-out in `medication.service.ts:updateCareUnitMedication`.
  - **D-39 / D-42:** URL-as-state for filters. The new `?class=N` param follows the established `URLSearchParams` pattern verbatim — single source of truth, deep-linkable.
  - **D-44:** `belowThresholdTotal` is computed in `listMedicationsForUnit` via `$queryRaw` cross-column comparison. Phase 6's `listLowStockForUnit` reuses the same `currentStock < lowStockThreshold` predicate.
- `.planning/phases/03-draft-orders/03-CONTEXT.md` D-46..D-73 — **all locked**. Especially:
  - **D-65:** File-per-endpoint route pattern. Phase 6 follows: `apps/api/src/routes/ai/suggest.ts` + `apps/api/src/routes/ai/index.ts` (registrar); `apps/api/src/routes/dashboard/lowStock.ts` + `apps/api/src/routes/dashboard/index.ts` (registrar).
  - **D-69:** TanStack Query key conventions. Phase 6 keys: `['dashboard', 'low-stock']`, `['ai', 'status']`. The medication keys (`['medications', filters]`) gain a `therapeuticClass` field in their filter shape; the existing query-key memoization in `useMedicationsQuery` handles this transparently.
- `.planning/phases/04-confirm-deliver-stock/04-CONTEXT.md` D-74..D-89 — **all locked**. Especially:
  - **D-83:** Phase 6 retrofits two cross-cutting features (LLM + dashboard refresh) without touching Phase 4 deliver code's logic. The only Phase 4 edit is one line inside `useDeliverOrder.onSuccess` adding the second invalidation call (D-119). This continues the §6 "retrofitting" interview thread.
- `.planning/phases/05-audit-log/05-CONTEXT.md` D-90..D-105 — **all locked**. Especially:
  - **D-93:** Operations intercepted by the audit `$extends` middleware: `create`, `update`, `updateMany`, `delete`, `deleteMany`. Phase 6's writes to `Medication.therapeuticClass` go through `update` and are audited automatically.
  - **D-95:** Diff computed at READ time inside `AuditDiffPanel.tsx`. Adding `therapeuticClass` to the audit allowlist (D-97 extension) means historical Medication updates naturally start surfacing class changes once the migration lands — no backfill needed in the audit table.
  - **D-97:** Per-model allowlist of auditable columns. Phase 6 EXTENDS the `Medication` entry to add `therapeuticClass`. Single-file edit in `apps/api/src/db/auditAllowlist.ts`.
  - **D-99:** ESLint `no-restricted-syntax` ban on `prisma.auditEvent.update/delete/...`. Phase 6 adds nothing that would trip this rule.

### Existing code patterns (Phase 1+2+3+4+5 lay the foundation Phase 6 builds on)

- `apps/api/prisma/schema.prisma` — `Medication` model (global) is the column-add target; `CareUnitMedication` is the read source for the dashboard banner. Phase 6 migration is `0012_medication_therapeutic_class` (next number after Phase 5's `0011`).
- `apps/api/src/env.ts` — Zod-validated env. Pattern for the new `ANTHROPIC_API_KEY: z.string().optional()` is identical to the existing pattern; no new framework code.
- `apps/api/src/db/client.ts` — Existing `PrismaClient` singleton; Phase 5 wrapped with `$extends`. Phase 6 makes no changes here — the audit-extended client just keeps doing its job for the new `therapeuticClass` writes.
- `apps/api/src/db/auditAllowlist.ts` — Phase 6 EXTENDS the `Medication` entry to include `therapeuticClass`.
- `apps/api/src/services/medication.service.ts` — `listMedicationsForUnit` filter chain; Phase 6 EXTENDS with the `therapeuticClass` predicate. `createCareUnitMedication` and `updateCareUnitMedication` also extend to accept and persist `therapeuticClass`. The `$queryRaw` `currentStock < lowStockThreshold` pattern is the template for `dashboard.service.ts:listLowStockForUnit`.
- `apps/api/src/auth/permissions.ts` — `PERMISSIONS` map. Phase 6 appends `'ai:suggest': ['apotekare', 'admin']`.
- `apps/api/src/routes/medications/` — File-per-endpoint precedent. Phase 6's `routes/ai/` and `routes/dashboard/` follow verbatim.
- `apps/web/src/routes/lakemedel/MedicationSheet.tsx` — The integration target for the AI affordance. Already handles create + edit + view modes with form state; Phase 6 widens form state with `aiSuggestion` and `therapeuticClass`.
- `apps/web/src/routes/lakemedel/LakemedelFilter.tsx` — The integration target for the new combobox. Already wires URL params via the project's URL-as-state pattern.
- `apps/web/src/routes/lakemedel/LowStockBanner.tsx` — Phase 2's count-only banner on `/lakemedel`. Phase 6 does NOT change this component; the dashboard banner is a separate `<DashboardLowStockCard />` with different content (full enumeration vs count-only).
- `apps/web/src/routes/dashboard/DashboardPage.tsx:14` — One-line stub replacement target (`<EmptyStateCard heading="Dashboard"/>` → `<DashboardLowStockCard/>`).
- `apps/web/src/features/orders/useOrderMutations.ts:358` — Where the existing `invalidateQueries(['medications'])` lives. Phase 6 adds a sibling line for `['dashboard', 'low-stock']`.
- `apps/web/src/features/medications/useMedicationMutations.ts` — Multiple `invalidateQueries(['medications'])` sites; Phase 6 adds sibling `['dashboard', 'low-stock']` invalidations to create/update/delete.
- `apps/web/src/components/{LowStockBadge, EmptyStateCard, NplBadge, OrderStatusPill, RoleBadge, ConfidenceBadge}` — Phase 6 ADDS `AiSuggestionChip.tsx` + `ConfidenceBadge.tsx`. Phase 6 REUSES `LowStockBadge` + `EmptyStateCard` in the dashboard banner.
- `apps/web/src/components/ui/{combobox, badge, button, card, dialog, sheet, table}` — Existing shadcn primitives. Phase 6 needs nothing new from shadcn; `ConfidenceBadge` is a wrapper over `Badge` with three variants.
- `packages/shared/src/contracts/{login, me, medication, order, audit, permissions, error}.ts` — Existing contracts. Phase 6 ADDS `ai.ts` + `dashboard.ts`; EXTENDS `medication.ts` + `permissions.ts`.
- `packages/shared/src/constants/{auditAction, auditEntityType, orderStatus, medicationDefaults, medicationForms, roles}.ts` — Existing pattern of string-union + Swedish label map. Phase 6 ADDS `therapeuticClass.ts` following the same pattern verbatim.
- `apps/api/test/helpers/buildTestApp.ts` — Existing test bootstrap. Phase 6's `aiCategorization.integration.test.ts` and `dashboard.integration.test.ts` import the existing helpers; the AI test stubs `categorizerImpl` via the service seam (D-106).
- `docker-compose.yml` — Reads env vars via `${VAR:-}` pattern (already established for `RATE_LIMIT_*` in Phase 5). Phase 6 adds `${ANTHROPIC_API_KEY:-}` to the `api` service env block.
- `.eslintrc.cjs` — Phase 5 added `no-restricted-syntax` rules. Phase 6 adds nothing here; no new bans needed.

### Brief (interview source-of-truth — local only, not in repo CI)

- `local/intervju-testcase-1-1-.pdf` §2.2 (the four optionals — Phase 6 ships TWO of them: "AI-funktion (auto-kategorisering)" and "in-app meddelanden om lågt lager"); §3.2 ("API:t bör returnera tydliga felmeddelanden vid t.ex. ogiltig kvantitet, otillåten statusövergång" — Phase 6's new `ai_unavailable` and `ai_timeout` codes are surfaced via the existing `{error: {code, message, details?}}` envelope, continuing the established taxonomy); §5 (evaluation: code quality + API/data modeling + system design ★★★★★/★★★★/★★★★ — the single-service-interface story for SC #4 is exactly the kind of architectural commitment this rubric rewards); §6 (the "AI-first" Medovia framing in §1 plus the §6 questions — Phase 6 strengthens the "what I'm proud of" answer with the LLM-behind-a-seam pattern, and the "scale to 50 vårdenheter" answer because the dashboard endpoint is careUnit-scoped and the AI call is stateless).

### External docs (Anthropic API + ATC standard)

- Anthropic Messages API + tool_use structured output — refer to `docs.anthropic.com/en/api/messages` and `docs.anthropic.com/en/docs/tool-use`. The `tool_use` block returns structured input matching the declared `input_schema`. Use `claude-haiku-4-5` model id. Set `max_tokens` low (~256) since the response is essentially `{therapeuticClass, confidence}`.
- WHO ATC classification — `whocc.no/atc_ddd_index` for the canonical 14 level-1 anatomical groups. Reference URL goes in the README for the Swedish-label provenance.

### Tooling / harness

- `CLAUDE.md` — Tooling rules, GSD workflow expectations, stack constraints, language conventions.
- `.planning/STATE.md` — Current phase progress (Phase 5 complete, ready_to_plan for Phase 6).
- `.planning/config.json` — Workflow toggles (sequential, plan-check on, verifier on, per-phase research disabled, research_before_questions: false).

No external SPEC.md exists for Phase 6 — implementation decisions captured above (D-106..D-120) are the canonical record.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Phase 1+2+3+4+5 shipped a working monorepo with auth, RBAC, catalog, draft orders, confirm/deliver/stock, and audit log. Phase 6 adds AI categorization (one new service file, one new route, two new contracts, three new FE files + Sheet integration) and the dashboard banner (one new service, one new route, one new contract, one new TanStack hook, one new component + DashboardPage stub replacement). Net Phase 6 surface: ~12 new files, ~6 edited files.

- **`apps/api/src/env.ts`** — Existing Zod-validated env pattern. `ANTHROPIC_API_KEY: z.string().optional()` slots in trivially; the existing fail-fast-on-misconfig behavior covers everything else.
- **`apps/api/src/db/client.ts` + Phase 5 audit extension** — Already wraps `PrismaClient` with `$extends`. Phase 6 writes to `Medication.therapeuticClass` are audited automatically via D-93 + D-95 + the allowlist extension.
- **`apps/api/src/services/medication.service.ts`** — `listMedicationsForUnit` filter chain is the template for adding `therapeuticClass` filter; the `$queryRaw` low-stock predicate is the template for `dashboard.service.ts:listLowStockForUnit`.
- **`apps/api/src/auth/permissions.ts`** — `'ai:suggest'` permission lands here; the existing `requirePermission()` Fastify preHandler does the rest.
- **`apps/api/src/routes/audit/{list, filters, index}.ts`** — Phase 5's three-file route layout (route + helper-route + registrar) is the verbatim template for `apps/api/src/routes/dashboard/` and `apps/api/src/routes/ai/`.
- **`apps/api/test/helpers/buildTestApp.ts`** — Existing test bootstrap (loginAs, ensureAllRolesSeeded, progressOrderToBekraftad). Both new integration tests reuse it unchanged.
- **`apps/web/src/routes/dashboard/DashboardPage.tsx:14`** — Single-line stub replacement target. The route is already registered + `<RoleRoute>` permits all three roles by default.
- **`apps/web/src/routes/lakemedel/MedicationSheet.tsx`** — Existing create+edit+view modes + form state via react-hook-form + Zod. Phase 6 widens the resolver schema with `therapeuticClass`; the two-field AI layout is two new JSX blocks above the existing form fields.
- **`apps/web/src/routes/lakemedel/LakemedelFilter.tsx`** — Existing URL-as-state pattern with `useSearchParams`. New `<Combobox name="class">` slots in as the fourth filter without changing the URL-sync skeleton.
- **`apps/web/src/components/EmptyStateCard.tsx`** — Reused on the dashboard's celebratory empty state (all-meds-above-threshold).
- **`apps/web/src/components/LowStockBadge.tsx`** — Reused on each row of the dashboard banner enumeration.
- **`apps/web/src/components/ui/badge.tsx` (shadcn)** — `ConfidenceBadge.tsx` is a thin variant-mapping wrapper.
- **`apps/web/src/components/ui/combobox.tsx` (shadcn)** — Already used by Phase 5's AuditFilterBar. Phase 6 reuses the same pattern for the Terapeutisk-klass filter and (implicitly) for the read-only AI suggestion display chip.
- **`apps/web/src/features/orders/useOrderMutations.ts:358`** — Existing `invalidateQueries(['medications'])` in `useDeliverOrder.onSuccess` is the precedent for invalidation-on-mutation. Phase 6 adds a sibling `['dashboard', 'low-stock']` invalidation here AND in `useMedicationMutations.ts` create/update/delete.
- **`@anthropic-ai/sdk` (new dep)** — Net-new package add via `pnpm add @anthropic-ai/sdk` in `apps/api`. ~150 KB; zero collateral changes.

### Established Patterns (Phase 1..5 → Phase 6 inheritance)

- **careUnitId-first service signature** (D-16). `dashboard.service.ts:listLowStockForUnit(careUnitId)` follows. `aiCategorization.service.ts` is the deliberate exception (per-medication, not per-careUnit) — document in the service header.
- **Zod schemas in shared, inferred TS types** (D-08). `ai.ts` + `dashboard.ts` + extensions to `medication.ts` + `permissions.ts`.
- **Canonical error envelope** (D-19). Phase 6 ADDS two codes: `ai_unavailable` (503), `ai_timeout` (504). Both surface via existing `errorHandler.ts` plugin.
- **Permission-map drift-prevention** (D-15). `'ai:suggest'` addition is a two-file change (shared `ACTION_KEYS` + BE `PERMISSIONS`); TS exhaustiveness enforces both lands.
- **URL-as-state for filters** (D-39 / D-42). The new `?class=N` follows verbatim.
- **File-per-endpoint route layout** (D-65). `routes/ai/` and `routes/dashboard/` follow.
- **TanStack Query key conventions** (D-69). New keys: `['dashboard', 'low-stock']`, `['ai', 'status']`.
- **Mobile-first responsive switch** (D-10, D-82). The dashboard banner is a single card that scales by width; the LakemedelFilter combobox addition follows the existing horizontally-scrollable strip on <md.
- **Audit-via-$extends-middleware** (D-90..D-97). New `therapeuticClass` column is audited automatically once added to the allowlist.

### Integration Points

- **`/me` response** — Widens automatically if Claude picks the `/me`-extension route for AI availability (Claude's discretion in Decisions). Otherwise unchanged.
- **`docker-compose.yml`** — `api` service env block adds `ANTHROPIC_API_KEY: ${ANTHROPIC_API_KEY:-}`. Fresh-clone behavior: variable is empty string, `env.ts` `z.string().optional()` accepts it, `isAvailable()` returns false, FE hides the AI affordance.
- **`prisma migrate dev`** — Phase 6 ships migration `0012_medication_therapeutic_class` (create enum + add column + index). Additive; existing 43k rows get `NULL` for the new column.
- **Bottom-tab nav** — No nav changes. Dashboard is the default landing route post-login (Phase 1 D-14).
- **Audit log** — `Medication.therapeuticClass` flows through the Phase 5 audit middleware once allowlist is extended. The first user-driven AI suggestion + override on a fresh clone produces an audit row visible at `/admin/audit` showing `therapeuticClass: null → J`. Free integration of the new feature into the existing audit story — no additional code.

</code_context>

<specifics>
## Specific Ideas

- **Swedish UI vocabulary (locked for Phase 6):**
  - Medication Sheet AI button: `Hämta AI-förslag`
  - AI button loading state: `Hämtar förslag…`
  - AI suggestion chip prefix: `Förslag:`
  - Confidence badge labels: `Hög säkerhet`, `Medel säkerhet`, `Låg säkerhet`
  - Apply button: `Använd förslag`
  - Final-value field label: `Slutgiltig klass`
  - AI unavailable tooltip on disabled button: `AI-förslag är inte tillgängligt (saknad API-nyckel).`
  - AI timeout toast: `AI-förslaget tog för lång tid — försök igen.`
  - AI failure toast: `Kunde inte hämta förslag — försök igen.`
  - Filter combobox label: `Terapeutisk klass`
  - Filter combobox placeholder: `Alla klasser`
  - Dashboard banner heading: `Läkemedel under tröskel`
  - Dashboard banner empty state heading: `Alla läkemedel är över tröskel.`
  - Dashboard banner row layout: `<name> · <currentStock> / <threshold>` with `<LowStockBadge>` to the right
  - Dashboard banner loading state: `Hämtar lagernivåer…`
  - Dashboard banner error state: `Kunde inte hämta lagernivåer — försök igen om en stund.`
  - Therapeutic class Swedish labels (the 14 ATC anatomical groups): `A = Mag–tarm och ämnesomsättning`, `B = Blod och blodbildande organ`, `C = Hjärta och kretslopp`, `D = Hud`, `G = Urin- och könsorgan, sexualhormoner`, `H = Hormonsystemet (exkl. könshormoner)`, `J = Antiinfektiva för systemiskt bruk`, `L = Tumörer och immunmodulering`, `M = Muskler och skelett`, `N = Nervsystemet`, `P = Antiparasitära medel`, `R = Andningsorganen`, `S = Ögon och öron`, `V = Övrigt`.

- **LLM prompt (recommended starting point — Claude's discretion to refine during planning):**
  - System: `Du är en klinisk farmakologisk assistent. Du klassificerar läkemedel enligt WHO ATC nivå 1 (anatomisk grupp).`
  - User: `Klassificera följande läkemedel. Namn: "{name}". ATC-kod: "{atcCode}". Returnera exakt en kategori från listan: A, B, C, D, G, H, J, L, M, N, P, R, S, V. Inkludera även din säkerhet (0..1).`
  - Tool: `classify_medication` with input_schema `{therapeuticClass: enum, confidence: number 0..1}`.
  - Expected behavior: ATC-prefix matches the chosen class in virtually every case (the L01 code IS the `L` group); LLM essentially confirms what the ATC code already says. The interesting signal comes from drugs where ATC is ambiguous or user-created without ATC.

- **Demo path on first `docker compose up` (Phase 6, assuming `ANTHROPIC_API_KEY` is set):**
  1. Reviewer runs `docker compose up`; seed populates the DB; dashboard shows the low-stock banner immediately (already ~8% of 43k seeded rows are under threshold per Phase 2 D-25). One screenshot covers NTF-01.
  2. Reviewer delivers a seeded Bekräftad order; same-tab invalidation kicks `['dashboard', 'low-stock']`; the banner row count drops live without a manual refresh. Covers NTF-02.
  3. Reviewer opens `/lakemedel`, clicks `Lägg till läkemedel`, types Namn + ATC, clicks `Hämta AI-förslag`. Spinner → chip appears with class + Hög/Medel badge. Reviewer clicks `Använd förslag` → field populates. Reviewer saves. Covers AI-01 + AI-02.
  4. Reviewer goes back to `/lakemedel`, selects `Terapeutisk klass = J (Antiinfektiva)` from the new combobox. Filter combines with any active ATC/form/below-threshold filters. URL updates to `?class=J`. Covers AI-03.
  5. Reviewer logs in as `admin@example.test`, navigates `/admin/audit`, finds the Medication update event from step 3, expands → diff panel shows `therapeuticClass: null → J`. Free integration with Phase 5 audit.
  6. Reviewer Alt-tabs away during the demo, then Alt-tabs back to the dashboard → `refetchOnWindowFocus` triggers; the banner refreshes if anyone else mutated stock. Reinforces NTF-02's "auto-refresh" claim beyond the same-tab invalidation case.
  7. Total demo: ~2 minutes covers AI-01, AI-02, AI-03, NTF-01, NTF-02, plus the audit-integration bonus.

- **Demo path on first `docker compose up` WITHOUT `ANTHROPIC_API_KEY`:**
  1. Dashboard banner works unchanged (no LLM dependency).
  2. Filter combobox works unchanged (the column exists; rows are all NULL, so picking any class shows zero rows — defensible but worth documenting in README).
  3. The "Hämta AI-förslag" button is absent from the medication Sheet. README explains: "Add `ANTHROPIC_API_KEY` to `.env` to enable AI suggestions."

- **§6 prep notes (Phase 6 strengthens these answers):**
  - **"Two nurses ordering simultaneously"** — Phase 6's dashboard banner refresh strategy (window focus + 30s polling, layered on top of the existing same-tab invalidation) answers the read-side concurrency story for this surface. Two nurses on the same dashboard see each other's deliveries reflected within 30s without explicit refresh.
  - **"Scale to 50 vårdenheter"** — `/api/dashboard/low-stock` is careUnit-scoped (one query, one careUnitId predicate, indexed); the LLM service is stateless and per-medication so it scales horizontally with the api container; the `Medication.therapeuticClass` column is shared across all careUnits (correct — therapeutic class is a molecule property, D-115) so adding the 50th vårdenhet adds zero LLM calls (the classification is already done).
  - **"Retrofitting auth"** — Phase 6 itself is another exemplar of "retrofit without touching prior phases", continuing Phase 5's thread. The new `'ai:suggest'` permission slots into the existing `PERMISSIONS` map; the Sheet's `<Can action="ai:suggest">` follows the established pattern; zero existing service code changes for AI.
  - **"What I'm proud of"** — README candidate: "The LLM call sits behind a single 6-line service interface (`aiCategorization.service.ts`). Swapping providers, switching models, or mocking in tests is one file's edit. The wire format ships discrete confidence bands (`hog`/`medel`/`lag`) rather than raw floats so the UI doesn't lie about LLM self-certainty."
  - **"What I'm least proud of"** — README candidate: "The 43k NPL seed meds start without a therapeutic class. Backfilling at seed time would cost ~$4 in LLM calls per fresh `docker compose up` and add 30+ seconds to first-boot — too aggressive for a demo. The Phase 6 banner + filter both work, but on a fresh demo the filter combobox is functionally empty until someone clicks 'Hämta AI-förslag' on a few rows. An admin batch-categorize job is the v2 fix."

- **README section additions:**
  - `## AI Categorization` with sub-headings `### How the suggestion works`, `### Confidence band semantics`, `### Why a closed enum, not free text` (the AI-02 reframing), `### Falling back when the API key is absent`, `### Latency budget`.
  - `## Dashboard low-stock banner` with sub-headings `### Refresh strategy`, `### Why a dedicated endpoint`.
  - Extend `## Error envelope` to list the two new codes (`ai_unavailable`, `ai_timeout`).
  - Extend `## Environment variables` to document `ANTHROPIC_API_KEY` (optional).
  - Extend `## What I'd do with more time` with the bullets: bulk AI backfill at seed time, free-text override bucket, severity gradient on banner rows, per-row Beställ CTA, suggestion caching by (name, atcCode).

- **`docker compose up` golden command remains intact.** Phase 6 migration is additive; seed unchanged; api container picks up the new `aiCategorization.service.ts` + `dashboard.service.ts` + the two new routes. First boot impact: <100 ms additional (one extra Fastify route registration cluster).

</specifics>

<deferred>
## Deferred Ideas

- **Bulk AI backfill of the 43k NPL seed meds at seed time** — explicit out-of-scope per Domain section. Recorded in README §What I'd do with more time. v2 candidate: an admin "Klassificera alla läkemedel" button that batches the LLM calls in a background job with progress UI.
- **Per-row "Beställ" CTA inside the dashboard banner** — deep-link to `/bestallningar/ny` preloaded with the low-stock med. Scope creep for Phase 6; v2 polish that NTF-01 doesn't require.
- **Severity gradient coloring on banner rows** (red < 25% of threshold, amber < 50%, etc.) — UX polish; v2.
- **AI suggestion + acceptance as distinct audit actions** (`medication.ai_suggested`, `medication.ai_accepted`, `medication.ai_overridden`) — the existing Phase 5 `Medication.update` event with diff-at-read already captures `therapeuticClass: null → X` clearly. Distinct actions would over-engineer the audit story for marginal forensic value. Document in README §What I'd do with more time if it becomes a discussion point.
- **Caching AI suggestions by `(name, atcCode)`** — the LLM call is fast + cheap + idempotent for this input shape; a real cache would add a Postgres table or in-memory LRU at the cost of stale-suggestion-on-prompt-change bugs. Reconsider if demo cost becomes a problem.
- **OpenAI / local mock as a runtime-selectable second provider** — the SC #4 single-service interface is built for this, but only Anthropic ships in v1. The deterministic local mock IS exercised in unit tests via the `categorizerImpl` seam (D-106), so the swap path is asserted, not just claimed.
- **Free-text therapeutic class column alongside the enum (hybrid model)** — rejected in D-113. Captured for v2 if "Annat (V)" turns out to be inadequate for any clinical edge case the interviewer probes.
- **Auto-fire LLM call on field blur** — rejected in D-109. v2 polish if the manual button feels too clunky in user testing.
- **Confidence-aware UI thresholds** (e.g., auto-fill on `hog`, require Apply click on `medel`/`lag`) — rejected in D-111. v2 polish.
- **Inline ghost-text Tab-to-accept suggestion** — rejected in D-110 as a11y-fiddly. v2 polish for a future "AI everywhere" pass.
- **SSE/WebSocket push for dashboard updates** — explicit out-of-scope per PROJECT.md. v2 candidate if real-time becomes a brief signal.
- **Banner badge on the bottom-tab Läkemedel nav icon** — rejected in D-118 as scope creep. v2 polish.
- **Persistent app-shell strip showing low-stock count on every page** — rejected in D-118 as too invasive. v2 if UX testing shows nurses want it always visible.
- **i18n framework adoption** (react-intl / i18next) — Swedish labels stay hard-coded per Phase 1 convention. v2 for any non-Swedish deployment.
- **Per-vårdenhet override of the therapeutic class** (one drug categorized differently per unit) — rejected in D-115 as the wrong domain model. v2 only if a clinical edge case surfaces it.
- **Single-event detail endpoint `/api/ai/suggestion-history/:medicationId`** — would let admins audit every AI suggestion call (not just the resulting persisted value). v2 forensics polish that the current `Medication.update` audit + Phase 5 audit page already covers at the outcome layer.
- **Multi-select on the Terapeutisk klass filter combobox** — rejected in D-116 as a clinical workflow that doesn't map to real queries. v2 if a real user complains.

</deferred>

---

*Phase: 6-AI Categorization & Low-Stock Notifications*
*Context gathered: 2026-05-23*
