---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
current_phase: 08
status: ready_to_plan
last_updated: 2026-05-24T20:24:59.648Z
last_activity: 2026-05-24
progress:
  total_phases: 11
  completed_phases: 7
  total_plans: 42
  completed_plans: 42
  percent: 64
stopped_at: Phase 08 complete (3/3) — ready to discuss Phase 9
---

# State: MediTrack

## Project Reference

See: [.planning/PROJECT.md](PROJECT.md) (initialized 2026-05-19)

**Core value:** A nurse can place an order for a low-stock medication and, when delivered, the stock balance and audit trail update atomically — reliably, with no manual reconciliation.

**Current focus:** Phase 9 — dashboard depth + back nav

## Roadmap Reference

See: [.planning/ROADMAP.md](ROADMAP.md) (created 2026-05-19)

**Total phases:** 7
**Phases complete:** 0
**Phases in progress:** 0
**Current phase:** 9

## Phase Progress

| # | Phase | Status |
|---|-------|--------|
| 1 | Foundation & Auth | Pending |
| 2 | Medication Catalog | Pending |
| 3 | Draft Orders | Complete |
| 4 | Confirm, Deliver & Stock | Pending |
| 5 | Audit Log | Complete |
| 6 | AI Categorization & Low-Stock Notifications | Complete |
| 7 | Ops & Submission Polish | Pending |

## Workflow Config

See: [.planning/config.json](config.json)

- **Mode:** interactive
- **Granularity:** standard
- **Execution:** sequential
- **Planning docs committed:** yes
- **Models:** balanced (Sonnet 4.6 default)
- **Per-phase research:** disabled
- **Plan check:** enabled
- **Verifier:** enabled

## Next Action

Phase 6 complete (all 3 plans). 12-step demo-path verified live by user on 2026-05-23 against a fresh `docker compose up`. Phase 6 ready for verifier gate; orchestrator will run that next. After verifier passes, run `/gsd:plan-phase 7` to plan the final Ops & Submission Polish phase.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260521-ip1 | Update Phase 1 regression tests to assert post-Phase-2 permissions arrays | 2026-05-21 | f9cfc28 | [260521-ip1-update-phase-1-regression-tests-to-asser](./quick/260521-ip1-update-phase-1-regression-tests-to-asser/) |
| 260521-k8b | Unblock web build for fresh clone (Dockerfile shared-build step + host pnpm install) | 2026-05-21 | d22d726 | [260521-k8b-install-missing-radix-ui-react-select-vi](./quick/260521-k8b-install-missing-radix-ui-react-select-vi/) |
| 260521-kek | Fix CR-01: replace z.coerce.boolean() on medicationListQuery.belowThreshold with explicit enum parser; +6 regression tests; -1 stale TODO | 2026-05-21 | 63fe897 | [260521-kek-fix-cr-01-replace-z-coerce-boolean-with-](./quick/260521-kek-fix-cr-01-replace-z-coerce-boolean-with-/) |
| 260521-kxa | Fix CR-03: add `.min(1)` to medicationSearchQuery.q so empty searches reject at the API boundary; +5 regression tests | 2026-05-21 | 100aba3 | [260521-kxa-fix-cr-03-enforce-min-length-on-medicati](./quick/260521-kxa-fix-cr-03-enforce-min-length-on-medicati/) |
| 260521-l5c | Fix CR-04: wrap updateCareUnitMedication's two prisma.update calls in prisma.$transaction so combined-field PATCH bodies update atomically | 2026-05-21 | 663b608 | [260521-l5c-fix-cr-04-wrap-updatecareunitmedication-](./quick/260521-l5c-fix-cr-04-wrap-updatecareunitmedication-/) |
| 260521-lc5 | Fix CR-02: follow-up migration aligning Medication.name trgm GIN index with Prisma's ILIKE emit; planner now bitmap-scans the index instead of seq-scanning 43k rows | 2026-05-21 | f900b33 | [260521-lc5-fix-cr-02-add-a-follow-up-migration-that](./quick/260521-lc5-fix-cr-02-add-a-follow-up-migration-that/) |

## Phase 03 Progress

| # | Plan | Status | Commits |
|---|------|--------|---------|
| 03-01 | Schema Foundation | Complete | fded456, edc8b44, 6c2f00f, 392806d |
| 03-02 | Drafts List | Complete | 19954b2, 62d9458, 2c93792, 6b907b3 |
| 03-03 | Frontend List + Compose | Complete | fb5820c, a3212c7, 627a7a8 |
| 03-04 | Submit & Discard | Complete | cfa19c1, 5800a92, c79effa |

