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
import {isPortableError} from '#lib/portable';
import {CHART_SIZE, ChartNode} from '../chart-node/ChartNode';
import type {ChartNodeData} from '../chart-node/types';
import {FlowEditorProvider, useFlowEditor} from '../FlowEditorProvider';
import type {FlowEditorService, FlowNodeRef} from '../flow-editor-types';
import {FunctionNode} from '../function-node/FunctionNode';
import {ListInputNode} from '../list-input-node/ListInputNode';
import {ObjectInputNode} from '../object-input-node/ObjectInputNode';
import {OutputNode, sourcePath} from '../output-node/OutputNode';
import {autoLayout, findFreeSpot, modelWires, outputWires, type LayoutKind, type Wire} from './graph';
import {ICON_COLOR, NodePalette} from './NodePalette';
import {DRAG_TYPE, paletteItems} from './paletteItems';
import type {
    FlowChart,
    FlowEditorProps,
    FlowFocusRequest,
    FlowLayout,
    FlowOutput,
    FlowSelection,
    PaletteItem,
} from './types';
import styles from './flowEditor.module.css';

const NODE_TYPES = {
    functionNode: FunctionNode,
    objectInputNode: ObjectInputNode,
    listInputNode: ListInputNode,
    outputNode: OutputNode,
    chartNode: ChartNode,
};
const TYPE_OF: Record<LayoutKind, keyof typeof NODE_TYPES> = {
    function: 'functionNode',
    'object-input': 'objectInputNode',
    'list-input': 'listInputNode',
    output: 'outputNode',
    chart: 'chartNode',
};
const KIND_OF: Record<string, LayoutKind> = {
    functionNode: 'function',
    objectInputNode: 'object-input',
    listInputNode: 'list-input',
    outputNode: 'output',
    chartNode: 'chart',
};
// Output and chart nodes exist on the canvas only: the model never adds or removes them.
const CANVAS_TYPES = new Set(['outputNode', 'chartNode']);
const MINIMAP_COLOR: Record<LayoutKind, string> = {
    'object-input': ICON_COLOR.input,
    'list-input': ICON_COLOR.input,
    function: ICON_COLOR.function,
    output: ICON_COLOR.output,
    chart: ICON_COLOR.chart,
};
const ROW = 40;
const FIT_VIEW = {padding: 0.15, maxZoom: 1};
const FOCUS_VIEW = {padding: 0.6, maxZoom: 1, duration: 300};
const WIRE_CLASS: Record<Wire['kind'], string> = {
    number: styles.wireNumber,
    string: styles.wireString,
    boolean: styles.wireBoolean,
    date: styles.wireDate,
    record: styles.wireRecord,
    any: styles.wireAny,
};

/**
 * The EdgeRules Flow Editor: a canvas of Input, Function, Output and Chart nodes with a node palette on the left.
 * Nodes and wires come from the model; positions, output nodes and chart nodes are presentation data reported
 * through `onLayoutChange`.
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
    if (kind === 'chart') return CHART_SIZE;
    if (kind === 'object-input')
        return {width: 280, height: (3 + Math.max(1, service.getObjectInputNode(id).fields.length)) * ROW};
    if (kind === 'list-input')
        return {width: 280, height: (3 + Math.max(1, service.getListInputNode(id).itemFields.length)) * ROW};
    const model = service.getFunctionNode(id);
    if (!model.callee) return {width: 320, height: 3 * ROW};
    return {width: 360, height: (3 + Math.max(model.arguments.length, model.results.length)) * ROW};
}

function sizeOf(node: Node, service: FlowEditorService): {width: number; height: number} {
    // A chart has its own size before xyflow measures it.
    const width = node.measured?.width ?? node.width;
    const height = node.measured?.height ?? node.height;
    if (width && height) return {width, height};
    return estimateSize(service, node.id, KIND_OF[node.type ?? ''] ?? 'function');
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
    return a.field === b.field && a.label === b.label && a.config === b.config;
}

/** 'output', then 'output2', 'output3'…: the first id with `prefix` that is not taken. */
function nextCanvasId(prefix: string, taken: Set<string>): string {
    if (!taken.has(prefix)) return prefix;
    let index = 2;
    while (taken.has(`${prefix}${index}`)) index += 1;
    return `${prefix}${index}`;
}

/**
 * Keeps the chart entries of the layout in step with their nodes: a ChartNode writes its config through
 * `updateNodeData` (a 'replace' change), and the resize handle ends with a 'dimensions' change.
 */
function syncCharts(charts: FlowChart[], changes: NodeChange[]): FlowChart[] {
    let next = charts;
    const patch = (id: string, update: Partial<FlowChart>) => {
        if (!next.some((chart) => chart.id === id)) return;
        next = next.map((chart) => (chart.id === id ? {...chart, ...update} : chart));
    };
    for (const change of changes) {
        if (change.type === 'replace' && change.item.type === 'chartNode') {
            const data = change.item.data as ChartNodeData;
            const chart = next.find((candidate) => candidate.id === change.id);
            if (chart && chart.config !== data.config) patch(change.id, {config: data.config});
        } else if (change.type === 'dimensions' && change.resizing === false && change.dimensions) {
            const {width, height} = change.dimensions;
            patch(change.id, {size: {width: Math.round(width), height: Math.round(height)}});
        }
    }
    return next;
}

