import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type KeyboardEvent,
    type ReactElement,
    type ReactNode,
} from 'react';
import {ActionIcon, Alert, Button, Group, Menu, Modal, Select, Text, TextInput, Tooltip} from '@mantine/core';
import {IconDotsVertical, IconPlus} from '@tabler/icons-react';
import type {
    PortableContext,
    PortableError,
    PortableNode,
    PortableRule,
    PortableRulesetDefinition,
    PortableRulesetSchema,
    PortableTypeReference,
} from '@edgerules/portable';
import {isPortableError} from '../../lib/portable';
import {cx} from '../../ui/cx';
import {GridBody, GridCell, GridHead, GridRow, GridTable} from '../../ui/grid';
import {Toast} from '../../ui/Toast';
import * as classes from './decisionTable.module.css';
import {CodeEditorCell} from '../code-editor-cell/CodeEditorCell';
import type {CodeEditorService} from '../code-editor/language/service';
import {highlightEdgeRules} from '../code-editor/language/highlight';
import {
    HIT_POLICIES,
    SCALAR_OUTPUT,
    buildExpressionFromCells,
    buildTableModel,
    defaultTextForType,
    duplicatePriorities,
    emptyRow,
    isValidColumnName,
    isValidPriority,
    parameterSignature,
    parseExpressionToCells,
    rowToRule,
    thenCellEmbedContext,
    whenCellEmbedContext,
    whenExpressionEmbedContext,
    withDefaultRow,
    withHitPolicy,
    withInputColumnAdded,
    withInputColumnRemoved,
    withInputColumnRenamed,
    withInputColumnTypeChanged,
    withOutputColumnAdded,
    withOutputColumnRemoved,
    withOutputColumnRenamed,
    withOutputColumnsReordered,
    withRules,
    type DecisionTableRow,
    type HitPolicy,
} from './table-model';

/**
 * Structural subset of `MutableDecisionService` the editor needs — pass the dev-build
 * instance directly. Declared locally so the component keeps no hard dependency on a
 * specific engine package version.
 */
export interface DecisionTableService {
    get(path: string): PortableNode | PortableError;
    /** `PortableRule` is accepted at `<ruleset>.rules[i]` paths although it is not a `PortableNode`. */
    set(path: string, node: PortableNode | PortableRule): PortableNode | PortableError;
    /**
     * Optional: renames the ruleset itself and relinks its call sites. Also renames a ruleset's own
     * parameter one level deeper, as `"<path>.parameters.<name>"` — the engine relinks the cell-map
     * `when` column, boolean-expression bare-identifier references, and named-argument call sites
     * anywhere in the model. When absent, the "Rename table…" action is hidden and input-column
     * rename falls back to a client-side rewrite (see `withInputColumnRenamed`) that only covers the
     * `@parameters` key and cell-map `when` rows.
     */
    rename?(path: string, newName: string): void | PortableError;
    /**
     * Optional: explicit, throwing relink attempt (`MutableDecisionService.link()`). `set()` itself
     * never rolls back or errors for a linking reason (see `../../../edgerules-v2/doc/architecture/CRUD_SPEC.md`),
     * so a cell edit that breaks the ruleset's own linking (e.g. a `when`-cell value of the wrong
     * type) must be caught and undone here instead — see `setWithLinkCheck` below. When absent, a
     * link-breaking edit commits without detection, same as `rename`'s optionality above.
     */
    link?(): void;
}

/**
 * Writes `node` at `path`, then confirms the model still links; a break is treated as a rejection —
 * `rollback`'s node is written back to `rollback.path` and the linker's `PortableError` is returned
 * in place of the (already-applied) success node. A no-op when `service.link` isn't provided.
 */
function setWithLinkCheck(
    service: DecisionTableService,
    path: string,
    node: PortableNode | PortableRule,
    rollback?: {path: string; node: PortableNode | PortableRule},
): PortableNode | PortableError {
    const result = service.set(path, node);
    if (isPortableError(result)) return result;
    if (!service.link) return result;
    try {
        service.link();
        return result;
    } catch (linkError) {
        if (rollback) service.set(rollback.path, rollback.node);
        return linkError as PortableError;
    }
}

export interface DecisionTableEditorProps {
    /** The engine service holding the model (CRUD: `get`/`set`). */
    service: DecisionTableService;
    /** Path of the `ruleset` to edit, e.g. `"risk"`. */
    path: string;
    /**
     * Language service for the active cell editor (same contract as `CodeEditor` — pass the
     * dev `MutableDecisionService` class). Without it cells still edit, but without
     * diagnostics or completions.
     */
    languageService?: CodeEditorService;
    readOnly?: boolean;
    /** Fired with the fresh definition after every successful edit. */
    onChange?: (definition: PortableRulesetDefinition) => void;
    /** Fired after a successful "Rename table…" — the host should update its `path` prop to match. */
    onRenamed?: (newPath: string) => void;
    className?: string;
    style?: CSSProperties;
}

type CellId =
    | {kind: 'when'; row: number; name: string}
    | {kind: 'when-expression'; row: number}
    | {kind: 'then'; row: number; name: string}
    | {kind: 'default'; name: string}
    | {kind: 'annotation'; row: number}
    | {kind: 'priority'; row: number};

function cellKey(id: CellId): string {
    switch (id.kind) {
        case 'when':
            return `when:${id.row}:${id.name}`;
        case 'when-expression':
            return `when-expression:${id.row}`;
        case 'then':
            return `then:${id.row}:${id.name}`;
        case 'default':
            return `default:${id.name}`;
        case 'annotation':
            return `annotation:${id.row}`;
        case 'priority':
            return `priority:${id.row}`;
    }
}

const NOOP_LANGUAGE_SERVICE: CodeEditorService = {diagnostics: () => []};

/** Display-only rendering of a cell's DSL text as statically highlighted spans. */
function HighlightedText({text}: {text: string}): ReactElement {
    const spans = useMemo(() => highlightEdgeRules(text), [text]);
    return (
        <>
            {spans.map((span, index) =>
                span.className ? (
                    // eslint-disable-next-line react/no-array-index-key
                    <span key={index} className={span.className}>
                        {span.text}
                    </span>
                ) : (
                    span.text
                ),
            )}
        </>
    );
}

interface DisplayCellProps {
    text: string;
    /** Rendered dimmed when `text` is empty ("–" = matches any / no value). */
    emptyLabel?: string;
    /** Render as plain text (annotations, priorities) instead of highlighted DSL. */
    plain?: boolean;
    readOnly: boolean;
    /** Highlights the cell (e.g. a duplicate `best-match` priority) without blocking editing. */
    warning?: boolean;
    gridPosition?: {row: number; col: number};
    /**
     * Extra columns (same row) that should also focus this element — used by the
     * boolean-expression `when` cell, which visually spans every input column but has a single
     * `gridPosition` for computing where Left/Right arrow should go next (DT-024).
     */
    aliasCols?: number[];
    onStartEdit: () => void;
    onNavigate?: (row: number, col: number) => void;
    registerRef?: (key: string, element: HTMLElement | null) => void;
}

