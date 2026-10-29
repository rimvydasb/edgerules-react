import 'fake-indexeddb/auto';
import {describe, expect, it, vi} from 'vitest';
import {render, screen, waitFor, within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {BoxedEditor} from '../BoxedEditor';
import {createBoxedEditorService} from '../service/createBoxedEditorService';
import {createTestCasesService, type TestCasesService} from '../../test-cases-service';
import {createTestRunner} from '../../tests-manager';
import type {MutableDecisionService as RunnerService, TestSubject} from '../../tests-manager';

const MODEL = `{
  amount: <number>
  doubled: amount * 2
  ruleset band(age: number): {
    hitPolicy: "first-match"
    rules: [{ when: { age: < 30 }, then: { level: "young" } }]
    default: { level: "none" }
  }
}`;

const MODEL_SUBJECT: TestSubject = {id: '*', kind: 'model', name: 'Model'};

function uniqueDbName(prefix: string): string {
    return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function waitForHydration(service: TestCasesService): Promise<void> {
    return new Promise((resolve) => {
        const unsubscribe = service.subscribe(() => {
            unsubscribe();
            resolve();
        });
    });
}

function columnCount(container: HTMLElement, column: string): number {
    return container.querySelectorAll(`[data-column="${column}"]`).length;
}

describe('header row', () => {
    it('shows the model name and the plus menu at the model root', async () => {
        const user = userEvent.setup();
        render(<BoxedEditor service={createBoxedEditorService(MutableDecisionService.fromCode(MODEL))} path="*" />);

        const header = screen.getByTestId('row-*');
        expect(within(header).getByRole('heading')).toHaveTextContent('Model');

        await user.click(within(header).getByRole('button', {name: 'Open row actions'}));
        expect(await screen.findByRole('menuitem', {name: 'Add field'})).toBeInTheDocument();
        // Model settings is its own header button, not an item of the add menu.
        expect(screen.queryByRole('menuitem', {name: 'Model settings'})).not.toBeInTheDocument();
        await user.keyboard('{Escape}');

        await user.click(within(header).getByRole('button', {name: 'Model settings'}));
        expect(await screen.findByRole('dialog', {name: 'Model settings'})).toBeInTheDocument();
    });

    it('shows the metaphor name and no plus menu for an opened entity', () => {
        render(<BoxedEditor service={createBoxedEditorService(MutableDecisionService.fromCode(MODEL))} path="band" />);

        const header = screen.getByTestId('header-row');
        expect(within(header).getByRole('heading')).toHaveTextContent('Decision table');
        expect(within(header).queryByRole('button', {name: 'Open row actions'})).not.toBeInTheDocument();
        expect(within(header).queryByRole('button', {name: 'Model settings'})).not.toBeInTheDocument();
        // The opened ruleset keeps its own row below the header.
        expect(screen.getByTestId('row-band')).toHaveTextContent('band');
    });

    it('shows the description column and hides the test column by default; the toggles switch them', async () => {
        const user = userEvent.setup();
        const testCasesService = createTestCasesService('model', '*', {dbName: uniqueDbName('toggles')});
        const {container} = render(
            <BoxedEditor
                service={createBoxedEditorService(MutableDecisionService.fromCode(MODEL))}
                path="band"
                testCasesService={testCasesService}
            />,
        );

        expect(columnCount(container, 'description')).toBeGreaterThan(0);
        expect(columnCount(container, 'test-results')).toBe(0);

        await user.click(screen.getByRole('button', {name: 'Hide description'}));
        expect(columnCount(container, 'description')).toBe(0);
        expect(screen.getByRole('button', {name: 'Show description'})).toHaveAttribute('aria-pressed', 'false');

        await user.click(screen.getByRole('button', {name: 'Show test column'}));
        expect(columnCount(container, 'test-results')).toBeGreaterThan(0);
        expect(screen.getByRole('button', {name: 'Hide test column'})).toHaveAttribute('aria-pressed', 'true');

        testCasesService.dispose();
    });

    it('hides the test column toggle without a TestCasesService', () => {
        render(<BoxedEditor service={createBoxedEditorService(MutableDecisionService.fromCode(MODEL))} path="*" />);

        expect(screen.getByRole('button', {name: 'Hide description'})).toBeInTheDocument();
        expect(screen.queryByRole('button', {name: 'Show test column'})).not.toBeInTheDocument();
    });

    it('runs the first test case when the test column is shown, and the selected case on navigation', async () => {
        const user = userEvent.setup();
        const mutable = MutableDecisionService.fromCode(MODEL);
        const testCasesService = createTestCasesService('model', '*', {dbName: uniqueDbName('run-on-show')});
        await waitForHydration(testCasesService);
        testCasesService.syncRows([{path: 'amount', section: 'inputs', order: 0, type: 'number', present: true}]);
        const first = testCasesService.addTestCase('First');
        testCasesService.setCell(first.id, 'amount', 'input', '3');
        const second = testCasesService.addTestCase('Second');
        testCasesService.setCell(second.id, 'amount', 'input', '5');
        const runner = createTestRunner(mutable as unknown as RunnerService, testCasesService, MODEL_SUBJECT, {
            modelRevision: 'rev-0',
        });
        const runSpy = vi.spyOn(runner, 'run');

        render(
            <BoxedEditor
                service={createBoxedEditorService(mutable)}
                path="*"
                testCasesService={testCasesService}
                testRunner={runner}
                testSubjectId="*"
                revision="rev-0"
            />,
        );

        // A hidden test column runs nothing.
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(runSpy).not.toHaveBeenCalled();

        await user.click(screen.getByRole('button', {name: 'Show test column'}));
        await waitFor(() => expect(runSpy).toHaveBeenCalledWith(first.id));
        const doubledResult = () =>
            screen.getByTestId('row-doubled').querySelector('[data-column="test-results"]')?.textContent;
        await waitFor(() => expect(doubledResult()).toBe('6'));

        await user.click(screen.getByRole('button', {name: 'Next test case'}));
        await waitFor(() => expect(runSpy).toHaveBeenCalledWith(second.id));
        await waitFor(() => expect(doubledResult()).toBe('10'));
        expect(within(screen.getByTestId('row-*')).getByText('2/2')).toBeInTheDocument();

        testCasesService.dispose();
    });
});
