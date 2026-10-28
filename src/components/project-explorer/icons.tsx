import type {ReactElement} from 'react';
import {Indicator, Tooltip} from '@mantine/core';
import {
    IconBraces,
    IconCategory,
    IconList,
    IconListCheck,
    IconMathFunction,
    IconTag,
    IconVariable,
    type Icon,
} from '@tabler/icons-react';
import type {PortableError} from '@edgerules/portable';
import {cx} from '#ui/cx';
import {KIND_COLORS} from '#ui/kindColors';
import * as classes from './projectExplorer.module.css';

export type IconKind = 'vars' | 'var' | 'ctx' | 'func' | 'dt' | 'types' | 'type';

const ICON_BY_KIND: Record<IconKind, Icon> = {
    vars: IconList,
    var: IconVariable,
    ctx: IconBraces,
    func: IconMathFunction,
    dt: IconListCheck,
    types: IconCategory,
    type: IconTag,
};

// The tile fill of each kind, in the shared kind colors. Contexts and variables have no kind color: a muted tile.
const TILE_COLOR: Partial<Record<IconKind, string>> = {
    func: KIND_COLORS.function,
    dt: KIND_COLORS.ruleset,
    types: KIND_COLORS.complexType,
    type: KIND_COLORS.complexType,
};

export interface KindIconProps {
    kind: IconKind;
    /** When present, renders an error badge + a tooltip surfacing the message/location. */
    error?: PortableError;
}

/** The icon tile of a tree node, like a Node palette tile. Renders an error badge/tooltip when `error` is set. */
export function KindIcon({kind, error}: KindIconProps): ReactElement {
    const Glyph = ICON_BY_KIND[kind];
    const color = TILE_COLOR[kind];
    const icon = (
        <span className={cx(classes.tile, !color && classes.tileMuted)} style={color ? {background: color} : undefined}>
            <Glyph size={14} stroke={2} data-testid={`icon-${kind}`} />
        </span>
    );

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
