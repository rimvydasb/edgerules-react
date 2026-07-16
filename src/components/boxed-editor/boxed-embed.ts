import type { PortableContext, PortableNode, PortableRootContext } from '@edgerules/portable';
import type { CodeEditorEmbedContext } from '../code-editor-cell';
import { authoredFields, isObject } from './boxed-model';

const MARKER = '__boxed_editor_expression__';

function typeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isObject(value) && typeof value.type === 'string') return value.type;
  return 'any';
}

function typedValueText(node: Record<string, unknown>): string {
  const attributes: string[] = [];
  if (node.required === true) attributes.push('required: true');
  if (node.default !== undefined) attributes.push(`default: ${JSON.stringify(node.default)}`);
  if (Array.isArray(node.enum) && node.enum.length) attributes.push(`enum: ${JSON.stringify(node.enum)}`);
  if (node.type === 'array' && node.items !== undefined) attributes.push(`items: ${typeText(node.items)}`);
  return `<${typeText(node)}${attributes.length ? `, ${attributes.join(', ')}` : ''}>`;
}

function expressionText(node: PortableNode): string {
  if (isObject(node)) {
    const object = node as Record<string, unknown>;
    if (object['@kind'] === 'expression') return String(object.expression ?? '');
  }
  if (typeof node === 'string') return node;
  return JSON.stringify(node);
}

function nodeText(node: PortableNode, path: string, activePath: string): string {
  if (path === activePath) return MARKER;
  if (Array.isArray(node)) return `[${node.map((item, index) => nodeText(item, `${path}[${index}]`, activePath)).join(', ')}]`;
  if (!isObject(node)) return expressionText(node);
  const object = node as Record<string, unknown>;
  const kind = object['@kind'];
  if (kind === 'expression') return expressionText(node);
  if (kind === 'type') return typedValueText(node);
  if (kind === 'invocation') {
    const argumentsValue = object['@arguments'];
    const argumentsText = Array.isArray(argumentsValue)
      ? argumentsValue.map(value => nodeText(value as PortableNode, path, activePath)).join(', ')
      : isObject(argumentsValue)
        ? Object.entries(argumentsValue).map(([name, value]) => `${name}: ${nodeText(value as PortableNode, path, activePath)}`).join(', ')
        : '';
    return `${String(object['@method'] ?? '')}(${argumentsText})`;
  }
  if (kind === 'context' || kind === undefined) return contextText(node as PortableContext, path, activePath);
  return expressionText(node);
}

function contextText(context: PortableContext, path: string, activePath: string): string {
  const fields = authoredFields(context).map(([name, node]) => {
    const childPath = path === '*' ? name : `${path}.${name}`;
    const object = isObject(node) ? node as unknown as Record<string, unknown> : undefined;
    if (object?.['@kind'] === 'function') {
      const functionNode = object;
      const parameters = isObject(functionNode['@parameters'])
        ? Object.entries(functionNode['@parameters']).map(([parameter, type]) => `${parameter}: ${typeText(type)}`).join(', ')
        : '';
      const result = functionNode['@return'] ? ` -> ${typeText(functionNode['@return'])}` : '';
      return `func ${name}(${parameters})${result}: ${nodeText(functionNode['@body'] as PortableNode, `${childPath}.result`, activePath)}`;
    }
    if (object?.['@kind'] === 'external-function') {
      const externalNode = object;
      const parameters = isObject(externalNode['@parameters'])
        ? Object.entries(externalNode['@parameters']).map(([parameter, type]) => `${parameter}: ${typeText(type)}`).join(', ')
        : '';
      return `external func ${name}(${parameters}) -> ${typeText(externalNode['@return'])}`;
    }
    if (object?.['@kind'] === 'type-definition') {
      return `type ${name}: ${contextText(node as unknown as PortableContext, childPath, activePath)}`;
    }
    return `${name}: ${nodeText(node, childPath, activePath)}`;
  });
  return `{ ${fields.join('; ')} }`;
}

/**
 * Builds the synthetic model around an active expression. The marker is never sent to the
 * language service: it only lets us split the model exactly where the cell draft belongs.
 */
export function expressionEmbedContext(root: PortableRootContext, activePath: string): CodeEditorEmbedContext {
  const model = contextText(root, '*', activePath);
  const markerIndex = model.indexOf(MARKER);
  if (markerIndex === -1) return { prefix: '', suffix: '' };
  return {
    prefix: model.slice(0, markerIndex),
    suffix: model.slice(markerIndex + MARKER.length),
  };
}
