/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SubmitConfirmationBanner } from '../SubmitConfirmationBanner';

/**
 * Phase 3 D-68 / D-70 / UI-SPEC §12 + WR-08 + Phase 10 D-169 —
 * SubmitConfirmationBanner tests.
 *
 * Verifies the banner renders ONLY when justSubmitted is true AND status is
 * 'skickad' (the WR-08 fix). Deep-link page loads on a skickad order pass
 * justSubmitted=false from the caller and must NOT render the banner —
 * otherwise the role="status" announcement is silently dropped by ATs that
 * don't replay polite regions present on initial page load.
 *
 * Phase 10 D-169 — banner gained a required `orderNumber` prop. Copy is
 * 'Beställning ORD-YYYY-#### är skickad.' (replaces the Phase 3 D-70 copy
 * 'Beställningen är skickad till apotekare.'). Every render call below
 * passes `orderNumber="ORD-2026-0042"` and the copy assertion is updated
 * verbatim against the new locked literal.
 */

const ORDER_NUMBER_FIXTURE = 'ORD-2026-0042';

describe('SubmitConfirmationBanner', () => {
  it('renders with role="status" and the confirmation copy when justSubmitted + status=skickad', () => {
    render(
      <SubmitConfirmationBanner
        status="skickad"
        orderNumber={ORDER_NUMBER_FIXTURE}
        justSubmitted={true}
      />,
    );

    // role="status" triggers non-interrupting SR announcement on mount (UI-SPEC §12)
    const banner = screen.getByRole('status');
    expect(banner).toBeInTheDocument();

    // Phase 10 D-169 — locked Swedish copy now embeds the order number.
    expect(banner).toHaveTextContent('Beställning ORD-2026-0042 är skickad.');
  });

  it('reflects a different orderNumber prop (re-renders with the new identifier)', () => {
    const { rerender } = render(
      <SubmitConfirmationBanner
        status="skickad"
        orderNumber="ORD-2026-0001"
        justSubmitted={true}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Beställning ORD-2026-0001 är skickad.',
    );

    rerender(
      <SubmitConfirmationBanner
        status="skickad"
        orderNumber="ORD-2027-1234"
        justSubmitted={true}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Beställning ORD-2027-1234 är skickad.',
    );
  });

  it('contains bg-primary/10 styling class', () => {
    const { container } = render(
      <SubmitConfirmationBanner
        status="skickad"
        orderNumber={ORDER_NUMBER_FIXTURE}
        justSubmitted={true}
      />,
    );
    const div = container.firstElementChild as HTMLElement;
    expect(div.className).toContain('bg-primary/10');
  });

  it('WR-08: renders nothing when justSubmitted is false (deep-link / refresh case)', () => {
    const { container } = render(
      <SubmitConfirmationBanner
        status="skickad"
        orderNumber={ORDER_NUMBER_FIXTURE}
        justSubmitted={false}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('WR-08: renders nothing when status is not skickad (Phase 4 will widen)', () => {
    const { container } = render(
      <SubmitConfirmationBanner
        status="utkast"
        orderNumber={ORDER_NUMBER_FIXTURE}
        justSubmitted={true}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
