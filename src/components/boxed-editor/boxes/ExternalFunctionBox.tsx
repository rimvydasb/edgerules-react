import type { ReactElement } from 'react';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { isObject, type ExternalFunctionRenderNode } from '../boxed-model';
import { useFunctionActions } from '../BoxedEditorProvider';
import { functionSignature } from '../boxed-editor-utils';
import { BoxFrame } from '../primitives/BoxFrame';
import { BoxTypeChip } from '../primitives/BoxTypeChip';

export function ExternalFunctionBox({
  node,
  depth,
}: {
  node: ExternalFunctionRenderNode;
  depth: number;
}): ReactElement {
  const functions = useFunctionActions();
  const signature = isObject(node.authored) ? (
    <Typography component="code" sx={{ fontFamily: 'inherit' }}>
      {functionSignature(node.authored, node.name).replace(
        /^func /,
        'external func ',
      )}
    </Typography>
  ) : null;
  return (
    <BoxFrame
      node={node}
      depth={depth}
      headerSpan
      header={signature}
      type={<BoxTypeChip schema={node.schema} />}
      actions={
        <Button
          size="small"
          aria-label={`Edit signature ${node.path}`}
          onClick={() => functions.editSignature(node)}
        >
          Signature
        </Button>
      }
    />
  );
}
