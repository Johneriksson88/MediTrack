/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { DiscardDraftDialog } from '../DiscardDraftDialog';

/**
 * Phase 3 D-67 / D-70 / UI-SPEC §10 — DiscardDraftDialog component tests.
 *
 * (1) Dialog opens when open={true} — shows title, description, Cancel, Kasta
 * (2) Clicking Avbryt calls onOpenChange(false)
 * (3) Clicking Kasta fires onConfirm
 * (4) When isDeleting={true}: action shows "Kastar…" spinner + is disabled
 */

describe('DiscardDraftDialog', () => {
  it('(1) renders dialog content when open={true}', () => {
    render(
      <DiscardDraftDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isDeleting={false}
      />,
    );

    // Title (D-70)
    expect(screen.getByText('Kasta detta utkast?')).toBeInTheDocument();
    // Description (D-70)
    expect(screen.getByText('Utkastet tas bort permanent.')).toBeInTheDocument();
    // Cancel button (D-70)
    expect(screen.getByRole('button', { name: /avbryt/i })).toBeInTheDocument();
    // Action button (D-70)
    expect(screen.getByRole('button', { name: /^kasta$/i })).toBeInTheDocument();
  });

  it('(2) clicking Avbryt calls onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    render(
      <DiscardDraftDialog
        open={true}
        onOpenChange={onOpenChange}
        onConfirm={vi.fn()}
        isDeleting={false}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /avbryt/i }));
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('(3) clicking Kasta action fires onConfirm', () => {
    const onConfirm = vi.fn();
    render(
      <DiscardDraftDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={onConfirm}
        isDeleting={false}
      />,
    );

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /^kasta$/i }));
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('(4) when isDeleting={true} action shows "Kastar…" and is disabled', () => {
    render(
      <DiscardDraftDialog
        open={true}
        onOpenChange={vi.fn()}
        onConfirm={vi.fn()}
        isDeleting={true}
      />,
    );

    // The action button should be disabled
    const actionBtn = screen.getByRole('button', { name: /kastar/i });
    expect(actionBtn).toBeDisabled();
    // Shows "Kastar…" text
    expect(actionBtn).toHaveTextContent('Kastar…');
  });
});
