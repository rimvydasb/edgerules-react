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
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputBase from '@mui/material/InputBase';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
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
import { alpha, type SxProps, type Theme } from '@mui/material/styles';
import type {
  PortableContext,
  PortableError,
  PortableNode,
  PortableRule,
  PortableRulesetDefinition,
  PortableRulesetSchema,
  PortableTypeReference,
} from '@edgerules/portable';
import { isPortableError } from '../../lib/portable';
import { CodeEditorCell } from '../code-editor-cell/CodeEditorCell';
import type { CodeEditorService } from '../code-editor/language/service';
import { highlightEdgeRules } from '../code-editor/language/highlight';
import {
  HIT_POLICIES,
  SCALAR_OUTPUT,
  buildTableModel,
  emptyRow,
  rowToRule,
  thenCellEmbedContext,
  whenCellEmbedContext,
  whenExpressionEmbedContext,
  withDefaultRow,
  withHitPolicy,
  withInputColumnAdded,
  withInputColumnRemoved,
  withOutputColumnAdded,
  withOutputColumnRemoved,
  withOutputColumnRenamed,
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
  className?: string;
  sx?: SxProps<Theme>;
}

type CellId =
  | { kind: 'when'; row: number; name: string }
  | { kind: 'when-expression'; row: number }
  | { kind: 'then'; row: number; name: string }
  | { kind: 'default'; name: string }
  | { kind: 'annotation'; row: number }
  | { kind: 'priority'; row: number };

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

const NOOP_LANGUAGE_SERVICE: CodeEditorService = { diagnostics: () => [] };

/** Display-only rendering of a cell's DSL text as statically highlighted spans. */
function HighlightedText({ text }: { text: string }): ReactElement {
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
  gridPosition?: { row: number; col: number };
  onStartEdit: () => void;
  onNavigate?: (row: number, col: number) => void;
  registerRef?: (key: string, element: HTMLElement | null) => void;
}

