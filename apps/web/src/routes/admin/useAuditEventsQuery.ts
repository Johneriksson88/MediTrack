import { useInfiniteQuery } from '@tanstack/react-query';
import type { AuditEventListResponse } from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Phase 5 D-69 / D-105 — cursor-paginated infinite query for the audit log.
 *
 * First use of `useInfiniteQuery` in this repo. The BE returns
 * `{events, nextCursor}` where `nextCursor` is a base64-encoded
 * `{createdAt, id}` pair. `getNextPageParam` reads the cursor from
 * the last loaded page; TanStack handles the rest.
 *
 * Query key: `['audit', 'events', filters]` (D-69) where `filters` is
 * a stable object of `{actorUserId, entityType, action, requestId}`.
 *
 * Sort: `createdAt DESC, id DESC` (BE-locked, D-105).
 */

export interface AuditEventsFilters {
  actorUserId?: string;
  entityType?: string;
  action?: string;
  requestId?: string;
}

function buildQueryString(
  filters: AuditEventsFilters,
  cursor: string | null,
  limit: number,
): string {
  const params = new URLSearchParams();
  if (filters.actorUserId) params.set('actorUserId', filters.actorUserId);
  if (filters.entityType) params.set('entityType', filters.entityType);
  if (filters.action) params.set('action', filters.action);
  if (filters.requestId) params.set('requestId', filters.requestId);
  if (cursor) params.set('cursor', cursor);
  params.set('limit', String(limit));
  return params.toString();
}

const PAGE_SIZE = 50;

export function useAuditEventsQuery(filters: AuditEventsFilters) {
  return useInfiniteQuery<AuditEventListResponse, ApiError>({
    queryKey: ['audit', 'events', filters],
    queryFn: ({ pageParam }) =>
      fetchJson<AuditEventListResponse>(
        `/api/audit/events?${buildQueryString(filters, pageParam as string | null, PAGE_SIZE)}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
}
