import { describe, expect, it, vi } from 'vitest';
import { createChangeBatch } from '../../../lib/changeBatch';
import { createDocumentationStore } from '../stores/createDocumentationStore';
import { createFlowMetadataStore } from '../stores/createFlowMetadataStore';
import { createProjectTestsStore } from '../stores/createProjectTestsStore';
import type { StoreContext } from '../stores/storeSupport';

function context() {
  const batch = createChangeBatch();
  return { listeners: () => batch.createListenerSet(), onChange: vi.fn<() => void>() } satisfies StoreContext;
}

describe('DocumentationStore', () => {
  it('moves a path and everything nested in it, and nothing else', () => {
    const store = createDocumentationStore(context());
    store.replaceDocument({ schemaVersion: 1, byPath: { a: '1', 'a.b': '2', ab: '3', c: '4' } });
    store.renamePath('a', 'x');
    expect(store.exportDocument().byPath).toEqual({ x: '1', 'x.b': '2', ab: '3', c: '4' });
  });

  it('snapshots are detached from later edits', () => {
    const store = createDocumentationStore(context());
    store.setDescription('a', 'one');
    const snapshot = store.exportDocument();
    store.setDescription('a', '');
    expect(snapshot.byPath).toEqual({ a: 'one' });
    expect(store.exportDocument().byPath).toEqual({});
  });
});

describe('ProjectTestsStore', () => {
  const row = (path: string) => ({ path, section: 'inputs' as const, order: 0, present: true });

  it('rewrites paths relative to each subject', () => {
    const store = createProjectTestsStore(context());
    store.replaceDocument({
      schemaVersion: 1,
      subjects: {
        '*': { cases: [], rows: [row('library.limits.max')] },
        library: { cases: [], rows: [row('limits.max')] },
        'library.eligibility': { cases: [], rows: [row('age')] },
        other: { cases: [], rows: [row('limits.max')] },
      },
    });

    store.renamePath('library.limits', 'library.caps');

    const subjects = store.exportDocument().subjects;
    expect(subjects['*'].rows.map((r) => r.path)).toEqual(['library.caps.max']);
    expect(subjects.library.rows.map((r) => r.path)).toEqual(['caps.max']);
    expect(subjects['library.eligibility'].rows.map((r) => r.path)).toEqual(['age']);
    expect(subjects.other.rows.map((r) => r.path)).toEqual(['limits.max']);
  });

  it('moves the suites of a renamed context with it', () => {
    const ctx = context();
    const store = createProjectTestsStore(ctx);
    store.replaceDocument({
      schemaVersion: 1,
      subjects: { 'library.eligibility': { cases: [], rows: [row('age')] } },
    });
    const facade = store.forSubject('library.eligibility');
    ctx.onChange.mockClear();

    store.renamePath('library', 'rules');

    expect(Object.keys(store.exportDocument().subjects)).toEqual(['rules.eligibility']);
    expect(store.forSubject('rules.eligibility')).toBe(facade);
    expect(ctx.onChange).toHaveBeenCalled();
  });

  it('exports only subjects that have tests', () => {
    const store = createProjectTestsStore(context());
    store.forSubject('empty');
    store.forSubject('*').addTestCase('One');
    expect(Object.keys(store.exportDocument().subjects)).toEqual(['*']);
  });
});

describe('FlowMetadataStore', () => {
  it('moves positions and the sources of outputs and charts', () => {
    const store = createFlowMetadataStore(context());
    store.setLayout({
      positions: { risk: { x: 1, y: 1 }, riskier: { x: 2, y: 2 } },
      outputs: [{ id: 'output', source: { node: 'risk', handle: 'level' } }, { id: 'output2' }],
      charts: [{ id: 'chart', source: { node: 'riskier', handle: 'level' } }],
    });

    store.renamePath('risk', 'score');

    expect(store.getLayout()).toEqual({
      positions: { score: { x: 1, y: 1 }, riskier: { x: 2, y: 2 } },
      outputs: [{ id: 'output', source: { node: 'score', handle: 'level' } }, { id: 'output2' }],
      charts: [{ id: 'chart', source: { node: 'riskier', handle: 'level' } }],
    });
  });

  it('ignores a rename that touches nothing', () => {
    const ctx = context();
    const store = createFlowMetadataStore(ctx);
    const layout = store.getLayout();
    store.renamePath('absent', 'other');
    expect(store.getLayout()).toBe(layout);
    expect(ctx.onChange).not.toHaveBeenCalled();
  });
});
