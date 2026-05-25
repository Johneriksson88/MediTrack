# Phase 11: Quick Polish - Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 5 (3 modified, 1 modified+renamed, 1 created)
**Analogs found:** 5 / 5 (every file has an exact or strong analog in-repo)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/web/src/routes/shell/TopBar.tsx` (modify) | component (shell/layout) | event-driven (logout click → mutation) | `apps/web/src/routes/shell/UserPillPopover.tsx` + `apps/web/src/routes/shell/BottomTabBar.tsx` | exact (composes already-present patterns) |
| `apps/web/src/routes/shell/UserPill.tsx` (rename from `UserPillPopover.tsx` + simplify) | component (presentational identity display) | request-response (reads `useAuth`) | `apps/web/src/routes/shell/UserPillPopover.tsx` (lines 24-50 — the trigger-button content; strip Popover wrapper) | exact (same file, simplified) |
| `apps/web/src/routes/konto/KontoPage.tsx` (modify, line 115) | component (route page) | n/a (string-literal swap only) | `apps/web/src/routes/konto/KontoPage.tsx` itself (line 113-117 block — only the literal changes) | self (in-place) |
| `apps/web/test/KontoPage.test.tsx` (modify — line 17 + 2 assertions) | test (component) | n/a (literal swap only) | `apps/web/test/KontoPage.test.tsx` itself (lines 17, 82-87, 110-115, 139-143) | self (in-place) |
| `apps/web/test/TopBar.test.tsx` (CREATE) | test (component) | event-driven (mock `useLogout`, assert mutate fires) | `apps/web/test/KontoPage.test.tsx` (mock shape + role-branched describe) + `apps/web/test/BottomTabBar.test.tsx` (provider/render pattern) | strong (combines both) |

## Pattern Assignments

### `apps/web/src/routes/shell/TopBar.tsx` (modify — component, event-driven)

**Analog (composes 3 sources):**
- `apps/web/src/routes/shell/UserPillPopover.tsx` (current destructive-button + `useLogout` wiring at lines 56-63)
- `apps/web/src/routes/shell/BottomTabBar.tsx` (`md:hidden` responsive class at line 28; 44 px touch target at line 37)
- `apps/web/src/routes/shell/TopBar.tsx` itself (existing header skeleton + Link focus-ring at lines 22-30)

**Imports pattern** (build from current `TopBar.tsx:1-4` + add `LogOut` + `useLogout`):
```typescript
import { LogOut, Stethoscope } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useLogout } from '@/features/auth/useLogout';
import { UserPill } from './UserPill'; // renamed from UserPillPopover per D-175
```
*Source for `useLogout` import alias:* `apps/web/src/routes/shell/UserPillPopover.tsx:8` (`import { useLogout } from '@/features/auth/useLogout';`).
*Source for `lucide-react` multi-icon import:* `apps/web/src/routes/shell/TopBar.tsx:1` already uses `{ Stethoscope }` from `lucide-react` — extend the existing line.

**Header skeleton (preserve verbatim — TopBar.tsx:21-30):**
```typescript
<header className="h-14 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between px-4 md:px-6">
  <Link
    to="/dashboard"
    className="flex items-center gap-2 text-sm font-semibold text-[#0F172A] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2"
  >
    <Stethoscope className="h-5 w-5 text-[#2563EB]" aria-hidden="true" />
    <span>MediTrack</span>
  </Link>
```

**Logout-click + isPending pattern (copy from `UserPillPopover.tsx:56-63`):**
```typescript
// PATTERN (current location: UserPillPopover.tsx:56-63):
<button
  type="button"
  onClick={() => logout.mutate()}
  disabled={logout.isPending}
  className="w-full text-left text-sm text-[#DC2626] font-semibold px-2 py-1 rounded hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
>
  {logout.isPending ? 'Loggar ut…' : 'Logga ut'}
