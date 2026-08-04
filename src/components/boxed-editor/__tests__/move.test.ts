import { describe, expect, it, vi } from 'vitest';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { isPortableError } from '../../../lib/portable';
import { createBoxedEditorService } from '../service/createBoxedEditorService';

describe('BoxedEditorService move', () => {
  it('reorders list and relation items with one successful notification each', () => {
    const mutable = MutableDecisionService.fromCode(`{
      xs: [1, 2, 3]
      people: [{ name: "Ada" }, { name: "Lin" }]
    }`);
    const service = createBoxedEditorService(mutable);
    const listener = vi.fn();
    service.subscribe(listener);

    expect(service.move('xs[0]', 'xs', 2)).toBeUndefined();
    expect(service.getBoxedRowsData('xs').map((row) => row.value)).toEqual([
      '2',
      '3',
      '1',
    ]);
    expect(service.move('people[1]', 'people', 0)).toBeUndefined();
    expect(
      service
        .getBoxedRowsData('people')
        .map((row) => (row as { cells?: string[] }).cells?.[0]),
    ).toEqual(["'Lin'", "'Ada'"]);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('reorders rules through their array-shaped rules path', () => {
    const mutable = MutableDecisionService.fromCode(`{
      ruleset r(x: number): {
        hitPolicy: "first-match"
        rules: [
          { name: "first", when: { x: > 0 }, then: { result: 1 } }
          { name: "second", when: { x: <= 0 }, then: { result: 2 } }
        ]
      }
    }`);
    const service = createBoxedEditorService(mutable);

    expect(service.move('r.rules[0]', 'r', 1)).toBeUndefined();
    expect(
      service
        .getBoxedRowsData('r')
        .filter((row) => row.kind === 'rule')
        .map((row) => row.name),
    ).toEqual(['second', 'first']);
  });

  it('applies same-parent order changes at the model root', () => {
    const mutable = MutableDecisionService.fromCode('{ a: 1; b: 2; c: 3 }');
    const service = createBoxedEditorService(mutable);

    expect(service.move('a', '*', 2)).toBeUndefined();
    expect(Object.keys(mutable.toPortable())).toEqual(['@kind', 'b', 'c', 'a']);
    expect(service.getBoxedRowsData('*').map((row) => row.name)).toEqual([
      'b',
      'c',
      'a',
    ]);
  });

  it('reparents a field between contexts with insert before remove', () => {
    const mutable = MutableDecisionService.fromCode(
      '{ source: { value: 1 }; target: { other: 2 } }',
    );
    const service = createBoxedEditorService(mutable);

    expect(service.move('source.value', 'target', 0)).toBeUndefined();
    expect(mutable.toPortable()).toMatchObject({
      source: { '@kind': 'context' },
      target: { '@kind': 'context', value: 1, other: 2 },
    });
  });

  it('reparents contexts and functions into another context', () => {
    const mutable = MutableDecisionService.fromCode(`{
      nested: { value: 1 }
      func helper(x: number): x + 1
      target: { existing: 2 }
    }`);
    const service = createBoxedEditorService(mutable);

    expect(service.move('nested', 'target', 0)).toBeUndefined();
    expect(service.move('helper', 'target', 1)).toBeUndefined();
    expect(mutable.toPortable()).toMatchObject({
      target: {
        nested: { '@kind': 'context', value: 1 },
        helper: { '@kind': 'function' },
        existing: 2,
      },
    });
    expect(mutable.toPortable().nested).toBeUndefined();
    expect(mutable.toPortable().helper).toBeUndefined();
  });

  it('leaves the source untouched when destination insertion fails', () => {
    const mutable = MutableDecisionService.fromCode(
      '{ source: { value: 1 }; scalar: 2 }',
    );
    const service = createBoxedEditorService(mutable);
    const before = service.getBoxedRowsData('source');
    const listener = vi.fn();
    service.subscribe(listener);

    const result = service.move('source.value', 'scalar', 0);

    expect(isPortableError(result)).toBe(true);
    expect(mutable.toPortable()).toMatchObject({
      source: { value: 1 },
      scalar: 2,
    });
    expect(service.getBoxedRowsData('source')).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it('surfaces remove failure after insertion and leaves the safer duplicate', () => {
    const mutable = MutableDecisionService.fromCode(`{
      type Person: { name: <string> }
      target: { existing: 1 }
    }`);
    const service = createBoxedEditorService(mutable);
    const listener = vi.fn();
    service.subscribe(listener);

    // Type-definition children are readable Portable paths but are not removable
    // in this engine version. That gives the real engine partial-failure shape:
    // target insertion commits, then source removal returns WrongFieldPath.
    const result = service.move('Person.name', 'target', 0);

    expect(result).toMatchObject({
      '@kind': 'error',
      type: 'WrongFieldPath',
    });
    expect(mutable.toPortable()).toMatchObject({
      Person: {
        '@kind': 'type-definition',
        name: { '@kind': 'type', type: 'string' },
      },
      target: {
        '@kind': 'context',
        name: { '@kind': 'type', type: 'string' },
        existing: 1,
      },
    });
    expect(listener).not.toHaveBeenCalled();
  });
});
