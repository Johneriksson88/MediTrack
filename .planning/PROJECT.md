# MediTrack

## What This Is

An internal web tool for Swedish healthcare units (vårdenheter) to manage medication stock and ordering. Nurses, pharmacists, and admins view current stock, place multi-line medication orders, track them through `Utkast → Skickad → Bekräftad → Levererad`, and see low-stock warnings — replacing today's error-prone manual lists and email.

Delivered as the Medovia mid-level fullstack interview submission (one-week timebox).

## Core Value

A nurse can place an order for a low-stock medication and, when delivered, the stock balance and audit trail update atomically — reliably, with no manual reconciliation. Everything else (auth, AI, notifications, history views) supports this one loop.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- [x] Role-based auth with three roles — `apotekare`, `sjuksköterska`, `admin` — with route guards and BE policy enforcement. *Validated in Phase 1: foundation-auth* (AUTH-01..07, UX-01; 18/18 vitest green, RBAC envelope verbatim Swedish, three seeded users on `Avdelning 4, Karolinska`, four-breakpoint UX-01 matrix human-approved)
- [x] `docker compose up` runs the full stack locally with seed data. *Validated in Phase 1: foundation-auth* (postgres + api + web all healthy on fresh `up --build`; seed idempotent via upsert)
- [x] Medication registry with name, ATC code, form, strength, current stock — list / create / edit / delete. *Validated in Phase 2: medication-catalog* (CAT-01..07, STK-03, STK-04; Prisma `Medication` + `CareUnitMedication` with `@@unique([careUnitId, medicationId])` + `pg_trgm` GIN index; 43 538-row NPL seed with deterministic ~8% below-threshold PRNG; GET/POST/PATCH/DELETE `/api/medications` with RBAC + `careUnitId` scoping + soft-delete-with-restore; 40/40 web tests green; 5 items in `02-HUMAN-UAT.md` await live-stack walkthrough)
- [x] Search and filter on name, ATC code, or form. *Validated in Phase 2: medication-catalog* (LakemedelFilter: 200ms-debounced search, ATC combobox, Form select, "Visa endast under tröskel" chip; all four combine into one query and round-trip through URL search params — deep-linkable)
- [x] Low-stock warning when current stock < per-medication threshold. *Validated in Phase 2: medication-catalog* (LowStockBadge with AlertTriangle icon on Lager cell; LowStockBanner above the list; `defaultLowStockThreshold(form)` heuristic in shared package; InlineEditThreshold with optimistic update + rollback)
- [x] Append-only audit log of every mutation (who / what / when) with admin view. *Validated in Phase 5: audit-log* (AUD-01..03; Prisma `$extends` middleware + per-concern `AsyncLocalStorage` instances writing audit rows inside the same tx as the originating mutation; `/admin/audit` browse page with three URL-as-state combobox filters, cursor pagination, and request-grouped diff panel; three-layer append-only enforcement — owner-binding BEFORE triggers (0008), named non-owner `meditrack_app` role REVOKE (0010), empty-entityId BEFORE INSERT trigger (0011) — plus ESLint bans on `update*/delete*/upsert/createMany` outside seed; per-email + per-IP login rate-limit via `@fastify/rate-limit`; 102/102 vitest green including 17 audit + 4 rate-limit integration tests covering nested-tx, parallel-tx, keep-alive frame isolation, and rollback isolation invariants)
- [x] In-app low-stock notification banner on the dashboard with auto-refresh. *Validated in Phase 6: ai-categorization-low-stock-notifications* (NTF-01, NTF-02; dedicated `GET /api/dashboard/low-stock` returning `{rows, total}` with its own `['dashboard', 'low-stock']` cache key, careUnit-scoped via `req.user!.careUnitId`, sorted server-side by urgency ratio; three-layer refresh per D-119 — sibling invalidations on `useDeliverOrder` + 4 sites in `useMedicationMutations`, `refetchOnWindowFocus: true`, `refetchInterval: 30_000`; full enumeration with celebratory empty state)
- [x] AI auto-categorization of medications into therapeutic class from name/ATC. *Validated in Phase 6: ai-categorization-low-stock-notifications* (AI-01, AI-02, AI-03; single-seam `aiCategorization.service.ts` is the only file importing `@anthropic-ai/sdk`; `POST /api/ai/suggest-therapeutic-class` uses Claude Haiku 4.5 + `tool_use` structured output + 5s `AbortController` (overridable via test-only `env.AI_TIMEOUT_MS`); confidence bucketed server-side to `hog/medel/lag` per D-111; `ANTHROPIC_API_KEY` optional per D-107 — without it the FE button is hidden, not disabled; `requirePermission('ai:suggest')` gates apotekare+admin, sjukskoterska 403; AI-02 reframed per D-113 as override-by-enum-bucket from the 14-value `TherapeuticClass` enum (Postgres + Prisma + Zod) — documented up front in README; shared `<TherapeuticClassCombobox>` consumed by both LakemedelFilter and MedicationSheet; `?class=N` URL-as-state on /lakemedel; migration 0012 preserves the CR-02 trgm GIN index via hand-edit; Phase 5 audit middleware automatically surfaces `therapeuticClass: null → X` via the D-95 + D-97 diff-at-read pipeline; 22/22 verifier must-haves passed, 12-step end-to-end demo approved live)
- [x] Dashboard depth + back-nav fix. *Validated in Phase 9: dashboard-depth-back-nav* (ORD-09, ORD-10; new role-discriminated `DashboardOrdersCard` on `/dashboard` rendering attention-bound orders per role — sjuksköterska sees Egna utkast + recent history; apotekare/admin see Skickad-att-bekräfta + Bekräftad-att-leverera — fed by a new `GET /api/dashboard/orders` endpoint (`requireSession` + careUnit-scoped per D-16, `dashboardOrdersResponse` Zod discriminated union per D-141/D-142) and a new `useDashboardOrdersQuery` hook with three-layer refresh + `DASHBOARD_ORDERS_QUERY_OPTIONS` named export and 5 mutation invalidations against `['dashboard', 'orders']`; `DashboardPage` responsive 2-col grid (D-145) with `items-stretch` + both cards `h-full flex flex-col` so the row stretches symmetrically at ≥1024px regardless of natural content asymmetry, and LowStockCard data + loading + error + empty branches all participate in the stretch (max-h-80 cap dropped); `useBestallningarBackLink` hook propagates `?from=<status>` through 4 navigator sites and 5 ComposeOrderPage back-link sites so `Tillbaka från orderdetalj` returns to the previously-active status tab from tab clicks, deep links, or the dashboard card; 287/287 tests green (web 151 / api 136), 4/4 roadmap success criteria verified, 0 open gaps after Plan 09-04 closed the wide-screen whitespace gap + code-review --fix resolved 8 warnings)
- [x] Sharpened medication-picker UX on both catalog and compose-order surfaces. *Validated in Phase 8: compose-catalog-ux* (CAT-09, CAT-10, ORD-08; new `GET /api/medications/atc-codes` + shared `AtcCodeCombobox` (free-text fallback uppercased on select) reused in both `LakemedelFilter` and the `MedicationSheet` user-create form per D-134, with `['atc-codes']` invalidated on `useCreateMedication.onSuccess` per D-133; `medicationSearchResponse` extended with `globalCatalogMatchCount` (pre-D-45-exclusion count via parallel `findMany` + `count`) per D-139, driving two verbatim D-140 empty-state variants on the typeahead — "Inget i NPL matchade »query«" vs "Alla träffar finns redan i din vårdenhet"; new `GET /api/orders/picker-suggestions` with server-side dedupe returns top-5 most-ordered CareUnitMedications + top-5 below-threshold rows, rendered by the new `PickerSuggestionsBlock` on `MedicationPickerSheet` before any keystroke, reusing `dashboard.service.listLowStockForUnit` widened in lockstep with `lowStockItem` per D-138; 10/10 verifier truths passed, 5 items await live-browser smoke testing in `08-HUMAN-UAT.md`)

