import type { PortableContext, PortableNode } from '@edgerules/portable';
import type {
  BoxedRowData,
  BoxedRowKind,
  BoxedTableRowData,
  SignatureParameter,
} from '../boxed-editor-types';
import {
  authoredEntries,
  childPath,
  formatPortableValue,
  indexedPath,
  isRecord,
  pathDepth,
  typeText,
} from './portable-utils';

type PortableRecord = Record<string, unknown>;

const GROUP_ORDER: Partial<Record<BoxedRowKind, number>> = {
  complexType: 0,
  function: 1,
  ruleset: 2,
  optimisation: 3,
};

function stableSort(rows: BoxedRowData[]): BoxedRowData[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort(
      (left, right) =>
        (GROUP_ORDER[left.row.kind] ?? 4) -
          (GROUP_ORDER[right.row.kind] ?? 4) ||
        Number(left.row.kind === 'function-result') -
          Number(right.row.kind === 'function-result') ||
        left.index - right.index,
    )
    .map(({ row }) => row);
}

function parametersOf(value: unknown): SignatureParameter[] {
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([name, parameter]) => {
    if (parameter === null) return { name };
    if (typeof parameter === 'string') return { name, type: parameter };
    if (isRecord(parameter)) {
      const parameterType = typeText(parameter);
      return {
        name,
        ...(parameterType ? { type: parameterType } : {}),
        ...(typeof parameter.required === 'boolean'
          ? { required: parameter.required }
          : {}),
      };
    }
    return { name };
  });
}

function columnsOf(records: unknown[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const [name] of authoredEntries(record)) {
      if (!seen.has(name)) {
        seen.add(name);
        columns.push(name);
      }
    }
  }
  return columns;
}

function recordCells(
  record: unknown,
  columns: string[],
  nestedAsEmpty = false,
): string[] {
  const values = new Map(authoredEntries(record));
  return columns.map((column) => {
    const value = values.get(column);
    if (value === undefined) return '';
    if (nestedAsEmpty && (isRecord(value) || Array.isArray(value))) return '';
    return formatPortableValue(value);
  });
}

function actionColumnsOf(rules: unknown[], fallback: unknown): string[] {
  const records = rules
    .filter(isRecord)
    .map((rule) => rule.then)
    .concat(fallback === undefined ? [] : [fallback]);
  return columnsOf(records);
}

function rowBase(kind: BoxedRowKind, path: string, name: string): BoxedRowData {
  return { kind, depth: pathDepth(path), path, name };
}

function normalizeArray(
  name: string,
  path: string,
  values: PortableNode[],
  schema?: PortableNode,
): BoxedTableRowData {
  const relation =
    values.some(
      (value) =>
        isRecord(value) &&
        (value['@kind'] === undefined || value['@kind'] === 'context'),
    ) ||
    (isRecord(schema) &&
      isRecord(schema.items) &&
      schema.items['@kind'] === 'type-definition');
  if (!relation) {
    return {
      ...rowBase('list', path, name),
      children: values.map((value, index) => ({
        ...rowBase('list-item', indexedPath(path, index), `Item ${index + 1}`),
        value: formatPortableValue(value),
      })),
    };
  }
  const columns = columnsOf(values);
  return {
    ...rowBase('relation', path, name),
    columns,
    children: values.map((value, index) => ({
      ...rowBase(
        'relation-item',
        indexedPath(path, index),
        `Item ${index + 1}`,
      ),
      columns,
      cells: recordCells(value, columns, true),
      children: authoredEntries(value)
        .filter(([, child]) => isRecord(child) || Array.isArray(child))
        .map(([childName, child]) =>
          normalizeNode(
            childName,
            childPath(indexedPath(path, index), childName),
            child,
          ),
        ),
    })),
  };
}

function normalizeFunction(
  name: string,
  path: string,
  node: PortableRecord,
): BoxedTableRowData {
  const body = node['@body'];
  const inline = !isRecord(body) || body['@kind'] === 'expression';
  const children = inline
    ? [
        {
          ...rowBase('function-result', childPath(path, 'result'), 'result'),
          value: formatPortableValue(body),
          readOnly: true,
          deletable: false,
        },
      ]
    : normalizeContextChildren(body, path);
  return {
    ...rowBase('function', path, name),
    parameters: parametersOf(node['@parameters']),
    ...(typeText(node['@return']) ? { type: typeText(node['@return']) } : {}),
    children,
  };
}