function DisplayCell({
    text,
    emptyLabel = '–',
    plain = false,
    readOnly,
    warning = false,
    gridPosition,
    aliasCols,
    onStartEdit,
    onNavigate,
    registerRef,
}: DisplayCellProps): ReactElement {
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
        if (!readOnly && (event.key === 'Enter' || event.key === 'F2')) {
            event.preventDefault();
            onStartEdit();
            return;
        }
        if (gridPosition && onNavigate) {
            const moves: Record<string, [number, number]> = {
                ArrowUp: [-1, 0],
                ArrowDown: [1, 0],
                ArrowLeft: [0, -1],
                ArrowRight: [0, 1],
            };
            const move = moves[event.key];
            if (move) {
                event.preventDefault();
                onNavigate(gridPosition.row + move[0], gridPosition.col + move[1]);
            }
        }
    };

    return (
        <div
            // Not in the default Tab order when read-only — there is no action to reach, so it
            // shouldn't present as a focusable "button" (DT-031). Still programmatically focusable
            // (tabIndex -1) so arrow-key grid navigation keeps working.
            tabIndex={readOnly ? -1 : 0}
            role={readOnly ? undefined : 'button'}
            data-grid-row={gridPosition?.row}
            data-grid-col={gridPosition?.col}
            ref={(element: HTMLElement | null) => {
                if (registerRef && gridPosition) {
                    registerRef(`${gridPosition.row}:${gridPosition.col}`, element);
                    if (aliasCols) {
                        for (const col of aliasCols) {
                            registerRef(`${gridPosition.row}:${col}`, element);
                        }
                    }
                }
            }}
            onDoubleClick={readOnly ? undefined : onStartEdit}
            onKeyDown={handleKeyDown}
            className={cx(classes.displayCell, !readOnly && classes.editable, warning && classes.warning)}
        >
            {/* Single child span: the flex parent would otherwise drop whitespace-only text nodes between token spans. */}
            <span className={classes.pre}>
                {text.length > 0 ? (
                    plain ? (
                        text
                    ) : (
                        <HighlightedText text={text} />
                    )
                ) : (
                    <span className={classes.empty}>{emptyLabel}</span>
                )}
            </span>
        </div>
    );
}

interface PlainCellEditorProps {
    value: string;
    type?: 'text' | 'number';
    ariaLabel: string;
    onCommit: (value: string) => void;
    onCancel: () => void;
}

/** Minimal inline editor for non-DSL cells (annotation, priority): Enter/blur commits, Escape cancels. */
function PlainCellEditor({value, type = 'text', ariaLabel, onCommit, onCancel}: PlainCellEditorProps): ReactElement {
    const cancelledRef = useRef(false);
    return (
        <input
            autoFocus
            defaultValue={value}
            type={type}
            aria-label={ariaLabel}
            className={classes.plainEditor}
            onBlur={(event) => {
                if (!cancelledRef.current) {
                    onCommit(event.target.value);
                }
            }}
            onKeyDown={(event) => {
                if (event.key === 'Enter') {
                    (event.target as HTMLInputElement).blur();
                }
                if (event.key === 'Escape') {
                    cancelledRef.current = true;
                    onCancel();
                }
            }}
        />
    );
}

interface ColumnDialogState {
    title: string;
    nameLabel: string;
    initialName?: string;
    /** False locks the name field — used by "Change type…", which only edits the type. */
    nameEditable?: boolean;
    withType?: boolean;
    initialType?: PortableTypeReference;
    /** Non-blocking note shown above the fields (e.g. a rename's reference-safety caveat). */
    warning?: string;
    /** Returns an error message to keep the dialog open with it inline, or `null` on success. */
    onSubmit: (name: string, type: PortableTypeReference) => string | null;
}

const INPUT_TYPES: PortableTypeReference[] = [
    'number',
    'string',
    'boolean',
    'date',
    'time',
    'datetime',
    'duration',
    'period',
];

function ColumnDialog({state, onClose}: {state: ColumnDialogState | null; onClose: () => void}): ReactElement {
    const [name, setName] = useState('');
    const [type, setType] = useState<PortableTypeReference>('string');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setName(state?.initialName ?? '');
        setType(state?.initialType ?? 'string');
        setError(null);
    }, [state]);

    const submit = (): void => {
        if (!state || name.trim().length === 0) {
            return;
        }
        const result = state.onSubmit(name.trim(), type);
        if (result !== null) {
            setError(result);
            return;
        }
        onClose();
    };

    return (
        <Modal opened={state !== null} onClose={onClose} title={state?.title} size="sm" centered>
            <div className={classes.dialogFields}>
                {state?.warning ? (
                    <Alert color="blue" variant="light">
                        {state.warning}
                    </Alert>
                ) : null}
                <TextInput
                    data-autofocus
                    label={state?.nameLabel}
                    value={name}
                    size="sm"
                    disabled={state?.nameEditable === false}
                    error={error ?? undefined}
                    onChange={(event) => {
                        setName(event.target.value);
                        setError(null);
                    }}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            submit();
                        }
                    }}
                />
                {state?.withType ? (
                    <Select
                        value={type}
                        size="sm"
                        allowDeselect={false}
                        data={INPUT_TYPES}
                        onChange={(next) => {
                            if (next) setType(next as PortableTypeReference);
                        }}
                        aria-label="Column type"
                    />
                ) : null}
                <Group justify="flex-end" gap="xs">
                    <Button variant="default" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button onClick={submit} disabled={name.trim().length === 0}>
                        OK
                    </Button>
                </Group>
            </div>
        </Modal>
    );
}

interface ConfirmState {
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
}

/** Confirms a destructive structural op (delete rule/column, remove default, drop-on-hit-policy-change). */
function ConfirmDialog({state, onClose}: {state: ConfirmState | null; onClose: () => void}): ReactElement {
    return (
        <Modal opened={state !== null} onClose={onClose} title={state?.title} size="sm" centered>
            <Text size="sm">{state?.message}</Text>
            <Group justify="flex-end" gap="xs" mt="md">
                <Button variant="default" onClick={onClose}>
                    Cancel
                </Button>
                <Button
                    color="red"
                    data-autofocus
                    onClick={() => {
                        state?.onConfirm();
                        onClose();
                    }}
                >
                    {state?.confirmLabel ?? 'Delete'}
                </Button>
            </Group>
        </Modal>
    );
}

