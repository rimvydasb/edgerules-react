import { describe, expect, it } from 'vitest';
import type { PortableContext, PortableNode } from '@edgerules/portable';
import { classifyFieldNode, groupContextChildren, joinPath, listTypeEntries, ROOT_PATH } from '../tree-model';

describe('classifyFieldNode', () => {
  it('classifies a plain object with no @kind as a context', () => {
    expect(classifyFieldNode({ x: { '@kind': 'type', type: 'number' } })).toBe('ctx');
  });

  it('classifies an explicit @kind: context as a context', () => {
    expect(classifyFieldNode({ '@kind': 'context' })).toBe('ctx');
  });

  it('classifies a function definition as func', () => {
    expect(
      classifyFieldNode({
        '@kind': 'function',
        '@parameters': {},
        '@body': { '@kind': 'expression', expression: '1' },
      }),
    ).toBe('func');
  });

  it('classifies a function schema as func', () => {
    // Not part of the declared PortableNode union, but the real engine's default CONTEXT
    // filter returns this shape for function fields (see EDGERULES_API_SPEC.md).
    expect(
      classifyFieldNode({
        '@kind': 'function-schema',
        '@parameters': {},
        '@return': 'number',
      } as unknown as PortableNode),
    ).toBe('func');
  });

  it('classifies a ruleset definition as dt', () => {
    expect(
      classifyFieldNode({
        '@kind': 'ruleset',
        '@parameters': { age: 'number' },
        '@hitPolicy': 'first-match',
        '@rules': [],
      } as unknown as PortableNode),
    ).toBe('dt');
  });

  it('classifies a ruleset schema as dt', () => {
    // Not part of the declared PortableNode union, but the real engine's default CONTEXT
    // filter returns this shape for ruleset fields (see EDGERULES_API_SPEC.md).
    expect(
      classifyFieldNode({
        '@kind': 'ruleset-schema',
        '@parameters': { age: 'number' },
        '@hitPolicy': 'first-match',
        '@return': { level: 'string' },
      } as unknown as PortableNode),
    ).toBe('dt');
  });

  it('classifies any invocation (function or ruleset call) as var', () => {
    for (const method of ['calcScore', 'firstMatch', 'risk']) {
      expect(
        classifyFieldNode({ '@kind': 'invocation', '@method': method, '@arguments': [] }),
      ).toBe('var');
    }
  });

  it('classifies a typed value / expression / scalar / array as var', () => {
    expect(classifyFieldNode({ '@kind': 'type', type: 'number', readOnly: true })).toBe('var');
    expect(classifyFieldNode({ '@kind': 'expression', expression: '1 + 1' })).toBe('var');
    expect(classifyFieldNode(42)).toBe('var');
    expect(classifyFieldNode('hello')).toBe('var');
    expect(classifyFieldNode([{ a: 1 }, { a: 2 }])).toBe('var');
  });
});

describe('groupContextChildren', () => {
  // Mirrors docs/PROJECT_EXPLORER_STORY.md's example model. `risk` is hand-built as an
  // `@kind: 'ruleset-schema'` node here to verify our own classify/group logic is spec-correct —
  // that's covered separately by ProjectExplorer's real-service test.
  const nestedContext: PortableContext = {
    deep: {
      '@kind': 'function',
      '@parameters': {},
      '@body': {
        subField: { '@kind': 'type', type: 'number', readOnly: true },
        deepContext: { x: { '@kind': 'type', type: 'number', readOnly: true } },
      },
    },
  };

  const rootContext: PortableContext = {
    globalConst: { '@kind': 'type', type: 'number', readOnly: true },
    nested: nestedContext,
    list: [{ a: 1 }, { a: 2 }],
    risk: {
      '@kind': 'ruleset-schema',
      '@parameters': { age: 'number' },
      '@hitPolicy': 'first-match',
      '@return': { level: 'string' },
    } as unknown as PortableNode,
  };

  it('splits root fields into vars (globalConst, list) and ordered (nested, risk)', () => {
    const { vars, ordered } = groupContextChildren(ROOT_PATH, rootContext);

    expect(vars.map((entry) => entry.name)).toEqual(['globalConst', 'list']);
    expect(vars.map((entry) => entry.kind)).toEqual(['var', 'var']);

    expect(ordered.map((entry) => entry.name)).toEqual(['nested', 'risk']);
    expect(ordered.map((entry) => entry.kind)).toEqual(['ctx', 'dt']);
  });

  it('builds dotted paths relative to root', () => {
    const { vars, ordered } = groupContextChildren(ROOT_PATH, rootContext);
    expect(vars.find((entry) => entry.name === 'globalConst')?.path).toBe('globalConst');
    expect(ordered.find((entry) => entry.name === 'nested')?.path).toBe('nested');
    expect(ordered.find((entry) => entry.name === 'risk')?.path).toBe('risk');
  });

  it('classifies a nested context function as func, in ordered', () => {
    const { vars, ordered } = groupContextChildren('nested', nestedContext);
    expect(vars).toEqual([]);
    expect(ordered.map((entry) => entry.name)).toEqual(['deep']);
    expect(ordered[0].kind).toBe('func');
    expect(ordered[0].path).toBe('nested.deep');
  });

  it('skips @-prefixed metadata keys', () => {
    const context: PortableContext = {
      '@kind': 'context',
      '@description': 'a context',
      a: { '@kind': 'type', type: 'number', readOnly: true },
    };
    const { vars, ordered } = groupContextChildren(ROOT_PATH, context);
    expect(vars.map((entry) => entry.name)).toEqual(['a']);
    expect(ordered).toEqual([]);
  });

  it('skips dotted keys (never a genuine same-level field; a known engine quirk flattens a descendant function schema onto its ancestor this way)', () => {
    const context: PortableContext = {
      nested: { '@kind': 'context' },
      // Not part of the declared PortableNode union (see tree-model.ts), but this is exactly
      // the real shape the engine produces for a flattened function schema.
      'nested.deep': { '@kind': 'function-schema', '@parameters': {}, '@return': 'number' } as unknown as PortableNode,
    };
    const { vars, ordered } = groupContextChildren(ROOT_PATH, context);
    expect(vars).toEqual([]);
    expect(ordered.map((entry) => entry.name)).toEqual(['nested']);
  });
});

describe('listTypeEntries', () => {
  it('lists each type entry, skipping the @kind metadata key', () => {
    const rootTypes: PortableContext = {
      '@kind': 'context',
      Person: {
        '@kind': 'type-definition',
        name: { '@kind': 'type', type: 'string' },
        age: { '@kind': 'type', type: 'number' },
      },
      PeopleList: { '@kind': 'type', type: 'array', items: { '@kind': 'type', type: 'Person' } },
    };

    const entries = listTypeEntries(rootTypes);
    expect(entries.map((entry) => entry.name)).toEqual(['Person', 'PeopleList']);
  });
});

describe('joinPath', () => {
  it('returns the bare name when parent is root', () => {
    expect(joinPath(ROOT_PATH, 'nested')).toBe('nested');
  });

  it('dot-joins when parent is not root', () => {
    expect(joinPath('nested', 'deep')).toBe('nested.deep');
    expect(joinPath('nested.deep', 'deepContext')).toBe('nested.deep.deepContext');
  });
});
