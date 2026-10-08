import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
import { vi } from 'vitest';

vi.mock('@formkit/auto-animate/react', () => ({
  useAutoAnimate: () => [() => {}, () => {}],
}));