## Phase 05 Progress

| # | Plan | Status | Commits |
|---|------|--------|---------|
| 05-01 | Audit Foundation (schema + extension + ALS) | Complete | 9bffbaa, a7dae03, 55afe79 |
| 05-02 | Read API + Admin UI (audit.service + routes + page) | Complete | f2f5473, c3651a5, 3b3de1a |
| 05-03 | Integration tests + ESLint + final hardening | Complete | 72b52e4, 045bdc4, edbcc5b |
| 05-04 | D-91 Gap Closure (Transactional Audit Contract) | Complete | 7ed96b2, 0e650b5, 11e150c, 948564c, aa1c757 |
| 05-05 | CR-02/CR-04/WR-07 Gap Closure (error taxonomy + actor attribution + auth_attempt entityType) | Complete | af15979, d2ce395, d7bd8ae, 9c6a8f2 |

## Phase 06 Progress

| # | Plan | Status | Commits |
|---|------|--------|---------|
| 06-01 | Slice A — Dashboard Low-Stock Banner | Complete | db4dbba, 1dd8106, 5db3612, 400d497, ee253c2, 3507213 |
| 06-02 | Slice B — Therapeutic Class Schema + Filter Combobox | Complete | c15b124, 7275300, 59808a7, 914fec3, edb4a6c, 326218f, 63c80d0 |
| 06-03 | Slice C — AI Categorization Service + Suggest Endpoint + Sheet Integration | Complete | 1c7be55, 9c665c9, dad7c32, 43480cb, c90609a, 0ff5755, fbfa053, bef3cf9, 6ca4fb7, d546933, ad5b4c4, ccc6e6f, 0ae304e (+ this closeout) |

## Decisions Made

