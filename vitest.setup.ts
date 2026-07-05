import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// `vitest.config.ts` runs with `globals: false`, so React Testing Library's own auto-cleanup
// (which only registers if it finds a global `afterEach`) never kicks in — do it explicitly.
afterEach(() => {
  cleanup();
});
