# Phase 6: AI Categorization & Low-Stock Notifications - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-23
**Phase:** 6-AI Categorization & Low-Stock Notifications
**Areas discussed:** LLM provider + key sourcing + offline fallback, AI suggestion UX in the medication Sheet, Therapeutic class taxonomy, Dashboard banner

---

## LLM provider + key sourcing + offline fallback

### Q1 — Which LLM provider should sit behind the single service interface (SC #4)?

| Option | Description | Selected |
|--------|-------------|----------|
| Anthropic Claude (Recommended) | Familiar API; tool_use structured output; aligns with Medovia's AI-first framing | ✓ |
| OpenAI (gpt-4o-mini or gpt-4.1-mini) | `response_format: json_schema` is clean; pick if existing key/preference | |
| Deterministic local mock only (no real LLM) | Reproducible + free; but weakens the "AI" part of the brief's optional | |

**User's choice:** Anthropic Claude
**Notes:** Locked as D-106.

### Q2 — Which Claude model should the categorization service call?

| Option | Description | Selected |
|--------|-------------|----------|
| claude-haiku-4-5 (Recommended) | ~1s, ~$0.0001/call; easily meets the latency budget | ✓ |
| claude-sonnet-4-6 | Higher quality at ~5× cost, ~2× latency; overkill for name+ATC | |
| claude-opus-4-7 | Wildly overkill; hurts the latency story | |

**User's choice:** claude-haiku-4-5
**Notes:** Locked as D-106.

### Q3 — How should `ANTHROPIC_API_KEY` be sourced on a fresh `docker compose up`?

| Option | Description | Selected |
|--------|-------------|----------|
| `.env.example` placeholder + README setup step + optional at startup (Recommended) | Reviewer can demo without a key; AI affordance hides gracefully | ✓ |
| Hard-required at startup (env.ts throws) | Fails fast; breaks `docker compose up` on fresh clone | |
| Bake a free-tier test key into the repo | Never — strong negative signal | |

**User's choice:** Optional via env.ts + .env.example placeholder
**Notes:** Locked as D-107.

### Q4 — When the API key is missing or the LLM call fails, what should the medication Sheet show?

| Option | Description | Selected |
|--------|-------------|----------|
| Hide the AI affordance; field is plain free-text (Recommended) | Cleanest reviewer experience; nothing broken visible | ✓ |
| Show a disabled button with "AI-förslag inte tillgängligt" hint | Discoverable but noisier | |
| Show button always; inline error toast on failure with retry | Treats LLM as a normal dependency; surfaces all failures | |

**User's choice:** Hide the AI affordance entirely
**Notes:** Locked as D-108.

---

## AI suggestion UX in the medication Sheet

### Q1 — When should the LLM call fire?

| Option | Description | Selected |
|--------|-------------|----------|
| Manual button: "Hämta AI-förslag" (Recommended) | Explicit user action; zero wasted calls; cleanest demo | ✓ |
| Auto on field blur after both Namn + ATC filled | Magic-feeling but easy to make annoying; debounce complexity | |
| On Save — server-side suggestion + persist in one shot | Removes the visible accept/override affordance from AI-02 | |

**User's choice:** Manual button trigger
**Notes:** Locked as D-109.

### Q2 — How should the suggestion be presented in the Sheet once it arrives?

| Option | Description | Selected |
|--------|-------------|----------|
| Single free-text field; "Hämta förslag" pre-fills it; user edits in place (Recommended) | Simpler UI; one field | |
| Two-field layout: read-only "AI-förslag" chip + free-text "Slutgiltig klass" (Apply button between) | Override path is visually explicit; demoable | ✓ |
| Inline ghost-text suggestion (Tab to accept, like GitHub Copilot) | Slick but a11y-fiddly; unusual in form UX | |

**User's choice:** Two-field layout with Apply button (deviated from recommendation)
**Notes:** Locked as D-110. User deliberately chose the more visible variant so "I overrode the AI" reads in the UI and lands in the audit log.

### Q3 — Should the user-visible UI show the LLM's confidence score next to the suggestion?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, render as percentage or label (Recommended) | Reinforces "hint, not a fact"; small honesty signal | |
| Yes, but only as a discrete badge (Hög/Medel/Låg) | Avoids implying false precision in LLM self-reported confidence | ✓ |
| No, hide confidence — just show the suggestion | Keeps UI simple; saves one piece of state | |

