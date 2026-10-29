import type {CSSProperties} from 'react';
import type {BoxedEditorOpenTarget} from '../boxed-editor';
import type {CodeEditorService} from '../code-editor';
import type {FlowEditorOpenTarget} from '../flow-editor';

// 'tests' shows the tests of the root path in the Tests Manager; it is the only view of a test.
export type ShellView = 'code' | 'boxed' | 'flow' | 'tests';

export interface ShellProps {
    languageService: CodeEditorService; // diagnostics and completions; the engine class statics fit
    path?: string; // controlled root path: '*' or the path of an entity; the test subject in the 'tests' view
    defaultPath?: string; // uncontrolled initial root path; defaults to '*'
    onPathChange?: (path: string) => void; // breadcrumb click, drill-down, or fallback to an existing path
    view?: ShellView; // controlled active view
    defaultView?: ShellView; // uncontrolled initial view; defaults to 'boxed'
    onViewChange?: (view: ShellView) => void; // view switch, or "View as code" of an editor
    readOnly?: boolean; // passed to every editor
    explorerOpen?: boolean; // controlled visibility of the Project Explorer side panel
    defaultExplorerOpen?: boolean; // uncontrolled initial visibility of the Project Explorer; defaults to true
    onExplorerOpenChange?: (open: boolean) => void; // the hide button or a rail icon of the panel
    onOpenNode?: (target: BoxedEditorOpenTarget | FlowEditorOpenTarget) => void; // targets the Shell does not open
    className?: string;
    style?: CSSProperties;
}
