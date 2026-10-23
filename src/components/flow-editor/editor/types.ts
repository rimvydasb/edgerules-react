import type {FlowLayout} from '../../../lib/flowLayout';
import type {CodeEditorService} from '../../code-editor-cell';
import type {DocumentationService} from '../../documentation-service';
import type {FlowEditorOpenTarget, FlowEditorService} from '../flow-editor-types';

export interface FlowEditorProps {
    service: FlowEditorService; // engine-backed node service from createFlowEditorService()
    documentation?: DocumentationService; // stores node descriptions; omit to hide description UI
    languageService?: CodeEditorService; // diagnostics and completions of value cells; omit to show values read-only
    readOnly?: boolean; // hides the palette and disables wiring and removal; nodes still move
    onOpenNode?: (target: FlowEditorOpenTarget) => void; // routes "Open in…", "Open tests", "View as code" to the host
    defaultLayout?: FlowLayout; // positions and output nodes to start from; read on mount only
    onLayoutChange?: (layout: FlowLayout) => void; // after a node is moved, added or removed, or an output is rewired
}

export type {FlowChart, FlowLayout, FlowOutput} from '../../../lib/flowLayout';

export type PaletteGroup = 'input' | 'function' | 'output' | 'chart';

/** What a palette item creates. */
export type PaletteAction =
    | {kind: 'new-input'}
    | {kind: 'input'; record: string} // annotate an existing record
    | {kind: 'function'; callee?: string} // a draft node, with its callee picked when given
    | {kind: 'output'}
    | {kind: 'chart'};

export type PaletteIcon = 'input' | 'function' | 'ruleset' | 'output' | 'chart';

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