/** Short human-readable summary of a row's condition/result, for a delete confirmation. */
function describeRow(row: DecisionTableRow): string {
    const when =
        row.when.kind === 'expression'
            ? row.when.text
            : Object.entries(row.when.cells)
                  .filter(([, value]) => value.trim().length > 0)
                  .map(([name, value]) => `${name}: ${value}`)
                  .join(', ') || 'any';
    const then = Object.entries(row.then)
        .map(([name, value]) => (name === SCALAR_OUTPUT ? value : `${name}: ${value}`))
        .join(', ');
    return `when ${when} → then ${then}`;
}

/** A ruleset parameter's declared type, whether stored as a bare reference or a typed-value wrapper. */
function currentParameterType(definition: PortableRulesetDefinition, name: string): PortableTypeReference {
    const parameter = definition['@parameters'][name];
    return typeof parameter === 'string' ? parameter : (parameter as {type: PortableTypeReference}).type;
}

/**
 * EdgeRules Decision Table Editor: a DMN-style grid over a first-class `ruleset` — input
 * columns from the parameters, output columns from the `then` shape, a hit-policy badge,
 * an optional pinned default row, and priority editing under `best-match`. Rulesets whose
 * rows produce bare scores (scorecards) collapse to a single score column, and rows whose
 * condition is one boolean expression span the input columns.
 *
 * Display cells are statically highlighted spans; a single `CodeEditorCell` (full language
 * tooling) mounts only on the cell being edited. Edits are written back through the engine
 * one rule at a time; a rejected edit restores the last good node and surfaces the engine
 * error above the table.
 */
