import { ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { TableHead } from './table';
import { cn } from '@/lib/utils';
import type { AriaSort } from '@/lib/useTableSort';

/**
 * Sortable column header. Wraps the existing <TableHead> with a button
 * that toggles sort direction and renders a chevron indicator:
 *   none       → ChevronsUpDown (dimmed, signals "clickable but inactive")
 *   ascending  → ChevronUp
 *   descending → ChevronDown
 *
 * Sets aria-sort on the <th> so screen readers announce the active column.
 */

interface SortableTableHeadProps {
  children: React.ReactNode;
  ariaSort: AriaSort;
  onClick: () => void;
  className?: string;
}

export function SortableTableHead({ children, ariaSort, onClick, className }: SortableTableHeadProps) {
  const Icon =
    ariaSort === 'ascending'
      ? ChevronUp
      : ariaSort === 'descending'
        ? ChevronDown
        : ChevronsUpDown;

  return (
    <TableHead aria-sort={ariaSort} className={className}>
      <button
        type="button"
        onClick={onClick}
        className="-mx-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs
                   font-semibold uppercase tracking-wide text-muted-foreground
                   transition-colors hover:text-foreground focus-visible:outline-none
                   focus-visible:ring-2 focus-visible:ring-primary
                   focus-visible:ring-offset-1"
      >
        <span>{children}</span>
        <Icon
          className={cn('h-3.5 w-3.5 shrink-0', ariaSort === 'none' ? 'opacity-40' : 'opacity-100')}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}
