# Requirements: MediTrack

**Defined:** 2026-05-19
**Core Value:** A nurse can place an order for a low-stock medication and, when delivered, the stock balance and audit trail update atomically — reliably, with no manual reconciliation.

## v1 Requirements

Requirements for the Medovia interview submission. Each maps to exactly one roadmap phase.

### Authentication & Authorization

- [ ] **AUTH-01**: User can log in with email and password; failed attempts return a friendly error
- [ ] **AUTH-02**: User session persists across browser refresh and normal page navigation
- [ ] **AUTH-03**: User can log out from any page
- [ ] **AUTH-04**: Every user has exactly one role — `apotekare`, `sjuksköterska`, or `admin` — stored as a DB enum
- [ ] **AUTH-05**: Backend rejects unauthorized mutations with HTTP 403 + a JSON error body (role check on every write endpoint)
- [ ] **AUTH-06**: Frontend hides or disables actions the current user's role cannot perform (defense-in-depth, not the security boundary)
- [ ] **AUTH-07**: User is bound to exactly one `vårdenhet`; reads and writes are scoped to that unit's data

### Medication Catalog

- [ ] **CAT-01**: Authenticated user can view a paginated list of medications for their `vårdenhet`, showing name, ATC code, form, strength, current stock, and low-stock indicator
- [ ] **CAT-02**: User can search the list by name (case-insensitive, partial match)
- [ ] **CAT-03**: User can filter the list by ATC code prefix
- [ ] **CAT-04**: User can filter the list by form (`tablett`, `injektionslösning`, etc. — enum)
- [ ] **CAT-05**: User with role `apotekare` or `admin` can add a new medication (name, ATC, form, strength, low-stock threshold)
- [ ] **CAT-06**: User with role `apotekare` or `admin` can edit an existing medication's fields
- [ ] **CAT-07**: User with role `apotekare` or `admin` can delete a medication; soft-delete if it has historical order lines or stock movements
- [ ] **CAT-09**: ATC-code input on the Add-medication form is a combobox preloaded with unique ATC codes from the global catalog, with typeahead filtering and free-text fallback; shared component reused by the LakemedelFilter ATC selector *(Phase 8)*
- [ ] **CAT-10**: Add-medication picker differentiates empty states — "Alla träffar finns redan i din vårdenhet" (D-45 exclusion) vs "Inget i NPL matchade `{q}`" (no global catalog match) *(Phase 8)*

### Order Flow

