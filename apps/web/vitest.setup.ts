import '@testing-library/jest-dom';

// Mock window.matchMedia — jsdom does not implement it.
// useIsDesktop (and MedicationSheet) reads matchMedia to pick Sheet side.
// Tests that run inside jsdom will throw unless this stub is present.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// Mock ResizeObserver — jsdom does not implement it. cmdk (used by
// TherapeuticClassCombobox's Command/CommandList) calls
// `new ResizeObserver(...)` on mount; without this stub the combobox
// throws at render time in any Phase 6 MedicationSheet AI test that
// exercises the override path.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub;

// Mock Element.hasPointerCapture / scrollIntoView — Radix Popover +
// Command primitives use both during open/close, neither exists in jsdom.
if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = function () {
      return false;
    };
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function () {};
  }
}
