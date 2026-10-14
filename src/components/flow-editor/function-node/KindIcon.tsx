import {IconListCheck, IconMathFunction} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import type {CalleeRef} from '../flow-editor-types';

export const KIND_COLOR: Record<CalleeRef['kind'], string> = {
    function: '#1976d2',
    ruleset: '#6a1b9a',
};

/** The Boxed Editor icon of a callee kind. The caller sets the background through `className`. */
export function KindIcon({
    kind,
    size,
    className,
}: {
    kind: CalleeRef['kind'];
    size: number;
    className?: string;
}): ReactElement {
    const Icon = kind === 'ruleset' ? IconListCheck : IconMathFunction;
    return (
        <span className={className} style={{background: KIND_COLOR[kind]}} aria-hidden>
            <Icon size={size} stroke={2} />
        </span>
    );
}
