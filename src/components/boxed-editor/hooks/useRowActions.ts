import { useMemo } from 'react';
import type { BoxedRowData, BoxedTableRowData } from '../boxed-editor-types';
import {
  addActionColumn,
  addArgument,
  addConditionColumn,
  addOptimisationVariable,
  addRelationColumn,
  appendOptimisationConstraint,
  appendRule,
  convertContainerToField,
  convertField,
  duplicateChildAt,
  duplicateNamedRow,
  nextFieldRow,
  nextComplexTypeRow,
  nextFunctionRow,
  nextListRow,
  nextOptimisationRow,
  nextRelationRow,
  nextRulesetRow,
  removeActionColumn,
  removeArgument,
  removeConditionColumn,
  removeRelationColumn,
  uniqueName,
} from '../commands/rowFactories';
import { useRowCommands } from '../commands/useRowCommands';
import { useBoxedEditorContext } from '../context/BoxedEditorContext';
import { useBoxedEditorUi } from '../context/BoxedEditorUiContext';
import type { RowActionId } from '../menu/actions';
import { rowActionIcons } from '../menu/actions';
import type { RowMenuItem } from '../menu/RowActionsMenu';
import { parentPath as parentPathOf } from '../service/portable-utils';

interface ActionDraft {
  id: RowActionId;
  label: string;
  danger?: boolean;
  /** Survives the `readOnly` filter — Duplicate (a copy, never a mutation) and Expand/Collapse
   * (view state, not model state) per the phase's enablement rules. */
  nonMutating?: boolean;
  onSelect: () => void;
}

/**
 * `BoxedRowKind` ➜ this row's three-dot menu items ➜ the command each one dispatches
 * (`docs/boxed-editor/phase-05-context-menus-and-actions.md` §3/§4).
 *
 * Every "current children/columns/parameters of `row` itself" read comes straight off the `row`
 * prop — `normalizeNode`'s recursive build means any non-root row already carries its own fully
 * populated `children` (Section 7's "render rows in the order the service returns" holds for this
 * too). The one exception is the `model` row: `BoxedEditorGrid` renders it from
 * `service.getBoxedRowData('*')`, which — like every path — has its own `children` stripped (the
 * cache returns those separately via `getBoxedRowsData`), so `model`'s "Add …" actions fetch that
 * list live instead of trusting `row.children`. A **sibling** list (for a named kind's `Duplicate`
 * auto-rename, or a positional kind's whole-parent rewrite) is never on `row` itself either way,
 * so those always fetch the parent live.
 */
