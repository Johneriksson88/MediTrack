import { Link2 } from 'lucide-react';
import { toast } from 'sonner';
import type { AuditEventResponse } from '@meditrack/shared';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { RequestIdGroupChip } from '@/components/RequestIdGroupChip';
import { computeChangedKeys } from './auditDiffSummary';

/**
 * Phase 5 UI-SPEC §5 / D-95 / D-104 — Audit-event diff panel.
 *
 * Renders the Fält / Före / Efter triplet table inside the expanded row
 * (md+) or inside the expanded card (<md). The diff is computed at READ
 * time per D-95 — `before` and `after` are full allowlist-filtered
 * snapshots; this component intersects keys with JSON.stringify equality
 * and renders only the changes.
 *
 * Layout:
 *   - Header (flex justify-between):
 *       left: <RequestIdGroupChip> when siblingCount > 1 OR requestId set
 *       right: ISO timestamp (text-xs font-mono)
 *   - Diff <Table>: Fält | Före | Efter (locked widths)
 *   - Footer (flex justify-end): <Button variant="ghost"> "Kopiera permalink"
 *
 * Value rendering rules per UI-SPEC §5:
 *   string/number/boolean/Date → font-mono whitespace-pre-wrap break-all
 *   null                        → italic muted "null"
 *   object/array                → <pre> with JSON.stringify(., null, 2)
 *   sentinel '—'                → muted em dash
 *
 * Copy permalink (D-104): builds the canonical filtered URL for THIS
 * event (actor + action + requestId, empty params stripped), writes to
 * clipboard, fires sonner toast. URL contains no `before`/`after`
 * payload — only filter coordinates (T-05-09 disposition: accept).
 */

const VALUE_CELL_WRAPPER =
  'text-sm font-mono text-foreground whitespace-pre-wrap break-all max-w-[280px]';

function ValueCell({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-sm text-muted-foreground italic">null</span>;
  }
  if (value === '—') {
    return <span className="text-muted-foreground">—</span>;
  }
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return <span className={VALUE_CELL_WRAPPER}>{String(value)}</span>;
  }
  // object / array — render as pretty JSON inside a <pre>
  return (
    <pre className="text-xs font-mono whitespace-pre-wrap break-all max-w-[280px]">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

interface DiffRow {
  field: string;
  before: unknown;
  after: unknown;
}

function buildDiffRows(event: AuditEventResponse): DiffRow[] {
  const before = (event.before ?? null) as Record<string, unknown> | null;
  const after = (event.after ?? null) as Record<string, unknown> | null;

  // CREATE — render every key from `after`
  if (!before && after) {
    return Object.keys(after).map((field) => ({
      field,
      before: '—',
      after: after[field],
    }));
  }

  // DELETE — render every key from `before`
  if (before && !after) {
    return Object.keys(before).map((field) => ({
      field,
      before: before[field],
      after: '—',
    }));
  }

  // UPDATE — only changed keys
  if (before && after) {
    const changed = computeChangedKeys(before, after);
    if (changed.length === 0) {
      return [{ field: '(ingen ändring)', before: '—', after: '—' }];
    }
    return changed.map((field) => ({
      field,
      before: before[field],
      after: after[field],
    }));
  }

  return [];
}

export interface AuditDiffPanelProps {
  event: AuditEventResponse;
  /**
   * Number of events in the current loaded page set that share this
   * event's requestId. Computed at the parent (Table/CardList) level
   * by scanning data.pages.flatMap(...). A siblingCount > 1 surfaces
   * the RequestIdGroupChip in the panel header per D-104.
   */
  siblingCount?: number;
}

export function AuditDiffPanel({ event, siblingCount = 1 }: AuditDiffPanelProps) {
  const rows = buildDiffRows(event);

  function copyPermalink() {
    // Build the canonical filtered URL — only include filter params that
    // are non-empty on the event. The URL re-renders a list containing
    // this event (T-05-11 disposition: accept — permalink is a filtered
    // list URL, not a single-event-view forgery target).
    const params = new URLSearchParams();
    if (event.actorUserId) params.set('actor', event.actorUserId);
    if (event.action) params.set('action', event.action);
    if (event.requestId) params.set('requestId', event.requestId);

    const url = `${window.location.origin}/admin/audit${
      params.toString() ? `?${params.toString()}` : ''
    }`;

    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      const p = navigator.clipboard.writeText(url);
      p.then(() => toast.success('Permalink kopierad.'))
        .catch(() => toast.error('Kunde inte kopiera permalink.'));
    } else {
      toast.error('Kunde inte kopiera permalink.');
    }
  }

  return (
    <div role="region" aria-label="Detaljer för händelse">
      {/* Header — requestId-group chip (left) + full ISO timestamp (right) */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          {event.requestId && siblingCount > 1 && (
            <RequestIdGroupChip
              requestId={event.requestId}
              siblingCount={siblingCount}
            />
          )}
        </div>
        <span className="text-xs font-mono text-muted-foreground">
          {event.createdAt}
        </span>
      </div>

      {/* Diff table */}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-transparent hover:bg-transparent">
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[180px]">
                Fält
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[200px]">
                Före
              </TableHead>
              <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide min-w-[200px]">
                Efter
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.field} className="hover:bg-transparent">
                <TableCell className="px-4 py-2 text-sm font-semibold text-foreground align-top">
                  {row.field}
                </TableCell>
                <TableCell className="px-4 py-2 align-top">
                  <ValueCell value={row.before} />
                </TableCell>
                <TableCell className="px-4 py-2 align-top">
                  <ValueCell value={row.after} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Footer — Kopiera permalink */}
      <div className="flex justify-end mt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={copyPermalink}
          type="button"
        >
          <Link2 className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
          Kopiera permalink
        </Button>
      </div>
    </div>
  );
}
