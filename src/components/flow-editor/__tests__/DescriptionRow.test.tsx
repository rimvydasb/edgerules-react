import {fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';
import {describe, expect, it} from 'vitest';
import {createDocumentationService} from '../../documentation-service';
import {DescriptionRow} from '../function-node/DescriptionRow';

function setup(initial?: string) {
    const documentation = createDocumentationService(`desc-${Math.random()}`);
    if (initial !== undefined) documentation.setDescription('decision', initial);
    function Harness() {
        const [editing, setEditing] = useState(false);
        return (
            <DescriptionRow
                documentation={documentation}
                field="decision"
                editing={editing}
                onEditingChange={setEditing}
            />
        );
    }
    render(<Harness />);
    return documentation;
}

describe('DescriptionRow', () => {
    it('renders nothing without a description', () => {
        setup();
        expect(screen.queryByText(/./)).not.toBeInTheDocument();
    });

    it('shows the description and edits it on click', () => {
        const documentation = setup('Old text');
        fireEvent.click(screen.getByText('Old text'));
        const input = screen.getByLabelText('Description of decision');
        expect(input).toHaveValue('Old text');
        fireEvent.change(input, {target: {value: 'New text'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(documentation.getDescription('decision')).toBe('New text');
        expect(screen.getByText('New text')).toBeInTheDocument();
    });

    it('an empty commit deletes the description', () => {
        const documentation = setup('Old text');
        fireEvent.click(screen.getByText('Old text'));
        const input = screen.getByLabelText('Description of decision');
        fireEvent.change(input, {target: {value: '   '}});
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(documentation.getDescription('decision')).toBeUndefined();
        expect(screen.queryByLabelText('Description of decision')).not.toBeInTheDocument();
    });

    it('Escape restores the old text', () => {
        const documentation = setup('Old text');
        fireEvent.click(screen.getByText('Old text'));
        const input = screen.getByLabelText('Description of decision');
        fireEvent.change(input, {target: {value: 'Changed'}});
        fireEvent.keyDown(input, {key: 'Escape'});
        expect(documentation.getDescription('decision')).toBe('Old text');
        expect(screen.getByText('Old text')).toBeInTheDocument();
    });

    it('commits on click away', () => {
        const documentation = setup('Old text');
        fireEvent.click(screen.getByText('Old text'));
        const input = screen.getByLabelText('Description of decision');
        fireEvent.change(input, {target: {value: 'Blurred'}});
        fireEvent.blur(input);
        expect(documentation.getDescription('decision')).toBe('Blurred');
    });
});
