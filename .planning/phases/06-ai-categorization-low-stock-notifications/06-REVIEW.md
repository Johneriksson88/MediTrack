---
phase: 06-ai-categorization-low-stock-notifications
reviewed: 2026-05-23T00:00:00Z
depth: standard
files_reviewed: 41
files_reviewed_list:
  - apps/api/package.json
  - apps/api/prisma/migrations/20260523124435_0012_medication_therapeutic_class/migration.sql
  - apps/api/prisma/schema.prisma
  - apps/api/src/app.ts
  - apps/api/src/auth/permissions.ts
  - apps/api/src/db/auditAllowlist.ts
  - apps/api/src/env.ts
  - apps/api/src/plugins/errorHandler.ts
  - apps/api/src/routes/ai/index.ts
  - apps/api/src/routes/ai/status.ts
  - apps/api/src/routes/ai/suggest.ts
  - apps/api/src/routes/dashboard/index.ts
  - apps/api/src/routes/dashboard/lowStock.ts
  - apps/api/src/services/aiCategorization.service.ts
  - apps/api/src/services/dashboard.service.ts
  - apps/api/src/services/medication.service.ts
  - apps/api/test/admin.ping.test.ts
  - apps/api/test/aiCategorization.integration.test.ts
  - apps/api/test/auth.flow.smoke.test.ts
  - apps/api/test/auth.me.test.ts
  - apps/api/test/contracts.therapeuticClass.test.ts
  - apps/api/test/dashboard.integration.test.ts
  - apps/api/test/medications.therapeuticClass.integration.test.ts
  - apps/web/src/components/AiSuggestionChip.tsx
  - apps/web/src/components/ConfidenceBadge.tsx
  - apps/web/src/components/TherapeuticClassCombobox.tsx
  - apps/web/src/features/ai/useAiAvailability.ts
  - apps/web/src/features/ai/useSuggestTherapeuticClass.ts
  - apps/web/src/features/dashboard/useLowStockQuery.ts
  - apps/web/src/features/medications/useMedicationMutations.ts
  - apps/web/src/features/orders/useOrderMutations.ts
  - apps/web/src/routes/dashboard/__tests__/DashboardLowStockCard.test.tsx
  - apps/web/src/routes/dashboard/DashboardLowStockCard.tsx
  - apps/web/src/routes/dashboard/DashboardPage.tsx
  - apps/web/src/routes/lakemedel/__tests__/MedicationSheet.ai.test.tsx
  - apps/web/src/routes/lakemedel/LakemedelFilter.tsx
  - apps/web/src/routes/lakemedel/LakemedelPage.tsx
  - apps/web/src/routes/lakemedel/MedicationSheet.tsx
  - apps/web/vitest.setup.ts
  - docker-compose.yml
  - .env.example
  - README.md
  - packages/shared/src/constants/therapeuticClass.ts
  - packages/shared/src/contracts/ai.ts
  - packages/shared/src/contracts/dashboard.ts
  - packages/shared/src/contracts/medication.ts
  - packages/shared/src/contracts/permissions.ts
  - packages/shared/src/index.ts
findings:
  critical: 0
  warning: 7
  info: 6
  total: 13
status: issues_found
---

# Phase 6: Code Review Report

**Reviewed:** 2026-05-23
**Depth:** standard
**Files Reviewed:** 41 (+ 1 migration directory)
**Status:** issues_found

## Summary

Phase 6 delivers AI categorization (Anthropic Claude Haiku 4.5 with tool_use +
5s AbortController) and a dashboard low-stock banner. All the high-leverage
design decisions land cleanly:

