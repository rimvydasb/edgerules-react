import type { ReactElement } from 'react';
import Button from '@mui/material/Button';
import { MetadataAction } from '../actions/MetadataAction';
import { isObject, type FunctionRenderNode } from '../boxed-model';
import {
  useBoxedNodeRenderer,
  useFunctionActions,
} from '../BoxedEditorProvider';
import { functionSignature } from '../boxed-editor-utils';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxHeader } from '../primitives/BoxHeader';
import { BoxTypeChip } from '../primitives/BoxTypeChip';

export function FunctionBox({
  node,
  depth,
}: {
  node: FunctionRenderNode;
  depth: number;
}): ReactElement {
  const functions = useFunctionActions();
  const BoxedNode = useBoxedNodeRenderer();
  const label = isObject(node.authored)
    ? functionSignature(node.authored, node.name)
    : node.name;
  return (
    <BoxFrame
      node={node}
      depth={depth}
      header={<BoxHeader node={node} label={label} />}
      type={<BoxTypeChip schema={node.schema} />}
      actions={
        <>
          <Button
            size="small"
            aria-label={`Edit signature ${node.path}`}
            onClick={() => functions.editSignature(node)}
          >
            Signature
          </Button>
          <MetadataAction node={node} />
        </>
      }
    >
      {node.children?.map((child) => (
        <BoxedNode key={child.id} node={child} depth={depth + 1} />
      ))}
    </BoxFrame>
  );
}
