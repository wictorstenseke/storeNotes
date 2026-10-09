import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no Web Animations API.
vi.mock('@formkit/auto-animate/react', () => ({
  useAutoAnimate: () => [() => {}, () => {}],
}));

// jsdom has no matchMedia. Light system theme unless a test overrides it.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
}

afterEach(() => {
  cleanup();
  // Tests that run in the node environment have no localStorage.
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
