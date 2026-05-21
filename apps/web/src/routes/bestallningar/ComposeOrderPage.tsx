import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// TODO Slice 3: replace placeholder body with line list + sticky footer + picker overlay

/**
 * Phase 3 D-50 / UI-SPEC §IA — Compose Order page placeholder.
 *
 * This route placeholder exists so:
 *   1. POST /api/orders → navigate('/bestallningar/:id') lands somewhere visible
 *   2. /bestallningar/:id route registration is in place before Slice 3
 *
 * Slice 3 replaces the body completely with:
 *   - Order header (status pill, title 'Nytt utkast' | 'Beställning · Skickad')
 *   - Line list (<table> ≥md / cards <md)
 *   - Sticky footer on mobile (line count, total quantity, submit, discard)
 *   - MedicationPickerSheet (right-slide ≥md / bottom-sheet <md)
 *
 * Back link uses <Link> (client-side navigation) to avoid a full page reload.
 */
export function ComposeOrderPage() {
  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
      {/* Back navigation */}
      <div>
        <Link
          to="/bestallningar"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Tillbaka till beställningar
        </Link>
      </div>

      {/* Page heading */}
      <h1 className="text-2xl font-semibold leading-tight">Nytt utkast</h1>

      {/* Placeholder body — Slice 3 replaces this entirely */}
      <div className="flex items-center justify-center flex-1 p-8">
        <div className="max-w-md w-full p-8 text-center bg-card border border-border rounded-lg shadow-sm">
          <p className="text-sm text-muted-foreground">Slice 3 fyller i denna vy.</p>
        </div>
      </div>
    </div>
  );
}