</button>
```
Reuse verbatim:
- `type="button"` + `onClick={() => logout.mutate()}` + `disabled={logout.isPending}` (D-174 contract — single click, no confirmation)
- Color token `text-[#DC2626]` (UI-SPEC §Colors §97)
- Focus ring `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2` (UI-SPEC §149)
- Disabled hover `disabled:opacity-50 disabled:cursor-not-allowed`
- Pending label ternary `{logout.isPending ? 'Loggar ut…' : 'Logga ut'}`

**Desktop variant (D-174 — icon+label):**
```typescript
{/* Desktop right cluster: identity + logout — hidden < md */}
<div className="hidden md:flex md:items-center md:gap-3">
  <UserPill />
  <button
    type="button"
    onClick={() => logout.mutate()}
    disabled={logout.isPending}
    className="inline-flex items-center gap-2 text-sm font-semibold text-[#DC2626] px-3 py-2 min-h-[44px] rounded hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    <LogOut className="h-4 w-4" aria-hidden="true" />
    {logout.isPending ? 'Loggar ut…' : 'Logga ut'}
  </button>
</div>
```
- `hidden md:flex` pattern source: existing `TopBar.tsx:32` uses `hidden md:block` — D-170 widens to `md:flex md:items-center md:gap-3` for a two-element cluster.
- `min-h-[44px]` floor source: `BottomTabBar.tsx:37` (`min-h-[44px]`) — UX-01 contract.
- No `aria-label` (label is inline; aria-label would be redundant per D-174).

**Mobile variant (D-174 — icon-only, 44×44):**
```typescript
{/* Mobile right cluster: icon-only logout — visible only at < md */}
<button
  type="button"
  onClick={() => logout.mutate()}
  disabled={logout.isPending}
  aria-label="Logga ut"
  className="md:hidden inline-flex items-center justify-center h-11 w-11 text-[#DC2626] rounded hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
>
  <LogOut className="h-5 w-5" aria-hidden="true" />
</button>
```
- `md:hidden` source: `BottomTabBar.tsx:28` (`md:hidden fixed bottom-0 ...`).
- `h-11 w-11` = 44 px tap target (UX-01 floor, UI-SPEC §3).
- `aria-label="Logga ut"` is mandatory here (icon-only) per D-174.
- Icon sizing `h-5 w-5` (= 20 px) matches the visual weight of `Stethoscope className="h-5 w-5"` on TopBar.tsx:28 — same baseline as the logo icon for visual balance.

**Error handling:** None added. `useLogout()` is a TanStack mutation; failures are non-throwing (idempotent DELETE per `useLogout.ts:9-13`). The pending-state UI is the only feedback surface. Do not wrap in try/catch.

---

### `apps/web/src/routes/shell/UserPill.tsx` (rename from `UserPillPopover.tsx` + simplify — component, request-response)

**Analog:** the file's own current trigger-button content (`UserPillPopover.tsx:24-50`). Strip the Popover wrapper (lines 32-34 open, 51-66 close), keep the identity composition, change `<button>` → `<div>`.

**Imports pattern (post-simplification):**
```typescript
// REMOVE: Popover/PopoverContent/PopoverTrigger import (lines 3-7)
// REMOVE: useLogout import (line 8 — no longer fires logout from this file)
// KEEP:
import { useAuth } from '@/auth/useAuth';
import { RoleBadge } from '@/components/RoleBadge';
```

**Identity composition pattern (extract verbatim from `UserPillPopover.tsx:25-50`, then collapse `<button>` → `<div>`):**
```typescript
// SOURCE (UserPillPopover.tsx:24-50):
export function UserPillPopover() {
  const { user } = useAuth();
  const logout = useLogout();              // REMOVE
  if (!user) { return null; }              // KEEP — defense in depth (UserPillPopover.tsx:28-30)

  return (
    <Popover>                              // REMOVE
      <PopoverTrigger asChild>             // REMOVE
        <button
          type="button"
          className="flex items-center rounded px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 cursor-pointer hover:bg-[#E2E8F0]/60"
        >
          {/* KEEP THE 5 SPANS — lines 39-49 — VERBATIM */}
          <span className="text-sm font-semibold text-[#0F172A]">{user.name}</span>
          <span className="text-[#64748B] mx-2" aria-hidden="true">·</span>
          <RoleBadge role={user.role} />
          <span className="text-[#64748B] mx-2" aria-hidden="true">·</span>
          <span className="text-sm text-[#64748B]">{user.careUnit.name}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent ...>                 // REMOVE entire PopoverContent block (52-64)
      </PopoverContent>
    </Popover>
  );
}
```

**Post-simplification output (target shape — derived from the CONTEXT specifics):**
```typescript
import { useAuth } from '@/auth/useAuth';
import { RoleBadge } from '@/components/RoleBadge';

export function UserPill() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div className="flex items-center">
      <span className="text-sm font-semibold text-[#0F172A]">{user.name}</span>
      <span className="text-[#64748B] mx-2" aria-hidden="true">·</span>
      <RoleBadge role={user.role} />
      <span className="text-[#64748B] mx-2" aria-hidden="true">·</span>
      <span className="text-sm text-[#64748B]">{user.careUnit.name}</span>
    </div>
  );
}
```

**Notes:**
- `<button>` → `<div>` (D-171 — non-interactive). No `type`, no `onClick`, no focus styles, no `cursor-pointer`, no `hover:bg-*`. The pill is identity display only.
- `flex items-center` retained (positioning of the 5 spans).
- `rounded px-2 py-1` dropped — no longer a clickable surface, no padding needed.
- The `if (!user) return null` defense (`UserPillPopover.tsx:28-30`) **must be preserved** — same AuthGate contract.
- File rename per D-175: `git mv apps/web/src/routes/shell/UserPillPopover.tsx apps/web/src/routes/shell/UserPill.tsx`; update import at `TopBar.tsx:5` (`./UserPillPopover` → `./UserPill`) and the named export `UserPillPopover` → `UserPill`.

---

### `apps/web/src/routes/konto/KontoPage.tsx` (modify, line 115 — string-literal swap)

**Analog:** the file itself, line 113-117 block. Verbatim swap, no structural change.

**Exact diff (D-173):**
```diff
  {user.role !== 'admin' && (
    <p className="text-xs text-[#64748B]">
-     Denna åtgärd kräver adminrättigheter.
+     Ändringar kan endast göras av administratör.
    </p>
  )}
```
- Trailing period preserved (per canonical quote ROADMAP §"Phase 11" SC#2).
- Wrapping `<p className="text-xs text-[#64748B]">` unchanged.
- Conditional `{user.role !== 'admin' && ...}` unchanged.
- Nothing else in the file edited.
- Verify line 79-87 (destructive `<Button variant="destructive">`) is unchanged per D-172.

---

### `apps/web/test/KontoPage.test.tsx` (modify — 3 sites: line 17 doc-comment + 2 role-branch assertions)

**Analog:** the file itself. Identical structural pattern; 3 verbatim string swaps in lockstep with `KontoPage.tsx:115`.

**Diff #1 — doc-comment at line 17:**
```diff
 * Swedish verbatim strings from UI-SPEC §Copy:
- *   - Gate note: "Denna åtgärd kräver adminrättigheter."
+ *   - Gate note: "Ändringar kan endast göras av administratör."
 *   - Logout: "Logga ut"
 *   - Admin button: "Admin ping"
```

**Diff #2 — sjukskoterska branch assertion (current lines 110-115):**
```diff
 it('renders the verbatim gate note "Ändringar kan endast göras av administratör."', () => {
   renderWithProviders(<KontoPage />);
   // Verbatim string from UI-SPEC §Copy — must match exactly.
   expect(
-    screen.getByText('Denna åtgärd kräver adminrättigheter.'),
+    screen.getByText('Ändringar kan endast göras av administratör.'),
   ).toBeInTheDocument();
 });
```
Also update the `it(...)` description literal at the start of that block (line 110) so the test name matches the asserted string.

**Diff #3 — apotekare branch assertion (current lines 139-143):**
```diff
 it('renders the verbatim gate note for apotekare too', () => {
   renderWithProviders(<KontoPage />);
   expect(
-    screen.getByText('Denna åtgärd kräver adminrättigheter.'),
+    screen.getByText('Ändringar kan endast göras av administratör.'),
   ).toBeInTheDocument();
 });
```

**Diff #4 — admin branch negative assertion (current line 82-87):**
```diff
 it('does NOT render the gate note "Ändringar kan endast göras av administratör."', () => {
   renderWithProviders(<KontoPage />);
   expect(
-    screen.queryByText('Denna åtgärd kräver adminrättigheter.'),
+    screen.queryByText('Ändringar kan endast göras av administratör.'),
   ).not.toBeInTheDocument();
 });
```
Plus the `it(...)` description literal at line 82 (mirror the new string). *(Note: CONTEXT mentions "two role-branch assertions"; the admin negative-assertion is a third site that quotes the same string. Update it too — the lockstep rule applies to every occurrence of the literal in the file.)*

**No structural changes:** no new `describe`, no new `it`, no mock changes, no provider changes. The 4 string sites are the entire diff surface.

---

### `apps/web/test/TopBar.test.tsx` (CREATE — test, event-driven)

**Analog (composes 2 sources):**
- `apps/web/test/KontoPage.test.tsx` (mock shapes for `useAuth` + `useLogout`; role-branched `describe`; doc-comment header)
- `apps/web/test/BottomTabBar.test.tsx` (mock-only-`useAuth` shape, `renderWithProviders` invocation, `getAllByRole` count pattern)

**Imports pattern** (copy from `KontoPage.test.tsx:1-5`):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import type { MeResponse } from '@meditrack/shared';
import { renderWithProviders } from './helpers/renderWithProviders';
import { TopBar } from '@/routes/shell/TopBar';
```

**Mock pattern for `useLogout`** (copy verbatim from `KontoPage.test.tsx:29-34`):
```typescript
// Mock useLogout — we want to capture the mutate() call.
const mockMutate = vi.fn();
vi.mock('@/features/auth/useLogout', () => ({
  useLogout: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
}));
```
*Variation from KontoPage:* lift `mockMutate` out of the mock so assertions can call `expect(mockMutate).toHaveBeenCalled()`. KontoPage.test.tsx uses an inline `vi.fn()` because it doesn't need to assert calls — TopBar.test.tsx does. Reset in `beforeEach` via `mockMutate.mockClear()` alongside `vi.clearAllMocks()`.

**Mock pattern for `useAuth`** (copy from `KontoPage.test.tsx:23-26` + `BottomTabBar.test.tsx:17-20`):
```typescript
vi.mock('@/auth/useAuth', () => ({
  useAuth: vi.fn(),
  fetchMe: vi.fn(),
}));

import { useAuth } from '@/auth/useAuth';
const mockUseAuth = vi.mocked(useAuth);
```

**`makeUser` helper** (copy verbatim from `KontoPage.test.tsx:51-60` — same shape needed because `UserPill` reads `user.name`, `user.role`, `user.careUnit.name`):
```typescript
function makeUser(role: MeResponse['role']): MeResponse {
  return {
    id: `u-${role}`,
    email: `${role}@example.test`,
    name: `${role} user`,
    role,
    careUnit: { id: 'cu1', name: 'Avdelning 4, Karolinska' },
    permissions: role === 'admin' ? ['admin:ping'] : [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockMutate.mockClear();
});
```

**Render + assert pattern** (copy structure from `BottomTabBar.test.tsx:42-61`):
```typescript
describe('TopBar', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      user: makeUser('sjukskoterska'),
      isLoading: false,
      can: (_a) => false,
    });
  });

  it('renders the mobile-only icon-button (aria-label "Logga ut")', () => {
    renderWithProviders(<TopBar />);
    // Mobile variant has aria-label; desktop variant has inline text — disambiguate
    // by querying for the icon-only button via its aria-label only (the desktop
    // button gets its accessible name from the inline "Logga ut" text node,
    // but the icon-only aria-label is the exact-match path).
    const mobileButton = screen.getByRole('button', { name: 'Logga ut' });
    expect(mobileButton).toBeInTheDocument();
    expect(mobileButton.className).toMatch(/md:hidden/);
  });

  it('renders the desktop-only logout button (text "Logga ut" inside a hidden md:flex cluster)', () => {
    renderWithProviders(<TopBar />);
    // Both buttons have accessible-name "Logga ut". getAllByRole returns both;
    // the desktop one is the one inside a parent with `hidden md:flex`.
    const allLogoutButtons = screen.getAllByRole('button', { name: /Logga ut/i });
    expect(allLogoutButtons.length).toBe(2);
  });

  it('clicking the mobile logout button invokes useLogout().mutate()', async () => {
    const { user: userEvent } = await import('@testing-library/user-event').then((m) => ({
      user: m.default.setup(),
    }));
    renderWithProviders(<TopBar />);
    const buttons = screen.getAllByRole('button', { name: /Logga ut/i });
    await userEvent.click(buttons[0]);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('clicking the desktop logout button invokes useLogout().mutate()', async () => {
    const userEvent = (await import('@testing-library/user-event')).default.setup();
    renderWithProviders(<TopBar />);
    const buttons = screen.getAllByRole('button', { name: /Logga ut/i });
    await userEvent.click(buttons[1]);
    expect(mockMutate).toHaveBeenCalledTimes(1);
  });

  it('renders the static UserPill (identity display is NOT a button)', () => {
    renderWithProviders(<TopBar />);
    // The pill shows the user's name as plain text inside a <div>, not a <button>.
    // Assert: text is present AND no button has the user.name as accessible name.
    expect(screen.getByText('sjukskoterska user')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'sjukskoterska user' }),
    ).not.toBeInTheDocument();
  });

  it('keeps the existing logo Link to /dashboard', () => {
    renderWithProviders(<TopBar />);
    const logoLink = screen.getByRole('link', { name: /MediTrack/i });
    expect(logoLink).toHaveAttribute('href', '/dashboard');
  });
});
```
*(Plan-time refinement OK; the test cases above mirror CONTEXT.md §`<specifics>` "TopBar.test.tsx" scaffold and the established assertion shapes in the two analog files.)*

**`renderWithProviders` rationale** — `renderWithProviders` already wraps in `MemoryRouter` + `QueryClientProvider` (see `apps/web/test/helpers/renderWithProviders.tsx:21-49`), which `TopBar` needs because of the `<Link>` to `/dashboard` and the `useLogout` mutation hook. No `initialPath`/`queryData` overrides needed for these tests.

**Doc-comment header pattern** (copy structure from `KontoPage.test.tsx:7-20`):
```typescript
/**
 * UX-02 — TopBar logout reachability at every breakpoint
 * (apps/web/src/routes/shell/TopBar.tsx)
 *
 * Behavioral requirements (Phase 11 D-170 / D-174):
 * - Mobile (<md): icon-only <LogOut/> button, 44×44, aria-label="Logga ut".
 * - Desktop (>=md): icon+label "Logga ut" button next to static UserPill.
 * - Both wire to useLogout().mutate() — same hook, single source of truth.
 * - UserPill renders as a non-interactive <div> (no role="button"). D-171.
 * - Logo Link to /dashboard unchanged.
 */
