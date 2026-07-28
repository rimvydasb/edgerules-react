import { describe, expect, it } from 'vitest';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { isPortableError } from '../../../lib/portable';
import { createBoxedEditorService } from '../service/createBoxedEditorService';
import { denormalize } from '../service/denormalize';
import { normalizeNode } from '../service/normalize';

const MODEL = `{
  application: { amount: <number, required: true>; fee: amount * 0.1 }
  stages: ["review", "approve"]
  people: [{ name: "Ada", age: 32 }, { name: "Lin", age: 28 }]
  answer: 42
  ruleset risk(age: number): {
    hitPolicy: "best-match"
    rules: [
      { name: "adult", when: { age: >= 18 }, then: { level: "low", limit: 1000 }, priority: 1 }
      { when: age < 18, then: { level: "high", limit: 0 }, priority: 2 }
    ]
    default: { level: "none", limit: 0 }
  }
  func monthly(amount: number): amount / 12
  type Applicant: { age: <number, required: true>; name: <string> }
}`;

describe('BoxedEditorService normalization', () => {
  it('sorts root rows, strips metadata, and consolidates scalar node kinds', () => {
    const mutable = MutableDecisionService.fromCode(MODEL);
    const service = createBoxedEditorService(mutable);
    const rows = service.getBoxedRowsData('*');

    expect(service.getBoxedRowData('*')).toMatchObject({
      kind: 'model',
      path: '*',
    });
    expect(rows.map(({ kind, name }) => `${kind}:${name}`)).toEqual([
      'complexType:Applicant',
      'function:monthly',
      'ruleset:risk',
      'context:application',
      'list:stages',
      'relation:people',
      'field:answer',
    ]);
    expect(
      rows.flatMap((row) => row.children ?? []).map((row) => row.name),
    ).not.toContain('@kind');
    expect(service.getBoxedRowsData('*')).toBe(rows);
  });

  it('synthesizes an inline function result and derives relation columns', () => {
    const service = createBoxedEditorService(
      MutableDecisionService.fromCode(MODEL),
    );
    const functionRow = service.getBoxedRowData('monthly');
    const result = service.getBoxedRowsData('monthly')[0];
    const relation = service.getBoxedRowData('people');

    expect(functionRow).toMatchObject({
      kind: 'function',
      parameters: [{ name: 'amount', type: 'number' }],
    });
    expect(result).toMatchObject({
      kind: 'function-result',
      path: 'monthly.result',
      value: 'amount / 12',
      readOnly: true,
      deletable: false,
    });
    expect(relation).toMatchObject({
      kind: 'relation',
      columns: ['name', 'age'],
    });
    expect(service.getBoxedRowsData('people')[0]).toMatchObject({
      kind: 'relation-item',
      cells: ["'Ada'", '32'],
    });
    expect(service.getBoxedRowData('people[0]')).toMatchObject({
      kind: 'relation-item',
      name: 'Item 1',
    });
    expect(service.getBoxedRowData('monthly.result')).toMatchObject({
      kind: 'function-result',
    });
  });

  it('derives ruleset table fields for cell-map and expression conditions', () => {
    const service = createBoxedEditorService(
      MutableDecisionService.fromCode(MODEL),
    );
    const ruleset = service.getBoxedRowData('risk');
    const children = service.getBoxedRowsData('risk');

    expect(ruleset).toMatchObject({
      kind: 'ruleset',
      conditionColumns: ['age'],
      actionColumns: ['level', 'limit'],
    });
    expect(children[0]).toMatchObject({
      kind: 'ruleset-hit-policy',
      value: 'best-match',
    });
    expect(children[1]).toMatchObject({
      kind: 'rule',
      name: 'adult',
      conditions: ['>= 18'],
      actions: ["'low'", '1000'],
      priority: 1,
    });
    expect(children[2]).toMatchObject({
      kind: 'rule',
      conditionsExpression: 'age < 18',
      priority: 2,
    });
    expect(children[3]).toMatchObject({
      kind: 'ruleset-default',
      actions: ["'none'", '0'],
    });
    expect(service.getBoxedRowData('risk.rules[0]')).toMatchObject({
      kind: 'rule',
      name: 'adult',
    });
  });

  it('never exposes Portable annotations as rows', () => {
    const mutable = MutableDecisionService.fromPortable({
      '@kind': 'context',
      '@model-name': 'Annotated',
      box: {
        '@kind': 'context',
        '@node': 'InputNode',
        '@node-name': 'Input',
        value: 1,
      },
    });
    const service = createBoxedEditorService(mutable);

    expect(service.getBoxedRowsData('box').map((row) => row.name)).toEqual([
      'value',
    ]);
  });

  it('round-trips every optimisation-family row through the real engine', async () => {
    const mutable = MutableDecisionService.fromCode(`{
      optimise factory(workers: number): {
        using: "highs"
        bottlenecks: true
        timeLimit: 1000
        variables: {
          chairs: <number, min: 0, integer: true>
        }
        maximise: 15 * chairs
        constraints: { capacity: chairs <= workers }
      }
      plan: factory(workers: 1)
    }`);
    const service = createBoxedEditorService(mutable);
    const row = {
      ...service.getBoxedRowData('factory')!,
      children: service.getBoxedRowsData('factory'),
    };

    expect(row.kind).toBe('optimisation');
    expect(row.children?.map((child) => child.kind)).toEqual([
      'optimisation-setting',
      'optimisation-setting',
      'optimisation-setting',
      'optimisation-variable-group',
      'optimisation-objective',
      'optimisation-constraint-group',
    ]);
    expect(row.children?.[3].children?.[0]).toMatchObject({
      kind: 'optimisation-variable',
      name: 'chairs',
    });
    expect(row.children?.[5].children?.[0]).toMatchObject({
      kind: 'optimisation-constraint',
      name: 'capacity',
    });
    const portable = denormalize(row);
    expect(portable).toMatchObject({
      '@kind': 'optimise',
      '@parameters': { workers: 'number' },
      '@using': 'highs',
      '@bottlenecks': true,
      '@timeLimit': 1000,
      '@variables': {
        chairs: '<number, min: 0, integer: true>',
      },
      '@maximise': '15 * chairs',
      '@constraints': { capacity: 'chairs <= workers' },
    });

    expect(isPortableError(service.setBoxedRowData('factory', row))).toBe(
      false,
    );
    expect(mutable.get('factory', 'ALL')).toMatchObject({
      '@kind': 'optimise',
      '@maximise': '15 * chairs',
      '@constraints': { capacity: 'chairs <= workers' },
    });

    mutable.registerSolver(() => ({
      status: 'optimal',
      objective: 15,
      values: { chairs: 1 },
      duals: { capacity: 15 },
    }));
    await expect(mutable.execute('plan')).resolves.toMatchObject({
      status: 'optimal',
      objective: 15,
      chairs: 1,
    });
  });

  it('keeps nested relation objects as drill-down rows through a round trip', () => {
    const relation = normalizeNode('records', 'records', [
      {
        '@kind': 'context',
        id: 1,
        address: { '@kind': 'context', city: "'Vilnius'" },
      },
    ]);
    const item = relation.children?.[0];

    expect(item).toMatchObject({
      kind: 'relation-item',
      columns: ['id', 'address'],
      cells: ['1', ''],
    });
    expect(item?.children?.[0]).toMatchObject({
      kind: 'context',
      name: 'address',
    });
    expect(denormalize(relation)).toEqual([
      {
        '@kind': 'context',
        id: { '@kind': 'expression', expression: '1' },
        address: {
          '@kind': 'context',
          city: { '@kind': 'expression', expression: "'Vilnius'" },
        },
      },
    ]);
  });

  it('keeps portable expression records in a scalar list', () => {
    const list = normalizeNode('scores', 'scores', [
      { '@kind': 'expression', expression: '0' },
      { '@kind': 'expression', expression: '-1' },
    ] as never);

    expect(list).toMatchObject({
      kind: 'list',
      children: [
        { kind: 'list-item', value: '0' },
        { kind: 'list-item', value: '-1' },
      ],
    });
  });

  it('uses the linked item schema to classify an empty relation', () => {
    expect(
      normalizeNode('records', 'records', [], {
        '@kind': 'type',
        type: 'array',
        items: {
          '@kind': 'type-definition',
          value: { '@kind': 'type', type: 'number' },
        },
      } as never).kind,
    ).toBe('relation');
  });

  it('collapses a function whose only authored child is result', () => {
    const functionRow = normalizeNode('f', 'f', {
      '@kind': 'function',
      '@parameters': {},
      '@body': {
        '@kind': 'context',
        result: { '@kind': 'expression', expression: '42' },
      },
    } as never);

    expect(denormalize(functionRow)).toEqual({
      '@kind': 'function',
      '@parameters': {},
      '@body': { '@kind': 'expression', expression: '42' },
    });
  });

  it('returns empty data for an absent path', () => {
    const service = createBoxedEditorService(
      MutableDecisionService.fromCode(MODEL),
    );
    expect(service.getBoxedRowData('missing')).toBeUndefined();
    expect(service.getBoxedRowsData('missing')).toEqual([]);
  });

  it('materializes CRUD-addressable arrays inside function bodies', () => {
    const service = createBoxedEditorService(
      MutableDecisionService.fromCode(`{
        func collect(): {
          values: [1, 2]
          records: [{ value: 1 }, { value: 2 }]
          result: values
        }
      }`),
    );

    expect(service.getBoxedRowsData('collect').map((row) => row.kind)).toEqual([
      'list',
      'relation',
      'field',
    ]);
    expect(service.getBoxedRowsData('collect.values')).toHaveLength(2);
  });
});
