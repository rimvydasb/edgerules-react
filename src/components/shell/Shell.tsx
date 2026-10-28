import {Alert} from '@mantine/core';
import {useCallback, useEffect, useMemo, useRef, useState, type ReactElement} from 'react';
import {cx} from '#ui/cx';
import {createBoxedEditorService, type BoxedEditorOpenTarget} from '../boxed-editor';
import {createFlowEditorService, type FlowEditorOpenTarget} from '../flow-editor';
import {ProjectExplorer} from '../project-explorer';
import {useProjectSession, useProjectSlice, useProjectSnapshot} from '../project-session';
import {isRootPath, rootPathSegments} from './shell-path';
import type {ShellProps, ShellView} from './shell-types';
import {ShellBreadcrumbs} from './ShellBreadcrumbs';
import {ShellViewSwitch} from './ShellViewSwitch';
import {BoxedView} from './views/BoxedView';
import {CodeView} from './views/CodeView';
import {FlowView} from './views/FlowView';
import * as classes from './shell.module.css';

type OpenTarget = BoxedEditorOpenTarget | FlowEditorOpenTarget;

/**
 * One part of the model of the open `ProjectSession`, from a root path: the whole model ('*'), a context or a
 * function. Shows it in one of three editors (Code, Boxed, Flow) and follows the drill-downs of the editors. Render it
 * inside a `ProjectProvider`.
 */
export function Shell({
    languageService,
    path,
    defaultPath = '*',
    onPathChange,
    view: viewProp,
    defaultView = 'boxed',
    onViewChange,
    readOnly,
    explorerOpen: explorerOpenProp,
    defaultExplorerOpen = false,
    onExplorerOpenChange,
    onOpenNode,
    className,
    style,
}: ShellProps): ReactElement {
    const session = useProjectSession();
    const {version} = useProjectSlice('model');
    const {dslValidity} = useProjectSnapshot();
    const [ownPath, setOwnPath] = useState(defaultPath);
    const [ownView, setOwnView] = useState<ShellView>(defaultView);
    const [ownExplorerOpen, setOwnExplorerOpen] = useState(defaultExplorerOpen);
    const explorerOpen = explorerOpenProp ?? ownExplorerOpen;
    const requested = path ?? ownPath;
    const view = viewProp ?? ownView;

    // The requested path, or its nearest valid ancestor that exists in the current model.
    const segments = useMemo(
        () => rootPathSegments(session.engine.toPortable(), requested),
        // `version` changes with every model change, which can remove or rename the path.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [session, requested, version],
    );
    const root = segments.at(-1)?.path ?? '*';

    const boxedService = useMemo(() => createBoxedEditorService(session.engine), [session]);
    const flowService = useMemo(() => createFlowEditorService(session.engine, {root}), [session, root]);

    // Uncommitted code of context and function paths; the session keeps the draft of '*'.
    const drafts = useMemo(() => new Map<string, string>(), [session]);
    const [codeErrors, setCodeErrors] = useState<Record<string, string>>({});
    const flushCode = useRef<(() => void) | undefined>(undefined);
    const onCommitError = useCallback((errorPath: string, message: string | undefined) => {
        setCodeErrors((current) => {
            if (current[errorPath] === message) return current;
            const {[errorPath]: _cleared, ...rest} = current;
            return message === undefined ? rest : {...rest, [errorPath]: message};
        });
    }, []);

    // An invalid or removed path falls back to the nearest valid ancestor.
    useEffect(() => {
        if (root === requested) return;
        if (path === undefined) setOwnPath(root);
        onPathChange?.(root);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [root, requested]);

    const navigate = (next: {path?: string; view?: ShellView}) => {
        // A pending edit of the Code view belongs to the path and view it was typed in.
        flushCode.current?.();
        if (next.path !== undefined && next.path !== root) {
            if (path === undefined) setOwnPath(next.path);
            onPathChange?.(next.path);
        }
        if (next.view !== undefined && next.view !== view) {
            if (viewProp === undefined) setOwnView(next.view);
            onViewChange?.(next.view);
        }
    };

    const setExplorerOpen = (open: boolean) => {
        if (explorerOpenProp === undefined) setOwnExplorerOpen(open);
        onExplorerOpenChange?.(open);
    };

    const openNode = (target: OpenTarget) => {
        const opens = isRootPath(session.engine.toPortable(), target.path);
        if (opens && target.kind === 'boxed-editor') navigate({path: target.path, view: 'boxed'});
        else if (opens && target.kind === 'code-editor') navigate({path: target.path, view: 'code'});
        else onOpenNode?.(target);
    };

    const status =
        root === '*' ? (dslValidity.status === 'invalid' ? dslValidity.message : undefined) : codeErrors[root];

    return (
        <div className={cx(classes.root, className)} style={style} data-testid="shell">
            {explorerOpen && (
                <ProjectExplorer
                    className={classes.explorer}
                    service={session.engine}
                    revision={version}
                    rootLabel="Project"
                    onClose={() => setExplorerOpen(false)}
                    onOpenContext={(contextPath) => navigate({path: contextPath})}
                    onOpenVariables={(contextPath) => navigate({path: contextPath || '*'})}
                    onOpenFunction={(functionPath) => navigate({path: functionPath})}
                    onOpenDecisionTable={(tablePath) => onOpenNode?.({kind: 'ruleset', path: tablePath})}
                    onOpenTypes={(typeName) => onOpenNode?.({kind: 'type-definition', path: typeName ?? '*'})}
                />
            )}
            <div className={classes.main}>
                <div className={classes.header}>
                    <ShellBreadcrumbs
                        segments={segments}
                        onNavigate={(next) => navigate({path: next})}
                        explorerOpen={explorerOpen}
                        onToggleExplorer={() => setExplorerOpen(!explorerOpen)}
                    />
                    <ShellViewSwitch view={view} onChange={(next) => navigate({view: next})} />
                </div>
                <div className={classes.body}>
                    {view === 'code' && (
                        <CodeView
                            key={root}
                            root={root}
                            languageService={languageService}
                            readOnly={readOnly}
                            drafts={drafts}
                            onCommitError={onCommitError}
                            flushRef={flushCode}
                        />
                    )}
                    {view === 'boxed' && (
                        <BoxedView
                            root={root}
                            service={boxedService}
                            languageService={languageService}
                            readOnly={readOnly}
                            onOpenNode={openNode}
                        />
                    )}
                    {view === 'flow' && (
                        <FlowView
                            key={root}
                            root={root}
                            service={flowService}
                            languageService={languageService}
                            readOnly={readOnly}
                            onOpenNode={openNode}
                        />
                    )}
                </div>
                {status !== undefined && (
                    <Alert
                        className={classes.status}
                        color="red"
                        variant="light"
                        title="The code is not applied"
                        data-testid="shell-status"
                    >
                        {status}
                    </Alert>
                )}
            </div>
        </div>
    );
}
