import { useState, useEffect } from 'react';

/**
 * Phase 3 — Extracted from MedicationSheet.tsx for reuse.
 *
 * Returns true when the viewport is ≥768 px (Tailwind's `md` breakpoint).
 * Used by MedicationPickerSheet (and MedicationSheet via local alias) to choose
 * between `side="right"` (≥md) and `side="bottom"` (<md) on shadcn <Sheet>.
 *
 * SSR-safe: initialises from window.matchMedia on first client render.
 */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}
