import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type KeyboardEvent,
    type ReactElement,
    type ReactNode,
} from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Snackbar from '@mui/material/Snackbar';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AddIcon from '@mui/icons-material/Add';
import {alpha, type SxProps, type Theme} from '@mui/material/styles';
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
    sx?: SxProps<Theme>;
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
        <Box
            component="div"
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
            sx={{
                minHeight: 24,
                display: 'flex',
                alignItems: 'center',
                px: 0.75,
                cursor: readOnly ? 'default' : 'cell',
                borderRadius: 0.5,
                outline: 'none',
                fontFamily: 'monospace',
                fontSize: '0.85rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                ...(warning ? {bgcolor: (theme: Theme) => alpha(theme.palette.warning.main, 0.18)} : {}),
                '&:focus-visible': {
                    boxShadow: (theme) => `inset 0 0 0 2px ${theme.palette.primary.main}`,
                },
            }}
        >
            {/* Single child span: the flex parent would otherwise drop whitespace-only text nodes between token spans. */}
            <Box component="span" sx={{whiteSpace: 'pre-wrap'}}>
                {text.length > 0 ? (
                    plain ? (
                        text
                    ) : (
                        <HighlightedText text={text} />
                    )
                ) : (
                    <Box component="span" sx={{color: 'text.disabled'}}>
                        {emptyLabel}
                    </Box>
                )}
            </Box>
        </Box>
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
        <InputBase
            autoFocus
            defaultValue={value}
            type={type}
            inputProps={{'aria-label': ariaLabel}}
            sx={{fontSize: '0.85rem', width: '100%', px: 0.75}}
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
        <Dialog open={state !== null} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{state?.title}</DialogTitle>
            <DialogContent
                sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    pt: '8px !important',
                }}
            >
                {state?.warning ? <Alert severity="info">{state.warning}</Alert> : null}
                <TextField
                    autoFocus
                    label={state?.nameLabel}
                    value={name}
                    size="small"
                    disabled={state?.nameEditable === false}
                    error={error !== null}
                    helperText={error ?? ' '}
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
                        size="small"
                        onChange={(event) => setType(event.target.value as PortableTypeReference)}
                        inputProps={{'aria-label': 'Column type'}}
                    >
                        {INPUT_TYPES.map((option) => (
                            <MenuItem key={option} value={option}>
                                {option}
                            </MenuItem>
                        ))}
                    </Select>
                ) : null}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={submit} disabled={name.trim().length === 0}>
                    OK
                </Button>
            </DialogActions>
        </Dialog>
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
        <Dialog open={state !== null} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle>{state?.title}</DialogTitle>
            <DialogContent>
                <DialogContentText>{state?.message}</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button
                    variant="contained"
                    color="error"
                    onClick={() => {
                        state?.onConfirm();
                        onClose();
                    }}
                >
                    {state?.confirmLabel ?? 'Delete'}
                </Button>
            </DialogActions>
        </Dialog>
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
    sx,
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
    const [rowMenu, setRowMenu] = useState<{
        anchor: HTMLElement;
        row: number;
    } | null>(null);
    const [columnMenu, setColumnMenu] = useState<{
        anchor: HTMLElement;
        column: {kind: 'input' | 'output'; name: string};
    } | null>(null);
    const [tableMenu, setTableMenu] = useState<HTMLElement | null>(null);
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
            const result = service.set(rulePath, rule);
            if (isPortableError(result)) {
                // Defensive: restore the last good rule before surfacing the error, in case a
                // rejected set is ever left applied.
                service.set(rulePath, definition['@rules'][index]);
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
            const result = service.set(activePath, next);
            if (isPortableError(result)) {
                service.set(activePath, definition);
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
            const result = service.set(cellPath, text.trim());
            if (isPortableError(result)) {
                const previous = definition['@default'];
                if (previous !== undefined) {
                    service.set(`${activePath}.default`, previous);
                }
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
        const result = service.set(`${activePath}.rules[${index}]`, rule);
        if (isPortableError(result)) {
            service.set(activePath, definition);
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
            <Alert severity="error" className={className} sx={sx}>
                {loadError}
            </Alert>
        );
    }
    if (!definition || !model) {
        return <Box className={className} sx={sx} />;
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
            <Box>
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
                {pending ? (
                    <Typography
                        variant="caption"
                        sx={{color: 'error.main', display: 'block', mt: 0.25, lineHeight: 1.2}}
                    >
                        {pending.message}
                    </Typography>
                ) : null}
            </Box>
        );
    };

    const columnHeader = (column: {kind: 'input' | 'output'; name: string}, label: ReactNode): ReactNode => (
        <Box sx={{display: 'flex', alignItems: 'center', gap: 0.5}}>
            <Box sx={{flex: 1, minWidth: 0}}>{label}</Box>
            {!readOnly && (
                <IconButton
                    size="small"
                    aria-label={`${column.name || 'score'} column menu`}
                    sx={{p: 0.25, opacity: 0.7, '&:hover': {opacity: 1}, '&:focus-visible': {opacity: 1}}}
                    onClick={(event) => setColumnMenu({anchor: event.currentTarget, column})}
                >
                    <MoreVertIcon sx={{fontSize: 16}} />
                </IconButton>
            )}
        </Box>
    );

    const gridRow = (rowIndex: number): number => rowIndex;
    const defaultGridRow = model.rows.length;

    const renderRuleRow = (row: DecisionTableRow, rowIndex: number): ReactElement => {
        const annotationId: CellId = {kind: 'annotation', row: rowIndex};
        const priorityId: CellId = {kind: 'priority', row: rowIndex};
        let col = 0;

        const whenCells: ReactNode =
            row.when.kind === 'expression' ? (
                <TableCell key="when-expression" colSpan={Math.max(model.inputs.length, 1)}>
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
                </TableCell>
            ) : (
                model.inputs.map((column, inputIndex) => {
                    const id: CellId = {kind: 'when', row: rowIndex, name: column.name};
                    const cells = row.when.kind === 'cells' ? row.when.cells : {};
                    const position = {row: gridRow(rowIndex), col: inputIndex};
                    return (
                        <TableCell key={`when-${column.name}`}>
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
                        </TableCell>
                    );
                })
            );
        col += model.inputs.length;

        return (
            <TableRow key={rowIndex} hover>
                <TableCell align="center" sx={{color: 'text.secondary', width: 34}}>
                    {rowIndex + 1}
                </TableCell>
                {whenCells}
                {model.outputs.map((column, outputIndex) => {
                    const id: CellId = {kind: 'then', row: rowIndex, name: column.name};
                    const position = {row: gridRow(rowIndex), col: col + outputIndex};
                    return (
                        <TableCell key={`then-${column.name}`} className="dt-output-cell">
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
                        </TableCell>
                    );
                })}
                {showPriority ? (
                    <TableCell sx={{width: 70}}>
                        {editingKey === cellKey(priorityId) ? (
                            <Box>
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
                                    <Typography
                                        variant="caption"
                                        sx={{color: 'error.main', display: 'block', lineHeight: 1.2}}
                                    >
                                        {pendingErrors[cellKey(priorityId)].message}
                                    </Typography>
                                ) : null}
                            </Box>
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
                    </TableCell>
                ) : null}
                <TableCell sx={{color: 'text.secondary'}}>
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
                </TableCell>
                {!readOnly && (
                    <TableCell sx={{width: 34, p: 0}} align="center">
                        <IconButton
                            size="small"
                            aria-label={`rule ${rowIndex + 1} menu`}
                            onClick={(event) => setRowMenu({anchor: event.currentTarget, row: rowIndex})}
                        >
                            <MoreVertIcon fontSize="inherit" />
                        </IconButton>
                    </TableCell>
                )}
            </TableRow>
        );
    };

    const handleRowMenuAction = (action: string): void => {
        if (!rowMenu || !definition || !model) {
            return;
        }
        const index = rowMenu.row;
        const rules = [...definition['@rules']];
        setRowMenu(null);
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

    const handleColumnMenuAction = (action: string): void => {
        if (!columnMenu || !definition || !model) {
            return;
        }
        const {column} = columnMenu;
        setColumnMenu(null);
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
        setTableMenu(null);
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

    return (
        <Box
            className={className}
            sx={{
                // Static token colors for display cells, mirroring the CodeMirror highlight theme.
                '& .tok-keyword': {
                    color: (theme) => (theme.palette.mode === 'dark' ? '#c792ea' : '#7b1fa2'),
                },
                '& .tok-atom': {
                    color: (theme) => (theme.palette.mode === 'dark' ? '#d19a66' : '#e65100'),
                },
                '& .tok-bool': {
                    color: (theme) => (theme.palette.mode === 'dark' ? '#56b6c2' : '#0b7285'),
                },
                '& .tok-number': {
                    color: (theme) => (theme.palette.mode === 'dark' ? '#b5cea8' : '#098658'),
                },
                '& .tok-string': {
                    color: (theme) => (theme.palette.mode === 'dark' ? '#ce9178' : '#a31515'),
                },
                '& .tok-typeName': {
                    color: (theme) => (theme.palette.mode === 'dark' ? '#4ec9b0' : '#267f99'),
                },
                '& .tok-propertyName': {
                    color: (theme) => (theme.palette.mode === 'dark' ? '#9cdcfe' : '#001080'),
                },
                '& .tok-variableName': {
                    color: (theme) => (theme.palette.mode === 'dark' ? '#9cdcfe' : '#0070c1'),
                },
                '& .tok-function': {
                    color: (theme) => (theme.palette.mode === 'dark' ? '#dcdcaa' : '#795e26'),
                },
                '& .tok-self': {
                    color: (theme) => (theme.palette.mode === 'dark' ? '#569cd6' : '#0000ff'),
                },
                ...sx,
            }}
        >
            <Box sx={{display: 'flex', alignItems: 'center', gap: 1.5, mb: 1}}>
                <Typography variant="subtitle1" sx={{fontWeight: 600}}>
                    {rulesetName}
                </Typography>
                <Typography variant="body2" sx={{color: 'text.secondary', fontFamily: 'monospace'}}>
                    ({parameterSignature(definition)})
                </Typography>
                {model.scorecard ? (
                    <Typography
                        variant="caption"
                        sx={{
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 0.5,
                            bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.12),
                        }}
                    >
                        scorecard
                    </Typography>
                ) : null}
                <Box sx={{flex: 1}} />
                <Select
                    value={model.hitPolicy}
                    size="small"
                    disabled={readOnly}
                    inputProps={{'aria-label': 'Hit policy'}}
                    onChange={(event) => handleHitPolicyChange(event.target.value as HitPolicy)}
                    renderValue={(value) => {
                        const policy = HIT_POLICIES.find((option) => option.value === value);
                        return policy ? `${policy.badge} · ${policy.label}` : String(value);
                    }}
                    sx={{minWidth: 200}}
                >
                    {HIT_POLICIES.map((policy) => (
                        <MenuItem key={policy.value} value={policy.value}>
                            {policy.badge} · {policy.label}
                        </MenuItem>
                    ))}
                </Select>
                {!readOnly && (
                    <IconButton aria-label="table menu" onClick={(event) => setTableMenu(event.currentTarget)}>
                        <MoreVertIcon />
                    </IconButton>
                )}
            </Box>

            {editError !== null ? (
                <Alert severity="error" onClose={() => setEditError(null)} sx={{mb: 1}}>
                    {editError}
                </Alert>
            ) : null}

            <Box sx={{overflowX: 'auto'}}>
                <Table
                    size="small"
                    aria-label={`${rulesetName} decision table`}
                    sx={{
                        borderCollapse: 'separate',
                        '& td, & th': {
                            border: (theme) => `1px solid ${theme.palette.divider}`,
                            p: 0.25,
                        },
                        '& th': {fontWeight: 600},
                        '& thead th.dt-input-header': {
                            bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                        },
                        '& thead th.dt-output-header': {
                            bgcolor: (theme) => alpha(theme.palette.secondary.main, 0.08),
                        },
                    }}
                >
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{border: 'none', p: 0}} />
                            {model.inputs.length > 0 ? (
                                <TableCell
                                    colSpan={model.inputs.length}
                                    align="center"
                                    sx={{
                                        border: 'none',
                                        color: 'text.secondary',
                                        fontSize: '0.7rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: 0.5,
                                    }}
                                >
                                    Conditions
                                </TableCell>
                            ) : null}
                            <TableCell
                                colSpan={model.outputs.length + priorityColumns}
                                align="center"
                                sx={{
                                    border: 'none',
                                    color: 'text.secondary',
                                    fontSize: '0.7rem',
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.5,
                                }}
                            >
                                Results
                            </TableCell>
                            <TableCell colSpan={1 + (readOnly ? 0 : 1)} sx={{border: 'none'}} />
                        </TableRow>
                        <TableRow>
                            <TableCell align="center" sx={{width: 34}}>
                                <Tooltip
                                    title={HIT_POLICIES.find((policy) => policy.value === model.hitPolicy)?.label ?? ''}
                                >
                                    <span>
                                        {HIT_POLICIES.find((policy) => policy.value === model.hitPolicy)?.badge}
                                    </span>
                                </Tooltip>
                            </TableCell>
                            {model.inputs.map((column) => (
                                <TableCell key={`input-${column.name}`} className="dt-input-header">
                                    {columnHeader(
                                        column,
                                        <>
                                            {column.name}
                                            <Typography
                                                component="span"
                                                variant="caption"
                                                sx={{color: 'text.secondary', ml: 0.5}}
                                            >
                                                {column.typeLabel}
                                            </Typography>
                                        </>,
                                    )}
                                </TableCell>
                            ))}
                            {model.outputs.map((column) => (
                                <TableCell key={`output-${column.name}`} className="dt-output-header">
                                    {columnHeader(
                                        column,
                                        <>
                                            {column.name === SCALAR_OUTPUT ? 'score' : column.name}
                                            <Typography
                                                component="span"
                                                variant="caption"
                                                sx={{color: 'text.secondary', ml: 0.5}}
                                            >
                                                {column.typeLabel}
                                            </Typography>
                                        </>,
                                    )}
                                </TableCell>
                            ))}
                            {showPriority ? <TableCell sx={{width: 70}}>priority</TableCell> : null}
                            <TableCell sx={{color: 'text.secondary', fontWeight: 400}}>annotation</TableCell>
                            {!readOnly && <TableCell sx={{width: 34}} />}
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {model.rows.map((row, rowIndex) => renderRuleRow(row, rowIndex))}
                        {model.defaultRow ? (
                            <TableRow>
                                <TableCell
                                    align="right"
                                    colSpan={1 + model.inputs.length}
                                    sx={{color: 'text.secondary', fontStyle: 'italic'}}
                                >
                                    default
                                </TableCell>
                                {model.outputs.map((column, outputIndex) => {
                                    const id: CellId = {kind: 'default', name: column.name};
                                    return (
                                        <TableCell key={`default-${column.name}`}>
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
                                        </TableCell>
                                    );
                                })}
                                {showPriority ? <TableCell /> : null}
                                <TableCell />
                                {!readOnly && <TableCell />}
                            </TableRow>
                        ) : null}
                        {!readOnly && (
                            <TableRow>
                                <TableCell colSpan={totalColumns} sx={{border: 'none !important'}}>
                                    <Button size="small" startIcon={<AddIcon />} onClick={addRule}>
                                        Add rule
                                    </Button>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </Box>

            <Menu anchorEl={rowMenu?.anchor ?? null} open={rowMenu !== null} onClose={() => setRowMenu(null)}>
                <MenuItem onClick={() => handleRowMenuAction('duplicate')}>Duplicate rule</MenuItem>
                <MenuItem disabled={rowMenu?.row === 0} onClick={() => handleRowMenuAction('move-up')}>
                    Move up
                </MenuItem>
                <MenuItem
                    disabled={rowMenu !== null && rowMenu.row === model.rows.length - 1}
                    onClick={() => handleRowMenuAction('move-down')}
                >
                    Move down
                </MenuItem>
                {rowMenu !== null && model.rows[rowMenu.row]?.when.kind === 'cells' ? (
                    <MenuItem onClick={() => handleRowMenuAction('to-expression')}>Use expression condition</MenuItem>
                ) : (
                    <MenuItem onClick={() => handleRowMenuAction('to-cells')}>Use column conditions</MenuItem>
                )}
                <MenuItem onClick={() => handleRowMenuAction('delete')} sx={{color: 'error.main'}}>
                    Delete rule
                </MenuItem>
            </Menu>

            <Menu anchorEl={columnMenu?.anchor ?? null} open={columnMenu !== null} onClose={() => setColumnMenu(null)}>
                {columnMenu?.column.kind === 'output' && columnMenu.column.name !== SCALAR_OUTPUT ? (
                    <MenuItem onClick={() => handleColumnMenuAction('rename')}>Rename column…</MenuItem>
                ) : null}
                {columnMenu?.column.kind === 'input' ? (
                    <MenuItem onClick={() => handleColumnMenuAction('rename')}>Rename column…</MenuItem>
                ) : null}
                {columnMenu?.column.kind === 'input' ? (
                    <MenuItem onClick={() => handleColumnMenuAction('change-type')}>Change type…</MenuItem>
                ) : null}
                {columnMenu?.column.kind === 'output' &&
                columnMenu.column.name !== SCALAR_OUTPUT &&
                model.outputs.length > 1 ? (
                    <MenuItem
                        disabled={model.outputs.findIndex((c) => c.name === columnMenu.column.name) === 0}
                        onClick={() => handleColumnMenuAction('move-left')}
                    >
                        Move left
                    </MenuItem>
                ) : null}
                {columnMenu?.column.kind === 'output' &&
                columnMenu.column.name !== SCALAR_OUTPUT &&
                model.outputs.length > 1 ? (
                    <MenuItem
                        disabled={
                            model.outputs.findIndex((c) => c.name === columnMenu.column.name) ===
                            model.outputs.length - 1
                        }
                        onClick={() => handleColumnMenuAction('move-right')}
                    >
                        Move right
                    </MenuItem>
                ) : null}
                {!(columnMenu?.column.kind === 'output' && model.outputs.length <= 1) ? (
                    <MenuItem onClick={() => handleColumnMenuAction('delete')} sx={{color: 'error.main'}}>
                        Delete column
                    </MenuItem>
                ) : null}
            </Menu>

            <Menu anchorEl={tableMenu} open={tableMenu !== null} onClose={() => setTableMenu(null)}>
                {service.rename ? (
                    <MenuItem onClick={() => handleTableMenuAction('rename-table')}>Rename table…</MenuItem>
                ) : null}
                <MenuItem onClick={() => handleTableMenuAction('add-input')}>Add input column…</MenuItem>
                {!model.scorecard ? (
                    <MenuItem onClick={() => handleTableMenuAction('add-output')}>Add output column…</MenuItem>
                ) : null}
                {model.hitPolicy !== 'collect-matches' && !model.defaultRow ? (
                    <MenuItem onClick={() => handleTableMenuAction('add-default')}>Add default row</MenuItem>
                ) : null}
                {model.defaultRow ? (
                    <MenuItem onClick={() => handleTableMenuAction('remove-default')}>Remove default row</MenuItem>
                ) : null}
            </Menu>

            <ColumnDialog state={dialog} onClose={() => setDialog(null)} />
            <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
            <Snackbar
                open={undo !== null}
                autoHideDuration={8000}
                onClose={() => setUndo(null)}
                message={undo?.label}
                action={
                    <Button
                        color="inherit"
                        size="small"
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
        </Box>
    );
}
