import { Skeleton } from '@/components/ui/skeleton';

/**
 * UI-SPEC §Auth Gate Loading Skeleton — renders the shell chrome with
 * Skeleton blocks while `useQuery(['me'])` is loading.
 *
 * The outer dimensions match the real shell so there is zero layout
 * shift when /me resolves and AuthGate hands the real content to the
 * route. Top bar, sidebar (md+), and bottom tab bar (mobile) are mirrored
 * 1:1; main content holds a single centered Skeleton block.
 *
 * No spinner. No text. No animation beyond Skeleton's default shimmer.
 */
export function AuthSkeleton() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col">
      {/* Top bar mirror */}
      <header className="h-14 bg-[#F1F5F9] border-b border-[#E2E8F0] flex items-center justify-between px-4 md:px-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-48 hidden md:block" />
      </header>

      <div className="flex flex-1 min-w-0">
        {/* Sidebar mirror (md+) */}
        <aside className="hidden md:flex md:w-16 lg:w-60 bg-[#F1F5F9] border-r border-[#E2E8F0] py-4 flex-col gap-2 px-3 shrink-0">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </aside>

        {/* Main content placeholder */}
        <main className="flex-1 min-w-0">
          <Skeleton className="h-8 w-48 mx-auto mt-12" />
        </main>
      </div>

      {/* Bottom tab bar mirror (mobile) */}
      <nav
        aria-label="Primary"
        aria-busy="true"
        className="md:hidden fixed bottom-0 inset-x-0 h-14 bg-[#F1F5F9] border-t border-[#E2E8F0] flex items-center justify-around pb-[env(safe-area-inset-bottom)]"
      >
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-10 w-10 rounded-full" />
      </nav>
    </div>
  );
}
