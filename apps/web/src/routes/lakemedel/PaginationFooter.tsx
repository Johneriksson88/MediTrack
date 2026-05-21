import { Button } from '@/components/ui/button';

/**
 * Phase 2 UI-SPEC §11 — Pagination footer.
 *
 * Prev / page indicator / Next. Buttons disabled at edges.
 * Data attribution footer per UI-SPEC §11 (D-23 — credit Läkemedelsverket NPL).
 */

interface PaginationFooterProps {
  page: number;
  totalPages: number;
  onPageChange: (newPage: number) => void;
}

export function PaginationFooter({ page, totalPages, onPageChange }: PaginationFooterProps) {
  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          type="button"
          aria-label="Föregående sida"
        >
          Föregående
        </Button>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          Sida {page} av {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          type="button"
          aria-label="Nästa sida"
        >
          Nästa
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Data: Läkemedelsverket NPL</p>
    </div>
  );
}
