import type {XYPosition} from '@xyflow/react';
import type {DocumentationService} from '../../documentation-service';
import type {FlowEditorOpenTarget, FlowEditorService} from '../flow-editor-types';

export interface FlowEditorProps {
    service: FlowEditorService; // engine-backed node service from createFlowEditorService()
    documentation?: DocumentationService; // stores node descriptions; omit to hide description UI
    readOnly?: boolean; // hides the palette and disables wiring and removal; nodes still move
    onOpenNode?: (target: FlowEditorOpenTarget) => void; // routes "Open in…", "Open tests", "View as code" to the host
    defaultLayout?: FlowLayout; // positions and output nodes to start from; read on mount only
    onLayoutChange?: (layout: FlowLayout) => void; // after a node is moved, added or removed, or an output is rewired
}

/** Presentation data of the canvas (`flow.json`); the model holds the semantics. */
export interface FlowLayout {
    positions: Record<string, XYPosition>; // node id -> top-left canvas position
    outputs: FlowOutput[]; // output nodes exist on the canvas only
}

export interface FlowOutput {
    id: string; // node id, for example 'output' or 'output2'
    label?: string; // title; falls back to 'Output'
    source?: {node: string; handle: string}; // the result pin wired into the output
}

export type PaletteGroup = 'input' | 'function' | 'output';

/** What a palette item creates. */
export type PaletteAction =
    | {kind: 'new-input'}
    | {kind: 'input'; record: string} // annotate an existing record
    | {kind: 'function'; callee?: string} // a draft node, with its callee picked when given
    | {kind: 'output'};

export type PaletteIcon = 'input' | 'function' | 'ruleset' | 'output';

export interface PaletteItem {
    id: string; // stable key, also the drag payload
    group: PaletteGroup;
    icon: PaletteIcon;
    title: string;
    detail: string; // second line: signature or hint
    label: string; // accessible name, for example 'Add ruleset risk'
    action: PaletteAction;
}

export interface NodePaletteProps {
    items: PaletteItem[];
    collapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
    onAdd: (item: PaletteItem) => void; // click or Enter
}
