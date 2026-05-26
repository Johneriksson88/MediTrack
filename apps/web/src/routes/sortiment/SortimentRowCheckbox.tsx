interface SortimentRowCheckboxProps {
  checked: boolean;
  onChange: () => void;
  ariaLabel: string;
}

/**
 * Plain styled checkbox row primitive. Same posture as the
 * RestockLowStockDialog list checkbox — bare <input type="checkbox"> with
 * `accent-primary`, no Radix wrapper. Centralized here so the table-row
 * checkbox and the header "select all" checkbox stay visually aligned.
 *
 * The wrapping <label> swallows row-click propagation so checking a box
 * does not navigate / open the Sheet.
 */
export function SortimentRowCheckbox({ checked, onChange, ariaLabel }: SortimentRowCheckboxProps) {
  return (
    <label
      className="inline-flex h-full w-full cursor-pointer items-center justify-center"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={ariaLabel}
        className="h-4 w-4 cursor-pointer accent-primary"
      />
    </label>
  );
}
