import {ActionIcon, CloseButton, ScrollArea, TextInput, Tooltip} from '@mantine/core';
import {
    IconArrowBarToRight,
    IconChartLine,
    IconGripVertical,
    IconLayoutSidebarLeftCollapse,
    IconLayoutSidebarLeftExpand,
    IconListDetails,
    IconLogin2,
    IconLogout2,
    IconMath,
    IconMathFunction,
    IconSearch,
    IconTargetArrow,
    IconVariable,
} from '@tabler/icons-react';
import {useState, type DragEvent, type KeyboardEvent, type ReactElement} from 'react';
import {CHART_COLOR} from '../chart-node/ChartNode';
import {EXPRESSION_COLOR} from '../expression-node/ExpressionNode';
import {KIND_COLOR} from '../function-node/KindIcon';
import {PARAMETER_COLOR} from '../parameter-node/ParameterNode';
import {RETURN_COLOR} from '../return-node/ReturnNode';
import {DRAG_TYPE, filterItems, GROUP_LABEL, GROUP_ORDER} from './paletteItems';
import type {NodePaletteProps, PaletteIcon, PaletteItem} from './types';
import styles from './flowEditor.module.css';

export const ICON_COLOR: Record<PaletteIcon, string> = {
    input: '#ed6c02',
    'list-input': '#ed6c02',
    'value-input': '#ed6c02',
    function: KIND_COLOR.function,
    expression: EXPRESSION_COLOR,
    output: '#2f9e44',
    chart: CHART_COLOR,
    parameter: PARAMETER_COLOR,
    return: RETURN_COLOR,
};

const ICONS = {
    input: IconLogin2,
    'list-input': IconListDetails,
    'value-input': IconVariable,
    function: IconMathFunction,
    expression: IconMath,
    output: IconLogout2,
    chart: IconChartLine,
    parameter: IconArrowBarToRight,
    return: IconTargetArrow,
};

// The rail keeps the generic item of each node type one click away.
const GENERIC_ITEMS = new Set([
    'new-input',
    'new-list-input',
    'new-value-input',
    'function',
    'expression',
    'output',
    'chart',
    'parameter',
    'return',
]);

function PaletteTile({icon, size = 28}: {icon: PaletteIcon; size?: number}): ReactElement {
    const Icon = ICONS[icon];
    return (
        <span className={styles.tile} style={{background: ICON_COLOR[icon], width: size, height: size}} aria-hidden>
            <Icon size={Math.round(size * 0.6)} stroke={2} />
        </span>
    );
}

function startDrag(event: DragEvent, item: PaletteItem) {
    event.dataTransfer.setData(DRAG_TYPE, item.id);
    event.dataTransfer.effectAllowed = 'copy';
}

function activateOnKey(event: KeyboardEvent, item: PaletteItem, onAdd: (item: PaletteItem) => void) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    onAdd(item);
}

/** The left side menu of the Flow Editor: every node type, grouped, searchable. Drag an item or click it. */
export function NodePalette({items, collapsed, onCollapsedChange, onAdd}: NodePaletteProps): ReactElement {
    const [query, setQuery] = useState('');

    if (collapsed) {
        const generic = items.filter((item) => GENERIC_ITEMS.has(item.id));
        return (
            <nav className={`${styles.palette} ${styles.rail}`} aria-label="Node palette">
                <Tooltip label="Show node palette" position="right" withArrow>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        aria-label="Show node palette"
                        onClick={() => onCollapsedChange(false)}
                    >
                        <IconLayoutSidebarLeftExpand size={18} />
                    </ActionIcon>
                </Tooltip>
                {generic.map((item) => (
                    <Tooltip key={item.id} label={item.title} position="right" withArrow>
                        <div
                            role="button"
                            tabIndex={0}
                            draggable
                            aria-label={item.label}
                            className={styles.railItem}
                            onDragStart={(event) => startDrag(event, item)}
                            onClick={() => onAdd(item)}
                            onKeyDown={(event) => activateOnKey(event, item, onAdd)}
                        >
                            <PaletteTile icon={item.icon} size={30} />
                        </div>
                    </Tooltip>
                ))}
            </nav>
        );
    }

    const visible = filterItems(items, query);
    return (
        <nav className={styles.palette} aria-label="Node palette">
            <div className={styles.paletteHeader}>
                <span className={styles.paletteTitle}>Available Nodes</span>
                <Tooltip label="Hide node palette" withArrow>
                    <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="sm"
                        aria-label="Hide node palette"
                        onClick={() => onCollapsedChange(true)}
                    >
                        <IconLayoutSidebarLeftCollapse size={16} />
                    </ActionIcon>
                </Tooltip>
            </div>
            <div className={styles.paletteSearch}>
                <TextInput
                    size="xs"
                    placeholder="Search nodes"
                    aria-label="Search nodes"
                    leftSection={<IconSearch size={14} />}
                    rightSection={
                        query && <CloseButton size="xs" aria-label="Clear search" onClick={() => setQuery('')} />
                    }
                    value={query}
                    onChange={(event) => setQuery(event.currentTarget.value)}
                />
            </div>
            <ScrollArea className={styles.paletteBody} type="hover" scrollbarSize={6}>
                {visible.length === 0 && <div className={styles.paletteEmpty}>No nodes match “{query}”</div>}
                {GROUP_ORDER.map((group) => {
                    const members = visible.filter((item) => item.group === group);
                    if (members.length === 0) return null;
                    return (
                        <section key={group} className={styles.group} aria-label={GROUP_LABEL[group]}>
                            <div className={styles.groupLabel}>{GROUP_LABEL[group]}</div>
                            {members.map((item) => (
                                <div
                                    key={item.id}
                                    role="button"
                                    tabIndex={0}
                                    draggable
                                    aria-label={item.label}
                                    data-testid={`palette-item-${item.id}`}
                                    className={styles.item}
                                    title={`${item.title}\n${item.detail}\nDrag onto the canvas or click to add`}
                                    onDragStart={(event) => startDrag(event, item)}
                                    onClick={() => onAdd(item)}
                                    onKeyDown={(event) => activateOnKey(event, item, onAdd)}
                                >
                                    <PaletteTile icon={item.icon} />
                                    <span className={styles.itemText}>
                                        <span className={styles.itemTitle}>{item.title}</span>
                                        <span className={styles.itemDetail}>{item.detail}</span>
                                    </span>
                                    <IconGripVertical size={14} className={styles.grip} aria-hidden />
                                </div>
                            ))}
                        </section>
                    );
                })}
            </ScrollArea>
            <div className={styles.paletteFooter}>Drag onto the canvas or click to add</div>
        </nav>
    );
}