- D-46 confirmed: OrderStatus Postgres enum verbatim mirrors ORDER_STATUSES (utkast/skickad/bekraftad/levererad)
- D-48 confirmed: single Order table, status column distinguishes lifecycle
- D-63 confirmed: no @@unique on OrderLine — same med allowed twice in v1
- usePickerOptionsQuery and useOrderQuery exported as stubs in Slice 2 — Slice 3 consumes unchanged
- formatRelative() helper inlined in DraftCard.tsx — no date-fns dep (T-03-SC)
- pickerOptionsRoute registered before getOrderRoute — prevents param collision on :id
- Full order service layer implemented in Slice 2 (lines/submit/delete/picker routes); Slices 3-4 add FE wiring
- Atomic tx.order.updateMany compare-and-swap precondition (no assertOrderEditable helper) — preserves Postgres row-level write lock for full tx duration (D-54)
- D-57 full-Order-on-line-op: DELETE/POST/PATCH lines return complete OrderResponse; FE setQueryData in onSuccess
- QuantityStepper uses debounceRef + longPressInitRef/Repeat refs (not useDebounce hook) to avoid stale closure in intervals
- MedicationPickerSheet optimistic close is fail-silently UX in Slice 3 (toast is the error feedback)
- Submit + Kasta inert in Slice 3 — Slice 4 wires useSubmitOrder + DiscardDraftDialog
- ORD-03 complete: submitOrder (Utkast→Skickad) atomic updateMany, D-73 5-scenario integration suite, OrderStatusPill + SubmitConfirmationBanner + DiscardDraftDialog + wired ComposeOrderPage Mode B
- Phase 3 complete: ORD-01/02/03 all demoable end-to-end
- D-98 evolution: BEFORE-trigger raising SQLSTATE 42501 binds the table OWNER (REVOKE alone is bypassed by Postgres for owners); REVOKE kept as defense-in-depth for a future non-owner runtime role
- D-90 confirmed live: Prisma $extends($extends({ query: ... })) intercepts create/update/updateMany/delete/deleteMany on the 6 audited models; query keys MUST be lowercase modelProps names (Prisma runtime type def), not PascalCase
- D-92 confirmed live: AsyncLocalStorage seeded by Fastify onRequest hook via als.enterWith; seed scripts run outside the scope → middleware skips audit row creation
- D-97 + T-05-03 closed: resolveEntityId(Session, row) returns row.userId (the actor User.id), NEVER row.id (the raw signed session token); AUDIT_ALLOWLIST drops User.passwordHash and Session.id from the after JSON
- D-94 live: order.submit / order.confirm / order.deliver / stock.increment / order.softDelete / auth.login / auth.logout overrides thread through ALS, all sibling events of one HTTP request share the same UUID requestId
- D-105 live: cursor-paginated GET /api/audit/events with base64-encoded {createdAt, id} payload + deterministic OR-pair WHERE clause for same-millisecond tiebreak; take: limit+1 detects hasMore without a COUNT query
- D-103 live: three-combobox URL-as-state filter bar on /admin/audit (Användare / Entitetstyp / Åtgärd); 60s module-scope memo on BE + TanStack staleTime 60_000 on FE for T-05-10 DoS mitigation
- D-95 live: diff computed at READ time inside AuditDiffPanel — full before/after stored at write time, FE intersects keys with JSON.stringify equality and renders only changes; survives Phase 6+ schema additions
- D-104 live: requestId-group chip on the diff panel surfaces the 1+N sibling cohort via /admin/audit?requestId= deep-link; Kopiera permalink button writes a filter-coordinate-only URL (no before/after payload — T-05-09 disposition: accept)
- D-16 EXCEPTION documented in audit.service.ts header: admin reads cross-tenant; no careUnitId-first arg; carve-out justified verbatim against AUD-02
- EmptyStateCard widened with optional body? prop (defaults to Phase 1 stub copy) — Phase 5 AuditPage passes "Händelser visas här när någon ändrar något i systemet." for the "no events ever" empty state
- First useInfiniteQuery in repo: useAuditEventsQuery establishes the cursor-pagination pattern for any future paginated list
- D-99 live: root .eslintrc.cjs with `no-restricted-syntax` MemberExpression selector banning `prisma.auditEvent.update/updateMany/delete/deleteMany/upsert`; pnpm lint workspace script asserts exit 0 on the codebase and exit 1 on a scratch-file containing the banned pattern
- D-98 closed at both layers AND asserted by tests in the same suite (`apps/api/test/audit.integration.test.ts`): test #3 git-greps for the banned pattern (architectural absence), test #4 issues raw-SQL UPDATE against a real audit row id (Postgres BEFORE-trigger rejects with `permission denied`)
- T-05-03 closed in lockstep by AUDIT_ALLOWLIST (drops Session.id from after JSON) + resolveEntityId (returns row.userId, NOT row.id, for entityId column); test #7 asserts both for auth.login AND auth.logout
- Five composite test helpers (loginAs, captureSessionCookie, createEmptyOrder, findTestCareUnitMedication, progressOrderToBekraftad) promoted to apps/api/test/helpers/buildTestApp.ts; six existing test files migrated; loginAs canonicalized to `(app, user)` signature; no duplicate helper bodies remain outside the helpers directory
- Phase 5 complete: AUD-01 + AUD-02 + AUD-03 all mechanically asserted by tests AND documented in README.md `## Audit log` with §6 interview prep (five labelled phrasings: concurrency, scale-to-50, retrofitting auth, what I'm proud of, what I'm least proud of)
- D-91 implementation via activeTx ALS slot + patchTransactionForAudit (runtime Object.defineProperty patch): Prisma.getExtensionContext is a no-op identity function; query extension handlers are not called with this bound to the client; $transaction interceptor pushes tx into store.activeTx before user callback runs; handlers resolve activeClient = store.activeTx ?? client
- patchTransactionForAudit runtime patch preserves original TypeScript overload signatures for $transaction callers (order.service.ts, medication.service.ts) — D-83 preserved, no Phase 4 files edited
- Migration 0009 purges ALL pre-migration orphan audit rows inside a single tx with DISABLE/ENABLE TRIGGER and a DO-block safety gate; Postgres MVCC ensures trigger-disabled state is invisible to concurrent sessions until commit
- CR-02 closed: decodeCursor() details.reason fixed from 'invalid_quantity' to 'invalid_cursor'; ValidationFailedError union extended to include 'invalid_cursor'
- CR-04 closed: DELETE /api/auth/session now uses lookup-before-destroy (findSessionById before logout()); setActor() called with session.userId/careUnitId so auth.logout audit rows carry correct actorUserId
- WR-07 closed: AUDIT_ENTITY_TYPES extended with 'auth_attempt' (Swedish: 'inloggningsförsök'); unknown-email failed-login writes entityType='auth_attempt', entityId=attemptedEmail for forensic brute-force filtering
- D-120 live (Phase 6 Plan 01): GET /api/dashboard/low-stock owns its own cache key ['dashboard', 'low-stock'] — decouples dashboard refresh from /lakemedel's ['medications', filters]; service returns {rows, total} only (no pagination, no belowThresholdTotal). Wire shape narrower than medicationListResponse on purpose.
- D-119 live (Phase 6 Plan 01): three-layer refresh — TanStack mutation invalidation at 5 sites (useDeliverOrder + useCreateMedication + useUpdateMedication + useUpdateThresholdOptimistic + useDeleteMedication) + refetchOnWindowFocus:true + refetchInterval:30_000 on useLowStockQuery. Each NTF-02 hook is a one-line addition paired with the existing ['medications'] invalidate.
- D-117 live (Phase 6 Plan 01): dashboard.service.listLowStockForUnit sorts server-side by (currentStock/lowStockThreshold) ASC then name ASC; FE renders rows in received order. \$queryRaw uses ::float cast so the division is real, not integer truncation.
- D-118 live (Phase 6 Plan 01): DashboardPage.tsx body replaced with single-line `<DashboardLowStockCard />`; no AppShell/nav/h1 changes — CardTitle "Läkemedel under tröskel" serves as the page heading.
- Plan-01-ships-before-Plan-02-lands contract (Phase 6 Plan 01): dashboard contract declares therapeuticClass: z.string().nullable() with a Plan-02 TODO; dashboard.service.ts SELECTs NULL::text AS "therapeuticClass". Both swap to therapeuticClassEnum + m."therapeuticClass" in lockstep with Plan 02's migration. Avoids cross-plan ordering coupling without weakening the wire contract.
- LOW_STOCK_QUERY_OPTIONS exported as a named const from useLowStockQuery.ts so the component test can assert the D-119 refresh-policy contract WITHOUT mounting a QueryClient — a refactor that drops either flag must also remove the named export, which the test catches.
- Phase 6 Plan 02 live: TherapeuticClass closed enum (14 values A B C D G H J L M N P R S V) + Medication.therapeuticClass nullable column landed via migration 0012 (20260523124435_0012_medication_therapeutic_class); trgm GIN index Medication_name_trgm_idx survived the hand-edit of the generated diff (Blocker 2 mitigation — `DROP INDEX "Medication_name_trgm_idx"` stripped before apply).
- D-115 / D-32 carve-out live (Phase 6 Plan 02): therapeuticClass IS editable on NPL-source meds because classification is metadata, not pharmaceutical identity. The four NPL-locked identity fields (name/atcCode/form/strength) remain server-side stripped; the new column is written UNCONDITIONALLY in updateCareUnitMedication's medData branch. Regression test in apps/api/test/medications.therapeuticClass.integration.test.ts Test 3.
- D-95 + D-97 + AUDIT_ALLOWLIST extension live (Phase 6 Plan 02): the Phase 5 audit pipeline surfaces therapeuticClass changes automatically on PATCH /api/medications/:id — zero new audit code. Single-file extension to AUDIT_ALLOWLIST.Medication; the existing $extends middleware does the rest. Test 4 asserts `after.therapeuticClass === 'J'` on the resulting `medication.update` event.
- D-116 live (Phase 6 Plan 02): Terapeutisk klass combobox positioned LEFTMOST in LakemedelFilter (search → Terapeutisk klass → ATC → Form → Visa endast under tröskel); URL-as-state via short param name ?class=N (single-letter value matches the Postgres enum verbatim); shared TherapeuticClassCombobox extracted as ONE file for Plan 02 (LakemedelFilter URL-state consumer) + Plan 03 (MedicationSheet react-hook-form consumer) — Warning-7 anti-duplication.
- Plan 02 — Slice A's dashboard contract upgraded cleanly: `z.string().nullable()` (Plan 01 forward-compatible placeholder) → `therapeuticClassEnum.nullable()` (closed 14-value union). Wire shape unchanged; type narrowed. Plan 01's DashboardLowStockCard.test.tsx (5/5) and dashboard.integration.test.ts Tests 2+3 still pass after the swap — no regression.

Last activity: 2026-05-24

---
*Last updated: 2026-05-23 after 06-03 demo-path verified by user — Phase 6 complete*
