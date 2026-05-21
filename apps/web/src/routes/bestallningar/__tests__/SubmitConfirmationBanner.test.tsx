/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubmitConfirmationBanner } from '../SubmitConfirmationBanner';

/**
 * Phase 3 D-68 / D-70 / UI-SPEC §12 — SubmitConfirmationBanner tests.
 *
 * Verifies the banner renders with role="status" (non-interrupting SR announcement)
 * and the locked Swedish copy.
 */

describe('SubmitConfirmationBanner', () => {
  it('renders with role="status" and the confirmation copy', () => {
    render(<SubmitConfirmationBanner />);

    // role="status" triggers non-interrupting SR announcement on mount (UI-SPEC §12)
    const banner = screen.getByRole('status');
    expect(banner).toBeInTheDocument();

    // Locked Swedish copy (D-70)
    expect(banner).toHaveTextContent('Beställningen är skickad till apotekare.');
  });

  it('contains bg-primary/10 styling class', () => {
    const { container } = render(<SubmitConfirmationBanner />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('bg-primary/10');
  });
});
