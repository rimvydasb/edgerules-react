import type { ReactElement, ReactNode } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { BoxedRenderNode } from '../boxed-model';

export function SortableChildren({
  nodes,
  children,
}: {
  nodes: BoxedRenderNode[];
  children: ReactNode;
}): ReactElement {
  return (
    <SortableContext
      items={nodes.map((node) => node.id)}
      strategy={verticalListSortingStrategy}
    >
      {children}
    </SortableContext>
  );
}