```

---

## Shared Patterns

### Authentication / identity read

**Source:** `apps/web/src/auth/useAuth.ts` (hook), consumed at `UserPillPopover.tsx:25` and `KontoPage.tsx:37`.
**Apply to:** `UserPill.tsx` (post-rename) — same destructuring `const { user } = useAuth();` + `if (!user) return null;` guard.

```typescript
// PATTERN (from UserPillPopover.tsx:25-30 — keep verbatim in UserPill.tsx):
const { user } = useAuth();
if (!user) {
  return null;  // defense in depth — AuthGate guarantees this above
}
```

### Logout mutation wiring

**Source:** `apps/web/src/features/auth/useLogout.ts` (entire file is the contract).
**Apply to:** Both new TopBar logout buttons (desktop + mobile) AND the retained Konto button (no change).

```typescript
// PATTERN (from UserPillPopover.tsx:26, 58-59):
const logout = useLogout();
// ...
<button
  type="button"
  onClick={() => logout.mutate()}
  disabled={logout.isPending}
>
  {logout.isPending ? 'Loggar ut…' : 'Logga ut'}
</button>
```
- `onClick={() => logout.mutate()}` — arrow form is required (React passes `MouseEvent` as the first arg; `mutate(e)` would attempt to send the event as the mutation variable).
- `disabled={logout.isPending}` — prevents double-fire while in flight.
- `{logout.isPending ? 'Loggar ut…' : 'Logga ut'}` — pending-state label; ellipsis is the U+2026 char (matches `UserPillPopover.tsx:62` byte-for-byte).
- For the **icon-only** mobile variant, replace the pending-state ternary's text with just the icon. The `disabled` attribute alone is sufficient feedback (icon doesn't change). Decided per D-174.

### Destructive color token

**Source:** `apps/web/src/routes/shell/UserPillPopover.tsx:60` (`text-[#DC2626]`).
**Apply to:** Both new TopBar logout buttons. Same token; do not introduce a new shade.

```typescript
// Token: text-[#DC2626]
// UI-SPEC §Colors §97 — "Destructive #DC2626 — Logout confirmation, delete actions only"
```

### Focus-visible ring

**Source:** `apps/web/src/routes/shell/TopBar.tsx:26` (logo) + `UserPillPopover.tsx:37, 60` (popover trigger + inner logout button).
**Apply to:** Both new TopBar logout buttons. Identical class string verbatim.

```typescript
focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2
```

### Responsive breakpoint detection (CSS-only — AppShell Pattern N)

**Source:** `TopBar.tsx:32` (`hidden md:block`) + `BottomTabBar.tsx:28` (`md:hidden`).
**Apply to:** TopBar.tsx widening per D-170 — desktop cluster gets `hidden md:flex md:items-center md:gap-3`; mobile button gets `md:hidden inline-flex items-center justify-center h-11 w-11 ...`.

```typescript
// Desktop-only:  hidden md:flex md:items-center md:gap-3
// Mobile-only:   md:hidden inline-flex items-center justify-center h-11 w-11
// AppShell Pattern N: never JS breakpoint detection; CSS classes only.
```

### 44 px tap-target floor

**Source:** `BottomTabBar.tsx:37` (`min-h-[44px]`).
**Apply to:** Mobile icon-only button (`h-11 w-11` = 44 px explicit); desktop icon+label button (`min-h-[44px]`).

### Test mock for `useLogout`

**Source:** `apps/web/test/KontoPage.test.tsx:29-34`.
**Apply to:** New `apps/web/test/TopBar.test.tsx` — lift `mockMutate` to module scope so click assertions can verify call count.

```typescript
// PATTERN (KontoPage.test.tsx:29-34 — adapted to capture mutate):
const mockMutate = vi.fn();
vi.mock('@/features/auth/useLogout', () => ({
  useLogout: vi.fn(() => ({
    mutate: mockMutate,
    isPending: false,
  })),
}));
```

### Test mock for `useAuth` + `makeUser` helper

**Source:** `apps/web/test/KontoPage.test.tsx:23-26, 51-60` and `apps/web/test/BottomTabBar.test.tsx:17-35`.
**Apply to:** New `apps/web/test/TopBar.test.tsx` — identical shape. `TopBar` reads `useAuth` indirectly through `UserPill`, so the same mock + `makeUser` helper covers it.

### Test render helper

**Source:** `apps/web/test/helpers/renderWithProviders.tsx:21-49`.
**Apply to:** All tests in the slice (existing `KontoPage.test.tsx` already uses it; new `TopBar.test.tsx` reuses it identically — no overrides needed).

---

## No Analog Found

*(None — every file in Phase 11 has a strong in-repo analog. The phase is composed entirely of patterns already proven in the codebase.)*

---

## Phase 11 Pattern Inventory Summary

Every Phase 11 file derives from existing in-repo precedent. The slice is mechanically:

1. **Take `UserPillPopover.tsx`'s `<button>` content** (lines 39-49) → make it a `<div>` inside a new `UserPill.tsx`.
2. **Take `UserPillPopover.tsx`'s inner logout button** (lines 56-63) → render it twice in `TopBar.tsx` with per-breakpoint class variants (D-170/D-174).
3. **Take `BottomTabBar.tsx`'s `md:hidden`** → use it on the mobile logout button.
4. **Take `BottomTabBar.tsx`'s `min-h-[44px]`** → use it on both new logout buttons.
5. **Take `KontoPage.test.tsx`'s mock shapes** → reuse in `TopBar.test.tsx` (lift `mockMutate` to module scope).
6. **Take `BottomTabBar.test.tsx`'s describe/render structure** → reuse in `TopBar.test.tsx`.
7. **Swap one string** in `KontoPage.tsx:115` and its 3 mirror sites in `KontoPage.test.tsx`.

No new abstraction, no new shadcn primitive, no new hook, no new helper. The slice is pure pattern composition.

---

## Metadata

**Analog search scope:**
- `apps/web/src/routes/shell/` (TopBar, UserPillPopover, BottomTabBar, Sidebar, AppShell, nav)
- `apps/web/src/routes/konto/` (KontoPage)
- `apps/web/src/features/auth/` (useLogout)
- `apps/web/src/auth/` (useAuth — path verified via Glob)
- `apps/web/src/components/` (RoleBadge — path verified via Glob)
- `apps/web/test/` (KontoPage.test, BottomTabBar.test, helpers/renderWithProviders)

**Files scanned:** 9 source/test files read in full + 2 Glob path verifications + 1 Grep usage check (`@/components/ui/popover` has 3 remaining importers besides UserPillPopover — `AtcCodeCombobox`, `TherapeuticClassCombobox`, `AuditFilterBar` — so the v2 popover-removal deferred item from CONTEXT.md is correctly out of scope; the dep stays.)

**Pattern extraction date:** 2026-05-25
