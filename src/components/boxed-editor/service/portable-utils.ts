import type { PortableNode, PortableTypedValue } from '@edgerules/portable';

export const METADATA_KEYS = new Set([
  '@kind',
  '@description',
  '@node',
  '@node-name',
  '@model-name',
  '@model-version',
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isMetadataKey(key: string): boolean {
  return key.startsWith('@') || METADATA_KEYS.has(key);
}

export function authoredEntries(value: unknown): Array<[string, PortableNode]> {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter(([key, child]) => !isMetadataKey(key) && child !== undefined)
    .map(([key, child]) => [key, child as PortableNode]);
}

export function childPath(parent: string, name: string): string {
  return parent === '*' ? name : `${parent}.${name}`;
}

export function indexedPath(parent: string, index: number): string {
  return `${parent}[${index}]`;
}

export function pathDepth(path: string): number {
  if (path === '*') return 0;
  return (path.match(/\./g) ?? []).length;
}

export function parentPath(path: string): string | undefined {
  if (path === '*') return undefined;
  if (path.endsWith(']')) {
    const bracket = path.lastIndexOf('[');
    return bracket > -1 ? path.slice(0, bracket) : '*';
  }
  const dot = path.lastIndexOf('.');
  return dot === -1 ? '*' : path.slice(0, dot);
}

export function lastPathName(path: string): string | undefined {
  if (path === '*') return undefined;
  if (path.endsWith(']')) return undefined;
  const dot = path.lastIndexOf('.');
  return path.slice(dot + 1);
}

function tokenizePath(path: string): Array<string | number> {
  if (path === '*' || path === '') return [];
  const tokens: Array<string | number> = [];
  const matcher = /(?:^|\.)([^.[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;
  while ((match = matcher.exec(path)) !== null) {
    tokens.push(match[1] ?? Number(match[2]));
  }
  return tokens;
}

function portableChild(value: unknown, token: string | number): unknown {
  if (typeof token === 'number') {
    return Array.isArray(value) ? value[token] : undefined;
  }
  if (!isRecord(value)) return undefined;

  if (value['@kind'] === 'function' && token !== '*') {
    return portableChild(value['@body'], token);
  }
  if (value['@kind'] === 'ruleset') {
    if (token === 'rules') return value['@rules'];
    if (token === 'default') return value['@default'];
    if (token === 'hitPolicy') return value['@hitPolicy'];
  }
  if (value['@kind'] === 'optimise') {
    const key = `@${token}`;
    if (key in value) return value[key];
  }
  return value[token];
}

export function portableAtPath(
  root: PortableNode,
  path: string,
): PortableNode | undefined {
  let current: unknown = root;
  for (const token of tokenizePath(path)) {
    current = portableChild(current, token);
    if (current === undefined) return undefined;
  }
  return current as PortableNode;
}

function quoteKey(key: string): string {
  return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) ? key : JSON.stringify(key);
}

export function typedValueText(value: PortableTypedValue): string {
  const details: string[] = [];
  const item = value.items;
  const type =
    value.type === 'array'
      ? `${typeof item === 'string' ? item : (item?.type ?? '')}[]`
      : value.type;
  details.push(type);
  for (const [key, child] of Object.entries(value)) {
    if (
      key === '@kind' ||
      key === 'type' ||
      key === 'items' ||
      key === 'readOnly' ||
      key === 'writeOnly' ||
      child === undefined
    ) {
      continue;
    }
    details.push(`${key}: ${formatPortableValue(child)}`);
  }
  return `<${details.join(', ')}>`;
}

export function formatPortableValue(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  if (Array.isArray(value))
    return `[${value.map(formatPortableValue).join(', ')}]`;
  if (!isRecord(value)) return String(value);

  switch (value['@kind']) {
    case 'expression':
      return formatPortableValue(value.expression);
    case 'type':
      return typedValueText(value as unknown as PortableTypedValue);
    case 'invocation': {
      const args = value['@arguments'];
      const argumentText = Array.isArray(args)
        ? args.map(formatPortableValue).join(', ')
        : isRecord(args)
          ? Object.entries(args)
              .map(
                ([name, argument]) =>
                  `${quoteKey(name)}: ${formatPortableValue(argument)}`,
              )
              .join(', ')
          : '';
      return `${String(value['@method'] ?? '')}(${argumentText})`;
    }
    default: {
      const entries = authoredEntries(value)
        .map(
          ([name, child]) => `${quoteKey(name)}: ${formatPortableValue(child)}`,
        )
        .join(', ');
      return `{ ${entries} }`;
    }
  }
}

export function typeText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (!isRecord(value)) return undefined;
  if (value['@kind'] === 'type-definition') return 'object';
  if (typeof value.type !== 'string') return undefined;
  if (value.type !== 'array') return value.type;
  const items = value.items;
  return `${typeof items === 'string' ? items : isRecord(items) ? (items.type ?? '') : ''}[]`;
}
