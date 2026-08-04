import {describe, expect, it} from 'vitest';
import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MutableDecisionService} from '@edgerules/node/mutable';
import {BoxedEditor} from '../BoxedEditor';
import {createBoxedEditorService} from '../service/createBoxedEditorService';

const MODEL = `{
  a: <number, required: true>
  b: <string, required: true>
}`;

function buildService() {
    return createBoxedEditorService(MutableDecisionService.fromCode(MODEL));
}

describe('BoxedEditor alt-reveal', () => {
    it('hovering one name reveals only its own type tooltip', async () => {
        const user = userEvent.setup();
        render(<BoxedEditor service={buildService()} path="*" />);

        expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

        await user.hover(screen.getByText('a'));
        await waitFor(() => expect(screen.getAllByRole('tooltip')).toHaveLength(1));
        expect(screen.getByRole('tooltip')).toHaveTextContent('number');

        await user.unhover(screen.getByText('a'));
        await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    });

    it('holding Alt reveals every type tooltip in the tree at once', async () => {
        const user = userEvent.setup();
        render(<BoxedEditor service={buildService()} path="*" />);

        await user.keyboard('{Alt>}');
        await waitFor(() => expect(screen.getAllByRole('tooltip').length).toBeGreaterThanOrEqual(2));
        const tooltipText = screen.getAllByRole('tooltip').map((tooltip) => tooltip.textContent);
        expect(tooltipText).toEqual(expect.arrayContaining(['number', 'string']));

        await user.keyboard('{/Alt}');
        await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    });

    it('the window losing focus closes every Alt-revealed tooltip', async () => {
        const user = userEvent.setup();
        render(<BoxedEditor service={buildService()} path="*" />);

        await user.keyboard('{Alt>}');
        await waitFor(() => expect(screen.getAllByRole('tooltip').length).toBeGreaterThanOrEqual(2));

        window.dispatchEvent(new Event('blur'));
        await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
    });
});
