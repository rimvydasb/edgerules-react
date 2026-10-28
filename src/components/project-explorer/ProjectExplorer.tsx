import {
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
    type MouseEvent,
    type ReactElement,
    type ReactNode,
} from 'react';
import {
    ActionIcon,
    Alert,
    Button,
    Group,
    Menu,
    Modal,
    ScrollArea,
    TextInput,
    Tooltip,
    Tree,
    useTree,
    type RenderTreeNodePayload,
    type TreeNodeData,
} from '@mantine/core';
import {IconChevronRight, IconLayoutSidebarLeftCollapse, IconPlus} from '@tabler/icons-react';
import type {PortableContext, PortableError, PortableNode} from '@edgerules/portable';
import {cx} from '#ui/cx';
import {isPortableError} from '#lib/portable';
import {CREATE_OPTIONS, uniqueName, type CreateOption} from './create-templates';
import {KindIcon, type IconKind} from './icons';
import {
    buildSections,
    isIdentifier,
    ROOT_FETCH_PATH,
    type ExplorerEntry,
    type ExplorerEntryKind,
    type ExplorerSection,
} from './tree-model';
import * as classes from './projectExplorer.module.css';

type GetFilter = 'FIELDS' | 'TYPE_DEFINITIONS' | 'FUNCTION_DEFINITIONS' | 'EXTERNAL_DEFINITIONS' | 'ALL';

interface ProjectExplorerService {
    get(path: string, filter?: GetFilter): PortableNode | PortableError;
    // Creates the new types, methods, variables and workbooks; without it the explorer only reads.
    set?(path: string, node: PortableNode): PortableNode | PortableError;
}

/** The entry the user opened: its kind and its fully qualified model path (the subject ID of a test). */
export interface ProjectExplorerOpenTarget {
    kind: ExplorerEntryKind;
    path: string;
}

export interface ProjectExplorerProps {
    /** The engine service to read the model from, and to create new entities with `set`. */
    service: ProjectExplorerService;
    /** Title of the panel header; not a tree node itself. */
    rootLabel?: string;
    /** Shows a close button in the header; called when it is clicked. */
    onClose?: () => void;
    /** Any value that changes with the model, e.g. the model version; a change re-reads the model. */
    revision?: unknown;
    /** The test subjects that have tests: '*' for the model, or a method path. */
    testSubjects?: readonly string[];
    /** Hides the add buttons of the sections. */
    readOnly?: boolean;
    /** A click on an entry, or a new entry. */
    onOpen?: (target: ProjectExplorerOpenTarget) => void;
    /** Adds a test to a subject; shows the add button of Tests. The explorer then opens the subject's tests. */
    onCreateTest?: (subjectId: string) => void;
    className?: string;
    style?: CSSProperties;
}

const NO_SUBJECTS: readonly string[] = [];

const SECTIONS: {section: ExplorerSection; label: string}[] = [
    {section: 'types', label: 'Types'},
    {section: 'methods', label: 'Methods'},
    {section: 'variables', label: 'Variables'},
    {section: 'workbooks', label: 'Workbooks'},
    {section: 'tests', label: 'Tests'},
];

function sectionItemId(section: ExplorerSection): string {
    return `section:${section}`;
}

function entryItemId(kind: ExplorerEntryKind, path: string): string {
    return `${kind}:${path}`;
}

/** What a node renders. Kept in `nodeProps`. */
interface NodeMeta {
    kind: IconKind;
    text: string;
    section?: ExplorerSection; // set on a section header
    count?: number; // the member count of a section
    target?: ProjectExplorerOpenTarget; // set on an entry
}

const CODE_KINDS = new Set<IconKind>(['function', 'service', 'ruleset', 'test']);

function entryNode(entry: ExplorerEntry): TreeNodeData {
    const meta: NodeMeta = {kind: entry.kind, text: entry.label, target: {kind: entry.kind, path: entry.path}};
    return {
        value: entryItemId(entry.kind, entry.path),
        label: entry.label,
        nodeProps: {meta},
        ...(entry.children?.length ? {children: entry.children.map(entryNode)} : {}),
    };
}

/** The new entity the name dialog is open for. */
interface PendingCreate {
    section: ExplorerSection;
    option: CreateOption;
}

/**
 * The project tree: Types, Methods, Variables, Workbooks and Tests (docs/stories/project-explorer-redesign.md). It
 * reads the model with two `service.get` calls and reports the opened entry through `onOpen`; the host picks the
 * editor. Each section header has an add button that creates a new entity with `service.set` and opens it.
 */
