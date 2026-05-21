---
quick_id: 260521-kek
slug: fix-cr-01-replace-z-coerce-boolean-with-
date: 2026-05-21
status: complete
mode: quick
one_liner: Replaced z.coerce.boolean() on medicationListQuery.belowThreshold with an explicit enum+transform parser, added 6 regression tests, and removed a stale Plan-03 TODO comment.
files_modified:
  - packages/shared/src/contracts/medication.ts
  - apps/web/src/routes/lakemedel/MedicationTable.tsx
files_created:
  - apps/api/test/contracts.medicationListQuery.test.ts
commits:
  - fix(shared): replace z.coerce.boolean() with explicit enum parser on belowThreshold (CR-01)
---

# Quick Task 260521-kek — Summary

## What Was Done

### Task 1 — medicationListQuery parser

Replaced the offending line and updated the surrounding JSDoc:

```diff
- /**
-  * Query parameters for GET /api/medications (D-44).
-  * All numeric fields use z.coerce.* so Fastify query strings parse cleanly.
-  * `belowThreshold` coerced from string 'true'/'false'/'1'/'0'.
-  */
+ /**
+  * Query parameters for GET /api/medications (D-44).
+  * All numeric fields use z.coerce.* so Fastify query strings parse cleanly.
+  * `belowThreshold` accepts only the literal strings 'true' or 'false';
+  * absent is treated as unfiltered. Anything else returns 400 validation_failed.
+  *
+  * CR-01 fix: `z.coerce.boolean()` is unusable for query strings — it treats
+  * any non-empty string (including 'false') as `true` because it's just
+  * `Boolean(value)` under the hood. Using an explicit enum + transform makes
+  * `?belowThreshold=false` actually mean "do not filter" for direct API
+  * callers (the FE's clean-URL policy already omits the param when false).
+  */
  export const medicationListQuery = z.object({
    q: z.string().optional(),
    atc: z.string().optional(),
    form: z.string().optional(),
-   belowThreshold: z.coerce.boolean().optional(),
+   belowThreshold: z
+     .enum(['true', 'false'])
+     .transform((v) => v === 'true')
+     .optional(),
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  });
```

The output type stays `boolean | undefined`, so the service code `if (belowThreshold) { ... }` on line 112 of `medication.service.ts` keeps the same semantics (filter applies only when truthy). No service changes required.

### Task 2 — Regression test

Added `apps/api/test/contracts.medicationListQuery.test.ts` (61 lines) with 6 cases:

```
✓ parses "true" as true
✓ parses "false" as false (the CR-01 bug — was previously true)
✓ treats absent as undefined
✓ rejects "1" (numeric truthiness no longer accepted)
✓ rejects "yes" (only literal "true"/"false" allowed)
✓ rejects empty string
```

Test placed in api package (not shared) because shared has no vitest setup and the schema is consumed by the api package — adding a tiny test infrastructure to shared would have been scope creep. All 6 pass:

```
RUN  v2.1.9 C:/Projekt/MediTrack/apps/api
 ✓ test/contracts.medicationListQuery.test.ts (6 tests) 2ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### Task 3 — Stale TODO removal

```diff
- * Tröskel cell: number display. // TODO Plan 03: <InlineEditThreshold>
+ * Tröskel cell: <InlineEditThreshold> with click-to-edit + optimistic update.
```

`InlineEditThreshold` was wired in Plan 02-03 (Wave 4) and is rendered at line 126 of the same file. The JSDoc now matches reality.

## Verification

| Check | Command | Result |
|-------|---------|--------|
| Shared rebuild | `pnpm --filter @meditrack/shared build` | exit 0 |
| API typecheck | `pnpm --filter @meditrack/api build` | exit 0 |
| Web typecheck + bundle | `pnpm --filter @meditrack/web build` | exit 0 |
| New CR-01 regression | `vitest run test/contracts.medicationListQuery.test.ts` | 6/6 pass |
| Existing web tests (regression check) | `pnpm --filter @meditrack/web exec vitest run` | 40/40 pass |

## Resolves

- `02-REVIEW.md` CR-01 — confirmed fixed via regression test.
- `02-VERIFICATION.md` anti-patterns row 2 (CR-01 WARNING).
- `02-REVIEW.md` IN-04 (stale TODO in MedicationTable.tsx).

## Caller-Safety Confirmation

Traced `belowThreshold` end-to-end before shipping:

1. `LakemedelPage.tsx:44` reads `searchParams.get('belowThreshold') === 'true'` → `boolean`.
2. `LakemedelPage.tsx:84` writes the URL param: `if (merged.belowThreshold) next.set('belowThreshold', 'true')` — only ever `'true'`, never `'false'`.
3. `LakemedelPage.tsx:96` passes to the query hook as `belowThreshold: belowThreshold || undefined`.
4. `useMedicationsQuery.ts:25-28` only sets the URL param when the value isn't `undefined`/`''`.

Net: the FE never emits `?belowThreshold=false`, `?belowThreshold=1`, `?belowThreshold=yes`, etc. The schema tightening only affects direct API callers — exactly the callers CR-01 was about.

## Follow-ups

- The 500 kB JS chunk warning from `vite build` is unchanged; consider code-splitting LakemedelPage in Phase 7 polish.
- If we ever add a `?belowThreshold` use case from the FE that needs `false` (e.g., an "above-threshold-only" toggle), the schema is ready for it — just add the FE write path.
