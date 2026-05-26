import { useState } from 'react';
import { Pencil, Plus, Trash2, UserPlus } from 'lucide-react';
import type { UserResponse } from '@meditrack/shared';

import { useAuth } from '@/auth/useAuth';
import { Button } from '@/components/ui/button';
import { EmptyStateCard } from '@/components/EmptyStateCard';
import { RoleBadge } from '@/components/RoleBadge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { SortableTableHead } from '@/components/ui/sortable-table-head';
import { useTableSort } from '@/lib/useTableSort';
import { useDocumentTitle } from '@/lib/useDocumentTitle';

import { useUsersQuery } from '@/features/admin/useUsers';
import { UserFormDialog } from './UserFormDialog';
import { DeleteUserDialog } from './DeleteUserDialog';

/**
 * /admin/users — admin-only CRUD for User accounts in the caller's vårdenhet.
 *
 * Surface:
 *   - "Skapa konto" primary button (top right) opens the create dialog.
 *   - Sortable table: Namn, E-post, Roll, Skapad, Åtgärd.
 *   - Per-row actions: Redigera (opens edit dialog) + Ta bort (alert).
 *
 * The current admin's own row is annotated "(du)" and the Ta bort button
 * disabled — the BE refuses self-delete too (see user.service.ts), this is
 * just a friendlier UX than letting the click round-trip into a 409 toast.
 */

type SortKey = 'name' | 'email' | 'role' | 'createdAt';

export function UsersPage() {
  useDocumentTitle('Användare — MediTrack');
  const auth = useAuth();
  const usersQuery = useUsersQuery();
  const sort = useTableSort<SortKey>({ key: 'createdAt', dir: 'desc' });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<UserResponse | null>(null);
  const [deleting, setDeleting] = useState<UserResponse | null>(null);

  const rows = usersQuery.data ?? [];
  const sortedRows = sort.applyTo(rows, (row, key) => row[key]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold leading-tight">Användare</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Hantera konton i {auth.user?.careUnit.name ?? 'din vårdenhet'}.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="min-h-[44px]">
          <UserPlus aria-hidden="true" />
          Skapa konto
        </Button>
      </div>

      {usersQuery.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </div>
      )}

      {!usersQuery.isLoading && rows.length === 0 && (
        <EmptyStateCard
          icon={Plus}
          heading="Inga konton ännu"
          body="Lägg till den första användaren med knappen ovan."
        />
      )}

      {!usersQuery.isLoading && rows.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <SortableTableHead
                  ariaSort={sort.ariaSort('name')}
                  onClick={() => sort.toggle('name')}
                  className="min-w-[180px]"
                >
                  Namn
                </SortableTableHead>
                <SortableTableHead
                  ariaSort={sort.ariaSort('email')}
                  onClick={() => sort.toggle('email')}
                  className="min-w-[200px]"
                >
                  E-post
                </SortableTableHead>
                <SortableTableHead
                  ariaSort={sort.ariaSort('role')}
                  onClick={() => sort.toggle('role')}
                  className="w-[140px]"
                >
                  Roll
                </SortableTableHead>
                <SortableTableHead
                  ariaSort={sort.ariaSort('createdAt')}
                  onClick={() => sort.toggle('createdAt')}
                  className="w-[160px]"
                >
                  Skapad
                </SortableTableHead>
                <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wide w-[140px] text-right">
                  Åtgärd
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((u) => {
                const isSelf = u.id === auth.user?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name}
                      {isSelf && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          (du)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email}
                    </TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {new Date(u.createdAt).toLocaleDateString('sv-SE')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditing(u)}
                          aria-label={`Redigera ${u.name}`}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleting(u)}
                          aria-label={`Ta bort ${u.name}`}
                          disabled={isSelf}
                          title={
                            isSelf
                              ? 'Du kan inte ta bort ditt eget konto.'
                              : undefined
                          }
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <UserFormDialog
        mode="create"
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <UserFormDialog
        mode="edit"
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        user={editing ?? undefined}
      />
      <DeleteUserDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        user={deleting}
      />
    </div>
  );
}
