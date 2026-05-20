---
phase: 01-foundation-auth
reviewed: 2026-05-20T22:30:00Z
depth: standard
files_reviewed: 36
files_reviewed_list:
  - apps/api/prisma/seed.ts
  - apps/api/src/app.ts
  - apps/api/src/auth/permissions.ts
  - apps/api/src/auth/requirePermission.ts
  - apps/api/src/routes/adminPing.ts
  - apps/api/src/services/user.service.ts
  - apps/api/test/admin.ping.test.ts
  - apps/api/test/auth.flow.smoke.test.ts
  - apps/api/test/auth.me.test.ts
  - apps/api/vitest.config.ts
  - apps/web/src/auth/AuthGate.tsx
  - apps/web/src/auth/Can.tsx
  - apps/web/src/auth/RoleRoute.tsx
  - apps/web/src/auth/useAuth.ts
  - apps/web/src/auth/useCan.ts
  - apps/web/src/components/EmptyStateCard.tsx
  - apps/web/src/components/RoleBadge.tsx
  - apps/web/src/components/ui/popover.tsx
  - apps/web/src/features/auth/useLogout.ts
  - apps/web/src/router.tsx
  - apps/web/src/routes/admin/AuditPage.tsx
  - apps/web/src/routes/bestallningar/BestallningarPage.tsx
  - apps/web/src/routes/dashboard/DashboardPage.tsx
  - apps/web/src/routes/konto/KontoPage.tsx
  - apps/web/src/routes/lakemedel/LakemedelPage.tsx
  - apps/web/src/routes/shell/AppShell.tsx
  - apps/web/src/routes/shell/AuthSkeleton.tsx
  - apps/web/src/routes/shell/BottomTabBar.tsx
  - apps/web/src/routes/shell/Sidebar.tsx
  - apps/web/src/routes/shell/TopBar.tsx
  - apps/web/src/routes/shell/UserPillPopover.tsx
  - apps/web/src/routes/shell/nav.ts
  - packages/shared/package.json
  - packages/shared/src/contracts/permissions.ts
  - packages/shared/src/index.ts
findings:
  critical: 1
  warning: 7
  info: 7
  total: 15
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-05-20T22:30:00Z
**Depth:** standard
**Files Reviewed:** 36 (32 listed in scope + 4 cross-referenced dependencies)
**Status:** issues_found

## Summary

The Phase 1 foundation looks well-architected: argon2id password hashing with verified-on-malformed `verifyPassword`, signed `meditrack.sid` session cookies with sensible flags (`HttpOnly`, `SameSite=lax`, `Secure` in prod), a 256-bit `crypto.randomBytes` session id, sliding-window expiry with a 30-day hard cap, the canonical error envelope, and a centralized `PERMISSIONS: Record<ActionKey, Role[]>` map that uses TypeScript exhaustiveness as drift prevention. The walking-skeleton FE wires `AuthGate` -> `AppShell` -> route correctly with a chrome-mirroring `AuthSkeleton`, and the test fixture is well-organized.

However, the review surfaces one **BLOCKER**:

- `user.service.ts` throws a plain `Error` on its "Session no longer valid" race-condition branch, which the global error handler maps to a **500 internal_error envelope**, not the 401 the code comment claims. This silently masks a real "session disappeared concurrently" or "tenant mismatch" event as a server bug, breaking the FE's 401 redirect contract.

Material **WARNINGS** worth addressing before Phase 2:

- No rate-limiting on `POST /api/auth/login`. Argon2id at ~150-300 ms per verify rate-limits passively, but credential stuffing against the three seeded demo accounts is wide open.
- Expired sessions are never purged. `requireSession` rejects on `expiresAt <= now` but leaves the row in place forever; no GC job, no opportunistic delete -> the `Session` table grows unbounded.
- `touchSession` is a non-atomic `findUnique` + `update` instead of a single `update` -> tiny race window where a concurrent logout can leave the touch trying to update a deleted row (would throw `P2025` -> 500).
- `requireSession` issues 3-4 sequential DB round-trips on every authenticated request (find session, find session again inside `touchSession`, update, find user with careUnit). The `/me` route then runs a third nested `findUnique` for the same session. Not a correctness bug but it amplifies any of the above races and is wasteful enough to be worth flagging.
- The `KontoPage` admin-gate visibility uses `user.role !== 'admin'` (line 113) instead of the centralized `useCan('admin:ping')`. The whole point of `PERMISSIONS` + `<Can>` is to keep one mental model; bypassing it on the inverse branch defeats the drift-prevention story.
- `apps/web/src/routes/shell/nav.ts:46` types the `role` parameter as `string | null | undefined`, weakening the otherwise tight `Role` typing for no good reason.
- The login flow has no observable audit trail (success or failure) -- the comment in `errorHandler.ts:92` says failed-login attempts must not log email/hash, but there's also no anonymized counter, no `req.log.warn` at all, so detection of brute-force is impossible.

