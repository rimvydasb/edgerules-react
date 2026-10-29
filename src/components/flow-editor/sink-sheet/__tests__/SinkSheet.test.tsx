import {MutableDecisionService} from '@edgerules/node/mutable';
import {render, within} from '@testing-library/react';
import {describe, expect, it} from 'vitest';
import {createFlowEditorService} from '../../service/createFlowEditorService';
import {SinkSheet, type SinkSelection} from '../SinkSheet';

const MODEL = `{
    func tiers(base: number): [{ name: "prime"; limit: base }, { name: "standard"; limit: base * 2 }]
    applicant: { name: "Ann"; address: { city: "Vilnius" } }
    rows: tiers(base: 1000)
    numbers: [1, 2, 3]
}`;

function renderSheet(sink: SinkSelection) {
    const service = createFlowEditorService(MutableDecisionService.fromCode(MODEL));
    const {container} = render(<SinkSheet service={service} sink={sink} />);
    return within(container).getByTestId('sink-sheet');
}

describe('SinkSheet', () => {
    it('asks for a wire while nothing is wired', () => {
        const sheet = renderSheet({kind: 'chart', id: 'chart'});
        expect(within(sheet).getByText('Chart')).toBeInTheDocument();
        expect(within(sheet).getByText(/Wire a result into this node/)).toBeInTheDocument();
    });

    it('shows a record field by field, a nested record as an indented level', async () => {
        const sheet = renderSheet({kind: 'output', id: 'output', label: 'Applicant', source: 'applicant'});
        expect(within(sheet).getByText('Applicant')).toBeInTheDocument();
        expect(await within(sheet).findByText('2 fields')).toBeInTheDocument();
        expect(within(sheet).getByText('name')).toBeInTheDocument();
        expect(within(sheet).getByText("'Ann'")).toBeInTheDocument();
        expect(within(sheet).getByText('address')).toBeInTheDocument();
        expect(within(sheet).getByText('city').closest('[data-depth]')).toHaveAttribute('data-depth', '2');
        expect(within(sheet).getByText("'Vilnius'")).toBeInTheDocument();
    });

    it('shows a list one item per row and a list of records as one table', async () => {
        const list = renderSheet({kind: 'output', id: 'output', source: 'numbers'});
        expect(await within(list).findByText('3 items')).toBeInTheDocument();
        expect(within(list).getByText('[3]')).toBeInTheDocument();

        const table = renderSheet({kind: 'chart', id: 'chart', source: 'rows'});
        const grid = await within(table).findByTestId('sink-sheet-table');
        expect(
            within(grid)
                .getAllByRole('columnheader')
                .map((cell) => cell.textContent),
        ).toEqual(['#', 'name', 'limit']);
        expect(within(grid).getByText('standard')).toBeInTheDocument();
        expect(within(grid).getByText('2000')).toBeInTheDocument();
    });

    it('shows why the engine cannot evaluate the wired path', async () => {
        const sheet = renderSheet({kind: 'output', id: 'output', source: 'missing'});
        expect(await within(sheet).findByRole('alert')).toBeInTheDocument();
    });
});
