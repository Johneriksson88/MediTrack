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
