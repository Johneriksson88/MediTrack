/**
 * Phase 7 D-127 — SC#4 mobile-first verification harness.
 *
 * One-shot Playwright script: logs in as admin, iterates
 * [360, 768, 1024, 1440] × [6 primary routes]. For each cell:
 *   - asserts document.documentElement.scrollWidth <= window.innerWidth
 *   - asserts [data-test="primary-nav"] is present and visible
 * For the 6 × 360 cells only: captures docs/screenshots/sc04-360-<slug>.png.
 *
 * Exit 0 => SC#4 mechanically verified.
 * Exit non-zero => verification failed; diagnostic printed to stderr.
 *
 * Prereq: `docker compose up` is running (api on :3000, web on :5173).
 * First-time setup: `pnpm exec playwright install chromium`.
 *
 * Run: pnpm --filter @meditrack/web exec tsx scripts/captureSc04Screenshots.ts
 */

import { chromium, type Browser, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

// -------------------------------------------------------------------------
// ESM __dirname shim (tsx-as-CLI invocation shape — mirrors apps/api/prisma/seed.ts)
// -------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// -------------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------------

const ROUTES = [
  { slug: 'login',                path: '/login',            anonymous: true  },
  { slug: 'lakemedel',            path: '/lakemedel',        anonymous: false },
  { slug: 'bestallningsskapande', path: '/bestallningar/ny', anonymous: false },
  { slug: 'bestallningshistorik', path: '/bestallningar',    anonymous: false },
  { slug: 'audit',                path: '/admin/audit',      anonymous: false },
  { slug: 'dashboard',            path: '/dashboard',        anonymous: false },
] as const;

const VIEWPORTS = [
  { width: 360,  height: 800  },
  { width: 768,  height: 1024 },
  { width: 1024, height: 768  },
  { width: 1440, height: 900  },
] as const;

const BASE_URL = 'http://localhost:5173';
const ADMIN_EMAIL = 'admin@example.test';
const ADMIN_PASSWORD = 'demo1234';

// Resolve path to docs/screenshots/ at repo root (three levels up from apps/web/scripts/)
const SCREENSHOTS_DIR = path.resolve(__dirname, '../../../docs/screenshots');

// -------------------------------------------------------------------------
// Login helper
// -------------------------------------------------------------------------

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState('networkidle');
  // Fill email input (id="email", registered as "email" in react-hook-form)
  await page.fill('input#email', ADMIN_EMAIL);
  // Fill password input (id="password", registered as "password" in react-hook-form)
  await page.fill('input#password', ADMIN_PASSWORD);
  // Click the submit button ("Logga in")
  await page.click('button[type="submit"]');
  // Wait for navigation away from /login (post-login redirect to /dashboard)
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 10_000 });
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------

async function main(): Promise<void> {
  const failures: string[] = [];
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    let loggedIn = false;

    for (const viewport of VIEWPORTS) {
      for (const route of ROUTES) {
        // Set viewport for this cell
        await page.setViewportSize(viewport);

        // Log in as admin once (for the first non-anonymous route)
        if (!route.anonymous && !loggedIn) {
          await loginAsAdmin(page);
          loggedIn = true;
        }

        // Navigate to the route
        await page.goto(BASE_URL + route.path);
        await page.waitForLoadState('networkidle');

        // --- Assertion 1: no horizontal overflow ---
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        );
        if (overflow) {
          failures.push(
            `x-overflow at ${viewport.width}x${viewport.height} on ${route.path} ` +
            `(scrollWidth=${await page.evaluate(() => document.documentElement.scrollWidth)} > innerWidth=${await page.evaluate(() => window.innerWidth)})`,
          );
        }

        // --- Assertion 2: primary nav reachability ---
        // Carve-out: /login does not render AppShell, so no primary nav is present.
        // AppShell renders BOTH Sidebar (hidden md:flex) and BottomTabBar (md:hidden);
        // exactly one is visible per viewport. The assertion is "at least one nav with
        // data-test=primary-nav is visible", so enumerate all matches and OR-reduce
        // isVisible() — checking only the first match would always fail at <md because
        // the Sidebar is rendered first in the DOM and is display:none on mobile.
        if (!route.anonymous) {
          const navHandles = await page.$$('[data-test="primary-nav"]');
          if (navHandles.length === 0) {
            failures.push(
              `primary nav (data-test="primary-nav") not found at ${viewport.width}x${viewport.height} on ${route.path}`,
            );
          } else {
            let anyVisible = false;
            for (const h of navHandles) {
              if (await h.isVisible()) {
                anyVisible = true;
                break;
              }
            }
            if (!anyVisible) {
              failures.push(
                `primary nav not visible at ${viewport.width}x${viewport.height} on ${route.path}`,
              );
            }
          }
        }

        // --- Capture: only at 360 px ---
        if (viewport.width === 360) {
          await mkdir(SCREENSHOTS_DIR, { recursive: true });
          await page.screenshot({
            path: path.join(SCREENSHOTS_DIR, `sc04-360-${route.slug}.png`),
            fullPage: true,
          });
        }

        // Progress log
        console.log(`✓ ${viewport.width}x${viewport.height} ${route.path}`);
      }
    }

    await context.close();
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  // --- Exit-code discipline ---
  if (failures.length > 0) {
    for (const f of failures) {
      process.stderr.write(`FAIL: ${f}\n`);
    }
    process.exit(1);
  }

  console.log(`\nSC#4 verification PASSED — all 24 cells (${VIEWPORTS.length} viewports x ${ROUTES.length} routes) OK.`);
  process.exit(0);
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