/** The one selected node, or undefined when none or several are selected. */
function selectionOf(nodes: Node[], outputs: FlowOutput[], charts: FlowChart[]): FlowSelection | undefined {
    const chosen = nodes.filter((node) => node.selected);
    if (chosen.length !== 1) return undefined;
    const {id, type} = chosen[0];
    const kind = KIND_OF[type ?? ''];
    if (kind === 'output' || kind === 'chart') {
        const sink = (kind === 'output' ? outputs : charts).find((candidate) => candidate.id === id);
        const source = sink?.source && sourcePath(sink.source.node, sink.source.handle);
        return {kind, id, label: sink?.label, source};
    }
    return kind ? {kind, field: id} : undefined;
}

function FlowCanvas({
    defaultLayout,
    onLayoutChange,
    focusNode,
    defaultPaletteCollapsed = false,
    onSelectionChange,
}: Pick<
    FlowEditorProps,
    'defaultLayout' | 'onLayoutChange' | 'focusNode' | 'defaultPaletteCollapsed' | 'onSelectionChange'
>) {
    const {service, readOnly = false} = useFlowEditor();
    const flow = useReactFlow();
    const colorScheme = useComputedColorScheme('light');
    const version = useServiceVersion(service);
    const wrapper = useRef<HTMLDivElement>(null);

    const [outputs, setOutputs] = useState<FlowOutput[]>(() => defaultLayout?.outputs ?? []);
    const [charts, setCharts] = useState<FlowChart[]>(() => defaultLayout?.charts ?? []);
    const [nodes, setNodes] = useState<Node[]>([]);
    const [selectedEdges, setSelectedEdges] = useState<ReadonlySet<string>>(new Set());
    const [collapsed, setCollapsed] = useState(defaultPaletteCollapsed);
    // Positions of nodes about to appear: a drop or a click on the palette, then the saved layout.
    const pending = useRef(new Map<string, XYPosition>(Object.entries(defaultLayout?.positions ?? {})));
    const select = useRef<string | undefined>(undefined);
    const autoPlaced = useRef(false);

    const refs = useMemo(() => service.listNodes(), [service, version]);
    // xyflow fits the view when the first nodes are measured; on an empty flow that would move a dropped node away.
    const [fitOnInit] = useState(() => refs.length + outputs.length + charts.length > 0);
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

        const wanted: {
            id: string;
            kind: LayoutKind;
            data: Record<string, unknown>;
            size?: {width: number; height: number};
        }[] = [
            ...refs.map((ref: FlowNodeRef) => ({id: ref.field, kind: ref.kind, data: {field: ref.field}})),
            ...outputs.map((output) => ({id: output.id, kind: 'output' as const, data: {label: output.label}})),
            ...charts.map((chart) => ({
                id: chart.id,
                kind: 'chart' as const,
                data: {label: chart.label, config: chart.config} satisfies ChartNodeData,
                size: chart.size ?? CHART_SIZE,
            })),
        ];
        const wantedIds = new Set(wanted.map((node) => node.id));
        const removed = current.filter((node) => !wantedIds.has(node.id) && !CANVAS_TYPES.has(node.type ?? ''));
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
            const follow = <T extends {source?: {node: string; handle: string}}>(sinks: T[]) =>
                sinks.map((sink) =>
                    sink.source?.node === from ? {...sink, source: {...sink.source, node: to}} : sink,
                );
            if (outputs.some((output) => output.source?.node === from)) setOutputs(follow(outputs));
            if (charts.some((chart) => chart.source?.node === from)) setCharts(follow(charts));
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
                    // A chart has a size of its own, which the resize handle changes; other nodes fit their rows.
                    ...node.size,
                };
            }),
        );

        function initialPositions(unplaced: typeof wanted) {
            // The estimate misses descriptions and long names; the layout runs again once xyflow has measured.
            autoPlaced.current = true;
            const layoutNodes = unplaced.map((node) => ({
                id: node.id,
                kind: node.kind,
                ...(node.size ?? estimateSize(service, node.id, node.kind)),
            }));
            const ids = new Set(unplaced.map((node) => node.id));
            return autoLayout(layoutNodes, [...wires, ...outputWires(outputs, ids), ...outputWires(charts, ids)]);
        }

        function freePositions(unplaced: typeof wanted, existing: Node[]) {
            const taken = existing.map((node) => ({...node.position, ...sizeOf(node, service)}));
            const center = viewportCenter();
            const placed: Record<string, XYPosition> = {};
            for (const node of unplaced) {
                const size = node.size ?? estimateSize(service, node.id, node.kind);
                const spot = findFreeSpot({x: center.x - size.width / 2, y: center.y - size.height / 2}, size, taken);
                placed[node.id] = spot;
                taken.push({...spot, ...size});
            }
            return placed;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refs, outputs, charts, readOnly]);

    const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
    const edges = useMemo(
        () =>
            [...wires, ...outputWires(outputs, nodeIds), ...outputWires(charts, nodeIds, 'in:data')]
                .filter((wire) => nodeIds.has(wire.source) && nodeIds.has(wire.target))
                .map((wire) => toEdge(wire, selectedEdges)),
        [wires, outputs, charts, nodeIds, selectedEdges],
    );

    // Report the layout once a change settles: never in the middle of a drag or a resize.
    const reported = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (!onLayoutChange || nodes.some((node) => node.dragging || node.resizing)) return;
        const layout: FlowLayout = {
            positions: Object.fromEntries(nodes.map((node) => [node.id, node.position])),
            outputs,
            // Optional in `flow.json`: a flow without charts reports what it reported before charts existed.
            ...(charts.length > 0 && {charts}),
        };
        const text = JSON.stringify(layout);
        if (reported.current === undefined) {
            reported.current = text; // the first render reports nothing
            return;
        }
        if (text === reported.current) return;
        reported.current = text;
        onLayoutChange(layout);
    }, [nodes, outputs, charts, onLayoutChange]);

    // Report the selected node when it changes: another node, its wire or its label, or no node at all.
    const selection = useMemo(() => selectionOf(nodes, outputs, charts), [nodes, outputs, charts]);
    const selectionKey = JSON.stringify(selection ?? null);
    const reportedSelection = useRef('null');
    useEffect(() => {
        if (selectionKey === reportedSelection.current) return;
        reportedSelection.current = selectionKey;
        onSelectionChange?.(selection);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectionKey, onSelectionChange]);

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
        const taken = new Set([...outputs.map((output) => output.id), ...charts.map((chart) => chart.id), ...nodeIds]);
        if (action.kind === 'output') {
            const id = nextCanvasId('output', taken);
            place(id);
            setOutputs([...outputs, {id}]);
            return;
        }
        if (action.kind === 'chart') {
            const id = nextCanvasId('chart', taken);
            place(id);
            setCharts([...charts, {id}]);
            return;
        }
        if (action.kind === 'input') {
            place(action.field);
            if (isPortableError(service.addInputNode(action.field))) pending.current.delete(action.field);
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
    const chartIds = useMemo(() => new Set(charts.map((chart) => chart.id)), [charts]);

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
            if (chartIds.has(target)) {
                // New data: the chart configures itself again from what the wire brings.
                setCharts((current) =>
                    current.map((chart) =>
                        chart.id === target
                            ? {...chart, source: {node: source, handle: sourceHandle}, config: undefined}
                            : chart,
                    ),
                );
                return;
            }
            // A rejected binding shows on the target node as its error row.
            service.bindArgument(target, targetHandle.slice('in:'.length), sourcePath(source, sourceHandle));
        },
        [service, outputIds, chartIds],
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
                if (!CANVAS_TYPES.has(node.type ?? '')) service.removeFromFlow(node.id);
            }
            const removedOf = (type: string) =>
                new Set(doomedNodes.filter((node) => node.type === type).map((node) => node.id));
            const removedOutputs = removedOf('outputNode');
            const removedCharts = removedOf('chartNode');
            // A wire of a removed node goes with it; the binding stays in the model.
            const unwired = doomedEdges.filter((edge) => !doomed.has(edge.source) && !doomed.has(edge.target));
            const unwiredOutputs = new Set<string>();
            const unwiredCharts = new Set<string>();
            for (const edge of unwired) {
                if (outputIds.has(edge.target)) unwiredOutputs.add(edge.target);
                else if (chartIds.has(edge.target)) unwiredCharts.add(edge.target);
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
            if (removedCharts.size > 0 || unwiredCharts.size > 0) {
                // An unwired chart keeps its config and size; the next wire configures it again.
                setCharts((current) =>
                    current
                        .filter((chart) => !removedCharts.has(chart.id))
                        .map((chart) => (unwiredCharts.has(chart.id) ? {...chart, source: undefined} : chart)),
                );
            }
            return false;
        },
        [service, outputIds, chartIds],
    );

    const onNodesChange = useCallback((changes: NodeChange[]) => {
        setNodes((current) => applyNodeChanges(changes, current));
        setCharts((current) => syncCharts(current, changes));
    }, []);

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

    // The focus selects its node once the node exists, and centers it once xyflow measured the nodes: after the
    // first fit and the auto layout, which both fit the view in the next frame, so the centering waits one more.
    const selected = useRef<FlowFocusRequest | undefined>(undefined);
    useEffect(() => {
        if (!focusNode || selected.current === focusNode || !nodes.some((node) => node.id === focusNode.field)) return;
        selected.current = focusNode;
        setNodes((current) => current.map((node) => ({...node, selected: node.id === focusNode.field})));
    }, [focusNode, nodes]);
    useEffect(() => {
        if (!focusNode || !measured) return;
        let frame = window.requestAnimationFrame(() => {
            frame = window.requestAnimationFrame(
                () => void flow.fitView({nodes: [{id: focusNode.field}], ...FOCUS_VIEW}),
            );
        });
        return () => window.cancelAnimationFrame(frame);
    }, [focusNode, measured, flow]);

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
