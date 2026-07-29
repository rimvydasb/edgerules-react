import 'fake-indexeddb/auto';
import {describe, expect, it, vi} from 'vitest';
import {fireEvent, render, screen, within} from '@testing-library/react';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {BoxedEditor} from '../BoxedEditor';
import {createBoxedEditorService} from '../service/createBoxedEditorService';
import {createDocumentationService} from '../../documentation-service';
import {createTestCasesService} from '../../test-cases-service';
import {
    containerPathFor,
    inferLiteralKind,
    isMovableKind,
    isValidDrop,
    type DragPayload,
    type DropTargetPayload,
} from '../dnd/dropRules';

function uniqueDbName(): string {
    return `dnd-test-${Math.random().toString(36).slice(2)}`;
}

function source(overrides: Partial<DragPayload>): DragPayload {
    return {
        path: 'source',
        kind: 'field',
        containerPath: 'sourceParent',
        containerKind: 'context',
        ...overrides,
    };
}

function target(overrides: Partial<DropTargetPayload>): DropTargetPayload {
    return {
        containerPath: 'targetParent',
        containerKind: 'context',
        index: 0,
        ...overrides,
    };
}

describe('dropRules: isValidDrop matrix', () => {
    it('a context field may drop on any context or the model root, never a complexType', () => {
        expect(isValidDrop(source({kind: 'field', containerKind: 'context'}), target({containerKind: 'context'}))).toBe(
            true,
        );
        expect(isValidDrop(source({kind: 'field', containerKind: 'context'}), target({containerKind: 'model'}))).toBe(
            true,
        );
        expect(
            isValidDrop(source({kind: 'field', containerKind: 'context'}), target({containerKind: 'complexType'})),
        ).toBe(false);
    });

    it('a complexType field may only drop on a complexType', () => {
        expect(
            isValidDrop(source({kind: 'field', containerKind: 'complexType'}), target({containerKind: 'complexType'})),
        ).toBe(true);
        expect(
            isValidDrop(source({kind: 'field', containerKind: 'complexType'}), target({containerKind: 'context'})),
        ).toBe(false);
        expect(
            isValidDrop(source({kind: 'field', containerKind: 'complexType'}), target({containerKind: 'model'})),
        ).toBe(false);
    });

    it('context/complexType/list/relation/function/ruleset may drop on any context or the model root', () => {
        for (const kind of ['context', 'complexType', 'list', 'relation', 'function', 'ruleset'] as const) {
            expect(isValidDrop(source({kind}), target({containerKind: 'context'}))).toBe(true);
            expect(isValidDrop(source({kind}), target({containerKind: 'model'}))).toBe(true);
            expect(isValidDrop(source({kind}), target({containerKind: 'list'}))).toBe(false);
        }
    });

    it('optimisation may only drop at the model root', () => {
        expect(isValidDrop(source({kind: 'optimisation'}), target({containerKind: 'model'}))).toBe(true);
        expect(isValidDrop(source({kind: 'optimisation'}), target({containerKind: 'context'}))).toBe(false);
    });

    it('rejects nesting a container inside its own subtree', () => {
        const dragged = source({kind: 'context', path: 'a'});
        expect(isValidDrop(dragged, target({containerKind: 'context', containerPath: 'a'}))).toBe(false);
        expect(isValidDrop(dragged, target({containerKind: 'context', containerPath: 'a.nested'}))).toBe(false);
        expect(isValidDrop(dragged, target({containerKind: 'context', containerPath: 'a[0]'}))).toBe(false);
    });

    it('a list-item may only drop on a list with a matching element shape, or an empty list', () => {
        const numberItem = source({kind: 'list-item', literalKind: 'number'});
        expect(isValidDrop(numberItem, target({containerKind: 'list', literalKind: 'number'}))).toBe(true);
        expect(isValidDrop(numberItem, target({containerKind: 'list', literalKind: 'string'}))).toBe(false);
        expect(isValidDrop(numberItem, target({containerKind: 'list', literalKind: undefined}))).toBe(true);
        expect(isValidDrop(numberItem, target({containerKind: 'relation'}))).toBe(false);
    });

    it('a relation-item may only drop on a relation with the same columns, or an empty relation', () => {
        const item = source({kind: 'relation-item', columns: ['name', 'age']});
        expect(isValidDrop(item, target({containerKind: 'relation', columns: ['age', 'name']}))).toBe(true);
        expect(isValidDrop(item, target({containerKind: 'relation', columns: ['name']}))).toBe(false);
        expect(isValidDrop(item, target({containerKind: 'relation', columns: []}))).toBe(true);
        expect(isValidDrop(item, target({containerKind: 'list'}))).toBe(false);
    });

    it('a rule may only reorder within its own ruleset', () => {
        const rule = source({kind: 'rule', containerPath: 'r1', containerKind: 'ruleset'});
        expect(isValidDrop(rule, target({containerKind: 'ruleset', containerPath: 'r1'}))).toBe(true);
        expect(isValidDrop(rule, target({containerKind: 'ruleset', containerPath: 'r2'}))).toBe(false);
        expect(isValidDrop(rule, target({containerKind: 'context', containerPath: 'r1'}))).toBe(false);
    });

    it('an optimisation-variable/-constraint may only reorder within its own group', () => {
        const variable = source({
            kind: 'optimisation-variable',
            containerPath: 'opt.variables',
            containerKind: 'optimisation-variable-group',
        });
        expect(
            isValidDrop(
                variable,
                target({containerKind: 'optimisation-variable-group', containerPath: 'opt.variables'}),
            ),
        ).toBe(true);
        expect(
            isValidDrop(
                variable,
                target({containerKind: 'optimisation-variable-group', containerPath: 'other.variables'}),
            ),
        ).toBe(false);
        expect(
            isValidDrop(
                variable,
                target({containerKind: 'optimisation-constraint-group', containerPath: 'opt.variables'}),
            ),
        ).toBe(false);

        const constraint = source({
            kind: 'optimisation-constraint',
            containerPath: 'opt.constraints',
            containerKind: 'optimisation-constraint-group',
        });
        expect(
            isValidDrop(
                constraint,
                target({containerKind: 'optimisation-constraint-group', containerPath: 'opt.constraints'}),
            ),
        ).toBe(true);
        expect(
            isValidDrop(
                constraint,
                target({containerKind: 'optimisation-constraint-group', containerPath: 'other.constraints'}),
            ),
        ).toBe(false);
    });

    it('never drops a non-draggable kind, defensively', () => {
        expect(isValidDrop(source({kind: 'ruleset-hit-policy'}), target({containerKind: 'context'}))).toBe(false);
        expect(isValidDrop(source({kind: 'model'}), target({containerKind: 'context'}))).toBe(false);
    });
});