function normalizeRuleset(
  name: string,
  path: string,
  node: PortableRecord,
): BoxedTableRowData {
  const parameters = parametersOf(node['@parameters']);
  const conditionColumns = parameters.map((parameter) => parameter.name);
  const rules = Array.isArray(node['@rules']) ? node['@rules'] : [];
  const actionColumns = actionColumnsOf(rules, node['@default']);
  const children: BoxedRowData[] = [
    {
      ...rowBase(
        'ruleset-hit-policy',
        childPath(path, 'hitPolicy'),
        'hitPolicy',
      ),
      value: String(node['@hitPolicy'] ?? ''),
      deletable: false,
    },
    ...rules.map((rule, index) => {
      const record = isRecord(rule) ? rule : {};
      const when = record.when;
      const expressionWhen = isRecord(when) && when['@kind'] === 'expression';
      const ruleRow: BoxedTableRowData = {
        ...rowBase(
          'rule',
          indexedPath(childPath(path, 'rules'), index),
          typeof record.name === 'string' ? record.name : `Rule ${index + 1}`,
        ),
        conditionColumns,
        actionColumns,
        ...(expressionWhen
          ? { conditionsExpression: formatPortableValue(when) }
          : {
              conditions: conditionColumns.map((column) =>
                isRecord(when) && column in when
                  ? formatPortableValue(when[column])
                  : '',
              ),
            }),
        actions: recordCells(record.then, actionColumns),
        ...(typeof record.priority === 'number'
          ? { priority: record.priority }
          : {}),
      };
      return ruleRow;
    }),
  ];
  if (node['@default'] !== undefined) {
    children.push({
      ...rowBase('ruleset-default', childPath(path, 'default'), 'default'),
      actionColumns,
      actions: recordCells(node['@default'], actionColumns),
      deletable: false,
    } as BoxedTableRowData);
  }
  return {
    ...rowBase('ruleset', path, name),
    parameters,
    conditionColumns,
    actionColumns,
    children,
  };
}

function normalizeOptimisation(
  name: string,
  path: string,
  node: PortableRecord,
): BoxedTableRowData {
  const variables = isRecord(node['@variables'])
    ? authoredEntries(node['@variables'])
    : [];
  const constraints = isRecord(node['@constraints'])
    ? authoredEntries(node['@constraints'])
    : [];
  const children: BoxedRowData[] = [];
  for (const setting of ['using', 'bottlenecks', 'timeLimit'] as const) {
    const value = node[`@${setting}`];
    if (value !== undefined) {
      children.push({
        ...rowBase('optimisation-setting', childPath(path, setting), setting),
        value: formatPortableValue(value),
      });
    }
  }
  children.push({
    ...rowBase(
      'optimisation-variable-group',
      childPath(path, 'variables'),
      'variables',
    ),
    deletable: false,
    children: variables.map(([variableName, variable]) => ({
      ...rowBase(
        'optimisation-variable',
        childPath(childPath(path, 'variables'), variableName),
        variableName,
      ),
      value: formatPortableValue(variable),
    })),
  });
  const direction = node['@maximise'] !== undefined ? 'maximise' : 'minimise';
  children.push({
    ...rowBase('optimisation-objective', childPath(path, direction), direction),
    value: formatPortableValue(node[`@${direction}`]),
    deletable: false,
  });
  children.push({
    ...rowBase(
      'optimisation-constraint-group',
      childPath(path, 'constraints'),
      'constraints',
    ),
    deletable: false,
    children: constraints.map(([constraintName, constraint]) => ({
      ...rowBase(
        'optimisation-constraint',
        childPath(childPath(path, 'constraints'), constraintName),
        constraintName,
      ),
      value: formatPortableValue(constraint),
    })),
  });
  return {
    ...rowBase('optimisation', path, name),
    parameters: parametersOf(node['@parameters']),
    children,
  };
}

export function normalizeNode(
  name: string,
  path: string,
  node: PortableNode,
  schema?: PortableNode,
): BoxedRowData {
  if (Array.isArray(node)) return normalizeArray(name, path, node, schema);
  if (!isRecord(node)) {
    return {
      ...rowBase('field', path, name),
      value: formatPortableValue(node),
      ...(typeText(schema) ? { type: typeText(schema) } : {}),
      ...(isRecord(schema) && schema.readOnly === true
        ? { readOnly: true }
        : {}),
    };
  }

  const record = node as unknown as PortableRecord;
  switch (record['@kind']) {
    case 'type-definition':
      return {
        ...rowBase('complexType', path, name),
        children: normalizeContextChildren(record, path),
      };
    case 'function':
      return normalizeFunction(name, path, record);
    case 'ruleset':
      return normalizeRuleset(name, path, record);
    case 'optimise':
      return normalizeOptimisation(name, path, record);
    case 'context':
    case undefined:
      return {
        ...rowBase('context', path, name),
        children: normalizeContextChildren(record, path, schema),
      };
    default:
      return {
        ...rowBase('field', path, name),
        value: formatPortableValue(record),
        ...(typeText(schema ?? record)
          ? { type: typeText(schema ?? record) }
          : {}),
        ...(record.readOnly === true ? { readOnly: true } : {}),
      };
  }
}

export function normalizeContextChildren(
  node: unknown,
  path: string,
  schema?: unknown,
): BoxedRowData[] {
  const schemaMap = isRecord(schema) ? schema : {};
  return stableSort(
    authoredEntries(node).map(([name, child]) =>
      normalizeNode(
        name,
        childPath(path, name),
        child,
        schemaMap[name] as PortableNode | undefined,
      ),
    ),
  );
}

export function normalizeRoot(
  root: PortableContext,
  schema?: PortableNode,
): BoxedRowData {
  const name =
    typeof root['@model-name'] === 'string' ? root['@model-name'] : 'Model';
  return {
    ...rowBase('model', '*', name),
    ...(typeof root['@model-version'] === 'string'
      ? { modelVersion: root['@model-version'] }
      : {}),
    children: normalizeContextChildren(root, '*', schema),
  };
}
