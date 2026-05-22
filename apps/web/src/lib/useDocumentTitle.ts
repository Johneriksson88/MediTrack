import { useEffect } from 'react';

/**
 * Phase 3 WR-05 / WR-09 fix — save-and-restore document.title.
 *
 * Sets document.title to `title` on mount (and whenever `title` changes),
 * then restores the *previous* title on cleanup. This is correct for SPA
 * navigation: routing from `/lakemedel` (title 'Läkemedel — MediTrack') to
 * `/bestallningar/<id>` and back leaves the user with 'Läkemedel — MediTrack'
 * again, not the bare 'MediTrack' fallback. Each effect run captures the
 * title that was in place when it started, so transitions chain correctly
 * even when multiple pages stack effect invocations on a single tick.
 *
 * The hook is intentionally tiny — extracting it once means callers can't
 * forget the save/restore and re-introduce the hard-coded 'MediTrack' bug.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const prev = document.title;
    document.title = title;
    return () => {
      document.title = prev;
    };
  }, [title]);
}
