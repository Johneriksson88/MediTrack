import { Button } from '@/components/ui/button';

interface SortimentActionBarProps {
  selectedCount: number;
  primaryLabel: string;
  onPrimary: () => void;
  onClear: () => void;
  primaryDisabled?: boolean;
  primaryVariant?: 'default' | 'destructive';
}

/**
 * Sticky bottom action bar for the Sortiment page. Visible only when the
 * selection is non-empty. Sits below the table so it never covers the data,
 * and persists at viewport bottom so the button is reachable without
 * scrolling on long lists.
 *
 * `primaryVariant='destructive'` is used by the "I sortimentet" tab
 * (remove) and `'default'` by the "Lägg till" tab (add).
 */
export function SortimentActionBar({
  selectedCount,
  primaryLabel,
  onPrimary,
  onClear,
  primaryDisabled,
  primaryVariant = 'default',
}: SortimentActionBarProps) {
  if (selectedCount === 0) return null;
  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-10 -mx-4 mt-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8"
      role="region"
      aria-label="Markeringsåtgärder"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-semibold">{selectedCount}</span> markerade
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClear} type="button">
            Avmarkera
          </Button>
          <Button
            variant={primaryVariant}
            onClick={onPrimary}
            disabled={primaryDisabled}
            type="button"
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