**User's choice:** Discrete band badge (Hög/Medel/Låg)
**Notes:** Locked as D-111. Server-side bucketing keeps the wire format honest about LLM self-reported confidence.

### Q4 — What's the latency budget for the LLM call (the "documented latency budget" in AI-01)?

| Option | Description | Selected |
|--------|-------------|----------|
| 3s p95 with 5s hard timeout (Recommended) | Comfortable for Haiku; defensible under network noise | ✓ |
| 1s p95 with 3s hard timeout | Tighter; brittle on cold-start | |
| 5s p95 with 10s hard timeout | Generous; reads as "didn't optimize" | |

**User's choice:** 3s p95 / 5s timeout
**Notes:** Locked as D-112.

---

## Therapeutic class taxonomy: open string vs closed list

### Q1 — What's the shape of the `therapeuticClass` column?

| Option | Description | Selected |
|--------|-------------|----------|
| Closed enum derived from ATC anatomical groups (~14 categories) (Recommended) | Standardized; clean filter UX; defensible override reframing | ✓ |
| Free-text String (no enum) | Honors AI-02 literally; spelling drift breaks filter UX | |
| Hybrid: closed enum + "Annat (fritext)" overflow bucket | Best of both at the cost of two columns; scope creep | |

**User's choice:** Closed enum of 14 ATC level-1 anatomical groups
**Notes:** Locked as D-113. AI-02's "override with free text" is reframed as "override by picking a different bucket from the same list" — documented in README for transparency.

### Q2 — How is the closed enum represented in the schema and shared types?

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres `enum` + Prisma enum + shared string union (Recommended) | DB-enforced data integrity; mirrors auditAction.ts pattern | ✓ |
| Plain `String` column + shared TS string union (no DB enum) | More uniform with Phase 5 entityType/action patterns | |
| Foreign key to a new TherapeuticCategory lookup table | Most normalized; heavyweight for 14 static categories | |

**User's choice:** Postgres enum + Prisma enum + shared TS union
**Notes:** Locked as D-114. The 14 ATC anatomical groups are an international standard from 1976 — DB-enforced rigidity is the correct tradeoff.

### Q3 — Where in the Medication schema does `therapeuticClass` live, and is it nullable?

| Option | Description | Selected |
|--------|-------------|----------|
| On `Medication` (global), nullable (Recommended) | Correct domain model; 43k seed rows start null; no expensive backfill | ✓ |
| On `Medication` (global), non-nullable with default 'Annat' | Always populated but "Annat: 43,538" makes the filter look broken | |
| On `CareUnitMedication` (per-vårdenhet), nullable | Wrong domain model — class is a molecule property | |

**User's choice:** On Medication (global), nullable
**Notes:** Locked as D-115. Audit allowlist will be extended; Phase 5 diff-at-read handles the schema addition naturally.

### Q4 — How does the new filter appear in `LakemedelFilter.tsx` alongside the existing ATC / Form / "Under tröskel" filters?

| Option | Description | Selected |
|--------|-------------|----------|
| Fourth combobox "Terapeutisk klass", URL param `?class=N` (Recommended) | Positioned LEFT of ATC; broad→narrow reading order | ✓ |
| Fourth combobox positioned to the RIGHT of Form | Cosmetically simpler; reads worse | |
| Replace ATC combobox with Terapeutisk klass; ATC moves to a second-row 'advanced' section | Promotes the new filter; regresses Phase 2 UX | |

**User's choice:** Fourth combobox left of ATC
**Notes:** Locked as D-116. Follows the URL-as-state pattern from D-39 / D-42 / D-103.

---

## Dashboard banner: content shape + refresh trigger

### Q1 — What does the dashboard banner actually show?

| Option | Description | Selected |
|--------|-------------|----------|
| Full enumeration: scrollable list of every low-stock med inline (Recommended) | Most faithful to NTF-01's "enumerating every"; strongest demo | ✓ |
| Top N (e.g. 5) sorted by how-far-below-threshold + "Visa alla N" link | Less screen space; partial NTF-01 satisfaction | |
| Count-only banner + "Visa lista" link to /lakemedel?belowThreshold=true | Phase 2 already ships this; duplicating adds little | |

