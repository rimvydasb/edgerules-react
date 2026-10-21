import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';
import {InlineInput} from '../InlineInput';

function setup(onCommit: (text: string) => string | void = () => undefined) {
    const commit = vi.fn(onCommit);
    const cancel = vi.fn();
    render(<InlineInput value="age" ariaLabel="Name" onCommit={commit} onCancel={cancel} />);
    return {input: screen.getByLabelText('Name'), commit, cancel};
}

describe('InlineInput', () => {
    it('focuses and selects the value on mount', () => {
        const {input} = setup();
        expect(input).toHaveFocus();
        expect((input as HTMLInputElement).selectionEnd).toBe(3);
    });

    it('commits the text on Enter once', () => {
        const {input, commit} = setup();
        fireEvent.change(input, {target: {value: 'years'}});
        fireEvent.keyDown(input, {key: 'Enter'});
        fireEvent.blur(input);
        expect(commit).toHaveBeenCalledTimes(1);
        expect(commit).toHaveBeenCalledWith('years');
    });

    it('cancels on Escape without a commit', () => {
        const {input, commit, cancel} = setup();
        fireEvent.keyDown(input, {key: 'Escape'});
        fireEvent.blur(input);
        expect(cancel).toHaveBeenCalledTimes(1);
        expect(commit).not.toHaveBeenCalled();
    });

    it('stays open and shows the error of a rejected commit', () => {
        const {input} = setup(() => 'Name is taken');
        fireEvent.keyDown(input, {key: 'Enter'});
        expect(input).toHaveAttribute('aria-invalid', 'true');
        expect(input).toHaveAttribute('title', 'Name is taken');
        fireEvent.change(input, {target: {value: 'other'}});
        expect(input).not.toHaveAttribute('aria-invalid');
    });

    it('cancels on click away after a rejected commit', () => {
        const {input, commit, cancel} = setup(() => 'Name is taken');
        fireEvent.keyDown(input, {key: 'Enter'});
        fireEvent.blur(input);
        expect(commit).toHaveBeenCalledTimes(1);
        expect(cancel).toHaveBeenCalledTimes(1);
    });

    it('does not let keys reach the canvas', () => {
        const onKeyDown = vi.fn();
        render(
            <div onKeyDown={onKeyDown}>
                <InlineInput value="age" ariaLabel="Name" onCommit={() => undefined} onCancel={() => undefined} />
            </div>,
        );
        fireEvent.keyDown(screen.getByLabelText('Name'), {key: 'Delete'});
        expect(onKeyDown).not.toHaveBeenCalled();
    });
});
