import { Outlet } from 'react-router-dom';

import { BottomTabBar } from './BottomTabBar';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/**
 * UI-SPEC §Information Architecture, §Layout & Spacing — the responsive
 * shell wrapping every authenticated route.
 *
 * Layout (CSS-only breakpoint detection per Pattern N — never JS):
 *
 *   <768px:    TopBar (logo only)
 *              <main> + fixed BottomTabBar (safe-area-inset)
 *
 *   768–1023:  TopBar (logo + user pill)
 *              Sidebar (w-16, icon only) | <main>
 *
 *   ≥1024:     TopBar
 *              Sidebar (w-60, icon + label) | <main>
 *
 * UX-01 critical:
 *   - Every flex child holding content has `min-w-0` so long content
 *     never blows the layout out (UI-SPEC §No-Horizontal-Scroll Guarantee).
 *   - Mobile main content adds bottom padding for the fixed tab bar
 *     height + iOS safe-area inset + 1rem breathing room.
 *   - Mobile uses Tailwind responsive `md:p-*` for the page padding scale
 *     (16/24/32 px) per UI-SPEC §Page Padding.
 */
export function AppShell() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      <TopBar />
      <div className="flex flex-1 min-w-0">
        <Sidebar />
        <main className="flex-1 min-w-0 flex flex-col p-4 md:p-6 lg:p-8 pb-[calc(56px+env(safe-area-inset-bottom)+1rem)] md:pb-6 lg:pb-8">
          <Outlet />
        </main>
      </div>
      <BottomTabBar />
    </div>
  );
}
