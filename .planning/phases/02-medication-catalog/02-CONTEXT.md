# Phase 2: Medication Catalog - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Authorized users (any role) view their `vårdenhet`'s medication catalog — name, ATC code, form, strength, stock, low-stock indicator. `apotekare` and `admin` can add (typeahead from the seeded global NPL catalog, with a fallback "Skapa nytt läkemedel" path for drugs not in NPL), edit (stock + threshold for NPL meds; full fields for user-created meds), and soft-delete entries scoped to their vårdenhet. Search by name (case-insensitive partial) combines with filter by ATC prefix + form on the same query. Mobile-first: list collapses to per-medication cards below `md` (768 px); table at `md`+.

**In scope (Phase 2 only — REQ-IDs CAT-01..07, STK-03, STK-04):**
- `Medication` (global, NPL-seeded) + `CareUnitMedication` (per-vårdenhet stock + threshold) Prisma models with migration
- `pg_trgm` extension + GIN index on `lower(Medication.name)` for fast name search at 43k rows
- Seed script reading `apps/api/prisma/seed-data/lakemedel.csv` (43 538 NPL rows, committed) and generating deterministic per-`nplId` stock + threshold for the seeded vårdenhet, with ~8% forced below threshold
- `GET /api/medications` with combined search (`q`), ATC-prefix filter (`atc`), form filter (`form`), offset pagination (`page`, `pageSize`); returns paginated `CareUnitMedication`+`Medication` join rows scoped to `req.user.careUnitId` + count of rows under threshold for the same filter set (powers the banner)
- `POST /api/medications` — typeahead-driven add, plus the secondary "Skapa nytt läkemedel" path (creates `Medication` + `CareUnitMedication` in a transaction)
- `GET /api/medications/search` (lightweight typeahead — top 20 by name+ATC over global `Medication`, excluding those already actively stocked at the caller's vårdenhet)
- `PATCH /api/medications/:careUnitMedicationId` — partial updates (stock, threshold; name/ATC/form/strength only for user-created meds)
- `DELETE /api/medications/:careUnitMedicationId` — soft-delete via `deletedAt`
- Catalog page (`/lakemedel`) with: filter chips (ATC prefix combobox, form dropdown, "Visa endast under tröskel" toggle), search input (debounced), pagination, per-row/card edit Sheet trigger, low-stock pill+icon, count banner, optimistic inline-edit threshold
- Add Sheet (typeahead with "Skapa nytt läkemedel" fallback) + edit Sheet (RBAC-aware: read-only mode for `sjuksköterska`, NPL-locked fields for NPL meds) + AlertDialog delete confirm
- Permission keys widening: `medication:read` (all roles), `medication:create` / `medication:update` / `medication:delete` (apotekare + admin)
- Updated seeds: 3 Phase 1 users + 1 vårdenhet + 43 538 Medications + 43 538 CareUnitMedications for `Avdelning 4, Karolinska`

**Out of scope (other phases):**
- Multi-line order composition referencing CareUnitMedication → Phase 3
- Order confirm/deliver, stock decrement on delivery, concurrency lock → Phase 4
- `audit_events` table + admin browse — Phase 5 retrofits audit middleware that will record all Phase 2 mutations; Phase 2 ships nothing audit-related
- AI therapeutic-class auto-categorization (CAT/AI requirements) → Phase 6
- Dashboard low-stock banner with full enumeration (NTF-01) → Phase 6
- Per-vårdenhet name/form/strength overrides on CareUnitMedication → v2 (not in v1 REQUIREMENTS.md)
- "Restore deleted medication" UI affordance — soft-deleted rows can be revived by re-adding via typeahead (transparent restore); explicit "trash bin" UI is deferred

</domain>

<decisions>
## Implementation Decisions

### Slice Ordering & Commit Strategy

- **D-20:** Vertical-slice ordering for MVP-mode plans — **Slice 1:** Prisma migration (Medication + CareUnitMedication + pg_trgm + GIN) + seed script + `GET /api/medications` + add (typeahead + Skapa nytt) + list page with low-stock pill+icon and count banner. **Slice 2:** search input (debounced) + ATC-prefix + form filter + "Visa endast under tröskel" toggle, all combining on the same query + `[Visa endast under tröskel]` URL param so the filtered view is deep-linkable. **Slice 3:** edit Sheet (RBAC-aware) + inline-edit threshold with optimistic mutation. **Slice 4:** delete (soft-delete via `deletedAt` + AlertDialog confirm). Each slice independently demoable and revertable.
- **D-21:** Commit granularity = one commit per logical task, multi-commit per plan. Reviewer reads commits (brief §5) — pattern from Phase 1 repeats. Expected: ~18-22 commits across the four slices.
- **D-22:** Slice 1 ships the low-stock indicator + count banner already wired. The indicator is the most visible visual moment of the phase (success criterion #1) — it should be present from the first interactive build, not deferred.

### Seed Strategy (NPL CSV)

- **D-23:** Seed data source = `local/lakemedel.csv` (43 538 rows, Läkemedelsverket NPL). Copied to `apps/api/prisma/seed-data/lakemedel.csv` and **committed** to the repo. NPL data is publicly redistributable; `docker compose up` works on fresh clone with no download step. README cites Läkemedelsverket as source.
- **D-24:** Seed inserts ALL 43 538 rows. Batched inserts (`createMany` in 1000-row chunks) target ~10-30 s on first `docker compose up`; subsequent ups are no-ops via upsert on `nplId`. Real demo signal: name search across a realistic catalog returns dozens of hits in <50 ms thanks to pg_trgm.
- **D-25:** Stock + threshold are generated deterministically per `nplId` (e.g., FNV-1a hash of `nplId` as PRNG seed). Stock ∈ [0, 200], threshold ∈ [5, 25], with the PRNG rigged so ~8% of rows land with `stock < threshold`. Reproducible across re-seeds; screenshots in the README match what the interviewer sees live.
- **D-26:** pg_trgm extension is enabled by the Phase 2 migration; GIN index on `lower("Medication"."name") gin_trgm_ops`. Without it, `ILIKE '%paracet%'` table-scans at 43k rows.

### Schema (Global Medication + Per-Vårdenhet Join)

- **D-27:** `Medication` is **global** — one row per drug, ~43 538 rows total at seed. Columns: `id (cuid)`, `nplId (String, unique, nullable for user-created)`, `name`, `atcCode`, `form (String, not enum — 501 NPL values)`, `strength (String, nullable)`, `source ('npl' | 'user')`, `createdAt`. No `careUnitId` here; NPL = canonical registry.
- **D-28:** `CareUnitMedication` is the per-vårdenhet join: `id`, `careUnitId`, `medicationId`, `currentStock (Int)`, `lowStockThreshold (Int)`, `deletedAt (DateTime?)`, `createdAt`, `updatedAt`. Unique on `@@unique([careUnitId, medicationId])` to prevent duplicate active rows. Read queries always filter `deletedAt: null` and `careUnitId: req.user.careUnitId` (D-16 service-layer pattern continues verbatim).
- **D-29:** Brief §6 "scale to 50 vårdenheter" answer is now schema-level: medication metadata stays at 43k rows; only stock+threshold replicates (43k × N vårdenheter). Locked in here because the planner will reference this in success-criteria framing.

### CRUD Semantics

- **D-30:** Create = pick from global Medication (typeahead) + set stock & threshold → POST creates one `CareUnitMedication`. Typeahead excludes drugs already actively stocked at the caller's vårdenhet (no duplicate active rows). Re-adding a soft-deleted drug **transparently restores** the existing row (`UPDATE ... SET deletedAt = NULL, currentStock = new, lowStockThreshold = new`) rather than creating a second row — keeps history continuous.
- **D-31:** "Saknas i registret? Skapa nytt läkemedel" secondary path **ships in Phase 2** — below an empty typeahead result, a `Skapa nytt läkemedel` button expands into a fuller form (name + ATC + form + strength + stock + threshold). Submission creates `Medication { source: 'user' }` and `CareUnitMedication` in one transaction. Interview win: covers the "drug not in NPL" question without v2 punt.
- **D-32:** Edit scope is **ownership-based**: for `Medication.source = 'npl'`, only `currentStock` and `lowStockThreshold` are editable in the Sheet — `name`/`atcCode`/`form`/`strength` render as read-only labels with a "Från NPL" badge. For `Medication.source = 'user'`, all fields are editable. CAT-06 satisfied by the editable subset.
- **D-33:** Delete = soft-delete `CareUnitMedication` only (`SET deletedAt = now()`). Global `Medication` is never deleted by the app — NPL is canonical, user-created Meds are essentially append-only (could be GC'd later if no CareUnitMedication references them, but not in Phase 2). CAT-07 ("soft-delete if historical refs exist") satisfied by being strictly stricter: **always soft-delete**. Phase 4 inherits the filter and adds the "is referenced by order_line?" check only on hard-delete code paths (which Phase 2 doesn't ship).

### CRUD Form UX

- **D-34:** Create + edit form renders as shadcn `<Sheet>` — right-slide on desktop, bottom-sheet on mobile. Footer-pinned actions; mobile bottom-sheet clears the 56 px bottom tab bar + `env(safe-area-inset-bottom)` (Phase 1 UI-SPEC). One component (`MedicationSheet`) handles create/edit/view via `mode` prop. URL doesn't change when the sheet is open.
- **D-35:** Add trigger: shadcn `<Button>` top-right on desktop (next to the page heading); floating action button (FAB) bottom-right on mobile, positioned above the bottom tab bar. Both gated by `<Can action="medication:create">` — `sjuksköterska` doesn't see them. Phase 1 `<Can>` component (D-17) is reused.
- **D-36:** Whole row/card click opens the edit Sheet pre-filled. For `sjuksköterska`, the Sheet opens in `mode="view"` — fields read-only, no Save/Delete buttons; just a "Stäng" affordance. Same component, same shape — single read path.
- **D-37:** Delete control lives in the edit Sheet footer, **left-aligned**, destructive (`variant="destructive"`, red). Tap opens a shadcn `<AlertDialog>` with `Ta bort {name} från {careUnit.name}?` and a softer body: "Läkemedlet finns kvar i NPL-registret och kan läggas till igen." Cancel is default-focused (destructive default).

### Indicator & Threshold UX

- **D-38:** Per-row low-stock indicator = pill + `lucide-react` `AlertTriangle` icon. Pill uses shadcn destructive `<Badge>` (red bg, white text); icon is 14 px, left of the stock number. Pattern matches Phase 1's `<RoleBadge>`. Renders the same on table rows (≥md) and cards (<md).
- **D-39:** Catalog page also shows a **count-only summary banner** above the list: `⚠ N läkemedel under tröskel` with a `[Visa endast under tröskel]` filter chip beside the search input. Banner is dismissible per session (cookie or sessionStorage; Claude's discretion). The filter chip's state is reflected in the URL (`?belowThreshold=true`) so the filtered view is deep-linkable. **Phase 6's NTF-01 dashboard banner does the full enumeration** — different surface, no overlap.
- **D-40:** Default `lowStockThreshold` on typeahead-add is computed by a heuristic lookup keyed on the picked Medication's `form` value. Lookup table lives in `packages/shared/src/constants/medicationDefaults.ts` and is consumed both by the FE (pre-fill) and the BE (validation fallback if FE didn't send a value, though FE always should). Tiers: `5` for injection/lösning/spray (parenteral, low-volume), `20` for tablett/kapsel/dragerad tablett (oral solids, high-volume), `3` for salva/kräm/gel (topical), `10` fallback. STK-03 "sensible default at create time" satisfied. For "Skapa nytt läkemedel", the same heuristic applies once the user picks a `form` value from the dropdown.
- **D-41:** Threshold editable in two places: (a) **inline** on the card/row — click the threshold number → `<Input type="number">` replaces it → Enter or blur saves; (b) inside the edit Sheet (full edit surface). Both go through the same PATCH endpoint.
- **D-42:** Inline-edit threshold uses **optimistic mutation** + rollback on error (`useMutation` with `onMutate` updating the TanStack Query cache and `onError` rolling back). Pill flips colors instantly on Enter; toast on rollback. Sheet-based saves stay **pessimistic** (PATCH → on success, invalidate `['medications', filters]`). Mixed strategy is intentional and scoped per surface.

### API Shape & Permissions

- **D-43:** Permission keys widened in `packages/shared/src/contracts/permissions.ts`: `'medication:read'` (all 3 roles), `'medication:create'`, `'medication:update'`, `'medication:delete'` (apotekare + admin). `PERMISSIONS` map in `apps/api/src/auth/permissions.ts` extends accordingly. `<Can>` and `useCan` consume the new union from day one. The TS `Record<ActionKey, Role[]>` enforces drift-prevention.
- **D-44:** Single `GET /api/medications` endpoint with query params: `q (string)`, `atc (string prefix)`, `form (string)`, `belowThreshold (boolean)`, `page (number, 1-indexed)`, `pageSize (number, default 25, max 100)`. Response: `{ rows: MedicationListItem[], total: number, belowThresholdTotal: number, page, pageSize }`. `belowThresholdTotal` is the count under threshold under the **same filter set** (powers the D-39 banner). All filtering server-side; FE never holds the full 43k locally.
- **D-45:** Typeahead endpoint = `GET /api/medications/search?q=&limit=20` — searches global Medication by `name ILIKE` (pg_trgm) and `atcCode ILIKE`, excludes Medications already actively stocked at `req.user.careUnitId`, returns top 20 with `{ id, name, atcCode, form, strength, source }`. Powers the add-Sheet typeahead.

### Claude's Discretion

- Exact FNV-1a (or alternative) PRNG for deterministic stock/threshold generation in seed script — any reproducible function keyed on `nplId` is acceptable. Document the choice in a comment in `seed.ts`.
- The list of "top-N most common forms" surfaced in the form filter dropdown — derive from CSV by frequency, take top ~15-20, with "Övriga" as the catch-all (selecting it filters to anything outside the top-N). Numbers + the curated list locked into a `packages/shared/src/constants/medicationForms.ts` file.
- Debounce ms on search input (recommend 200 ms), debounce on typeahead (recommend 150 ms — typeahead is hotter).
- Empty-state copy when the catalog has zero rows for a vårdenhet ("Inga läkemedel ännu — lägg till från NPL-registret eller skapa nytt."). Including the empty-state icon choice.
- Whether the bottom-sheet on mobile uses a vaul-based shadcn Sheet variant or the default. Pick whichever renders best at 360 px.
- Focus management when Sheet opens (autofocus first input on edit; autofocus typeahead on create) and keyboard shortcuts (Esc closes Sheet, Cmd/Ctrl+Enter saves) — standard shadcn/Radix defaults are fine.
- ATC autocomplete on the filter input — at 5 000+ distinct ATC codes, a free-text input with prefix-match suggestion list is acceptable; Claude can size the suggestion list (recommend top 10 prefixes matching what's typed).
- Whether to add a `careUnitId` index on `CareUnitMedication` (recommended) plus `[careUnitId, medicationId]` composite — Prisma `@@index` decisions.
- Toast library / wording for mutation feedback. Recommend shadcn `sonner` adapter; Swedish copy ("Läkemedlet sparades", "Kunde inte spara — försök igen").
- Exact `react-hook-form` + `@hookform/resolvers/zod` wiring (already in stack from D-08).
- The "Visa endast under tröskel" chip styling — secondary variant with destructive accent when active.
- File layout under `apps/api/src/routes/medications/*.ts` and `apps/api/src/services/medication.service.ts` (carry forward Phase 1 patterns).
- Whether `MedicationListItem` (the joined DTO) lives in `packages/shared/src/contracts/medication.ts` (yes — D-08 Zod-as-contract pattern continues).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project framing & scope
- `.planning/PROJECT.md` — Locked stack + Key Decisions table (TS+React+Vite+TanStack Query+Tailwind+shadcn, Node+TS+Fastify, Postgres+Prisma, Vitest, Docker Compose). **Key Decisions table is binding** — do not relitigate.
- `.planning/REQUIREMENTS.md` §"Medication Catalog" + §"Stock Logic" — REQ-IDs CAT-01..07, STK-03, STK-04 with full acceptance language. **The reviewable acceptance criteria for this phase.**
- `.planning/ROADMAP.md` §"Phase 2: Medication Catalog" — Goal statement, the 5 success criteria, mode (mvp), requirements list.

### Phase 1 decisions inherited (carry forward, do not re-decide)
- `.planning/phases/01-foundation-auth/01-CONTEXT.md` D-01..D-19 — **all locked**. Especially:
  - **D-08:** Zod schemas in `packages/shared/src/contracts/*.ts` are the FE↔BE contract. `medication.ts` joins `me.ts`, `login.ts`, etc.
  - **D-15:** `PERMISSIONS: Record<ActionKey, Role[]>` map + Fastify `preHandler` factory. Phase 2 extends with `medication:read/create/update/delete`.
  - **D-16:** Service-layer Prisma access, `careUnitId` as the FIRST argument on every service function. Locks the medication service signatures.
  - **D-17:** `useAuth()` + `<Can action="…">` + `useCan(action)` on the FE. Add-button, edit-Sheet save, delete confirm all gated through `<Can>` / `useCan`.
  - **D-19:** Canonical error envelope `{ error: { code, message, details? } }`. Phase 2 uses codes: `unauthenticated`, `forbidden`, `not_found`, `validation_failed`, `conflict_duplicate_medication`.
- `.planning/phases/01-foundation-auth/01-UI-SPEC.md` — Design system (shadcn `new-york` + slate), spacing scale (4 px base + `p-3` / `p-5` extensions), typography (4 size levels, 2 weights), touch targets (≥44 px), bottom-tab-bar dimensions (56 px + safe-area-inset). **Reuse the existing `<EmptyStateCard>` and `<RoleBadge>` components.**

### Existing code patterns (Phase 1 lays the foundation Phase 2 builds on)
- `apps/api/prisma/schema.prisma` — Existing models: `CareUnit`, `User`, `Session`. Phase 2 adds `Medication`, `CareUnitMedication`.
- `apps/api/src/services/user.service.ts` — Service-layer pattern (D-16): `careUnitId` first arg, `prisma` from `../db/client.js`. Mirror for `medication.service.ts`.
- `apps/api/src/routes/me.ts` — Route pattern with `withTypeProvider<ZodTypeProvider>()`, preHandler chain, response schema. Mirror for `routes/medications/*.ts`.
- `apps/api/src/auth/permissions.ts` — `PERMISSIONS` map. Extend with `medication:*` entries.
- `apps/api/src/auth/requireSession.ts` and `requirePermission.ts` — preHandlers reused as-is on all medication routes.
- `packages/shared/src/contracts/permissions.ts` — `ACTION_KEYS` literal tuple. Append the four medication keys; `actionKey` Zod enum auto-updates.
- `packages/shared/src/contracts/me.ts`, `login.ts`, `error.ts` — Zod schema patterns. Mirror in `medication.ts`.
- `apps/web/src/routes/lakemedel/LakemedelPage.tsx` — Stub `<EmptyStateCard icon={Pill} heading="Läkemedel" />`. Replaces with the full catalog page in Slice 1.
- `apps/web/src/components/EmptyStateCard.tsx`, `RoleBadge.tsx` — Reuse where applicable.
- `apps/web/src/auth/*` — `useAuth`, `<Can>`, `useCan` — reuse for RBAC gating.

### Brief (interview source-of-truth — local only, not in repo CI)
- `local/intervju-testcase-1-1-.pdf` §2.1, §3, §5, §6 — Mandatory features, deliverables, evaluation weights, live-interview questions. **Local-only PDF; PROJECT.md and REQUIREMENTS.md are the committed mirror.**

### Tooling / harness
- `CLAUDE.md` — Tooling rules, GSD workflow expectations, stack constraints.
- `.planning/STATE.md` — Current phase progress.
- `.planning/config.json` — Workflow toggles (sequential, plan-check on, verifier on, per-phase research disabled).

### Seed data
- `local/lakemedel.csv` — NPL CSV from Läkemedelsverket. Phase 2 copies this to `apps/api/prisma/seed-data/lakemedel.csv` and commits. **43 538 rows; `nplid;namn;atc_kod;form;form_kod;styrka`; semicolon-delimited; UTF-8 + CRLF.** `styrka` may be empty for some rows (creams, granulates). The `form_kod` column (e.g., `TABLET`, `FICOTA`) is the compact NPL code — not consumed in Phase 2 but worth preserving in seed-data for future use.

No external ADRs or SPEC.md exist for Phase 2 — implementation decisions captured above (D-20..D-45) are the canonical record.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

Phase 1 shipped a working monorepo. Phase 2 extends, doesn't rebuild:

- **Prisma client + db helpers** (`apps/api/src/db/client.ts`) — already wired. Phase 2 only adds models and a migration.
- **Auth middleware chain** (`apps/api/src/auth/requireSession.ts`, `requirePermission.ts`) — composable preHandlers; Phase 2 routes just declare `preHandler: [requireSession, requirePermission('medication:create')]`.
- **Zod type provider** (`fastify-type-provider-zod`) — already configured on the Fastify instance; Phase 2 routes use `r.get<...>(...)` with `schema: { response: { 200: medicationListResponse } }`.
- **`packages/shared` build chain** — already set up; add `contracts/medication.ts` and `constants/medicationForms.ts`, `constants/medicationDefaults.ts`.
- **`<EmptyStateCard>`** — reuse for the "Inga läkemedel ännu" empty state when a vårdenhet has zero CareUnitMedication rows.
- **`<RoleBadge>`** — same Badge primitive pattern Phase 2 will mirror for the low-stock pill (do NOT reuse `<RoleBadge>` directly — make a `<LowStockBadge>` parallel component for clarity).
- **`useAuth` / `<Can>` / `useCan`** — already source-of-truth for RBAC on the FE; Phase 2 wires the new `medication:*` keys through them.
- **TanStack Query setup** — already provides `QueryClient` at app root; Phase 2 adds `['medications', filters]` and `['medication-search', q]` query keys.
- **React Router v7 data mode** — `LakemedelPage` is already registered; just replace its body.
- **App shell with `/lakemedel` already in the tab bar / sidebar nav** — no nav changes needed in Phase 2.

### Established Patterns (Phase 1 → Phase 2 inheritance)

- **Service-layer Prisma access, `careUnitId` first arg** (D-16). Every Phase 2 service function: `function listMedicationsForUnit(careUnitId: string, filters: ListFilters)`. Routes call services; routes never touch Prisma directly.
- **Zod schemas in shared, inferred TS types** (D-08). `medicationListResponse`, `medicationCreateRequest`, `medicationUpdateRequest`, `medicationListItem`. FE consumes via `z.infer<typeof ...>`.
- **Canonical error envelope** (D-19). Phase 2 error codes: `unauthenticated` (401), `forbidden` (403, missing permission OR wrong vårdenhet), `not_found` (404, `careUnitMedicationId` doesn't exist OR belongs to another vårdenhet), `validation_failed` (422, Zod parse failure), `conflict_duplicate_medication` (409, attempt to add a Medication already actively stocked).
- **Permission map drift-prevention** (D-15). `Record<ActionKey, Role[]>` type-completeness forces an entry for every key — adding a key in `packages/shared` without updating the map is a compile error.
- **AuthGate + Can/useCan pair** (D-13, D-17). All Phase 2 routes live under `<AuthGate>`; mutations gate via `<Can>` (UI hide/disable) + `requirePermission` (BE 403). Defense in depth.
- **Mobile-first responsive switching** (D-10, UI-SPEC). Catalog page: `<table>` at `≥md`, mapped `<div>` cards `<md`. Same data, same shape, two layouts.

### Integration Points

- **`/me` response widens** — `permissions: ActionKey[]` includes the new `medication:*` keys. Existing `useAuth().can(action)` works without changes.
- **Bottom tab bar / sidebar nav** — `<NavItem to="/lakemedel" icon={Pill} label="Läkemedel" />` already wired in Phase 1 shell; no changes.
- **`prisma migrate dev`** — Phase 2 ships migration `0002_medication_catalog` (or similar timestamped name) with the new models + pg_trgm extension + GIN index. Phase 1's migration is the starting point.
- **Seed script** (`apps/api/prisma/seed.ts`) — currently seeds 3 users + 1 vårdenhet. Phase 2 extends to also seed 43 538 `Medication` rows from the CSV + 43 538 `CareUnitMedication` rows for the seeded vårdenhet, with deterministic stock/threshold. Idempotent via `upsert` on `nplId` (Medication) and `@@unique([careUnitId, medicationId])` (CareUnitMedication).
- **Docker Compose** (`docker-compose.yml`) — no changes; the api service runs migrations + seed on start. The first `docker compose up` after Phase 2 lands will take ~10-30 s longer due to the 43k-row seed.

</code_context>

<specifics>
## Specific Ideas

- **Swedish UI vocabulary** (continued from Phase 1 D-13, locked):
  - Page heading: `Läkemedel`
  - Add button (desktop): `Lägg till`
  - Empty state heading: `Inga läkemedel ännu`
  - Empty state body: `Lägg till från NPL-registret eller skapa nytt.`
  - Search placeholder: `Sök på namn…`
  - ATC filter label: `ATC-kod`
  - Form filter label: `Form`
  - Below-threshold filter chip: `Visa endast under tröskel`
  - Low-stock banner: `⚠ {N} läkemedel under tröskel`
  - Low-stock pill: `Lågt lager` (in a tooltip when hovering the icon)
  - Sheet headings: `Lägg till läkemedel` (create) / `{name}` (edit) / `{name} · Visning` (sjuksköterska view)
  - Sheet field labels: `Namn`, `ATC-kod`, `Form`, `Styrka`, `Lager`, `Tröskel`
  - "Från NPL" lock badge on NPL-meds in edit Sheet: `Från NPL · namn / form / styrka är låsta`
  - Typeahead empty result: `Inget läkemedel matchade. {Skapa nytt läkemedel?}`
  - Save / Cancel / Delete buttons: `Spara`, `Avbryt`, `Ta bort`
  - Delete confirm dialog title: `Ta bort {name} från {careUnit.name}?`
  - Delete confirm dialog body: `Läkemedlet finns kvar i NPL-registret och kan läggas till igen.`
  - Toast on save success: `Sparat`
  - Toast on save error: `Kunde inte spara — försök igen.`
  - Toast on delete: `Borttaget från {careUnit.name}`
- **NPL source attribution.** A small "Data: Läkemedelsverket NPL" caption in the page footer (or `<details>` element near the count banner). Reviewer can verify the source instantly.
- **`docker compose up` is still the golden command.** Phase 2 must not break it; seed timing must not exceed ~30 s on a modern laptop.
- **§6 prep notes:**
  - "Two nurses ordering simultaneously" — Phase 2's CareUnitMedication has no stock decrement path yet (that's Phase 4 + STK-02 `SELECT … FOR UPDATE`). Phase 2 must NOT block Phase 4's lock pattern — keep mutations atomic and avoid hot-path optimizations that complicate the eventual lock.
  - "Scale to 50 vårdenheter" — D-29 above answers this at the schema level. The planner should add a one-liner to the README in Phase 7 referencing this.
  - "Retrofitting auth" — Phase 2 inherits all of Phase 1's RBAC + service-layer scoping. No retrofit needed; the answer is "we did it from day 1."

</specifics>

<deferred>
## Deferred Ideas

- **Per-vårdenhet name/form/strength overrides** on CareUnitMedication (override columns) — v2 idea (D-32 considered it; rejected for v1).
- **ATC therapeutic-class column on Medication** — that's Phase 6's AI categorization (AI-01..03). Phase 2 keeps Medication shape minimal; the future column will be added by Phase 6's migration.
- **"Restore deleted medication" trash-bin UI** — soft-deleted rows are silently restored on re-add via typeahead (D-30). An explicit trash-bin view ("Tidigare läkemedel") is reasonable Phase 7 polish; not in v1 scope.
- **Hard-delete administration path** for cleaning up `Medication` rows where `source='user'` and no CareUnitMedication references — defer to Phase 7 polish or v2 admin tools.
- **Inline-edit stock value** — same pattern as inline-edit threshold, but stock changes in v1 should flow through the delivery path (STK-01) so we don't bypass the audit story. Phase 2 makes stock editable only via the Sheet (and only because the create form needs an initial value). Document this in the README.
- **Bulk import of CareUnitMedication for new vårdenheter** — if a 51st vårdenhet is added, what's the bootstrap? Currently the seed only handles the one seeded vårdenhet. Defer to v2 admin tools (AUTH-08 onboarding flow).
- **Search ranking improvements** (favorites pinned, frequency-weighted, recency-boosted) — pg_trgm similarity score is enough for v1; ranking polish is Phase 7 or v2.
- **CSV upload to bulk-add medications to a vårdenhet's stock** — interesting power-user feature; v2.
- **Audit-event writes on Phase 2 mutations** — that's Phase 5's audit middleware. Phase 2 ships nothing audit-related; Phase 5 retrofits middleware that records all mutations (including Phase 2's) without changing Phase 2 code.
- **Rate limiting on mutation endpoints** — same deferred posture as Phase 1's `/auth/login` (Phase 7 README "with more time" note).

</deferred>

---

*Phase: 2-Medication Catalog*
*Context gathered: 2026-05-20*
