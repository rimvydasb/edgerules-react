import type { ReactElement } from 'react';
import type { BoxedRenderNode } from './boxed-model';
import type { BoxPresentationProps } from './boxes/box-props';
import { ContextBox } from './boxes/ContextBox';
import { EditorLinkBox } from './boxes/EditorLinkBox';
import { ExpressionBox } from './boxes/ExpressionBox';
import { ExternalFunctionBox } from './boxes/ExternalFunctionBox';
import { FunctionBox } from './boxes/FunctionBox';
import { InputBox } from './boxes/InputBox';
import { InvocationBox } from './boxes/InvocationBox';
import { ListBox } from './boxes/ListBox';
import { RelationBox } from './boxes/RelationBox';

function assertNever(node: never): never {
  throw new Error(`Unsupported boxed node kind: ${String((node as BoxedRenderNode).kind)}`);
}

export function BoxedEntityNode({ node, depth, actions, suppressFieldActions }: { node: BoxedRenderNode } & BoxPresentationProps): ReactElement {
  switch (node.kind) {
    case 'context': return <ContextBox node={node} depth={depth} actions={actions} suppressFieldActions={suppressFieldActions} />;
    case 'expression': return <ExpressionBox node={node} depth={depth} actions={actions} suppressFieldActions={suppressFieldActions} />;
    case 'input': return <InputBox node={node} depth={depth} actions={actions} suppressFieldActions={suppressFieldActions} />;
    case 'list': return <ListBox node={node} depth={depth} />;
    case 'relation': return <RelationBox node={node} depth={depth} />;
    case 'function': return <FunctionBox node={node} depth={depth} />;
    case 'external-function': return <ExternalFunctionBox node={node} depth={depth} />;
    case 'invocation': return <InvocationBox node={node} depth={depth} />;
    case 'editor-link': return <EditorLinkBox node={node} depth={depth} />;
    default: return assertNever(node);
  }
}

export function BoxedNode({ node, depth = 0 }: { node: BoxedRenderNode; depth?: number }): ReactElement {
  return <BoxedEntityNode node={node} depth={depth} />;
}