### Active

<!-- Current scope. Building toward these. -->

**Mandatory (from brief §2.1):**

- [x] Medication registry with name, ATC code, form, strength, current stock — list / create / edit / delete *(validated in Phase 2)*
- [x] Search and filter on name, ATC code, or form *(validated in Phase 2)*
- [x] Multi-line order creation (one or more medications + desired quantity) *(validated in Phase 3)*
- [ ] Order status machine `Utkast → Skickad → Bekräftad → Levererad` with transitions enforced *(partial — Utkast→Skickad shipped in Phase 3 with 409 lock; Bekräftad/Levererad pending Phase 4)*
- [ ] Per-vårdenhet order history view
- [ ] Stock auto-decrement on delivery (transactional)
- [x] Low-stock warning when current stock < per-medication threshold *(validated in Phase 2)*

**Chosen optionals (from brief §2.2):**

- [x] AI auto-categorization of medications into therapeutic class from name/ATC *(validated in Phase 6)*
- [x] Append-only audit log of every mutation (who / what / when) with admin view *(validated in Phase 5)*
- [x] Role-based auth with three roles — `apotekare`, `sjuksköterska`, `admin` — with route guards and BE policy enforcement *(validated in Phase 1)*
- [x] In-app low-stock notification banner on the dashboard *(validated in Phase 6)*