- **Single-seam discipline (D-106 / SC #4).** `@anthropic-ai/sdk` is imported
  in exactly one production source file (`aiCategorization.service.ts`) plus
  the test mock — verified by grep across `apps/`. The route, service, and
  error-mapping layers are properly separated.
- **Graceful degradation (D-107 / D-108).** `ANTHROPIC_API_KEY` is
  `z.string().optional()` with no `.min(1)`; `isAvailable()` is the runtime
  source of truth; `docker-compose.yml` defaults via `${ANTHROPIC_API_KEY:-}`;
  the FE conditional render via `useAiAvailability` removes the affordance
  cleanly when unset.
- **Prompt-injection defense.** Documented layered mitigation (Anthropic
  `tool_use` `input_schema` enum + server-side `llmToolUseSchema.parse`) is
  faithfully implemented — even a fully-coerced user input cannot exfiltrate
  out-of-enum data.
- **RBAC (D-15 `ai:suggest`).** `apotekare` + `admin` only; permissions map
  is type-complete via `Record<ActionKey, Role[]>`; integration Test 4 in
  `aiCategorization.integration.test.ts` asserts the matrix end-to-end.
- **Migration 0012 (CR-02 preservation).** The hand-edit that strips the
  spurious `DROP INDEX "Medication_name_trgm_idx"` from `prisma migrate
  diff` output is present, with a NOTE comment block in the exact location
  the DROP would have been (lines 24–29 of the migration). The trigram GIN
  index survives.
- **Audit allowlist extension.** `auditAllowlist.ts` AUDIT_ALLOWLIST.Medication
  appends `'therapeuticClass'`; integration test 4 in
  `medications.therapeuticClass.integration.test.ts` proves the diff-at-read
  pipeline surfaces the new column without a new audit action.

Below: 7 warnings and 6 info-level items. No blockers identified.

## Warnings

### WR-01: `TIMEOUT_MS` silently becomes `NaN → 0ms` for non-numeric env values

**File:** `apps/api/src/services/aiCategorization.service.ts:99`
**Issue:** `const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 5000);`
uses bare `Number(...)`. If a deployment ever sets `AI_TIMEOUT_MS=foo` or
`AI_TIMEOUT_MS=` (empty string in the env explicitly, not unset), the result
is `NaN`. `setTimeout(fn, NaN)` is treated as `setTimeout(fn, 0)` by Node,
so the AbortController fires immediately on every request and every AI call
returns `504 ai_timeout` — a hard outage that bypasses the Zod env-validation
fail-fast guarantee. Empty string survives `??`, so production is one
`AI_TIMEOUT_MS=` env mishap away from total AI breakage.

**Fix:** Validate at the same layer as the rest of `env.ts` (or at minimum
defensively in the service):

```ts
const rawTimeout = Number(process.env.AI_TIMEOUT_MS);
const TIMEOUT_MS = Number.isFinite(rawTimeout) && rawTimeout > 0
  ? rawTimeout
  : 5000;
```

Or, preferred: add to `env.ts` as `AI_TIMEOUT_MS: z.coerce.number().int()
.positive().default(5000)` and read `env.AI_TIMEOUT_MS`. The current code
comment claims this knob is "NOT part of the env.ts Zod schema" deliberately,
but Zod can express the test-only override too — the test sets the env BEFORE
import in either case.

### WR-02: `bucketConfidence(NaN)` silently returns `'lag'`

**File:** `apps/api/src/services/aiCategorization.service.ts:105-111`
**Issue:** If somehow the upstream Zod parse is bypassed (it currently isn't,
but the failure mode matters for forward maintenance), `bucketConfidence(NaN)`
returns `'lag'` because both `NaN >= 0.85` and `NaN >= 0.6` evaluate `false`
— a confidently-wrong "low confidence" suggestion lands in the UI instead of
a thrown error. Today `llmToolUseSchema` validates `z.number().min(0).max(1)`
which rejects `NaN`, but a future change loosening that schema (e.g., to
support a different LLM provider) would silently break confidence semantics.

**Fix:** Add a defensive guard:

```ts
function bucketConfidence(raw: number): AiSuggestionResponse['confidence'] {
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) {
    throw new Error(`bucketConfidence: invalid raw value ${raw}`);
  }
  if (raw >= 0.85) return 'hog';
  if (raw >= 0.6) return 'medel';
  return 'lag';
}
```

### WR-03: Tooltip `aiAvailable === false` branch is dead code, comment is stale

**File:** `apps/web/src/routes/lakemedel/MedicationSheet.tsx:188-192`
**Issue:** The `tooltipText` ternary inside `AiCategoryBlock` says:

```ts
// UI-SPEC §4 — tooltip switches based on disable reason; suppressed
// while the button is in isFetching state.
// (aiAvailable === false path is unreachable here because we early-return above.)
const tooltipText = fieldsEmpty
  ? 'Fyll i namn och ATC-kod för att hämta förslag.'
  : null;
```

The comment notes the `aiAvailable === false` branch is unreachable (correct),
but the tooltip also goes `null` when `isFetching` or `formIsSaving` is true,
even though the button stays disabled in those states. A user clicking a
disabled "Hämtar förslag…" button gets no tooltip explaining why — minor
UX gap. The bigger issue: the comment claims "tooltip switches based on
disable reason" but only one reason is handled.

**Fix:** Either expand the ternary or update the comment to reflect that
the tooltip intentionally covers the fields-empty case only and the
spinner is its own affordance:

```ts
// Tooltip surfaces ONLY the fields-empty disable reason; the loading
// spinner inside the button is its own affordance for isFetching.
const tooltipText = fieldsEmpty && !isFetching && !formIsSaving
  ? 'Fyll i namn och ATC-kod för att hämta förslag.'
  : null;
```

### WR-04: `Använd förslag` button missing `disabled={formIsSaving}`

**File:** `apps/web/src/routes/lakemedel/MedicationSheet.tsx:244-252`
**Issue:** The "Använd förslag" Apply button has no `disabled` prop. The
parent Sheet form's Spara button correctly disables on `isPending`, but if
the user clicks "Använd förslag" while a save is in flight, the
`setValue('therapeuticClass', cls, { shouldDirty: true })` call still
executes and dirties the form mid-save. The mutation already in flight
won't pick up the new value (the body was serialized at `mutateAsync` call
time), so the user's apply silently has no effect on the current save.
The next save would carry it, but there's no feedback indicating the apply
landed.

