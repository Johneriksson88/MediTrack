/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrderStatusPill } from '../OrderStatusPill';

/**
 * Phase 3 D-68 / UI-SPEC §11 — OrderStatusPill component tests.
 *
 * Verifies all four statuses render with correct label text and
 * the expected Tailwind bg-* color token from the STATUS_CLASS map.
 */

describe('OrderStatusPill', () => {
  it('renders "Utkast" with slate background for status=utkast', () => {
    const { container } = render(<OrderStatusPill status="utkast" />);
    const span = screen.getByText('Utkast');
    expect(span).toBeInTheDocument();
    expect(span.className).toContain('bg-slate-100');
    expect(container.firstChild).toBeInTheDocument();
  });

  it('renders "Skickad" with blue background for status=skickad', () => {
    render(<OrderStatusPill status="skickad" />);
    const span = screen.getByText('Skickad');
    expect(span).toBeInTheDocument();
    expect(span.className).toContain('bg-blue-100');
  });

  it('renders "Bekräftad" with amber background for status=bekraftad', () => {
    render(<OrderStatusPill status="bekraftad" />);
    const span = screen.getByText('Bekräftad');
    expect(span).toBeInTheDocument();
    expect(span.className).toContain('bg-amber-100');
  });

  it('renders "Levererad" with emerald background for status=levererad', () => {
    render(<OrderStatusPill status="levererad" />);
    const span = screen.getByText('Levererad');
    expect(span).toBeInTheDocument();
    expect(span.className).toContain('bg-emerald-100');
  });
});
