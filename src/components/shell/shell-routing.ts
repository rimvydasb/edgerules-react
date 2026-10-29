import type {ProjectExplorerOpenTarget} from '../project-explorer';
import {rootPathSegments, rootViews} from './shell-path';
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
 * A workbook and its nodes always open in the Flow view: a node is centered on the canvas of its workbook. For any
 * other entry the active view stays when `ROOT_VIEWS` gives it to the entry; from the Tests view, or from a view the
 * entry does not have, the entry opens in the Boxed view.
 */
export function explorerRoute(target: ProjectExplorerOpenTarget, view: ShellView, model: unknown): ShellRoute {
    if (target.kind === 'test') return {path: target.path, view: 'tests'};
    if (target.kind === 'workbook') return {path: target.path, view: 'flow'};
    if (NODE_KINDS.has(target.kind)) return {path: parentPath(target.path), view: 'flow', focus: target.path};
    if (view === 'tests') return {path: target.path, view: 'boxed'};
    if (!rootViews(rootPathSegments(model, target.path)).includes(view)) return {path: target.path, view: 'boxed'};
    return {path: target.path, view};
}