**Fix:**
```tsx
<Button
  variant="outline"
  size="sm"
  type="button"
  disabled={formIsSaving}
  onClick={() => onApply(aiSuggestion.therapeuticClass)}
  className="mt-1"
>
  Använd förslag
</Button>
```

### WR-05: `LakemedelPage` parses `class` URL param via membership-check cast

**File:** `apps/web/src/routes/lakemedel/LakemedelPage.tsx:52-57`
**Issue:** The URL parameter parse uses a manual membership check + type
assertion:

```ts
const classParam = searchParams.get('class') ?? '';
const therapeuticClass: TherapeuticClass | '' =
  (THERAPEUTIC_CLASSES as readonly string[]).includes(classParam)
    ? (classParam as TherapeuticClass)
    : '';
```

The shared `therapeuticClassEnum` (Zod) already encodes this validation
exactly, and using `.safeParse(classParam)` would surface the canonical
contract identically (and stays in sync if `THERAPEUTIC_CLASSES` ever
changes — the cast pattern works but only because `.includes` happens to
type-narrow correctly via `as readonly string[]`). Drift risk: if a
contributor changes the Zod schema to add normalization (e.g., uppercase),
this hand-rolled parse would silently disagree.

**Fix:**
```ts
import { therapeuticClassEnum } from '@meditrack/shared';
// ...
const classParam = searchParams.get('class') ?? '';
const parsed = therapeuticClassEnum.safeParse(classParam);
const therapeuticClass: TherapeuticClass | '' = parsed.success ? parsed.data : '';
```

### WR-06: `RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE` read via `process.env` instead of `env.ts`

**File:** `apps/api/src/app.ts:80`
**Issue:** Not Phase 6-specific but appears in the Phase 6 file list. The
plugin uses:

```ts
max: parseInt(process.env.RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE ?? '30', 10),
```

This bypasses the Zod-validated `env` object — if the env var is set to
`'foo'`, `parseInt` returns `NaN`, and `@fastify/rate-limit` then either
no-ops or behaves unpredictably depending on internal handling. Same fail-
open risk as WR-01: the rate limit can silently disable itself.

**Fix:** Add to `env.ts`:

```ts
RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE: z.coerce.number().int().positive().default(30),
```

and use `env.RATE_LIMIT_LOGIN_PER_IP_PER_MINUTE`.

### WR-07: MedicationSheet AI test #7 simulates `onError` inside the mock, not via the real hook path

**File:** `apps/web/src/routes/lakemedel/__tests__/MedicationSheet.ai.test.tsx:418-428`
**Issue:** Test 7 calls `toast.error('AI-förslaget tog för lång tid — försök
igen.')` directly inside the mocked `mutateAsync` implementation rather than
allowing the real `useSuggestTherapeuticClass.onError` handler to fire. This
means the test is asserting that the test setup itself calls `toast.error`,
not that the hook's `onError` routes the `ai_timeout` envelope to the right
copy. A bug introduced into the production hook's `onError` (e.g., a typo in
the Swedish string or a missing branch) would not be caught.

