import type {FlowLayout} from '#lib/flowLayout';
import {emptyFlow, type FlowMetadataDocument} from '../bundle/types';
import {isAtOrUnder, movePath, moveKeys, sameJson, type StoreContext} from './storeSupport';
import type {FlowMetadataStore} from './types';

// The layout of a root that has none yet; one shared object, so `getLayout` keeps its reference. Never mutated.
const EMPTY_LAYOUT: FlowLayout = {positions: {}, outputs: []};

// Output and chart nodes point at a model node by its id, which is the node's field path.
function moveSource<T extends {source?: {node: string; handle: string}}>(item: T, from: string, to: string): T {
    if (!item.source || !isAtOrUnder(item.source.node, from)) return item;
    return {...item, source: {...item.source, node: movePath(item.source.node, from, to)}};
}

function moveLayout(layout: FlowLayout, from: string, to: string): FlowLayout {
    const {positions, outputs, charts} = layout;
    return {
        positions: moveKeys(positions, from, to) ?? positions,
        outputs: outputs.map((output) => moveSource(output, from, to)),
        ...(charts && {charts: charts.map((chart) => moveSource(chart, from, to))}),
    };
}

export function createFlowMetadataStore(context: StoreContext): FlowMetadataStore {
    const listeners = context.listeners();
    let snapshot: FlowMetadataDocument = emptyFlow();

    function changed(layouts: Record<string, FlowLayout>): void {
        snapshot = {schemaVersion: 2, layouts: structuredClone(layouts)};
        context.onChange();
        listeners.notify();
    }

    return {
        getLayout: (root) => snapshot.layouts[root] ?? EMPTY_LAYOUT,

        setLayout(root, layout) {
            if (!sameJson(layout, snapshot.layouts[root] ?? EMPTY_LAYOUT)) {
                changed({...snapshot.layouts, [root]: layout});
            }
        },

        renamePath(from, to) {
            if (from === to) return;
            const layouts = moveKeys(snapshot.layouts, from, to) ?? snapshot.layouts;
            const next = Object.fromEntries(
                Object.entries(layouts).map(([root, layout]) => [root, moveLayout(layout, from, to)]),
            );
            if (!sameJson(next, snapshot.layouts)) changed(next);
        },

        exportDocument: () => snapshot,

        replaceDocument(document) {
            changed(document.layouts);
        },

        subscribe: listeners.subscribe,
    };
}
