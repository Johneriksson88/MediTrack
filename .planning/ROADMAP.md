# Roadmap: MediTrack

**Created:** 2026-05-19
**Last updated:** 2026-05-24 — phases 8–11 added (post-Phase-7 scope expansion before final submission)
**Mode:** Vertical MVP (per-phase) — each phase ships an end-to-end demonstrable slice (DB → API → UI → tests).
**Total phases:** 11 (1–7 complete; 8–11 added 2026-05-24)
**Total v1 requirements:** 47 (all mapped, no orphans)
**Target submission:** within 7 days of `2026-05-19` (brief deadline)

## Sequencing Principles

1. **Every phase ends demo-able.** If the week runs out mid-roadmap, the last completed phase is still a working slice.
2. **Foundation first, vertical slices after.** Phase 1 sets the scaffolding (auth, app shell, mobile-first layout, RBAC plumbing) that every later phase inherits — paying that cost once.
3. **Core value loop completes by end of Phase 4.** Phases 1–4 deliver the full `Utkast → Skickad → Bekräftad → Levererad` with stock and concurrency. Everything after is augmentation.
4. **Audit, AI, and notifications come after the core loop works.** These are differentiators, not the spine. They can degrade independently.
5. **Phase 7 is a real phase, not "polish if time."** Docker Compose, README, and final tests are graded heavily in the brief — they get a budgeted slot.

## Phase Summary

| # | Phase | Goal | Requirements | UI |
|---|-------|------|--------------|----|
| 1 | Foundation & Auth | 4/4 | Complete   | 2026-05-20 |
| 2 | Medication Catalog | 4/4 | Complete   | 2026-05-21 |
| 3 | Draft Orders | 4/4 | Complete | 2026-05-22 |
| 4 | Confirm, Deliver & Stock | 3/3 | Complete   | 2026-05-22 |
| 5 | Audit Log | 11/11 | Complete   | 2026-05-23 |
| 6 | AI Categorization & Low-Stock Notifications | 3/3 | Complete   | 2026-05-23 |
| 7 | Ops & Submission Polish | 10/10 | Complete   | 2026-05-24 |
| 8 | Compose & Catalog UX | — | Pending | — |
| 9 | Dashboard Depth + Back-Nav | — | Pending | — |
| 10 | Order Numbers | — | Pending | — |
| 11 | Quick Polish | — | Pending | — |

## Phase Details

### Phase 1: Foundation & Auth
**Goal:** Establish the project skeleton so a seeded user can log in, see an app shell scoped to their `vårdenhet`, and have RBAC enforced end-to-end on a stub mutation. Mobile-first layout system in place.
**Mode:** mvp
**UI hint:** yes
**Requirements:** AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, UX-01
**Plans:** 4/4 plans complete
  - [x] 01-02-PLAN.md — Walking Skeleton: monorepo + DB + login + /me + docker-compose end-to-end
  - [x] 01-03-PLAN.md — RBAC primitives: PERMISSIONS map + requirePermission + admin:ping + useAuth/useCan/Can
  - [x] 01-04-PLAN.md — Responsive app shell + 4 nav destinations + AuthSkeleton + logout (UX-01)
  - [x] 01-05-PLAN.md — 3-role seeds + integration smoke test + FE reconciliation + README seeds
**Success Criteria:**
1. Seeded user logs in at `/login`, lands on a dashboard scoped to their `vårdenhet`, and session survives refresh.
2. A backend endpoint exists that enforces role check (e.g. `GET /me/permissions`) — calling it without a session returns 401, with wrong role returns 403, both as JSON.
3. App shell renders without horizontal scroll on 360 / 768 / 1024 / 1440 px breakpoints; primary nav reachable on each.
4. `docker compose up` brings up `postgres`, `api`, `web`; integration smoke test passes (login + `/me` round-trip).
5. Three seed users exist — one per role — each bound to the same `vårdenhet`; their credentials are documented in the README seeds section.