export function ProjectExplorer({
    service,
    rootLabel = 'Project',
    onClose,
    revision,
    testSubjects = NO_SUBJECTS,
    readOnly = false,
    onOpen,
    onCreateTest,
    className,
    style,
}: ProjectExplorerProps): ReactElement {
    // A create bumps it, so a host without a `revision` sees the new entity too.
    const [created, setCreated] = useState(0);
    const {model, types} = useMemo(
        () => ({
            model: service.get(ROOT_FETCH_PATH),
            types: service.get(ROOT_FETCH_PATH, 'TYPE_DEFINITIONS'),
        }),
        // `revision` and `created` stand for model changes the service does not report.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [service, revision, created],
    );
    const sections = useMemo(
        () =>
            isPortableError(model)
                ? undefined
                : buildSections(
                      model as PortableContext,
                      isPortableError(types) ? undefined : (types as PortableContext),
                      testSubjects,
                  ),
        [model, types, testSubjects],
    );

    const tree = useTree();
    const [pending, setPending] = useState<PendingCreate | undefined>();

    const onOpenRef = useRef(onOpen);
    onOpenRef.current = onOpen;

    const data = useMemo(
        () =>
            SECTIONS.map(({section, label}) => {
                const entries = sections?.[section] ?? [];
                const meta: NodeMeta = {kind: section, text: label, section, count: entries.length};
                return {value: sectionItemId(section), label, nodeProps: {meta}, children: entries.map(entryNode)};
            }),
        [sections],
    );

    // The names a new root entity must not take: root fields and types share one namespace for the user.
    const taken = useMemo(() => {
        const names = new Set<string>();
        for (const entry of [
            ...(sections?.types ?? []),
            ...(sections?.variables ?? []),
            ...(sections?.workbooks ?? []),
        ])
            names.add(entry.path);
        // The nodes of the root workbook are root fields too.
        for (const entry of sections?.workbooks.find((workbook) => workbook.path === ROOT_FETCH_PATH)?.children ?? [])
            names.add(entry.path);
        for (const entry of sections?.methods ?? []) if (!entry.path.includes('.')) names.add(entry.path);
        return names;
    }, [sections]);

    const canCreate = !readOnly && service.set !== undefined;
    const testSubjectOptions = [
        {path: '*', label: 'Model'},
        ...(sections?.methods ?? []).map((entry) => ({path: entry.path, label: entry.label})),
    ];

    const open = (target: ProjectExplorerOpenTarget) => onOpenRef.current?.(target);

    const createTest = (subjectId: string) => {
        onCreateTest?.(subjectId);
        tree.expand(sectionItemId('tests'));
        tree.select(entryItemId('test', subjectId));
        open({kind: 'test', path: subjectId});
    };

    function addButton(section: ExplorerSection, label: string): ReactNode {
        const stop = {
            onClick: (event: MouseEvent) => event.stopPropagation(),
            onKeyDown: (event: KeyboardEvent) => event.stopPropagation(),
        };
        const trigger = (onClick?: () => void) => (
            <ActionIcon
                variant="subtle"
                color="gray"
                size="sm"
                className={classes.add}
                aria-label={`Add to ${label}`}
                onClick={(event) => {
                    event.stopPropagation();
                    onClick?.();
                }}
                onKeyDown={stop.onKeyDown}
            >
                <IconPlus size={14} />
            </ActionIcon>
        );

        if (section === 'tests') {
            if (readOnly || !onCreateTest) return null;
            return (
                <span {...stop}>
                    <Menu position="bottom-end" withinPortal shadow="md">
                        <Menu.Target>{trigger()}</Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Label>New test of</Menu.Label>
                            {testSubjectOptions.map((subject) => (
                                <Menu.Item key={subject.path} onClick={() => createTest(subject.path)}>
                                    {subject.label}
                                </Menu.Item>
                            ))}
                        </Menu.Dropdown>
                    </Menu>
                </span>
            );
        }

        if (!canCreate) return null;
        const options = CREATE_OPTIONS[section];
        if (options.length === 1) {
            return <span {...stop}>{trigger(() => setPending({section, option: options[0]!}))}</span>;
        }
        return (
            <span {...stop}>
                <Menu position="bottom-end" withinPortal shadow="md">
                    <Menu.Target>{trigger()}</Menu.Target>
                    <Menu.Dropdown>
                        {options.map((option) => (
                            <Menu.Item
                                key={option.kind}
                                leftSection={<KindIcon kind={option.kind} />}
                                onClick={() => setPending({section, option})}
                            >
                                {option.label}
                            </Menu.Item>
                        ))}
                    </Menu.Dropdown>
                </Menu>
            </span>
        );
    }

    function renderNode({node: item, expanded, hasChildren, elementProps}: RenderTreeNodePayload): ReactNode {
        const meta = item.nodeProps?.meta as NodeMeta | undefined;
        if (!meta) return null;
        return (
            <div
                {...elementProps}
                className={cx(elementProps.className, classes.node)}
                onClick={(event) => {
                    elementProps.onClick(event);
                    if (meta.target) open(meta.target);
                }}
            >
                <IconChevronRight
                    size={14}
                    className={cx(
                        classes.chevron,
                        expanded && classes.chevronOpen,
                        !hasChildren && classes.chevronHidden,
                    )}
                    aria-hidden="true"
                />
                <span className={classes.label}>
                    <KindIcon kind={meta.kind} />
                    <span
                        className={cx(
                            classes.text,
                            meta.section && classes.group,
                            CODE_KINDS.has(meta.kind) && classes.textCode,
                        )}
                    >
                        {meta.text}
                    </span>
                    {meta.count !== undefined ? <span className={classes.count}>{meta.count}</span> : null}
                </span>
                {meta.section ? addButton(meta.section, meta.text) : null}
            </div>
        );
    }

    return (
        <nav className={cx(classes.root, className)} style={style} aria-label="Project explorer">
            {rootLabel || onClose ? (
                <div className={classes.header}>
                    <span className={classes.title}>{rootLabel}</span>
                    {onClose ? (
                        <Tooltip label="Hide project explorer" withArrow>
                            <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                aria-label="Hide project explorer"
                                onClick={onClose}
                            >
                                <IconLayoutSidebarLeftCollapse size={16} />
                            </ActionIcon>
                        </Tooltip>
                    ) : null}
                </div>
            ) : null}
            <ScrollArea className={classes.body} type="hover" scrollbarSize={6}>
                {isPortableError(model) ? (
                    <Alert className={classes.error} color="red" variant="light">
                        {model.message}
                    </Alert>
                ) : (
                    <Tree
                        className={classes.tree}
                        data={data}
                        tree={tree}
                        levelOffset="md"
                        expandOnClick
                        selectOnClick
                        renderNode={renderNode}
                    />
                )}
            </ScrollArea>
            {pending ? (
                <CreateDialog
                    pending={pending}
                    taken={taken}
                    onCancel={() => setPending(undefined)}
                    onCreate={(name) => {
                        const result = service.set!(name, pending.option.template());
                        if (isPortableError(result)) return result.message;
                        setPending(undefined);
                        setCreated((count) => count + 1);
                        tree.expand(sectionItemId(pending.section));
                        tree.select(entryItemId(pending.option.kind, name));
                        open({kind: pending.option.kind, path: name});
                        return undefined;
                    }}
                />
            ) : null}
        </nav>
    );
}

