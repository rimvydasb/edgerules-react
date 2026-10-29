import {Alert} from '@mantine/core';
import {useCallback, useEffect, useMemo, useRef, useState, type ReactElement} from 'react';
import {listCallables, untypedParameters} from '#lib/callables';
import {cx} from '#ui/cx';
import {createBoxedEditorService, type BoxedEditorOpenTarget} from '../boxed-editor';
import {createFlowEditorService, type FlowEditorOpenTarget, type FlowFocusRequest} from '../flow-editor';
import {ProjectExplorer} from '../project-explorer';
import {useProjectSession, useProjectSlice, useProjectSnapshot} from '../project-session';
import {isRootPath, rootPathSegments, rootViews} from './shell-path';
import {explorerRoute} from './shell-routing';
import type {ShellProps, ShellView} from './shell-types';
import {ShellBreadcrumbs} from './ShellBreadcrumbs';
import {ShellSplitToggle} from './ShellSplitToggle';
import {ShellViewSwitch} from './ShellViewSwitch';
import {BoxedView} from './views/BoxedView';
import {CodeView} from './views/CodeView';
import {FlowView} from './views/FlowView';
import {TestsView} from './views/TestsView';
import * as classes from './shell.module.css';

type OpenTarget = BoxedEditorOpenTarget | FlowEditorOpenTarget;

/**
 * One part of the model of the open `ProjectSession`, from a root path: the whole model ('*') or the path of an
 * entity. Shows it in one of three editors (Code, Boxed, Flow), or the tests of a subject in the Tests Manager, and
 * follows the drill-downs of the editors. The view switch offers all four views at any root path. Render it inside a `ProjectProvider`.
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
    defaultExplorerOpen = true,
    onExplorerOpenChange,
    onOpenNode,
    className,
    style,
}: ShellProps): ReactElement {
    const session = useProjectSession();
    const {version} = useProjectSlice('model');
    const {subjects} = useProjectSlice('tests');
    const testSubjects = useMemo(() => Object.keys(subjects), [subjects]);
    const {dslValidity} = useProjectSnapshot();
    const [ownPath, setOwnPath] = useState(defaultPath);
    const [ownView, setOwnView] = useState<ShellView>(defaultView);
    const [ownExplorerOpen, setOwnExplorerOpen] = useState(defaultExplorerOpen);
    // The split screen of the Flow view: off by default.
    const [split, setSplit] = useState(false);
    const explorerOpen = explorerOpenProp ?? ownExplorerOpen;
    const requested = path ?? ownPath;
    const requestedView = viewProp ?? ownView;

    // The test subjects of the Tests Manager: the model ('*') and every fully typed callable.
    const subjectPaths = useMemo(
        () => new Set(['*', ...listCallables(session.engine).map((callable) => callable.path)]),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [session, version],
    );

    // The requested path, or its nearest valid ancestor that exists in the current model. A test subject that does
    // not exist falls back to the tests of the model.
    const segments = useMemo(() => {
        const resolved = rootPathSegments(session.engine.toPortable(), requested);
        return requestedView === 'tests' && !subjectPaths.has(resolved.at(-1)?.path ?? '*') ? [] : resolved;
        // `version` changes with every model change, which can remove or rename the path.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, requested, requestedView, version, subjectPaths]);
    const root = segments.at(-1)?.path ?? '*';
    // A generic function: the arguments that need a type before it can be tested.
    const untypedArguments = useMemo(
        () => (segments.at(-1)?.kind === 'function' ? untypedParameters(session.engine.get(root)) : []),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [session, root, segments, version],
    );
    // The views of the root path; Tests only for a test subject. A view the root path does not have falls back to
    // the Boxed view, which every root path has.
    const views = useMemo(
        () => rootViews(segments).filter((candidate) => candidate !== 'tests' || subjectPaths.has(root)),
        [segments, subjectPaths, root],
    );
    const view = views.includes(requestedView) ? requestedView : 'boxed';

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

    useEffect(() => {
        if (view === requestedView) return;
        if (viewProp === undefined) setOwnView(view);
        onViewChange?.(view);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [view, requestedView]);

    // The Flow node that the last Project Explorer click centers; a new object for every click.
    const [focus, setFocus] = useState<FlowFocusRequest | undefined>();

    const navigate = (next: {path?: string; view?: ShellView; focus?: string}) => {
        // A pending edit of the Code view belongs to the path and view it was typed in.
        flushCode.current?.();
        setFocus(next.focus === undefined ? undefined : {field: next.focus});
        if (next.path !== undefined && next.path !== root) {
            if (path === undefined) setOwnPath(next.path);
            onPathChange?.(next.path);
        }
        if (next.view !== undefined && next.view !== requestedView) {
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
        else if (target.kind === 'tests' && (target.path === '*' || opens))
            navigate({path: target.path, view: 'tests'});
        else onOpenNode?.(target);
    };

    // The first test of the root path, opened in the Tests view.
    const createTests = () => {
        session.tests.forSubject(root).addTestCase();
        navigate({view: 'tests'});
    };

    // The Tests view has no commit; the Code view commit error belongs to the editors of the model.
    const dslError = dslValidity.status === 'invalid' ? dslValidity.message : undefined;
    const status = view === 'tests' ? undefined : root === '*' ? dslError : codeErrors[root];

    const explorer = (
        <ProjectExplorer
            className={cx(classes.explorer, !explorerOpen && classes.explorerCollapsed)}
            collapsed={!explorerOpen}
            service={session.engine}
            revision={version}
            rootLabel="Project"
            testSubjects={testSubjects}
            readOnly={readOnly}
            onCollapsedChange={(collapsed) => setExplorerOpen(!collapsed)}
            onOpen={(target) => navigate(explorerRoute(target, view, session.engine.toPortable()))}
            onCreateTest={(subjectId) => session.tests.forSubject(subjectId).addTestCase()}
        />
    );

    return (
        <div className={cx(classes.root, className)} style={style} data-testid="shell">
            <div className={classes.header}>
                <ShellBreadcrumbs
                    segments={segments}
                    // A crumb of the Tests view opens the model entity, not its tests.
                    onNavigate={(next) => navigate({path: next, view: view === 'tests' ? 'boxed' : undefined})}
                    explorerOpen={explorerOpen}
                    onToggleExplorer={() => setExplorerOpen(!explorerOpen)}
                    tests={view === 'tests'}
                />
                <ShellViewSwitch
                    view={view}
                    views={views}
                    untypedArguments={untypedArguments}
                    hasTests={testSubjects.includes(root)}
                    onCreateTests={readOnly ? undefined : createTests}
                    onChange={(next) => navigate({view: next})}
                />
                <ShellSplitToggle open={split} disabled={view !== 'flow'} onToggle={() => setSplit(!split)} />
            </div>
            <div className={classes.content}>
                {explorer}
                <div className={classes.main}>
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
                                boxedService={boxedService}
                                languageService={languageService}
                                readOnly={readOnly}
                                onOpenNode={openNode}
                                focusNode={focus}
                                split={split}
                            />
                        )}
                        {view === 'tests' && (
                            <TestsView
                                subjectId={root}
                                readOnly={readOnly}
                                onSubjectChange={(subjectId) => navigate({path: subjectId})}
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
        </div>
    );
}
