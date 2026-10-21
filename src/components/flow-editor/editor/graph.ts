import type {XYPosition} from '@xyflow/react';
import {typeKind} from '../core-node';
import type {FlowNodeRef} from '../flow-editor-types';
import type {FunctionNodeModel} from '../function-node/types';
import type {FlowOutput} from './types';

/** A wire as the canvas draws it; the editor turns it into an xyflow edge. */
export interface Wire {
    id: string;
    source: string; // node id
    sourceHandle: string; // 'out:<result>', 'out:*'
    target: string; // node id
    targetHandle: string; // 'in:<parameter>', 'in:value'
    kind: ReturnType<typeof typeKind>; // color family of the wire
}

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export type LayoutKind = FlowNodeRef['kind'] | 'output' | 'chart';

/** Output and chart nodes only read: they sit one column after their source. */
function isSink(kind: LayoutKind | undefined): boolean {
    return kind === 'output' || kind === 'chart';
}

export interface LayoutNode {
    id: string;
    kind: LayoutKind;
    width: number;
    height: number;
}

const GAP_X = 120;
const GAP_Y = 40;
const GRID = 20;

/** The node and the output pin that a path binding reads, when that node is on the canvas. */
export function resolveSource(
    text: string,
    nodes: ReadonlyMap<string, {results?: string[]}>,
): {node: string; handle: string} | undefined {
    let best: string | undefined;
    for (const id of nodes.keys()) {
        if ((text === id || text.startsWith(`${id}.`)) && (!best || id.length > best.length)) best = id;
    }
    if (!best) return undefined;
    const rest = text.slice(best.length + 1);
    if (rest === '') {
        // An unnamed return has its own pin; a record result or an input record uses the whole-value pin.
        const results = nodes.get(best)?.results;
        return {node: best, handle: results?.length === 1 && results[0] === 'result' ? 'out:result' : 'out:*'};
    }
    // A deeper path such as `applicant.address.city` has no pin of its own.
    return rest.includes('.') || rest.includes('[') ? undefined : {node: best, handle: `out:${rest}`};
}

/** The wires of every path-bound argument whose source is a node on the canvas. */
export function modelWires(refs: FlowNodeRef[], functionModel: (field: string) => FunctionNodeModel): Wire[] {
    const models = new Map(
        refs.filter((ref) => ref.kind === 'function').map((ref) => [ref.field, functionModel(ref.field)]),
    );
    const sources = new Map<string, {results?: string[]}>(
        refs.map((ref) => [ref.field, {results: models.get(ref.field)?.results.map((result) => result.name)}]),
    );
    const wires: Wire[] = [];
    for (const [field, model] of models) {
        for (const argument of model.arguments) {
            if (argument.binding?.kind !== 'path') continue;
            const source = resolveSource(argument.binding.text.trim(), sources);
            if (!source || source.node === field) continue;
            wires.push({
                id: `${field}:${argument.name}`,
                source: source.node,
                sourceHandle: source.handle,
                target: field,
                targetHandle: `in:${argument.name}`,
                kind: typeKind(argument.type),
            });
        }
    }
    return wires;
}

/**
 * The wires into canvas nodes (outputs and charts) whose source is still on the canvas. `targetHandle` is the one
 * input pin of that node kind: 'in:value' of an output, 'in:data' of a chart.
 */
export function outputWires(
    outputs: Pick<FlowOutput, 'id' | 'source'>[],
    nodeIds: ReadonlySet<string>,
    targetHandle = 'in:value',
): Wire[] {
    return outputs.flatMap((output) =>
        output.source && nodeIds.has(output.source.node)
            ? [
                  {
                      id: `${output.id}:${targetHandle.slice('in:'.length)}`,
                      source: output.source.node,
                      sourceHandle: output.source.handle,
                      target: output.id,
                      targetHandle,
                      kind: 'any' as const,
                  },
              ]
            : [],
    );
}

/**
 * Positions in columns by data flow: inputs first, then each function one column after the latest node it reads,
 * then outputs and charts one column after their source. Columns stack their nodes top-down.
 */
export function autoLayout(
    nodes: LayoutNode[],
    links: {source: string; target: string}[],
    origin: XYPosition = {x: 0, y: 0},
): Record<string, XYPosition> {
    const kinds = new Map(nodes.map((node) => [node.id, node.kind]));
    const sourcesOf = new Map<string, string[]>();
    for (const link of links) {
        if (!kinds.has(link.source) || !kinds.has(link.target)) continue;
        sourcesOf.set(link.target, [...(sourcesOf.get(link.target) ?? []), link.source]);
    }
    const firstFunctionColumn = nodes.some((node) => node.kind === 'input') ? 1 : 0;
    const columns = new Map<string, number>();
    const columnOf = (id: string, visiting: Set<string>): number => {
        const known = columns.get(id);
        if (known !== undefined) return known;
        const kind = kinds.get(id);
        if (kind === 'input') return 0;
        if (visiting.has(id)) return firstFunctionColumn; // a cycle cannot link; keep the walk finite
        visiting.add(id);
        const sources = sourcesOf.get(id) ?? [];
        const after = Math.max(-1, ...sources.map((source) => columnOf(source, visiting))) + 1;
        visiting.delete(id);
        const column = isSink(kind) ? after : Math.max(firstFunctionColumn, after);
        columns.set(id, column);
        return column;
    };
    for (const node of nodes) columns.set(node.id, columnOf(node.id, new Set()));
    // Unwired outputs and charts go after every other column.
    const lastColumn = Math.max(0, ...nodes.filter((node) => !isSink(node.kind)).map((node) => columns.get(node.id)!));
    for (const node of nodes) {
        if (isSink(node.kind) && !sourcesOf.has(node.id)) columns.set(node.id, lastColumn + 1);
    }

    const byColumn = new Map<number, LayoutNode[]>();
    for (const node of nodes) {
        const column = columns.get(node.id)!;
        byColumn.set(column, [...(byColumn.get(column) ?? []), node]);
    }
    const positions: Record<string, XYPosition> = {};
    let x = origin.x;
    for (const column of [...byColumn.keys()].sort((a, b) => a - b)) {
        const members = byColumn.get(column)!;
        let y = origin.y;
        for (const node of members) {
            positions[node.id] = {x: snap(x), y: snap(y)};
            y += node.height + GAP_Y;
        }
        x += Math.max(...members.map((node) => node.width)) + GAP_X;
    }
    return positions;
}

/** The first spot at or below `desired` where a box of `size` overlaps none of `taken`, with a margin. */
export function findFreeSpot(
    desired: XYPosition,
    size: {width: number; height: number},
    taken: Box[],
    margin = GRID,
): XYPosition {
    const spot = {x: snap(desired.x), y: snap(desired.y)};
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const hit = taken.find(
            (box) =>
                spot.x < box.x + box.width + margin &&
                spot.x + size.width + margin > box.x &&
                spot.y < box.y + box.height + margin &&
                spot.y + size.height + margin > box.y,
        );
        if (!hit) return spot;
        spot.y = snap(hit.y + hit.height + margin * 2);
    }
    return spot;
}

function snap(value: number): number {
    return Math.round(value / GRID) * GRID;
}
