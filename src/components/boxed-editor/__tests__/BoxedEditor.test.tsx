import 'fake-indexeddb/auto';
import {describe, expect, it} from 'vitest';
import {render, screen} from '@testing-library/react';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {BoxedEditor} from '../BoxedEditor';
import {createBoxedEditorService} from '../service/createBoxedEditorService';
import {createTestCasesService} from '../../test-cases-service';

const MODEL = `{
  type Applicant: { name: <string, required: true> }
  application: { amount: <number, required: true> }
  payment: 42
}`;

function buildService() {
    return createBoxedEditorService(MutableDecisionService.fromCode(MODEL));
}

function uniqueDbName(): string {
    return `boxed-editor-test-${Math.random().toString(36).slice(2)}`;
}

describe('BoxedEditor', () => {
    it('renders the model header and root rows against a real MutableDecisionService', () => {
        render(<BoxedEditor service={buildService()} path="*" />);

        expect(screen.getByRole('treegrid')).toBeInTheDocument();
        expect(screen.getByText('Model')).toBeInTheDocument();
        expect(screen.getByText('Applicant')).toBeInTheDocument();
        expect(screen.getByText('application')).toBeInTheDocument();
        expect(screen.getByText('payment')).toBeInTheDocument();
        expect(screen.getByText('42')).toBeInTheDocument();
        // The complexType's field is a nested row, rendered because rows start expanded.
        expect(screen.getByText('name')).toBeInTheDocument();
    });

    it('renders a focused container path without the model header row', () => {
        render(<BoxedEditor service={buildService()} path="application" />);

        expect(screen.queryByText('Model')).not.toBeInTheDocument();
        expect(screen.getByText('amount')).toBeInTheDocument();
    });

    it('hides the model header when showHeader is false', () => {
        render(<BoxedEditor service={buildService()} path="*" showHeader={false} />);

        expect(screen.queryByText('Model')).not.toBeInTheDocument();
        expect(screen.getByText('payment')).toBeInTheDocument();
    });

    it('shows a fatal alert for a path that does not exist in the model', () => {
        render(<BoxedEditor service={buildService()} path="missing" />);

        expect(screen.getByRole('alert')).toHaveTextContent('missing');
        expect(screen.queryByRole('treegrid')).not.toBeInTheDocument();
    });

    it('keeps drag handles visible (not hidden) under readOnly', () => {
        const {rerender} = render(<BoxedEditor service={buildService()} path="*" readOnly={false} />);
        expect(screen.getAllByLabelText('Drag to reorder row').length).toBeGreaterThan(0);

        rerender(<BoxedEditor service={buildService()} path="*" readOnly />);
        expect(screen.getAllByLabelText('Drag to reorder row').length).toBeGreaterThan(0);
    });

    it('hides the test-results column entirely when no testCasesService is provided', () => {
        const {container} = render(<BoxedEditor service={buildService()} path="*" />);

        expect(container.querySelectorAll('[data-column="description"]').length).toBeGreaterThan(0);
        expect(container.querySelectorAll('[data-column="test-results"]').length).toBe(0);
    });

    it('toggles the description and test-results columns via props', () => {
        const testCasesService = createTestCasesService('model', '*', {dbName: uniqueDbName()});
        const {container, rerender} = render(
            <BoxedEditor service={buildService()} path="*" testCasesService={testCasesService} />,
        );
        expect(container.querySelectorAll('[data-column="description"]').length).toBeGreaterThan(0);
        expect(container.querySelectorAll('[data-column="test-results"]').length).toBeGreaterThan(0);

        rerender(
            <BoxedEditor
                service={buildService()}
                path="*"
                testCasesService={testCasesService}
                showDescription={false}
                showTestResults={false}
            />,
        );
        expect(container.querySelectorAll('[data-column="description"]').length).toBe(0);
        expect(container.querySelectorAll('[data-column="test-results"]').length).toBe(0);

        testCasesService.dispose();
    });
});