function DisplayCell({
  text,
  emptyLabel = '–',
  plain = false,
  readOnly,
  gridPosition,
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
      tabIndex={0}
      role="button"
      data-grid-row={gridPosition?.row}
      data-grid-col={gridPosition?.col}
      ref={(element: HTMLElement | null) => {
        if (registerRef && gridPosition) {
          registerRef(`${gridPosition.row}:${gridPosition.col}`, element);
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
        '&:focus-visible': {
          boxShadow: (theme) => `inset 0 0 0 2px ${theme.palette.primary.main}`,
        },
      }}
    >
      {/* Single child span: the flex parent would otherwise drop whitespace-only text nodes between token spans. */}
      <Box component="span" sx={{ whiteSpace: 'pre-wrap' }}>
        {text.length > 0 ? (
          plain ? (
            text
          ) : (
            <HighlightedText text={text} />
          )
        ) : (
          <Box component="span" sx={{ color: 'text.disabled' }}>
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
function PlainCellEditor({ value, type = 'text', ariaLabel, onCommit, onCancel }: PlainCellEditorProps): ReactElement {
  const cancelledRef = useRef(false);
  return (
    <InputBase
      autoFocus
      defaultValue={value}
      type={type}
      inputProps={{ 'aria-label': ariaLabel }}
      sx={{ fontSize: '0.85rem', width: '100%', px: 0.75 }}
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
  withType?: boolean;
  onSubmit: (name: string, type: PortableTypeReference) => void;
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

function ColumnDialog({
  state,
  onClose,
}: {
  state: ColumnDialogState | null;
  onClose: () => void;
}): ReactElement {
  const [name, setName] = useState('');
  const [type, setType] = useState<PortableTypeReference>('string');

  useEffect(() => {
    setName(state?.initialName ?? '');
    setType('string');
  }, [state]);

  const submit = (): void => {
    if (state && name.trim().length > 0) {
      state.onSubmit(name.trim(), type);
      onClose();
    }
  };

  return (
    <Dialog open={state !== null} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>{state?.title}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        <TextField
          autoFocus
          label={state?.nameLabel}
          value={name}
          size="small"
          onChange={(event) => setName(event.target.value)}
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
            inputProps={{ 'aria-label': 'Column type' }}
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
  className,
  sx,
}: DecisionTableEditorProps): ReactElement {
  const [definition, setDefinition] = useState<PortableRulesetDefinition | null>(null);
  const [schema, setSchema] = useState<PortableRulesetSchema | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editing, setEditing] = useState<CellId | null>(null);
  const [rowMenu, setRowMenu] = useState<{ anchor: HTMLElement; row: number } | null>(null);
  const [columnMenu, setColumnMenu] = useState<{
    anchor: HTMLElement;
    column: { kind: 'input' | 'output'; name: string };
  } | null>(null);
  const [tableMenu, setTableMenu] = useState<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<ColumnDialogState | null>(null);
  const cellRefs = useRef(new Map<string, HTMLElement>());

  const refresh = useCallback((): PortableRulesetDefinition | null => {
    const node = service.get(`${path}.*`);
    if (isPortableError(node)) {
      setLoadError(node.message);
      setDefinition(null);
      return null;
    }
    const schemaNode = service.get(path);
    setSchema(
      !isPortableError(schemaNode) &&
        typeof schemaNode === 'object' &&
        schemaNode !== null &&
        (schemaNode as { '@kind'?: unknown })['@kind'] === 'ruleset-schema'
        ? (schemaNode as unknown as PortableRulesetSchema)
        : undefined,
    );
    setLoadError(null);
    setDefinition(node as PortableRulesetDefinition);
    return node as PortableRulesetDefinition;
  }, [service, path]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const model = useMemo(
    () => (definition ? buildTableModel(definition, schema) : null),
    [definition, schema],
  );

  const finishWrite = useCallback(() => {
    setEditError(null);
    setEditing(null);
    const fresh = refresh();
    if (fresh) {
      onChange?.(fresh);
    }
  }, [refresh, onChange]);

  /** Writes one rule; on engine rejection restores the last good rule and keeps the error. */
  const applyRule = useCallback(
    (index: number, rule: PortableRule): void => {
      if (!definition) {
        return;
      }
      const rulePath = `${path}.rules[${index}]`;
      const result = service.set(rulePath, rule);
      if (isPortableError(result)) {
        // A rejected set is not rolled back by the engine (docs/BUG_REPORTS.md #2) —
        // restore the last good rule before surfacing the error.
        service.set(rulePath, definition['@rules'][index]);
        setEditError(result.message);
        setEditing(null);
        return;
      }
      finishWrite();
    },
    [definition, path, service, finishWrite],
  );

  /** Whole-ruleset write for structural edits (hit policy, rows added/removed, columns). */
  const applyDefinition = useCallback(
    (next: PortableRulesetDefinition): void => {
      if (!definition) {
        return;
      }
      const result = service.set(path, next);
      if (isPortableError(result)) {
        service.set(path, definition);
        setEditError(result.message);
        return;
      }
      finishWrite();
    },
    [definition, path, service, finishWrite],
  );

  const applyDefaultCell = useCallback(
    (name: string, text: string): void => {
      if (!definition) {
        return;
      }
      const cellPath = name === SCALAR_OUTPUT ? `${path}.default` : `${path}.default.${name}`;
      const result = service.set(cellPath, text.trim());
      if (isPortableError(result)) {
        const previous = definition['@default'];
        if (previous !== undefined) {
          service.set(`${path}.default`, previous);
        }
        setEditError(result.message);
        setEditing(null);
        return;
      }
      finishWrite();
    },
    [definition, path, service, finishWrite],
  );

  const commitRowEdit = useCallback(
    (rowIndex: number, mutate: (row: DecisionTableRow) => void): void => {
      if (!model) {
        return;
      }
      const row: DecisionTableRow = {
        ...model.rows[rowIndex],
        when:
          model.rows[rowIndex].when.kind === 'cells'
            ? { kind: 'cells', cells: { ...model.rows[rowIndex].when.cells } }
            : { ...model.rows[rowIndex].when },
        then: { ...model.rows[rowIndex].then },
      };
      mutate(row);
      applyRule(rowIndex, rowToRule(row, model.scorecard));
    },
    [model, applyRule],
  );

  const addRule = useCallback((): void => {
    if (!definition || !model) {
      return;
    }
    const rule = rowToRule(emptyRow(model), model.scorecard);
    const index = definition['@rules'].length;
    const result = service.set(`${path}.rules[${index}]`, rule);
    if (isPortableError(result)) {
      service.set(path, definition);
      setEditError(result.message);
      return;
    }
    finishWrite();
  }, [definition, model, path, service, finishWrite]);

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
  const rulesetName = path.split('.').pop() ?? path;
  const showPriority = model.hitPolicy === 'best-match';
  const priorityColumns = showPriority ? 1 : 0;
  const totalColumns =
    1 + model.inputs.length + model.outputs.length + priorityColumns + 1 + (readOnly ? 0 : 1);
  const editingKey = editing ? cellKey(editing) : null;

  const editorCell = (
    value: string,
    embed: { prefix: string; suffix: string },
    onCommit: (text: string) => void,
  ): ReactElement => (
    <CodeEditorCell
      value={value}
      service={effectiveLanguageService}
      embedContext={embed}
      autoFocus
      onCommit={onCommit}
      onCancel={() => setEditing(null)}
    />
  );

  const columnHeader = (
    column: { kind: 'input' | 'output'; name: string },
    label: ReactNode,
  ): ReactNode => (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>{label}</Box>
      {!readOnly && (
        <IconButton
          size="small"
          aria-label={`${column.name || 'score'} column menu`}
          sx={{ p: 0.25, opacity: 0.4, '&:hover': { opacity: 1 } }}
          onClick={(event) => setColumnMenu({ anchor: event.currentTarget, column })}
        >
          <MoreVertIcon sx={{ fontSize: 16 }} />
        </IconButton>
      )}
    </Box>
  );

  const gridRow = (rowIndex: number): number => rowIndex;
  const defaultGridRow = model.rows.length;

  const renderRuleRow = (row: DecisionTableRow, rowIndex: number): ReactElement => {
    const annotationId: CellId = { kind: 'annotation', row: rowIndex };
    const priorityId: CellId = { kind: 'priority', row: rowIndex };
    let col = 0;

    const whenCells: ReactNode =
      row.when.kind === 'expression' ? (
        <TableCell key="when-expression" colSpan={Math.max(model.inputs.length, 1)}>
          {editingKey === cellKey({ kind: 'when-expression', row: rowIndex }) ? (
            editorCell(
              row.when.text,
              whenExpressionEmbedContext(definition),
              (text) =>
                commitRowEdit(rowIndex, (draft) => {
                  draft.when = { kind: 'expression', text };
                }),
            )
          ) : (
            <DisplayCell
              text={row.when.text}
              readOnly={readOnly}
              gridPosition={{ row: gridRow(rowIndex), col: 0 }}
              onStartEdit={() => setEditing({ kind: 'when-expression', row: rowIndex })}
              onNavigate={navigateTo}
              registerRef={registerRef}
            />
          )}
        </TableCell>
      ) : (
        model.inputs.map((column, inputIndex) => {
          const id: CellId = { kind: 'when', row: rowIndex, name: column.name };
          const cells = row.when.kind === 'cells' ? row.when.cells : {};
          const position = { row: gridRow(rowIndex), col: inputIndex };
          return (
            <TableCell key={`when-${column.name}`}>
              {editingKey === cellKey(id)
                ? editorCell(cells[column.name] ?? '', whenCellEmbedContext(definition, column.name), (text) =>
                    commitRowEdit(rowIndex, (draft) => {
                      if (draft.when.kind === 'cells') {
                        draft.when.cells[column.name] = text;
                      }
                    }),
                  )
                : (
                  <DisplayCell
                    text={cells[column.name] ?? ''}
                    readOnly={readOnly}
                    gridPosition={position}
                    onStartEdit={() => setEditing(id)}
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
        <TableCell align="center" sx={{ color: 'text.secondary', width: 34 }}>
          {rowIndex + 1}
        </TableCell>
        {whenCells}
        {model.outputs.map((column, outputIndex) => {
          const id: CellId = { kind: 'then', row: rowIndex, name: column.name };
          const position = { row: gridRow(rowIndex), col: col + outputIndex };
          return (
            <TableCell key={`then-${column.name}`} className="dt-output-cell">
              {editingKey === cellKey(id)
                ? editorCell(row.then[column.name] ?? '', thenCellEmbedContext(definition), (text) =>
                    commitRowEdit(rowIndex, (draft) => {
                      draft.then[column.name] = text;
                    }),
                  )
                : (
                  <DisplayCell
                    text={row.then[column.name] ?? ''}
                    readOnly={readOnly}
                    gridPosition={position}
                    onStartEdit={() => setEditing(id)}
                    onNavigate={navigateTo}
                    registerRef={registerRef}
                  />
                )}
            </TableCell>
          );
        })}
        {showPriority ? (
          <TableCell sx={{ width: 70 }}>
            {editingKey === cellKey(priorityId) ? (
              <PlainCellEditor
                value={row.priority !== undefined ? String(row.priority) : ''}
                type="number"
                ariaLabel={`rule ${rowIndex + 1} priority`}
                onCommit={(text) =>
                  commitRowEdit(rowIndex, (draft) => {
                    draft.priority = Number(text);
                  })
                }
                onCancel={() => setEditing(null)}
              />
            ) : (
              <DisplayCell
                text={row.priority !== undefined ? String(row.priority) : ''}
                plain
                readOnly={readOnly}
                gridPosition={{ row: gridRow(rowIndex), col: col + model.outputs.length }}
                onStartEdit={() => setEditing(priorityId)}
                onNavigate={navigateTo}
                registerRef={registerRef}
              />
            )}
          </TableCell>
        ) : null}
        <TableCell sx={{ color: 'text.secondary' }}>
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
              emptyLabel=""
              readOnly={readOnly}
              gridPosition={{
                row: gridRow(rowIndex),
                col: col + model.outputs.length + priorityColumns,
              }}
              onStartEdit={() => setEditing(annotationId)}
              onNavigate={navigateTo}
              registerRef={registerRef}
            />
          )}
        </TableCell>
        {!readOnly && (
          <TableCell sx={{ width: 34, p: 0 }} align="center">
            <IconButton
              size="small"
              aria-label={`rule ${rowIndex + 1} menu`}
              onClick={(event) => setRowMenu({ anchor: event.currentTarget, row: rowIndex })}
            >
              <MoreVertIcon fontSize="inherit" />
            </IconButton>
          </TableCell>
        )}
      </TableRow>
    );
  };

  const handleRowMenuAction = (action: string): void => {
    if (!rowMenu || !definition) {
      return;
    }
    const index = rowMenu.row;
    const rules = [...definition['@rules']];
    setRowMenu(null);
    switch (action) {
      case 'delete':
        rules.splice(index, 1);
        applyDefinition(withRules(definition, rules));
        break;
      case 'duplicate':
        rules.splice(index + 1, 0, { ...rules[index] });
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
      case 'to-expression':
        commitRowEdit(index, (draft) => {
          draft.when = { kind: 'expression', text: 'true' };
        });
        break;
      case 'to-cells':
        commitRowEdit(index, (draft) => {
          draft.when = { kind: 'cells', cells: {} };
        });
        break;
      default:
        break;
    }
  };

  const handleColumnMenuAction = (action: string): void => {
    if (!columnMenu || !definition) {
      return;
    }
    const { column } = columnMenu;
    setColumnMenu(null);
    if (action === 'rename' && column.kind === 'output' && column.name !== SCALAR_OUTPUT) {
      setDialog({
        title: 'Rename output column',
        nameLabel: 'Column name',
        initialName: column.name,
        onSubmit: (name) => applyDefinition(withOutputColumnRenamed(definition, column.name, name)),
      });
    }
    if (action === 'delete') {
      applyDefinition(
        column.kind === 'input'
          ? withInputColumnRemoved(definition, column.name)
          : withOutputColumnRemoved(definition, column.name),
      );
    }
  };

  const handleTableMenuAction = (action: string): void => {
    if (!definition || !model) {
      return;
    }
    setTableMenu(null);
    switch (action) {
      case 'add-input':
        setDialog({
          title: 'Add input column',
          nameLabel: 'Parameter name',
          withType: true,
          onSubmit: (name, type) => applyDefinition(withInputColumnAdded(definition, name, type)),
        });
        break;
      case 'add-output':
        setDialog({
          title: 'Add output column',
          nameLabel: 'Output field name',
          onSubmit: (name) => applyDefinition(withOutputColumnAdded(definition, name)),
        });
        break;
      case 'add-default': {
        const defaultNode = model.scorecard
          ? (0 as unknown as PortableContext)
          : (Object.fromEntries(
              model.outputs.map((column) => [
                column.name,
                column.typeLabel === 'number' ? '0' : column.typeLabel === 'boolean' ? 'false' : "''",
              ]),
            ) as PortableContext);
        applyDefinition(withDefaultRow(definition, defaultNode));
        break;
      }
      case 'remove-default':
        applyDefinition(withDefaultRow(definition, undefined));
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
        '& .tok-keyword': { color: (theme) => (theme.palette.mode === 'dark' ? '#c792ea' : '#7b1fa2') },
        '& .tok-atom': { color: (theme) => (theme.palette.mode === 'dark' ? '#d19a66' : '#e65100') },
        '& .tok-bool': { color: (theme) => (theme.palette.mode === 'dark' ? '#56b6c2' : '#0b7285') },
        '& .tok-number': { color: (theme) => (theme.palette.mode === 'dark' ? '#b5cea8' : '#098658') },
        '& .tok-string': { color: (theme) => (theme.palette.mode === 'dark' ? '#ce9178' : '#a31515') },
        '& .tok-typeName': { color: (theme) => (theme.palette.mode === 'dark' ? '#4ec9b0' : '#267f99') },
        '& .tok-propertyName': { color: (theme) => (theme.palette.mode === 'dark' ? '#9cdcfe' : '#001080') },
        '& .tok-variableName': { color: (theme) => (theme.palette.mode === 'dark' ? '#9cdcfe' : '#0070c1') },
        '& .tok-function': { color: (theme) => (theme.palette.mode === 'dark' ? '#dcdcaa' : '#795e26') },
        '& .tok-self': { color: (theme) => (theme.palette.mode === 'dark' ? '#569cd6' : '#0000ff') },
        ...sx,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
          {rulesetName}
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontFamily: 'monospace' }}>
          ({Object.keys(definition['@parameters']).join(', ')})
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
        <Box sx={{ flex: 1 }} />
        <Select
          value={model.hitPolicy}
          size="small"
          disabled={readOnly}
          inputProps={{ 'aria-label': 'Hit policy' }}
          onChange={(event) => applyDefinition(withHitPolicy(definition, event.target.value as HitPolicy))}
          renderValue={(value) => {
            const policy = HIT_POLICIES.find((option) => option.value === value);
            return policy ? `${policy.badge} · ${policy.label}` : String(value);
          }}
          sx={{ minWidth: 200 }}
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
        <Alert severity="error" onClose={() => setEditError(null)} sx={{ mb: 1 }}>
          {editError}
        </Alert>
      ) : null}

      <Table
        size="small"
        sx={{
          borderCollapse: 'separate',
          '& td, & th': {
            border: (theme) => `1px solid ${theme.palette.divider}`,
            p: 0.25,
          },
          '& th': { fontWeight: 600 },
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
            <TableCell align="center" sx={{ width: 34 }}>
              <Tooltip title={HIT_POLICIES.find((policy) => policy.value === model.hitPolicy)?.label ?? ''}>
                <span>{HIT_POLICIES.find((policy) => policy.value === model.hitPolicy)?.badge}</span>
              </Tooltip>
            </TableCell>
            {model.inputs.map((column) => (
              <TableCell key={`input-${column.name}`} className="dt-input-header">
                {columnHeader(column, (
                  <>
                    {column.name}
                    <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                      {column.typeLabel}
                    </Typography>
                  </>
                ))}
              </TableCell>
            ))}
            {model.outputs.map((column) => (
              <TableCell key={`output-${column.name}`} className="dt-output-header">
                {columnHeader(column, (
                  <>
                    {column.name === SCALAR_OUTPUT ? 'score' : column.name}
                    <Typography component="span" variant="caption" sx={{ color: 'text.secondary', ml: 0.5 }}>
                      {column.typeLabel}
                    </Typography>
                  </>
                ))}
              </TableCell>
            ))}
            {showPriority ? <TableCell sx={{ width: 70 }}>priority</TableCell> : null}
            <TableCell sx={{ color: 'text.secondary', fontWeight: 400 }}>annotation</TableCell>
            {!readOnly && <TableCell sx={{ width: 34 }} />}
          </TableRow>
        </TableHead>
        <TableBody>
          {model.rows.map((row, rowIndex) => renderRuleRow(row, rowIndex))}
          {model.defaultRow ? (
            <TableRow>
              <TableCell
                align="right"
                colSpan={1 + model.inputs.length}
                sx={{ color: 'text.secondary', fontStyle: 'italic' }}
              >
                default
              </TableCell>
              {model.outputs.map((column, outputIndex) => {
                const id: CellId = { kind: 'default', name: column.name };
                return (
                  <TableCell key={`default-${column.name}`}>
                    {editingKey === cellKey(id)
                      ? editorCell(
                          model.defaultRow?.[column.name] ?? '',
                          thenCellEmbedContext(definition),
                          (text) => applyDefaultCell(column.name, text),
                        )
                      : (
                        <DisplayCell
                          text={model.defaultRow?.[column.name] ?? ''}
                          readOnly={readOnly}
                          gridPosition={{ row: defaultGridRow, col: model.inputs.length + outputIndex }}
                          onStartEdit={() => setEditing(id)}
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
              <TableCell colSpan={totalColumns} sx={{ border: 'none !important' }}>
                <Button size="small" startIcon={<AddIcon />} onClick={addRule}>
                  Add rule
                </Button>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Menu anchorEl={rowMenu?.anchor ?? null} open={rowMenu !== null} onClose={() => setRowMenu(null)}>
        <MenuItem onClick={() => handleRowMenuAction('duplicate')}>Duplicate rule</MenuItem>
        <MenuItem onClick={() => handleRowMenuAction('move-up')}>Move up</MenuItem>
        <MenuItem onClick={() => handleRowMenuAction('move-down')}>Move down</MenuItem>
        {rowMenu !== null && model.rows[rowMenu.row]?.when.kind === 'cells' ? (
          <MenuItem onClick={() => handleRowMenuAction('to-expression')}>
            Use expression condition
          </MenuItem>
        ) : (
          <MenuItem onClick={() => handleRowMenuAction('to-cells')}>Use column conditions</MenuItem>
        )}
        <MenuItem onClick={() => handleRowMenuAction('delete')} sx={{ color: 'error.main' }}>
          Delete rule
        </MenuItem>
      </Menu>

      <Menu
        anchorEl={columnMenu?.anchor ?? null}
        open={columnMenu !== null}
        onClose={() => setColumnMenu(null)}
      >
        {columnMenu?.column.kind === 'output' && columnMenu.column.name !== SCALAR_OUTPUT ? (
          <MenuItem onClick={() => handleColumnMenuAction('rename')}>Rename column…</MenuItem>
        ) : null}
        <MenuItem onClick={() => handleColumnMenuAction('delete')} sx={{ color: 'error.main' }}>
          Delete column
        </MenuItem>
      </Menu>

      <Menu anchorEl={tableMenu} open={tableMenu !== null} onClose={() => setTableMenu(null)}>
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
    </Box>
  );
}
