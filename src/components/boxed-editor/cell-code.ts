import type { PortableNode } from '@edgerules/portable';
import { isObject } from './boxed-model';

function authoredType(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!isObject(value)) return 'string';
  if (value.type === 'array') return `${authoredType(value.items)}[]`;
  return typeof value.type === 'string' ? value.type : 'string';
}

function inputCode(node: Record<string, unknown>): string {
  const attributes: string[] = [];
  if (node.default !== undefined)
    attributes.push(`default: ${JSON.stringify(node.default)}`);
  if (node.required === true) attributes.push('required: true');
  if (Array.isArray(node.enum) && node.enum.length)
    attributes.push(`enum: ${JSON.stringify(node.enum)}`);
  if (typeof node['@description'] === 'string')
    attributes.push(`description: ${JSON.stringify(node['@description'])}`);
  return `<${authoredType(node)}${attributes.length ? `, ${attributes.join(', ')}` : ''}>`;
}

function invocationCode(node: Record<string, unknown>): string {
  const method = String(node['@method'] ?? '');
  const argumentsValue = node['@arguments'];
  const argumentsCode = Array.isArray(argumentsValue)
    ? argumentsValue
        .map((argument) => cellCode(argument as PortableNode))
        .join(', ')
    : isObject(argumentsValue)
      ? Object.entries(argumentsValue)
          .map(
            ([name, argument]) =>
              `${name}: ${cellCode(argument as PortableNode)}`,
          )
          .join(', ')
      : '';
  return `${method}(${argumentsCode})`;
}

/**
 * Maps an authored Portable value to the EdgeRules DSL owned by one editor cell.
 * Portable remains the service/storage model; this text is the cell's editable view.
 */
export function cellCode(node: PortableNode): string {
  if (isObject(node)) {
    const kind = String(node['@kind'] ?? '');
    if (kind === 'expression') return String(node.expression ?? '');
    if (kind === 'type') return inputCode(node);
    if (kind === 'invocation') return invocationCode(node);
  }
  if (typeof node === 'string') return node;
  return JSON.stringify(node);
}
