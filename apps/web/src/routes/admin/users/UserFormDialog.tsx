import { useEffect, useState } from 'react';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { ROLES, type Role, type UserResponse, USER_PASSWORD_MIN } from '@meditrack/shared';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/auth/useAuth';
import { generatePassword } from '@/lib/generatePassword';
import { useCreateUser, useUpdateUser } from '@/features/admin/useUsers';

/**
 * Create/edit dialog for /admin/users.
 *
 * One component covers both modes:
 *   - mode='create': all fields blank; password required.
 *   - mode='edit':   name/email/role pre-filled from the row; password
 *                    optional (leave blank to keep the existing hash).
 *
 * Vårdenhet is a Select forward-compatible with multi-vårdenhet but today
 * shows only the admin's own vårdenhet (locked, disabled). That matches the
 * user's request ("we only have 1 but still") — the field is on the form so
 * a future migration to multi-tenant doesn't require a redesign here.
 *
 * Password UX:
 *   - "Generera lösenord" fills the field with a strong random value (see
 *     generatePassword.ts).
 *   - "Visa/dölj" toggles the input between password/text so the admin can
 *     verify or copy the generated value before submitting.
 *   - On create, the password is required (Zod min 12 on the BE; client
 *     mirrors with min=USER_PASSWORD_MIN).
 *   - On edit, blank = no change.
 *
 * Email-collision UX: 409 conflict_duplicate_medication surfaces as an
 * inline Alert inside the dialog (no toast — the toast hook suppresses 409
 * so the dialog can own that message). Other errors fall through to the
 * shared toast.
 */

const ROLE_LABEL: Record<Role, string> = {
  apotekare: 'Apotekare',
  sjukskoterska: 'Sjuksköterska',
  admin: 'Admin',
};

type Mode = 'create' | 'edit';

interface UserFormDialogProps {
  mode: Mode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserResponse;
}

export function UserFormDialog({ mode, open, onOpenChange, user }: UserFormDialogProps) {
  const auth = useAuth();
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser();
  const mutation = mode === 'create' ? createMutation : updateMutation;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('sjukskoterska');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInlineError(null);
    setShowPassword(false);
    if (mode === 'edit' && user) {
      setName(user.name);
      setEmail(user.email);
      setRole(user.role);
      setPassword('');
    } else {
      setName('');
      setEmail('');
      setRole('sjukskoterska');
      setPassword('');
    }
  }, [open, mode, user]);

  if (!auth.user) return null;
  const careUnit = auth.user.careUnit;

  const isPending = mutation.isPending;

  function handleGenerate() {
    setPassword(generatePassword(16));
    setShowPassword(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInlineError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();

    if (!trimmedName) return setInlineError('Namn krävs.');
    if (!trimmedEmail) return setInlineError('E-post krävs.');
    if (mode === 'create' && password.length < USER_PASSWORD_MIN) {
      return setInlineError(
        `Lösenord måste vara minst ${USER_PASSWORD_MIN} tecken.`,
      );
    }
    if (mode === 'edit' && password.length > 0 && password.length < USER_PASSWORD_MIN) {
      return setInlineError(
        `Nytt lösenord måste vara minst ${USER_PASSWORD_MIN} tecken (lämna tomt för att behålla det nuvarande).`,
      );
    }

    try {
      if (mode === 'create') {
        await createMutation.mutateAsync({
          name: trimmedName,
          email: trimmedEmail,
          role,
          password,
          careUnitId: careUnit.id,
        });
      } else if (user) {
        await updateMutation.mutateAsync({
          id: user.id,
          payload: {
            name: trimmedName !== user.name ? trimmedName : undefined,
            email: trimmedEmail !== user.email ? trimmedEmail : undefined,
            role: role !== user.role ? role : undefined,
            password: password.length > 0 ? password : undefined,
          },
        });
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.envelope.error.code === 'conflict_duplicate_medication') {
          setInlineError('E-postadressen används redan.');
          return;
        }
        if (err.envelope.error.code === 'validation_failed') {
          setInlineError('Felaktig indata — kontrollera fälten.');
          return;
        }
      }
      // Fall through to the generic toast handled in the mutation hook.
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {mode === 'create' ? 'Skapa konto' : `Redigera ${user?.name ?? 'konto'}`}
            </DialogTitle>
            <DialogDescription>
              {mode === 'create'
                ? 'Lägg till en användare i din vårdenhet.'
                : 'Uppdatera kontouppgifterna. Lämna lösenordsfältet tomt för att behålla det nuvarande lösenordet.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-1.5">
              <Label htmlFor="user-name">Namn</Label>
              <Input
                id="user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                disabled={isPending}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="user-email">E-post</Label>
              <Input
                id="user-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                disabled={isPending}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="user-role">Roll</Label>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as Role)}
                disabled={isPending}
              >
                <SelectTrigger id="user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="user-careunit">Vårdenhet</Label>
              <Input
                id="user-careunit"
                value={careUnit.name}
                disabled
                readOnly
              />
              <p className="text-xs text-muted-foreground">
                Endast din egen vårdenhet kan väljas i denna version.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="user-password">
                {mode === 'create' ? 'Lösenord' : 'Nytt lösenord (valfritt)'}
              </Label>
              <div className="flex gap-2">
                <Input
                  id="user-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder={
                    mode === 'edit' ? 'Lämna tomt för att behålla nuvarande' : undefined
                  }
                  required={mode === 'create'}
                  minLength={mode === 'create' ? USER_PASSWORD_MIN : 0}
                  disabled={isPending}
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isPending || password.length === 0}
                  aria-label={showPassword ? 'Dölj lösenord' : 'Visa lösenord'}
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" />
                  ) : (
                    <Eye aria-hidden="true" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGenerate}
                  disabled={isPending}
                >
                  <KeyRound aria-hidden="true" />
                  Generera
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Minst {USER_PASSWORD_MIN} tecken. Kopiera och skicka till
                användaren via en säker kanal — lösenordet visas bara här.
              </p>
            </div>

            {inlineError && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{inlineError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Avbryt
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="animate-spin" aria-hidden="true" />}
              {mode === 'create' ? 'Skapa konto' : 'Spara'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
