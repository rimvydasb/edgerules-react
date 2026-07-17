import type { ReactElement } from 'react';
import { ListItemActions } from '../actions/ListItemActions';
import type { BoxedRenderNode } from '../boxed-model';
import { useBoxedNodeRenderer } from '../BoxedEditorProvider';

export function ListItemBox({ node, depth }: { node: BoxedRenderNode; depth: number }): ReactElement {
  const BoxedEntityNode = useBoxedNodeRenderer();
  return <BoxedEntityNode node={node} depth={depth} suppressFieldActions actions={<ListItemActions node={node} />} />;
}
