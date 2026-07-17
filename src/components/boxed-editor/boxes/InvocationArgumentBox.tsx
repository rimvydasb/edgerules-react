import type { ReactElement } from 'react';
import type { BoxedRenderNode } from '../boxed-model';
import { useBoxedNodeRenderer } from '../BoxedEditorProvider';

export function InvocationArgumentBox({
  node,
  depth,
}: {
  node: BoxedRenderNode;
  depth: number;
}): ReactElement {
  const BoxedEntityNode = useBoxedNodeRenderer();
  return <BoxedEntityNode node={node} depth={depth} suppressFieldActions />;
}
