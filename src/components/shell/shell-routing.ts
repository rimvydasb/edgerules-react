import type {ProjectExplorerOpenTarget} from '../project-explorer';
import {isFlowRoot, rootPathSegments} from './shell-path';
import type {ShellView} from './shell-types';

/** Where an opened Project Explorer entry goes: the root path, the view, and the Flow node to center. */
export interface ShellRoute {
    path: string;
    view: ShellView;
    focus?: string; // the field path of a Flow node to select and center
}

const NODE_KINDS = new Set<ProjectExplorerOpenTarget['kind']>([
    'input-node',
    'function-node',
    'output-node',
    'chart-node',
    'node',
]);

function parentPath(path: string): string {
    const dot = path.lastIndexOf('.');
    return dot === -1 ? '*' : path.slice(0, dot);
}

/**
 * The active view stays when it can show the entry. A workbook node in the Flow view is centered on the canvas of its
 * workbook. From the Tests view, or from the Flow view for an entry without Flow, the entry opens in the default view
 * of its section: Flow for a workbook, Boxed for every other entry.
 */
export function explorerRoute(target: ProjectExplorerOpenTarget, view: ShellView, model: unknown): ShellRoute {
    if (target.kind === 'test') return {path: target.path, view: 'tests'};
    if (view === 'tests') return {path: target.path, view: target.kind === 'workbook' ? 'flow' : 'boxed'};
    if (NODE_KINDS.has(target.kind) && view === 'flow') {
        return {path: parentPath(target.path), view: 'flow', focus: target.path};
    }
    if (view === 'flow' && !isFlowRoot(rootPathSegments(model, target.path))) return {path: target.path, view: 'boxed'};
    return {path: target.path, view};
}
