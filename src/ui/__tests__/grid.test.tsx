import {createRef, type ReactNode} from 'react';
import {describe, expect, it, vi} from 'vitest';
import {render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {CellInput, GridBody, GridCell, GridHead, GridRow, GridTable} from '../grid';
import {cx} from '../cx';

function renderGrid(ui: ReactNode) {
    return render(
        <GridTable aria-label="grid">
            <GridHead>
                <GridRow>
                    <GridCell header>Name</GridCell>
                </GridRow>
            </GridHead>
            <GridBody>{ui}</GridBody>
        </GridTable>,
    );
}

describe('cx', () => {
    it('keeps the truthy class names only', () => {
        expect(cx('a', false, undefined, null, 'b')).toBe('a b');
        expect(cx()).toBe('');
    });
});

describe('grid primitives', () => {
    it('render semantic table elements without any library component', () => {
        renderGrid(
            <GridRow>
                <GridCell>one</GridCell>
            </GridRow>,
        );
        expect(screen.getByRole('table', {name: 'grid'})).toBeInTheDocument();
        expect(screen.getByRole('columnheader', {name: 'Name'}).tagName).toBe('TH');
        const cell = screen.getByRole('cell', {name: 'one'});
        expect(cell.tagName).toBe('TD');
        // Plain elements: no Mantine / MUI class names on grid cells.
        expect(cell.className).not.toMatch(/mantine|Mui/);
    });

    it('GridCell applies alignment, fill and borderless modifiers as classes', () => {
        renderGrid(
            <GridRow>
                <GridCell align="center" fill borderless data-testid="cell">
                    x
                </GridCell>
            </GridRow>,
        );
        const cell = screen.getByTestId('cell');
        expect(cell.className).toMatch(/center/);
        expect(cell.className).toMatch(/fill/);
        expect(cell.className).toMatch(/borderless/);
    });

    it('GridRow forwards its ref and adds a hover class only on request', () => {
        const ref = createRef<HTMLTableRowElement>();
        renderGrid(
            <>
                <GridRow ref={ref} hover data-testid="hover">
                    <GridCell>a</GridCell>
                </GridRow>
                <GridRow data-testid="plain">
                    <GridCell>b</GridCell>
                </GridRow>
            </>,
        );
        expect(ref.current).toBe(screen.getByTestId('hover'));
        expect(screen.getByTestId('hover').className).not.toBe('');
        expect(screen.getByTestId('plain').className).toBe('');
    });

    it('CellInput is a plain <input> that forwards its ref and events', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        const ref = createRef<HTMLInputElement>();
        renderGrid(
            <GridRow>
                <GridCell fill>
                    <CellInput ref={ref} aria-label="value" onChange={onChange} />
                </GridCell>
            </GridRow>,
        );
        const input = screen.getByRole('textbox', {name: 'value'});
        expect(input.tagName).toBe('INPUT');
        expect(ref.current).toBe(input);
        await user.type(input, 'ab');
        expect(onChange).toHaveBeenCalledTimes(2);
    });
});
