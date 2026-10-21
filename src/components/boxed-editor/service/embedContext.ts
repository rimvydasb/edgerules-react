import type {PortableNode, PortableRootContext} from '@edgerules/portable';
import type {CodeEditorEmbedContext} from '../../code-editor-cell';
import {authoredEntries, childPath, formatPortableValue, indexedPath, isRecord} from './portable-utils';

const ACTIVE_CELL_MARKER = '__boxed_editor_active_cell__';

function parametersText(parameters: unknown): string {
    if (!isRecord(parameters)) return '';
    return Object.entries(parameters)
        .map(([name, type]) => {
            if (typeof type === 'string') return `${name}: ${type}`;
            if (isRecord(type) && typeof type.type === 'string') return `${name}: ${type.type}`;
            return `${name}: any`;
        })
        .join(', ');
}

function typeDefinitionText(node: Record<string, unknown>, path: string, activePath: string): string {
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

function contextText(node: Record<string, unknown>, path: string, activePath: string): string {
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
export function buildExpressionEmbedContext(root: PortableRootContext, activePath: string): CodeEditorEmbedContext {
    const model = contextText(root as unknown as Record<string, unknown>, '*', activePath);
    const markerIndex = model.indexOf(ACTIVE_CELL_MARKER);
    if (markerIndex === -1) return {prefix: '', suffix: ''};
    return {
        prefix: model.slice(0, markerIndex),
        suffix: model.slice(markerIndex + ACTIVE_CELL_MARKER.length),
    };
}