The remaining INFO items are minor: dead defensive branches, hardcoded demo credentials, redundant `findUnique` calls.

The structural posture (cookie flags, password hashing params, session id entropy, RBAC map exhaustiveness, idempotent logout, error envelope shape, FE/BE shared types) is correct.

## Critical Issues

### CR-01: `getMeForSession` throws plain `Error` -> 500 instead of 401

**File:** `apps/api/src/services/user.service.ts:32-37`
**Issue:**

```ts
if (!session || session.careUnitId !== careUnitId) {
  // Belt-and-suspenders: the preHandler already validated the session, so
  // hitting this branch means something raced (session deleted) or a
  // careUnitId mismatch — surface as a 401-equivalent error.
  throw new Error('Session no longer valid');
}
```

The comment explicitly says "surface as a 401-equivalent error", but `new Error(...)` does NOT match any of the typed error classes in `plugins/errorHandler.ts`. The fall-through branch there maps unknown errors to:

```ts
return send(reply, 500, envelope('internal_error', 'Ett oväntat fel inträffade.'));
```

So a concurrent session deletion (real race) or a tenant-snapshot mismatch (real security-meaningful event) surfaces to the FE as a **500 with no 401-related code**. Consequences:

1. `AuthGate`'s `isUnauthenticated(error)` check (`err.status === 401`) returns `false`, so the FE re-throws to the router error boundary instead of redirecting to `/login` -- the user sees a generic crash rather than the intended re-auth flow.
2. Server logs misclassify a security-meaningful event as a generic 500 internal error.
3. `useQuery(['me'])` will treat this as a transient error and (depending on the call site's `retry` setting) may retry, hammering the DB during an actual incident.

**Fix:**

```ts
import { UnauthenticatedError } from '../plugins/errorHandler.js';

if (!session || session.careUnitId !== careUnitId) {
  // Session was deleted between requireSession and this read, or the
  // careUnit snapshot diverged — both are 401-equivalent.
  throw new UnauthenticatedError();
}
```

Add a regression test that mocks `prisma.session.findUnique` to return `null` and asserts `/api/me` responds 401 with the canonical `unauthenticated` envelope.

## Warnings

### WR-01: No rate limiting on `POST /api/auth/login`

**File:** `apps/api/src/routes/auth.ts:30-49`, `apps/api/src/app.ts:27-57`
**Issue:** The login route accepts unlimited attempts per IP / per email. Argon2id's ~150-300ms verify cost slows brute force passively but does not stop a botnet from spraying the three seeded `*@example.test` accounts (which all share the literal password `demo1234`). There is no `@fastify/rate-limit` registration, no per-IP throttle, no account-level lockout. This is the most likely thing an interviewer flags as a v1 gap given Medovia's audit focus.

**Fix:** Register `@fastify/rate-limit` with at least:

```ts
import rateLimit from '@fastify/rate-limit';

await app.register(rateLimit, {
  max: 10,
  timeWindow: '1 minute',
  keyGenerator: (req) => {
    // Bucket by IP + (optionally) email so password-spraying across emails
    // and brute-force against one email both hit the limit.
    const body = req.body as { email?: string } | undefined;
    return `${req.ip}|${body?.email ?? ''}`;
  },
  allowList: (req) => req.routeOptions.url !== '/api/auth/login',
});
```

If a v1 rate-limiter is out of scope, document the gap in README "what I'd do with more time" and add a `req.log.warn` on every `InvalidCredentialsError` so operational visibility is at least there.

### WR-02: Expired sessions are never deleted

**File:** `apps/api/src/auth/requireSession.ts:39-41`
**Issue:** When a request arrives with an expired session, the preHandler throws `UnauthenticatedError` and returns. The expired `Session` row stays in Postgres forever -- no opportunistic delete, no background sweep, no `cron` job. With the documented 7-day sliding / 30-day cap, every abandoned login leaves a row. Over the lifetime of a vårdenhet with rotating staff, this table grows unbounded and the `expiresAt` index gets denser over time.

Secondary effect: a stolen-but-expired session id can still be matched by `findSessionById` until a human cleans it up; the entire pre-expiry attack surface is preserved in the DB.

**Fix:** Two options, pick one for v1:

```ts
// Option A — opportunistic delete inline (cheap, no infra):
if (session.expiresAt.getTime() <= Date.now()) {
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
  throw new UnauthenticatedError();
}
```

```ts
// Option B — periodic sweep on app boot + interval (better for fleets):
setInterval(async () => {
  await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}, 60 * 60 * 1000); // hourly
```

Document the chosen strategy in the README's audit/retention section.

### WR-03: `touchSession` has a non-atomic read-then-write race

**File:** `apps/api/src/auth/session.ts:49-62`
**Issue:**

```ts
export async function touchSession(id: string): Promise<Session> {
  const existing = await prisma.session.findUnique({ where: { id } });
  if (!existing) {
    throw new Error(`Session ${id} not found`);
  }
  const now = new Date();
  const slidingExpiry = new Date(now.getTime() + SEVEN_DAYS_MS);
  const hardCap = new Date(existing.createdAt.getTime() + THIRTY_DAYS_MS);
  const expiresAt = slidingExpiry < hardCap ? slidingExpiry : hardCap;
  return prisma.session.update({
    where: { id },
    data: { expiresAt, lastSeenAt: now },
  });
}
```

Two issues:

1. Read-then-write is non-atomic. If a `DELETE /api/auth/session` lands between the `findUnique` and the `update`, the `update` throws `P2025` (record not found). This bubbles up unhandled and surfaces as a 500 to the legitimate logout-then-retry user.
2. The `Error('Session ${id} not found')` thrown on the read path is a plain `Error`, falling through to `internal_error` 500 (same root cause as CR-01). `requireSession` has already proven the row exists via its own `findSessionById` two lines earlier, so the only path that hits this branch is the race in (1) -- which is also where a 500 is wrong.

**Fix:** Compute the new `expiresAt` from `existing.createdAt` (already loaded by `requireSession`) and use a single `prisma.session.update`; catch `P2025` and either rethrow as `UnauthenticatedError` or simply ignore (the request is failing anyway):

```ts
export async function touchSession(
  id: string,
  createdAt: Date,
): Promise<void> {
  const now = new Date();
  const slidingExpiry = new Date(now.getTime() + SEVEN_DAYS_MS);
  const hardCap = new Date(createdAt.getTime() + THIRTY_DAYS_MS);
  const expiresAt = slidingExpiry < hardCap ? slidingExpiry : hardCap;
  try {
    await prisma.session.update({
      where: { id },
      data: { expiresAt, lastSeenAt: now },
    });
  } catch (err) {
    // P2025 means the session was deleted concurrently — bubble up as 401.
    if ((err as { code?: string }).code === 'P2025') {
      throw new UnauthenticatedError();
    }
    throw err;
  }
}
```

This also saves one DB round-trip per authenticated request.

### WR-04: `requireSession` does 3-4 sequential DB round-trips per request

**File:** `apps/api/src/auth/requireSession.ts:35-52`, `apps/api/src/services/user.service.ts:21-30`
**Issue:** On every authenticated request:

1. `findSessionById(sessionId)` -> 1 query
2. `touchSession(sessionId)` -> 2 queries (findUnique + update; see WR-03)
3. `prisma.user.findUnique({ include: { careUnit } })` -> 1 query

For `/api/me` specifically, the route then runs a **fourth** query in `getMeForSession`:

```ts
const session = await prisma.session.findUnique({
  where: { id: sessionId },
  include: { user: { include: { careUnit: ... } } },
});
```

So `/api/me` does ~5 sequential DB hits to return a `{ id, email, name, role, careUnit, permissions }` payload that the preHandler already has 80% of in `req.user`. Each `await` is a network round-trip in the eventual containerized deployment.

This isn't a correctness bug per the v1 scope (and performance is out-of-scope), but it amplifies every other concurrency issue in this review (WR-02, WR-03) and the "scaling to 50 vårdenheter" interview question (per CLAUDE.md §6) has a worse answer than it needs to.

**Fix:** Two cleanups:

1. Fold the user lookup into the session lookup using `include`:

   ```ts
   const session = await prisma.session.findUnique({
     where: { id: sessionId },
     include: {
       user: { include: { careUnit: { select: { id: true, name: true } } } },
     },
   });
   ```

2. Have `/me` derive its response from `req.user` plus a single fresh `careUnit` re-read only if absolutely required by D-18 -- or, simpler, decorate the full `MeResponse` shape onto `req.user` once in `requireSession` and have `/me` return it directly without `getMeForSession` querying again.

### WR-05: `KontoPage` admin gate uses raw role comparison, not the permission map

**File:** `apps/web/src/routes/konto/KontoPage.tsx:113`
**Issue:**

```tsx
<Can action="admin:ping">
  ...admin button...
</Can>

{user.role !== 'admin' && (
  <p className="text-xs text-[#64748B]">
    Denna åtgärd kräver adminrättigheter.
  </p>
)}
```

The reveal-side uses `<Can action="admin:ping">` (correct -- driven by the permission map), but the hide-side uses `user.role !== 'admin'` (drift-prone). When Phase 2 adds `audit:read` or `medication:create` and the matrix grows beyond "admin === has it", this branch silently lies: a future apotekare role that has `'admin:ping'` would still see the muted note, or an admin who loses `'admin:ping'` via a permissions change would see neither the button nor the note.

The PERMISSIONS map is supposed to be the single source of truth (Plan 03 D-15) -- this is the only place in Phase 1 that bypasses it.

**Fix:**

```tsx
import { useCan } from '@/auth/useCan';

const canAdminPing = useCan('admin:ping');

// ...
<Can action="admin:ping">...</Can>
{!canAdminPing && (
  <p className="text-xs text-[#64748B]">
    Denna åtgärd kräver adminrättigheter.
  </p>
)}
```

### WR-06: No login attempt is logged (success or failure)

**File:** `apps/api/src/plugins/errorHandler.ts:91-98`, `apps/api/src/services/auth.service.ts:38-72`
**Issue:** The error handler explicitly suppresses logging on `InvalidCredentialsError` ("No req.log — failed-login attempts must not leak email/hash via logs"). But it logs **nothing at all** -- no anonymized counter, no IP-only entry, no successful-login marker. Combined with WR-01 (no rate limiter), brute-force activity is invisible to operations. The interview's §6 "concurrent updates from two nurses" hypothetical has a sibling "credential stuffing attempt" that the current logging story can't answer.

PII concern is legitimate, but the bar is "don't log the password and don't log the full email" -- not "don't log anything". A hashed/truncated email plus IP + outcome is enough for operational signal without leaking the input.

**Fix:**

```ts
if (err instanceof InvalidCredentialsError) {
  // Log enough to detect brute-force without leaking credentials.
  req.log.warn(
    { ip: req.ip, ua: req.headers['user-agent'] },
    'auth.login.invalid',
  );
  return send(reply, 400, envelope('invalid_credentials', 'Fel e-post eller lösenord.'));
}
```

And add a `req.log.info({ ip: req.ip, userId: user.id }, 'auth.login.success')` after a successful `createSession` in `auth.service.ts`.

### WR-07: `visibleNav` accepts `string | null | undefined` instead of `Role | null | undefined`

**File:** `apps/web/src/routes/shell/nav.ts:46-48`
**Issue:**

```ts
export function visibleNav(role: string | null | undefined): NavItem[] {
  return NAV.filter((item) => !item.adminOnly || role === 'admin');
}
```

The callers (`Sidebar.tsx:23`, `BottomTabBar.tsx:22`) pass `user?.role`, where `user.role` is typed `Role`. By widening to `string`, the function loses the compile-time guarantee that callers can only pass a known role; a typo like `visibleNav('ADMIN')` would type-check but silently hide the admin tab. This contradicts the codebase's stated discipline of using `Role` and `ActionKey` literal unions as drift-prevention everywhere.

**Fix:**

```ts
import type { Role } from '@meditrack/shared';

export function visibleNav(role: Role | null | undefined): NavItem[] {
  return NAV.filter((item) => !item.adminOnly || role === 'admin');
}
```

## Info

### IN-01: Hardcoded shared password `demo1234` in seed and test fixtures

**File:** `apps/api/prisma/seed.ts:30`, `apps/api/test/helpers/buildTestApp.ts:52`
**Issue:** All three demo users share `demo1234`, the test cookie secret is a fixed literal, and these strings live in the repo. Acceptable for a one-week interview demo (and explicitly documented as dev-only), but flag in the README's "known gaps" so the reviewer doesn't think it's a security mistake.

**Fix:** Add a clear callout in `README.md` under "Demo credentials" / "Security posture" stating that the dev seed bakes in a shared dev password by design and that a production deployment would issue per-user passwords + rotate the cookie secret.

### IN-02: Defensive dead branch in `AuthGate` (no data, no error)

**File:** `apps/web/src/auth/AuthGate.tsx:48-57`
**Issue:** The `if (!data) { return <Navigate ...>; }` branch can only be reached if `useQuery` settles with `data === undefined` AND `isError === false` AND `isLoading === false`. With `retry: false` and `/api/me` always returning a populated body on 200, this branch is unreachable in practice. Not a bug; just notable that the comment "shouldn't happen" is accurate, so the cost is the extra `<Navigate>` render path nobody will ever hit. Consider replacing with `throw new Error('useQuery settled with no data and no error')` to make the assertion explicit, or document the case more concretely. Leaving it as-is is also fine.

### IN-03: `getMeForSession` re-queries the session Prisma already loaded

**File:** `apps/api/src/services/user.service.ts:21-30`
**Issue:** `requireSession` has already loaded the session, touched it, and read the user+careUnit. Then `/api/me`'s handler calls `getMeForSession(careUnitId, sessionId)`, which does a fresh `prisma.session.findUnique({ include: { user: { include: { careUnit } } } })`. The data is already on `req.user`. Two ways to read this:

- (a) belt-and-suspenders re-read in case the session got revoked mid-request -- defensible if documented.
- (b) accidental duplication.

The Pattern D rationale ("`careUnitId` first") is real, but it doesn't require re-loading; the service could accept the already-loaded user object instead. Quality-only -- fix when consolidating per WR-04.

### IN-04: `RoleRoute` returns `<>{fallback}</>` when `fallback` is `<Navigate/>`

**File:** `apps/web/src/auth/RoleRoute.tsx:43`
**Issue:** Wrapping `<Navigate to="/dashboard" replace />` in a `<Fragment>` is harmless but unnecessary; React Router accepts a `Navigate` element directly. Pure style; no behavior change.

### IN-05: `RoleRoute` renders `null` when `isLoading` is true

**File:** `apps/web/src/auth/RoleRoute.tsx:34-37`
**Issue:** `AuthGate` guarantees the `['me']` query is settled before `RoleRoute` renders (per the JSDoc). Returning `null` here is defensive belt-and-braces, but the cost is a blank flash if the assumption ever breaks (e.g. someone renders `RoleRoute` outside `AuthGate`). Consider rendering `<AuthSkeleton/>` instead so the failure mode is graceful chrome rather than a blank screen, or assert the invariant: `if (isLoading) throw new Error('RoleRoute rendered outside AuthGate')`.

### IN-06: `Can` causes a brief "flash of hidden content" while `/me` loads

**File:** `apps/web/src/auth/Can.tsx:27-29`, `apps/web/src/auth/useAuth.ts:36-39`
**Issue:** During the initial `/me` load, `useAuth().data` is `undefined` and `can(action)` returns `false`. `<Can action="admin:ping">` therefore renders `null` for one render cycle even for admin users. In practice this is invisible because `AuthGate` doesn't render the route tree until `/me` resolves, so by the time `KontoPage` mounts, `data` is populated. Still worth noting because the moment a future caller renders `<Can>` outside an `AuthGate` (e.g. on the public `/login` page for a "sign up as admin" CTA), the gate will silently hide everything. Pure note; no fix needed yet.

### IN-07: `seed.ts` `update: {}` means re-seeding never updates passwords or roles

**File:** `apps/api/prisma/seed.ts:73-84`
**Issue:** The intentional `update: {}` makes re-runs idempotent in a strong sense (no `updatedAt` bump, no hash rewrite). But this also means rotating `SHARED_PASSWORD` in this file and re-running `pnpm db:seed` is a no-op against existing rows -- the only way to apply a password change to seeded users is to delete the rows first. The test fixture `ensureAllRolesSeeded` already does the opposite (full upsert with `update: {...}`), so the seed and the test helper diverge silently on this dimension. Worth a comment in `seed.ts` or aligning the two.

---

_Reviewed: 2026-05-20T22:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
