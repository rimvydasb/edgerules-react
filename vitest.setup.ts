import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// `vitest.config.ts` runs with `globals: false`, so React Testing Library's own auto-cleanup
// (which only registers if it finds a global `afterEach`) never kicks in — do it explicitly.
afterEach(() => {
  cleanup();
});

// CodeMirror's layout measurement uses Range.getClientRects, which jsdom does not implement.
// A zero-rect polyfill keeps the measure cycle harmless in tests.
const zeroRect: DOMRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
};

Range.prototype.getBoundingClientRect = () => zeroRect;
Range.prototype.getClientRects = () => {
  const rects: DOMRect[] & { item?: (index: number) => DOMRect | null } = [];
  rects.item = (index: number) => rects[index] ?? null;
  return rects as unknown as DOMRectList;
};