**Interview deliverables (from brief §3.3 + §4):**

- [x] `docker compose up` runs the full stack locally with seed data *(validated in Phase 1)*
- [ ] README.md with: purpose, architecture choices and rationale, run instructions, known gaps, what I'd do with more time
- [ ] At least one meaningful unit or integration test (target: order delivery flow including stock + audit)
- [ ] Git history that tells the story (atomic, well-messaged commits — reviewer reads them)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- **CSV / PDF export of order history** — 5th optional; lower interview signal than the four chosen; cuttable since the screen itself shows history.
- **AI: predictive restock** — needs time-series consumption data this app won't have at submission.
- **AI: chatbot** — fragile to demo live in the interview; harder to write a defensible test for.
- **OAuth / SSO** — internal tool; email/password is sufficient for v1 and the demo.
- **Email delivery for notifications** — adds infra (mail provider, queue, templating) for marginal interview signal vs an in-app banner.
- **Mobile app / PWA install** — web-responsive is enough; brief asks for "responsivt UI", not native.
- **Real-time order updates** — polling/refetch via React Query is enough; WebSockets out of scope.
- **Multi-vårdenhet UI switching** — data model is multi-tenant from day 1, but UI scopes to the logged-in user's unit in v1 (the §6 "50 units" question is answered architecturally, not via UI).
- **Inventory across multiple physical stockrooms per unit** — one stock balance per medication per vårdenhet.

## Context

- **Brief is in Swedish.** Source PDF at `local/intervju-testcase-1-1-.pdf` (Medovia → Faraz Naeem). Contact for questions: `faraz.naeem@medovia.se`.
- **Domain vocabulary is Swedish** (läkemedel, beställning, vårdenhet, lagersaldo, ATC-kod, apotekare, sjuksköterska). Decision: UI uses Swedish, code uses English-translated names (see Key Decisions).
- **Reviewer rubric (brief §5)** weights code quality & architecture ★★★★★, API/data modeling ★★★★, system design & scalability ★★★★, UI/UX ★★★, README & communication ★★★. Reviewers explicitly value a well-motivated partial solution over an uncommented complete one — bias decisions toward defensibility, not feature count.
- **Live interview follow-up.** §6 questions to design for: concurrent ordering by two nurses, scaling 1 → 50 vårdenheter, retrofitting auth, what I'm least proud of. The architecture must give clean answers to all four.
- **Medovia is going "AI-first"** per §1. The chosen AI optional (auto-categorization) speaks directly to that positioning.
- **No prior code in this repo.** Greenfield. `.planning/` and `.claude/` are the only existing trees; `local/` is gitignored brief storage.

## Constraints