describe('dropRules: helpers', () => {
    it('isMovableKind separates sortable kinds from fixed/SettingRow kinds', () => {
        expect(isMovableKind('field')).toBe(true);
        expect(isMovableKind('rule')).toBe(true);
        expect(isMovableKind('optimisation')).toBe(true);
        expect(isMovableKind('model')).toBe(false);
        expect(isMovableKind('function-result')).toBe(false);
        expect(isMovableKind('ruleset-hit-policy')).toBe(false);
        expect(isMovableKind('ruleset-default')).toBe(false);
        expect(isMovableKind('optimisation-variable-group')).toBe(false);
        expect(isMovableKind('optimisation-objective')).toBe(false);
        expect(isMovableKind('optimisation-constraint-group')).toBe(false);
        expect(isMovableKind('optimisation-setting')).toBe(false);
    });

    it('containerPathFor unwraps a rule past its synthetic .rules indexing prefix', () => {
        expect(containerPathFor({path: 'risk.rules[2]', kind: 'rule'})).toBe('risk');
        expect(containerPathFor({path: 'application.amount', kind: 'field'})).toBe('application');
        expect(containerPathFor({path: 'xs[0]', kind: 'list-item'})).toBe('xs');
    });

    it('inferLiteralKind classifies scalar DSL literals', () => {
        expect(inferLiteralKind('"hello"')).toBe('string');
        expect(inferLiteralKind("'hello'")).toBe('string');
        expect(inferLiteralKind('42')).toBe('number');
        expect(inferLiteralKind('-3.5')).toBe('number');
        expect(inferLiteralKind('true')).toBe('boolean');
        expect(inferLiteralKind('false')).toBe('boolean');
        expect(inferLiteralKind('x + 1')).toBe('other');
        expect(inferLiteralKind(undefined)).toBe('other');
    });
});