- [x] **ORD-01**: User can create a draft order containing one or more medications with desired quantities
- [x] **ORD-02**: User can edit a draft order (add/remove lines, change quantities) before sending
- [x] **ORD-03**: User can submit a draft order, transitioning it `Utkast → Skickad`; lines become immutable
- [ ] **ORD-04**: User with role `apotekare` or `admin` can confirm a submitted order, transitioning `Skickad → Bekräftad`
- [ ] **ORD-05**: User with role `apotekare` or `admin` can mark a confirmed order as delivered, transitioning `Bekräftad → Levererad`
- [ ] **ORD-06**: Backend rejects any status transition that does not follow the linear flow (e.g. `Utkast → Bekräftad` is blocked) with HTTP 409 + JSON error
- [ ] **ORD-07**: User can view the order history for their `vårdenhet`, with status, line items, timestamps, and the user who made each transition
- [ ] **ORD-08**: Compose-order "Lägg till läkemedel" picker surfaces 10 medication suggestions before any search input — combining most-ordered (by line count for the user's vårdenhet) and low-stock items, deduplicated *(Phase 8)*
- [ ] **ORD-09**: Dashboard shows a role-scoped "Beställningar" card surfacing orders that need the user's attention — nurses see own Utkast + recent history; apotekare/admin see Skickad-to-confirm + Bekräftad-to-deliver *(Phase 9)*
- [ ] **ORD-10**: Order detail "Tillbaka till beställningar" returns the user to the previously-active status tab, not the default Utkast tab *(Phase 9)*
- [x] **ORD-11**: Every order has a generated, human-readable order number persisted in the database and displayed in every table that lists orders *(Phase 10)*

### Stock Logic

- [ ] **STK-01**: When an order transitions to `Levererad`, each order line's quantity is added to the medication's stock balance atomically, inside a single DB transaction
- [ ] **STK-02**: The delivery transaction acquires a row-level lock (`SELECT … FOR UPDATE`) on each affected medication so two concurrent deliveries cannot race
- [ ] **STK-03**: Each medication has a `low_stock_threshold` field, configurable per `vårdenhet`, with a sensible default at create time
- [ ] **STK-04**: The medication list and detail views display a visible low-stock indicator on any medication whose current stock < threshold

### AI: Auto-Categorization

- [ ] **AI-01**: On medication create or edit, the system suggests a therapeutic class based on name and ATC code via a single LLM call returning structured output (class + confidence)
- [ ] **AI-02**: User can accept the suggestion or override it with a free-text class; the chosen class persists with the medication
- [x] **AI-03**: User can filter the medication list by therapeutic class

### Audit Log

- [x] **AUD-01**: Every mutation (medication create/update/delete, order status transition, user-initiated action) writes a row to `audit_events` recording actor user_id, entity type + id, action, before/after diff, and ISO-8601 timestamp *(Phase 5 Plan 01: Prisma $extends middleware + ALS request context + same-tx audit write; AUDIT_ALLOWLIST + resolveEntityId close T-05-03; trigger-based DB enforcement raises permission denied)*
- [x] **AUD-02**: User with role `admin` can view the audit log in reverse-chronological order, filterable by user, entity type, and action *(Phase 5 Plan 02: GET /api/audit/events cursor-paginated admin-only endpoint + /admin/audit page with three combobox URL-as-state filters + responsive table/card + Fält/Före/Efter diff panel + requestId-group chip + Kopiera permalink; first useInfiniteQuery in repo)*
- [x] **AUD-03**: The audit table is append-only — no UPDATE or DELETE code paths exist; enforced architecturally (no API surface) and documented in the README

### Notifications

- [x] **NTF-01**: Dashboard shows a persistent low-stock banner enumerating every medication for the user's `vårdenhet` whose current stock < threshold
- [x] **NTF-02**: The banner refetches after any stock-changing mutation (delivery) and reflects the new state

### User Experience

- [ ] **UX-01**: Every page renders usably and meets layout expectations across the breakpoint ladder — mobile (360 px), tablet/iPad (768 px), laptop (1024 px), and large desktop (1440 px+). Built mobile-first (base styles target the smallest breakpoint, Tailwind `sm/md/lg/xl` breakpoints layer on enhancements). No horizontal scroll at any breakpoint; primary actions reachable without zoom.
- [x] **UX-02**: "Logga ut" is reachable from the global top navigation at every breakpoint — not gated behind the desktop UserPillPopover or a page navigation to Konto *(Phase 11)*
- [x] **UX-03**: Konto page guidance for sjukskoterska/apotekare reads "Ändringar kan endast göras av administratör" (replacing "Denna åtgärd kräver adminrättigheter.") *(Phase 11)*

### Ops / Deliverables

- [ ] **OPS-01**: `docker compose up` starts `postgres`, `api`, and `web` services with seed data (users for each role, one `vårdenhet`, sample medications, at least one in-flight order)
- [ ] **OPS-02**: `README.md` includes — project purpose, stack rationale per the brief's "motivera dina val", run instructions, known gaps, "with more time" section, brief notes on the §6 questions (concurrency / scaling / auth retrofitting)
- [ ] **OPS-03**: At least one integration test covers the full order delivery flow: create draft → submit → confirm → deliver, asserting stock balance increment and `audit_events` row creation
- [ ] **OPS-04**: Git history follows conventional-commits style; every commit atomic, well-messaged, and tells a story the reviewer can follow

## v2 Requirements

Acknowledged and intentionally deferred. Not in the v1 roadmap.

### Export

- **EXP-01**: User can export order history for their `vårdenhet` to CSV
- **EXP-02**: User can export order history for their `vårdenhet` to PDF

### Notifications (richer)

- **NTF-03**: User receives an email notification when a medication crosses below threshold
- **NTF-04**: Per-user notification preferences (channel, threshold sensitivity)

### Admin

- **AUTH-08**: Admin UI for provisioning users (create, set role, set `vårdenhet`, reset password)
- **AUTH-09**: User can change their own password

### AI (advanced)

- **AI-04**: Predictive restock — suggest reorder quantity and date based on historical consumption
- **AI-05**: Chatbot interface for stock and order queries

### Multi-tenancy UX

- **MULTI-01**: User with multiple `vårdenhet` memberships can switch active context in the UI

## Out of Scope

Explicitly excluded for v1. Reasoning captured so future contributors don't re-add them without re-examining the trade-off.

| Feature | Reason |
|---------|--------|
| OAuth / SSO | Internal tool; email/password sufficient for the demo and the brief; OAuth adds infra without changing the demo story. |
| Mobile app / PWA install | "Responsivt UI" requirement is met by responsive web; native is out of brief scope. |
| Real-time push updates (WebSockets) | TanStack Query refetch-on-mutation gives nurses fresh data without standing up a pubsub layer. |
| Multi-stockroom per `vårdenhet` | One stock balance per medication per unit; sub-locations are not in the brief. |
| Patient-level prescription tracking | Brief is about unit stock and ordering, not patient orders. |
| AI predictive restock and chatbot (in v1) | Categorization is cheaper, more testable, and demos cleanly within one week. |
| Email delivery infrastructure | Email provider, queue, templating — too much surface for low marginal interview signal vs in-app banner. |
| Patient-facing pages | Internal tool only. |

## Traceability

Updated during roadmap creation. Each v1 requirement maps to exactly one phase.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Pending |
| AUTH-07 | Phase 1 | Pending |
| UX-01 | Phase 1 | Pending |
| CAT-01 | Phase 2 | Pending |
| CAT-02 | Phase 2 | Pending |
| CAT-03 | Phase 2 | Pending |
| CAT-04 | Phase 2 | Pending |
| CAT-05 | Phase 2 | Pending |
| CAT-06 | Phase 2 | Pending |
| CAT-07 | Phase 2 | Pending |
| STK-03 | Phase 2 | Pending |
| STK-04 | Phase 2 | Pending |
| ORD-01 | Phase 3 | Complete |
| ORD-02 | Phase 3 | Complete |
| ORD-03 | Phase 3 | Complete |
| ORD-04 | Phase 4 | Pending |
| ORD-05 | Phase 4 | Pending |
| ORD-06 | Phase 4 | Pending |
| ORD-07 | Phase 4 | Pending |
| STK-01 | Phase 4 | Pending |
| STK-02 | Phase 4 | Pending |
| OPS-03 | Phase 4 | Pending |
| AUD-01 | Phase 5 | Complete (Plan 01) |
| AUD-02 | Phase 5 | Validated |
| AUD-03 | Phase 5 | Complete |
| AI-01 | Phase 6 | Pending |
| AI-02 | Phase 6 | Pending |
| AI-03 | Phase 6 | Complete |
| NTF-01 | Phase 6 | Complete |
| NTF-02 | Phase 6 | Complete |
| OPS-01 | Phase 7 | Pending |
| OPS-02 | Phase 7 | Pending |
| OPS-04 | Phase 7 | Pending |
| CAT-09 | Phase 8 | Pending |
| CAT-10 | Phase 8 | Pending |
| ORD-08 | Phase 8 | Pending |
| ORD-09 | Phase 9 | Pending |
| ORD-10 | Phase 9 | Pending |
| ORD-11 | Phase 10 | Complete |
| UX-02 | Phase 11 | Complete |
| UX-03 | Phase 11 | Complete |

**Coverage:**
- v1 requirements: 46 total
- Mapped to phases: 46
- Unmapped: 0 ✓

---
*Requirements defined: 2026-05-19*
*Last updated: 2026-05-24 — v1 scope expanded with phases 8–11; CAT-08 (always-visible "Skapa nytt" CTA) dropped at Phase 8 discussion time after user reverted to D-58 pick-only stance*
