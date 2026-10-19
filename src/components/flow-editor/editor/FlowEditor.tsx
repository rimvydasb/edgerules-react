import {useComputedColorScheme} from '@mantine/core';
import {IconLayoutDistributeHorizontal, IconRoute} from '@tabler/icons-react';
import {
    applyNodeChanges,
    Background,
    BackgroundVariant,
    ControlButton,
    Controls,
    MiniMap,
    Panel,
    ReactFlow,
    ReactFlowProvider,
    useNodesInitialized,
    useReactFlow,
    type Connection,
    type Edge,
    type IsValidConnection,
    type Node,
    type NodeChange,
    type OnBeforeDelete,
    type XYPosition,
} from '@xyflow/react';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type DragEvent,
    type ReactElement,
} from 'react';
import {isPortableError} from '../../../lib/portable';
import {FlowEditorProvider, useFlowEditor} from '../FlowEditorProvider';
import type {FlowEditorService, FlowNodeRef} from '../flow-editor-types';
import {FunctionNode} from '../function-node/FunctionNode';
import {InputNode} from '../input-node/InputNode';
import {OutputNode, sourcePath} from '../output-node/OutputNode';
import {autoLayout, findFreeSpot, modelWires, outputWires, type LayoutKind, type Wire} from './graph';
import {ICON_COLOR, NodePalette} from './NodePalette';
import {DRAG_TYPE, paletteItems} from './paletteItems';
import type {FlowEditorProps, FlowLayout, FlowOutput, PaletteItem} from './types';
import styles from './flowEditor.module.css';

const NODE_TYPES = {functionNode: FunctionNode, inputNode: InputNode, outputNode: OutputNode};
const TYPE_OF: Record<LayoutKind, keyof typeof NODE_TYPES> = {
    function: 'functionNode',
    input: 'inputNode',
    output: 'outputNode',
};
const KIND_OF: Record<string, LayoutKind> = {functionNode: 'function', inputNode: 'input', outputNode: 'output'};
const MINIMAP_COLOR: Record<LayoutKind, string> = {
    input: ICON_COLOR.input,
    function: ICON_COLOR.function,
    output: ICON_COLOR.output,
};
const ROW = 40;
const FIT_VIEW = {padding: 0.15, maxZoom: 1};
const WIRE_CLASS: Record<Wire['kind'], string> = {
    number: styles.wireNumber,
    string: styles.wireString,
    boolean: styles.wireBoolean,
    date: styles.wireDate,
    record: styles.wireRecord,
    any: styles.wireAny,
};

/**
 * The EdgeRules Flow Editor: a canvas of Input, Function and Output nodes with a node palette on the left. Nodes and
 * wires come from the model; positions and output nodes are presentation data reported through `onLayoutChange`.
 */
export function FlowEditor({
    service,
    documentation,
    languageService,
    readOnly,
    onOpenNode,
    ...layout
}: FlowEditorProps): ReactElement {
    return (
        <ReactFlowProvider>
            <FlowEditorProvider
                service={service}
                documentation={documentation}
                languageService={languageService}
                readOnly={readOnly}
                onOpenNode={onOpenNode}
            >
                <FlowCanvas {...layout} />
            </FlowEditorProvider>
        </ReactFlowProvider>
    );
}

/** Re-renders after every committed change of the service. */
function useServiceVersion(service: FlowEditorService): number {
    const [version, setVersion] = useState(0);
    useEffect(() => service.subscribe(() => setVersion((current) => current + 1)), [service]);
    return version;
}

// A size for a node that xyflow has not measured yet, from its row count.
function estimateSize(service: FlowEditorService, id: string, kind: LayoutKind): {width: number; height: number} {
    if (kind === 'output') return {width: 240, height: 2 * ROW};
    if (kind === 'input') return {width: 280, height: (3 + Math.max(1, service.getInputNode(id).fields.length)) * ROW};
    const model = service.getFunctionNode(id);
    if (!model.callee) return {width: 320, height: 3 * ROW};
    return {width: 360, height: (3 + Math.max(model.arguments.length, model.results.length)) * ROW};
}

function sizeOf(node: Node, service: FlowEditorService): {width: number; height: number} {
    const kind = KIND_OF[node.type ?? ''] ?? 'function';
    const estimate = node.measured?.width ? undefined : estimateSize(service, node.id, kind);
    return {width: node.measured?.width ?? estimate!.width, height: node.measured?.height ?? estimate!.height};
}

function toEdge(wire: Wire, selected: ReadonlySet<string>): Edge {
    return {
        id: wire.id,
        source: wire.source,
        sourceHandle: wire.sourceHandle,
        target: wire.target,
        targetHandle: wire.targetHandle,
        className: `${styles.wire} ${WIRE_CLASS[wire.kind]}`,
        selected: selected.has(wire.id),
    };
}