// --- Integration: real engine, real DOM gesture -------------------------------------------

function stubRect(element: HTMLElement, top: number): void {
    element.getBoundingClientRect = () =>
        ({
            x: 0,
            y: top,
            top,
            left: 0,
            right: 320,
            bottom: top + 40,
            width: 320,
            height: 40,
            toJSON: () => ({}),
        }) as DOMRect;
}

/** Simulates dnd-kit's `PointerSensor` gesture end to end: pointerdown on the source row's
 * handle, past the activation-distance threshold, onto the target row's own drop zone, then a
 * pointerup — mirroring `tests-manager/__tests__/TestsManager.test.tsx`'s column-drag test. */
function dragRowOnto(sourceTestId: string, targetTestId: string): void {
    const sourceRow = screen.getByTestId(sourceTestId);
    const targetRow = screen.getByTestId(targetTestId);
    stubRect(sourceRow, 0);
    stubRect(targetRow, 400);
    const handle = within(sourceRow).getByLabelText('Drag to reorder row');
    stubRect(handle, 0);

    fireEvent.pointerDown(handle, {pointerId: 1, clientX: 10, clientY: 10, button: 0, isPrimary: true});
    fireEvent.pointerMove(document, {pointerId: 1, clientX: 10, clientY: 30, isPrimary: true});
    fireEvent.pointerMove(document, {pointerId: 1, clientX: 10, clientY: 410, isPrimary: true});
    fireEvent.pointerUp(document, {pointerId: 1, clientX: 10, clientY: 410, isPrimary: true});
}

