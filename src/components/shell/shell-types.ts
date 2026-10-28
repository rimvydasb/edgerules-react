import type {CSSProperties} from 'react';
import type {BoxedEditorOpenTarget} from '../boxed-editor';
import type {CodeEditorService} from '../code-editor';
import type {FlowEditorOpenTarget} from '../flow-editor';

export type ShellView = 'code' | 'boxed' | 'flow';

export interface ShellProps {
    languageService: CodeEditorService; // diagnostics and completions; the engine class statics fit
    path?: string; // controlled root path: '*', a context path or a function path
    defaultPath?: string; // uncontrolled initial root path; defaults to '*'
    onPathChange?: (path: string) => void; // breadcrumb click, drill-down, or fallback to an existing path
    view?: ShellView; // controlled active view
    defaultView?: ShellView; // uncontrolled initial view; defaults to 'boxed'
    onViewChange?: (view: ShellView) => void; // view switch, or "View as code" of an editor
    readOnly?: boolean; // passed to every editor
    explorerOpen?: boolean; // controlled visibility of the Project Explorer side panel
    defaultExplorerOpen?: boolean; // uncontrolled initial visibility of the Project Explorer; defaults to false
    onExplorerOpenChange?: (open: boolean) => void; // the kind icon of the header, or the close button of the panel
    onOpenNode?: (target: BoxedEditorOpenTarget | FlowEditorOpenTarget) => void; // targets the Shell does not open
    className?: string;
    style?: CSSProperties;
}
