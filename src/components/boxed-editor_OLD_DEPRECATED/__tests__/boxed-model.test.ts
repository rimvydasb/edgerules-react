import { describe, expect, it } from 'vitest';
import type { PortableNode } from '@edgerules/portable';
import {
  classifyNode,
  clearRelationshipContextMetadata,
  createRelationshipRowDraft,
  discoverRelationColumns,
  renderNode,
} from '../boxed-model';

describe('boxed relation model', () => {
  it('recursively clears presentation metadata from relationship contexts', () => {
    expect(
      clearRelationshipContextMetadata({
        '@kind': 'context',
        '@node': 'InputNode',
        '@node-name': 'Accidental',
        '@description': 'not supported in a relationship record',
        contact: {
          '@kind': 'context',
          '@node': 'ChartNode',
          city: "'London'",
        },
      }),
    ).toEqual({
      '@kind': 'context',
      contact: { '@kind': 'context', city: "'London'" },
    });
  });

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

  it('uses the first relationship row to create a type-compatible blank row', () => {
    const items = [
      {
        '@kind': 'context',
        name: "'Ada'",
        age: 36,
        active: true,
        contact: { '@kind': 'context', city: "'London'" },
      },
    ] as PortableNode[];
    const rendered = renderNode(
      items as unknown as PortableNode,
      'people',
      {
        type: 'array',
        items: {
          '@kind': 'type-definition',
          name: { '@kind': 'type', type: 'string' },
          age: { '@kind': 'type', type: 'number' },
          active: { '@kind': 'type', type: 'boolean' },
          contact: {
            '@kind': 'type-definition',
            city: { '@kind': 'type', type: 'string' },
          },
        },
      } as PortableNode,
      'people',
      new Map([['people', { items, terminal: true }]]),
    );

    expect(rendered.kind).toBe('relation');
    if (rendered.kind !== 'relation') throw new Error('Expected relation');
    expect(createRelationshipRowDraft(rendered)).toEqual({
      '@kind': 'context',
      name: "''",
      age: 0,
      active: false,
      contact: { '@kind': 'context', city: "''" },
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

  it('preserves nested Portable contexts as drillable relationship cells', () => {
    const items = [
      {
        '@kind': 'context',
        name: "'Ada'",
        contact: {
          '@kind': 'context',
          address: {
            '@kind': 'context',
            city: "'London'",
          },
        },
      },
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
    const contact = rendered.children?.[0]?.children?.find(
      (cell) => cell.name === 'contact',
    );
    expect(contact).toMatchObject({
      kind: 'context',
      path: 'people[0].contact',
    });
    expect(contact?.children?.[0]).toMatchObject({
      kind: 'context',
      path: 'people[0].contact.address',
    });
    expect(contact?.children?.[0]?.children?.[0]).toMatchObject({
      kind: 'expression',
      path: 'people[0].contact.address.city',
      authored: "'London'",
    });
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
