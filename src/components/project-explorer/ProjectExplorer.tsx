import {useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode} from 'react';
import {Alert, Tree, useTree, type RenderTreeNodePayload, type TreeNodeData} from '@mantine/core';
import {IconChevronRight} from '@tabler/icons-react';
import type {PortableContext, PortableError, PortableNode} from '@edgerules/portable';
import {cx} from '../../ui/cx';
import {isPortableError} from '../../lib/portable';
import {groupContextChildren, listTypeEntries, ROOT_FETCH_PATH, ROOT_PATH, type NamedEntry} from './tree-model';
import {KindIcon, type IconKind} from './icons';
import * as classes from './projectExplorer.module.css';

type GetFilter = 'FIELDS' | 'TYPE_DEFINITIONS' | 'FUNCTION_DEFINITIONS' | 'EXTERNAL_DEFINITIONS' | 'ALL';

interface ProjectExplorerService {
    get(path: string, filter?: GetFilter): PortableNode | PortableError;
}

export interface ProjectExplorerProps {
    /** The engine service to read the model from. Only `get` is used today; `set`/`remove`/`rename` support is coming. */
    service: ProjectExplorerService;
    /** Heading rendered above the tree; not a tree node itself. */
    rootLabel?: string;
    onOpenVariables?: (contextPath: string) => void;
    onOpenFunction?: (functionPath: string) => void;
    onOpenDecisionTable?: (tablePath: string) => void;
    onOpenTypes?: (focusTypeName?: string) => void;
    className?: string;
    style?: CSSProperties;
}

function typesGroupItemId(): string {
    return `${ROOT_PATH}::types`;
}

function varsGroupItemId(contextPath: string): string {
    return `${contextPath}::vars`;
}

function typeEntryItemId(name: string): string {
    return `@types.${name}`;
}

function isFetchableContextPath(itemId: string): boolean {
    return !itemId.includes('::') && !itemId.startsWith('@types.');
}

/** What a node renders: its icon kind, text and optional error badge. Kept in `nodeProps`. */
interface NodeMeta {
    kind: IconKind;
    text: string;
    error?: PortableError;
}

function node(value: string, meta: NodeMeta | null, children?: TreeNodeData[]): TreeNodeData {
    return {value, label: meta?.text ?? '', nodeProps: {meta}, ...(children ? {children} : {})};
}

function renderNode(
    {node: data, expanded, hasChildren, elementProps}: RenderTreeNodePayload,
    onSelect: (value: string) => void,
): ReactNode {
    const meta = data.nodeProps?.meta as NodeMeta | null | undefined;
    return (
        <div
            {...elementProps}
            className={cx(elementProps.className, classes.node)}
            onClick={(event) => {
                elementProps.onClick(event);
                onSelect(data.value);
            }}
        >
            <IconChevronRight
                size={14}
                className={cx(classes.chevron, expanded && classes.chevronOpen, !hasChildren && classes.chevronHidden)}
                aria-hidden="true"
            />
            {meta ? (
                <span className={classes.label}>
                    <KindIcon kind={meta.kind} error={meta.error} />
                    <span>{meta.text}</span>
                </span>
            ) : null}
        </div>
    );
}

/**
 * Renders a tree view of an EdgeRules Portable Format model (docs/PROJECT_EXPLORER_STORY.md).
 * `[ctx]` nodes are fetched lazily (one `service.get(path)` call per expansion); `[types]`/`[vars]`
 * group expansion is client-side only since their children arrive with the containing fetch.
 */
