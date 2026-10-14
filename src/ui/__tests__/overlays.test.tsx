import {describe, expect, it, vi} from 'vitest';
import {act, render, screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {ErrorPopover} from '../ErrorPopover';
import {Toast} from '../Toast';

describe('Toast', () => {
    it('renders nothing while closed', () => {
        render(<Toast open={false} message="hello" onClose={() => {}} />);
        expect(screen.queryByText('hello')).not.toBeInTheDocument();
    });

    it('shows the message and action, and closes on dismiss', async () => {
        const user = userEvent.setup();
        const onClose = vi.fn();
        const onUndo = vi.fn();
        render(<Toast open message="Rule deleted" action={<button onClick={onUndo}>Undo</button>} onClose={onClose} />);
        expect(screen.getByText('Rule deleted')).toBeInTheDocument();
        await user.click(screen.getByRole('button', {name: 'Undo'}));
        expect(onUndo).toHaveBeenCalled();
        await user.click(screen.getByRole('button', {name: 'Dismiss'}));
        expect(onClose).toHaveBeenCalled();
    });

    it('closes itself after autoHideDuration, even when the parent passes a fresh onClose each render', () => {
        vi.useFakeTimers();
        try {
            const onClose = vi.fn();
            const {rerender} = render(<Toast open message="m" autoHideDuration={1000} onClose={() => onClose()} />);
            act(() => {
                vi.advanceTimersByTime(600);
            });
            // A re-render with a new closure must not restart the countdown.
            rerender(<Toast open message="m" autoHideDuration={1000} onClose={() => onClose()} />);
            act(() => {
                vi.advanceTimersByTime(500);
            });
            expect(onClose).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });
});

describe('ErrorPopover', () => {
    it('shows nothing without a message and an alert with one', () => {
        const {rerender} = render(
            <ErrorPopover>
                <input aria-label="field" />
            </ErrorPopover>,
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        rerender(
            <ErrorPopover message="Names must start with a letter.">
                <input aria-label="field" />
            </ErrorPopover>,
        );
        expect(screen.getByRole('alert')).toHaveTextContent('Names must start with a letter.');
    });
});