- **Tech (frontend)**: TypeScript + React — locked by user.
- **Tech (backend)**: Node.js + TypeScript — proposed; same-language stack keeps cognitive load low and lets DTOs/types be shared end-to-end. Subject to confirmation on approval.
- **Tech (database)**: PostgreSQL — the domain is unambiguously relational (orders → order_lines → medications, audit, user → unit) and Postgres' row-level locking gives a real answer to the §6 concurrency question.
- **Tech (ORM)**: Prisma — TS-native, schema-first migrations, generated types. Fastest path to a defensible data model in a one-week budget.
- **Tech (local run)**: Docker Compose — `docker compose up` is the README's golden command (brief §3.3 calls this "ett plus").
- **Timeline**: full week from `2026-05-19`. Reviewer reads commit history → must be atomic and narrative throughout, not back-loaded.
- **Domain fidelity**: Swedish UI labels match brief vocabulary verbatim (e.g., the status pills must read `Utkast / Skickad / Bekräftad / Levererad`).
- **Audit + concurrency + multi-tenancy are non-negotiable architecturally**, even where the UI doesn't surface them, because they're the questions the interviewer will ask.
- **Lightweight bias**: no Kubernetes, no message queues, no microservices, no GraphQL federation — every added moving part must be motivated in the README.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TS+React on the frontend | User-locked; matches Medovia's stack | ✓ Done (Phase 1) |
| Node.js + TypeScript + Fastify on the backend | Same-language stack; Fastify is TS-native and fast; Express is the boring alternative if Fastify trips us | ✓ Done (Phase 1) |
| PostgreSQL + Prisma | Relational domain; row-level locks for §6 concurrency answer; Prisma generates types from schema | ✓ Done (Phase 1) |
| React + Vite + TanStack Query + Tailwind + shadcn/ui | Vite for fast dev loop; TanStack Query gives loading/error states (brief §3.2) almost for free; shadcn for stressed-nurse UX without writing CSS | ✓ Done (Phase 1) |
| Vitest for tests | Lightweight, Vite-native, satisfies §3.1's "minst en enhets-/integrationstest" requirement | ✓ Done (Phase 1, 18/18 green) |
| Swedish UI, English code identifiers | UI matches the domain spec verbatim; code stays portable and readable for non-Swedish reviewers | ✓ Done (Phase 1) |
| AI optional = auto-categorization by name/ATC | Cheapest of the three AI suboptions; most testable; useful in the UI (filter by therapeutic class) | ✓ Done (Phase 6 — Claude Haiku 4.5 + tool_use, single-seam service, override-by-enum-bucket per D-113) |
| Auth = email/password + sessions + 3-role enum | Real RBAC enforced on BE every mutation; no OAuth; brief §6 question on retrofitting auth answered by *doing* it | ✓ Done (Phase 1) |
| Audit log = append-only `audit_events` table via BE middleware | Cheap to build, hard to bypass, demos well; admin role can view | — Pending (Phase 5) |
| Notifications = in-app banner on dashboard from a stock-level computed field | Email skipped; smaller scope, fast win, no extra infra | ✓ Done (Phase 6 — dedicated endpoint + own cache key + three-layer refresh per D-119) |
| Multi-tenant data model from day 1 (`care_unit_id` on orders + `user_care_unit` join) | Brief §6 "50 vårdenheter" question is answered architecturally, not via UI | ✓ Done (User+CareUnit in Phase 1; Order.careUnitId + careUnit-scoped queries in Phase 3 with 404 existence-probe protection) |
| Stock decrement uses Postgres transaction + `SELECT … FOR UPDATE` on medication row | Brief §6 "two nurses ordering simultaneously" question gets a real answer | — Pending (Phase 4) |
| Docker Compose: `postgres` + `api` + `web` services, with a seed script | One command to run; reviewer doesn't fight with local setup | ✓ Done (Phase 1; api on `node:20-bookworm-slim` after Prisma 5 / Alpine incompat) |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-25 after Phase 9 (dashboard-depth-back-nav) completion — role-discriminated DashboardOrdersCard + 2-col `items-stretch` grid + symmetric `h-full flex flex-col` cards shipped on `/dashboard`; `useBestallningarBackLink` propagates `?from=<status>` through 9 sites so back-nav preserves the active status tab; Plan 09-04 closed the wide-screen whitespace gap and a follow-on code-review --fix pass resolved 8 warnings; 287/287 tests green, 4/4 roadmap success criteria verified, 0 open gaps*