export function ProjectExplorer({
    service,
    rootLabel = 'Project',
    onOpenVariables,
    onOpenFunction,
    onOpenDecisionTable,
    onOpenTypes,
    className,
    style,
}: ProjectExplorerProps): ReactElement {
    const [contextCache, setContextCache] = useState<Map<string, PortableNode | PortableError>>(
        () => new Map([[ROOT_PATH, service.get(ROOT_FETCH_PATH)]]),
    );
    const [rootTypes] = useState<PortableNode | PortableError>(() => service.get(ROOT_FETCH_PATH, 'TYPE_DEFINITIONS'));

    const tree = useTree({
        onNodeExpand: (value) => {
            if (!isFetchableContextPath(value) || contextCache.has(value)) return;
            setContextCache((previous) => new Map(previous).set(value, service.get(value)));
        },
    });

    const handlersRef = useRef({onOpenVariables, onOpenFunction, onOpenDecisionTable, onOpenTypes});
    handlersRef.current = {onOpenVariables, onOpenFunction, onOpenDecisionTable, onOpenTypes};

    const rootNode = contextCache.get(ROOT_PATH);
    const {data, actions} = useMemo(() => {
        // Populated while building the data below; consumed when a node is clicked.
        const actions = new Map<string, () => void>();
        function varsGroup(contextPath: string, vars: NamedEntry[]): TreeNodeData {
            const itemId = varsGroupItemId(contextPath);
            actions.set(itemId, () => handlersRef.current.onOpenVariables?.(contextPath));

            return node(
                itemId,
                {kind: 'vars', text: 'Variables'},
                vars.map((entry) => {
                    actions.set(entry.path, () => handlersRef.current.onOpenVariables?.(contextPath));
                    return node(entry.path, {kind: 'var', text: entry.name});
                }),
            );
        }

        function typesGroup(): TreeNodeData {
            const itemId = typesGroupItemId();

            if (isPortableError(rootTypes)) {
                return node(itemId, {kind: 'types', text: 'Types', error: rootTypes});
            }

            actions.set(itemId, () => handlersRef.current.onOpenTypes?.());
            const entries = listTypeEntries(rootTypes as PortableContext);

            return node(
                itemId,
                {kind: 'types', text: 'Types'},
                entries.map((entry) => {
                    const entryItemId = typeEntryItemId(entry.name);
                    actions.set(entryItemId, () => handlersRef.current.onOpenTypes?.(entry.name));
                    return node(entryItemId, {kind: 'type', text: entry.name});
                }),
            );
        }

        function orderedEntry(entry: NamedEntry): TreeNodeData {
            if (entry.kind === 'func') {
                actions.set(entry.path, () => handlersRef.current.onOpenFunction?.(entry.path));
                return node(entry.path, {kind: 'func', text: `${entry.name}()`});
            }

            if (entry.kind === 'dt') {
                actions.set(entry.path, () => handlersRef.current.onOpenDecisionTable?.(entry.path));
                return node(entry.path, {kind: 'dt', text: `${entry.name}()`});
            }

            // entry.kind === 'ctx'
            const cached = contextCache.get(entry.path);
            const error = cached !== undefined && isPortableError(cached) ? cached : undefined;
            const meta: NodeMeta = {kind: 'ctx', text: entry.name, error};

            if (error) {
                // Treat as a leaf until the underlying model is fixed and the path resolves again.
                return node(entry.path, meta);
            }

            return node(
                entry.path,
                meta,
                cached !== undefined ? contextChildren(entry.path, false) : [node(`${entry.path}::placeholder`, null)],
            );
        }

        function contextChildren(contextPath: string, isRoot: boolean): TreeNodeData[] {
            const context = contextCache.get(contextPath) as PortableContext;
            const {vars, ordered} = groupContextChildren(contextPath, context);
            const children: TreeNodeData[] = [];

            if (isRoot) {
                children.push(typesGroup());
            }
            if (vars.length > 0) {
                children.push(varsGroup(contextPath, vars));
            }
            for (const entry of ordered) {
                children.push(orderedEntry(entry));
            }
            return children;
        }

        return {
            data: isPortableError(rootNode) ? [] : contextChildren(ROOT_PATH, true),
            actions,
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [contextCache, rootTypes]);

    return (
        <div className={className} style={style}>
            {rootLabel ? <div className={classes.heading}>{rootLabel}</div> : null}
            {isPortableError(rootNode) ? (
                <Alert color="red" variant="light">
                    {rootNode.message}
                </Alert>
            ) : (
                <Tree
                    data={data}
                    tree={tree}
                    levelOffset="md"
                    expandOnClick
                    renderNode={(payload) => renderNode(payload, (value) => actions.get(value)?.())}
                />
            )}
        </div>
    );
}