The file itself acknowledges this with a comment ("the real hook implementation
already routes ai_timeout → that exact toast"), but the comment is doing the
work that the assertion should be doing.

**Fix:** Either rely on the integration test that exercises the hook end-to-end,
or do a partial mock (`vi.importActual<...>`) so the real `onError` fires while
just `mutationFn` is stubbed. The current shape is a tautology that contributes
no signal to the production hook's correctness.

## Info

### IN-01: `params.slice(0, paramIdx - 1)` is a no-op

**File:** `apps/api/src/services/medication.service.ts:189`
**Issue:** After building `params` array and `paramIdx` cursor, `params.length`
equals `paramIdx - 1` (because `paramIdx` is the NEXT placeholder index,
starting at 2 with one element pushed). The `.slice(0, paramIdx - 1)` call
slices to `params.length` — keeping all elements. The intent ("exclude limit/
offset params") is fine because `pageSize`/`skip` are not appended to `params`
at all; they're passed as separate trailing args to `$queryRawUnsafe`. So
the slice is dead-code-equivalent.

**Fix:** Replace with `...params` (or, if defensive, add an assertion):
```ts
...params,
```
The comment makes the code easier to reason about, but the slice obscures
the actual control flow.

### IN-02: `TooltipProvider` is instantiated per render in the disabled branch

**File:** `apps/web/src/routes/lakemedel/MedicationSheet.tsx:223-232`
**Issue:** `<TooltipProvider>` is rendered conditionally inside `AiCategoryBlock`.
React re-renders this branch on every form keystroke (because `name` and
`atcCode` are watched form fields). Negligible performance cost for one
provider, but the standard Radix pattern is to hoist `TooltipProvider` to
a top-level App boundary. Worth a one-time cleanup if there's a future
`<TooltipProvider>` somewhere else in the tree (deduplication).

**Fix (low priority):** Move `TooltipProvider` to the app root or a Sheet-
level wrapper.

### IN-03: AI-suggest route has a TODO marker for rate-limiting

**File:** `apps/api/src/routes/ai/suggest.ts:29-33`
**Issue:** Per the prompt context, this TODO is intentional (T-06-15
disposition). The README documents the v2 candidate explicitly. Flagged
here only for completeness — no action required.

### IN-04: `dashboard.service.ts` sort tie-break uses Postgres collation; tests assert via JS `localeCompare`

**File:** `apps/api/src/services/dashboard.service.ts:76-77`,
`apps/api/test/dashboard.integration.test.ts:99-103`
**Issue:** Service uses Postgres `ORDER BY ... m."name" ASC` (default DB
collation). Test 1 asserts the same ordering via `a.name.localeCompare(b.name)`
in Node — a different collation algorithm. For the seeded Swedish-name
dataset these will usually agree, but unusual Unicode (composed vs
decomposed forms, character collation differences for Å/Ä/Ö) can produce
divergence. The plan calls this out as a deferred item — flagged for the
audit trail only.

**Fix (v2):** Either fix the ORDER BY to use `COLLATE "en-x-icu"` or similar
consistent with the test, or change the test to read the actual server order
and verify only the ratio invariant.

### IN-05: `AbortController` race between `clearTimeout` and `abort()`

**File:** `apps/api/src/services/aiCategorization.service.ts:195-246`
**Issue:** If the LLM responds at the same millisecond the AbortController
fires, the SDK's behavior is implementation-defined. The current logic catches
`AbortError` and `APIUserAbortError` and maps both to `AiTimeoutError`. The
`finally` block calls `clearTimeout`, so a successful response cannot trigger
a late abort. However, if `controller.abort()` fires AFTER the `messages.create`
promise resolves but BEFORE `clearTimeout` runs (theoretically possible if the
event loop reorders), no harm done — the timeoutId is already in the queue but
the promise resolved cleanly. Worth a brief comment but not a bug.

**Fix:** Optionally add a `if (controller.signal.aborted) ... ` check before
returning, but this is over-engineering for the residual risk.

### IN-06: Test fixtures use `Date.now()` strings for "unique" names

**File:** `apps/api/test/medications.therapeuticClass.integration.test.ts:66-67`
(and similar in other tests)
**Issue:** Tests generate "unique" Medication names via template literals like
`__phase6plan02_test1_N_${Date.now()}` + `${Date.now() + 1}`. If two tests in
the same suite run within the same millisecond (rare but possible on fast
machines), the +1 trick avoids collision but offers no atomic-uniqueness
guarantee. Currently safe because tests run sequentially and each cleans up
in a `finally` block, but the pattern is brittle.

**Fix (low priority):** Use `crypto.randomUUID()` or a counter for guaranteed
uniqueness:
```ts
import { randomUUID } from 'node:crypto';
const nameN = `__phase6plan02_test1_N_${randomUUID()}`;
```

---

_Reviewed: 2026-05-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