export function DecisionTableEditor({
    service,
    path,
    languageService,
    readOnly = false,
    onChange,
    onRenamed,
    className,
    style,
}: DecisionTableEditorProps): ReactElement {
    const [definition, setDefinition] = useState<PortableRulesetDefinition | null>(null);
    const [schema, setSchema] = useState<PortableRulesetSchema | undefined>(undefined);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [editError, setEditError] = useState<string | null>(null);
    const [editing, setEditing] = useState<CellId | null>(null);
    /** Attempted (invalid) text + engine diagnostic per cell, keyed by `cellKey` — kept until the
     * cell is retried successfully or the edit is cancelled, so a rejected edit doesn't lose what
     * the user typed (DT-029). */
    const [pendingErrors, setPendingErrors] = useState<Record<string, {text: string; message: string}>>({});
    const [dialog, setDialog] = useState<ColumnDialogState | null>(null);
    const [confirm, setConfirm] = useState<ConfirmState | null>(null);
    const [undo, setUndo] = useState<{label: string; definition: PortableRulesetDefinition} | null>(null);
    const cellRefs = useRef(new Map<string, HTMLElement>());
    const cachedDefaultRef = useRef<PortableContext | undefined>(undefined);
    const cachedPrioritiesRef = useRef<number[] | undefined>(undefined);

    // The ruleset path is normally just the `path` prop, but a successful "Rename table…" moves
    // it — tracked locally so the rest of this component (and a host that ignores `onRenamed`)
    // keeps working immediately, without waiting for a prop update that may never come.
    const [activePath, setActivePath] = useState(path);
    useEffect(() => {
        setActivePath(path);
    }, [path]);

    const refresh = useCallback((): PortableRulesetDefinition | null => {
        const node = service.get(`${activePath}.*`);
        if (isPortableError(node)) {
            setLoadError(node.message);
            setDefinition(null);
            return null;
        }
        const schemaNode = service.get(activePath);
        setSchema(
            !isPortableError(schemaNode) &&
                typeof schemaNode === 'object' &&
                schemaNode !== null &&
                (schemaNode as {'@kind'?: unknown})['@kind'] === 'ruleset-schema'
                ? (schemaNode as unknown as PortableRulesetSchema)
                : undefined,
        );
        setLoadError(null);
        setDefinition(node as PortableRulesetDefinition);
        return node as PortableRulesetDefinition;
    }, [service, activePath]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const model = useMemo(() => (definition ? buildTableModel(definition, schema) : null), [definition, schema]);

    const finishWrite = useCallback(() => {
        setEditError(null);
        setEditing(null);
        setUndo(null);
        const fresh = refresh();
        if (fresh) {
            onChange?.(fresh);
        }
    }, [refresh, onChange]);

    /** Writes one rule; on engine rejection restores the last good rule and keeps the error. */
    const applyRule = useCallback(
        (index: number, rule: PortableRule): string | null => {
            if (!definition) {
                return null;
            }
            const rulePath = `${activePath}.rules[${index}]`;
            const result = setWithLinkCheck(service, rulePath, rule, {
                path: rulePath,
                node: definition['@rules'][index],
            });
            if (isPortableError(result)) {
                setEditError(result.message);
                return result.message;
            }
            finishWrite();
            return null;
        },
        [definition, activePath, service, finishWrite],
    );

    /** Whole-ruleset write for structural edits (hit policy, rows added/removed, columns). Returns
     * the engine's error message on rejection, or `null` on success, so dialogs can stay open. */
    const applyDefinition = useCallback(
        (next: PortableRulesetDefinition): string | null => {
            if (!definition) {
                return null;
            }
            const result = setWithLinkCheck(service, activePath, next, {path: activePath, node: definition});
            if (isPortableError(result)) {
                setEditError(result.message);
                return result.message;
            }
            finishWrite();
            return null;
        },
        [definition, activePath, service, finishWrite],
    );

    /** Like `applyDefinition`, but remembers the pre-change snapshot so `undo` can restore it. */
    const applyDestructive = useCallback(
        (next: PortableRulesetDefinition, undoLabel: string): void => {
            if (!definition) {
                return;
            }
            const previous = definition;
            const error = applyDefinition(next);
            if (error === null) {
                setUndo({label: undoLabel, definition: previous});
            }
        },
        [definition, applyDefinition],
    );

    const applyDefaultCell = useCallback(
        (name: string, text: string): string | null => {
            if (!definition) {
                return null;
            }
            const cellPath = name === SCALAR_OUTPUT ? `${activePath}.default` : `${activePath}.default.${name}`;
            const previous = definition['@default'];
            const result = setWithLinkCheck(
                service,
                cellPath,
                text.trim(),
                previous !== undefined ? {path: `${activePath}.default`, node: previous} : undefined,
            );
            if (isPortableError(result)) {
                setEditError(result.message);
                return result.message;
            }
            finishWrite();
            return null;
        },
        [definition, activePath, service, finishWrite],
    );

    /** Records (or clears, on success) the attempted text/diagnostic for a cell — see `pendingErrors`. */
    const recordPendingError = useCallback((key: string, attemptedText: string, error: string | null): void => {
        setPendingErrors((previous) => {
            if (error === null) {
                if (!(key in previous)) {
                    return previous;
                }
                const next = {...previous};
                delete next[key];
                return next;
            }
            return {...previous, [key]: {text: attemptedText, message: error}};
        });
    }, []);

    /** Starts editing a cell, discarding any stale attempted-text/diagnostic from a previous session. */
    const beginEdit = useCallback(
        (id: CellId): void => {
            recordPendingError(cellKey(id), '', null);
            setEditing(id);
        },
        [recordPendingError],
    );

    const commitRowEdit = useCallback(
        (
            rowIndex: number,
            mutate: (row: DecisionTableRow) => void,
            errorKey?: string,
            attemptedText?: string,
        ): void => {
            if (!model) {
                return;
            }
            const row: DecisionTableRow = {
                ...model.rows[rowIndex],
                when:
                    model.rows[rowIndex].when.kind === 'cells'
                        ? {kind: 'cells', cells: {...model.rows[rowIndex].when.cells}}
                        : {...model.rows[rowIndex].when},
                then: {...model.rows[rowIndex].then},
            };
            mutate(row);
            const error = applyRule(rowIndex, rowToRule(row, model.scorecard));
            if (errorKey !== undefined) {
                recordPendingError(errorKey, attemptedText ?? '', error);
            }
        },
        [model, applyRule, recordPendingError],
    );

    const addRule = useCallback((): void => {
        if (!definition || !model) {
            return;
        }
        const rule = rowToRule(emptyRow(model), model.scorecard);
        const index = definition['@rules'].length;
        const result = setWithLinkCheck(service, `${activePath}.rules[${index}]`, rule, {
            path: activePath,
            node: definition,
        });
        if (isPortableError(result)) {
            setEditError(result.message);
            return;
        }
        finishWrite();
    }, [definition, model, activePath, service, finishWrite]);

    /** Applies a hit-policy change, restoring a same-shape cached default/priorities set aside
     * by a previous switch away, so a reversible policy change doesn't need re-authoring (DT-006/007). */
    const applyHitPolicy = useCallback(
        (nextPolicy: HitPolicy): void => {
            if (!definition) {
                return;
            }
            if (nextPolicy === 'collect-matches' && definition['@default'] !== undefined) {
                cachedDefaultRef.current = definition['@default'];
            }
            if (definition['@hitPolicy'] === 'best-match' && nextPolicy !== 'best-match') {
                cachedPrioritiesRef.current = definition['@rules'].map((rule) => rule.priority ?? 0);
            }
            let next = withHitPolicy(definition, nextPolicy);
            if (
                nextPolicy === 'best-match' &&
                cachedPrioritiesRef.current &&
                cachedPrioritiesRef.current.length === next['@rules'].length
            ) {
                const cached = cachedPrioritiesRef.current;
                next = {...next, '@rules': next['@rules'].map((rule, index) => ({...rule, priority: cached[index]}))};
            }
            if (
                nextPolicy !== 'collect-matches' &&
                next['@default'] === undefined &&
                cachedDefaultRef.current !== undefined
            ) {
                next = {...next, '@default': cachedDefaultRef.current};
            }
            applyDefinition(next);
        },
        [definition, applyDefinition],
    );

    const handleHitPolicyChange = useCallback(
        (nextPolicy: HitPolicy): void => {
            if (!definition || !model) {
                return;
            }
            const willDropDefault = nextPolicy === 'collect-matches' && definition['@default'] !== undefined;
            const willDropPriorities =
                model.hitPolicy === 'best-match' && nextPolicy !== 'best-match' && model.rows.length > 0;
            if (willDropDefault || willDropPriorities) {
                setConfirm({
                    title: 'Change hit policy?',
                    message: willDropDefault
                        ? '"Collect matches" doesn\'t support a pinned default row — it will be removed, and restored automatically if you switch back to a policy that supports one.'
                        : 'Switching away from "Best match" removes the rows\' priorities. They\'re restored automatically if you switch back to Best match without changing the rows.',
                    confirmLabel: 'Change policy',
                    onConfirm: () => applyHitPolicy(nextPolicy),
                });
                return;
            }
            applyHitPolicy(nextPolicy);
        },
        [definition, model, applyHitPolicy],
    );

    const navigateTo = useCallback((row: number, col: number): void => {
        const exact = cellRefs.current.get(`${row}:${col}`);
        if (exact) {
            exact.focus();
            return;
        }
        // Clamp to the nearest existing column in the target row (expression rows collapse cells).
        for (let candidate = col; candidate >= 0; candidate -= 1) {
            const element = cellRefs.current.get(`${row}:${candidate}`);
            if (element) {
                element.focus();
                return;
            }
        }
    }, []);

    const registerRef = useCallback((key: string, element: HTMLElement | null): void => {
        if (element) {
            cellRefs.current.set(key, element);
        } else {
            cellRefs.current.delete(key);
        }
    }, []);

    if (loadError !== null) {
        return (
            <Alert color="red" variant="light" className={className} style={style}>
                {loadError}
            </Alert>
        );
    }
    if (!definition || !model) {
        return <div className={className} style={style} />;
    }

    const effectiveLanguageService = languageService ?? NOOP_LANGUAGE_SERVICE;
    const rulesetName = activePath.split('.').pop() ?? activePath;
    const showPriority = model.hitPolicy === 'best-match';
    const priorityColumns = showPriority ? 1 : 0;
    const totalColumns = 1 + model.inputs.length + model.outputs.length + priorityColumns + 1 + (readOnly ? 0 : 1);
    const editingKey = editing ? cellKey(editing) : null;
    const duplicatePrioritySet = showPriority ? duplicatePriorities(model.rows) : new Set<number>();

    const editorCell = (
        idKey: string,
        value: string,
        embed: {prefix: string; suffix: string},
        onCommit: (text: string) => void,
    ): ReactElement => {
        const pending = pendingErrors[idKey];
        return (
            <div>
                <CodeEditorCell
                    value={pending ? pending.text : value}
                    service={effectiveLanguageService}
                    embedContext={embed}
                    autoFocus
                    onCommit={onCommit}
                    onCancel={() => {
                        recordPendingError(idKey, '', null);
                        setEditing(null);
                    }}
                />
                {pending ? <span className={classes.cellError}>{pending.message}</span> : null}
            </div>
        );
    };

    const columnHeader = (column: {kind: 'input' | 'output'; name: string}, label: ReactNode): ReactNode => (
        <div className={classes.columnHeader}>
            <div className={classes.columnLabel}>{label}</div>
            {!readOnly && (
                <Menu position="bottom-start" withinPortal>
                    <Menu.Target>
                        <ActionIcon
                            size="xs"
                            variant="subtle"
                            color="gray"
                            className={classes.columnMenu}
                            aria-label={`${column.name || 'score'} column menu`}
                        >
                            <IconDotsVertical size={14} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>{columnMenuItems(column)}</Menu.Dropdown>
                </Menu>
            )}
        </div>
    );

    const gridRow = (rowIndex: number): number => rowIndex;
    const defaultGridRow = model.rows.length;

    const renderRuleRow = (row: DecisionTableRow, rowIndex: number): ReactElement => {
        const annotationId: CellId = {kind: 'annotation', row: rowIndex};
        const priorityId: CellId = {kind: 'priority', row: rowIndex};
        let col = 0;

        const whenCells: ReactNode =
            row.when.kind === 'expression' ? (
                <GridCell key="when-expression" colSpan={Math.max(model.inputs.length, 1)}>
                    {editingKey === cellKey({kind: 'when-expression', row: rowIndex}) ? (
                        editorCell(
                            cellKey({kind: 'when-expression', row: rowIndex}),
                            row.when.text,
                            whenExpressionEmbedContext(definition),
                            (text) =>
                                commitRowEdit(
                                    rowIndex,
                                    (draft) => {
                                        draft.when = {kind: 'expression', text};
                                    },
                                    cellKey({kind: 'when-expression', row: rowIndex}),
                                    text,
                                ),
                        )
                    ) : (
                        <DisplayCell
                            text={row.when.text}
                            readOnly={readOnly}
                            // The spanning cell's "current column" is the last input index, so
                            // Right Arrow lands on the first output and Left Arrow from that
                            // output comes back here; aliasing every earlier input column to the
                            // same element keeps vertical nav from those columns working too
                            // (DT-024).
                            gridPosition={{row: gridRow(rowIndex), col: Math.max(model.inputs.length - 1, 0)}}
                            aliasCols={Array.from({length: Math.max(model.inputs.length - 1, 0)}, (_, i) => i)}
                            onStartEdit={() => beginEdit({kind: 'when-expression', row: rowIndex})}
                            onNavigate={navigateTo}
                            registerRef={registerRef}
                        />
                    )}
                </GridCell>
            ) : (
                model.inputs.map((column, inputIndex) => {
                    const id: CellId = {kind: 'when', row: rowIndex, name: column.name};
                    const cells = row.when.kind === 'cells' ? row.when.cells : {};
                    const position = {row: gridRow(rowIndex), col: inputIndex};
                    return (
                        <GridCell key={`when-${column.name}`}>
                            {editingKey === cellKey(id) ? (
                                editorCell(
                                    cellKey(id),
                                    cells[column.name] ?? '',
                                    whenCellEmbedContext(definition, column.name),
                                    (text) =>
                                        commitRowEdit(
                                            rowIndex,
                                            (draft) => {
                                                if (draft.when.kind === 'cells') {
                                                    draft.when.cells[column.name] = text;
                                                }
                                            },
                                            cellKey(id),
                                            text,
                                        ),
                                )
                            ) : (
                                <DisplayCell
                                    text={cells[column.name] ?? ''}
                                    readOnly={readOnly}
                                    gridPosition={position}
                                    onStartEdit={() => beginEdit(id)}
                                    onNavigate={navigateTo}
                                    registerRef={registerRef}
                                />
                            )}
                        </GridCell>
                    );
                })
            );
        col += model.inputs.length;

        return (
            <GridRow key={rowIndex} hover>
                <GridCell align="center" className={cx(classes.muted, classes.iconCell)}>
                    {rowIndex + 1}
                </GridCell>
                {whenCells}
                {model.outputs.map((column, outputIndex) => {
                    const id: CellId = {kind: 'then', row: rowIndex, name: column.name};
                    const position = {row: gridRow(rowIndex), col: col + outputIndex};
                    return (
                        <GridCell key={`then-${column.name}`}>
                            {editingKey === cellKey(id) ? (
                                editorCell(
                                    cellKey(id),
                                    row.then[column.name] ?? '',
                                    thenCellEmbedContext(definition),
                                    (text) =>
                                        commitRowEdit(
                                            rowIndex,
                                            (draft) => {
                                                draft.then[column.name] = text;
                                            },
                                            cellKey(id),
                                            text,
                                        ),
                                )
                            ) : (
                                <DisplayCell
                                    text={row.then[column.name] ?? ''}
                                    readOnly={readOnly}
                                    gridPosition={position}
                                    onStartEdit={() => beginEdit(id)}
                                    onNavigate={navigateTo}
                                    registerRef={registerRef}
                                />
                            )}
                        </GridCell>
                    );
                })}
                {showPriority ? (
                    <GridCell className={classes.priorityCell}>
                        {editingKey === cellKey(priorityId) ? (
                            <div>
                                <PlainCellEditor
                                    value={
                                        pendingErrors[cellKey(priorityId)]?.text ??
                                        (row.priority !== undefined ? String(row.priority) : '')
                                    }
                                    type="number"
                                    ariaLabel={`rule ${rowIndex + 1} priority`}
                                    onCommit={(text) => {
                                        if (!isValidPriority(text)) {
                                            recordPendingError(
                                                cellKey(priorityId),
                                                text,
                                                'Priority must be a positive whole number.',
                                            );
                                            return;
                                        }
                                        commitRowEdit(
                                            rowIndex,
                                            (draft) => {
                                                draft.priority = Number(text);
                                            },
                                            cellKey(priorityId),
                                            text,
                                        );
                                    }}
                                    onCancel={() => {
                                        recordPendingError(cellKey(priorityId), '', null);
                                        setEditing(null);
                                    }}
                                />
                                {pendingErrors[cellKey(priorityId)] ? (
                                    <span className={classes.cellError}>
                                        {pendingErrors[cellKey(priorityId)].message}
                                    </span>
                                ) : null}
                            </div>
                        ) : (
                            <DisplayCell
                                text={row.priority !== undefined ? String(row.priority) : ''}
                                plain
                                warning={row.priority !== undefined && duplicatePrioritySet.has(row.priority)}
                                readOnly={readOnly}
                                gridPosition={{
                                    row: gridRow(rowIndex),
                                    col: col + model.outputs.length,
                                }}
                                onStartEdit={() => beginEdit(priorityId)}
                                onNavigate={navigateTo}
                                registerRef={registerRef}
                            />
                        )}
                    </GridCell>
                ) : null}
                <GridCell className={classes.muted}>
                    {editingKey === cellKey(annotationId) ? (
                        <PlainCellEditor
                            value={row.name ?? ''}
                            ariaLabel={`rule ${rowIndex + 1} annotation`}
                            onCommit={(text) =>
                                commitRowEdit(rowIndex, (draft) => {
                                    draft.name = text;
                                })
                            }
                            onCancel={() => setEditing(null)}
                        />
                    ) : (
                        <DisplayCell
                            text={row.name ?? ''}
                            plain
                            emptyLabel={readOnly ? '' : '+ note'}
                            readOnly={readOnly}
                            gridPosition={{
                                row: gridRow(rowIndex),
                                col: col + model.outputs.length + priorityColumns,
                            }}
                            onStartEdit={() => beginEdit(annotationId)}
                            onNavigate={navigateTo}
                            registerRef={registerRef}
                        />
                    )}
                </GridCell>
                {!readOnly && (
                    <GridCell align="center" className={classes.iconCell}>
                        <Menu position="bottom-start" withinPortal>
                            <Menu.Target>
                                <ActionIcon
                                    size="sm"
                                    variant="subtle"
                                    color="gray"
                                    aria-label={`rule ${rowIndex + 1} menu`}
                                >
                                    <IconDotsVertical size={14} />
                                </ActionIcon>
                            </Menu.Target>
                            <Menu.Dropdown>{rowMenuItems(rowIndex)}</Menu.Dropdown>
                        </Menu>
                    </GridCell>
                )}
            </GridRow>
        );
    };

    const handleRowMenuAction = (action: string, index: number): void => {
        if (!definition || !model) {
            return;
        }
        const rules = [...definition['@rules']];
        switch (action) {
            case 'delete': {
                const label = describeRow(model.rows[index]);
                setConfirm({
                    title: `Delete rule ${index + 1}?`,
                    message: `This removes rule ${index + 1} (${label}). Use Undo right after if you didn't mean to.`,
                    confirmLabel: 'Delete rule',
                    onConfirm: () => {
                        const nextRules = [...definition['@rules']];
                        nextRules.splice(index, 1);
                        applyDestructive(withRules(definition, nextRules), `Rule ${index + 1} deleted`);
                    },
                });
                break;
            }
            case 'duplicate':
                rules.splice(index + 1, 0, {...rules[index]});
                applyDefinition(withRules(definition, rules));
                break;
            case 'move-up':
                if (index > 0) {
                    [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
                    applyDefinition(withRules(definition, rules));
                }
                break;
            case 'move-down':
                if (index < rules.length - 1) {
                    [rules[index + 1], rules[index]] = [rules[index], rules[index + 1]];
                    applyDefinition(withRules(definition, rules));
                }
                break;
            case 'to-expression': {
                const row = model.rows[index];
                if (row.when.kind !== 'cells') {
                    break;
                }
                const expression = buildExpressionFromCells(
                    model.inputs.map((c) => c.name),
                    row.when.cells,
                );
                if (expression === null) {
                    setEditError(
                        "Can't convert this row's conditions to an equivalent expression automatically — one of the " +
                            'cells uses a form this editor can\'t safely translate (e.g. a named test like "isCore", ' +
                            "which could mean a function call or an equality — this component can't tell which without " +
                            "the model's declarations). Edit the condition directly instead.",
                    );
                    break;
                }
                commitRowEdit(index, (draft) => {
                    draft.when = {kind: 'expression', text: expression};
                });
                break;
            }
            case 'to-cells': {
                const row = model.rows[index];
                if (row.when.kind !== 'expression') {
                    break;
                }
                const paramNames = model.inputs.map((c) => c.name);
                const cells = parseExpressionToCells(paramNames, row.when.text);
                if (cells === null) {
                    setEditError(
                        "Can't convert this row's expression to column conditions without changing its meaning " +
                            '(for example, it combines different columns with "or", which a per-column AND-of-cells ' +
                            "table can't represent). Keep it as an expression, or rewrite it by hand.",
                    );
                    break;
                }
                const filled = Object.fromEntries(paramNames.map((name) => [name, cells[name] ?? '']));
                commitRowEdit(index, (draft) => {
                    draft.when = {kind: 'cells', cells: filled};
                });
                break;
            }
            default:
                break;
        }
    };

    const handleColumnMenuAction = (action: string, column: {kind: 'input' | 'output'; name: string}): void => {
        if (!definition || !model) {
            return;
        }
        if (action === 'rename' && column.kind === 'output' && column.name !== SCALAR_OUTPUT) {
            setDialog({
                title: 'Rename output column',
                nameLabel: 'Column name',
                initialName: column.name,
                onSubmit: (name) => {
                    if (name === column.name) {
                        return null;
                    }
                    if (!isValidColumnName(name)) {
                        return `"${name}" isn't a valid column name — use letters, numbers, and underscores, starting with a letter or underscore.`;
                    }
                    if (model.outputs.some((c) => c.name === name)) {
                        return `"${name}" is already used by another output column.`;
                    }
                    return applyDefinition(withOutputColumnRenamed(definition, column.name, name));
                },
            });
        }
        if (action === 'rename' && column.kind === 'input') {
            setDialog({
                title: 'Rename input column',
                nameLabel: 'Parameter name',
                initialName: column.name,
                ...(service.rename
                    ? {}
                    : {
                          warning:
                              'Rule conditions using this column are updated. Callers passing it as a named argument ' +
                              "elsewhere in the model aren't — the engine will report those as unresolved if you touch them again.",
                      }),
                onSubmit: (name) => {
                    if (name === column.name) {
                        return null;
                    }
                    if (!isValidColumnName(name)) {
                        return `"${name}" isn't a valid parameter name — use letters, numbers, and underscores, starting with a letter or underscore.`;
                    }
                    if (model.inputs.some((c) => c.name === name)) {
                        return `"${name}" is already used by another input column.`;
                    }
                    if (service.rename) {
                        const result = service.rename(
                            `${activePath}.parameters.${column.name}`,
                            `${activePath}.parameters.${name}`,
                        );
                        if (result && isPortableError(result)) {
                            return result.message;
                        }
                        finishWrite();
                        return null;
                    }
                    return applyDefinition(withInputColumnRenamed(definition, column.name, name));
                },
            });
        }
        if (action === 'change-type' && column.kind === 'input') {
            setDialog({
                title: 'Change input column type',
                nameLabel: 'Parameter name',
                initialName: column.name,
                nameEditable: false,
                withType: true,
                initialType: currentParameterType(definition, column.name),
                onSubmit: (_name, type) => applyDefinition(withInputColumnTypeChanged(definition, column.name, type)),
            });
        }
        if ((action === 'move-left' || action === 'move-right') && column.kind === 'output') {
            const order = model.outputs.map((c) => c.name);
            const index = order.indexOf(column.name);
            const swapWith = action === 'move-left' ? index - 1 : index + 1;
            if (index < 0 || swapWith < 0 || swapWith >= order.length) {
                return;
            }
            [order[index], order[swapWith]] = [order[swapWith], order[index]];
            applyDefinition(withOutputColumnsReordered(definition, order));
        }
        if (action === 'delete') {
            const label =
                column.kind === 'input' ? `input column "${column.name}"` : `output column "${column.name || 'score'}"`;
            setConfirm({
                title: 'Delete column?',
                message: `This permanently removes the ${label} and every rule's value for it. Use Undo right after if you didn't mean to.`,
                confirmLabel: 'Delete column',
                onConfirm: () =>
                    applyDestructive(
                        column.kind === 'input'
                            ? withInputColumnRemoved(definition, column.name)
                            : withOutputColumnRemoved(definition, column.name),
                        `Column "${column.name || 'score'}" deleted`,
                    ),
            });
        }
    };

    const handleTableMenuAction = (action: string): void => {
        if (!definition || !model) {
            return;
        }
        switch (action) {
            case 'rename-table':
                setDialog({
                    title: 'Rename decision table',
                    nameLabel: 'Table name',
                    initialName: rulesetName,
                    onSubmit: (name) => {
                        if (name === rulesetName) {
                            return null;
                        }
                        if (!isValidColumnName(name)) {
                            return `"${name}" isn't a valid name — use letters, numbers, and underscores, starting with a letter or underscore.`;
                        }
                        if (!service.rename) {
                            return 'This service does not support renaming.';
                        }
                        const separatorIndex = activePath.lastIndexOf('.');
                        const newPath =
                            separatorIndex >= 0 ? `${activePath.slice(0, separatorIndex + 1)}${name}` : name;
                        const result = service.rename(activePath, newPath);
                        if (result && isPortableError(result)) {
                            return result.message;
                        }
                        setActivePath(newPath);
                        onRenamed?.(newPath);
                        const fresh = service.get(`${newPath}.*`);
                        if (!isPortableError(fresh)) {
                            onChange?.(fresh as PortableRulesetDefinition);
                        }
                        return null;
                    },
                });
                break;
            case 'add-input':
                setDialog({
                    title: 'Add input column',
                    nameLabel: 'Parameter name',
                    withType: true,
                    onSubmit: (name, type) => {
                        if (!isValidColumnName(name)) {
                            return `"${name}" isn't a valid parameter name — use letters, numbers, and underscores, starting with a letter or underscore.`;
                        }
                        if (model.inputs.some((c) => c.name === name)) {
                            return `"${name}" is already used by another input column.`;
                        }
                        return applyDefinition(withInputColumnAdded(definition, name, type));
                    },
                });
                break;
            case 'add-output':
                setDialog({
                    title: 'Add output column',
                    nameLabel: 'Output field name',
                    withType: true,
                    onSubmit: (name, type) => {
                        if (!isValidColumnName(name)) {
                            return `"${name}" isn't a valid column name — use letters, numbers, and underscores, starting with a letter or underscore.`;
                        }
                        if (model.outputs.some((c) => c.name === name)) {
                            return `"${name}" is already used by another output column.`;
                        }
                        return applyDefinition(withOutputColumnAdded(definition, name, defaultTextForType(type)));
                    },
                });
                break;
            case 'add-default': {
                const defaultNode = model.scorecard
                    ? (0 as unknown as PortableContext)
                    : (Object.fromEntries(
                          model.outputs.map((column) => [column.name, defaultTextForType(column.typeLabel)]),
                      ) as PortableContext);
                applyDefinition(withDefaultRow(definition, defaultNode));
                break;
            }
            case 'remove-default':
                setConfirm({
                    title: 'Remove the default row?',
                    message: model.defaultRow
                        ? `This removes the pinned default (${Object.entries(model.defaultRow)
                              .map(([name, value]) => (name === SCALAR_OUTPUT ? value : `${name}: ${value}`))
                              .join(', ')}). Rows that match nothing will fail instead of falling back to it.`
                        : 'This removes the pinned default row.',
                    confirmLabel: 'Remove default',
                    onConfirm: () => applyDestructive(withDefaultRow(definition, undefined), 'Default row removed'),
                });
                break;
            default:
                break;
        }
    };

    // Menus are built per trigger (Mantine anchors a menu to its own target), so the item lists are
    // functions of the row/column they act on.
    const rowMenuItems = (rowIndex: number): ReactNode => (
        <>
            <Menu.Item onClick={() => handleRowMenuAction('duplicate', rowIndex)}>Duplicate rule</Menu.Item>
            <Menu.Item disabled={rowIndex === 0} onClick={() => handleRowMenuAction('move-up', rowIndex)}>
                Move up
            </Menu.Item>
            <Menu.Item
                disabled={rowIndex === model.rows.length - 1}
                onClick={() => handleRowMenuAction('move-down', rowIndex)}
            >
                Move down
            </Menu.Item>
            {model.rows[rowIndex]?.when.kind === 'cells' ? (
                <Menu.Item onClick={() => handleRowMenuAction('to-expression', rowIndex)}>
                    Use expression condition
                </Menu.Item>
            ) : (
                <Menu.Item onClick={() => handleRowMenuAction('to-cells', rowIndex)}>Use column conditions</Menu.Item>
            )}
            <Menu.Item color="red" onClick={() => handleRowMenuAction('delete', rowIndex)}>
                Delete rule
            </Menu.Item>
        </>
    );

    function columnMenuItems(column: {kind: 'input' | 'output'; name: string}): ReactNode {
        const outputIndex = model!.outputs.findIndex((c) => c.name === column.name);
        const movable = column.kind === 'output' && column.name !== SCALAR_OUTPUT && model!.outputs.length > 1;
        return (
            <>
                {column.kind === 'output' && column.name !== SCALAR_OUTPUT ? (
                    <Menu.Item onClick={() => handleColumnMenuAction('rename', column)}>Rename column…</Menu.Item>
                ) : null}
                {column.kind === 'input' ? (
                    <Menu.Item onClick={() => handleColumnMenuAction('rename', column)}>Rename column…</Menu.Item>
                ) : null}
                {column.kind === 'input' ? (
                    <Menu.Item onClick={() => handleColumnMenuAction('change-type', column)}>Change type…</Menu.Item>
                ) : null}
                {movable ? (
                    <Menu.Item disabled={outputIndex === 0} onClick={() => handleColumnMenuAction('move-left', column)}>
                        Move left
                    </Menu.Item>
                ) : null}
                {movable ? (
                    <Menu.Item
                        disabled={outputIndex === model!.outputs.length - 1}
                        onClick={() => handleColumnMenuAction('move-right', column)}
                    >
                        Move right
                    </Menu.Item>
                ) : null}
                {!(column.kind === 'output' && model!.outputs.length <= 1) ? (
                    <Menu.Item color="red" onClick={() => handleColumnMenuAction('delete', column)}>
                        Delete column
                    </Menu.Item>
                ) : null}
            </>
        );
    }

    const hitPolicyBadge = HIT_POLICIES.find((policy) => policy.value === model.hitPolicy);

    return (
        <div className={cx(classes.root, className)} style={style}>
            <div className={classes.header}>
                <span className={classes.title}>{rulesetName}</span>
                <span className={classes.signature}>({parameterSignature(definition)})</span>
                {model.scorecard ? <span className={classes.badge}>scorecard</span> : null}
                <div className={classes.spacer} />
                <Select
                    className={classes.hitPolicy}
                    value={model.hitPolicy}
                    size="sm"
                    allowDeselect={false}
                    disabled={readOnly}
                    aria-label="Hit policy"
                    data={HIT_POLICIES.map((policy) => ({
                        value: policy.value,
                        label: `${policy.badge} · ${policy.label}`,
                    }))}
                    onChange={(next) => {
                        if (next) handleHitPolicyChange(next as HitPolicy);
                    }}
                />
                {!readOnly && (
                    <Menu position="bottom-end" withinPortal>
                        <Menu.Target>
                            <ActionIcon variant="subtle" color="gray" aria-label="table menu">
                                <IconDotsVertical size={18} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            {service.rename ? (
                                <Menu.Item onClick={() => handleTableMenuAction('rename-table')}>
                                    Rename table…
                                </Menu.Item>
                            ) : null}
                            <Menu.Item onClick={() => handleTableMenuAction('add-input')}>Add input column…</Menu.Item>
                            {!model.scorecard ? (
                                <Menu.Item onClick={() => handleTableMenuAction('add-output')}>
                                    Add output column…
                                </Menu.Item>
                            ) : null}
                            {model.hitPolicy !== 'collect-matches' && !model.defaultRow ? (
                                <Menu.Item onClick={() => handleTableMenuAction('add-default')}>
                                    Add default row
                                </Menu.Item>
                            ) : null}
                            {model.defaultRow ? (
                                <Menu.Item onClick={() => handleTableMenuAction('remove-default')}>
                                    Remove default row
                                </Menu.Item>
                            ) : null}
                        </Menu.Dropdown>
                    </Menu>
                )}
            </div>

            {editError !== null ? (
                <Alert color="red" variant="light" withCloseButton onClose={() => setEditError(null)} mb="xs">
                    {editError}
                </Alert>
            ) : null}

            <div className={classes.scroll}>
                <GridTable aria-label={`${rulesetName} decision table`}>
                    <GridHead>
                        <GridRow>
                            <GridCell header borderless />
                            {model.inputs.length > 0 ? (
                                <GridCell
                                    header
                                    borderless
                                    colSpan={model.inputs.length}
                                    align="center"
                                    className={classes.band}
                                >
                                    Conditions
                                </GridCell>
                            ) : null}
                            <GridCell
                                header
                                borderless
                                colSpan={model.outputs.length + priorityColumns}
                                align="center"
                                className={classes.band}
                            >
                                Results
                            </GridCell>
                            <GridCell header borderless colSpan={1 + (readOnly ? 0 : 1)} />
                        </GridRow>
                        <GridRow>
                            <GridCell header align="center" className={classes.iconCell}>
                                <Tooltip label={hitPolicyBadge?.label ?? ''} withinPortal>
                                    <span>{hitPolicyBadge?.badge}</span>
                                </Tooltip>
                            </GridCell>
                            {model.inputs.map((column) => (
                                <GridCell header key={`input-${column.name}`} className={classes.inputHeader}>
                                    {columnHeader(
                                        column,
                                        <>
                                            {column.name}
                                            <span className={classes.typeLabel}>{column.typeLabel}</span>
                                        </>,
                                    )}
                                </GridCell>
                            ))}
                            {model.outputs.map((column) => (
                                <GridCell header key={`output-${column.name}`} className={classes.outputHeader}>
                                    {columnHeader(
                                        column,
                                        <>
                                            {column.name === SCALAR_OUTPUT ? 'score' : column.name}
                                            <span className={classes.typeLabel}>{column.typeLabel}</span>
                                        </>,
                                    )}
                                </GridCell>
                            ))}
                            {showPriority ? (
                                <GridCell header className={classes.priorityCell}>
                                    priority
                                </GridCell>
                            ) : null}
                            <GridCell header className={classes.muted} style={{fontWeight: 400}}>
                                annotation
                            </GridCell>
                            {!readOnly && <GridCell header className={classes.iconCell} />}
                        </GridRow>
                    </GridHead>
                    <GridBody>
                        {model.rows.map((row, rowIndex) => renderRuleRow(row, rowIndex))}
                        {model.defaultRow ? (
                            <GridRow>
                                <GridCell
                                    align="right"
                                    colSpan={1 + model.inputs.length}
                                    className={cx(classes.muted, classes.italic)}
                                >
                                    default
                                </GridCell>
                                {model.outputs.map((column, outputIndex) => {
                                    const id: CellId = {kind: 'default', name: column.name};
                                    return (
                                        <GridCell key={`default-${column.name}`}>
                                            {editingKey === cellKey(id) ? (
                                                editorCell(
                                                    cellKey(id),
                                                    model.defaultRow?.[column.name] ?? '',
                                                    thenCellEmbedContext(definition),
                                                    (text) =>
                                                        recordPendingError(
                                                            cellKey(id),
                                                            text,
                                                            applyDefaultCell(column.name, text),
                                                        ),
                                                )
                                            ) : (
                                                <DisplayCell
                                                    text={model.defaultRow?.[column.name] ?? ''}
                                                    readOnly={readOnly}
                                                    gridPosition={{
                                                        row: defaultGridRow,
                                                        col: model.inputs.length + outputIndex,
                                                    }}
                                                    onStartEdit={() => beginEdit(id)}
                                                    onNavigate={navigateTo}
                                                    registerRef={registerRef}
                                                />
                                            )}
                                        </GridCell>
                                    );
                                })}
                                {showPriority ? <GridCell /> : null}
                                <GridCell />
                                {!readOnly && <GridCell />}
                            </GridRow>
                        ) : null}
                        {!readOnly && (
                            <GridRow>
                                <GridCell colSpan={totalColumns} borderless>
                                    <Button
                                        size="compact-sm"
                                        variant="subtle"
                                        leftSection={<IconPlus size={14} />}
                                        onClick={addRule}
                                    >
                                        Add rule
                                    </Button>
                                </GridCell>
                            </GridRow>
                        )}
                    </GridBody>
                </GridTable>
            </div>

            <ColumnDialog state={dialog} onClose={() => setDialog(null)} />
            <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
            <Toast
                open={undo !== null}
                autoHideDuration={8000}
                onClose={() => setUndo(null)}
                message={undo?.label}
                action={
                    <Button
                        variant="light"
                        size="compact-sm"
                        onClick={() => {
                            if (undo) {
                                applyDefinition(undo.definition);
                            }
                            setUndo(null);
                        }}
                    >
                        Undo
                    </Button>
                }
            />
        </div>
    );
}
