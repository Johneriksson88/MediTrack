import { Link } from 'react-router-dom';
import { Link2 } from 'lucide-react';

/**
 * Phase 5 UI-SPEC §8 / D-104 — RequestId group chip.
 *
 * Renders inside the AuditDiffPanel header when sibling events share a
 * `requestId` (the 1+N deliver fan-out shape). Clicking the chip navigates
 * to `/admin/audit?requestId=<full-uuid>`, filtering the list to the
 * sibling cohort — the forensic deep-link D-104 promises.
 *
 * Pluralization: `händelser` used unconditionally; Swedish doesn't decline
 * for N=1 in this context (mirrors Phase 3 `{N} rader`).
 */
export interface RequestIdGroupChipProps {
  requestId: string;
  siblingCount: number;
}

export function RequestIdGroupChip({ requestId, siblingCount }: RequestIdGroupChipProps) {
  const last8 = requestId.slice(-8);
  return (
    <Link
      to={`/admin/audit?requestId=${encodeURIComponent(requestId)}`}
      className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground
                 hover:bg-muted/80 hover:text-foreground px-3 py-1 text-xs font-semibold
                 border border-border transition-colors focus-visible:outline-none
                 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      <Link2 className="h-3 w-3" aria-hidden="true" />
      Del av begäran {last8} · {siblingCount} händelser
    </Link>
  );
}
