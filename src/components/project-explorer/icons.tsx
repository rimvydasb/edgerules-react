import type {ReactElement} from 'react';
import {
    IconBook2,
    IconBox,
    IconBraces,
    IconCategory,
    IconChartLine,
    IconFlask,
    IconListCheck,
    IconLogin2,
    IconLogout2,
    IconMathFunction,
    IconServer,
    IconTag,
    IconVariable,
    type Icon,
} from '@tabler/icons-react';
import {cx} from '#ui/cx';
import {KIND_COLORS} from '#ui/kindColors';
import type {ExplorerEntryKind, ExplorerSection} from './tree-model';
import * as classes from './projectExplorer.module.css';

export type IconKind = ExplorerEntryKind | ExplorerSection;

const ICON_BY_KIND: Record<IconKind, Icon> = {
    types: IconCategory,
    methods: IconMathFunction,
    variables: IconVariable,
    workbooks: IconBook2,
    tests: IconFlask,
    type: IconTag,
    function: IconMathFunction,
    service: IconServer,
    ruleset: IconListCheck,
    context: IconBraces,
    variable: IconVariable,
    workbook: IconBook2,
    'input-node': IconLogin2,
    'function-node': IconMathFunction,
    'output-node': IconLogout2,
    'chart-node': IconChartLine,
    node: IconBox,
    test: IconFlask,
};

// The tile fill of each kind, in the shared kind colors and the Node palette colors of the Flow Editor. Sections,
// contexts and variables have no kind color: a muted tile.
const TILE_COLOR: Partial<Record<IconKind, string>> = {
    type: KIND_COLORS.complexType,
    function: KIND_COLORS.function,
    service: KIND_COLORS.function,
    ruleset: KIND_COLORS.ruleset,
    workbook: KIND_COLORS.model,
    'input-node': '#ed6c02',
    'function-node': KIND_COLORS.function,
    'output-node': '#2f9e44',
    'chart-node': '#7048e8',
    test: '#2f9e44',
};

export interface KindIconProps {
    kind: IconKind;
}

/** The icon tile of a tree node, like a Node palette tile. */
export function KindIcon({kind}: KindIconProps): ReactElement {
    const Glyph = ICON_BY_KIND[kind];
    const color = TILE_COLOR[kind];
    return (
        <span className={cx(classes.tile, !color && classes.tileMuted)} style={color ? {background: color} : undefined}>
            <Glyph size={14} stroke={2} data-testid={`icon-${kind}`} />
        </span>
    );
}
