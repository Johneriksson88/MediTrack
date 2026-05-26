import { useState } from 'react';

/**
 * Client-side sort state for table headers.
 *
 * Scope: sorts whatever rows the caller passes in. For server-paginated
 * tables (Läkemedel, Audit, Beställningar) this means "current page" —
 * sorting by Lager does not pull the lowest-stock rows in from other pages.
 * A header-driven server sort would need `sort`/`dir` query params and
 * Prisma `orderBy` plumbing end-to-end; out of scope for this hook.
 *
 * Toggle cycle on click: none → asc → desc → none (back to source order).
 *
 * Compare semantics:
 *   - null/undefined always trail, regardless of direction (so "missing"
 *     never ranks above a real value in either ordering).
 *   - Strings use Swedish locale collation with `numeric` (so "Kapsel 10 mg"
 *     sorts before "Kapsel 2 mg" numerically, and å/ä/ö collate correctly).
 */

export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export type SortableValue = string | number | boolean | Date | null | undefined;

export type AriaSort = 'ascending' | 'descending' | 'none';

export function useTableSort<K extends string>(initial: SortState<K> | null = null) {
  const [state, setState] = useState<SortState<K> | null>(initial);

  function toggle(key: K) {
    setState((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  }

  function ariaSort(key: K): AriaSort {
    if (!state || state.key !== key) return 'none';
    return state.dir === 'asc' ? 'ascending' : 'descending';
  }

  function applyTo<T>(rows: readonly T[], accessor: (row: T, key: K) => SortableValue): T[] {
    if (!state) return [...rows];
    const mult = state.dir === 'asc' ? 1 : -1;
    const decorated = rows.map((row, i) => ({ row, i, k: accessor(row, state.key) }));
    decorated.sort((a, b) => {
      const cmp = compareValues(a.k, b.k);
      return cmp !== 0 ? cmp * mult : a.i - b.i;
    });
    return decorated.map((d) => d.row);
  }

  return { state, toggle, ariaSort, applyTo };
}

function compareValues(a: SortableValue, b: SortableValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return String(a).localeCompare(String(b), 'sv', { sensitivity: 'base', numeric: true });
}
