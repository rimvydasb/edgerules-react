import { emptyDocumentation, type DocumentationDocument } from '../bundle/types';
import { moveKeys, type StoreContext } from './storeSupport';
import type { DocumentationStore } from './types';

export function createDocumentationStore(context: StoreContext): DocumentationStore {
  const listeners = context.listeners();
  let byPath: Record<string, string> = {};
  let snapshot: DocumentationDocument = emptyDocumentation();

  function changed(next: Record<string, string>): void {
    byPath = next;
    snapshot = { schemaVersion: 1, byPath: { ...next } };
    context.onChange();
    listeners.notify();
  }

  return {
    getDescription: (path) => byPath[path],

    setDescription(path, description) {
      if ((byPath[path] ?? '') === description) return;
      const next = { ...byPath };
      if (description === '') delete next[path];
      else next[path] = description;
      changed(next);
    },

    renamePath(from, to) {
      if (from === to) return;
      const next = moveKeys(byPath, from, to);
      if (next) changed(next);
    },

    exportDocument: () => snapshot,

    replaceDocument(document) {
      changed({ ...document.byPath });
    },

    subscribe: listeners.subscribe,

    dispose: listeners.clear,
  };
}
