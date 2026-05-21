import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import {
  medicationCreateFromNplRequest,
  medicationCreateUserRequest,
  medicationCreateRequest,
  TOP_MEDICATION_FORMS,
  defaultLowStockThreshold,
  type MedicationListItem,
  type MedicationCreateFromNplRequest,
  type MedicationCreateUserRequest,
  type MedicationCreateRequest,
  type MedicationSearchResult,
} from '@meditrack/shared';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NplBadge } from '@/components/NplBadge';
import { ApiError } from '@/lib/api';
import { useMedicationSearchQuery } from '@/features/medications/useMedicationsQuery';
import { useCreateMedication } from '@/features/medications/useMedicationMutations';

/**
 * Phase 2 D-34 / UI-SPEC §6 — Create / Edit / View Sheet.
 *
 * Slice 1 ships create mode fully functional. Edit and view modes ship in
 * Plan 03 — they render a placeholder message with a Stäng footer for now.
 *
 * Create mode (mode="create"):
 * - Typeahead input searches global Medication via useMedicationSearchQuery
 *   (debounce 150ms). Results shown below the input.
 * - On result select: prefill read-only NPL fields + editable Lager/Tröskel.
 *   source='npl' branch of medicationCreateRequest.
 * - "Skapa nytt läkemedel" CTA expands the full form (source='user' branch).
 * - Footer: Avbryt (ghost) + Spara (default). Spara disabled while submitting.
 * - On 409 conflict: inline error below typeahead (no toast — hook suppresses it).
 *
 * Side: right on md+, bottom on mobile (via useMediaQuery).
 * URL does NOT change when Sheet is open (D-34).
 */

type SheetMode = 'create' | 'edit' | 'view';

interface MedicationSheetProps {
  mode: SheetMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  careUnitMedication?: MedicationListItem;
}

// ---- Typeahead state ----

interface SelectedNplMed {
  id: string;
  name: string;
  atcCode: string;
  form: string;
  strength: string | null;
}

// ---- Debounce hook (inline, no extra dep) ----

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

// ---- Media query hook (right vs bottom sheet side) ----

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

