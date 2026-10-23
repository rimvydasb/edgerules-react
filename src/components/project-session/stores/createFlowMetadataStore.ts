import type {FlowLayout} from '../../../lib/flowLayout';
import {emptyFlow, type FlowMetadataDocument} from '../bundle/types';
import {isAtOrUnder, movePath, moveKeys, sameJson, type StoreContext} from './storeSupport';
import type {FlowMetadataStore} from './types';

// Output and chart nodes point at a model node by its id, which is the node's field path.
function moveSource<T extends {source?: {node: string; handle: string}}>(item: T, from: string, to: string): T {
    if (!item.source || !isAtOrUnder(item.source.node, from)) return item;
    return {...item, source: {...item.source, node: movePath(item.source.node, from, to)}};
}

export function createFlowMetadataStore(context: StoreContext): FlowMetadataStore {
    const listeners = context.listeners();
    let snapshot: FlowMetadataDocument = emptyFlow();

    function changed(layout: FlowLayout): void {
        snapshot = {schemaVersion: 1, layout: structuredClone(layout)};
        context.onChange();
        listeners.notify();
    }

    return {
        getLayout: () => snapshot.layout,

        setLayout(layout) {
            if (!sameJson(layout, snapshot.layout)) changed(layout);
        },

        renamePath(from, to) {
            if (from === to) return;
            const {positions, outputs, charts} = snapshot.layout;
            const next: FlowLayout = {
                positions: moveKeys(positions, from, to) ?? positions,
                outputs: outputs.map((output) => moveSource(output, from, to)),
                ...(charts && {charts: charts.map((chart) => moveSource(chart, from, to))}),
            };
            if (!sameJson(next, snapshot.layout)) changed(next);
        },

        exportDocument: () => snapshot,

        replaceDocument(document) {
            changed(document.layout);
        },

        subscribe: listeners.subscribe,
    };
}
