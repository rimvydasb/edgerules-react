import {IconListCheck, IconMathFunction} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import type {CalleeKind, KindIconProps} from './types';

export const KIND_COLOR: Record<CalleeKind, string> = {
    function: '#1976d2',
    ruleset: '#6a1b9a',
};

/** The Boxed Editor icon of a callee kind on its kind color. */
export function KindIcon({kind, size, className}: KindIconProps): ReactElement {
    const Icon = kind === 'ruleset' ? IconListCheck : IconMathFunction;
    return (
        <span className={className} style={{background: KIND_COLOR[kind]}} aria-hidden>
            <Icon size={size} stroke={2} />
        </span>
    );
}
