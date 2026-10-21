import type {ReactElement} from 'react';
import {Indicator, Tooltip} from '@mantine/core';
import {
    IconBraces,
    IconCategory,
    IconFolder,
    IconList,
    IconMathFunction,
    IconTable,
    IconTag,
    type Icon,
} from '@tabler/icons-react';
import type {PortableError} from '@edgerules/portable';

export type IconKind = 'vars' | 'var' | 'ctx' | 'func' | 'dt' | 'types' | 'type';

const ICON_BY_KIND: Record<IconKind, Icon> = {
    vars: IconList,
    var: IconBraces,
    ctx: IconFolder,
    func: IconMathFunction,
    dt: IconTable,
    types: IconCategory,
    type: IconTag,
};

export interface KindIconProps {
    kind: IconKind;
    /** When present, renders an error badge + a tooltip surfacing the message/location. */
    error?: PortableError;
}

/** Icon for a tree node, per the story doc's icon table. Renders an error badge/tooltip when `error` is set. */
export function KindIcon({kind, error}: KindIconProps): ReactElement {
    const Glyph = ICON_BY_KIND[kind];
    const icon = <Glyph size={18} data-testid={`icon-${kind}`} />;

    if (!error) {
        return icon;
    }

    const location = error.location;
    const locationSuffix = location?.line !== undefined ? ` (${location.line}:${location.column ?? 0})` : '';

    return (
        <Tooltip label={`${error.message}${locationSuffix}`} withinPortal>
            <Indicator color="red" size={8} offset={1} aria-label="error">
                {icon}
            </Indicator>
        </Tooltip>
    );
}