describe('BoxedEditor drag and drop', () => {
    it('reorders fields within their own parent', () => {
        const mutable = MutableDecisionService.fromCode('{ a: 1; b: 2; c: 3 }');
        const service = createBoxedEditorService(mutable);
        render(<BoxedEditor service={service} path="*" />);

        dragRowOnto('row-a', 'row-c');

        expect(Object.keys(mutable.toPortable())).toEqual(['@kind', 'b', 'c', 'a']);
    });

    it('reparents a field into another context', () => {
        const mutable = MutableDecisionService.fromCode('{ source: { value: 1 }; target: { existing: 2 } }');
        const service = createBoxedEditorService(mutable);
        render(<BoxedEditor service={service} path="*" />);

        dragRowOnto('row-source.value', 'row-target.existing');

        expect(mutable.toPortable()).toMatchObject({
            source: {'@kind': 'context'},
            target: {'@kind': 'context', value: 1, existing: 2},
        });
    });

    it('snaps back and issues no move() when a rule is dropped onto a foreign ruleset', () => {
        const mutable = MutableDecisionService.fromCode(`{
      ruleset a(x: number): {
        hitPolicy: "first-match"
        rules: [ { name: "r1", when: { x: > 0 }, then: { result: 1 } } ]
      }
      ruleset b(y: number): {
        hitPolicy: "first-match"
        rules: [ { name: "r2", when: { y: > 0 }, then: { result: 2 } } ]
      }
    }`);
        const service = createBoxedEditorService(mutable);
        const moveSpy = vi.spyOn(service, 'move');
        render(<BoxedEditor service={service} path="*" />);

        dragRowOnto('row-a.rules[0]', 'row-b.rules[0]');

        expect(moveSpy).not.toHaveBeenCalled();
        expect(mutable.toPortable()).toMatchObject({
            a: {'@rules': [{name: 'r1'}]},
            b: {'@rules': [{name: 'r2'}]},
        });
    });

    it('non-draggable kinds never render a drag handle', () => {
        const mutable = MutableDecisionService.fromCode(`{
      ruleset r(x: number): {
        hitPolicy: "first-match"
        rules: [ { name: "r1", when: { x: > 0 }, then: { result: 1 } } ]
        default: { result: 0 }
      }
    }`);
        const service = createBoxedEditorService(mutable);
        render(<BoxedEditor service={service} path="*" />);

        // Only the `r` ruleset header and its one `rule` are movable; `hitPolicy` and `default` are
        // fixed `SettingRow`s and never register a handle at all.
        expect(screen.getAllByLabelText('Drag to reorder row')).toHaveLength(2);
        expect(screen.getByTestId('row-r.hitPolicy').querySelector('[aria-label="Drag to reorder row"]')).toBeNull();
        expect(screen.getByTestId('row-r.default').querySelector('[aria-label="Drag to reorder row"]')).toBeNull();
    });

    it('readOnly keeps handles visible but blocks drag entirely', () => {
        const mutable = MutableDecisionService.fromCode('{ a: 1; b: 2 }');
        const service = createBoxedEditorService(mutable);
        const moveSpy = vi.spyOn(service, 'move');
        render(<BoxedEditor service={service} path="*" readOnly />);

        const handle = within(screen.getByTestId('row-a')).getByLabelText('Drag to reorder row');
        expect(handle).toBeInTheDocument();
        expect(handle).toHaveAttribute('aria-disabled', 'true');

        dragRowOnto('row-a', 'row-b');

        expect(moveSpy).not.toHaveBeenCalled();
        expect(Object.keys(mutable.toPortable())).toEqual(['@kind', 'a', 'b']);
    });

    it('migrates the description and test-case data of a moved field to its new path', async () => {
        const mutable = MutableDecisionService.fromCode('{ source: { value: 1 }; target: { existing: 2 } }');
        const service = createBoxedEditorService(mutable);

        const documentationService = createDocumentationService('dnd-model', {dbName: uniqueDbName()});
        await new Promise<void>((resolve) => {
            const unsubscribe = documentationService.subscribe(() => {
                unsubscribe();
                resolve();
            });
        });
        documentationService.setDescription('source.value', 'The starting value');

        const testCasesService = createTestCasesService('dnd-model', '*', {dbName: uniqueDbName()});
        await new Promise<void>((resolve) => {
            const unsubscribe = testCasesService.subscribe(() => {
                unsubscribe();
                resolve();
            });
        });
        testCasesService.syncRows([{path: 'source.value', section: 'inputs', order: 0, present: true}]);
        const testCase = testCasesService.addTestCase('Case 1');
        testCasesService.setCell(testCase.id, 'source.value', 'input', '42');
        testCasesService.saveResultSet({
            testCaseId: testCase.id,
            ranAt: Date.now(),
            status: 'ok',
            results: {'source.value': {path: 'source.value', value: 1, status: 'ok'}},
        });

        render(
            <BoxedEditor
                service={service}
                path="*"
                documentationService={documentationService}
                testCasesService={testCasesService}
                testSubjectId="*"
            />,
        );

        dragRowOnto('row-source.value', 'row-target.existing');

        expect(mutable.toPortable()).toMatchObject({
            target: {'@kind': 'context', value: 1, existing: 2},
        });
        expect(documentationService.getDescription('target.value')).toBe('The starting value');
        expect(documentationService.getDescription('source.value')).toBeUndefined();

        expect(testCasesService.listRows()).toEqual([
            {path: 'target.value', section: 'inputs', order: 0, present: true},
        ]);
        expect(testCasesService.listTestCases()[0]).toMatchObject({inputs: {'target.value': '42'}});
        expect(testCasesService.getResultSet(testCase.id)?.results).toMatchObject({
            'target.value': {path: 'target.value', value: 1, status: 'ok'},
        });

        documentationService.dispose();
        testCasesService.dispose();
    });
});