interface CreateDialogProps {
    pending: PendingCreate;
    taken: ReadonlySet<string>;
    onCancel: () => void;
    onCreate: (name: string) => string | undefined; // an error message, or undefined on success
}

/** Asks for the name of a new root entity. */
function CreateDialog({pending, taken, onCancel, onCreate}: CreateDialogProps): ReactElement {
    const [name, setName] = useState(() => uniqueName(pending.option.defaultName, taken));
    const [error, setError] = useState<string | undefined>();

    const submit = () => {
        const trimmed = name.trim();
        if (!isIdentifier(trimmed)) {
            setError('A name starts with a letter or _ and has only letters, digits and _.');
        } else if (taken.has(trimmed)) {
            setError(`"${trimmed}" already exists.`);
        } else {
            setError(onCreate(trimmed));
        }
    };

    return (
        <Modal opened onClose={onCancel} title={`New ${pending.option.label.toLowerCase()}`} size="sm">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                }}
            >
                <TextInput
                    label="Name"
                    value={name}
                    error={error}
                    data-autofocus
                    onChange={(event) => {
                        setName(event.currentTarget.value);
                        setError(undefined);
                    }}
                />
                <Group justify="flex-end" mt="md">
                    <Button variant="default" onClick={onCancel}>
                        Cancel
                    </Button>
                    <Button type="submit">Create</Button>
                </Group>
            </form>
        </Modal>
    );
}