### Phase 2: Medication Catalog
**Goal:** Authorized users can manage their `vårdenhet`'s medication registry — list, search, filter, create, edit, delete — with low-stock thresholds visible at a glance.
**Mode:** mvp
**UI hint:** yes
**Requirements:** CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-06, CAT-07, STK-03, STK-04
**Plans:** 4/4 plans complete
  - [x] 02-01-PLAN.md — Slice 1 (Wave 1): migration + pg_trgm + seed (43k NPL rows) + GET /api/medications + add Sheet (typeahead + Skapa nytt) + list page with low-stock badge + count banner
  - [x] 02-02-PLAN.md — Slice 2 (Wave 2): LakemedelFilter — search input (200ms debounce) + ATC combobox + Form select + below-threshold chip, all URL-deep-linkable
  - [x] 02-03-PLAN.md — Slice 3 (Wave 3): PATCH /api/medications/:id (NPL-strip + scope-safe) + RBAC-aware edit/view Sheet + InlineEditThreshold (optimistic mutation)
  - [x] 02-04-PLAN.md — Slice 4 (Wave 4): DELETE /api/medications/:id (soft-delete via deletedAt) + DeleteMedicationDialog + Sheet Ta-bort wiring + transparent-restore verification
**Success Criteria:**
1. Catalog page lists all medications for the current `vårdenhet` with name, ATC code, form, strength, current stock, and a visible indicator when stock < threshold.
2. Search by name (case-insensitive, partial) and filter by ATC prefix + form work in combination on the same query.
3. Users with role `apotekare` or `admin` can create, edit, and (soft-)delete a medication; users with role `sjuksköterska` cannot — both UI and API enforce this.
4. Threshold is editable on each medication and the indicator updates immediately after save (TanStack Query invalidation).
5. Catalog page is usable on mobile (360 px): list collapses to a card-per-medication layout, primary actions reachable.

### Phase 3: Draft Orders
**Goal:** As a nurse, I want to compose, save, edit, and submit a multi-line medication order, so that the order reaches the pharmacist and the medications can be delivered.
**Mode:** mvp
**UI hint:** yes
**Requirements:** ORD-01, ORD-02, ORD-03
**Plans:** 4/4 plans complete
  - [x] 03-01-schema-foundation-PLAN.md — Slice 1 (Wave 1): Prisma Order+OrderLine+OrderStatus migration + shared order contracts + order:* permission keys + OrderLockedError/ValidationFailedError + seeded Utkast draft
  - [x] 03-02-drafts-list-PLAN.md — Slice 2 (Wave 2): POST/GET /api/orders + full order service layer (all 8 functions) + drafts list page (table ≥md / cards <md) + Ny beställning → POST empty → navigate + /bestallningar/:id route stub
  - [x] 03-03-compose-view-PLAN.md — Slice 3 (Wave 3): GET /api/orders/:id + line CRUD endpoints + picker-options + ComposeOrderPage Mode A + MedicationPickerSheet + QuantityStepper (optimistic+debounced+long-press) + 409 order_locked contract live
  - [x] 03-04-submit-discard-PLAN.md — Slice 4 (Wave 4): POST /submit + DELETE / + OrderStatusPill + SubmitConfirmationBanner + DiscardDraftDialog + Mode B render + canonical D-73 integration suite (5 scenarios)
**Success Criteria:**
1. User can create a draft order containing one or more `(medication, quantity)` rows; the order persists with status `Utkast`.
2. User can edit a draft (add lines, remove lines, change quantities); changes persist; total line count and quantities re-render correctly.
3. User can submit a draft; status transitions to `Skickad`; subsequent edit attempts on the order return HTTP 409 with a JSON error.
4. Order draft form is usable on mobile: line items stack vertically, quantity inputs are 44 px+ touch targets, totals visible without scrolling away from the submit button.

