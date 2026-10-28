import {useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type ReactNode} from 'react';
import {
    ActionIcon,
    Alert,
    ScrollArea,
    Tooltip,
    Tree,
    useTree,
    type RenderTreeNodePayload,
    type TreeNodeData,
} from '@mantine/core';
import {IconChevronRight, IconLayoutSidebarLeftCollapse} from '@tabler/icons-react';
import type {PortableContext, PortableError, PortableNode} from '@edgerules/portable';
import {cx} from '#ui/cx';
import {isPortableError} from '#lib/portable';
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
    /** Title of the panel header; not a tree node itself. */
    rootLabel?: string;
    /** Shows a close button in the header; called when it is clicked. */
    onClose?: () => void;
    /** Any value that changes with the model, e.g. the model version; a change re-reads every loaded context. */
    revision?: unknown;
    onOpenContext?: (contextPath: string) => void;
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
    count?: number; // the member count of a Types or Variables group
}

const GROUP_KINDS = new Set<IconKind>(['types', 'vars']);
const CODE_KINDS = new Set<IconKind>(['func', 'dt']);

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
                    <span
                        className={cx(
                            classes.text,
                            GROUP_KINDS.has(meta.kind) && classes.group,
                            CODE_KINDS.has(meta.kind) && classes.textCode,
                        )}
                    >
                        {meta.text}
                    </span>
                    {meta.count !== undefined ? <span className={classes.count}>{meta.count}</span> : null}
                </span>
            ) : null}
        </div>
    );
}

/**
 * Renders a tree view of an EdgeRules Portable Format model (docs/stories/completed/project-explorer-story.md).
 * `[ctx]` nodes are fetched lazily (one `service.get(path)` call per expansion); `[types]`/`[vars]`
 * group expansion is client-side only since their children arrive with the containing fetch.
 */
export function ProjectExplorer({
    service,
    rootLabel = 'Project',
    onClose,
    revision,
    onOpenContext,
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
    const [rootTypes, setRootTypes] = useState<PortableNode | PortableError>(() =>
        service.get(ROOT_FETCH_PATH, 'TYPE_DEFINITIONS'),
    );

    // A model change re-reads the loaded contexts only, so the expanded nodes stay expanded.
    const readRevision = useRef(revision);
    useEffect(() => {
        if (readRevision.current === revision) return;
        readRevision.current = revision;
        setContextCache(
            (previous) =>
                new Map([...previous.keys()].map((path) => [path, service.get(path || ROOT_FETCH_PATH)] as const)),
        );
        setRootTypes(service.get(ROOT_FETCH_PATH, 'TYPE_DEFINITIONS'));
    }, [revision, service]);

    const tree = useTree({
        onNodeExpand: (value) => {
            if (!isFetchableContextPath(value) || contextCache.has(value)) return;
            setContextCache((previous) => new Map(previous).set(value, service.get(value)));
        },
    });

    const handlersRef = useRef({onOpenContext, onOpenVariables, onOpenFunction, onOpenDecisionTable, onOpenTypes});
    handlersRef.current = {onOpenContext, onOpenVariables, onOpenFunction, onOpenDecisionTable, onOpenTypes};

    const rootNode = contextCache.get(ROOT_PATH);
    const {data, actions} = useMemo(() => {
        // Populated while building the data below; consumed when a node is clicked.
        const actions = new Map<string, () => void>();
        function varsGroup(contextPath: string, vars: NamedEntry[]): TreeNodeData {
            const itemId = varsGroupItemId(contextPath);
            actions.set(itemId, () => handlersRef.current.onOpenVariables?.(contextPath));

            return node(
                itemId,
                {kind: 'vars', text: 'Variables', count: vars.length},
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
                {kind: 'types', text: 'Types', count: entries.length},
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
            actions.set(entry.path, () => handlersRef.current.onOpenContext?.(entry.path));
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
        <nav className={cx(classes.root, className)} style={style} aria-label="Project explorer">
            {rootLabel || onClose ? (
                <div className={classes.header}>
                    <span className={classes.title}>{rootLabel}</span>
                    {onClose ? (
                        <Tooltip label="Hide project explorer" withArrow>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="Hide project explorer"
                                onClick={onClose}
                            >
                                <IconLayoutSidebarLeftCollapse size={16} />
                            </ActionIcon>
                        </Tooltip>
                    ) : null}
                </div>
            ) : null}
            <ScrollArea className={classes.body} type="hover" scrollbarSize={6}>
                {isPortableError(rootNode) ? (
                    <Alert className={classes.error} color="red" variant="light">
                        {rootNode.message}
                    </Alert>
                ) : (
                    <Tree
                        className={classes.tree}
                        data={data}
                        tree={tree}
                        levelOffset="md"
                        expandOnClick
                        selectOnClick
                        renderNode={(payload) => renderNode(payload, (value) => actions.get(value)?.())}
                    />
                )}
            </ScrollArea>
        </nav>
    );
}
