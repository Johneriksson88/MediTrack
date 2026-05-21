import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ClipboardList } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyStateCard } from '@/components/EmptyStateCard';
import { Can } from '@/auth/Can';
import { useOrderQuery } from '@/features/orders/useOrderQueries';
import { OrderLineTable } from './OrderLineTable';
import { OrderLineCardList } from './OrderLineCardList';
import { MedicationPickerSheet } from './MedicationPickerSheet';
import { ComposeStickyFooter } from './ComposeStickyFooter';

/**
 * Phase 3 D-50 / D-67 / D-68 / D-71 / UI-SPEC §4 — Compose Order page.
 *
 * Replaces the Slice 2 placeholder ("Slice 3 fyller i denna vy.").
 *
 * State branches on useOrderQuery(id):
 *   - loading     → skeleton header + 3 skeleton line blocks, footer hidden
 *   - error 404   → <EmptyStateCard> with back-link
 *   - utkast      → Mode A: editable line list + picker trigger + sticky footer
 *   - non-utkast  → Mode B placeholder (Slice 4 wires SubmitConfirmationBanner)
 *
 * OrderStatusPill:
 *   Slice 3 ships an inline placeholder span per plan spec. Slice 4 introduces
 *   <OrderStatusPill> and swaps it in.
 *   // TODO Slice 4: swap for <OrderStatusPill status={order.status} />
 *
 * Submit + Kasta handlers:
 *   Buttons are inert (onClick={() => {}}) here.
 *   // TODO Slice 4: wire useSubmitOrder + DiscardDraftDialog
 *
 * Document title: 'Nytt utkast — MediTrack' (utkast) | 'Beställning · Skickad — MediTrack' (skickad)
 * Restored to 'MediTrack' on unmount.
 *
 * Main content mobile padding: pb-[calc(56px+56px+env(safe-area-inset-bottom))] in Mode A
 * so line list never hides behind the fixed footer (UI-SPEC §8 / D-71).
 */

export function ComposeOrderPage() {
  const { id } = useParams<{ id: string }>();
  const orderQuery = useOrderQuery(id);
  const [pickerOpen, setPickerOpen] = useState(false);

  const order = orderQuery.data;
  const isLoading = orderQuery.isLoading;
  const isError = orderQuery.isError;
  const is404 = isError && orderQuery.error?.envelope?.error?.code === 'not_found';

  // Document title
  useEffect(() => {
    if (!order) return;
    if (order.status === 'utkast') {
      document.title = 'Nytt utkast — MediTrack';
    } else {
      document.title = 'Beställning · Skickad — MediTrack';
    }
    return () => {
      document.title = 'MediTrack';
    };
  }, [order?.status]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
        {/* Back link (renders immediately) */}
        <div>
          <Link
            to="/bestallningar"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Tillbaka till beställningar
          </Link>
        </div>

        {/* Heading + status pill skeleton */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>

        {/* Line list skeleton */}
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  // ── 404 / error state ──────────────────────────────────────────────────────
  if (is404 || isError) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
        <div>
          <Link
            to="/bestallningar"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Tillbaka till beställningar
          </Link>
        </div>
        <EmptyStateCard icon={ClipboardList} heading="Beställning hittades inte." />
        <div className="flex justify-center -mt-4">
          <Link to="/bestallningar">
            <Button variant="link">Tillbaka till beställningar</Button>
          </Link>
        </div>
      </div>
    );
  }

  // Guard: shouldn't reach here, but satisfies TS
  if (!order) return null;

  const isUtkast = order.status === 'utkast';
  const isLocked = !isUtkast;

  // ── Shared header ──────────────────────────────────────────────────────────
  const heading = isUtkast ? 'Nytt utkast' : 'Beställning · Skickad';

  // TODO Slice 4: swap for <OrderStatusPill status={order.status} />
  const statusPillClasses: Record<string, string> = {
    utkast: 'bg-slate-100 text-slate-700',
    skickad: 'bg-blue-100 text-blue-800',
    bekraftad: 'bg-amber-100 text-amber-800',
    levererad: 'bg-emerald-100 text-emerald-800',
  };
  const pillClass = statusPillClasses[order.status] ?? 'bg-slate-100 text-slate-700';
  const statusLabels: Record<string, string> = {
    utkast: 'Utkast',
    skickad: 'Skickad',
    bekraftad: 'Bekräftad',
    levererad: 'Levererad',
  };

  const header = (
    <>
      <div>
        <Link
          to="/bestallningar"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
          Tillbaka till beställningar
        </Link>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold leading-tight">{heading}</h1>
        {/* TODO Slice 4: swap for <OrderStatusPill status={order.status} /> */}
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${pillClass}`}>
          {statusLabels[order.status] ?? order.status}
        </span>
      </div>
    </>
  );

  // ── Mode B — non-utkast (locked, read-only) ────────────────────────────────
  if (isLocked) {
    return (
      <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
        {header}

        {/* Mode B placeholder — Slice 4 wires SubmitConfirmationBanner here */}
        <div className="mt-2 mx-0 rounded-lg border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
          Beställningen är skickad till apotekare.
          {/* TODO Slice 4: replace with <SubmitConfirmationBanner> */}
        </div>

        {/* Read-only line list */}
        <OrderLineTable
          items={order.lines}
          orderId={order.id}
          isLocked={true}
          className="hidden md:block"
        />
        <OrderLineCardList
          items={order.lines}
          orderId={order.id}
          isLocked={true}
          className="block md:hidden"
        />
      </div>
    );
  }

  // ── Mode A — utkast (editable) ─────────────────────────────────────────────
  return (
    <div
      className="flex flex-col gap-4 p-4 md:p-6 lg:p-8
                 pb-[calc(56px+56px+env(safe-area-inset-bottom))] md:pb-8"
    >
      {header}

      {/* Line list */}
      <OrderLineTable
        items={order.lines}
        orderId={order.id}
        isLocked={false}
        className="hidden md:block"
      />
      <OrderLineCardList
        items={order.lines}
        orderId={order.id}
        isLocked={false}
        className="block md:hidden"
      />

      {/* Desktop-only "Lägg till läkemedel" button (below table, above sticky footer) */}
      <div className="hidden md:block">
        <Can action="order:update">
          <Button
            variant="outline"
            onClick={() => setPickerOpen(true)}
          >
            Lägg till läkemedel
          </Button>
        </Can>
      </div>

      {/* Picker Sheet overlay */}
      <MedicationPickerSheet
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        orderId={order.id}
      />

      {/* Sticky footer with Submit + Kasta placeholders */}
      <ComposeStickyFooter
        lines={order.lines}
        onAddClick={() => setPickerOpen(true)}
        onKastaClick={() => {
          // TODO Slice 4: open DiscardDraftDialog
        }}
        onSubmitClick={() => {
          // TODO Slice 4: wire useSubmitOrder
        }}
      />
    </div>
  );
}
