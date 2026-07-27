import type { ReactElement } from 'react';
import type {
  BoxedRowData,
  BoxedRowKind,
  BoxedTableRowData,
} from '../boxed-editor-types';
import {
  appendListItem,
  appendRelationItem,
  nextFieldRow,
} from '../commands/rowFactories';
import { useRowCommands } from '../commands/useRowCommands';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import { indexedPath, pathDepth } from '../service/portable-utils';
import { GenericRow } from './GenericRow';

interface NewRowConfig {
  itemKind: BoxedRowKind;
  label: string;
}

/**
 * Every appendable container and the placeholder it renders. `itemKind` values without a
 * matching `rowFactories` entry (`rule`, `optimisation-variable`, `optimisation-constraint`)
 * simply don't render yet — Phase 4 adds their row component, factory, and this placeholder
 * starts working with no further changes here.
 */
const NEW_ROW_CONFIG: Partial<Record<BoxedRowKind, NewRowConfig>> = {
  model: { itemKind: 'field', label: '(new item)' },
  context: { itemKind: 'field', label: '(new item)' },
  function: { itemKind: 'field', label: '(new item)' },
  complexType: { itemKind: 'field', label: '(new field)' },
  list: { itemKind: 'list-item', label: '(new item)' },
  relation: { itemKind: 'relation-item', label: '(new row)' },
  ruleset: { itemKind: 'rule', label: '(new rule)' },
  'optimisation-variable-group': {
    itemKind: 'optimisation-variable',
    label: '(new variable)',
  },
  'optimisation-constraint-group': {
    itemKind: 'optimisation-constraint',
    label: '(new constraint)',
  },
};

export interface NewRowProps {
  /** The appendable container this trailing placeholder belongs to. */
  row: BoxedRowData;
}

/**
 * Trailing "(new …)" row rendered by every appendable container — interacting with it appends
 * without opening the three-dot menu (menu wiring itself is Phase 5). Hidden under `readOnly`.
 */
export function NewRow({ row }: NewRowProps): ReactElement | null {
  const { readOnly } = useBoxedEditorContext();
  const commands = useRowCommands();
  const config = NEW_ROW_CONFIG[row.kind];
  if (!config || readOnly) return null;

  let depth: number;
  let onActivate: () => void;

  switch (config.itemKind) {
    case 'field': {
      const field = nextFieldRow(row);
      depth = field.depth;
      onActivate = () => {
        commands.setBoxedRowData(field.path, field);
      };
      break;
    }
    case 'list-item': {
      depth = pathDepth(indexedPath(row.path, row.children?.length ?? 0));
      onActivate = () => {
        commands.setBoxedRowData(row.path, appendListItem(row));
      };
      break;
    }
    case 'relation-item': {
      const relation = row as BoxedTableRowData;
      depth = pathDepth(indexedPath(relation.path, relation.children?.length ?? 0));
      onActivate = () => {
        commands.setBoxedRowData(relation.path, appendRelationItem(relation));
      };
      break;
    }
    default:
      // `rule` / `optimisation-variable` / `optimisation-constraint` land with Phase 4.
      return null;
  }

  return (
    <GenericRow
      name={config.label}
      depth={depth}
      placeholder
      showDragHandle={false}
      showActions={false}
      onActivate={onActivate}
    />
  );
}
