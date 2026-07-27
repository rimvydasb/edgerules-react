import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MutableDecisionService } from '@edgerules/node/mutable';
import { BoxedEditor } from '../BoxedEditor';
import type { BoxedRowData, BoxedTableRowData } from '../boxed-editor-types';
import { duplicateChildAt, duplicateNamedRow } from '../commands/rowFactories';
import { createBoxedEditorService } from '../service/createBoxedEditorService';

const languageService = MutableDecisionService;

/** Opens the `index`-th row's three-dot menu (document order) and clicks the named item. */
async function chooseAction(
  user: ReturnType<typeof userEvent.setup>,
  index: number,
  label: string,
): Promise<void> {
  const buttons = screen.getAllByLabelText('Open row actions');
  await user.click(buttons[index]);
  await user.click(screen.getByText(label));
}

describe('duplicate-rename: named kinds auto-rename', () => {
  it('duplicates a field, auto-renaming to avoid colliding, and fires onChange once', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode('{ amount: 10 }');
    const service = createBoxedEditorService(mutable);
    const onChange = vi.fn();

    render(
      <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
    );

    // Row order: the `model` header, then `amount`.
    await chooseAction(user, 1, 'Duplicate');

    expect(mutable.toPortable()).toMatchObject({ amount: 10, amount2: 10 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('duplicates a second time to "amount3", never colliding with "amount2"', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode('{ amount: 10; amount2: 20 }');
    const service = createBoxedEditorService(mutable);

    render(<BoxedEditor service={service} path="*" languageService={languageService} />);

    await chooseAction(user, 1, 'Duplicate');

    expect(mutable.toPortable()).toMatchObject({ amount: 10, amount2: 20, amount3: 10 });
  });

  it('duplicates a context and every nested field with it (whole-subtree copy)', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode('{ group: { a: 1; b: 2 } }');
    const service = createBoxedEditorService(mutable);
    const onChange = vi.fn();

    render(
      <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
    );

    // Row order: model, group, a, b.
    await chooseAction(user, 1, 'Duplicate');

    expect(mutable.toPortable()).toMatchObject({
      group: { a: 1, b: 2 },
      group2: { a: 1, b: 2 },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('duplicates an inline function, preserving its parameters and body', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode('{ func monthly(amount: number): amount / 12 }');
    const service = createBoxedEditorService(mutable);

    render(<BoxedEditor service={service} path="*" languageService={languageService} />);

    // Row order: model, monthly, monthly.result.
    await chooseAction(user, 1, 'Duplicate');

    expect(mutable.toPortable().monthly2).toMatchObject({
      '@kind': 'function',
      '@body': { '@kind': 'expression', expression: 'amount / 12' },
    });
  });

  it('duplicates a ruleset, preserving its hit policy, rules, and default', async () => {
    const user = userEvent.setup();
    const RULESET_CODE = `{
      ruleset risk(age: number): {
        hitPolicy: "first-match"
        rules: [{ when: { age: >= 18 }, then: { level: "high" } }]
        default: { level: "none" }
      }
    }`;
    const mutable = MutableDecisionService.fromCode(RULESET_CODE);
    const service = createBoxedEditorService(mutable);

    render(<BoxedEditor service={service} path="*" languageService={languageService} />);

    // Row order: model, risk, rule 1 (hitPolicy/default push no actions — deletable: false / no menu).
    await chooseAction(user, 1, 'Duplicate');

    // `get(path, 'ALL')` projects the *schema*, not authored literals — assert against the raw
    // authored tree instead (`toPortable()`), matching every other engine-round-trip test here.
    expect(mutable.toPortable().risk2).toMatchObject({
      '@hitPolicy': 'first-match',
      '@rules': [{ when: { age: '>= 18' }, then: { level: "'high'" } }],
      '@default': { level: "'none'" },
    });
  });

  it('duplicates a list, copying every item (whole-subtree copy)', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode('{ stages: ["review", "approve"] }');
    const service = createBoxedEditorService(mutable);

    render(<BoxedEditor service={service} path="*" languageService={languageService} />);

    // Row order: model, stages, stages[0], stages[1].
    await chooseAction(user, 1, 'Duplicate');

    expect(service.getBoxedRowsData('stages2').map((row) => row.value)).toEqual(
      service.getBoxedRowsData('stages').map((row) => row.value),
    );
  });
});

describe('duplicate-rename: positional kinds duplicate without renaming', () => {
  it('duplicates a list-item directly after itself, without renaming', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode('{ stages: ["review", "approve"] }');
    const service = createBoxedEditorService(mutable);
    const onChange = vi.fn();

    render(
      <BoxedEditor service={service} path="*" languageService={languageService} onChange={onChange} />,
    );
    const [review, approve] = service.getBoxedRowsData('stages').map((row) => row.value);

    // Row order: model, stages, stages[0] (duplicate this one), stages[1].
    await chooseAction(user, 2, 'Duplicate');

    expect(service.getBoxedRowsData('stages').map((row) => row.value)).toEqual([
      review,
      review,
      approve,
    ]);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('duplicates a relation-item directly after itself, preserving its cells', async () => {
    const user = userEvent.setup();
    const mutable = MutableDecisionService.fromCode(
      '{ people: [{ name: "Ada" }, { name: "Lin" }] }',
    );
    const service = createBoxedEditorService(mutable);

    render(<BoxedEditor service={service} path="*" languageService={languageService} />);

    // Row order: model, people, people[0] (duplicate), people[1].
    await chooseAction(user, 2, 'Duplicate');

    const rows = service.getBoxedRowsData('people') as BoxedTableRowData[];
    expect(rows).toHaveLength(3);
    expect(rows[0].cells).toEqual(["'Ada'"]);
    expect(rows[1].cells).toEqual(["'Ada'"]);
    expect(rows[2].cells).toEqual(["'Lin'"]);
  });

  it('duplicates a rule directly after itself, inserted before the default row', async () => {
    const user = userEvent.setup();
    const RULESET_CODE = `{
      ruleset risk(age: number): {
        hitPolicy: "first-match"
        rules: [{ when: { age: >= 18 }, then: { level: "high" } }]
        default: { level: "none" }
      }
    }`;
    const mutable = MutableDecisionService.fromCode(RULESET_CODE);
    const service = createBoxedEditorService(mutable);

    render(<BoxedEditor service={service} path="*" languageService={languageService} />);

    // Row order: model, risk, rule 1 (duplicate this one) — hitPolicy/default render no button.
    await chooseAction(user, 2, 'Duplicate');

    const kinds = service.getBoxedRowsData('risk').map((row) => row.kind);
    expect(kinds).toEqual(['ruleset-hit-policy', 'rule', 'rule', 'ruleset-default']);
    expect(mutable.toPortable().risk).toMatchObject({
      '@rules': [
        { then: { level: "'high'" } },
        { then: { level: "'high'" } },
      ],
    });
  });
});

describe('duplicate-rename: helper functions', () => {
  it('duplicateNamedRow remaps every descendant path under the new name', () => {
    const row: BoxedRowData = {
      kind: 'context',
      depth: 0,
      path: 'group',
      name: 'group',
      children: [
        { kind: 'field', depth: 1, path: 'group.a', name: 'a', value: '1' },
        { kind: 'field', depth: 1, path: 'group.b', name: 'b', value: '2' },
      ],
    };

    const { path, row: duplicated } = duplicateNamedRow(row, new Set(['group']));

    expect(path).toBe('group2');
    expect(duplicated.name).toBe('group2');
    expect(duplicated.children?.map((child) => child.path)).toEqual(['group2.a', 'group2.b']);
    expect(duplicated.children?.map((child) => child.name)).toEqual(['a', 'b']);
  });

  it('duplicateChildAt inserts a copy directly after the target, leaving other siblings untouched', () => {
    const children: BoxedRowData[] = [
      { kind: 'list-item', depth: 1, path: 'stages[0]', name: 'Item 1', value: "'a'" },
      { kind: 'list-item', depth: 1, path: 'stages[1]', name: 'Item 2', value: "'b'" },
    ];

    const next = duplicateChildAt(children, 'stages[0]');

    expect(next).toHaveLength(3);
    expect(next.map((child) => child.value)).toEqual(["'a'", "'a'", "'b'"]);
  });

  it('duplicateChildAt is a no-op when the target path is not found', () => {
    const children: BoxedRowData[] = [
      { kind: 'list-item', depth: 1, path: 'stages[0]', name: 'Item 1', value: "'a'" },
    ];

    expect(duplicateChildAt(children, 'stages[5]')).toBe(children);
  });
});