### Phase 4: Confirm, Deliver & Stock
**Goal:** Pharmacist completes the order lifecycle — `Skickad → Bekräftad → Levererad` — and on delivery, medication stock increments atomically with row-level locking. Order history is visible per `vårdenhet`. One integration test covers the full pipeline.
**Mode:** mvp
**UI hint:** yes
**Requirements:** ORD-04, ORD-05, ORD-06, ORD-07, STK-01, STK-02, OPS-03
**Plans:** 3/3 plans complete
  - [x] 04-01-PLAN.md — Slice A: schema + shared contracts + RBAC + confirmOrder service + POST /confirm + Mode C wiring + confirm integration test (ORD-04, ORD-06)
  - [x] 04-02-PLAN.md — Slice B: deliverOrder service (CUM-batch lock D-79) + POST /deliver + Mode D/E + DeliverConfirmDialog + OrderActorTrail + full pipeline + pg_locks concurrency test (ORD-05, ORD-06, STK-01, STK-02, OPS-03)
  - [x] 04-03-PLAN.md — Slice C: list API widening (alla / comma-list) + shadcn Tabs + BestallningarPage status-tabs + OrdersTable/CardList + seedDemoOrders fan-out (ORD-07)
**Success Criteria:**
1. User with role `apotekare` or `admin` advances an order through `Skickad → Bekräftad → Levererad`; invalid jumps (e.g. `Utkast → Bekräftad`) return HTTP 409.
2. On `Levererad`, every line's quantity is added to the medication's current stock in a single DB transaction; the catalog reflects the new totals immediately.
3. The delivery handler uses `SELECT … FOR UPDATE` on each affected medication; two concurrent delivery requests on the same order serialize, not race (covered by a deliberate concurrency test).
4. Order history page lists every order for the current `vårdenhet` with status, lines, timestamps, and the user who made each transition.
5. Integration test exercises the full path `create draft → submit → confirm → deliver` and asserts: order final status is `Levererad`, every medication's stock incremented by the correct line quantity, no race window observable.

