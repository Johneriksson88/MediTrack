import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  UserCreateRequest,
  UserListResponse,
  UserResponse,
  UserUpdateRequest,
} from '@meditrack/shared';
import { fetchJson, type ApiError } from '@/lib/api';

/**
 * Hooks for the /admin/users surface.
 *
 * Queries:
 *   useUsersQuery — GET /api/admin/users. Cached under ['admin', 'users'].
 *
 * Mutations (all invalidate ['admin', 'users'] on success; the audit log key
 * ['audit'] is invalidated too so a recently-promoted admin sees their own
 * mutation appear on /admin/audit without a manual refresh):
 *   useCreateUser — POST /api/admin/users
 *   useUpdateUser — PATCH /api/admin/users/:id
 *   useDeleteUser — DELETE /api/admin/users/:id
 *
 * Toast policy mirrors useMedicationMutations: success toasts on every path,
 * generic failure toast except for known envelope codes the caller wants to
 * surface inline (conflict_duplicate_medication = email taken;
 * user_delete_blocked = self-delete or has-history; both display the BE
 * message verbatim because the Swedish copy is already user-facing).
 */

export function useUsersQuery() {
  return useQuery<UserResponse[]>({
    queryKey: ['admin', 'users'],
    queryFn: async () => {
      const { users } = await fetchJson<UserListResponse>('/api/admin/users');
      return users;
    },
  });
}

function invalidateUserSurfaces(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
  void queryClient.invalidateQueries({ queryKey: ['audit'] });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation<UserResponse, ApiError, UserCreateRequest>({
    mutationFn: (body) =>
      fetchJson<UserResponse>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      invalidateUserSurfaces(queryClient);
      toast.success('Konto skapat');
    },
    onError: (err) => {
      // 409 from a unique-email collision — the dialog surfaces it inline.
      if (err.envelope.error.code === 'conflict_duplicate_medication') return;
      toast.error('Kunde inte skapa kontot — försök igen.');
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation<
    UserResponse,
    ApiError,
    { id: string; payload: UserUpdateRequest }
  >({
    mutationFn: ({ id, payload }) =>
      fetchJson<UserResponse>(`/api/admin/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      invalidateUserSurfaces(queryClient);
      toast.success('Sparat');
    },
    onError: (err) => {
      if (err.envelope.error.code === 'conflict_duplicate_medication') return;
      toast.error('Kunde inte spara — försök igen.');
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string; name: string }>({
    mutationFn: ({ id }) =>
      fetchJson<void>(`/api/admin/users/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, { name }) => {
      invalidateUserSurfaces(queryClient);
      toast.success(`${name} togs bort.`);
    },
    onError: (err) => {
      // BE message is already user-facing Swedish ("Du kan inte ta bort ditt
      // eget konto." / "Användaren har historiska beställningar ...").
      if (err.envelope.error.code === 'user_delete_blocked') {
        toast.error(err.envelope.error.message);
        return;
      }
      toast.error('Kunde inte ta bort — försök igen.');
    },
  });
}