function sameData(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    return a.field === b.field && a.label === b.label;
}

function nextOutputId(taken: Set<string>): string {
    if (!taken.has('output')) return 'output';
    let index = 2;
    while (taken.has(`output${index}`)) index += 1;
    return `output${index}`;
}

function FlowCanvas({defaultLayout, onLayoutChange}: Pick<FlowEditorProps, 'defaultLayout' | 'onLayoutChange'>) {
    const {service, readOnly = false} = useFlowEditor();
    const flow = useReactFlow();
    const colorScheme = useComputedColorScheme('light');
    const version = useServiceVersion(service);
    const wrapper = useRef<HTMLDivElement>(null);

    const [outputs, setOutputs] = useState<FlowOutput[]>(() => defaultLayout?.outputs ?? []);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(new Set());
    const [collapsed, setCollapsed] = useState(false);
    // Positions of nodes about to appear: a drop or a click on the palette, then the saved layout.
    const pending = useRef(new Map<string, XYPosition>(Object.entries(defaultLayout?.positions ?? {})));
    const select = useRef<string | undefined>(undefined);
    const autoPlaced = useRef(false);

    const refs = useMemo(() => service.listNodes(), [service, version]);
    // xyflow fits the view when the first nodes are measured; on an empty flow that would move a dropped node away.
    const [fitOnInit] = useState(() => refs.length + outputs.length > 0);
    const loaded = useRef(!fitOnInit);
    const wires = useMemo(
        () => modelWires(refs, (field) => service.getFunctionNode(field)),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [service, refs, version],
    );
    const items = useMemo(() => (readOnly ? [] : paletteItems(service)), [service, readOnly, version]);

    // The canvas nodes follow the model nodes and the output nodes; a node keeps its position while it exists.
    const nodesRef = useRef(nodes);
    nodesRef.current = nodes;
    useLayoutEffect(() => {
        const current = nodesRef.current;
        const byId = new Map(current.map((node) => [node.id, node]));
        // Entries are dropped only once their node exists, so a repeated effect run still finds them.
        for (const id of byId.keys()) pending.current.delete(id);
        if (select.current && byId.has(select.current)) select.current = undefined;

        const wanted: {id: string; kind: LayoutKind; data: Record<string, unknown>}[] = [
            ...refs.map((ref: FlowNodeRef) => ({id: ref.field, kind: ref.kind, data: {field: ref.field}})),
            ...outputs.map((output) => ({id: output.id, kind: 'output' as const, data: {label: output.label}})),
        ];
        const wantedIds = new Set(wanted.map((node) => node.id));
        const removed = current.filter((node) => !wantedIds.has(node.id) && node.type !== 'outputNode');
        const added = wanted.filter((node) => !byId.has(node.id));
        const unchanged =
            added.length === 0 &&
            current.length === wanted.length &&
            wanted.every((node) => sameData(byId.get(node.id)!.data, node.data));
        if (unchanged) return;

        // A renamed field is one model node gone and one of the same kind added: it keeps its place and its outputs.
        if (removed.length === 1 && added.length === 1 && TYPE_OF[added[0].kind] === removed[0].type) {
            const [from, to] = [removed[0].id, added[0].id];
            if (!pending.current.has(to)) pending.current.set(to, removed[0].position);
            if (outputs.some((output) => output.source?.node === from)) {
                setOutputs(
                    outputs.map((output) =>
                        output.source?.node === from ? {...output, source: {...output.source, node: to}} : output,
                    ),
                );
            }
        }
        const unplaced = added.filter((node) => !pending.current.has(node.id));
        if (unplaced.length > 0) {
            // Only the nodes of the flow as it loads get the column layout; a node added later goes in view.
            const placed = !loaded.current ? initialPositions(unplaced) : freePositions(unplaced, current);
            for (const [id, position] of Object.entries(placed)) pending.current.set(id, position);
        }
        loaded.current = true;
        const selectedId = select.current;
        setNodes(
            wanted.map((node): Node => {
                const existing = byId.get(node.id);
                const selected = selectedId ? node.id === selectedId : existing?.selected;
                if (existing)
                    return {
                        ...existing,
                        data: sameData(existing.data, node.data) ? existing.data : node.data,
                        selected,
                    };
                return {
                    id: node.id,
                    type: TYPE_OF[node.kind],
                    position: pending.current.get(node.id) ?? {x: 0, y: 0},
                    data: node.data,
                    selected,
                    deletable: !readOnly,
                };
            }),
        );

        function initialPositions(unplaced: typeof wanted) {
            // The estimate misses descriptions and long names; the layout runs again once xyflow has measured.
            autoPlaced.current = true;
            const layoutNodes = unplaced.map((node) => ({
                id: node.id,
                kind: node.kind,
                ...estimateSize(service, node.id, node.kind),
            }));
            const ids = new Set(unplaced.map((node) => node.id));
            return autoLayout(layoutNodes, [...wires, ...outputWires(outputs, ids)]);
        }

        function freePositions(unplaced: typeof wanted, existing: Node[]) {
            const taken = existing.map((node) => ({...node.position, ...sizeOf(node, service)}));
            const center = viewportCenter();
            const placed: Record<string, XYPosition> = {};
            for (const node of unplaced) {
                const size = estimateSize(service, node.id, node.kind);
                const spot = findFreeSpot({x: center.x - size.width / 2, y: center.y - size.height / 2}, size, taken);
                placed[node.id] = spot;
                taken.push({...spot, ...size});
            }
            return placed;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refs, outputs, readOnly]);

    const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
    const edges = useMemo(
        () =>
            [...wires, ...outputWires(outputs, nodeIds)]
                .filter((wire) => nodeIds.has(wire.source) && nodeIds.has(wire.target))
                .map((wire) => toEdge(wire, selectedEdges)),
        [wires, outputs, nodeIds, selectedEdges],
    );

    // Report the layout once a change settles: never in the middle of a drag.
    const reported = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (!onLayoutChange || nodes.some((node) => node.dragging)) return;
        const layout: FlowLayout = {
            positions: Object.fromEntries(nodes.map((node) => [node.id, node.position])),
            outputs,
        };
        const text = JSON.stringify(layout);
        if (reported.current === undefined) {
            reported.current = text; // the first render reports nothing
            return;
        }
        if (text === reported.current) return;
        reported.current = text;
        onLayoutChange(layout);
    }, [nodes, outputs, onLayoutChange]);

    function viewportCenter(): XYPosition {
        const box = wrapper.current?.getBoundingClientRect();
        if (!box || box.width === 0) return {x: 0, y: 0};
        return flow.screenToFlowPosition({x: box.left + box.width / 2, y: box.top + box.height / 2});
    }

    const addNode = (item: PaletteItem, at?: XYPosition) => {
        const place = (id: string) => {
            if (at) pending.current.set(id, at);
            select.current = id;
        };
        const {action} = item;
        if (action.kind === 'output') {
            const id = nextOutputId(new Set([...outputs.map((output) => output.id), ...nodeIds]));
            place(id);
            setOutputs([...outputs, {id}]);
            return;
        }
        if (action.kind === 'input') {
            place(action.record);
            if (isPortableError(service.addInputNode(action.record))) pending.current.delete(action.record);
            return;
        }
        if (action.kind === 'new-input') {
            const created = service.createInputNode();
            if (!isPortableError(created)) place(created);
            return;
        }
        const field = service.createDraftNode();
        place(field);
        if (action.callee) service.setCallee(field, action.callee);
    };

    const onDrop = (event: DragEvent) => {
        const id = event.dataTransfer.getData(DRAG_TYPE);
        const item = items.find((candidate) => candidate.id === id);
        if (!item) return;
        event.preventDefault();
        addNode(item, flow.screenToFlowPosition({x: event.clientX, y: event.clientY}));
    };

    const onDragOver = (event: DragEvent) => {
        if (readOnly || !event.dataTransfer.types.includes(DRAG_TYPE)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    };

    const outputIds = useMemo(() => new Set(outputs.map((output) => output.id)), [outputs]);

    const onConnect = useCallback(
        (connection: Connection) => {
            const {source, sourceHandle, target, targetHandle} = connection;
            if (!sourceHandle || !targetHandle) return;
            if (outputIds.has(target)) {
                setOutputs((current) =>
                    current.map((output) =>
                        output.id === target ? {...output, source: {node: source, handle: sourceHandle}} : output,
                    ),
                );
                return;
            }
            // A rejected binding shows on the target node as its error row.
            service.bindArgument(target, targetHandle.slice('in:'.length), sourcePath(source, sourceHandle));
        },
        [service, outputIds],
    );

    const isValidConnection: IsValidConnection = useCallback(
        (connection) =>
            connection.source !== connection.target &&
            Boolean(connection.sourceHandle?.startsWith('out:')) &&
            Boolean(connection.targetHandle?.startsWith('in:')),
        [],
    );

    // The editor applies deletions to the model itself; xyflow only reports them.
    const onBeforeDelete: OnBeforeDelete = useCallback(
        async ({nodes: doomedNodes, edges: doomedEdges}) => {
            const doomed = new Set(doomedNodes.map((node) => node.id));
            for (const node of doomedNodes) {
                if (node.type !== 'outputNode') service.removeFromFlow(node.id);
            }
            const removedOutputs = new Set(
                doomedNodes.filter((node) => node.type === 'outputNode').map((node) => node.id),
            );
            // A wire of a removed node goes with it; the binding stays in the model.
            const unwired = doomedEdges.filter((edge) => !doomed.has(edge.source) && !doomed.has(edge.target));
            const unwiredOutputs = new Set<string>();
            for (const edge of unwired) {
                if (outputIds.has(edge.target)) unwiredOutputs.add(edge.target);
                else if (edge.targetHandle) service.unbindArgument(edge.target, edge.targetHandle.slice('in:'.length));
            }
            if (removedOutputs.size > 0 || unwiredOutputs.size > 0) {
                setOutputs((current) =>
                    current
                        .filter((output) => !removedOutputs.has(output.id))
                        .map((output) =>
                            unwiredOutputs.has(output.id) ? {id: output.id, label: output.label} : output,
                        ),
                );
            }
            return false;
        },
        [service, outputIds],
    );

    const onNodesChange = useCallback(
        (changes: NodeChange[]) => setNodes((current) => applyNodeChanges(changes, current)),
        [],
    );

    const arrange = useCallback(
        (animate: boolean) => {
            const current = nodesRef.current;
            const layoutNodes = current.map((node) => ({
                id: node.id,
                kind: KIND_OF[node.type ?? ''] ?? 'function',
                ...sizeOf(node, service),
            }));
            const positions = autoLayout(layoutNodes, edges);
            setNodes(current.map((node) => ({...node, position: positions[node.id] ?? node.position})));
            window.requestAnimationFrame(() => void flow.fitView({...FIT_VIEW, duration: animate ? 300 : 0}));
        },
        [edges, flow, service],
    );

    const measured = useNodesInitialized();
    useEffect(() => {
        if (!measured || !autoPlaced.current) return;
        autoPlaced.current = false;
        arrange(false);
    }, [measured, arrange]);

    return (
        <div className={styles.editor} data-testid="flow-editor">
            {!readOnly && (
                <NodePalette
                    items={items}
                    collapsed={collapsed}
                    onCollapsedChange={setCollapsed}
                    onAdd={(item) => addNode(item)}
                />
            )}
            <div className={styles.canvas} ref={wrapper} onDrop={onDrop} onDragOver={onDragOver}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={NODE_TYPES}
                    onNodesChange={onNodesChange}
                    onEdgesChange={(changes) =>
                        setSelectedEdges((current) => {
                            const next = new Set(current);
                            for (const change of changes) {
                                if (change.type !== 'select') continue;
                                if (change.selected) next.add(change.id);
                                else next.delete(change.id);
                            }
                            return next;
                        })
                    }
                    onConnect={onConnect}
                    isValidConnection={isValidConnection}
                    onBeforeDelete={onBeforeDelete}
                    nodesConnectable={!readOnly}
                    deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
                    colorMode={colorScheme}
                    snapToGrid
                    snapGrid={[20, 20]}
                    minZoom={0.2}
                    maxZoom={2}
                    fitView={fitOnInit}
                    fitViewOptions={FIT_VIEW}
                    proOptions={{hideAttribution: true}}
                >
                    <Background variant={BackgroundVariant.Dots} gap={20} size={1.2} className={styles.background} />
                    <Controls position="bottom-left" showInteractive={false} className={styles.controls}>
                        <ControlButton onClick={() => arrange(true)} title="Arrange nodes" aria-label="Arrange nodes">
                            <IconLayoutDistributeHorizontal size={14} />
                        </ControlButton>
                    </Controls>
                    {nodes.length > 0 && (
                        <MiniMap
                            position="bottom-right"
                            pannable
                            zoomable
                            ariaLabel="Flow overview"
                            className={styles.minimap}
                            nodeColor={(node) => MINIMAP_COLOR[KIND_OF[node.type ?? ''] ?? 'function']}
                            nodeBorderRadius={2}
                        />
                    )}
                    {nodes.length === 0 && (
                        <Panel position="top-center" className={styles.emptyPanel}>
                            <div className={styles.empty} data-testid="flow-editor-empty">
                                <IconRoute size={28} stroke={1.5} className={styles.emptyIcon} />
                                <strong>This flow has no nodes yet</strong>
                                <span>
                                    {readOnly
                                        ? 'Nodes appear here when the model has fields annotated for the flow.'
                                        : 'Drag a node from the palette onto the canvas, or click it to add it here.'}
                                </span>
                            </div>
                        </Panel>
                    )}
                </ReactFlow>
            </div>
        </div>
    );
}