export function MedicationSheet({
  mode,
  open,
  onOpenChange,
  careUnitMedication,
}: MedicationSheetProps) {
  const isDesktop = useIsDesktop();
  const createMutation = useCreateMedication();

  // Typeahead state
  const [typeaheadQ, setTypeaheadQ] = useState('');
  const debouncedQ = useDebounce(typeaheadQ, 150);
  const [selectedNpl, setSelectedNpl] = useState<SelectedNplMed | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);

  // Search query — only fires when debouncedQ is non-empty and no NPL med is selected
  const searchQuery = useMedicationSearchQuery(
    debouncedQ,
    debouncedQ.length > 0 && !selectedNpl,
  );

  // ---- Forms ----

  // NPL path: only Lager + Tröskel are user-entered
  const nplForm = useForm<Pick<MedicationCreateFromNplRequest, 'currentStock' | 'lowStockThreshold'>>({
    defaultValues: { currentStock: 0, lowStockThreshold: 10 },
  });

  // User-created path: full form
  const userForm = useForm<MedicationCreateUserRequest>({
    resolver: zodResolver(medicationCreateUserRequest),
    defaultValues: {
      source: 'user',
      name: '',
      atcCode: '',
      form: '',
      strength: '',
      currentStock: 0,
      lowStockThreshold: 10,
    },
  });

  // Reset on open
  useEffect(() => {
    if (open) {
      setTypeaheadQ('');
      setSelectedNpl(null);
      setShowCreateForm(false);
      setConflictError(null);
      setShowResults(false);
      nplForm.reset({ currentStock: 0, lowStockThreshold: 10 });
      userForm.reset({
        source: 'user',
        name: '',
        atcCode: '',
        form: '',
        strength: '',
        currentStock: 0,
        lowStockThreshold: 10,
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcut: Cmd/Ctrl+Enter submits
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (selectedNpl) {
          void nplForm.handleSubmit(onSubmitNpl)();
        } else if (showCreateForm) {
          void userForm.handleSubmit(onSubmitUser)();
        }
      }
    },
    [selectedNpl, showCreateForm], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ---- Submit handlers ----

  async function onSubmitNpl(values: Pick<MedicationCreateFromNplRequest, 'currentStock' | 'lowStockThreshold'>) {
    if (!selectedNpl) return;
    setConflictError(null);
    const payload: MedicationCreateRequest = {
      source: 'npl',
      medicationId: selectedNpl.id,
      currentStock: Number(values.currentStock),
      lowStockThreshold: Number(values.lowStockThreshold),
    };
    try {
      await createMutation.mutateAsync(payload);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.envelope.error.code === 'conflict_duplicate_medication') {
        setConflictError('Läkemedlet är redan inlagt på din vårdenhet.');
      }
    }
  }

  async function onSubmitUser(values: MedicationCreateUserRequest) {
    setConflictError(null);
    const payload: MedicationCreateRequest = {
      ...values,
      source: 'user',
      currentStock: Number(values.currentStock),
      lowStockThreshold: Number(values.lowStockThreshold),
      strength: values.strength || null,
    };
    try {
      await createMutation.mutateAsync(payload);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.envelope.error.code === 'conflict_duplicate_medication') {
        setConflictError('Läkemedlet är redan inlagt på din vårdenhet.');
      }
    }
  }

  function handleSelectNpl(result: MedicationSearchResult) {
    setSelectedNpl(result);
    setShowResults(false);
    setTypeaheadQ(result.name);
    setShowCreateForm(false);
    // Pre-fill threshold from heuristic (D-40, STK-03)
    const threshold = defaultLowStockThreshold(result.form);
    nplForm.setValue('lowStockThreshold', threshold);
  }

  function handleClearSelection() {
    setSelectedNpl(null);
    setTypeaheadQ('');
    setShowResults(false);
    setConflictError(null);
  }

  const isPending = createMutation.isPending;

  // ---- Edit/View placeholder (Plan 03) ----
  if (mode === 'edit' || mode === 'view') {
    const title = mode === 'view'
      ? `${careUnitMedication?.name ?? ''} · Visning`
      : careUnitMedication?.name ?? '';
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side={isDesktop ? 'right' : 'bottom'}
          className={isDesktop ? 'w-[480px] sm:max-w-xl' : 'max-h-[90dvh] rounded-t-2xl'}
        >
          <SheetHeader>
            <SheetTitle className="truncate max-w-[360px]">{title}</SheetTitle>
          </SheetHeader>
          <div className="p-4 text-sm text-muted-foreground">
            Redigeringsläge implementeras i nästa skiva.
          </div>
          <SheetFooter className="border-t border-border p-4 pb-[calc(1rem+56px+env(safe-area-inset-bottom))]">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Stäng
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  // ---- Create mode ----
  const results = searchQuery.data?.results ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isDesktop ? 'right' : 'bottom'}
        className={isDesktop ? 'w-[480px] sm:max-w-xl overflow-y-auto flex flex-col' : 'max-h-[90dvh] rounded-t-2xl overflow-y-auto flex flex-col'}
        onKeyDown={handleKeyDown}
      >
        <SheetHeader>
          <SheetTitle>Lägg till läkemedel</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Typeahead input */}
          {!showCreateForm && (
            <div className="space-y-1 relative">
              <Label htmlFor="typeahead-q">Sök läkemedel från NPL</Label>
              <div className="flex gap-2">
                <Input
                  id="typeahead-q"
                  placeholder="Sök läkemedel från NPL…"
                  value={typeaheadQ}
                  autoFocus
                  onChange={(e) => {
                    setTypeaheadQ(e.target.value);
                    setShowResults(true);
                    if (selectedNpl) setSelectedNpl(null);
                    setConflictError(null);
                  }}
                  onFocus={() => {
                    if (debouncedQ.length > 0) setShowResults(true);
                  }}
                  disabled={isPending}
                />
                {selectedNpl && (
                  <Button variant="ghost" size="sm" onClick={handleClearSelection} type="button">
                    Byt
                  </Button>
                )}
              </div>

              {/* Conflict error */}
              {conflictError && (
                <p className="text-xs text-destructive mt-1">{conflictError}</p>
              )}

              {/* Typeahead dropdown */}
              {showResults && debouncedQ.length > 0 && !selectedNpl && (
                <div className="absolute left-0 right-0 top-full z-50 mt-1 bg-card border border-border rounded-md shadow-lg max-h-[240px] overflow-y-auto">
                  {searchQuery.isLoading && (
                    <div className="flex items-center gap-2 p-3 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Söker…
                    </div>
                  )}
                  {!searchQuery.isLoading && results.length === 0 && (
                    <div className="p-3 text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
                      Inget läkemedel matchade.
                      <Button
                        variant="link"
                        className="ml-1 p-0 h-auto text-sm"
                        onClick={() => {
                          setShowCreateForm(true);
                          setShowResults(false);
                        }}
                        type="button"
                      >
                        Skapa nytt läkemedel
                      </Button>
                    </div>
                  )}
                  {results.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                      onClick={() => handleSelectNpl(r)}
                    >
                      {r.name} — {r.atcCode} — {r.form}
                      {r.strength ? ` — ${r.strength}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NPL selected — show read-only fields + editable Lager/Tröskel */}
          {selectedNpl && !showCreateForm && (
            <form
              id="npl-create-form"
              onSubmit={nplForm.handleSubmit(onSubmitNpl)}
              className="space-y-4"
            >
              <NplBadge>Från NPL · namn / form / styrka är låsta</NplBadge>

              <div className="space-y-3">
                <div>
                  <Label>Namn</Label>
                  <p className="text-sm text-foreground mt-1">{selectedNpl.name}</p>
                </div>
                <div>
                  <Label>ATC-kod</Label>
                  <p className="text-sm text-foreground mt-1">{selectedNpl.atcCode}</p>
                </div>
                <div>
                  <Label>Form</Label>
                  <p className="text-sm text-foreground mt-1">{selectedNpl.form}</p>
                </div>
                {selectedNpl.strength && (
                  <div>
                    <Label>Styrka</Label>
                    <p className="text-sm text-foreground mt-1">{selectedNpl.strength}</p>
                  </div>
                )}
                <div>
                  <Label htmlFor="npl-stock">Lager</Label>
                  <Input
                    id="npl-stock"
                    type="number"
                    min={0}
                    {...nplForm.register('currentStock', { valueAsNumber: true })}
                    disabled={isPending}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="npl-threshold">Tröskel</Label>
                  <Input
                    id="npl-threshold"
                    type="number"
                    min={1}
                    {...nplForm.register('lowStockThreshold', { valueAsNumber: true })}
                    disabled={isPending}
                    className="mt-1"
                  />
                </div>
              </div>
            </form>
          )}

          {/* "Skapa nytt läkemedel" expanded form */}
          {showCreateForm && (
            <form
              id="user-create-form"
              onSubmit={userForm.handleSubmit(onSubmitUser)}
              className="space-y-4"
            >
              <p className="text-sm font-semibold">Skapa nytt läkemedel</p>

              <div className="space-y-3">
                <div>
                  <Label htmlFor="user-name">Namn</Label>
                  <Input
                    id="user-name"
                    autoFocus
                    {...userForm.register('name')}
                    disabled={isPending}
                    className="mt-1"
                  />
                  {userForm.formState.errors.name && (
                    <p className="text-xs text-destructive mt-1">
                      {userForm.formState.errors.name.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="user-atc">ATC-kod</Label>
                  <Input
                    id="user-atc"
                    {...userForm.register('atcCode')}
                    disabled={isPending}
                    className="mt-1"
                  />
                  {userForm.formState.errors.atcCode && (
                    <p className="text-xs text-destructive mt-1">
                      {userForm.formState.errors.atcCode.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="user-form">Form</Label>
                  <select
                    id="user-form"
                    {...userForm.register('form', {
                      onChange: (e) => {
                        const threshold = defaultLowStockThreshold(e.target.value);
                        userForm.setValue('lowStockThreshold', threshold);
                      },
                    })}
                    disabled={isPending}
                    className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <option value="">Välj form…</option>
                    {TOP_MEDICATION_FORMS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                    <option value="Övriga">Övriga</option>
                  </select>
                  {userForm.formState.errors.form && (
                    <p className="text-xs text-destructive mt-1">
                      {userForm.formState.errors.form.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="user-strength">Styrka (valfri)</Label>
                  <Input
                    id="user-strength"
                    {...userForm.register('strength')}
                    disabled={isPending}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="user-stock">Lager</Label>
                  <Input
                    id="user-stock"
                    type="number"
                    min={0}
                    {...userForm.register('currentStock', { valueAsNumber: true })}
                    disabled={isPending}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="user-threshold">Tröskel</Label>
                  <Input
                    id="user-threshold"
                    type="number"
                    min={1}
                    {...userForm.register('lowStockThreshold', { valueAsNumber: true })}
                    disabled={isPending}
                    className="mt-1"
                  />
                </div>
              </div>

              {conflictError && (
                <p className="text-xs text-destructive">{conflictError}</p>
              )}
            </form>
          )}
        </div>

        <SheetFooter className="border-t border-border p-4 flex items-center justify-end gap-2 pb-[calc(1rem+56px+env(safe-area-inset-bottom))]">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            type="button"
          >
            Avbryt
          </Button>
          {(selectedNpl || showCreateForm) && (
            <Button
              type="submit"
              form={selectedNpl ? 'npl-create-form' : 'user-create-form'}
              disabled={isPending}
            >
              {isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sparar…
                </>
              ) : (
                'Spara'
              )}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
