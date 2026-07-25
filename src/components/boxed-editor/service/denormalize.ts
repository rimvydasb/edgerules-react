import type {
  PortableContext,
  PortableExpression,
  PortableNode,
  PortableOptimiseDefinition,
  PortableRule,
  PortableRulesetDefinition,
  PortableTypedValue,
} from '@edgerules/portable';
import type {
  BoxedRowData,
  BoxedTableRowData,
  SignatureParameter,
} from '../boxed-editor-types';

function expression(text = ''): PortableExpression {
  return { '@kind': 'expression', expression: text };
}

function parameters(
  values: SignatureParameter[] | undefined,
): Record<string, string | PortableTypedValue | null> {
  const result: Record<string, string | PortableTypedValue | null> = {};
  for (const parameter of values ?? []) {
    if (!parameter.type) {
      result[parameter.name] = null;
    } else if (parameter.required === undefined) {
      result[parameter.name] = parameter.type;
    } else {
      result[parameter.name] = {
        '@kind': 'type',
        type: parameter.type,
        required: parameter.required,
      };
    }
  }
  return result;
}

function contextFromChildren(
  children: BoxedRowData[] | undefined,
): PortableContext {
  const context: PortableContext = { '@kind': 'context' };
  for (const child of children ?? []) {
    context[child.name] = denormalize(child);
  }
  return context;
}

function typeDefinitionFromChildren(
  children: BoxedRowData[] | undefined,
): PortableNode {
  return {
    '@kind': 'type-definition',
    ...Object.fromEntries(
      (children ?? []).map((child) => [
        child.name,
        child.kind === 'complexType'
          ? typeDefinitionFromChildren(child.children)
          : (child.value ?? child.type ?? ''),
      ]),
    ),
  } as PortableNode;
}

function recordFromCells(
  columns: string[] | undefined,
  cells: string[] | undefined,
): PortableContext {
  const result: PortableContext = { '@kind': 'context' };
  (columns ?? []).forEach((column, index) => {
    const value = cells?.[index] ?? '';
    if (value !== '') result[column] = expression(value);
  });
  return result;
}

function recordFromTableRow(
  row: BoxedTableRowData,
  columns = row.columns,
): PortableContext {
  const result = recordFromCells(columns, row.cells);
  for (const child of row.children ?? []) {
    result[child.name] = denormalize(child);
  }
  return result;
}

function functionNode(row: BoxedTableRowData): PortableNode {
  const children = row.children ?? [];
  const onlyResult =
    children.length === 1 &&
    (children[0].kind === 'function-result' || children[0].name === 'result');
  return {
    '@kind': 'function',
    '@parameters': parameters(row.parameters),
    '@body': onlyResult
      ? expression(children[0].value)
      : contextFromChildren(children),
  } as PortableNode;
}

function ruleNode(row: BoxedTableRowData): PortableRule {
  const when =
    row.conditionsExpression !== undefined
      ? expression(row.conditionsExpression)
      : Object.fromEntries(
          (row.conditionColumns ?? [])
            .map(
              (column, index) =>
                [column, row.conditions?.[index] ?? ''] as const,
            )
            .filter(([, value]) => value !== ''),
        );
  return {
    '@kind': 'rule',
    ...(row.name && !/^Rule \d+$/.test(row.name) ? { name: row.name } : {}),
    ...(Object.keys(when).length > 0 ? { when } : {}),
    then: recordFromCells(row.actionColumns, row.actions),
    ...(row.priority !== undefined ? { priority: row.priority } : {}),
  } as PortableRule;
}

function rulesetNode(row: BoxedTableRowData): PortableRulesetDefinition {
  const hitPolicy = row.children?.find(
    (child) => child.kind === 'ruleset-hit-policy',
  )?.value;
  const rules: PortableRule[] = (row.children ?? [])
    .filter((child) => child.kind === 'rule')
    .map((child) =>
      ruleNode({
        ...(child as BoxedTableRowData),
        conditionColumns: row.conditionColumns,
        actionColumns: row.actionColumns,
      }),
    );
  const fallback = row.children?.find(
    (child) => child.kind === 'ruleset-default',
  ) as BoxedTableRowData | undefined;
  return {
    '@kind': 'ruleset',
    '@parameters': parameters(row.parameters),
    '@hitPolicy': (hitPolicy ??
      'first-match') as PortableRulesetDefinition['@hitPolicy'],
    '@rules': rules,
    ...(fallback
      ? { '@default': recordFromCells(row.actionColumns, fallback.actions) }
      : {}),
  };
}

function optimisationNode(row: BoxedTableRowData): PortableOptimiseDefinition {
  const node: Record<string, unknown> = {
    '@kind': 'optimise',
    '@parameters': parameters(row.parameters),
  };
  for (const child of row.children ?? []) {
    switch (child.kind) {
      case 'optimisation-setting':
        node[`@${child.name}`] =
          child.name === 'bottlenecks'
            ? child.value === 'true'
            : child.name === 'timeLimit'
              ? Number(child.value)
              : (child.value ?? '');
        break;
      case 'optimisation-variable-group':
        node['@variables'] = Object.fromEntries(
          (child.children ?? []).map((variable) => [
            variable.name,
            variable.value ?? '',
          ]),
        );
        break;
      case 'optimisation-objective':
        node[`@${child.name}`] = child.value ?? '';
        break;
      case 'optimisation-constraint-group':
        node['@constraints'] = Object.fromEntries(
          (child.children ?? []).map((constraint) => [
            constraint.name,
            constraint.value ?? '',
          ]),
        );
        break;
    }
  }
  return node as unknown as PortableOptimiseDefinition;
}

export function denormalize(row: BoxedRowData): PortableNode {
  switch (row.kind) {
    case 'model':
    case 'context':
      return contextFromChildren(row.children);
    case 'complexType':
      return typeDefinitionFromChildren(row.children);
    case 'list':
      return (row.children ?? []).map((child) =>
        denormalize(child),
      ) as unknown as PortableNode;
    case 'relation':
      return (row.children ?? []).map((child) => {
        const table = child as BoxedTableRowData;
        return recordFromTableRow(table, (row as BoxedTableRowData).columns);
      }) as unknown as PortableNode;
    case 'relation-item':
      return recordFromTableRow(row as BoxedTableRowData);
    case 'function':
      return functionNode(row as BoxedTableRowData);
    case 'ruleset':
      return rulesetNode(row as BoxedTableRowData);
    case 'optimisation':
      return optimisationNode(row as BoxedTableRowData);
    case 'rule':
      return ruleNode(row as BoxedTableRowData) as unknown as PortableNode;
    case 'ruleset-default':
      return recordFromCells(
        (row as BoxedTableRowData).actionColumns,
        (row as BoxedTableRowData).actions,
      );
    case 'ruleset-hit-policy':
      return row.value ?? '';
    case 'optimisation-setting':
      return row.name === 'bottlenecks'
        ? row.value === 'true'
        : row.name === 'timeLimit'
          ? Number(row.value)
          : (row.value ?? '');
    case 'optimisation-variable':
    case 'optimisation-objective':
    case 'optimisation-constraint':
      return row.value ?? '';
    case 'function-result':
    case 'list-item':
    case 'field':
      return expression(row.value);
    case 'optimisation-variable-group':
    case 'optimisation-constraint-group':
      return contextFromChildren(row.children);
  }
}