### Phase 5: Audit Log
**Goal:** Every mutation in the system is recorded in an append-only `audit_events` table, and an admin can browse it. The audit table cannot be modified from any code path (architectural guarantee, not a runtime check).
**Mode:** mvp
**UI hint:** yes
**Requirements:** AUD-01, AUD-02, AUD-03
**Plans:** 11/11 plans complete
  - [x] 05-01-PLAN.md — Slice 1 (Wave 1): AuditEvent schema + REVOKE migration + Prisma $extends middleware + AsyncLocalStorage plugin + auditAllowlist + permission key + shared contracts + auth.login_failed write (AUD-01 infrastructure)
  - [x] 05-02-PLAN.md — Slice 2 (Wave 2): audit.service.ts (cross-tenant D-16 exception) + GET /api/audit/events (cursor-paginated) + GET /api/audit/filters + AuditPage replaces stub + AuditFilterBar (3 comboboxes URL-as-state) + responsive AuditTable/AuditCardList + AuditDiffPanel + Kopiera permalink (AUD-02)
  - [x] 05-03-PLAN.md — Slice 3 (Wave 3): ESLint no-restricted-syntax rule + 5 integration tests (full pipeline coverage, rollback-leaves-no-audit, grep, REVOKE rejection, passwordHash redaction, admin-only 403/403/200) + README audit-log section with §6 prep (AUD-03)
  - [x] 05-04-PLAN.md — Gap closure (Wave 4): CR-01 D-91 transactional contract fix (Prisma.getExtensionContext routing for pre-loads + audit INSERT) + real rollback regression test (replaces vacuous Test 2) + one-shot orphan-row purge migration (0009) + README §"How the audit hook works" drift correction (AUD-01)
  - [x] 05-05-PLAN.md — Gap closure (Wave 4): CR-02 cursor decode reason code fix (`invalid_quantity` → `invalid_cursor`) + CR-04 auth.logout actor attribution via lookup-before-destroy in DELETE /api/auth/session + WR-07 unknown-email failed-login entityType (`session` → `auth_attempt`, entityId = attempted email) + 3 regression tests (AUD-01, AUD-02)
  - [x] 05-06-PLAN.md — Wave 5 (reviews HIGH #1 + #2 + CR-01/04): per-concern ALS refactor (actorALS / activeTxStackALS / actionOverrideALS) + activeTxStack ships as default + Fastify 3-arg onRequest with als.run + nested/parallel/cross-request regression tests (AUD-01) — REWRITTEN in place from save/restore design
  - [x] 05-07-PLAN.md — Wave 6 (reviews HIGH #3): named DB role `meditrack_app` (non-owner) via migration 0010 + REVOKE UPDATE/DELETE/TRUNCATE on AuditEvent FROM meditrack_app + docker-compose DATABASE_URL/DIRECT_URL split + README §Database roles (AUD-01, AUD-03)
  - [x] 05-08-PLAN.md — Wave 7 (reviews HIGH #4 + MEDIUM #5 + LOW #12): ESLint createMany ban (D-93 enforcement) + $executeRaw CI grep with allowlist (T-05-01 closure) + migration 0011 BEFORE INSERT trigger rejecting empty entityId (WR-07 DB-layer backstop) (AUD-01, AUD-03)
  - [x] 05-09-PLAN.md — Wave 8 (reviews MEDIUM #7 + #8 + LOW #19): @fastify/rate-limit on POST /api/auth/login (per-email + per-IP buckets, configurable) + INVARIANT comments at auth.login_failed write sites + Test 17 codifying tx-isolation invariant + auth.ratelimit.test.ts (4 tests) (AUD-01, AUTH-01)
  - [x] 05-10-PLAN.md — Wave 9 (reviews MEDIUM #9 + #11): filter-cache staleness comment in audit.service.ts + README §Lessons learned (enterWith→run + shared-store anti-pattern + Prisma $extends key-casing trap) (AUD-02)
  - [x] 05-11-PLAN.md — Wave 9 docs-only parallel-safe (reviews Tier C — MEDIUM #6/#10/#18 + LOW #14/#15/#17): CONTEXT.md <deferred> expanded with 6 new entries + README §What I'd do with more time bullets + §Architecture choices ($extends vs $use) (AUD-01, AUD-02, AUD-03)
**Success Criteria:**
1. Every successful POST/PATCH/DELETE on medications and orders writes an `audit_events` row with `(actor_user_id, entity_type, entity_id, action, before, after, timestamp)`.
2. User with role `admin` can browse the audit log at `/admin/audit` in reverse-chronological order; filters by user, entity type, and action all combine.
3. No API endpoint, no service function, and no Prisma method in the codebase writes UPDATE or DELETE against `audit_events` — verified by repository-wide grep in the README and absent from generated client code.
4. Auditing is implemented as a centralized hook (BE middleware or service-layer wrapper) so adding a new entity automatically gets audited without bespoke code.

### Phase 6: AI Categorization & Low-Stock Notifications
**Goal:** Two differentiating features land on top of the working core: an LLM suggests therapeutic class on medication save, and the dashboard surfaces low-stock items as a visible, auto-refreshing banner.
**Mode:** mvp
**UI hint:** yes
**Requirements:** AI-01, AI-02, AI-03, NTF-01, NTF-02
**Success Criteria:**
1. On medication create or edit, the system calls an LLM with name + ATC code and returns a structured `{therapeuticClass, confidence}` payload within a documented latency budget; the user can accept the suggestion or override it with free text.
2. Saved therapeutic class persists and is filterable on the catalog page alongside the existing name / ATC / form filters.
3. Dashboard renders a low-stock banner listing every medication for the current `vårdenhet` whose current stock < threshold; the banner refetches after any stock-changing mutation (delivery) and updates without a manual reload.
4. LLM call is isolated behind a single service interface so swapping providers (or mocking in tests) is one change in one file.

**Plans:** 3/3 plans complete
  - [x] 06-01-PLAN.md — Slice A (Wave 1): dashboard low-stock banner end-to-end — new dedicated GET /api/dashboard/low-stock endpoint + DashboardLowStockCard with three-layer refresh (mutation invalidation + window focus + 30s poll) + sibling invalidations in deliver/medication mutations (NTF-01, NTF-02)
  - [x] 06-02-PLAN.md — Slice B (Wave 1, [BLOCKING] migration): therapeuticClass schema + filter combobox — Postgres TherapeuticClass enum + Medication.therapeuticClass column + shared constants + audit allowlist extension + leftmost LakemedelFilter combobox with URL-as-state ?class=N + medication.service extensions (AI-03)
  - [x] 06-03-PLAN.md — Slice C (Wave 2, depends on 06-02): AI service single-seam + suggest endpoint + Sheet integration — aiCategorization.service.ts with Anthropic Claude Haiku 4.5 + tool_use + 5s AbortController + ai_unavailable/ai_timeout error codes + ai:suggest permission + AiSuggestionChip + ConfidenceBadge + MedicationSheet two-field AI layout + useAiAvailability + useSuggestTherapeuticClass (AI-01, AI-02)

### Phase 7: Ops & Submission Polish
**Goal:** The repo is submission-ready — one command runs the full stack with seed data, the README answers every question the brief and §6 reviewer will ask, and the git history reads as a narrative.
**Mode:** mvp
**UI hint:** no
**Requirements:** OPS-01, OPS-02, OPS-04
**Plans:** 10/10 plans complete
  - [x] 07-01-readme-restructure-PLAN.md — Slice 1 (Wave 1): README restructure to brief-aligned canonical layout + Swedish translation of Phase 5+6 deep dives + consolidated Kända luckor + Med mer tid (OPS-02, OPS-04)
  - [x] 07-02-arkitekturval-PLAN.md — Slice 2 (Wave 2, depends on 07-01): Arkitekturval section — 9-row matrix + 3 prose paragraphs (Postgres+FOR UPDATE / Prisma $extends / named meditrack_app role) + Vad vi medvetet avstått från (OPS-02, OPS-04)
  - [x] 07-03-pnpm-verify-PLAN.md — Slice 3 (Wave 2, depends on 07-01): root pnpm verify chain (lint + typecheck + test + build) + apps/api typecheck script + README §Tester update (OPS-04)
  - [x] 07-04-sc04-playwright-PLAN.md — Slice 4 (Wave 2, depends on 07-01): SC#4 Playwright verification harness + 6×360 px PNGs + data-test="primary-nav" on Sidebar+BottomTabBar + README ## Mobil-först verifiering section (OPS-02, OPS-04)
  - [x] 07-05-demo-rundtur-and-sex-svar-PLAN.md — Slice 5 (Wave 3, depends on 07-01+07-04): ## Demo-rundtur (5 minuter) + ## §6-svar 7 elevator pitches + §6 supporting bullets in audit deep dive (OPS-02, OPS-04)
  - [x] 07-06-final-demo-path-gate-PLAN.md — Slice 6 (Wave 4, depends on all): final demo-path human gate on fresh docker compose up + git log narrative review + closing chore commit (OPS-01, OPS-02, OPS-04)
  - [x] 07-07-readme-factual-fixes-PLAN.md — Slice 7 (Wave 1 gap-closure): close 07-VERIFICATION CR-01 (README Tailwind CSS 4→3) + WR-02 (audited models list Session,AuditEvent→User,Session) (OPS-02, OPS-04)
  - [x] 07-08-sc04-redirect-guard-PLAN.md — Slice 8 (Wave 1 gap-closure): close WR-01 (sc04 harness redirect-guard for /login→/dashboard at viewports 768/1024/1440) + IN-01 (page.$$ → page.locator API refactor) (OPS-02, OPS-04)
  - [x] 07-09-drop-redundant-typecheck-PLAN.md — Slice 9 (Wave 1 gap-closure): close WR-03 (remove redundant `tsc --noEmit` from apps/web scripts.build — typecheck already covered by pnpm verify chain) (OPS-02, OPS-04)
  - [x] 07-10-dashboard-sort-collation-fix-PLAN.md — Slice 10 (Wave 1 follow-on): fix dashboard low-stock ORDER BY collation mismatch — Postgres `m."name" ASC` (C/POSIX) vs JS `localeCompare()` (locale-aware) — use `LOWER(m."name") ASC` (NTF-01)
**Success Criteria:**
1. `docker compose up` on a clean clone brings up `postgres`, `api`, `web` with seed data (3 seed users, one `vårdenhet`, ~10 medications, at least one in-flight order) — verified on a fresh machine or VM.
2. README contains every brief-required section: purpose, stack rationale (TS+React+Fastify+Prisma+Postgres motivated against alternatives), run instructions, known gaps, "with more time" — plus short answers to the §6 interview questions (concurrency, 50-unit scaling, retrofitting auth, what you'd do differently).
3. `git log --oneline` reads as a coherent narrative — every commit atomic, conventional-commits style, no "wip" or "fix typo".
4. Final mobile-first verification pass: the four required breakpoints render correctly on every primary screen (login, catalog, order create, order history, audit, dashboard).

### Phase 8: Compose & Catalog UX
**Goal:** Sharpen the two medication picker surfaces (catalog `MedicationSheet` and compose-order `MedicationPickerSheet`) so users find drugs faster, create new ones without confusion, and never see a confusing "Inget läkemedel matchade" when the real cause is D-45 exclusion.
**Mode:** mvp
**UI hint:** yes
**Requirements:** CAT-08, CAT-09, CAT-10, ORD-08
**Success Criteria:**
1. Add-medication picker shows "Skapa nytt läkemedel" as an always-visible primary action above the typeahead — surfaceable without typing.
2. ATC-code input on the Add-medication form is a combobox preloaded with every unique ATC code from the global NPL catalog; the combobox component is shared with the LakemedelFilter ATC selector (single source of truth — no fork).
3. Add-medication picker shows distinct empty states: "Alla träffar finns redan i din vårdenhet" when D-45 excludes everything, vs "Inget i NPL matchade `{q}`" when the global catalog has no match for the query.
4. Compose-order picker surfaces 10 suggestions before any search input — combining most-ordered medications (by order-line count for the user's vårdenhet) and low-stock items (below their threshold), deduplicated.
5. Suggestions block hides after the user starts typing (≥1 char) and reappears when the query is cleared.

### Phase 9: Dashboard Depth + Back-Nav
**Goal:** Make `/dashboard` a useful first-screen by adding a role-scoped "Beställningar" card showing orders requiring the user's attention, and fix the routing bug where Tillbaka från orderdetalj drops the previously-active status tab.
**Mode:** mvp
**UI hint:** yes
**Requirements:** ORD-09, ORD-10
**Success Criteria:**
1. Dashboard renders a new "Beställningar" card alongside the existing "Läkemedel under tröskel" card; content varies by role:
   - `sjukskoterska` sees: Egna Utkast count + recent order history
   - `apotekare` / `admin` sees: Skickad-att-bekräfta count + Bekräftad-att-leverera count
2. Each card item links to the corresponding `/bestallningar` tab and pre-selects it (no manual tab click required).
3. When a user reaches `/bestallningar/:id` from a non-default tab (e.g. Bekräftade) and clicks "Tillbaka till beställningar", they return to the same tab — not the default Utkast tab.
4. The fix works whether the detail view was reached from a tab click, a deep link, or the new dashboard card (Phase 9 #1).

### Phase 10: Order Numbers
**Goal:** Every order has a generated, human-readable order number persisted in the database and visible everywhere an order is rendered. Replaces today's bare cuid for user-facing reference.
**Mode:** mvp
**UI hint:** yes (UI changes are display-only — no new pages)
**Requirements:** ORD-11
**Success Criteria:**
1. Prisma migration adds `orderNumber` to `Order` (NOT NULL after backfill, UNIQUE per vårdenhet). Generation strategy decided in discuss-phase (e.g. `ORD-2026-0001` per-vårdenhet sequence, or year-prefixed monotonic — to be motivated against alternatives).
2. `POST /api/orders` and downstream status mutations include `orderNumber` in the response payload; existing tests updated.
3. Existing rows are backfilled by the migration — no rows left with NULL `orderNumber`.
4. Order number is displayed in every order-rendering surface: BestallningarPage tabs, order detail header, and the Phase 9 dashboard "Beställningar" card.
5. Order number remains stable across status transitions (the same draft order keeps the same number after submit/confirm/deliver).

### Phase 11: Quick Polish
**Goal:** Two small UX corrections that didn't fit earlier phases — global access to Logga ut from the top navigation, and clearer guidance copy on Konto for non-admins.
**Mode:** mvp
**UI hint:** yes (frontend-only, no backend changes)
**Requirements:** UX-02, UX-03
**Success Criteria:**
1. Top nav exposes a "Logga ut" control visible at every breakpoint — not gated behind the desktop UserPillPopover or a navigation to Konto. Reuses the existing `useLogout` mutation; no new endpoint.
2. Konto page guidance copy for `sjukskoterska` / `apotekare` reads exactly "Ändringar kan endast göras av administratör." (replaces "Denna åtgärd kräver adminrättigheter.").

## Coverage Audit

| Phase | REQ Count | REQ-IDs |
|-------|-----------|---------|
| 1 | 8 | AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, UX-01 |
| 2 | 9 | CAT-01, CAT-02, CAT-03, CAT-04, CAT-05, CAT-06, CAT-07, STK-03, STK-04 |
| 3 | 3 | ORD-01, ORD-02, ORD-03 |
| 4 | 7 | ORD-04, ORD-05, ORD-06, ORD-07, STK-01, STK-02, OPS-03 |
| 5 | 3 | AUD-01, AUD-02, AUD-03 |
| 6 | 5 | AI-01, AI-02, AI-03, NTF-01, NTF-02 |
| 7 | 3 | OPS-01, OPS-02, OPS-04 |
| 8 | 4 | CAT-08, CAT-09, CAT-10, ORD-08 |
| 9 | 2 | ORD-09, ORD-10 |
| 10 | 1 | ORD-11 |
| 11 | 2 | UX-02, UX-03 |
| **Total** | **47** | All v1 REQ-IDs mapped exactly once ✓ |

## Cuttability (if time runs short)

If the week tightens unexpectedly, drop in this order. Phases 8–11 are all post-Phase-7 scope expansion and are the **first** to cut — the original v1 spine (1–7) is already submission-ready.

1. **Phase 8** is the largest of the added phases and the cleanest cut — picker UX improvements polish an already-working flow.
2. **Phase 9** can be deferred — dashboard works without the orders card; the back-nav bug (ORD-10) is annoying but not blocking.
3. **Phase 10** is small but schema-touching; cuttable if migration risk feels too high near the deadline. Cut alongside any Phase 9 dashboard column that references the order number.
4. **Phase 11** is two trivial frontend changes — ship even if everything else slips.
5. **Phase 6** is the cleanest cut from the original v1 — both AI and richer notifications are optional in the brief; demoing without them is still a strong submission.
6. **Phase 5** can be deferred — audit log is optional in the brief; you'd lose one optional in the README's "with more time" but keep the core loop intact.
7. **Phase 4 cannot be cut.** Stock + delivery + concurrency is the Core Value; without it the brief's mandatory scope is not met.
8. **Phase 7 cannot be cut.** Without docker-compose, README, and clean git, the reviewer scoring drops independently of feature completeness.

---
*Roadmap created: 2026-05-19*
*Phases 8–11 added: 2026-05-24*
