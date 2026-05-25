---
phase: 11-quick-polish
reviewed: 2026-05-26T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - apps/web/src/routes/shell/TopBar.tsx
  - apps/web/src/routes/shell/UserPill.tsx
  - apps/web/src/routes/konto/KontoPage.tsx
  - apps/web/test/TopBar.test.tsx
  - apps/web/test/KontoPage.test.tsx
findings:
  critical: 0
  warning: 1
  info: 4
  total: 5
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-05-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 11 is a small, surgical FE polish (UX-02 + UX-03). The implementation matches the plan: TopBar gains two per-breakpoint logout buttons sharing the same `useLogout()` hook, UserPill is collapsed to a static `<div>`, and the Konto gate note is swapped verbatim to "Ändringar kan endast göras av administratör." Tests cover the new behavior.

No security, correctness, or data-loss issues found. One Warning about a doc-comment that misrepresents observable behavior of the admin ping (could mislead future maintainers debugging the endpoint), and four Info items around stale comments and test specificity. Nothing here blocks ship.

## Warnings

### WR-01: KontoPage doc-comment says admin ping POSTs, but call site is GET

**File:** `apps/web/src/routes/konto/KontoPage.tsx:21-22`
**Issue:** The header comment claims the admin button "POSTs to /api/admin/ping", but the actual call at line 53 is `fetchJson<AdminPingResponse>('/api/admin/ping')` with no `init` argument — `fetchJson` defaults to `fetch`'s default method, GET. This is a behavioral lie in the documentation: a future maintainer chasing a backend route mismatch, reviewing CSRF posture, or wiring telemetry will trust the comment and look at the wrong HTTP verb. It also leaks into mental models for "Pattern E" in `apps/web/src/lib/api.ts`, which is the documented single point of contact.

The comment should either be corrected to reflect the GET, or the call should be made explicit with `{ method: 'POST' }` if the intent was actually POST (the endpoint name "ping" is ambiguous either way; check the BE handler for ground truth before fixing).
**Fix:**
```typescript
// Either correct the comment:
//   admin -> `<Can action="admin:ping">` reveals an "Admin ping"
//            Button that GETs /api/admin/ping (Phase 1 success #2);
//            response shown inline.
// OR make the verb explicit in the call:
const res = await fetchJson<AdminPingResponse>('/api/admin/ping', {
  method: 'POST',
});
```

## Info

### IN-01: KontoPage doc-comment still references the removed desktop popover

**File:** `apps/web/src/routes/konto/KontoPage.tsx:14-16`
**Issue:** The comment reads "mobile users land here from the bottom tab bar and use it as their logout entry point (desktop has the user-pill popover)." Phase 11 explicitly removed the desktop user-pill popover (D-171) and put logout directly on the TopBar at every breakpoint (D-170/D-174). This sentence is now stale and contradicts the post-Phase-11 architecture documented in `TopBar.tsx` and `UserPill.tsx`. Confusing for any reader trying to reason about where logout lives.
**Fix:** Replace the parenthetical with the new truth, e.g. "(desktop has the same logout button in the TopBar — D-170/D-174)" or drop the parenthetical entirely since the Konto-page logout button is now redundant on desktop and only strictly needed for the Phase-11 mobile flow.

### IN-02: TopBar.test.tsx "UserPill is not a button" assertion is too weak

**File:** `apps/web/test/TopBar.test.tsx:109-117`
**Issue:** The test asserts `screen.queryByRole('button', { name: 'sjukskoterska user' })` is null. This passes today, but it would also pass if UserPill rendered the name inside a button with a different accessible name (e.g., aria-label="Open user menu"), which is exactly the regression the test is meant to prevent (D-171 forbids re-introducing the popover trigger). The accessible-name string is incidental; the structural invariant is "the identity strip is not interactive."
**Fix:** Strengthen the assertion by checking the rendered element itself, e.g.:
```tsx
const nameEl = screen.getByText('sjukskoterska user');
expect(nameEl.closest('button')).toBeNull();
expect(nameEl.closest('[role="button"]')).toBeNull();
```

### IN-03: Tests import the source-under-test before declaring its mocks

**File:** `apps/web/test/TopBar.test.tsx:5,34` and `apps/web/test/KontoPage.test.tsx:5,47`
**Issue:** Both test files do `import { TopBar } from '@/routes/shell/TopBar'` (or `KontoPage`) at the top of the file, BEFORE the `vi.mock(...)` calls and BEFORE the post-mock `import { useAuth } from '@/auth/useAuth'`. Vitest hoists `vi.mock` calls so this works in practice, but it relies on hoisting magic that is easy to break: a refactor that moves a mock into a `beforeAll` or wraps it in a helper will silently invalidate every test. The convention used elsewhere in the suite (e.g., `KontoPage.test.tsx` itself imports `useAuth` AFTER its mock at line 47) should be applied consistently — move the `import { TopBar }` line below all `vi.mock` calls for clarity.
**Fix:** Reorder imports so all `vi.mock(...)` calls precede any `import` of the module under test, e.g.:
```typescript
// 1. test framework imports
// 2. vi.mock() calls
// 3. imports of modules under test + mocked modules
```

### IN-04: KontoPage destructive logout is now duplicated for desktop users

**File:** `apps/web/src/routes/konto/KontoPage.tsx:79-87`
**Issue:** Per D-172 the Konto destructive "Logga ut" button is intentionally retained, but Phase 11 also added a desktop TopBar logout (D-174). A desktop user visiting `/konto` now sees two functionally identical "Logga ut" controls on the same screen — one in the header, one full-width destructive in the page body. This is by design per the plan, but it's worth tracking as a UX follow-up: the Konto logout could either be hidden on desktop (`md:hidden` on its wrapper) or kept and documented as an intentional second affordance for mobile-parity. Not a Phase 11 bug; flag for the v2 polish list referenced in the plan's `<verification>` section 6.
**Fix:** No code change in scope for Phase 11. Add to `deferred-items.md` (or equivalent) as: "Konto destructive logout is duplicate of TopBar logout on desktop — consider `md:hidden` wrapper or removal post-v1."

---

_Reviewed: 2026-05-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
