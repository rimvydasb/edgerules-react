import type { ListenerSet } from '../../../lib/changeBatch';

// What the session hands a store: where its subscribers live, and a hook it calls after every real change.
export interface StoreContext {
  listeners: () => ListenerSet;
  onChange: () => void;
}

// True when `path` is `from` itself or nested in it.
export function isAtOrUnder(path: string, from: string): boolean {
  return path === from || path.startsWith(`${from}.`);
}

export function movePath(path: string, from: string, to: string): string {
  return to + path.slice(from.length);
}

// Rewrites the keys at or under `from`; returns undefined when no key moved.
export function moveKeys<T>(record: Record<string, T>, from: string, to: string): Record<string, T> | undefined {
  let moved = false;
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (isAtOrUnder(key, from)) {
      moved = true;
      next[movePath(key, from, to)] = value;
    } else {
      next[key] = value;
    }
  }
  return moved ? next : undefined;
}

// Slice documents are plain JSON, so their serialization is a sufficient equality test.
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
