import {IconBox, IconChartLine, IconListCheck, IconMathFunction} from '@tabler/icons-react';
import type {ReactElement} from 'react';
import {KIND_COLORS} from '#ui/kindColors';
import type {InputDeclarationKind} from './types';
import styles from './inputNode.module.css';

const KINDS = {
    function: {Icon: IconMathFunction, color: KIND_COLORS.function, label: 'Function'},
    ruleset: {Icon: IconListCheck, color: KIND_COLORS.ruleset, label: 'Ruleset'},
    optimisation: {Icon: IconChartLine, color: KIND_COLORS.optimisation, label: 'Optimisation'},
    type: {Icon: IconBox, color: KIND_COLORS.complexType, label: 'Type'},
} as const;

/** The small kind badge before a declaration name, in the Boxed Editor kind colors. */
export function DeclarationIcon({kind}: {kind: InputDeclarationKind}): ReactElement {
    const {Icon, color, label} = KINDS[kind];
    return (
        <span className={styles.declaration} style={{background: color}} title={label} role="img" aria-label={label}>
            <Icon size={12} stroke={2} />
        </span>
    );
}
