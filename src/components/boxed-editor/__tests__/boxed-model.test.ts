import { describe, expect, it } from 'vitest';
import type { PortableNode } from '@edgerules/portable';
import {
  classifyNode,
  discoverRelationColumns,
  renderNode,
} from '../boxed-model';

describe('boxed relation model', () => {
  it('discovers the ordered union of authored fields across relationship rows', () => {
    const columns = discoverRelationColumns(
      [
        { '@kind': 'context', name: "'Ada'", age: '36' },
        { '@kind': 'context', name: "'Grace'", active: 'true' },
      ] as PortableNode[],
      'people',
    );

    expect(columns.map((column) => column.name)).toEqual([
      'name',
      'age',
      'active',
    ]);
    expect(columns.map((column) => column.sortable.index)).toEqual([0, 1, 2]);
    expect(columns[0]?.sortable).toMatchObject({
      groupId: 'relation-columns:people',
      ownerPath: 'people',
      ownerKind: 'relation-column',
    });
  });

  it('normalizes object-list fields as columns and values as row cells', () => {
    const items = [
      { '@kind': 'context', name: "'Ada'", age: '36' },
      { '@kind': 'context', name: "'Grace'", age: '42' },
    ] as PortableNode[];
    const rendered = renderNode(
      items as unknown as PortableNode,
      'people',
      { type: 'array', items: { type: 'object' } } as PortableNode,
      'people',
      new Map([['people', { items, terminal: true }]]),
    );

    expect(rendered.kind).toBe('relation');
    if (rendered.kind !== 'relation') throw new Error('Expected relation');
    expect(rendered.columns.map((column) => column.name)).toEqual([
      'name',
      'age',
    ]);
    expect(rendered.children?.[0]?.children?.map((cell) => cell.name)).toEqual([
      'name',
      'age',
    ]);
  });

  it('keeps scalar and mixed arrays as lists', () => {
    const schema = { type: 'array' } as PortableNode;
    expect(
      classifyNode([] as unknown as PortableNode, schema, {
        items: ['1', '2'],
        terminal: true,
      }),
    ).toBe('list');
    expect(
      classifyNode([] as unknown as PortableNode, schema, {
        items: [{ '@kind': 'context', name: "'Ada'" }, '2'],
        terminal: true,
      }),
    ).toBe('list');
    expect(
      classifyNode([] as unknown as PortableNode, schema, {
        items: [{ name: "'Ada'" }, { name: "'Grace'" }],
        terminal: true,
      }),
    ).toBe('relation');
  });
});
