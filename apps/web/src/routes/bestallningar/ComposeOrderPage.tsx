import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ClipboardList } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyStateCard } from '@/components/EmptyStateCard';
import { OrderStatusPill } from '@/components/OrderStatusPill';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Can } from '@/auth/Can';
import { useOrderQuery } from '@/features/orders/useOrderQueries';
import { useSubmitOrder, useDiscardOrder } from '@/features/orders/useOrderMutations';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { OrderLineTable } from './OrderLineTable';
import { OrderLineCardList } from './OrderLineCardList';
import { MedicationPickerSheet } from './MedicationPickerSheet';
import { ComposeStickyFooter } from './ComposeStickyFooter';
import { SubmitConfirmationBanner } from './SubmitConfirmationBanner';
import { DiscardDraftDialog } from './DiscardDraftDialog';

/**
 * Phase 3 D-50 / D-67 / D-68 / D-71 / UI-SPEC §4 — Compose Order page.
 *
 * Slice 4 replaces the Slice 3 stubs:
 *   - OrderStatusPill: <OrderStatusPill status={order.status} /> (replaces inline span)
 *   - Mode B body: <SubmitConfirmationBanner> + locked line list (replaces placeholder div)
 *   - Submit + Kasta handlers: wired via useSubmitOrder + useDiscardOrder
 *   - DiscardDraftDialog: AlertDialog overlay opened by the Kasta button
 *
 * State branches on useOrderQuery(id):
 *   - loading     → skeleton header + 3 skeleton line blocks, footer hidden
 *   - error 404   → <EmptyStateCard> with back-link
 *   - utkast      → Mode A: editable line list + picker trigger + sticky footer
 *   - non-utkast  → Mode B: SubmitConfirmationBanner + read-only line list (no footer)
 *
 * Submit flow (D-57):
 *   ComposeOrderPage passes onSubmit = () => submitMutation.mutateAsync({ orderId })
 *   to ComposeStickyFooter. On success, cache hydration flips the page to Mode B.
 *
 * Discard flow (D-67):
 *   Kasta button → setDiscardOpen(true) → DiscardDraftDialog opens.
 *   onConfirm = discardMutation.mutateAsync({ orderId }) then navigate('/bestallningar').
 *   On 409 order_locked, the hook invalidates ['order', id] → page re-renders Mode B.
 *
 * Mobile padding (D-71):
 *   Mode A: pb-[calc(56px+56px+env(safe-area-inset-bottom))] to clear the sticky footer.
 *   Mode B: no extra padding (footer absent).
 *
 * Document title: 'Nytt utkast — MediTrack' (utkast) | 'Beställning · Skickad — MediTrack' (non-utkast)
 */

export function ComposeOrderPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const orderQuery = useOrderQuery(id);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);

  const submitMutation = useSubmitOrder();
  const discardMutation = useDiscardOrder();

  const order = orderQuery.data;
  const isLoading = orderQuery.isLoading;
  const isError = orderQuery.isError;
  const is404 = isError && orderQuery.error?.envelope?.error?.code === 'not_found';

  // Document title — WR-05: use save/restore hook so SPA navigation
  // restores the previous route's title instead of hard-coding 'MediTrack'.
  // Default title while loading mirrors the loading-state copy direction;
  // it switches once the order resolves. The hook itself takes care of
  // capturing/restoring the *previous* document.title on each transition.
  const titleForOrder =
    order?.status === 'utkast'
      ? 'Nytt utkast — MediTrack'
      : order
        ? 'Beställning · Skickad — MediTrack'
        : 'Beställning — MediTrack';
  useDocumentTitle(titleForOrder);

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
        <OrderStatusPill status={order.status} />
      </div>
    </>
  );

  // WR-06: hoist a single TooltipProvider for the whole route so OrderLineTable
  // and ComposeStickyFooter share one provider context (one tooltip portal +
  // one scroll-lock observer instead of two stacked). Phase 4 components added
  // inside this tree get the provider for free.
  // ── Mode B — non-utkast (locked, read-only) ────────────────────────────────
  if (isLocked) {
    return (
      <TooltipProvider>
        <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
          {header}

          {/* SubmitConfirmationBanner: role="status" announces on the
              in-session submit transition only (WR-08 — submitMutation.isSuccess
              distinguishes "just submitted" from "loaded a skickad order"). */}
          <SubmitConfirmationBanner
            status={order.status}
            justSubmitted={submitMutation.isSuccess}
          />

          {/* Read-only line list (isLocked=true: no trash, QuantityStepper shows static span) */}
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
      </TooltipProvider>
    );
  }

  // ── Mode A — utkast (editable) ─────────────────────────────────────────────
  return (
    <TooltipProvider>
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

      {/* Discard confirmation AlertDialog (D-67) */}
      <DiscardDraftDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        isDeleting={discardMutation.isPending}
        onConfirm={async () => {
          // WR-04: navigate FIRST, then fire the mutation. useDiscardOrder.onSuccess
          // removes ['order', vars.orderId] from the cache; if we awaited the
          // mutation before navigating, React could flush a frame where
          // useOrderQuery(id).data is undefined (cache gone) but the route
          // hasn't changed yet — producing a one-frame "Beställning hittades
          // inte" flash before the navigate runs. Navigating first unmounts
          // this page synchronously, so the cache eviction happens after
          // unmount and is never observed in this route's render.
          navigate('/bestallningar');
          try {
            await discardMutation.mutateAsync({ orderId: order.id });
          } catch {
            // Hook handles toast on error; we've already navigated away,
            // so on 409 (Mode B re-render no longer applies — we left the
            // page) the user sees the destructive toast on /bestallningar
            // and the drafts list invalidation refreshes correctly.
          }
        }}
      />

      {/* Sticky footer with wired Submit + Kasta (D-71) */}
      <ComposeStickyFooter
        lines={order.lines}
        onAddClick={() => setPickerOpen(true)}
        onKastaClick={() => setDiscardOpen(true)}
        onSubmitClick={async () => {
          await submitMutation.mutateAsync({ orderId: order.id });
          // On success, cache hydration (useSubmitOrder onSuccess) updates the
          // ['order', id] entry to status='skickad', re-rendering this page into Mode B.
          // No explicit navigation — user stays on /bestallningar/:id per D-68.
        }}
        isSubmitting={submitMutation.isPending}
      />
      </div>
    </TooltipProvider>
  );
}