**User's choice:** Full enumeration inline
**Notes:** Locked as D-117.

### Q2 — Where does the banner render?

| Option | Description | Selected |
|--------|-------------|----------|
| Top of `DashboardPage` only — replaces the current stub (Recommended) | Contained; minimal UI-SPEC delta; matches NTF-01 verbatim | ✓ |
| Persistent app-shell strip above every authenticated route | Strong always-visible UX; regresses every page's chrome | |
| Dashboard top + small badge on the bottom-tab Läkemedel icon | Polished; scope creep for Phase 6 | |

**User's choice:** DashboardPage only
**Notes:** Locked as D-118.

### Q3 — What triggers the banner's auto-refresh? (NTF-02 says "refetches after any stock-changing mutation and reflects the new state")

| Option | Description | Selected |
|--------|-------------|----------|
| TanStack invalidation on deliver + window focus + 30s polling (Recommended) | Layered; satisfies NTF-02 with margin; answers §6 read-concurrency | ✓ |
| TanStack invalidation on deliver only (no polling, no focus) | Minimal; stale across tabs/sessions | |
| Server-Sent Events / WebSocket push | Most real-time; explicit out of scope per PROJECT.md | |

**User's choice:** Three-layer refresh (invalidation + window focus + 30s poll)
**Notes:** Locked as D-119. Existing useDeliverOrder invalidation at apps/web/src/features/orders/useOrderMutations.ts:358 is preserved; the dashboard cache key is added alongside.

### Q4 — Does the banner reuse a new endpoint or piggyback on `GET /api/medications?belowThreshold=true`?

| Option | Description | Selected |
|--------|-------------|----------|
| New dedicated endpoint `GET /api/dashboard/low-stock` (Recommended) | Focused payload; independent cache key; clean refresh model | ✓ |
| Reuse `GET /api/medications?belowThreshold=true&pageSize=100` | Zero new BE code; cache-key collision with /lakemedel | |
| Extend the `/me` response with the count + first N rows | Lowest latency; wrong layer — couples auth to dashboard | |

**User's choice:** New dedicated endpoint
**Notes:** Locked as D-120.

---

## Claude's Discretion

The user delegated these implementation details to Claude during planning:

- Exact mechanism for FE to check AI availability — `GET /api/ai/status` vs widening `/me`. Recommend new lightweight endpoint.
- Anthropic SDK vs raw fetch. Recommend `@anthropic-ai/sdk`.
- Whether to use extended thinking on Haiku 4.5. Recommend no (latency).
- Plan-slice ordering. Recommend Slice 1 = dashboard banner (no LLM dep), Slice 2 = therapeuticClass schema + filter, Slice 3 = AI service + Sheet integration.
- Per-row "Beställ" CTA on banner rows. Recommend no (scope creep; deferred).
- Icon use in ConfidenceBadge. Recommend small Lucide TrendingUp/Minus/TrendingDown icons.
- Empty-state banner shape (no low-stock items). Recommend celebratory CheckCircle2 + "Alla läkemedel är över tröskel.".
- README section ordering for the AI categorization piece.

## Deferred Ideas

The following emerged during discussion and were noted for future phases / v2 (full list in CONTEXT.md `<deferred>`):

- Bulk AI backfill of the 43k NPL seed meds at seed time
- Per-row "Beställ" CTA inside the dashboard banner
- Severity gradient coloring on banner rows
- AI suggestion + acceptance as distinct audit actions
- Caching AI suggestions by (name, atcCode)
- OpenAI / local mock as runtime-selectable second provider (the seam IS in place, just not exercised in v1 ship)
- Free-text therapeutic class column alongside the enum (hybrid model)
- Auto-fire LLM call on field blur
- Confidence-aware UI thresholds (auto-fill on `hog`)
- Inline ghost-text Tab-to-accept suggestion
- SSE/WebSocket push for dashboard updates
- Banner badge on bottom-tab Läkemedel nav icon
- Persistent app-shell strip across every page
- i18n framework adoption
- Per-vårdenhet override of therapeutic class
- AI suggestion history endpoint for admins
- Multi-select on the Terapeutisk klass filter combobox