export function useRowActions(row: BoxedRowData): RowMenuItem[] {
  const { service, readOnly, onOpenNode } = useBoxedEditorContext();
  const commands = useRowCommands();
  const { isExpanded, toggleExpand, openModelSettings } = useBoxedEditorUi();

  return useMemo(() => {
    const drafts: ActionDraft[] = [];
    const commit = (path: string, value: BoxedRowData): void => {
      commands.setBoxedRowData(path, value, row.path);
    };
    const push = (
      id: RowActionId,
      label: string,
      onSelect: () => void,
      options?: { danger?: boolean; nonMutating?: boolean },
    ): void => {
      drafts.push({ id, label, onSelect, danger: options?.danger, nonMutating: options?.nonMutating });
    };

    const parent = parentPathOf(row.path) ?? '*';

    const pushDuplicate = (): void => {
      push(
        'duplicate',
        'Duplicate',
        () => {
          const siblings = new Set(service.getBoxedRowsData(parent).map((sibling) => sibling.name));
          const { path, row: duplicated } = duplicateNamedRow(row, siblings);
          commit(path, duplicated);
        },
        { nonMutating: true },
      );
    };

    // A `rule`'s path is `<ruleset>.rules[i]` — `.rules` is a synthetic indexing prefix
    // (`loadRows`'s own `/^(.*)\.rules\[\d+\]$/`), not a real addressable container, so its whole-
    // array-rewrite target is the *ruleset itself*, one level further up than `parentPath` alone
    // gives every other positional kind (`list-item`/`relation-item`, whose parent path already is
    // the real `list`/`relation` container).
    const positionalParent =
      row.kind === 'rule' ? parentPathOf(parent) ?? '*' : parent;

    const pushDuplicatePositional = (): void => {
      push(
        'duplicate',
        'Duplicate',
        () => {
          const container = service.getBoxedRowData(positionalParent);
          if (!container) return;
          const children = service.getBoxedRowsData(positionalParent);
          commit(
            positionalParent,
            {
              ...container,
              children: duplicateChildAt(children, row.path),
            },
          );
        },
        { nonMutating: true },
      );
    };

    const pushDelete = (): void => {
      if (row.deletable === false) return;
      push('delete', 'Delete', () => commands.remove(row.path), { danger: true });
    };

    const pushExpandCollapse = (): void => {
      const expanded = isExpanded(row.path);
      push(
        expanded ? 'collapse' : 'expand',
        expanded ? 'Collapse' : 'Expand',
        () => toggleExpand(row.path),
        { nonMutating: true },
      );
    };

    const pushViewAsCode = (): void => {
      push('view-as-code', 'View as code', () => onOpenNode?.({ path: row.path, kind: 'code-editor' }));
    };

    /** Shared `Add Field/Function/[Optimisation]/Decision Table/Relation/List` for `model`/`context`. */
    const pushContainerAdds = (
      targetPath: string,
      children: BoxedRowData[],
      includeOptimisation: boolean,
    ): void => {
      const existingNames = new Set(children.map((child) => child.name));
      push('add-field', 'Add field', () => {
        const field = nextFieldRow({ path: targetPath, children });
        commit(field.path, field);
      });
      push('add-complex-type', 'Add type', () => {
        const complexType = nextComplexTypeRow({path: targetPath}, existingNames);
        commit(complexType.path, complexType);
      });
      push('add-function', 'Add function', () => {
        const fn = nextFunctionRow({ path: targetPath }, existingNames);
        commit(fn.path, fn);
      });
      if (includeOptimisation) {
        push('add-optimisation', 'Add optimisation', () => {
          const optimisation = nextOptimisationRow({ path: targetPath }, existingNames);
          commit(optimisation.path, optimisation);
        });
      }
      push('add-ruleset', 'Add decision table', () => {
        const ruleset = nextRulesetRow({ path: targetPath }, existingNames);
        commit(ruleset.path, ruleset);
      });
      push('add-relation', 'Add relation', () => {
        const relation = nextRelationRow({ path: targetPath }, existingNames);
        commit(relation.path, relation);
      });
      push('add-list', 'Add list', () => {
        const list = nextListRow({ path: targetPath }, existingNames);
        commit(list.path, list);
      });
    };

    switch (row.kind) {
      case 'model': {
        pushContainerAdds(row.path, service.getBoxedRowsData(row.path), true);
        push('model-settings', 'Model settings', () => openModelSettings());
        pushViewAsCode();
        break;
      }
      case 'context': {
        push('convert-to-field', 'Convert to field', () => {
          if ((row.children?.length ?? 0) > 0 && !globalThis.confirm('Discard the container contents?')) return;
          commit(row.path, convertContainerToField(row));
        });
        pushContainerAdds(row.path, row.children ?? [], false);
        pushDuplicate();
        pushDelete();
        pushExpandCollapse();
        break;
      }
      case 'complexType': {
        const children = row.children ?? [];
        push('add-field', 'Add field', () => {
          const field = nextFieldRow({ path: row.path, children }, true);
          commit(field.path, field);
        });
        pushDuplicate();
        pushDelete();
        pushExpandCollapse();
        break;
      }
      case 'field': {
        push('convert-to-context', 'Convert to context', () => {
          commit(row.path, convertField(row, 'context'));
        });
        push('convert-to-relation', 'Convert to relation', () => {
          commit(row.path, convertField(row, 'relation'));
        });
        push('convert-to-list', 'Convert to list', () => {
          commit(row.path, convertField(row, 'list'));
        });
        pushDuplicate();
        push('delete', 'Delete', () => {
          const ownerPath = parentPathOf(row.path);
          const owner = ownerPath ? service.getBoxedRowData(ownerPath) : undefined;
          if (ownerPath && owner?.kind === 'function') {
            const remaining = service
              .getBoxedRowsData(ownerPath)
              .filter((child) => child.path !== row.path);
            commit(ownerPath, {...owner, children: remaining});
            return;
          }
          commands.remove(row.path);
        }, {danger: true});
        break;
      }
      case 'list': {
        push('convert-to-field', 'Convert to field', () => {
          if ((row.children?.length ?? 0) > 0 && !globalThis.confirm('Discard the list items?')) return;
          commit(row.path, convertContainerToField(row));
        });
        pushDuplicate();
        pushDelete();
        break;
      }
      case 'list-item':
      case 'relation-item':
      case 'rule': {
        const table = row as BoxedTableRowData;
        if (table.conditionsExpression === undefined) {
          push('switch-rule-form', 'Switch to expression condition', () => {
            commit(row.path, {
              ...table,
              conditions: undefined,
              conditionsExpression: 'true',
            } as BoxedTableRowData);
          });
        } else {
          push('switch-rule-form', 'Switch to column conditions', () => {
            if (
              table.conditionsExpression?.trim() !== 'true' &&
              !globalThis.confirm('Discard the authored condition expression?')
            ) {
              return;
            }
            commit(row.path, {
              ...table,
              conditionsExpression: undefined,
              conditions: (table.conditionColumns ?? []).map(() => ''),
            } as BoxedTableRowData);
          });
        }
        pushDuplicatePositional();
        pushDelete();
        break;
      }
      case 'relation': {
        const table = row as BoxedTableRowData;
        const columns = table.columns ?? [];
        push('convert-to-field', 'Convert to field', () => {
          if ((row.children?.length ?? 0) > 0 && !globalThis.confirm('Discard the relation records?')) return;
          commit(row.path, convertContainerToField(row));
        });
        push('add-column', 'Add column', () => {
          commit(row.path, addRelationColumn(table, uniqueName('column', new Set(columns))));
        });
        for (const column of columns) {
          push(
            'delete-column',
            `Delete "${column}" column`,
            () => commit(row.path, removeRelationColumn(table, column)),
            { danger: true },
          );
        }
        pushDelete();
        break;
      }
      case 'function': {
        const table = row as BoxedTableRowData;
        const parameters = table.parameters ?? [];
        push('add-argument', 'Add argument', () => {
          commit(row.path, addArgument(table));
        });
        for (const parameter of parameters) {
          push(
            'delete-argument',
            `Delete "${parameter.name}" argument`,
            () => commit(row.path, removeArgument(table, parameter.name)),
            { danger: true },
          );
        }
        pushDuplicate();
        pushDelete();
        pushExpandCollapse();
        pushViewAsCode();
        break;
      }
      case 'function-result': {
        // The synthesized `result` of an inline function body — duplicating it means promoting
        // the body from a bare expression to a multi-statement context (Section 4's "renders a
        // multi-statement function body as ordinary field rows"), so this is a whole-`function`
        // rewrite, not a plain path `set` (the same limitation `FunctionResultRow`'s own edits
        // hit: `<name>.result` names no real field while the body is still a bare expression).
        push(
          'duplicate',
          'Duplicate',
          () => {
            const fnRow = service.getBoxedRowData(parent) as BoxedTableRowData | undefined;
            if (!fnRow) return;
            const children = service.getBoxedRowsData(parent);
            const siblings = new Set(children.map((child) => child.name));
            const { row: duplicated } = duplicateNamedRow(row, siblings);
            const field: BoxedRowData = {
              ...duplicated,
              kind: 'field',
              readOnly: undefined,
              deletable: undefined,
            };
            commit(parent, { ...fnRow, children: [...children, field] });
          },
          { nonMutating: true },
        );
        // `deletable: false` always — Delete is offered by the row kind but never enabled here.
        pushDelete();
        break;
      }
      case 'ruleset': {
        const table = row as BoxedTableRowData;
        push('add-rule', 'Add rule', () => {
          commit(row.path, appendRule(table));
        });
        push('add-condition-column', 'Add condition column', () => {
          const existing = new Set((table.parameters ?? []).map((parameter) => parameter.name));
          commit(row.path, addConditionColumn(table, uniqueName('condition', existing)));
        });
        push('add-action-column', 'Add action column', () => {
          const existing = new Set(table.actionColumns ?? []);
          commit(row.path, addActionColumn(table, uniqueName('action', existing)));
        });
        for (const parameter of table.parameters ?? []) {
          push(
            'delete-column',
            `Delete "${parameter.name}" column`,
            () => commit(row.path, removeConditionColumn(table, parameter.name)),
            { danger: true },
          );
        }
        for (const column of table.actionColumns ?? []) {
          push(
            'delete-column',
            `Delete "${column}" column`,
            () => commit(row.path, removeActionColumn(table, column)),
            { danger: true },
          );
        }
        pushDuplicate();
        pushDelete();
        pushExpandCollapse();
        pushViewAsCode();
        break;
      }
      case 'ruleset-default': {
        // `deletable: false` always (`normalizeRuleset`) — offered per the row kind, never enabled.
        pushDelete();
        break;
      }
      case 'ruleset-hit-policy': {
        // Edited via its own picker chip — no menu.
        break;
      }
      case 'optimisation': {
        const table = row as BoxedTableRowData;
        const parameters = table.parameters ?? [];
        push('add-argument', 'Add argument', () => {
          // Unlike a `function`'s argument, an `optimise` parameter must carry a real type
          // annotation (`E331`) — `number` is the least surprising default for what's usually a
          // numeric business input; the user retypes it via the argument header like any other.
          commit(row.path, addArgument(table, 'number'));
        });
        for (const parameter of parameters) {
          push(
            'delete-argument',
            `Delete "${parameter.name}" argument`,
            () => commit(row.path, removeArgument(table, parameter.name)),
            { danger: true },
          );
        }
        const optimisationChildren = table.children ?? service.getBoxedRowsData(row.path);
        const settingNames = new Set(optimisationChildren.map((child) => child.name));
        if (!settingNames.has('timeLimit')) {
          push('add-setting', 'Add time limit', () => {
            commit(row.path, {
              ...table,
              children: [
                ...optimisationChildren,
                {
                  kind: 'optimisation-setting',
                  depth: row.depth + 1,
                  path: `${row.path}.timeLimit`,
                  name: 'timeLimit',
                  value: '1000',
                },
              ],
            });
          });
        }
        if (!settingNames.has('bottlenecks')) {
          push('add-setting', 'Add bottlenecks', () => {
            commit(row.path, {
              ...table,
              children: [
                ...optimisationChildren,
                {
                  kind: 'optimisation-setting',
                  depth: row.depth + 1,
                  path: `${row.path}.bottlenecks`,
                  name: 'bottlenecks',
                  value: 'true',
                },
              ],
            });
          });
        }
        pushDuplicate();
        pushDelete();
        pushExpandCollapse();
        pushViewAsCode();
        break;
      }
      case 'optimisation-setting': {
        // `using`/`bottlenecks`/`timeLimit` — edited via their own chip/expression cell, no menu.
        break;
      }
      case 'optimisation-variable-group': {
        push('add-variable', 'Add variable', () => {
          const optimisationRow = service.getBoxedRowData(parent) as BoxedTableRowData | undefined;
          if (!optimisationRow) return;
          const optimisationChildren = service.getBoxedRowsData(parent);
          commit(
            parent,
            addOptimisationVariable({ ...optimisationRow, children: optimisationChildren }),
          );
        });
        break;
      }
      case 'optimisation-variable':
      case 'optimisation-constraint': {
        pushDuplicate();
        pushDelete();
        break;
      }
      case 'optimisation-objective': {
        const next = row.name === 'maximise' ? 'minimise' : 'maximise';
        push(
          'switch-objective-direction',
          row.name === 'maximise' ? 'Switch to minimise' : 'Switch to maximise',
          () => commit(row.path, { ...row, name: next }),
        );
        break;
      }
      case 'optimisation-constraint-group': {
        push('add-constraint', 'Add constraint', () => {
          commit(row.path, appendOptimisationConstraint(row));
        });
        break;
      }
    }

    const visible = readOnly ? drafts.filter((draft) => draft.nonMutating) : drafts;
    return visible.map((draft) => ({
      id: draft.id,
      label: draft.label,
      icon: rowActionIcons[draft.id],
      danger: draft.danger,
      onSelect: draft.onSelect,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row, service, readOnly, commands, isExpanded, toggleExpand, openModelSettings, onOpenNode]);
}
