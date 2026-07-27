import Box from '@mui/material/Box';
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import type { PortableError, PortableNode, PortableRootContext } from '@edgerules/portable';
import {
  CodeEditorCell,
  type CodeEditorEmbedContext,
} from '../../code-editor-cell';
import { useRowCommands } from '../commands/useRowCommands';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import { useBoxedEditorUi } from '../context/BoxedEditorUiContext';
import {
  authoredEntries,
  childPath,
  formatPortableValue,
  indexedPath,
  isRecord,
} from '../service/portable-utils';
import type { BoxedRowData } from '../boxed-editor-types';

const ACTIVE_CELL_MARKER = '__boxed_editor_active_cell__';

function parametersText(parameters: unknown): string {
  if (!isRecord(parameters)) return '';
  return Object.entries(parameters)
    .map(([name, type]) => {
      if (typeof type === 'string') return `${name}: ${type}`;
      if (isRecord(type) && typeof type.type === 'string')
        return `${name}: ${type.type}`;
      return `${name}: any`;
    })
    .join(', ');
}

function typeDefinitionText(
  node: Record<string, unknown>,
  path: string,
  activePath: string,
): string {
  const fields = Object.entries(node)
    .filter(([key]) => key !== '@kind')
    .map(([name, child]) => {
      const childP = childPath(path, name);
      const text =
        isRecord(child) && child['@kind'] === 'type-definition'
          ? typeDefinitionText(child, childP, activePath)
          : nodeText(child as PortableNode, childP, activePath);
      return `${name}: ${text}`;
    });
  return `{ ${fields.join('; ')} }`;
}

function contextText(
  node: Record<string, unknown>,
  path: string,
  activePath: string,
): string {
  const fields = authoredEntries(node).map(([name, child]) => {
    const childP = childPath(path, name);
    if (isRecord(child)) {
      const record = child as unknown as Record<string, unknown>;
      if (record['@kind'] === 'external-function') {
        return `external func ${name}(${parametersText(record['@parameters'])}) -> ${
          typeof record['@return'] === 'string' ? record['@return'] : 'any'
        }`;
      }
      if (record['@kind'] === 'function') {
        const body = record['@body'];
        const inline = !isRecord(body) || body['@kind'] === 'expression';
        const bodyText = inline
          ? nodeText(body as PortableNode, childPath(childP, 'result'), activePath)
          : contextText(body as Record<string, unknown>, childP, activePath);
        return `func ${name}(${parametersText(record['@parameters'])}): ${bodyText}`;
      }
      if (record['@kind'] === 'type-definition') {
        return `type ${name}: ${typeDefinitionText(record, childP, activePath)}`;
      }
    }
    return `${name}: ${nodeText(child as PortableNode, childP, activePath)}`;
  });
  return `{ ${fields.join('; ')} }`;
}

function nodeText(node: PortableNode, path: string, activePath: string): string {
  if (path === activePath) return ACTIVE_CELL_MARKER;
  if (Array.isArray(node)) {
    return `[${node.map((item, index) => nodeText(item, indexedPath(path, index), activePath)).join(', ')}]`;
  }
  if (!isRecord(node)) return formatPortableValue(node);
  const record = node as unknown as Record<string, unknown>;
  if (record['@kind'] === 'type-definition') return typeDefinitionText(record, path, activePath);
  if (record['@kind'] === 'context' || record['@kind'] === undefined) {
    return contextText(record, path, activePath);
  }
  return formatPortableValue(node);
}

/**
 * Wraps the active cell's text in a synthetic DSL prefix/suffix built from the current model, so
 * the cell is analyzed (diagnostics + completions) in the scope of its surrounding model. Never
 * persisted — the marker only tells us where to split the generated model text.
 */
function buildExpressionEmbedContext(
  root: PortableRootContext,
  activePath: string,
): CodeEditorEmbedContext {
  const model = contextText(root as unknown as Record<string, unknown>, '*', activePath);
  const markerIndex = model.indexOf(ACTIVE_CELL_MARKER);
  if (markerIndex === -1) return { prefix: '', suffix: '' };
  return {
    prefix: model.slice(0, markerIndex),
    suffix: model.slice(markerIndex + ACTIVE_CELL_MARKER.length),
  };
}

export interface ExpressionCellProps {
  row: BoxedRowData;
  /**
   * Overrides the default whole-row commit at `row.path`. Needed by cells that don't own an
   * addressable path of their own — a ruleset rule's condition/action cells rewrite and commit
   * their *owning* `rule` row instead (Section 7: "Container edits ... rewrite the whole
   * parent"). `row.path` still seeds this cell's active/embed-context identity.
   */
  onCommit?: (value: string) => PortableError | undefined;
}

/**
 * Static text ⇄ `CodeEditorCell` swap for a `field` row's value. At most one `ExpressionCell`
 * across the whole tree is active at a time (`BoxedEditorUiContext.activeCellPath`); every other
 * cell renders static text.
 */
export function ExpressionCell({ row, onCommit }: ExpressionCellProps): ReactElement {
  const { service, readOnly, languageService } = useBoxedEditorContext();
  const { activeCellPath, setActiveCellPath } = useBoxedEditorUi();
  const commands = useRowCommands();
  const active = activeCellPath === row.path;
  // `row.readOnly` reflects the engine's input/computed direction label (Alt-reveal tooltip
  // territory), not authoring permission — a computed field's formula is still editable here.
  const editable = !readOnly && languageService !== undefined;

  const [draft, setDraft] = useState(row.value ?? '');
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!active) return;
    setDraft(row.value ?? '');
    setError(undefined);
    // Reset only on the transition into edit mode — a fresh edit always starts from the last
    // committed value; further row updates while active come from this same edit's own commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const embedContext = useMemo(
    () => (active ? buildExpressionEmbedContext(service.toPortable(), row.path) : undefined),
    [active, service, row.path],
  );

  const activate = (): void => {
    if (!editable) return;
    setActiveCellPath(row.path);
  };

  const commit = (value: string): void => {
    const result = onCommit
      ? onCommit(value)
      : commands.setBoxedRowData(row.path, { ...row, value });
    if (result) {
      setDraft(value);
      setError(result.message);
      return;
    }
    setActiveCellPath(null);
  };

  const cancel = (): void => {
    setActiveCellPath(null);
  };

  if (!active || !languageService) {
    return (
      <Box
        component="span"
        tabIndex={editable ? 0 : undefined}
        onClick={activate}
        onKeyDown={(event) => {
          if (!editable) return;
          if (event.key === 'Enter' || event.key === 'F2') {
            event.preventDefault();
            activate();
          }
        }}
        sx={{
          display: 'block',
          width: '100%',
          minWidth: 0,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          cursor: editable ? 'text' : 'default',
        }}
      >
        {row.value}
      </Box>
    );
  }

  return (
    <Box sx={{ position: 'relative', width: '100%' }}>
      <CodeEditorCell
        value={draft}
        onChange={setDraft}
        onCommit={commit}
        onCancel={cancel}
        service={languageService}
        embedContext={embedContext}
        autoFocus
      />
      {error && (
        <Box
          role="alert"
          sx={{
            position: 'absolute',
            top: '100%',
            left: 0,
            zIndex: 1300,
            mt: 0.5,
            px: 1,
            py: 0.5,
            maxWidth: 360,
            borderRadius: 0.5,
            bgcolor: 'error.main',
            color: 'error.contrastText',
            fontSize: '0.75rem',
            boxShadow: 2,
          }}
        >
          {error}
        </Box>
      )}
    </Box>
  );
}
