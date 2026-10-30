import type {FlowLayout} from '#lib/flowLayout';
import type {CodeEditorService} from '../../code-editor-cell';
import type {DocumentationService} from '../../documentation-service';
import type {FlowEditorOpenTarget, FlowEditorService} from '../flow-editor-types';

export interface FlowEditorProps {
    service: FlowEditorService; // engine-backed node service from createFlowEditorService()
    revision?: number; // the model revision; a new value reads every node again after a change made outside this editor
    documentation?: DocumentationService; // stores node descriptions; omit to hide description UI
    languageService?: CodeEditorService; // diagnostics and completions of value cells; omit to show values read-only
    readOnly?: boolean; // hides the palette and disables wiring and removal; nodes still move
    onOpenNode?: (target: FlowEditorOpenTarget) => void; // routes "Open in…", "Open tests", "View as code" to the host
    defaultLayout?: FlowLayout; // positions and output nodes to start from; read on mount only
    onLayoutChange?: (layout: FlowLayout) => void; // after a node is moved, added or removed, or an output is rewired
    focusNode?: FlowFocusRequest; // a new object selects that node and centers the view on it
    defaultPaletteCollapsed?: boolean; // the node palette starts as the rail of node types; defaults to false
    onSelectionChange?: (selection: FlowSelection | undefined) => void; // the one selected node; undefined for none or several
}

/**
 * The one selected node of the canvas. A model node is a field of the model, or a parameter of a service; an output or
 * a chart node is a sink that shows the value of the model path wired into it (`source`, undefined while nothing is
 * wired).
 */
export type FlowSelection =
    | {kind: 'function' | 'object-input' | 'list-input' | 'value-input' | 'parameter' | 'result'; field: string}
    | {kind: 'output' | 'chart'; id: string; label?: string; source?: string};

/** Asks the canvas to select one node and center it; each new object is a new request. */
export interface FlowFocusRequest {
    field: string; // the field path of the node, for example 'loanBook.decision'
}

export type {FlowChart, FlowLayout, FlowOutput} from '#lib/flowLayout';

export type PaletteGroup = 'input' | 'function' | 'output' | 'chart';

/** What a palette item creates. */
export type PaletteAction =
    | {kind: 'new-input'; input: 'object-input' | 'list-input' | 'value-input'} // a new record, list or single value
    | {kind: 'input'; field: string} // annotate an existing record or list
    | {kind: 'function'} // a draft invocation; the user picks what it invokes on the node
    | {kind: 'output'}
    | {kind: 'chart'}
    | {kind: 'parameter'} // a service only: a new parameter
    | {kind: 'result'}; // a service only: its `return` record as the result node

export type PaletteIcon =
    'input' | 'list-input' | 'value-input' | 'function' | 'output' | 'chart' | 'parameter' | 'result';

export interface PaletteItem {
    id: string; // stable key, also the drag payload
    group: PaletteGroup;
    icon: PaletteIcon;
    title: string;
    detail: string; // second line: signature or hint
    label: string; // accessible name, for example 'Add list input'
    action: PaletteAction;
}

export interface NodePaletteProps {
    items: PaletteItem[];
    collapsed: boolean;
    onCollapsedChange: (collapsed: boolean) => void;
    onAdd: (item: PaletteItem) => void; // click or Enter
}
