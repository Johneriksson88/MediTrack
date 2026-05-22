/**
 * Phase 4 D-83 / UI-SPEC §5 — Shared actor + timestamp trail line.
 *
 * Renders a compact text line showing who performed each lifecycle transition
 * and when. Segments are conditional — only populated trios render.
 * This means a Bekräftad order (Mode D) shows Skapad/Skickad/Bekräftad
 * but not Levererad; a Levererad order (Mode E) shows all four.
 *
 * Format: 'Skapad av {name} {HH:mm} · Skickad av {name} {HH:mm} · ...'
 * Time formatted as HH:mm via Intl.DateTimeFormat (no date-fns dependency;
 * mirrors DraftCard.tsx's T-03-SC decision to avoid new packages).
 * Separator: ' · ' (space + U+00B7 + space).
 *
 * Used by ComposeOrderPage in Mode D (partial — deliveredBy is null) and Mode E (full).
 */

interface ActorRef {
  id: string;
  name: string;
}

export interface OrderActorTrailProps {
  createdBy: ActorRef;
  createdAt: string;
  submittedBy: ActorRef | null;
  submittedAt: string | null;
  confirmedBy: ActorRef | null;
  confirmedAt: string | null;
  deliveredBy: ActorRef | null;
  deliveredAt: string | null;
}

/** Format ISO timestamp as HH:mm (24-hour clock, sv-SE locale). */
function timeLabel(timestamp: string): string {
  return new Intl.DateTimeFormat('sv-SE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function OrderActorTrail({
  createdBy,
  createdAt,
  submittedBy,
  submittedAt,
  confirmedBy,
  confirmedAt,
  deliveredBy,
  deliveredAt,
}: OrderActorTrailProps) {
  const segments: string[] = [];

  // Always present
  segments.push(`Skapad av ${createdBy.name} ${timeLabel(createdAt)}`);

  // Conditional: only if the order has been submitted
  if (submittedBy && submittedAt) {
    segments.push(`Skickad av ${submittedBy.name} ${timeLabel(submittedAt)}`);
  }

  // Conditional: only if the order has been confirmed
  if (confirmedBy && confirmedAt) {
    segments.push(`Bekräftad av ${confirmedBy.name} ${timeLabel(confirmedAt)}`);
  }

  // Conditional: only if the order has been delivered
  if (deliveredBy && deliveredAt) {
    segments.push(`Levererad av ${deliveredBy.name} ${timeLabel(deliveredAt)}`);
  }

  return (
    <p className="text-xs text-muted-foreground flex flex-wrap gap-x-1 gap-y-1 mt-4">
      {segments.map((segment, i) => (
        <span key={i}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          {segment}
        </span>
      ))}
    </p>
  );
}
