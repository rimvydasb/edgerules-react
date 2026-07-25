import { describe, expect, it, vi } from 'vitest';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { isPortableError } from '../../../lib/portable';
import { createBoxedEditorService } from '../service/createBoxedEditorService';

describe('BoxedEditorService mutations and cache', () => {
  it('round-trips expression, typed-input, and invocation field text', () => {
    const mutable = MutableDecisionService.fromCode('{ value: 1; other: 2 }');
    const service = createBoxedEditorService(mutable);

    service.setBoxedRowData('value', {
      kind: 'field',
      depth: 0,
      path: 'value',
      name: 'value',
      value: '<number, required: true>',
    });
    expect(mutable.toPortable().value).toMatchObject({
      '@kind': 'type',
      type: 'number',
      required: true,
    });

    service.setBoxedRowData('value', {
      kind: 'field',
      depth: 0,
      path: 'value',
      name: 'value',
      value: 'round(1.2)',
    });
    expect(mutable.toPortable().value).toMatchObject({
      '@kind': 'invocation',
      '@method': 'round',
    });

    service.setBoxedRowData('value', {
      kind: 'field',
      depth: 0,
      path: 'value',
      name: 'value',
      value: 'other + 3',
    });
    expect(mutable.toPortable().value).toMatchObject({
      '@kind': 'expression',
      expression: 'other + 3',
    });
  });

  it('sets whole context/list/relation/function/ruleset rows', () => {
    const mutable = MutableDecisionService.fromCode(`{
      ctx: { a: 1 }
      xs: [1, 2]
      people: [{ name: "Ada" }]
      type Person: { name: <string, required: true> }
      func f(x: number): x
      ruleset r(x: number): {
        hitPolicy: "first-match"
        rules: [{ when: { x: > 0 }, then: { ok: true } }]
      }
    }`);
    const service = createBoxedEditorService(mutable);

    const context = service
      .getBoxedRowsData('*')
      .find((row) => row.path === 'ctx');
    expect(context).toBeDefined();
    service.setBoxedRowData('ctx', {
      ...context!,
      children: [
        ...(context!.children ?? []),
        {
          kind: 'field',
          depth: 1,
          path: 'ctx.b',
          name: 'b',
          value: '2',
        },
      ],
    });
    expect(mutable.toPortable().ctx).toMatchObject({ a: 1, b: 2 });

    for (const path of ['xs', 'people', 'Person', 'f', 'r']) {
      const row = service
        .getBoxedRowsData('*')
        .find((candidate) => candidate.path === path);
      expect(row, path).toBeDefined();
      const result = service.setBoxedRowData(path, row!);
      expect(isPortableError(result), path).toBe(false);
    }
  });

  it('sets relation items and ruleset table rows from their own normalized rows', () => {
    const mutable = MutableDecisionService.fromCode(`{
      people: [{ name: "Ada" }, { name: "Lin" }]
      ruleset r(x: number): {
        hitPolicy: "first-match"
        rules: [{ when: { x: > 0 }, then: { result: 1 } }]
        default: { result: 0 }
      }
    }`);
    const service = createBoxedEditorService(mutable);

    const person = service.getBoxedRowData('people[0]');
    expect(person).toBeDefined();
    expect(
      isPortableError(
        service.setBoxedRowData('people[0]', {
          ...person!,
          cells: ["'Grace'"],
        } as typeof person & { cells: string[] }),
      ),
    ).toBe(false);

    const rule = service.getBoxedRowData('r.rules[0]');
    expect(rule).toBeDefined();
    expect(
      isPortableError(
        service.setBoxedRowData('r.rules[0]', {
          ...rule!,
          conditions: ['<= 0'],
          actions: ['2'],
        } as typeof rule & { conditions: string[]; actions: string[] }),
      ),
    ).toBe(false);

    const fallback = service.getBoxedRowData('r.default');
    expect(fallback).toBeDefined();
    expect(
      isPortableError(
        service.setBoxedRowData('r.default', {
          ...fallback!,
          actions: ['3'],
        } as typeof fallback & { actions: string[] }),
      ),
    ).toBe(false);

    expect(mutable.toPortable()).toMatchObject({
      people: {
        '@kind': 'expression',
        expression: '[{ name: "Grace" }, { name: "Lin" }]',
      },
      r: {
        '@rules': [{ when: { x: '<= 0' }, then: { result: 2 } }],
        '@default': { result: 3 },
      },
    });
  });

  it('coalesces optimisation child edits into whole-definition writes', () => {
    const mutable = MutableDecisionService.fromCode(`{
      optimise plan(x: number): {
        variables: { value: <number, min: 0> }
        maximise: value
        constraints: {
          cap: value <= x
          floor: value >= 0
        }
      }
    }`);
    const service = createBoxedEditorService(mutable);

    const variable = service.getBoxedRowData('plan.variables.value')!;
    expect(
      isPortableError(
        service.setBoxedRowData('plan.variables.value', {
          ...variable,
          value: '<number, min: 0, max: 10>',
        }),
      ),
    ).toBe(false);

    const objective = service.getBoxedRowData('plan.maximise')!;
    expect(
      isPortableError(
        service.setBoxedRowData('plan.maximise', {
          ...objective,
          name: 'minimise',
          value: '2 * value',
        }),
      ),
    ).toBe(false);

    expect(service.rename('plan.constraints.cap', 'ceiling')).toBeUndefined();
    expect(
      service.move('plan.constraints.floor', 'plan.constraints', 0),
    ).toBeUndefined();
    expect(service.remove('plan.constraints.ceiling')).toBeUndefined();

    expect(mutable.get('plan', 'ALL')).toEqual({
      '@kind': 'optimise',
      '@parameters': { x: 'number' },
      '@variables': {
        value: {
          '@kind': 'type',
          type: 'number',
          min: 0,
          max: 10,
        },
      },
      '@minimise': '2 * value',
      '@constraints': { floor: 'value >= 0' },
    });
  });

  it('notifies once on success, keeps unaffected snapshots stable, and invalidates before notifying', () => {
    const mutable = MutableDecisionService.fromCode(
      '{ left: { value: 1 }; right: { value: 2 } }',
    );
    const service = createBoxedEditorService(mutable);
    const leftBefore = service.getBoxedRowsData('left');
    const rightBefore = service.getBoxedRowsData('right');
    const seen: unknown[] = [];
    const listener = vi.fn(() => seen.push(service.getBoxedRowsData('left')));
    service.subscribe(listener);

    const result = service.setBoxedRowData('left.value', {
      kind: 'field',
      depth: 1,
      path: 'left.value',
      name: 'value',
      value: '3',
    });

    expect(isPortableError(result)).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(seen[0]).not.toBe(leftBefore);
    expect(service.getBoxedRowsData('right')).toBe(rightBefore);
  });

  it('passes PortableError through and leaves the cached snapshot untouched', () => {
    const mutable = MutableDecisionService.fromCode('{ value: 1 }');
    const service = createBoxedEditorService(mutable);
    const before = service.getBoxedRowsData('*');
    const listener = vi.fn();
    service.subscribe(listener);

    const result = service.setBoxedRowData('missing.child', {
      kind: 'field',
      depth: 1,
      path: 'missing.child',
      name: 'child',
      value: '2',
    });

    expect(isPortableError(result)).toBe(true);
    expect(result).toMatchObject({ '@kind': 'error' });
    expect(service.getBoxedRowsData('*')).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('delegates rename/remove and public invalidation', () => {
    const mutable = MutableDecisionService.fromCode(
      '{ item: 1; removable: 2 }',
    );
    const service = createBoxedEditorService(mutable);
    const listener = vi.fn();
    service.subscribe(listener);

    expect(service.rename('item', 'renamed')).toBeUndefined();
    expect(service.remove('removable')).toBeUndefined();
    const beforeInvalidate = service.getBoxedRowsData('*');
    mutable.set('extra', 3);
    expect(service.getBoxedRowsData('*')).toBe(beforeInvalidate);
    service.invalidate();

    expect(listener).toHaveBeenCalledTimes(3);
    expect(service.getBoxedRowsData('*').map((row) => row.name)).toEqual([
      'renamed',
      'extra',
    ]);
    expect(service.toPortable()).toEqual(mutable.toPortable());
  });
});
