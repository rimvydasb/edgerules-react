import type {
  PortableContext,
  PortableNode,
  PortableRootContext,
} from '@edgerules/portable';
import type { CodeEditorEmbedContext } from '../code-editor-cell';
import { authoredFields, isObject } from './boxed-model';
import { cellCode } from './cell-code';
import { metadataText } from './boxed-editor-utils';

const MARKER = '__boxed_editor_expression__';

function typeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (isObject(value) && typeof value.type === 'string') return value.type;
  return 'any';
}

function nodeText(
  node: PortableNode,
  path: string,
  activePath: string,
): string {
  if (path === activePath) return MARKER;
  if (Array.isArray(node))
    return `[${node.map((item, index) => nodeText(item, `${path}[${index}]`, activePath)).join(', ')}]`;
  if (!isObject(node)) return cellCode(node);
  const object = node as Record<string, unknown>;
  const kind = object['@kind'];
  if (kind === 'expression' || kind === 'type' || kind === 'invocation')
    return cellCode(node);
  if (kind === 'context' || kind === undefined)
    return contextText(node as PortableContext, path, activePath);
  return cellCode(node);
}

function contextText(
  context: PortableContext,
  path: string,
  activePath: string,
): string {
  const fields = authoredFields(context).map(([name, node]) => {
    const childPath = path === '*' ? name : `${path}.${name}`;
    const object = isObject(node)
      ? (node as unknown as Record<string, unknown>)
      : undefined;
    const annotation = metadataText(node);
    const annotated = (statement: string): string =>
      annotation ? `${annotation} ${statement}` : statement;
    if (object?.['@kind'] === 'function') {
      const functionNode = object;
      const parameters = isObject(functionNode['@parameters'])
        ? Object.entries(functionNode['@parameters'])
            .map(([parameter, type]) => `${parameter}: ${typeText(type)}`)
            .join(', ')
        : '';
      const result = functionNode['@return']
        ? ` -> ${typeText(functionNode['@return'])}`
        : '';
      return annotated(
        `func ${name}(${parameters})${result}: ${nodeText(functionNode['@body'] as PortableNode, `${childPath}.result`, activePath)}`,
      );
    }
    if (object?.['@kind'] === 'external-function') {
      const externalNode = object;
      const parameters = isObject(externalNode['@parameters'])
        ? Object.entries(externalNode['@parameters'])
            .map(([parameter, type]) => `${parameter}: ${typeText(type)}`)
            .join(', ')
        : '';
      return annotated(
        `external func ${name}(${parameters}) -> ${typeText(externalNode['@return'])}`,
      );
    }
    if (object?.['@kind'] === 'type-definition') {
      return `type ${name}: ${contextText(node as unknown as PortableContext, childPath, activePath)}`;
    }
    return annotated(`${name}: ${nodeText(node, childPath, activePath)}`);
  });
  return `{ ${fields.join('; ')} }`;
}

/**
 * Builds the synthetic model around an active expression. The marker is never sent to the
 * language service: it only lets us split the model exactly where the cell draft belongs.
 */
export function expressionEmbedContext(
  root: PortableRootContext,
  activePath: string,
): CodeEditorEmbedContext {
  const model = contextText(root, '*', activePath);
  const markerIndex = model.indexOf(MARKER);
  if (markerIndex === -1) return { prefix: '', suffix: '' };
  return {
    prefix: model.slice(0, markerIndex),
    suffix: model.slice(markerIndex + MARKER.length),
  };
}
