/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubmitConfirmationBanner } from '../SubmitConfirmationBanner';

/**
 * Phase 3 D-68 / D-70 / UI-SPEC §12 + WR-08 — SubmitConfirmationBanner tests.
 *
 * Verifies the banner renders ONLY when justSubmitted is true AND status is
 * 'skickad' (the WR-08 fix). Deep-link page loads on a skickad order pass
 * justSubmitted=false from the caller and must NOT render the banner —
 * otherwise the role="status" announcement is silently dropped by ATs that
 * don't replay polite regions present on initial page load.
 */

describe('SubmitConfirmationBanner', () => {
  it('renders with role="status" and the confirmation copy when justSubmitted + status=skickad', () => {
    render(<SubmitConfirmationBanner status="skickad" justSubmitted={true} />);

    // role="status" triggers non-interrupting SR announcement on mount (UI-SPEC §12)
    const banner = screen.getByRole('status');
    expect(banner).toBeInTheDocument();

    // Locked Swedish copy (D-70)
    expect(banner).toHaveTextContent('Beställningen är skickad till apotekare.');
  });

  it('contains bg-primary/10 styling class', () => {
    const { container } = render(
      <SubmitConfirmationBanner status="skickad" justSubmitted={true} />,
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('bg-primary/10');
  });

  it('WR-08: renders nothing when justSubmitted is false (deep-link / refresh case)', () => {
    const { container } = render(
      <SubmitConfirmationBanner status="skickad" justSubmitted={false} />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('WR-08: renders nothing when status is not skickad (Phase 4 will widen)', () => {
    const { container } = render(
      <SubmitConfirmationBanner status="utkast" justSubmitted={true} />,
    );
    expect(container.firstChild).toBeNull();
  });
});
