import type { BoxedRowData } from '../boxed-editor-types';
import { parentPath } from './portable-utils';

export interface CachedRows {
  row?: BoxedRowData;
  rows: BoxedRowData[];
}

function isAtOrBelow(path: string, ancestor: string): boolean {
  if (path === ancestor) return true;
  if (ancestor === '*') return true;
  return path.startsWith(`${ancestor}.`) || path.startsWith(`${ancestor}[`);
}

export interface RowCache {
  get(path: string): CachedRows;
  invalidate(path?: string): void;
}

export function createRowCache(load: (path: string) => CachedRows): RowCache {
  const entries = new Map<string, CachedRows>();

  return {
    get(path) {
      const cached = entries.get(path);
      if (cached) return cached;
      const loaded = load(path);
      entries.set(path, loaded);
      return loaded;
    },
    invalidate(path) {
      if (path === undefined) {
        entries.clear();
        return;
      }
      const ancestors = new Set<string>();
      let current: string | undefined = path;
      while (current !== undefined) {
        ancestors.add(current);
        current = parentPath(current);
      }
      for (const cachedPath of entries.keys()) {
        if (ancestors.has(cachedPath) || isAtOrBelow(cachedPath, path)) {
          entries.delete(cachedPath);
        }
      }
    },
  };
}
