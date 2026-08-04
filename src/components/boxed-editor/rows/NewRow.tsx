import Box from '@mui/material/Box';
import {useDndContext, useDroppable} from '@dnd-kit/core';
import type {ReactElement} from 'react';
import type {BoxedRowData, BoxedRowKind, BoxedTableRowData} from '../boxed-editor-types';
import {
    appendListItem,
    addOptimisationVariable,
    appendOptimisationConstraint,
    appendRelationItem,
    appendRule,
    nextFieldRow,
} from '../commands/rowFactories';
import {useRowCommands} from '../commands/useRowCommands';
import {useBoxedEditorContext} from '../context/BoxedEditorContext';
import {isValidDrop, type DragPayload} from '../dnd/dropRules';
import {buildContainerDropPayload} from '../dnd/useRowDrop';
import {indexedPath, parentPath, pathDepth} from '../service/portable-utils';
import {GenericRow} from './GenericRow';

interface NewRowConfig {
    itemKind: BoxedRowKind;
    label: string;
}

/** Every appendable container and the placeholder it renders. */
const NEW_ROW_CONFIG: Partial<Record<BoxedRowKind, NewRowConfig>> = {
    model: {itemKind: 'field', label: '(new item)'},
    context: {itemKind: 'field', label: '(new item)'},
    function: {itemKind: 'field', label: '(new item)'},
    complexType: {itemKind: 'field', label: '(new field)'},
    list: {itemKind: 'list-item', label: '(new item)'},
    relation: {itemKind: 'relation-item', label: '(new row)'},
    ruleset: {itemKind: 'rule', label: '(new rule)'},
    'optimisation-variable-group': {
        itemKind: 'optimisation-variable',
        label: '(new variable)',
    },
    'optimisation-constraint-group': {
        itemKind: 'optimisation-constraint',
        label: '(new constraint)',
    },
};

export interface NewRowProps {
    /** The appendable container this trailing placeholder belongs to. */
    row: BoxedRowData;
}

/**
 * Trailing "(new …)" row rendered by every appendable container — interacting with it appends
 * without opening the three-dot menu (menu wiring itself is Phase 5). Hidden under `readOnly`.
 */
export function NewRow({row}: NewRowProps): ReactElement | null {
    const {readOnly, service} = useBoxedEditorContext();
    const commands = useRowCommands();
    const {active} = useDndContext();
    // A `ruleset`'s `children` interleave `hitPolicy`/`rule`s/`default` — appending a rule has to
    // land after the existing rules specifically, not after the whole mixed list (mirrors
    // `appendRule`'s own `rules.length`).
    const appendIndex =
        row.kind === 'ruleset'
            ? (row.children ?? []).filter((child) => child.kind === 'rule').length
            : (row.children ?? []).length;
    const dropPayload = buildContainerDropPayload(service, row.path, appendIndex);
    const {setNodeRef, isOver} = useDroppable({
        id: `${row.path}::append`,
        data: dropPayload,
        disabled: readOnly,
    });
    const sourcePayload = active?.data.current as DragPayload | undefined;
    const canDrop = isOver && sourcePayload !== undefined && isValidDrop(sourcePayload, dropPayload);

    const config = NEW_ROW_CONFIG[row.kind];
    if (!config || readOnly) return null;

    let depth: number;
    let onActivate: () => void;

    switch (config.itemKind) {
        case 'field': {
            const field = nextFieldRow(row, row.kind === 'complexType');
            depth = field.depth;
            onActivate = () => {
                if (row.kind === 'function') {
                    // An inline function's `result` is synthetic and `<fn>.field` is not directly
                    // addressable. Rewrite the whole function to promote its body to a context.
                    commands.setBoxedRowData(
                        row.path,
                        {...row, children: [...(row.children ?? []), field]},
                        row.path,
                    );
                } else {
                    commands.setBoxedRowData(field.path, field, row.path);
                }
            };
            break;
        }
        case 'list-item': {
            depth = pathDepth(indexedPath(row.path, row.children?.length ?? 0));
            onActivate = () => {
                commands.setBoxedRowData(row.path, appendListItem(row), row.path);
            };
            break;
        }
        case 'relation-item': {
            const relation = row as BoxedTableRowData;
            depth = pathDepth(indexedPath(relation.path, relation.children?.length ?? 0));
            onActivate = () => {
                commands.setBoxedRowData(relation.path, appendRelationItem(relation), relation.path);
            };
            break;
        }
        case 'rule': {
            const ruleset = row as BoxedTableRowData;
            depth = row.depth + 1;
            onActivate = () => {
                commands.setBoxedRowData(ruleset.path, appendRule(ruleset), ruleset.path);
            };
            break;
        }
        case 'optimisation-variable': {
            depth = row.depth + 1;
            onActivate = () => {
                const optimisationPath = parentPath(row.path);
                const optimisation = optimisationPath
                    ? (service.getBoxedRowData(optimisationPath) as BoxedTableRowData | undefined)
                    : undefined;
                if (!optimisation || !optimisationPath) return;
                const children = service.getBoxedRowsData(optimisationPath);
                commands.setBoxedRowData(
                    optimisationPath,
                    addOptimisationVariable({...optimisation, children}),
                    row.path,
                );
            };
            break;
        }
        case 'optimisation-constraint': {
            depth = row.depth + 1;
            onActivate = () => {
                commands.setBoxedRowData(row.path, appendOptimisationConstraint(row), row.path);
            };
            break;
        }
        default:
            // Every `itemKind` actually used by `NEW_ROW_CONFIG` is handled above; `BoxedRowKind` is
            // wider than that, so TypeScript still needs an exhaustive fallback.
            return null;
    }

    return (
        <Box
            ref={setNodeRef}
            data-testid={`append-${row.path}`}
            sx={{
                outline: isOver
                    ? (theme) => `2px solid ${canDrop ? theme.palette.success.main : theme.palette.error.main}`
                    : 'none',
                outlineOffset: '-2px',
            }}
        >
            <GenericRow
                name={config.label}
                depth={depth}
                placeholder
                showDragHandle={false}
                showActions={false}
                onActivate={onActivate}
            />
        </Box>
    );
}
