import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ClipboardList, Clock, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyStateCard } from '@/components/EmptyStateCard';
import { OrderStatusPill } from '@/components/OrderStatusPill';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Can } from '@/auth/Can';
import { useOrderQuery } from '@/features/orders/useOrderQueries';
import { useSubmitOrder, useDiscardOrder, useConfirmOrder, useDeliverOrder } from '@/features/orders/useOrderMutations';
import { useCan } from '@/auth/useCan';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { OrderLineTable } from './OrderLineTable';
import { OrderLineCardList } from './OrderLineCardList';
import { MedicationPickerSheet } from './MedicationPickerSheet';
import { ComposeStickyFooter } from './ComposeStickyFooter';
import { SubmitConfirmationBanner } from './SubmitConfirmationBanner';
import { DiscardDraftDialog } from './DiscardDraftDialog';
import { DeliverConfirmDialog } from './DeliverConfirmDialog';
import { ApotekareActionFooter } from './ApotekareActionFooter';
import { OrderActorTrail } from './OrderActorTrail';

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
  const [deliverDialogOpen, setDeliverDialogOpen] = useState(false);

  const submitMutation = useSubmitOrder();
  const discardMutation = useDiscardOrder();
  const confirmMutation = useConfirmOrder();
  const deliverMutation = useDeliverOrder();
  const canConfirm = useCan('order:confirm');
  const canDeliver = useCan('order:deliver');

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
    order?.status === 'utkast'    ? 'Nytt utkast — MediTrack' :
    order?.status === 'skickad'   ? 'Beställning · Skickad — MediTrack' :
    order?.status === 'bekraftad' ? 'Beställning · Bekräftad — MediTrack' :
    order?.status === 'levererad' ? 'Beställning · Levererad — MediTrack' :
    order                         ? 'Beställning — MediTrack' :
                                    'Beställning — MediTrack';
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
  const isSkickad = order.status === 'skickad';
  const isBekraftad = order.status === 'bekraftad';
  const isLevererad = order.status === 'levererad';
  const isLocked = !isUtkast;

  // ── Shared header ──────────────────────────────────────────────────────────
  const heading =
    isUtkast    ? 'Nytt utkast' :
    isSkickad   ? 'Beställning · Skickad' :
    isBekraftad ? 'Beställning · Bekräftad' :
    isLevererad ? 'Beställning · Levererad' :
                  'Beställning';

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
  // ── Mode B/C/D/E — non-utkast (locked, read-only + optional action) ─────────
  if (isLocked) {
    // Shared read-only line list used by all locked modes
    const readOnlyLines = (
      <>
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
      </>
    );

    // ── Mode D: Bekräftad ──────────────────────────────────────────────────────
    if (isBekraftad) {
      return (
        <TooltipProvider>
          <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8 pb-[calc(var(--mode-d-padding,0px)+1rem)]">
            {header}

            {/* Mode D status banner (Clock icon, blue tint) */}
            <div
              className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30"
              role="status"
            >
              <Clock className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden="true" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                Beställningen är bekräftad — väntar på leverans.
              </p>
            </div>

            {readOnlyLines}

            {/* Mode D action: Markera som levererad (apotekare/admin only) */}
            {canDeliver && (
              <Can action="order:deliver">
                <ApotekareActionFooter
                  label="Markera som levererad"
                  onClick={() => setDeliverDialogOpen(true)}
                  isPending={deliverMutation.isPending}
                  loadingLabel="Levererar…"
                />
              </Can>
            )}

            {/* Actor trail — partial (deliveredBy is null in Mode D) */}
            <OrderActorTrail
              createdBy={order.createdBy}
              createdAt={order.createdAt}
              submittedBy={order.submittedBy}
              submittedAt={order.submittedAt}
              confirmedBy={order.confirmedBy ?? null}
              confirmedAt={order.confirmedAt ?? null}
              deliveredBy={order.deliveredBy ?? null}
              deliveredAt={order.deliveredAt ?? null}
            />

            {/* DeliverConfirmDialog — only mounted when canDeliver (sjuksköterska sees no dialog) */}
            {canDeliver && (
              <DeliverConfirmDialog
                open={deliverDialogOpen}
                onOpenChange={setDeliverDialogOpen}
                isDelivering={deliverMutation.isPending}
                onConfirm={async () => {
                  try {
                    await deliverMutation.mutateAsync({ orderId: order.id });
                    // Success: cache hydration flips page to Mode E; close dialog.
                    setDeliverDialogOpen(false);
                  } catch (err: unknown) {
                    // Determine if this is an expected error (409/422/404) or generic.
                    const apiErr = err as { envelope?: { error?: { code?: string } } };
                    const code = apiErr?.envelope?.error?.code;
                    if (
                      code === 'order_transition_invalid' ||
                      code === 'validation_failed' ||
                      code === 'not_found'
                    ) {
                      // Expected errors: close dialog (toast already fired in mutation hook).
                      setDeliverDialogOpen(false);
                    }
                    // Generic errors: dialog stays open so user can retry (UI-SPEC §3 step 5).
                    // The mutation hook already fired a generic toast.
                  }
                }}
              />
            )}
          </div>
        </TooltipProvider>
      );
    }

    // ── Mode E: Levererad (terminal, read-only) ────────────────────────────────
    if (isLevererad) {
      return (
        <TooltipProvider>
          <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8">
            {header}

            {/* Mode E status banner (CheckCircle2 icon, emerald palette) */}
            <div
              className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30"
              role="status"
            >
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                Beställningen är levererad — lagret uppdaterat.
              </p>
            </div>

            {readOnlyLines}

            {/* Full actor trail (all four segments) */}
            <OrderActorTrail
              createdBy={order.createdBy}
              createdAt={order.createdAt}
              submittedBy={order.submittedBy}
              submittedAt={order.submittedAt}
              confirmedBy={order.confirmedBy ?? null}
              confirmedAt={order.confirmedAt ?? null}
              deliveredBy={order.deliveredBy ?? null}
              deliveredAt={order.deliveredAt ?? null}
            />
            {/* Mode E is terminal — NO action button, NO DeliverConfirmDialog (D-76, D-83). */}
          </div>
        </TooltipProvider>
      );
    }

    // ── Mode B (Skickad) / Mode C (Skickad + apotekare) ───────────────────────
    return (
      <TooltipProvider>
        <div className="flex flex-col gap-4 p-4 md:p-6 lg:p-8 pb-[calc(var(--mode-c-padding,0px)+1rem)]">
          {header}

          {/* SubmitConfirmationBanner: role="status" announces on the
              in-session submit transition only (WR-08 — submitMutation.isSuccess
              distinguishes "just submitted" from "loaded a skickad order"). */}
          <SubmitConfirmationBanner
            status={order.status}
            justSubmitted={submitMutation.isSuccess}
          />

          {/* Read-only line list (isLocked=true: no trash, QuantityStepper shows static span) */}
          {readOnlyLines}

          {/* Mode C — Skickad order + apotekare/admin: show Bekräfta beställning button.
              <Can> is the FE UX gate (defense in depth); requirePermission on the BE
              is the security boundary. Sjuksköterska sees no button here (D-15 / T10). */}
          {isSkickad && canConfirm && (
            <Can action="order:confirm">
              <ApotekareActionFooter
                label="Bekräfta beställning"
                onClick={() => void confirmMutation.mutateAsync({ orderId: order.id })}
                isPending={confirmMutation.isPending}
                loadingLabel="Bekräftar…"
              />
            </Can>
          )}
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
