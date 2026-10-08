import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom has no Web Animations API.
vi.mock('@formkit/auto-animate/react', () => ({
  useAutoAnimate: () => [() => {}, () => {}],
}));

afterEach(() => {
  cleanup();
  // Tests that run in the node environment have no localStorage.
  if (typeof localStorage !== 'undefined') localStorage.clear();
});
